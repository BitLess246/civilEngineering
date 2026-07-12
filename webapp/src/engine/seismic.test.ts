import { describe, it, expect } from 'vitest'
import { computeSeismic, storeyWeights, driftCheck, accidentalTorsionLoads, buildECases } from './seismic'
import { buildSeismicMass } from './modal'
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

describe('§208.5.2.2 Method-B period', () => {
  const m = makeModel()
  const Ta = 0.0731 * Math.pow(6, 0.75)

  it('defaults to Method A when Tb is not supplied', () => {
    const r = computeSeismic(m, params)!
    expect(r.Tmethod).toBe('A')
    expect(r.Ta).toBeCloseTo(Ta, 9)
    expect(r.T).toBeCloseTo(Ta, 9)
  })

  it('uses the analytical period when below the cap', () => {
    const Tb = 1.2 * Ta
    const r = computeSeismic(m, { ...params, Z: 0.4, Tb })!
    expect(r.Tmethod).toBe('B')
    expect(r.T).toBeCloseTo(Tb, 9)
    expect(r.Ta).toBeCloseTo(Ta, 9)                       // Ta still reported
    expect(r.Vraw).toBeCloseTo((params.Cv * params.I * r.W) / (params.R * Tb), 6)
  })

  it('caps at 1.3·Ta in Seismic Zone 4', () => {
    const r = computeSeismic(m, { ...params, Z: 0.4, Tb: 5 * Ta })!
    expect(r.T).toBeCloseTo(1.3 * Ta, 9)
  })

  it('caps at 1.4·Ta outside Zone 4', () => {
    const r = computeSeismic(m, { ...params, Z: 0.2, Tb: 5 * Ta })!
    expect(r.T).toBeCloseTo(1.4 * Ta, 9)
    // no Z supplied at all → also 1.4 (zone unknown ⇒ not Zone 4)
    const r2 = computeSeismic(m, { ...params, Tb: 5 * Ta })!
    expect(r2.T).toBeCloseTo(1.4 * Ta, 9)
  })

  it('longer Method-B period lowers the raw base shear (velocity branch)', () => {
    const tall = generateGridModel({ baysX: [6], baysZ: [5], storeyH: Array(12).fill(3), section })
    tall.loads = tall.plates.map((p) => ({ kind: 'area' as const, plate: p.id, q: 5, cat: 'D' as const }))
    const a = computeSeismic(tall, params)!
    const b = computeSeismic(tall, { ...params, Tb: 1.3 * a.Ta })!
    expect(a.T).toBeGreaterThan(0.7)                      // velocity branch governs
    expect(b.Vraw).toBeLessThan(a.Vraw)
    expect(b.Vraw).toBeCloseTo(a.Vraw / 1.3, 6)
    expect(b.storeys.reduce((s, q) => s + q.Fx, 0)).toBeCloseTo(b.V, 4)
  })
})

