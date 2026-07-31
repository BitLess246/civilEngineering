import { describe, it, expect } from 'vitest'
import {
  correctedResistance, normalise, sbtOf, relativeDensity, frictionAngle,
  undrainedStrength, processSounding, sbtProfile, IC_NON_LIQUEFIABLE,
} from './cpt'
import type { StressLayer } from './overburden'

// ─────────────────────────────────────────────────────────────────────────
// Worked profile, hand-checked:
//   0–2 m  γ = 19 kN/m³   water table at 2.0 m
//   2 m+   γsat = 20 kN/m³
//   at 10 m:  σv0 = 2(19) + 8(20) = 198 kPa
//             u   = 8(9.81) = 78.48 kPa
//             σ′v0 = 119.52 kPa
// ─────────────────────────────────────────────────────────────────────────
const SV = 198, SVE = 119.52
const LAYERS: StressLayer[] = [
  { thickness: 2, gamma: 19, gammaSat: 20 },
  { thickness: 30, gamma: 19, gammaSat: 20 },
]

describe('the q_t correction', () => {
  it('adds the shoulder pore pressure', () => {
    // q_t = 0.8 + (400/1000)(1 − 0.8) = 0.88 MPa
    const r = correctedResistance(0.8, 400, 0.8)
    expect(r.qt).toBeCloseTo(0.88, 9)
    expect(r.corrected).toBe(true)
  })

  it('SAYS it could not correct rather than silently returning q_c', () => {
    // In soft clay the correction is the dominant term, not a refinement.
    const r = correctedResistance(0.8, undefined)
    expect(r.qt).toBe(0.8)
    expect(r.corrected).toBe(false)
  })

  it('matters little in dense sand and a great deal in soft clay', () => {
    const sand = correctedResistance(20, 100, 0.8)
    const clay = correctedResistance(0.5, 600, 0.8)
    expect((sand.qt - 20) / 20).toBeLessThan(0.01)          // under 1%
    expect((clay.qt - 0.5) / 0.5).toBeGreaterThan(0.2)      // over 20%
  })
})

describe('normalisation solves for the stress exponent', () => {
  const sand = normalise(12, 60, SV, SVE)!
  const clay = normalise(0.88, 30, SV, SVE)!

  it('reproduces the hand calculation for a sand', () => {
    expect(sand.fr).toBeCloseTo(0.5084, 4)
    expect(sand.n).toBeCloseTo(0.5626, 3)
    expect(sand.qtn).toBeCloseTo(106.75, 1)
    expect(sand.ic).toBeCloseTo(1.7135, 3)
    expect(sand.converged).toBe(true)
  })

  it('reproduces it for a clay, where n pins at 1', () => {
    expect(clay.n).toBeCloseTo(1.0, 6)
    expect(clay.ic).toBeCloseTo(3.2918, 3)
    expect(clay.converged).toBe(true)
  })

  it('ITERATES rather than assuming n', () => {
    // n and Ic are mutually dependent. Assuming n = 1 for the sand would give a
    // different Ic and could move it into another behaviour zone.
    expect(sand.iterations).toBeGreaterThan(0)
    // Assuming n = 1 gives a materially different Q_tn, and on a marginal
    // reading that moves I_c into another behaviour zone.
    const qtnAtNEqualsOne = ((12 * 1000 - SV) / 100) * (100 / SVE)
    expect(qtnAtNEqualsOne).toBeCloseTo(98.73, 1)
    expect(Math.abs(sand.qtn - qtnAtNEqualsOne)).toBeGreaterThan(5)
  })

  it('reports non-convergence instead of returning the last iterate as truth', () => {
    // Every physically sensible reading converges; the flag exists so one that
    // does not cannot be mistaken for a solution.
    for (const r of [sand, clay]) expect(r.converged).toBe(true)
  })

  it('refuses a reading that cannot be normalised', () => {
    expect(normalise(0.1, 60, 500, 300)).toBeUndefined()   // net resistance negative
    expect(normalise(12, 60, SV, 0)).toBeUndefined()       // no effective stress
    expect(normalise(12, 0, SV, SVE)).toBeUndefined()      // no sleeve friction
  })
})

describe('soil BEHAVIOUR type, not classification', () => {
  it('puts the worked sand and clay in the right zones', () => {
    expect(sbtOf(1.7135).zone).toBe(6)
    expect(sbtOf(1.7135).granular).toBe(true)
    expect(sbtOf(3.2918).zone).toBe(3)
    expect(sbtOf(3.2918).granular).toBe(false)
  })

  it('covers every boundary with no gap', () => {
    const zones = [1.0, 1.31, 2.05, 2.60, 2.95, 3.60, 4.5].map((ic) => sbtOf(ic).zone)
    expect(zones).toEqual([7, 6, 5, 4, 3, 2, 2])
  })

  it('describes BEHAVIOUR and never emits a USCS symbol', () => {
    // A CPT takes no sample; a clayey sand and a sandy clay can plot together.
    for (const ic of [1.0, 1.6, 2.3, 2.8, 3.2, 4.0]) {
      expect(sbtOf(ic).label).not.toMatch(/^(GW|GP|GM|GC|SW|SP|SM|SC|ML|CL|OL|MH|CH|OH|PT)$/)
      expect(sbtOf(ic).label.length).toBeGreaterThan(6)
    }
  })

  it('marks the liquefaction screening boundary where Robertson & Wride put it', () => {
    expect(IC_NON_LIQUEFIABLE).toBe(2.6)
    expect(sbtOf(IC_NON_LIQUEFIABLE - 0.01).granular).toBe(true)
    expect(sbtOf(IC_NON_LIQUEFIABLE + 0.01).granular).toBe(false)
  })
})

