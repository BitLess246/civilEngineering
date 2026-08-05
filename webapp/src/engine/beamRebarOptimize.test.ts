import { describe, it, expect } from 'vitest'
import { optimizeBeamRebar, BEAM_BAR_SIZES } from './beamRebarOptimize'
import { designBeam, type BeamDesignInput } from './beamDesign'

const BASE: BeamDesignInput = {
  b: 300, h: 500, cover: 40, barDia: 20, stirrupDia: 10,
  fc: 28, fy: 415, Mu: 150, Vu: 120,
}

describe('it searches the catalogue instead of using the input diameter', () => {
  const r = optimizeBeamRebar(BASE)

  it('designs the beam at every size it can lay out', () => {
    expect(r.designs.size).toBeGreaterThanOrEqual(BEAM_BAR_SIZES.length - 1)
    for (const db of r.designs.keys()) expect(BEAM_BAR_SIZES).toContain(db)
  })

  it('adopts a layout and reports the design that produced it', () => {
    expect(r.selection.best).not.toBeNull()
    expect(r.design).not.toBeNull()
    expect(r.input!.barDia).toBe(r.selection.best!.layout.db)
    // The reported design really is the one for the adopted diameter.
    expect(r.design!.bars).toBe(r.selection.best!.layout.bars)
  })

  it('ignores the diameter the caller passed in', () => {
    const a = optimizeBeamRebar({ ...BASE, barDia: 12 })
    const b = optimizeBeamRebar({ ...BASE, barDia: 32 })
    expect(a.selection.best!.layout.db).toBe(b.selection.best!.layout.db)
  })

  it('ranks every compliant size and rejects the rest with a clause', () => {
    expect(r.selection.ranked.length).toBeGreaterThan(1)
    for (const x of r.selection.rejected) {
      expect(x.failedGate).not.toBeNull()
      expect(x.failedGate!.clause).toMatch(/§|practice/)
    }
  })

  it('is deterministic', () => {
    const again = optimizeBeamRebar(BASE)
    expect(again.selection.ranked.map((x) => `${x.layout.bars}⌀${x.layout.db}`))
      .toEqual(r.selection.ranked.map((x) => `${x.layout.bars}⌀${x.layout.db}`))
  })
})

describe('the adopted layout is genuinely compliant', () => {
  const cases: [string, BeamDesignInput][] = [
    ['light', { ...BASE, b: 250, h: 400, Mu: 60, Vu: 70 }],
    ['ordinary', BASE],
    ['heavy', { ...BASE, b: 300, h: 600, Mu: 320, Vu: 180 }],
    ['very heavy', { ...BASE, b: 400, h: 700, Mu: 600, Vu: 300 }],
  ]

  it.each(cases)('%s: every compliance check passes on the winner', (_name, inp) => {
    const r = optimizeBeamRebar(inp)
    expect(r.selection.best).not.toBeNull()
    for (const c of r.selection.best!.compliance) {
      expect(c.pass, `${c.id} — ${c.label}`).toBe(true)
    }
  })

  it.each(cases)('%s: the winning design carries the moment', (_name, inp) => {
    const r = optimizeBeamRebar(inp)
    const d = r.design!
    expect(d.flexOK).toBe(true)
    expect(d.bars).toBeGreaterThanOrEqual(2)
    expect(d.layers.length).toBeLessThanOrEqual(3)
  })

  it.each(cases)('%s: the winner never exceeds the §24.3.2 spacing limit', (_name, inp) => {
    const r = optimizeBeamRebar(inp)
    const crack = r.selection.best!.compliance.find((c) => c.id === 'crack-spacing')!
    expect(crack.pass).toBe(true)
  })
})

