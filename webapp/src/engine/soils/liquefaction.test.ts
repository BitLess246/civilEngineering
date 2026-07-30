import { describe, it, expect } from 'vitest'
import {
  stressReduction, cyclicStressRatio, finesCorrection, crr75, magnitudeScalingFactor,
  overburdenFactor, liquefactionCheck, liquefactionProfile, liquefactionPotentialIndex,
  DENSE_LIMIT,
} from './liquefaction'
import type { Borehole } from './model'
import type { LayerUnitWeight } from './sptProfile'

// ─────────────────────────────────────────────────────────────────────────
// Worked example, hand-checked line by line (Youd et al. 2001 procedure):
//
//   0–1.5 m  sand, γ = 18 kN/m³      water table at 1.5 m
//   1.5 m+   sand, γsat = 20 kN/m³
//   test at 6.0 m, a_max = 0.40 g, M 7.5
//
//   σv0  = 1.5(18) + 4.5(20)          = 117.0 kPa
//   u    = 4.5(9.81)                  =  44.145 kPa
//   σ′v0 = 117 − 44.145               =  72.855 kPa
//   rd   = 1 − 0.00765(6)             =   0.9541
//   CSR  = 0.65(0.40)(117/72.855)(0.9541) = 0.3984
// ─────────────────────────────────────────────────────────────────────────
const SV = 117.0
const SVE = 72.855

describe('stress reduction coefficient', () => {
  it('is 1.0 at the surface and falls with depth', () => {
    expect(stressReduction(0)).toBeCloseTo(1.0, 10)
    expect(stressReduction(6)).toBeCloseTo(0.9541, 4)
  })

  it('steps only slightly at each branch of the published fit', () => {
    // Youd et al. eq. 3 is four straight lines and they do NOT meet exactly —
    // 0.9300 vs 0.9297 at 9.15 m, 0.504 vs 0.500 at 30 m. Smoothing the joints
    // would depart from the published equation, so the fit is reproduced as
    // printed and the step is bounded instead: anything larger than this means
    // a transposed coefficient, not a rounding artefact.
    for (const z of [9.15, 23, 30]) {
      const step = Math.abs(stressReduction(z - 1e-6) - stressReduction(z + 1e-6))
      expect(step, `at ${z} m`).toBeLessThan(0.005)
    }
  })

  it('floors at 0.5 below 30 m', () => {
    expect(stressReduction(45)).toBe(0.5)
  })

  it('refuses a negative depth', () => {
    expect(() => stressReduction(-1)).toThrow(/must not be negative/)
  })
})

describe('cyclic stress ratio — the demand', () => {
  it('matches the hand calculation', () => {
    expect(cyclicStressRatio(0.40, SV, SVE, 6)).toBeCloseTo(0.3984, 4)
  })

  it('scales linearly with a_max, which is the whole seismic input', () => {
    const a = cyclicStressRatio(0.20, SV, SVE, 6)
    const b = cyclicStressRatio(0.40, SV, SVE, 6)
    expect(b / a).toBeCloseTo(2, 10)
  })

  it('refuses a zero effective stress rather than returning Infinity', () => {
    expect(() => cyclicStressRatio(0.4, 100, 0, 6)).toThrow(/greater than zero/)
  })
})

describe('clean-sand resistance curve', () => {
  it('reproduces the published base curve', () => {
    // The NCEER clean-sand curve passes through CRR ≈ 0.11 at (N₁)₆₀ = 10 and
    // ≈ 0.22 at 20 — the two points every published figure can be read at.
    expect(crr75(10)!).toBeCloseTo(0.113, 3)
    expect(crr75(20)!).toBeCloseTo(0.215, 3)
  })

  it('rises monotonically with blow count', () => {
    for (let n = 1; n < DENSE_LIMIT - 1; n++) {
      expect(crr75(n + 1)!).toBeGreaterThan(crr75(n)!)
    }
  })

  it('STOPS at the end of the curve instead of extrapolating', () => {
    // 1/(34 − N) turns negative above 34: the expression keeps returning a
    // number long after it stops meaning anything.
    expect(crr75(DENSE_LIMIT)).toBeUndefined()
    expect(crr75(40)).toBeUndefined()
  })
})