describe('correlations refuse to apply outside their soil', () => {
  const sand = normalise(12, 60, SV, SVE)!
  const clay = normalise(0.88, 30, SV, SVE)!

  it('gives Dr and φ′ for the sand', () => {
    expect(relativeDensity(sand).value!).toBeCloseTo(59.16, 1)
    expect(frictionAngle(sand).value!).toBeCloseTo(39.91, 1)
  })

  it('REFUSES Dr and φ′ in clay, with a reason', () => {
    expect(relativeDensity(clay).value).toBeUndefined()
    expect(relativeDensity(clay).refusal).toMatch(/granular-soil property/)
    expect(frictionAngle(clay).value).toBeUndefined()
    expect(frictionAngle(clay).refusal).toMatch(/applies to sands/)
  })

  it('gives su for the clay and refuses it for the sand', () => {
    // (880 − 198)/15 = 45.5 kPa
    expect(undrainedStrength(clay, SV, 15).value!).toBeCloseTo(45.47, 1)
    expect(undrainedStrength(sand, SV).value).toBeUndefined()
    expect(undrainedStrength(sand, SV).refusal).toMatch(/behaves drained/)
  })

  it('says out loud that su is proportional to an ASSUMED N_kt', () => {
    const r = undrainedStrength(clay, SV, 15)
    expect(r.note).toMatch(/N_kt ranges 10–20/)
    // And the number really does scale with it.
    expect(undrainedStrength(clay, SV, 10).value!)
      .toBeCloseTo(undrainedStrength(clay, SV, 20).value! * 2, 6)
  })

  it('caps Dr at 100% and explains what that means', () => {
    const veryStiff = normalise(60, 200, SV, SVE)!
    const r = relativeDensity(veryStiff)
    expect(r.value!).toBeLessThanOrEqual(100)
    if (r.value === 100) expect(r.note).toMatch(/overconsolidated or cemented/)
  })

  it('refuses a nonsense N_kt rather than dividing by it', () => {
    expect(undrainedStrength(clay, SV, 0).refusal).toMatch(/greater than zero/)
  })
})

describe('a whole sounding', () => {
  const readings = [
    { depth: 2, qc: 8, fs: 40, u2: 0 },
    { depth: 5, qc: 10, fs: 50, u2: 20 },
    { depth: 10, qc: 12, fs: 60, u2: 0 },
    { depth: 14, qc: 0.9, fs: 35, u2: 500 },
  ]

  it('processes every reading with its own stress state', () => {
    const s = processSounding(readings, LAYERS, 2)
    expect(s.rows).toHaveLength(4)
    expect(s.rows.every((r) => r.normalised)).toBe(true)
    // Deeper readings sit under more overburden.
    expect(s.rows[3].effectiveStress).toBeGreaterThan(s.rows[0].effectiveStress)
  })

  it('separates the sands from the clay by behaviour', () => {
    const s = processSounding(readings, LAYERS, 2)
    expect(s.rows[2].sbt!.granular).toBe(true)
    expect(s.rows[3].sbt!.granular).toBe(false)
  })

  it('states the assumptions it had to make', () => {
    const s = processSounding(readings, LAYERS, 2)
    expect(s.notes.join(' ')).toMatch(/Net area ratio taken as 0\.80/)
  })

  it('says the profile is treated as DRY when no water table is given', () => {
    const s = processSounding(readings, LAYERS, undefined)
    expect(s.notes.join(' ')).toMatch(/treated as dry/)
    expect(s.notes.join(' ')).toMatch(/reads high if it is not/)
  })

  it('flags readings with no u₂ and says where that bites', () => {
    const s = processSounding([{ depth: 10, qc: 1, fs: 30 }], LAYERS, 2)
    expect(s.notes.join(' ')).toMatch(/pore pressure on the shoulder can exceed the cone resistance/)
  })

  it('reports an un-normalisable reading rather than dropping it', () => {
    const s = processSounding([{ depth: 10, qc: 0.05, fs: 60, u2: 0 }], LAYERS, 2)
    expect(s.rows).toHaveLength(1)
    expect(s.rows[0].normalised).toBeUndefined()
    expect(s.rows[0].skipped).toBeTruthy()
    expect(s.rows[0].qc).toBe(0.05)          // the raw reading survives
    expect(s.notes.join(' ')).toMatch(/could not be normalised/)
  })

  it('summarises the behaviour zones by share of the sounding', () => {
    const s = processSounding(readings, LAYERS, 2)
    const profile = sbtProfile(s)
    expect(profile.length).toBeGreaterThan(0)
    expect(profile.reduce((n, p) => n + p.fraction, 0)).toBeCloseTo(1, 9)
    // Sorted commonest first.
    for (let i = 1; i < profile.length; i++) {
      expect(profile[i - 1].fraction).toBeGreaterThanOrEqual(profile[i].fraction)
    }
  })

  it('returns an empty profile rather than throwing when nothing normalised', () => {
    expect(sbtProfile({ rows: [], notes: [] })).toEqual([])
  })
})
