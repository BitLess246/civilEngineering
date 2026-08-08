import { describe, it, expect } from 'vitest'
import {
  resolveParameters, toLayerParameters, bearingInputs, samplesInLayer,
  type ParameterKey,
} from './parameters'
import { sampleInvestigation } from './sample'
import type { Borehole, LabTest, Sample } from './model'
import type { LayerUnitWeight } from './sptProfile'

const bh = (): Borehole => structuredClone(sampleInvestigation()).boreholes[0]

const WEIGHTS: Record<string, LayerUnitWeight> = {
  'bh1-l1': { gamma: 17, gammaSat: 19 },
  'bh1-l2': { gamma: 18, gammaSat: 20 },
  'bh1-l3': { gamma: 16, gammaSat: 18 },
  'bh1-l4': { gamma: 19, gammaSat: 21 },
}

const lab = (over: Partial<LabTest> & Pick<LabTest, 'type'>): LabTest => ({
  id: `t${Math.random().toString(36).slice(2, 8)}`,
  standard: 'd3080', status: 'complete', ...over,
})

/** A direct shear placed exactly on c′ = 20 kPa, φ′ = 30°. */
const shearTest = () => lab({
  type: 'direct-shear', standard: 'd3080',
  data: {
    points: [
      { normalStress: 50, peakShear: 20 + 50 * Math.tan(Math.PI / 6) },
      { normalStress: 100, peakShear: 20 + 100 * Math.tan(Math.PI / 6) },
      { normalStress: 200, peakShear: 20 + 200 * Math.tan(Math.PI / 6) },
    ],
  },
})

const gsTest = () => lab({
  type: 'specific-gravity', standard: 'd854',
  data: { solidMass: 25, pycWaterMass: 675, pycWaterSolidMass: 690.6 },
})

// Dated later than the fixture's own (empty) UCS on S-02, so the
// most-recent-complete rule picks this one. Without the date the fixture's
// test wins and no cu appears — which is the rule working, not a bug.
const ucsTest = (soil?: string) => lab({
  type: 'ucs', standard: 'd2166', testDate: '2026-07-01',
  data: { diameter: 38, height: 76, failureLoad: 120, failureDeformation: 6, ...(soil ? { soil } : {}) },
})

const resolve = (b: Borehole, layerIdx: number, overrides = {}) =>
  resolveParameters({ borehole: b, layer: b.layers[layerIdx], unitWeights: WEIGHTS, overrides })

const find = (r: ReturnType<typeof resolve>, key: ParameterKey) =>
  r.resolved.find((p) => p.key === key)

// ── Evidence hierarchy ────────────────────────────────────────────────────

describe('a measurement outranks a correlation', () => {
  it('uses the direct-shear φ′, not the SPT one, and keeps the other as an alternative', () => {
    const b = bh()
    // Layer 2 (Silty Sand, 1.5-4.2 m) has SPT tests in it; add a shear test.
    b.samples[0].tests.push(shearTest())

    const r = resolve(b, 1)
    const phi = find(r, 'effectiveFrictionAngle')!
    expect(phi.value.provenance.kind).toBe('measured')
    expect(phi.value.value).toBeCloseTo(30, 1)

    // The SPT correlation is still reported, just not chosen.
    const alt = phi.alternatives.find((a) => a.provenance.kind === 'correlated')
    expect(alt).toBeDefined()
    if (alt?.provenance.kind === 'correlated') {
      expect(alt.provenance.source).toMatch(/Hatanaka/)
    }
  })

  it('falls back to the correlation when there is no test', () => {
    const r = resolve(bh(), 1)
    const phi = find(r, 'effectiveFrictionAngle')!
    expect(phi.value.provenance.kind).toBe('correlated')
    expect(phi.alternatives).toEqual([])
  })

  it('SAYS SO when the correlation and the measurement disagree materially', () => {
    const b = bh()
    // A shear test giving φ′ ≈ 20°, well below what the SPT correlation gives.
    b.samples[0].tests.push(lab({
      type: 'direct-shear', standard: 'd3080',
      data: {
        points: [
          { normalStress: 50, peakShear: 18.2 },
          { normalStress: 100, peakShear: 36.4 },
          { normalStress: 200, peakShear: 72.8 },
        ],
      },
    }))
    const r = resolve(b, 1)
    expect(r.notes.join(' ')).toMatch(/the measured value is .* but the correlation gives/)
    expect(r.notes.join(' ')).toMatch(/worth explaining in the report/)
  })
})