describe('fines correction', () => {
  it('leaves a clean sand alone', () => {
    const { alpha, beta, n160cs } = finesCorrection(12, 3)
    expect(alpha).toBe(0)
    expect(beta).toBe(1)
    expect(n160cs).toBe(12)
  })

  it('raises the equivalent clean-sand count for a silty sand', () => {
    // FC 15%: α = exp(1.76 − 190/15²) = 2.498, β = 0.99 + 15^1.5/1000 = 1.048
    const { alpha, beta, n160cs } = finesCorrection(10, 15)
    expect(alpha).toBeCloseTo(2.498, 3)
    expect(beta).toBeCloseTo(1.048, 3)
    expect(n160cs).toBeCloseTo(12.979, 3)
  })

  it('saturates at 35% fines', () => {
    expect(finesCorrection(10, 35)).toEqual({ alpha: 5.0, beta: 1.2, n160cs: 17.0 })
    expect(finesCorrection(10, 80).n160cs).toBe(17.0)
  })

  it('steps only slightly where the branches meet', () => {
    // As with r_d, Youd et al.'s α and β branches do not join exactly: 10.000
    // vs 10.015 at FC 5%, 17.00 vs 16.95 at 35%. Reproduced as published.
    for (const fc of [5, 35]) {
      const step = Math.abs(finesCorrection(10, fc - 1e-6).n160cs - finesCorrection(10, fc + 1e-6).n160cs)
      expect(step, `at FC ${fc}%`).toBeLessThan(0.06)
    }
  })
})

describe('magnitude scaling', () => {
  it('is 1.0 at M 7.5, which is what the base curve is FOR', () => {
    expect(magnitudeScalingFactor(7.5)).toBeCloseTo(1.0, 3)
  })

  it('credits a smaller event with more resistance', () => {
    expect(magnitudeScalingFactor(6.0)).toBeGreaterThan(1.5)
    expect(magnitudeScalingFactor(8.0)).toBeLessThan(1)
  })
})

describe('overburden factor', () => {
  it('is CAPPED at 1.0 above the water table depth range', () => {
    // Youd et al.: K_σ must not exceed 1. Uncapped, 72.9 kPa would return 1.10
    // and credit a shallow sand with resistance the case histories do not show.
    expect(overburdenFactor(72.855)).toBe(1)
    expect(overburdenFactor(10)).toBe(1)
  })

  it('reduces resistance at depth', () => {
    expect(overburdenFactor(200)).toBeCloseTo(0.812, 3)
    expect(overburdenFactor(400)).toBeLessThan(overburdenFactor(200))
  })

  it('penalises a DENSE sand more at depth, which is the way round the reference has it', () => {
    // Counter-intuitive and worth pinning: f falls from 0.8 at Dr 40% to 0.6 at
    // Dr 80% (Youd et al. §K_σ), so the exponent f−1 gets more negative and the
    // denser soil loses MORE normalised resistance as confining stress rises.
    // I guessed this backwards first; the assertion is here so the next reader
    // does not "fix" it into the intuitive direction.
    expect(overburdenFactor(200, 80)).toBeLessThan(overburdenFactor(200, 40))
    expect(overburdenFactor(200, 80)).toBeCloseTo(0.758, 3)
    expect(overburdenFactor(200, 40)).toBeCloseTo(0.871, 3)
  })
})

