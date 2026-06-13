import { describe, it, expect } from 'vitest'
import { computeSeismic, storeyWeights, driftCheck } from './seismic'
import { generateGridModel } from './modelBuilder'
import { modelToFrame3D } from './modelBridge'
import { solveFrame3D, applyF3Combo } from './frame3d'
import type { RectSection } from './model'

const section: RectSection = { id: 'S1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }

function makeModel() {
  const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3, 3], section })
  m.loads = m.plates.map((p) => ({ kind: 'area' as const, plate: p.id, q: 5, cat: 'D' as const }))
  return m
}
// Zone 4 / soil SD-ish parameters
const params = { Ca: 0.44, Cv: 0.64, I: 1.0, R: 8.5, dir: 'x' as const }

describe('storey weights', () => {
  it('slab dead + beams at level + half columns above/below', () => {
    const m = makeModel()
    const ws = storeyWeights(m)
    expect(ws.map((s) => s.elevation)).toEqual([3, 6])
    const aSec = 0.3 * 0.5
    const beams = (2 * 6 + 2 * 5) * aSec * 24          // 22 m per level
    const colHalf = 4 * 3 * aSec * 24 / 2              // 4 columns × 3 m, half
    // level 1: slab + beams + half cols below + half cols above
    expect(ws[0].w).toBeCloseTo(5 * 30 + beams + 2 * colHalf, 6)
    // roof: slab + beams + half cols below only
    expect(ws[1].w).toBeCloseTo(5 * 30 + beams + colHalf, 6)
  })
})

describe('NSCP 208 static lateral force', () => {
  const m = makeModel()
  const r = computeSeismic(m, params)!

  it('period and base shear with the 2.5CaIW/R cap', () => {
    expect(r.hn).toBe(6)
    expect(r.T).toBeCloseTo(0.0731 * Math.pow(6, 0.75), 9)
    expect(r.Vraw).toBeCloseTo((0.64 * r.W) / (8.5 * r.T), 6)
    expect(r.Vmax).toBeCloseTo((2.5 * 0.44 * r.W) / 8.5, 6)
    // short building → raw exceeds the cap → V = Vmax
    expect(r.Vraw).toBeGreaterThan(r.Vmax)
    expect(r.V).toBeCloseTo(r.Vmax, 9)
  })

  it('Ft = 0 for T ≤ 0.7 s and ΣFx = V', () => {
    expect(r.T).toBeLessThan(0.7)
    expect(r.Ft).toBe(0)
    const sum = r.storeys.reduce((s, q) => s + q.Fx, 0)
    expect(sum).toBeCloseTo(r.V, 6)
    // distribution ∝ w·h → roof share > lower level share only if w·h larger
    const f1 = r.storeys[0], f2 = r.storeys[1]
    expect(f2.Fx / f1.Fx).toBeCloseTo((f2.wx * 6) / (f1.wx * 3), 6)
  })

  it('node loads carry category E and split per level node count', () => {
    expect(r.loads.every((l) => l.cat === 'E' && l.kind === 'node')).toBe(true)
    const lvl1 = r.loads.filter((l) => l.kind === 'node' && m.nodes.find((n) => n.id === l.node)!.y === 3)
    expect(lvl1).toHaveLength(4)
    const sum1 = lvl1.reduce((s, l) => s + ((l as { Fx?: number }).Fx ?? 0), 0)
    expect(sum1).toBeCloseTo(r.storeys[0].Fx, 6)
  })

  it('tall-building branch: Ft = 0.07TV when T > 0.7 s', () => {
    const tall = generateGridModel({ baysX: [6], baysZ: [5], storeyH: Array(12).fill(3), section })
    tall.loads = tall.plates.map((p) => ({ kind: 'area' as const, plate: p.id, q: 5, cat: 'D' as const }))
    const rt = computeSeismic(tall, params)!
    expect(rt.T).toBeGreaterThan(0.7)
    expect(rt.Ft).toBeCloseTo(Math.min(0.07 * rt.T * rt.V, 0.25 * rt.V), 9)
    expect(rt.storeys.reduce((s, q) => s + q.Fx, 0)).toBeCloseTo(rt.V, 4)
  })
})

describe('NSCP 208-11 — Seismic Zone 4 base shear floor', () => {
  it('0.8·Z·Nv·I·W/R governs a long-period building near a fault', () => {
    const tall = generateGridModel({ baysX: [6], baysZ: [5], storeyH: Array(12).fill(3), section })
    tall.loads = tall.plates.map((p) => ({ kind: 'area' as const, plate: p.id, q: 5, cat: 'D' as const }))
    const base = computeSeismic(tall, params)!                       // no Z → floor disabled
    const z4 = computeSeismic(tall, { ...params, Z: 0.4, Nv: 2.0 })! // near-source Zone 4
    const expected = (0.8 * 0.4 * 2.0 * params.I * z4.W) / params.R
    expect(z4.Vsrc).toBeCloseTo(expected, 6)
    expect(z4.Vsrc).toBeGreaterThan(z4.Vmin)
    expect(z4.Vsrc).toBeGreaterThan(z4.Vraw)                          // raw shear below the floor
    expect(z4.V).toBeCloseTo(z4.Vsrc, 6)                              // 208-11 governs
    expect(base.Vsrc).toBe(0)                                         // disabled without Z
    expect(z4.V).toBeGreaterThan(base.V)                              // floor raised the design shear
  })

  it('floor is inactive outside Zone 4 (Z < 0.4)', () => {
    const r = computeSeismic(makeModel(), { ...params, Z: 0.2, Nv: 1.5 })!
    expect(r.Vsrc).toBe(0)
  })
})

describe('drift check', () => {
  it('ΔM = 0.7RΔs against the elastic frame solution', () => {
    const m = makeModel()
    const seis = computeSeismic(m, params)!
    m.loads = [...m.loads, ...seis.loads]
    const br = modelToFrame3D(m)
    const eOnly = applyF3Combo(br.loads, { E: 1 })
    const sol = solveFrame3D(br.nodes, br.members, br.supports, eOnly)!
    const rows = driftCheck(m, br.nodes, sol.d, params.R, seis.T, 'x')
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.ds).toBeGreaterThan(0)
      expect(row.dM).toBeCloseTo(0.7 * params.R * row.ds, 9)
      expect(row.limit).toBeCloseTo(0.025 * row.hs, 9)   // T < 0.7 s
      expect(row.ok).toBe(row.dM <= row.limit + 1e-9)
    }
  })
})
