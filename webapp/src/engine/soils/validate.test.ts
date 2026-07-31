import { describe, it, expect } from 'vitest'
import { validateInvestigation, validateAtterberg, hasErrors } from './validate'
import { sampleInvestigation } from './sample'
import { isCone } from './model'
import type { Investigation, Borehole } from './model'

/** Deep-clone the fixture so each case can corrupt one field in isolation. */
const fixture = (): Investigation => structuredClone(sampleInvestigation())
const codes = (inv: Investigation) => validateInvestigation(inv).map((i) => i.code)

describe('validateInvestigation — the clean fixture', () => {
  it('passes with no errors AND no warnings', () => {
    // A fixture that already carried warnings would make every test below
    // unable to distinguish a new warning from an existing one.
    expect(validateInvestigation(sampleInvestigation())).toEqual([])
  })
})

describe('stratigraphy', () => {
  it('flags an overlap as an ERROR — two soils cannot occupy the same ground', () => {
    const inv = fixture()
    inv.boreholes[0].layers[1].depthBottom = 5.0   // now overlaps the clay at 4.2
    const issues = validateInvestigation(inv)
    const overlap = issues.find((i) => i.code === 'layer-overlap')!
    expect(overlap.severity).toBe('error')
    expect(overlap.message).toContain('4.20')
  })

  it('flags a gap as a WARNING — an unrecovered run is a real thing to log', () => {
    const inv = fixture()
    inv.boreholes[0].layers[1].depthBottom = 4.0   // 0.2 m unlogged before the clay
    const gap = validateInvestigation(inv).find((i) => i.code === 'layer-gap')!
    expect(gap.severity).toBe('warning')
    expect(hasErrors(validateInvestigation(inv))).toBe(false)
  })

  it('never repairs the data it complains about', () => {
    // The whole point of the module: report, never mutate. Only the person who
    // was on the rig knows whether a gap is an error or an unrecovered run.
    const inv = fixture()
    inv.boreholes[0].layers[1].depthBottom = 4.0
    const before = structuredClone(inv)
    validateInvestigation(inv)
    expect(inv).toEqual(before)
  })

  it('rejects a zero-thickness layer and a profile deeper than the hole', () => {
    const inv = fixture()
    inv.boreholes[0].layers[0].depthBottom = 0
    expect(codes(inv)).toContain('layer-zero-thickness')

    const inv2 = fixture()
    inv2.boreholes[0].layers[3].depthBottom = 25   // hole terminated at 20
    const issue = validateInvestigation(inv2).find((i) => i.code === 'profile-below-termination')!
    expect(issue.severity).toBe('error')
  })

  it('warns when the profile stops short of the termination depth', () => {
    const inv = fixture()
    inv.boreholes[0].layers[3].depthBottom = 18
    const issue = validateInvestigation(inv).find((i) => i.code === 'profile-short-of-termination')!
    expect(issue.severity).toBe('warning')
  })
})

describe('boreholes', () => {
  it('rejects two holes sharing a name — logs would be ambiguous', () => {
    const inv = fixture()
    inv.boreholes[1].name = 'BH-01'
    const issue = validateInvestigation(inv).find((i) => i.code === 'duplicate-borehole-name')!
    expect(issue.severity).toBe('error')
  })

  it('rejects groundwater logged below the bottom of the hole', () => {
    const inv = fixture()
    inv.boreholes[0].groundwaterDepth = 25
    expect(codes(inv)).toContain('groundwater-below-hole')
  })

  it('rejects a completion date before the start date', () => {
    const inv = fixture()
    inv.boreholes[0].completionDate = '2026-06-14'
    expect(codes(inv)).toContain('borehole-dates')
  })
})