describe('a triggering check end to end', () => {
  const base = {
    depth: 6, totalStress: SV, effectiveStress: SVE,
    amax: 0.40, magnitude: 7.5,
  }

  it('reproduces the hand calculation', () => {
    const r = liquefactionCheck({ ...base, n160: 12, finesContent: 15 })
    expect(r.csr).toBeCloseTo(0.3984, 4)
    expect(r.n160cs).toBeCloseTo(15.075, 3)
    expect(r.crr75!).toBeCloseTo(0.1608, 4)
    expect(r.ksigma).toBe(1)
    expect(r.factorOfSafety!).toBeCloseTo(0.404, 3)
    expect(r.liquefiable).toBe(true)
  })

  it('a dense sand does not liquefy, and reports NO factor of safety', () => {
    // Not FS = 99. The curve ends; inventing a number past its end is the
    // failure mode this guards.
    const r = liquefactionCheck({ ...base, n160: 35, finesContent: 5 })
    expect(r.liquefiable).toBe(false)
    expect(r.factorOfSafety).toBeUndefined()
    expect(r.crr75).toBeUndefined()
    expect(r.notes.join(' ')).toMatch(/limit of the METHOD/)
  })

  it('SAYS SO when it had to assume clean sand', () => {
    const r = liquefactionCheck({ ...base, n160: 12 })
    expect(r.notes.join(' ')).toMatch(/treated as CLEAN SAND/)
    // And the assumption is unconservative, which is why it must be stated.
    const withFines = liquefactionCheck({ ...base, n160: 12, finesContent: 15 })
    expect(withFines.factorOfSafety!).toBeGreaterThan(r.factorOfSafety!)
  })

  it('carries the refusal caveat through to the factor of safety', () => {
    const r = liquefactionCheck({ ...base, n160: 12, finesContent: 15, refusal: true })
    expect(r.notes.join(' ')).toMatch(/LOWER BOUND/)
  })

  it('flags a depth and a magnitude outside the calibration', () => {
    expect(liquefactionCheck({ ...base, depth: 28, n160: 12 }).notes.join(' '))
      .toMatch(/outside the depth range/)
    expect(liquefactionCheck({ ...base, magnitude: 9.2, n160: 12 }).notes.join(' '))
      .toMatch(/extrapolated at M 9\.2/)
  })

  it('warns that K_α is a specialist’s judgement', () => {
    const r = liquefactionCheck({ ...base, n160: 12, finesContent: 15, ka: 0.8 })
    expect(r.notes.join(' ')).toMatch(/only by specialists/)
    expect(r.factorOfSafety!).toBeLessThan(
      liquefactionCheck({ ...base, n160: 12, finesContent: 15 }).factorOfSafety!,
    )
  })
})

// ── The whole hole ────────────────────────────────────────────────────────

const UW: Record<string, LayerUnitWeight> = {
  l1: { gamma: 18, gammaSat: 20 },
  l2: { gamma: 18, gammaSat: 20 },
  l3: { gamma: 17, gammaSat: 19 },
}

function hole(over: Partial<Borehole> = {}): Borehole {
  return {
    id: 'bh', name: 'BH-01', kind: 'borehole', actualDepth: 15, diameter: 100,
    groundwaterDepth: 1.5,
    layers: [
      { id: 'l1', depthTop: 0, depthBottom: 3, name: 'Silty Sand', symbol: 'SM' },
      { id: 'l2', depthTop: 3, depthBottom: 9, name: 'Poorly Graded Sand', symbol: 'SP' },
      { id: 'l3', depthTop: 9, depthBottom: 15, name: 'Lean Clay', symbol: 'CL' },
    ],
    samples: [],
    spt: [
      { id: 'n1', depth: 1.0, blows: [2, 3, 3], penetration: [150, 150, 150], hammer: 'safety', rodLength: 3 },
      { id: 'n2', depth: 4.5, blows: [2, 3, 3], penetration: [150, 150, 150], hammer: 'safety', rodLength: 6 },
      { id: 'n3', depth: 6.0, blows: [3, 4, 4], penetration: [150, 150, 150], hammer: 'safety', rodLength: 7.5 },
      { id: 'n4', depth: 12.0, blows: [5, 8, 9], penetration: [150, 150, 150], hammer: 'safety', rodLength: 13.5 },
    ],
    ...over,
  }
}