describe('an engineer override beats everything, but only with a reason', () => {
  it('wins over a measurement', () => {
    const b = bh()
    b.samples[0].tests.push(shearTest())
    const r = resolve(b, 1, {
      effectiveFrictionAngle: {
        value: 28, unit: '°',
        rationale: 'Shear box ran fast; adopting a conservative value pending a re-test.',
        by: 'RV',
      },
    })
    const phi = find(r, 'effectiveFrictionAngle')!
    expect(phi.value.value).toBe(28)
    expect(phi.value.provenance.kind).toBe('assumed')
    // The measurement it displaced is kept.
    expect(phi.alternatives.some((a) => a.provenance.kind === 'measured')).toBe(true)
  })

  it('is IGNORED when no rationale is given, and says why', () => {
    const b = bh()
    b.samples[0].tests.push(shearTest())
    const r = resolve(b, 1, {
      effectiveFrictionAngle: { value: 28, unit: '°', rationale: '   ' },
    })
    const phi = find(r, 'effectiveFrictionAngle')!
    expect(phi.value.provenance.kind).toBe('measured')
    expect(r.notes.join(' ')).toMatch(/indistinguishable from a typing error/)
  })
})

// ── The absent parameter ──────────────────────────────────────────────────

describe('a parameter with no evidence stays absent', () => {
  it('is never defaulted to a textbook value', () => {
    // An analysis running on invented numbers that look like measurements is
    // the failure this whole module exists to prevent.
    const b = bh()
    b.samples = []
    b.spt = []
    const r = resolve(b, 2)
    expect(r.resolved).toEqual([])
    expect(r.absent).toContain('effectiveFrictionAngle')
    expect(r.absent).toContain('undrainedShearStrength')
    expect(r.absent).toContain('unitWeight')
  })

  it('reports absence to a downstream consumer rather than a plausible number', () => {
    const b = bh()
    b.samples = []
    b.spt = []
    const inputs = bearingInputs(resolve(b, 2))
    expect(inputs.c).toBeUndefined()
    expect(inputs.phiDeg).toBeUndefined()
    expect(inputs.missing).toEqual(
      expect.arrayContaining(['effectiveCohesion', 'effectiveFrictionAngle', 'unitWeight']),
    )
  })
})

// ── Soil-type gating ──────────────────────────────────────────────────────

describe('correlations respect the soil they were fitted to', () => {
  it('does not correlate φ′ or relative density in a clay', () => {
    // Layer 3 is the Lean Clay, 4.2-8.5 m.
    const r = resolve(bh(), 2)
    expect(find(r, 'effectiveFrictionAngle')).toBeUndefined()
    expect(find(r, 'relativeDensity')).toBeUndefined()
    expect(r.notes.join(' ')).toMatch(/this layer is cohesive/)
  })

  it('cu in a clay comes from the MEASUREMENT when there is one', () => {
    // The fixture's clay sample carries a UCS test, and a measurement always
    // beats the SPT correlation — they are never averaged.
    const clay = resolve(bh(), 2)
    expect(find(clay, 'undrainedShearStrength')?.value.provenance.kind).toBe('measured')
  })

  it('falls back to the correlation in a clay with no test on it', () => {
    const b = bh()
    for (const s of b.samples) s.tests = s.tests.filter((t) => t.type !== 'ucs')
    const clay = resolve(b, 2)
    expect(find(clay, 'undrainedShearStrength')?.value.provenance.kind).toBe('correlated')
  })

  it('offers no cu at all in a sand — neither measured nor correlated', () => {
    const sand = resolve(bh(), 1)
    expect(find(sand, 'undrainedShearStrength')).toBeUndefined()
  })

  it('reads the family from the group symbol when the description disagrees', () => {
    const b = bh()
    b.layers[1].symbol = 'CL'          // classified as clay despite "Silty Sand"
    const r = resolve(b, 1)
    expect(find(r, 'effectiveFrictionAngle')).toBeUndefined()
    expect(r.notes.join(' ')).toMatch(/cohesive/)
  })
})

describe('refusals are excluded from correlations', () => {
  it('drops them and says how many', () => {
    const b = bh()
    // Two SPT results in layer 4 (the dense sand) hit refusal.
    b.spt[5].penetration = [150, 150, 60]
    b.spt[6].penetration = [150, 150, 40]
    const r = resolve(b, 3)
    expect(r.notes.join(' ')).toMatch(/2 SPT result\(s\) in this layer hit refusal/)
    expect(r.notes.join(' ')).toMatch(/a lower bound is not a measurement/)
  })

  it('leaves the parameter absent when EVERY test in the layer refused', () => {
    const b = bh()
    for (const t of b.spt) t.penetration = [150, 150, 50]
    b.samples = []
    const r = resolve(b, 1)
    expect(find(r, 'effectiveFrictionAngle')).toBeUndefined()
  })
})

