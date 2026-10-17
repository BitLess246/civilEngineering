// The unfactored load basis — the loads as entered, one service-level case —
// against hand calculations.
import { describe, it, expect } from 'vitest'
import { analyzeBeam, solveFEM, NSCP_COMBOS, UNFACTORED_COMBO, type BeamLoad, type Support } from './beamAnalysis'
import { deriveBeam } from './beamDerivation'

const E = 25000, I = 3.125e9
const EI = E * I * 1e-9                  // kN·m²
const L = 6
const simple: Support[] = [{ type: 'pin', x: 0 }, { type: 'roller', x: L }]
const loads: BeamLoad[] = [
  { type: 'udl', x1: 0, x2: L, w: 8, cat: 'D' },
  { type: 'udl', x1: 0, x2: L, w: 5, cat: 'L' },
]

describe('unfactored: one case, every load at 1.0', () => {
  const res = analyzeBeam(simple, loads, L, E, I, undefined, 'unfactored')!
  const run = res.perCombo[0]

  it('runs exactly one case, named for what it is', () => {
    expect(res.perCombo).toHaveLength(1)
    expect(run.combo).toBe(UNFACTORED_COMBO)
    expect(res.govIdx).toBe(0)
  })

  it('M = (D + L)·L²/8 = 13 × 36 / 8 = 58.5 kN·m; R = 39 kN each; δ = 5wL⁴/384EI', () => {
    expect(run.result!.Mmax).toBeCloseTo(58.5, 6)
    for (const r of run.result!.reactions) expect(r.Rv).toBeCloseTo(39, 6)
    expect(run.result!.Dmax).toBeCloseTo(((5 * 13 * L ** 4) / (384 * EI)) * 1000, 3)
  })

  it('every category, wind and seismic included, at its entered value', () => {
    const all: BeamLoad[] = (['D', 'L', 'Lr', 'S', 'R', 'W', 'E'] as const).map((cat) => ({ type: 'point', x: L / 2, P: 10, cat }))
    const r = analyzeBeam(simple, all, L, E, I, undefined, 'unfactored')!.perCombo[0].result!
    expect(r.Mmax).toBeCloseTo((70 * L) / 4, 6)
  })

  it('a settlement is taken at 1.0 as well', () => {
    const s3: Support[] = [{ type: 'pin', x: 0 }, { type: 'roller', x: L, settlement: 10 }, { type: 'roller', x: 2 * L }]
    const r = analyzeBeam(s3, [], 2 * L, E, I, undefined, 'unfactored')!.perCombo[0]
    expect(r.settleFactor).toBe(1)
    expect(r.result!.Mmax).toBeCloseTo(solveFEM(s3, [], 2 * L, E, I, undefined, 1)!.Mmax, 9)
  })

  it('the hand derivation works the unfactored case', () => {
    const dv = deriveBeam(simple, run.factored, L, E, I, undefined, run.combo.name, run.result!.reactions, run.settleFactor)
    expect(dv.method).toBe('statics')
    dv.reactions.forEach((q) => expect(q.Rv).toBeCloseTo(39, 9))
    expect(dv.Mpeak.M).toBeCloseTo(58.5, 6)
  })
})

describe('factored is still the default', () => {
  it('runs every NSCP combination, and 1.2D + 1.6L governs at 1.2·8 + 1.6·5 = 17.6 kN/m', () => {
    const res = analyzeBeam(simple, loads, L, E, I)!
    expect(res.perCombo).toHaveLength(NSCP_COMBOS.length)
    expect(res.perCombo[res.govIdx].result!.Mmax).toBeCloseTo((17.6 * L ** 2) / 8, 6)
  })
})