describe('a whole hole', () => {
  const p = liquefactionProfile(hole(), UW, { amax: 0.4, magnitude: 7.5 })

  it('skips the test above the water table rather than passing it', () => {
    const shallow = p.rows.find((r) => r.testId === 'n1')!
    expect(shallow.skipped).toBe('above-water-table')
    expect(shallow.result).toBeUndefined()
  })

  it('does NOT apply the method to clay', () => {
    // A sand method applied to a clay returns a number, and the number is wrong.
    const clay = p.rows.find((r) => r.testId === 'n4')!
    expect(clay.skipped).toBe('cohesive')
    expect(p.notes.join(' ')).toMatch(/cohesive soil/)
  })

  it('evaluates the saturated sand', () => {
    const sand = p.rows.filter((r) => r.result)
    expect(sand.map((r) => r.testId)).toEqual(['n2', 'n3'])
    expect(sand.every((r) => r.result!.factorOfSafety! < 1)).toBe(true)
  })

  it('reports liquefiable ground as depth BANDS, not as test points', () => {
    expect(p.liquefiableDepths).toEqual([{ top: 4.5, bottom: 6.0 }])
  })

  it('gives an LPI in the very-high band for loose saturated sand at 0.4 g', () => {
    expect(p.lpi).toBeGreaterThan(15)
    expect(p.lpiCategory).toBe('very-high')
  })

  it('evaluates NOTHING without a water table, and says why', () => {
    const dry = liquefactionProfile(hole({ groundwaterDepth: undefined }), UW, { amax: 0.4, magnitude: 7.5 })
    expect(dry.rows.every((r) => r.result === undefined)).toBe(true)
    expect(dry.lpi).toBe(0)
    expect(dry.notes.join(' ')).toMatch(/NOTHING is evaluated/)
  })

  it('skips tests below a layer with no unit weight instead of guessing one', () => {
    const partial = liquefactionProfile(hole(), { l1: UW.l1 }, { amax: 0.4, magnitude: 7.5 })
    expect(partial.rows.find((r) => r.testId === 'n3')!.skipped).toBe('no-stress')
  })

  it('uses the fines content of the layer a test falls in', () => {
    const clean = liquefactionProfile(hole(), UW, { amax: 0.4, magnitude: 7.5 })
    const silty = liquefactionProfile(hole(), UW, { amax: 0.4, magnitude: 7.5, finesContent: { l2: 25 } })
    const a = clean.rows.find((r) => r.testId === 'n3')!.result!
    const b = silty.rows.find((r) => r.testId === 'n3')!.result!
    expect(b.n160cs).toBeGreaterThan(a.n160cs)
    expect(b.factorOfSafety!).toBeGreaterThan(a.factorOfSafety!)
  })

  it('is clear about an empty profile rather than reading as clear ground', () => {
    const none = liquefactionProfile(hole({ spt: [] }), UW, { amax: 0.4, magnitude: 7.5 })
    expect(none.notes.join(' ')).toMatch(/empty rather than clear/)
    expect(none.lpiCategory).toBe('none')
  })
})

describe('liquefaction potential index', () => {
  it('is zero when nothing triggers', () => {
    expect(liquefactionPotentialIndex([
      { depth: 3, factorOfSafety: 1.4 },
      { depth: 6, factorOfSafety: 2.0 },
    ])).toBe(0)
  })

  it('weights a SHALLOW layer more heavily than a deep one', () => {
    // w(z) = 10 − 0.5z: the same severity at 2 m matters more than at 18 m,
    // which is the entire point of the index.
    const shallow = liquefactionPotentialIndex([{ depth: 2, factorOfSafety: 0.5 }])
    const deep = liquefactionPotentialIndex([{ depth: 18, factorOfSafety: 0.5 }])
    expect(shallow).toBeGreaterThan(deep)
  })

  it('ignores results below 20 m, where the index is not defined', () => {
    expect(liquefactionPotentialIndex([{ depth: 25, factorOfSafety: 0.3 }])).toBe(0)
  })

  it('ignores depths with no factor of safety rather than treating them as safe', () => {
    expect(liquefactionPotentialIndex([{ depth: 5 }, { depth: 8 }])).toBe(0)
  })
})
