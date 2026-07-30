import { describe, it, expect } from 'vitest'
import { sptProfile, type LayerUnitWeight } from './sptProfile'
import { sampleInvestigation } from './sample'
import { effectiveStressAt } from './overburden'

const bh = () => structuredClone(sampleInvestigation()).boreholes[0]

/** Unit weights for every layer of BH-01. */
const allWeights: Record<string, LayerUnitWeight> = {
  'bh1-l1': { gamma: 17, gammaSat: 19 },
  'bh1-l2': { gamma: 18, gammaSat: 20 },
  'bh1-l3': { gamma: 16, gammaSat: 18 },
  'bh1-l4': { gamma: 19, gammaSat: 21 },
}

describe('a fully specified hole', () => {
  const p = sptProfile(bh(), allWeights)

  it('returns every test, in depth order', () => {
    expect(p.rows).toHaveLength(8)
    const depths = p.rows.map((r) => r.depth)
    expect([...depths].sort((a, b) => a - b)).toEqual(depths)
  })

  it('attributes each test to the layer it falls in', () => {
    const at6 = p.rows.find((r) => r.depth === 6)!
    expect(at6.layerName).toBe('Lean Clay')       // 4.2–8.5 m
    const at12 = p.rows.find((r) => r.depth === 12)!
    expect(at12.layerName).toBe('Poorly Graded Sand')
  })

  it('computes effective stress consistent with the standalone helper', () => {
    const at9 = p.rows.find((r) => r.depth === 9)!
    const expected = effectiveStressAt(
      [
        { thickness: 1.5, gamma: 17, gammaSat: 19 },
        { thickness: 2.7, gamma: 18, gammaSat: 20 },
        { thickness: 4.3, gamma: 16, gammaSat: 18 },
        { thickness: 11.5, gamma: 19, gammaSat: 21 },
      ],
      9, 7.8,
    )
    expect(at9.effectiveStress).toBeCloseTo(expected, 8)
  })

  it('gives (N1)60 everywhere the stress is known', () => {
    expect(p.rows.every((r) => r.n160 != null)).toBe(true)
    expect(p.missingUnitWeights).toEqual([])
  })

  it('applies the hole diameter to C_B', () => {
    // BH-01 is a 100 mm hole ⇒ C_B = 1.0.
    expect(p.rows.every((r) => r.cb === 1.0)).toBe(true)
  })

  it('normalises the deep dense sand below its raw blow count', () => {
    // At 18 m the effective stress is well above 100 kPa, so C_N < 1.
    const at18 = p.rows.find((r) => r.depth === 18)!
    expect(at18.effectiveStress!).toBeGreaterThan(100)
    expect(at18.cn!).toBeLessThan(1)
    expect(at18.n160!).toBeLessThan(at18.n60)
  })
})

describe('missing unit weights are reported, never defaulted', () => {
  it('stops computing stress below the first layer with no unit weight', () => {
    // A wrong γ moves σ′v0, which moves C_N, which moves (N₁)₆₀, which moves φ′.
    const partial = { 'bh1-l1': allWeights['bh1-l1'], 'bh1-l2': allWeights['bh1-l2'] }
    const p = sptProfile(bh(), partial)

    // Layers 1–2 cover 0–4.2 m.
    const shallow = p.rows.filter((r) => r.depth <= 4.2)
    const deep = p.rows.filter((r) => r.depth > 4.2)
    expect(shallow.every((r) => r.effectiveStress != null)).toBe(true)
    expect(deep.every((r) => r.effectiveStress === undefined)).toBe(true)
    expect(deep.every((r) => r.n160 === undefined)).toBe(true)
  })

  it('still reports N60, which needs no stress', () => {
    const p = sptProfile(bh(), {})
    expect(p.rows.every((r) => r.n60 > 0)).toBe(true)
    expect(p.rows.every((r) => r.n160 === undefined)).toBe(true)
  })

  it('names the layers it is missing and the depth it stopped at', () => {
    const p = sptProfile(bh(), { 'bh1-l1': allWeights['bh1-l1'] })
    expect(p.missingUnitWeights).toEqual(['Silty Sand', 'Lean Clay', 'Poorly Graded Sand'])
    expect(p.notes.join(' ')).toMatch(/not computed below 1\.50 m/)
  })
})

describe('groundwater', () => {
  it('warns when no water table was recorded', () => {
    const dry = bh()
    dry.groundwaterDepth = undefined
    const p = sptProfile(dry, allWeights)
    expect(p.notes.join(' ')).toMatch(/treated as dry/)
  })

  it('a dry profile gives a higher effective stress than a wet one', () => {
    const dry = bh()
    dry.groundwaterDepth = undefined
    const wet = sptProfile(bh(), allWeights).rows.find((r) => r.depth === 18)!
    const dryRow = sptProfile(dry, allWeights).rows.find((r) => r.depth === 18)!
    expect(dryRow.effectiveStress!).toBeGreaterThan(wet.effectiveStress!)
  })
})

describe('refusals', () => {
  it('counts them and says the blow counts are lower bounds', () => {
    const withRefusal = bh()
    withRefusal.spt[7].penetration = [150, 150, 60]
    const p = sptProfile(withRefusal, allWeights)
    expect(p.notes.join(' ')).toMatch(/1 of 8 tests hit refusal/)
    expect(p.rows.find((r) => r.depth === 18)!.refusal).toBe(true)
  })
})

describe('an empty hole', () => {
  it('returns an empty profile rather than throwing', () => {
    const empty = bh()
    empty.spt = []
    const p = sptProfile(empty, allWeights)
    expect(p.rows).toEqual([])
    expect(p.notes.join(' ')).not.toMatch(/refusal/)
  })
})
