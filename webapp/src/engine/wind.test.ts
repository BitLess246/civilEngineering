import { describe, it, expect } from 'vitest'
import { computeWind, windKz, cpLeeward, velocityPressure, gcpiMagnitude, wallGCp, computeCladding } from './wind'
import { generateGridModel } from './modelBuilder'
import { modelToFrame3D } from './modelBridge'
import { solveFrame3D, applyF3Combo } from './frame3d'
import type { RectSection } from './model'

const section: RectSection = { id: 'S1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }

describe('NSCP 207B.3 — velocity-pressure exposure coefficient Kz', () => {
  it('matches the printed Table 207B.3-1 values (Note-1 formula)', () => {
    // Exposure C: table gives 0.85 (≤4.5 m), 0.98 (9 m), 1.09 (15 m)
    expect(windKz(4.5, 'C')).toBeCloseTo(0.85, 2)
    expect(windKz(9, 'C')).toBeCloseTo(0.98, 2)
    expect(windKz(15, 'C')).toBeCloseTo(1.09, 2)
    // Exposure B at ≤4.5 m → 0.57; Exposure D at 9 m → 1.16
    expect(windKz(4.5, 'B')).toBeCloseTo(0.57, 2)
    expect(windKz(9, 'D')).toBeCloseTo(1.16, 2)
  })
  it('floors below 4.5 m and caps at the gradient height', () => {
    expect(windKz(2, 'C')).toBe(windKz(4.5, 'C'))
    expect(windKz(1000, 'C')).toBeCloseTo(2.01, 6)     // z ≥ zg → Kz = 2.01
  })
})

describe('NSCP Figure 207B.4-1 — leeward wall Cp(L/B)', () => {
  it('−0.5 (≤1), −0.3 (=2), −0.2 (≥4), linear between', () => {
    expect(cpLeeward(0.5)).toBe(-0.5)
    expect(cpLeeward(1)).toBe(-0.5)
    expect(cpLeeward(2)).toBeCloseTo(-0.3, 9)
    expect(cpLeeward(3)).toBeCloseTo(-0.25, 9)
    expect(cpLeeward(4)).toBeCloseTo(-0.2, 9)
    expect(cpLeeward(8)).toBe(-0.2)
  })
})

describe('NSCP 207B.4 — MWFRS directional wind on a frame', () => {
  const makeModel = () => generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.5, 3], section })
  const params = { V: 50, exposure: 'C' as const, dir: 'x' as const }

  it('qz, pressures and per-level forces follow 207B.3-1 / 207B.4-1', () => {
    const m = makeModel()
    const r = computeWind(m, params)!
    expect(r.h).toBeCloseTo(6.5, 9)
    expect(r.B).toBeCloseTo(5, 9)          // across-wind (z extent)
    expect(r.L).toBeCloseTo(12, 9)         // along-wind (x extent)
    expect(r.LB).toBeCloseTo(12 / 5, 9)
    // qh = 0.613·Kz(h)·Kd·V² /1000, Kzt = 1
    const qhExp = (0.613 * windKz(6.5, 'C') * 0.85 * 50 ** 2) / 1000
    expect(r.qh).toBeCloseTo(qhExp, 9)
    // windward pressure at a level = qz·G·0.8
    const lvl = r.levels[0]
    expect(lvl.pWind).toBeCloseTo(lvl.qz * 0.85 * 0.8, 9)
    expect(lvl.pLee).toBeCloseTo(r.qh * 0.85 * Math.abs(r.CpLee), 9)
    // two elevated levels; tributary heights cover mid-storey-1 upward
    expect(r.levels).toHaveLength(2)
    expect(r.levels[0].tribH).toBeCloseTo(1.75 + 1.5, 9)
    expect(r.levels[1].tribH).toBeCloseTo(1.5, 9)
  })

  it('emits category-W node loads that sum to the base shear', () => {
    const r = computeWind(makeModel(), params)!
    expect(r.loads.every((l) => l.cat === 'W' && l.kind === 'node')).toBe(true)
    const sumLoads = r.loads.reduce((s, l) => s + ((l as { Fx?: number }).Fx ?? 0), 0)
    expect(sumLoads).toBeCloseTo(r.baseShear, 6)
    expect(r.baseShear).toBeGreaterThan(0)
  })

  it('base shear scales with V² and the frame equilibrates the wind loads', () => {
    const m = makeModel()
    const r1 = computeWind(m, { ...params, V: 40 })!
    const r2 = computeWind(m, { ...params, V: 80 })!
    expect(r2.baseShear / r1.baseShear).toBeCloseTo(4, 6)   // (80/40)² = 4

    // apply the W loads and confirm ΣFx reaction balances the base shear
    m.loads = r2.loads
    const br = modelToFrame3D(m)
    const wOnly = applyF3Combo(br.loads, { W: 1 })
    const sol = solveFrame3D(br.nodes, br.members, br.supports, wOnly)!
    const sumRx = sol.reactions.reduce((s, q) => s + q.F[0], 0)
    expect(sumRx).toBeCloseTo(-r2.baseShear, 4)
    // no spurious vertical/transverse reactions from a pure along-wind (X) load
    expect(sol.reactions.reduce((s, q) => s + q.F[2], 0)).toBeCloseTo(0, 4)
  })

  it('Z-direction wind swaps the along/across dimensions', () => {
    const r = computeWind(makeModel(), { ...params, dir: 'z' })!
    expect(r.B).toBeCloseTo(12, 9)   // across-wind now the x extent
    expect(r.L).toBeCloseTo(5, 9)
    expect(r.loads.every((l) => (l as { Fz?: number }).Fz !== undefined)).toBe(true)
  })
})