describe('it does not pick the minimum-steel layout by default', () => {
  it('adopts a layout that is NOT the lightest in the compliant set', () => {
    // The whole point of the change: on an ordinary beam the least-steel
    // option is a small bar at tight spacing, and it loses on
    // constructability.
    const r = optimizeBeamRebar(BASE)
    const lightest = [...r.selection.ranked].sort((a, b) => a.layout.AsProv - b.layout.AsProv)[0]
    expect(r.selection.best!.layout.AsProv).toBeGreaterThan(lightest.layout.AsProv)
  })

  it('does not pick the fewest-bars layout either', () => {
    const r = optimizeBeamRebar(BASE)
    const fewest = [...r.selection.ranked].sort((a, b) => a.layout.bars - b.layout.bars)[0]
    expect(r.selection.best!.layout.bars).toBeGreaterThan(fewest.layout.bars)
  })

  it('a huge bar that technically works is beaten by a distributed cage', () => {
    const r = optimizeBeamRebar(BASE)
    const big = r.selection.ranked.find((x) => x.layout.db === 32)
    if (big) expect(r.selection.best!.total).toBeGreaterThan(big.total)
  })
})

describe('the §25.2.1 aggregate term is enforced', () => {
  it('rejects a layout whose clear spacing clears max(db,25) but not 4/3 d_agg', () => {
    // `designBeam` packs a layer on max(db, 25). §25.2.1 also asks for
    // 4/3 the nominal aggregate, which on 20 mm stone is 26.7 mm — so a
    // layout the engine laid out can still be non-compliant, and it must be
    // rejected here rather than adopted.
    const r = optimizeBeamRebar(BASE, { aggregate: 20 })
    const rejected = r.selection.rejected.filter((x) => x.failedGate!.id === 'bars-fit')
    expect(rejected.length).toBeGreaterThan(0)
    for (const x of rejected) expect(x.failedGate!.clause).toContain('25.2.1')
  })

  it('a smaller aggregate lets more layouts through', () => {
    const coarse = optimizeBeamRebar(BASE, { aggregate: 25 })
    const fine = optimizeBeamRebar(BASE, { aggregate: 10 })
    expect(fine.selection.ranked.length).toBeGreaterThanOrEqual(coarse.selection.ranked.length)
  })
})

describe('when the section is simply too small', () => {
  it('reports no winner rather than adopting a failing layout', () => {
    // 200×300 asked to carry 400 kN·m — nothing in the catalogue works.
    const r = optimizeBeamRebar({ ...BASE, b: 200, h: 300, Mu: 400, Vu: 250 })
    expect(r.selection.best).toBeNull()
    expect(r.design).toBeNull()
    expect(r.selection.margin).toMatch(/no layout satisfies/)
    expect(r.selection.rejected.length).toBeGreaterThan(0)
  })
})

describe('it agrees with designBeam for the size it adopts', () => {
  it('re-running designBeam at the adopted diameter reproduces the result', () => {
    // The optimiser must not massage anything — it selects among designs the
    // verified engine produced, and the adopted one has to be reproducible.
    const r = optimizeBeamRebar(BASE)
    const again = designBeam(r.input!)
    expect(again.bars).toBe(r.design!.bars)
    expect(again.d).toBeCloseTo(r.design!.d, 9)
    expect(again.As).toBeCloseTo(r.design!.As, 9)
    expect(again.layers).toEqual(r.design!.layers)
  })
})

describe('the search is bounded by what the caller asks for', () => {
  it('honours a restricted size list', () => {
    const r = optimizeBeamRebar(BASE, { sizes: [16, 20] })
    expect(r.designs.size).toBe(2)
    expect([16, 20]).toContain(r.selection.best!.layout.db)
  })

  it('a stricter vibrator clearance shifts the choice toward wider spacing', () => {
    const relaxed = optimizeBeamRebar(BASE, { sComfort: 25 })
    const strict = optimizeBeamRebar(BASE, { sComfort: 70 })
    expect(strict.selection.best!.layout.clearSpacing)
      .toBeGreaterThanOrEqual(relaxed.selection.best!.layout.clearSpacing)
  })
})