describe('samples', () => {
  it('rejects recovery longer than the drive', () => {
    const inv = fixture()
    inv.boreholes[0].samples[0].recoveryLength = 0.60   // drive is 0.45
    const issue = validateInvestigation(inv).find((i) => i.code === 'recovery-over-100')!
    expect(issue.severity).toBe('error')
  })

  it('warns on poor recovery rather than blocking it', () => {
    const inv = fixture()
    inv.boreholes[0].samples[0].recoveryLength = 0.15   // 33%
    const issue = validateInvestigation(inv).find((i) => i.code === 'low-recovery')!
    expect(issue.severity).toBe('warning')
  })

  it('warns when a strength test is run on a disturbed sample', () => {
    // S-01 is a split-spoon sample: fine for classification, not for a triaxial.
    const inv = fixture()
    inv.boreholes[0].samples[0].tests.push({
      id: 'bad', type: 'triaxial', standard: 'd4767', status: 'planned',
    })
    const issue = validateInvestigation(inv).find((i) => i.code === 'strength-test-on-disturbed')!
    expect(issue.severity).toBe('warning')
    expect(issue.message).toContain('undisturbed')
  })

  it('does not warn about a VOID strength test on a disturbed sample', () => {
    const inv = fixture()
    inv.boreholes[0].samples[0].tests.push({
      id: 'bad', type: 'triaxial', standard: 'd4767', status: 'void',
    })
    expect(codes(inv)).not.toContain('strength-test-on-disturbed')
  })

  it('rejects a sample attributed to a layer in another hole', () => {
    const inv = fixture()
    inv.boreholes[0].samples[0].layerId = 'bh2-l1'
    expect(codes(inv)).toContain('sample-unknown-layer')
  })
})

describe('SPT', () => {
  it('treats an unusually high N as a WARNING, not an error', () => {
    // Flagging the merely unusual as an error trains the user to ignore errors.
    const inv = fixture()
    inv.boreholes[0].spt[7].blows = [40, 60, 65]
    const issues = validateInvestigation(inv)
    expect(issues.find((i) => i.code === 'spt-very-high')!.severity).toBe('warning')
    expect(hasErrors(issues)).toBe(false)
  })

  it('rejects a negative blow count and an out-of-hole depth', () => {
    const inv = fixture()
    inv.boreholes[0].spt[0].blows = [3, -1, 4]
    expect(codes(inv)).toContain('spt-negative-blows')

    const inv2 = fixture()
    inv2.boreholes[0].spt[0].depth = 30
    expect(codes(inv2)).toContain('spt-outside-hole')
  })

  it('warns that a refusal N is a lower bound, not a measurement', () => {
    const inv = fixture()
    inv.boreholes[0].spt[7].penetration = [150, 150, 75]
    const issue = validateInvestigation(inv).find((i) => i.code === 'spt-refusal')!
    expect(issue.severity).toBe('warning')
    expect(issue.message).toMatch(/lower bound/)
  })

  it('rejects an energy ratio outside 0–100%', () => {
    const inv = fixture()
    inv.boreholes[0].spt[0].energyRatio = 160
    expect(codes(inv)).toContain('spt-energy-ratio')
  })

  it('rejects an SPT pointing at a sample from another hole', () => {
    const inv = fixture()
    inv.boreholes[0].spt[0].sampleId = 'bh2-s1'
    expect(codes(inv)).toContain('spt-unknown-sample')
  })
})

describe('design parameters', () => {
  it('rejects parameters pointing at a layer that is not in the stated hole', () => {
    const inv = fixture()
    inv.parameters.push({ boreholeId: 'bh1', layerId: 'bh2-l2' })
    expect(codes(inv)).toContain('parameters-unknown-layer')
  })

  it('rejects parameters pointing at a hole that does not exist', () => {
    const inv = fixture()
    inv.parameters.push({ boreholeId: 'bh9', layerId: 'x' })
    expect(codes(inv)).toContain('parameters-unknown-borehole')
  })
})

describe('validateAtterberg', () => {
  it('rejects PL above LL — one of the two tests is wrong', () => {
    const issues = validateAtterberg({ liquidLimit: 35, plasticLimit: 40 })
    const e = issues.find((i) => i.code === 'pl-above-ll')!
    expect(e.severity).toBe('error')
    expect(e.message).toMatch(/negative plasticity index/)
  })

  it('accepts a normal clay', () => {
    expect(validateAtterberg({ liquidLimit: 48, plasticLimit: 25, naturalMoisture: 30 })).toEqual([])
  })

  it('warns when the natural moisture exceeds the liquid limit', () => {
    const issues = validateAtterberg({ liquidLimit: 42, plasticLimit: 23, naturalMoisture: 55 })
    const w = issues.find((i) => i.code === 'moisture-above-ll')!
    expect(w.severity).toBe('warning')
    expect(w.message).toMatch(/sensitive|quick/)
  })

  it('rejects a negative limit and a shrinkage limit above the plastic limit', () => {
    expect(validateAtterberg({ liquidLimit: -5 }).map((i) => i.code)).toContain('limit-negative')
    expect(validateAtterberg({ plasticLimit: 20, shrinkageLimit: 25 }).map((i) => i.code)).toContain('sl-above-pl')
  })

  it('handles a partially entered form without inventing failures', () => {
    // The form validates as the user types; a half-filled form is not an error.
    expect(validateAtterberg({})).toEqual([])
    expect(validateAtterberg({ liquidLimit: 48 })).toEqual([])
  })
})