describe('NSCP 207E.4 — Components & Cladding wall pressures', () => {
  it('GCpi magnitudes per Table 207A.11-1', () => {
    expect(gcpiMagnitude('enclosed')).toBe(0.18)
    expect(gcpiMagnitude('partially')).toBe(0.55)
    expect(gcpiMagnitude('open')).toBe(0)
  })

  it('wall GCp endpoints at A₁ = 0.93 m² and A₂ = 46.5 m² (Fig 207E.4-1)', () => {
    expect(wallGCp(4, 0.93)).toEqual({ pos: 1.0, neg: -1.1 })
    expect(wallGCp(5, 0.93)).toEqual({ pos: 1.0, neg: -1.4 })
    const big4 = wallGCp(4, 46.5), big5 = wallGCp(5, 46.5)
    expect(big4.pos).toBeCloseTo(0.7, 9); expect(big4.neg).toBeCloseTo(-0.8, 9)
    expect(big5.pos).toBeCloseTo(0.7, 9); expect(big5.neg).toBeCloseTo(-0.8, 9)
  })

  it('clamps outside the area band and interpolates log-linearly within', () => {
    // below A₁ and above A₂ are constant
    expect(wallGCp(5, 0.1)).toEqual(wallGCp(5, 0.93))
    expect(wallGCp(5, 500)).toEqual(wallGCp(5, 46.5))
    // log-midpoint A = √(0.93·46.5) ⇒ GCp = mean of the endpoints
    const aMid = Math.sqrt(0.93 * 46.5)
    expect(wallGCp(4, aMid).neg).toBeCloseTo((-1.1 + -0.8) / 2, 9)
    expect(wallGCp(4, aMid).pos).toBeCloseTo((1.0 + 0.7) / 2, 9)
  })

  it('corner zone 5 always carries the larger suction', () => {
    for (const a of [0.93, 5, 20, 46.5])
      expect(wallGCp(5, a).neg).toBeLessThanOrEqual(wallGCp(4, a).neg + 1e-12)
  })

  it('computeCladding: p = qh·[(GCp) − (GCpi)] at the mean roof height', () => {
    const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.5, 3], section })
    const r = computeCladding(m, { V: 50, exposure: 'C', dir: 'x', area: 1.0, enclosure: 'enclosed' })!
    expect(r.h).toBeCloseTo(6.5, 9)
    const qh = velocityPressure(6.5, 50, 'C')
    expect(r.qh).toBeCloseTo(qh, 9)
    expect(r.GCpi).toBe(0.18)
    const g5 = wallGCp(5, 1.0)
    expect(r.zone5.pPos).toBeCloseTo(qh * (g5.pos + 0.18), 9)
    expect(r.zone5.pNeg).toBeCloseTo(qh * (g5.neg - 0.18), 9)
    // suction (negative) is the controlling magnitude on a corner
    expect(r.zone5.pNeg).toBeLessThan(r.zone4.pNeg)
  })

  it('partially enclosed raises the internal-pressure swing; open removes it', () => {
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section })
    const enc = computeCladding(m, { V: 45, exposure: 'B', dir: 'x', area: 2, enclosure: 'enclosed' })!
    const par = computeCladding(m, { V: 45, exposure: 'B', dir: 'x', area: 2, enclosure: 'partially' })!
    expect(par.zone4.pNeg).toBeLessThan(enc.zone4.pNeg)    // bigger suction
    expect(par.zone4.pPos).toBeGreaterThan(enc.zone4.pPos) // bigger inward
  })

  it('returns null for a model with no height', () => {
    const flat = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section })
    flat.nodes = flat.nodes.map((n) => ({ ...n, y: 0 }))
    expect(computeCladding(flat, { V: 50, exposure: 'C', dir: 'x', area: 1, enclosure: 'enclosed' })).toBeNull()
  })
})