// ── Laboratory sources ────────────────────────────────────────────────────

describe('laboratory measurements', () => {
  it('takes c′ and φ′ from a direct shear, with the fitted stress range noted', () => {
    const b = bh()
    b.samples[0].tests.push(shearTest())
    const r = resolve(b, 1)
    expect(find(r, 'effectiveCohesion')!.value.value).toBeCloseTo(20, 1)
    expect(find(r, 'effectiveCohesion')!.value.note).toMatch(/fitted over 50–200 kPa/)
  })

  it('takes cu from a UCS and records that it is a lower bound', () => {
    const b = bh()
    b.samples[1].tests.push(ucsTest())      // S-02 sits in the clay
    const r = resolve(b, 2)
    const cu = find(r, 'undrainedShearStrength')!
    expect(cu.value.provenance.kind).toBe('measured')
    expect(cu.value.value).toBeCloseTo(48.7, 0)
    expect(cu.value.note).toMatch(/lower bound/)
  })

  it('does NOT take cu from a UCS the engine declined', () => {
    const b = bh()
    b.samples[1].tests.push(ucsTest('fissured'))
    const r = resolve(b, 2)
    const cu = find(r, 'undrainedShearStrength')
    // The SPT correlation may still supply one, but not the UCS.
    expect(cu?.value.provenance.kind).not.toBe('measured')
    expect(r.notes.join(' ')).toMatch(/does not give cu/)
  })

  it('derives a void ratio from Gs and the entered unit weight', () => {
    const b = bh()
    b.samples[0].tests.push(gsTest())
    const r = resolve(b, 1)
    const e = find(r, 'voidRatio')!
    expect(e.value.provenance.kind).toBe('derived')
    // e = Gs·γw/γd − 1 = 2.6596 × 9.81 / 18 − 1
    expect(e.value.value).toBeCloseTo(0.4494, 3)
    expect(e.value.note).toMatch(/DRY value/)
  })
})

// ── Sample attribution ────────────────────────────────────────────────────

describe('samplesInLayer', () => {
  const b = bh()

  it('takes samples explicitly attributed to the layer', () => {
    expect(samplesInLayer(b, b.layers[1]).map((s) => s.name)).toEqual(['S-01'])
  })

  it('takes an unattributed sample by its depth', () => {
    const c = bh()
    const orphan: Sample = {
      id: 'orphan', name: 'S-99', type: 'split-spoon',
      depthTop: 2.0, depthBottom: 2.45, tests: [],
    }
    c.samples.push(orphan)
    expect(samplesInLayer(c, c.layers[1]).map((s) => s.name)).toContain('S-99')
  })

  it('does not steal a sample attributed to a different layer', () => {
    const c = bh()
    c.samples[0].layerId = 'bh1-l4'
    expect(samplesInLayer(c, c.layers[1])).toEqual([])
  })
})

// ── Output shaping ────────────────────────────────────────────────────────

describe('toLayerParameters', () => {
  it('produces the schema shape, keeping provenance on every value', () => {
    const b = bh()
    b.samples[0].tests.push(shearTest(), gsTest())
    const p = toLayerParameters(resolve(b, 1))
    expect(p.layerId).toBe('bh1-l2')
    expect(p.boreholeId).toBe('bh1')
    expect(p.effectiveFrictionAngle?.provenance.kind).toBe('measured')
    expect(p.specificGravity?.value).toBeCloseTo(2.66, 2)
    // JSON-serialisable, since it is stored.
    expect(JSON.parse(JSON.stringify(p))).toEqual(p)
  })
})

describe('bearingInputs', () => {
  it('hands the geotech engine what it needs, in its units', () => {
    const b = bh()
    b.samples[0].tests.push(shearTest())
    const inputs = bearingInputs(resolve(b, 1), 18)
    expect(inputs.c).toBeCloseTo(20, 1)
    expect(inputs.phiDeg).toBeCloseTo(30, 1)
    expect(inputs.gamma).toBe(18)
    expect(inputs.missing).toEqual([])
  })

  it('prefers effective parameters over total-stress ones', () => {
    const b = bh()
    b.samples[0].tests.push(shearTest())
    const r = resolve(b, 1)
    expect(find(r, 'effectiveCohesion')).toBeDefined()
    expect(bearingInputs(r, 18).c).toBeCloseTo(find(r, 'effectiveCohesion')!.value.value, 6)
  })
})
