import { describe, it, expect } from 'vitest'
import { computeSeismic, storeyWeights, storeyWeightBreakdown, driftCheck, accidentalTorsionLoads, buildECases, caseResultant, stabilityCheck, storeyLiveLoads } from './seismic'
import { buildSeismicMass } from './modal'
import { generateGridModel, buildGravityLoads } from './modelBuilder'
import { modelToFrame3D } from './modelBridge'
import { solveFrame3D, applyF3Combo } from './frame3d'
import type { DriftRow } from './seismic'
import type { RectSection, StructuralModel } from './model'

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

// ─────────────────────────────────────────────────────────────────────────
// WHERE THE SEISMIC WEIGHT COMES FROM
//
// Itemising W to answer "where did the 98.2 tonnes come from?" found that it
// was short: only slab area dead loads and member self-weight from the
// sections were in it, so a dead load applied as a LINE load on a beam or as a
// NODE load was in the gravity design and in no earthquake force at all. A
// wall's weight is exactly that.
// ─────────────────────────────────────────────────────────────────────────
describe('storeyWeightBreakdown', () => {
  const frame = () => {
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section, slabThickness: 150 })
    m.loads = m.plates.map((p) => ({ kind: 'area' as const, plate: p.id, q: 5, cat: 'D' as const }))
    return m
  }

  it('itemises the level, and the items sum to the level weight', () => {
    const rows = storeyWeightBreakdown(frame())
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(r.w).toBeCloseTo(r.slab + r.selfWeight + r.lineDead + r.pointDead, 9)
      expect(r.slab).toBeGreaterThan(0)
      expect(r.selfWeight).toBeGreaterThan(0)
    }
    // and it is the same total `storeyWeights` gives, which is what W is built from
    const plain = storeyWeights(frame())
    expect(rows.map((r) => r.w.toFixed(6))).toEqual(plain.map((r) => r.w.toFixed(6)))
  })

  it('counts a dead LINE load — a wall on a beam is weight the frame carries', () => {
    const m = frame()
    const beam = m.members.find((x) => x.role === 'beam' || x.role === 'girder')!
    const before = storeyWeights(m).reduce((s, r) => s + r.w, 0)
    m.loads = [...m.loads, { kind: 'member-udl', member: beam.id, w: 8, cat: 'D' }]
    const after = storeyWeightBreakdown(m)
    const total = after.reduce((s, r) => s + r.w, 0)
    const len = (() => {
      const a = m.nodes.find((n) => n.id === beam.i)!, b = m.nodes.find((n) => n.id === beam.j)!
      return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    })()
    expect(total - before).toBeCloseTo(8 * len, 6)
    expect(after.reduce((s, r) => s + r.lineDead, 0)).toBeCloseTo(8 * len, 6)
  })

  it('does NOT count generated self-weight twice', () => {
    // `buildGravityLoads` writes member self-weight as a `sw` line load, and
    // this function computes the same weight from the sections. Counting both
    // would double every member in the building.
    const m = frame()
    const bare = storeyWeights(m).reduce((s, r) => s + r.w, 0)
    m.loads = buildGravityLoads(m, 0, 0)
    const withSW = storeyWeightBreakdown(m)
    expect(withSW.reduce((s, r) => s + r.lineDead, 0)).toBe(0)
    // the slab dead loads changed with the rebuild, so compare self-weight alone
    expect(withSW.reduce((s, r) => s + r.selfWeight, 0))
      .toBeCloseTo(storeyWeightBreakdown(frame()).reduce((s, r) => s + r.selfWeight, 0), 6)
    expect(bare).toBeGreaterThan(0)
  })

  it('counts a dead NODE load by its magnitude, whichever way it points', () => {
    const m = frame()
    const top = m.nodes.filter((n) => n.y > 0)[0]!
    const before = storeyWeights(m).reduce((s, r) => s + r.w, 0)
    m.loads = [...m.loads, { kind: 'node', node: top.id, Fy: -40, cat: 'D' }]
    expect(storeyWeightBreakdown(m).reduce((s, r) => s + r.w, 0) - before).toBeCloseTo(40, 6)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// THE STOREY FORCE REACHES THE NODES BY COLUMN STIFFNESS, NOT IN EQUAL SLICES.
//
// It used to be `F / nodes.length`, which loads a slender corner column
// exactly as hard as a stout interior one. These pin the WIRING — that
// `computeSeismic` actually consults `columnShares` — as opposed to
// `storeyDistribution.test.ts`, which pins the shares themselves.
// ─────────────────────────────────────────────────────────────────────────
describe('storey force → the nodes of its level', () => {
  const base = { cover: 40, barDia: 20, tieDia: 10, fc: 28, fy: 415, material: 'concrete' as const }
  const C = (id: string, b: number, h: number): RectSection => ({ ...base, id, name: id, b, h })
  const P = { Ca: 0.44, Cv: 0.64, I: 1, R: 8.5, Z: 0.4, dir: 'x' as const }
  const uniform = generateGridModel({ baysX: [6, 6], baysZ: [6, 6], storeyH: [3, 3], section: C('S', 400, 400) })
  const fxOf = (m: StructuralModel) => {
    const r = computeSeismic(m, P)!
    const top = Math.max(...m.storeys.map((s) => s.elevation))
    const at = new Set(m.nodes.filter((n) => Math.abs(n.y - top) < 1e-6).map((n) => n.id))
    return r.loads.filter((l) => at.has((l as { node: string }).node)).map((l) => (l as { Fx?: number }).Fx ?? 0)
  }

  it('a uniform grid is still split evenly — a regular building does not move', () => {
    const fs = fxOf(uniform)
    expect(fs).toHaveLength(9)
    for (const f of fs) expect(f).toBeCloseTo(fs[0], 12)
  })

  it('a stiffer frame line draws more of the storey force', () => {
    const nm = new Map(uniform.nodes.map((n) => [n.id, n]))
    const m: StructuralModel = {
      ...uniform,
      sections: [...uniform.sections, C('BIG', 400, 900)],
      members: uniform.members.map((x) => {
        if (x.role !== 'column') return x
        const a = nm.get(x.i)
        return a && Math.abs(a.z) < 1e-6 ? { ...x, section: 'BIG' } : x
      }),
    }
    const fs = fxOf(m)
    // The invariant that matters: sharing it out must not lose any of it. The
    // level's own Fx is what the vertical distribution assigned.
    const r = computeSeismic(m, P)!
    const top = Math.max(...m.storeys.map((x) => x.elevation))
    const levelF = r.storeys.find((x) => Math.abs(x.elevation - top) < 1e-6)!.Fx
    expect(fs.reduce((a, b) => a + b, 0)).toBeCloseTo(levelF, 6)
    // …and it is shared in the columns' own ratio: (900/400)³ = 11.39.
    expect(Math.max(...fs) / Math.min(...fs)).toBeCloseTo((900 / 400) ** 3, 4)
  })
})

describe('inherent torsion — §208.7.2.7 “actual eccentricity”', () => {
  // A 3×3 grid on 6 m bays with the z = 0 frame line stiffened to 400×900.
  // Pushed along X that line is (900/400)³ = 11.39 times as stiff as the other
  // two, so the rigidity centre of the 0/6/12 m plan sits at 1.34 m while the
  // mass — slab and beams, symmetric bar the heavier columns — stays near 5.8.
  const base400: RectSection = { id: 'S', name: 'S', b: 400, h: 400, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
  const big: RectSection = { ...base400, id: 'BIG', name: 'BIG', h: 900 }
  const uniform = generateGridModel({ baysX: [6, 6], baysZ: [6, 6], storeyH: [3, 3], section: base400 })
  const nm = new Map(uniform.nodes.map((n) => [n.id, n]))
  const skew: StructuralModel = {
    ...uniform,
    sections: [...uniform.sections, big],
    members: uniform.members.map((x) =>
      x.role === 'column' && Math.abs(nm.get(x.i)!.z) < 1e-6 ? { ...x, section: big.id } : x),
  }
  const eq = { Ca: 0.44, Cv: 0.64, I: 1.0, R: 8.5, Z: 0.4 }
  const eqs = (m: StructuralModel, dir: 'x' | 'z') => computeSeismic(m, { ...eq, dir })!
  const cases = (m: StructuralModel, o: Parameters<typeof buildECases>[3]) =>
    buildECases(m, eqs(m, 'x').loads, eqs(m, 'z').loads, o)

  it('puts the case resultant on the centre of mass, not the centre of rigidity', () => {
    // Without the correction this case carries the whole F·(CM − CR) as an
    // applied torque — force delivered where the columns are, not where the
    // mass is — and the storey never twists the way the code intends.
    const [c] = cases(skew, { dirs: ['+X'] })
    const r = caseResultant(skew, c.loads)
    expect(r.Fx).toBeCloseTo(eqs(skew, 'x').V, 6)
    expect(Math.abs(r.Mt)).toBeLessThan(1e-6)
  })

  it('the raw stiffness-weighted pattern is what needed correcting', () => {
    // The control for the assertion above: the pattern buildECases starts from
    // really is off-centre, by far more than the ±5% accidental allowance.
    const s = eqs(skew, 'x')
    const raw = caseResultant(skew, s.loads)
    expect(Math.abs(raw.Mt)).toBeGreaterThan(0.3 * 12 * s.V)     // e > 30% of L⊥
  })

  it('leaves the ⟳/⟲ envelope as a clean ±5%·L⊥ about the mass centre', () => {
    // The point of centring: the accidental torsion is now explored in BOTH
    // senses. Applied at the rigidity centre it rode on top of a large
    // one-sided inherent torque, so ⟲ never reached the other side.
    const cw = cases(skew, { dirs: ['+X'], torsion: true })
    expect(cw).toHaveLength(2)
    const [a, b] = cw.map((c) => caseResultant(skew, c.loads))
    const V = eqs(skew, 'x').V
    expect(a.Mt).toBeCloseTo(-0.05 * 12 * V, 6)
    expect(b.Mt).toBeCloseTo(+0.05 * 12 * V, 6)
    expect(Math.sign(a.Mt)).toBe(-Math.sign(b.Mt))
  })

  it('a symmetric plan is untouched — CM and CR coincide', () => {
    // The regression control. No published result for a regular building may
    // move: there is no actual eccentricity to add.
    for (const c of cases(uniform, { dirs: ['+X', '+Z'] })) {
      expect(Math.abs(caseResultant(uniform, c.loads).Mt)).toBeLessThan(1e-6)
    }
    const V = eqs(uniform, 'x').V
    for (const c of cases(uniform, { dirs: ['+X'], torsion: true })) {
      expect(Math.abs(caseResultant(uniform, c.loads).Mt)).toBeCloseTo(0.05 * 12 * V, 6)
    }
  })

  it('does not change the base shear it is redistributing', () => {
    for (const d of ['+X', '-X', '+Z', '-Z']) {
      const [c] = cases(skew, { dirs: [d] })
      const r = caseResultant(skew, c.loads)
      const V = eqs(skew, d.includes('X') ? 'x' : 'z').V
      expect(Math.hypot(r.Fx, r.Fz)).toBeCloseTo(V, 6)
    }
  })
})

describe('stabilityCheck — §208.5.10.2 θ, the missing P-Δ verdict', () => {
  const m = makeModel()                       // 1×1 bay, 2 storeys at 3 m
  // Δs and hs are the inputs the drift check produces; the numbers here are
  // chosen so θ can be checked by hand rather than read back off the engine.
  const drift = (ds: number): DriftRow[] =>
    [{ elevation: 3, hs: 3000, ds, dM: 0, limit: 0, ok: true }]
  const force = [{ elevation: 3, F: 100 }, { elevation: 6, F: 200 }]

  it('θ = Px·Δs / (Vx·hs), by hand', () => {
    const rows = stabilityCheck(m, drift(20), force, { R: 8.5 })!
    expect(rows).toHaveLength(1)
    const r = rows[0]
    // Px is every level's dead + floor live at and above 3 m; Vx = 100 + 200.
    const dead = storeyWeights(m).reduce((s, w) => s + w.w, 0)
    const live = storeyLiveLoads(m).reduce((s, w) => s + w.l, 0)
    expect(r.Px).toBeCloseTo(dead + live, 9)
    expect(r.Vx).toBeCloseTo(300, 9)
    expect(r.theta).toBeCloseTo((r.Px * 20) / (300 * 3000), 12)
  })

  it('flags the storey when θ passes 0.10, and clears it below', () => {
    // Solve for the drift that puts θ exactly on 0.10, then step either side.
    const probe = stabilityCheck(m, drift(20), force, { R: 8.5 })!
    const dsAt10 = (0.10 * probe[0].Vx * 3000) / probe[0].Px
    expect(stabilityCheck(m, drift(dsAt10 * 0.99), force, { R: 8.5 })![0].pDeltaRequired).toBe(false)
    expect(stabilityCheck(m, drift(dsAt10 * 1.01), force, { R: 8.5 })![0].pDeltaRequired).toBe(true)
    // exactly on the threshold is "does not exceed 0.10" — still exempt
    expect(stabilityCheck(m, drift(dsAt10), force, { R: 8.5 })![0].pDeltaRequired).toBe(false)
  })

  it('Zone 3/4 exempts a storey by drift ratio whatever θ comes to', () => {
    // Δs/hs ≤ 0.02/R is a SECOND, independent exemption. Build a storey that is
    // both under that ratio and over θ = 0.10, so the two rules disagree and
    // the exemption has to be the one that decides.
    const R = 2.0                                        // 0.02/R = 1.0%
    const ds = 0.009 * 3000                              // 0.9% — inside the ratio
    const Px = stabilityCheck(m, drift(ds), force, { R })![0].Px
    // θ > 0.10 needs Vx < Px·Δs/(0.10·hs); take half of that.
    const Vx = (Px * ds) / (0.10 * 3000) / 2
    const soft = [{ elevation: 3, F: Vx / 2 }, { elevation: 6, F: Vx / 2 }]
    const hot = stabilityCheck(m, drift(ds), soft, { R, Z: 0.4 })!
    expect(hot[0].theta).toBeGreaterThan(0.10)           // the θ test alone would fail it
    expect(hot[0].driftRatio).toBeLessThanOrEqual(0.02 / R)
    expect(hot[0].exempt).toBe(true)
    expect(hot[0].pDeltaRequired).toBe(false)
    // the SAME storey outside Zone 3/4 has no exemption to stand on
    const cold = stabilityCheck(m, drift(ds), soft, { R })!
    expect(cold[0].exempt).toBe(false)
    expect(cold[0].pDeltaRequired).toBe(true)
  })

  it('omits a storey with no seismic shear rather than calling it unstable', () => {
    // θ = Px·Δs/(Vx·hs) is undefined at Vx = 0 — not zero, and not infinite.
    expect(stabilityCheck(m, drift(20), [{ elevation: 3, F: 0 }], { R: 8.5 })).toBeNull()
  })

  it('refuses a non-physical R instead of publishing a verdict', () => {
    for (const R of [0, -8.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(stabilityCheck(m, drift(20), force, { R })).toBeNull()
    }
  })

  it('Px carries floor live load, which the seismic weight W does not', () => {
    // §208.5.1.1's W is dead; §208.5.10.2's Px is dead AND floor live. Reading
    // Px off storeyWeights alone would understate θ — the unconservative way to
    // be wrong, since a smaller Px is a smaller θ and a check that passes.
    const withL: StructuralModel = {
      ...m,
      loads: [...m.loads, ...m.plates.map((pl) => ({ kind: 'area' as const, plate: pl.id, q: 2.4, cat: 'L' as const }))],
    }
    const live = storeyLiveLoads(withL).reduce((s, w) => s + w.l, 0)
    expect(live).toBeCloseTo(2.4 * 6 * 5 * 2, 6)         // 2.4 kPa over both 6×5 m levels
    expect(storeyLiveLoads(m).reduce((s, w) => s + w.l, 0)).toBe(0)   // control: none to find
    const deadOnly = storeyWeights(withL).reduce((s, w) => s + w.w, 0)
    const rows = stabilityCheck(withL, drift(20), force, { R: 8.5 })!
    expect(rows[0].Px).toBeCloseTo(deadOnly + live, 9)
    expect(rows[0].Px).toBeGreaterThan(deadOnly)
    // and it moves the verdict's input, not just a reported number
    expect(rows[0].theta).toBeGreaterThan(stabilityCheck(m, drift(20), force, { R: 8.5 })![0].theta)
  })
})