// ── CPT soundings ─────────────────────────────────────────────────────────

const sounding = (over: Partial<Borehole> = {}): Investigation => ({
  meta: {
    investigationNo: 'SI-1', title: 'T', site: { projectName: 'P' }, status: 'draft',
  },
  boreholes: [{
    id: 'c1', name: 'CPT-01', kind: 'cpt', actualDepth: 20,
    layers: [], samples: [], spt: [],
    cpt: [{ depth: 1, qc: 5, fs: 40, u2: 10 }, { depth: 2, qc: 6, fs: 45, u2: 12 }],
    ...over,
  }],
  parameters: [],
})

describe('cone soundings', () => {
  it('accepts a clean sounding', () => {
    expect(codes(sounding())).not.toContain('cone-without-readings')
    expect(codes(sounding())).not.toContain('cone-with-samples')
  })

  it('knows which exploration kinds push a cone', () => {
    expect(isCone('cpt')).toBe(true)
    expect(isCone('cptu')).toBe(true)
    expect(isCone('borehole')).toBe(false)
    expect(isCone('trial-pit')).toBe(false)
  })

  it('flags a sounding that claims SAMPLES — a cone recovers nothing', () => {
    // The record has been mixed with an adjacent borehole, and every lab result
    // is then attributed to ground nobody sampled.
    const inv = sounding({
      samples: [{ id: 's', name: 'S-01', type: 'disturbed', depthTop: 1, depthBottom: 1.5, tests: [] }],
    })
    expect(codes(inv)).toContain('cone-with-samples')
  })

  it('flags a sounding that claims SPT', () => {
    const inv = sounding({
      spt: [{ id: 'n', depth: 3, blows: [2, 3, 4], penetration: [150, 150, 150] }],
    })
    expect(codes(inv)).toContain('cone-with-spt')
  })

  it('flags a cone kind with no readings, and readings on a drilled hole', () => {
    expect(codes(sounding({ cpt: [] }))).toContain('cone-without-readings')
    expect(codes(sounding({ kind: 'borehole' }))).toContain('readings-without-cone')
  })

  it('REJECTS a reading below the sounding depth or above ground', () => {
    expect(codes(sounding({ cpt: [{ depth: 25, qc: 5, fs: 40 }] }))).toContain('cpt-below-hole')
    expect(codes(sounding({ cpt: [{ depth: -1, qc: 5, fs: 40 }] }))).toContain('cpt-negative-depth')
  })

  it('REJECTS a negative resistance', () => {
    expect(codes(sounding({ cpt: [{ depth: 1, qc: -5, fs: 40 }] }))).toContain('cpt-negative-resistance')
    expect(codes(sounding({ cpt: [{ depth: 1, qc: 5, fs: -40 }] }))).toContain('cpt-negative-resistance')
  })

  it('warns about duplicated depths', () => {
    const inv = sounding({ cpt: [{ depth: 1, qc: 5, fs: 40 }, { depth: 1, qc: 6, fs: 41 }] })
    expect(codes(inv)).toContain('cpt-duplicate-depth')
  })

  it('warns when NO reading carries u₂, and says where that bites', () => {
    const inv = sounding({ cpt: [{ depth: 1, qc: 5, fs: 40 }, { depth: 2, qc: 6, fs: 45 }] })
    expect(codes(inv)).toContain('cpt-no-pore-pressure')
    const msg = validateInvestigation(inv).find((i) => i.code === 'cpt-no-pore-pressure')!.message
    expect(msg).toMatch(/dominant term, not a refinement/)
  })

  it('says nothing about cones for an ordinary borehole', () => {
    const inv = sounding({ kind: 'borehole', cpt: undefined })
    expect(codes(inv).filter((c) => c.startsWith('cpt-') || c.startsWith('cone-'))).toEqual([])
  })
})