describe('§208.7.2.7 accidental torsion', () => {
  const m = makeModel()   // 6 m (X) × 5 m (Z) plan, 2 storeys
  const seis = computeSeismic(m, params)!
  const mass = buildSeismicMass(m)
  const fxOf = (loads: ReturnType<typeof accidentalTorsionLoads>, node: string) =>
    loads.filter((l) => l.kind === 'node' && l.node === node)
      .reduce((s, l) => s + ((l as { Fx?: number }).Fx ?? 0), 0)

  it('per level: ΣΔF = 0 and ΣΔF·d = 0.05·L⊥·F_level (hand statics)', () => {
    const tor = accidentalTorsionLoads(m, seis.loads, 'x', 1)
    expect(tor.length).toBeGreaterThan(0)
    for (const s of seis.storeys) {
      const lvlNodes = m.nodes.filter((n) => Math.abs(n.y - s.elevation) < 1e-6)
      const cs = lvlNodes.map((n) => n.z)
      const Lperp = Math.max(...cs) - Math.min(...cs)   // = 5 m
      expect(Lperp).toBeCloseTo(5, 9)
      let mTot = 0, mC = 0
      for (const n of lvlNodes) { const mm = mass.get(n.id) ?? 0; mTot += mm; mC += mm * n.z }
      const cbar = mC / mTot
      const sumF = lvlNodes.reduce((t, n) => t + fxOf(tor, n.id), 0)
      const torque = lvlNodes.reduce((t, n) => t + fxOf(tor, n.id) * (n.z - cbar), 0)
      expect(sumF).toBeCloseTo(0, 9)                              // self-equilibrating
      expect(torque).toBeCloseTo(0.05 * Lperp * s.Fx, 6)          // exact 5% torque
    }
  })

  it('sign = −1 mirrors the couple exactly', () => {
    const pos = accidentalTorsionLoads(m, seis.loads, 'x', 1)
    const neg = accidentalTorsionLoads(m, seis.loads, 'x', -1)
    expect(neg).toHaveLength(pos.length)
    for (const n of m.nodes) expect(fxOf(neg, n.id)).toBeCloseTo(-fxOf(pos, n.id), 9)
  })

  it("dir 'z' uses the X plan dimension and Fz components", () => {
    // rebuild the base case in z: same magnitudes on Fz
    const baseZ = seis.loads.map((l) => ({ kind: 'node' as const, node: (l as { node: string }).node, Fz: (l as { Fx?: number }).Fx, cat: 'E' as const }))
    const tor = accidentalTorsionLoads(m, baseZ, 'z', 1)
    expect(tor.length).toBeGreaterThan(0)
    expect(tor.every((l) => (l as { Fx?: number }).Fx === undefined)).toBe(true)
    const s0 = seis.storeys[0]
    const lvlNodes = m.nodes.filter((n) => Math.abs(n.y - s0.elevation) < 1e-6)
    let mTot = 0, mC = 0
    for (const n of lvlNodes) { const mm = mass.get(n.id) ?? 0; mTot += mm; mC += mm * n.x }
    const cbar = mC / mTot
    const fz = (id: string) => tor.filter((l) => l.kind === 'node' && l.node === id)
      .reduce((s, l) => s + ((l as { Fz?: number }).Fz ?? 0), 0)
    const torque = lvlNodes.reduce((t, n) => t + fz(n.id) * (n.x - cbar), 0)
    expect(torque).toBeCloseTo(0.05 * 6 * s0.Fx, 6)               // L⊥ = 6 m in X
  })

  it('torque flips with the storey-force sign (−X case)', () => {
    const negBase = seis.loads.map((l) => ({ ...l, Fx: -((l as { Fx?: number }).Fx ?? 0) }))
    const tor = accidentalTorsionLoads(m, negBase as typeof seis.loads, 'x', 1)
    const s0 = seis.storeys[0]
    const lvlNodes = m.nodes.filter((n) => Math.abs(n.y - s0.elevation) < 1e-6)
    let mTot = 0, mC = 0
    const massM = buildSeismicMass(m)
    for (const n of lvlNodes) { const mm = massM.get(n.id) ?? 0; mTot += mm; mC += mm * n.z }
    const cbar = mC / mTot
    const torque = lvlNodes.reduce((t, n) => t + fxOf(tor, n.id) * (n.z - cbar), 0)
    expect(torque).toBeCloseTo(-0.05 * 5 * s0.Fx, 6)
  })

  it('single frame line (no lever) → no loads, no NaN', () => {
    const plane = generateGridModel({ baysX: [6], baysZ: [], storeyH: [3], section })
    // all nodes share z = 0 → denom = 0 for dir 'x'
    const base = plane.nodes.filter((n) => n.y > 0).map((n) => ({ kind: 'node' as const, node: n.id, Fx: 10, cat: 'E' as const }))
    const tor = accidentalTorsionLoads(plane, base, 'x', 1)
    expect(tor).toEqual([])
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

describe('buildECases — §208.8.1 orthogonal 100%+30% composition', () => {
  const m = makeModel()
  const seis = computeSeismic(m, params)!
  const baseX = seis.loads
  const baseZ = seis.loads.map((l) => ({ kind: 'node' as const, node: (l as { node: string }).node, Fz: (l as { Fx?: number }).Fx, cat: 'E' as const }))
  const dirs = ['+X', '-X', '+Z', '-Z']
  const sumOf = (loads: ReturnType<typeof buildECases>[number]['loads'], k: 'Fx' | 'Fz') =>
    loads.reduce((s, l) => s + ((l as unknown as Record<string, number | undefined>)[k] ?? 0), 0)
  const V = baseX.reduce((s, l) => s + ((l as { Fx?: number }).Fx ?? 0), 0)   // total base shear

  it('case counts: dirs × orth30 × torsion', () => {
    expect(buildECases(m, baseX, baseZ, { dirs })).toHaveLength(4)
    expect(buildECases(m, baseX, baseZ, { dirs, torsion: true })).toHaveLength(8)
    expect(buildECases(m, baseX, baseZ, { dirs, orth30: true })).toHaveLength(8)
    expect(buildECases(m, baseX, baseZ, { dirs, orth30: true, torsion: true })).toHaveLength(16)
  })

  it('100%+30%: ΣFx = ±V and ΣFz = ±0.3·V on an X-primary case', () => {
    const cases = buildECases(m, baseX, baseZ, { dirs: ['+X'], orth30: true })
    expect(cases.map((c) => c.name)).toEqual(['E+X+0.3Z', 'E+X−0.3Z'])
    for (const c of cases) {
      expect(sumOf(c.loads, 'Fx')).toBeCloseTo(V, 6)
      expect(Math.abs(sumOf(c.loads, 'Fz'))).toBeCloseTo(0.3 * V, 6)
    }
    expect(sumOf(cases[0].loads, 'Fz')).toBeCloseTo(0.3 * V, 6)
    expect(sumOf(cases[1].loads, 'Fz')).toBeCloseTo(-0.3 * V, 6)
  })

  it('−Z primary: ΣFz = −V, ΣFx = ±0.3·V', () => {
    const cases = buildECases(m, baseX, baseZ, { dirs: ['-Z'], orth30: true })
    for (const c of cases) {
      expect(sumOf(c.loads, 'Fz')).toBeCloseTo(-V, 6)
      expect(Math.abs(sumOf(c.loads, 'Fx'))).toBeCloseTo(0.3 * V, 6)
    }
  })

  it('torsion on a combined case adds nothing to the direction sums (couples are self-equilibrating)', () => {
    const cases = buildECases(m, baseX, baseZ, { dirs: ['+X'], orth30: true, torsion: true })
    expect(cases).toHaveLength(4)
    for (const c of cases) {
      expect(sumOf(c.loads, 'Fx')).toBeCloseTo(V, 6)
      expect(Math.abs(sumOf(c.loads, 'Fz'))).toBeCloseTo(0.3 * V, 6)
      expect(c.name).toMatch(/E\+X[+−]0\.3Z[⟳⟲]/u)
    }
  })

  it('plain single-direction case matches the base loads exactly', () => {
    const [c] = buildECases(m, baseX, baseZ, { dirs: ['+X'] })
    expect(c.name).toBe('E+X')
    expect(c.loads).toHaveLength(baseX.length)
    expect(sumOf(c.loads, 'Fx')).toBeCloseTo(V, 9)
    expect(sumOf(c.loads, 'Fz')).toBe(0)
  })
})
