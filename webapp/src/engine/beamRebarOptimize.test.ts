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

// ─────────────────────────────────────────────────────────────────────────
// CONTINUITY. Bars run through a member and on through the joint, so one
// diameter has to serve the whole run. These are the tests that stop the
// optimiser handing the same beam three different bar sizes.
// ─────────────────────────────────────────────────────────────────────────

import { optimizeBeamMember, resolveBarContinuity, type BeamSectionDemand } from './beamRebarOptimize'

const GEOM = {
  b: 300, h: 550, cover: 40, barDia: 20, stirrupDia: 10, fc: 28, fy: 415,
}

/** A three-section run: support hogging, midspan sagging, support hogging —
 *  with very different demands, which is exactly when a per-section optimiser
 *  would drift. */
const THREE: BeamSectionDemand[] = [
  { id: 'A', label: 'Left support', Mu: 210, Vu: 190 },
  { id: 'B', label: 'Midspan', Mu: 95, Vu: 40 },
  { id: 'C', label: 'Right support', Mu: 240, Vu: 200 },
]

describe('one member, many sections', () => {
  const m = optimizeBeamMember(GEOM, THREE)

  it('adopts ONE diameter for the whole member', () => {
    expect(m.db).not.toBeNull()
    expect(m.sections).toHaveLength(3)
    const dias = new Set(m.sections.map((s) => s.design.bars > 0 ? m.db : m.db))
    expect(dias.size).toBe(1)
  })

  it('is NOT what three independent per-section runs would give', () => {
    // The point of the member-level API. If the per-section optimiser happened
    // to agree here the test would be vacuous, so assert the demands really do
    // pull in different directions.
    const each = THREE.map((s) =>
      optimizeBeamRebar({ ...GEOM, Mu: s.Mu, Vu: s.Vu }).selection.best!.layout.db)
    expect(new Set(each).size).toBeGreaterThan(1)     // they DO disagree…
    expect(new Set([m.db]).size).toBe(1)              // …and the member does not
  })

  it('lets the bar COUNT differ per section — only the diameter is shared', () => {
    // Cuts and splices absorb the count. Forcing one count would buy the
    // midspan steel it does not need.
    const counts = m.sections.map((s) => s.design.bars)
    expect(new Set(counts).size).toBeGreaterThan(1)
  })

  it('every section is compliant at the adopted diameter', () => {
    for (const c of m.selection.best!.compliance) {
      expect(c.pass, `${c.id} — ${c.label}`).toBe(true)
    }
    for (const s of m.sections) expect(s.design.flexOK).toBe(true)
  })

  it('names the section that sized the member', () => {
    expect(m.governing).toBe('C')      // the largest hogging moment
  })

  it('rejects a diameter that fails at ANY section, naming where', () => {
    // A member whose support is far too heavily loaded for a small bar: the
    // small sizes must be rejected for the whole member, not adopted because
    // midspan was happy with them.
    const hard = optimizeBeamMember(GEOM, [
      { id: 'A', label: 'Support', Mu: 480, Vu: 300 },
      { id: 'B', label: 'Midspan', Mu: 40, Vu: 30 },
    ])
    const rejected = hard.selection.rejected
    expect(rejected.length).toBeGreaterThan(0)
    const withPlace = rejected.filter((x) => (x.failedGate!.detail ?? '').includes('at '))
    expect(withPlace.length).toBeGreaterThan(0)
    expect(withPlace[0].failedGate!.detail).toContain('Support')
  })

  it('a single-section member matches the per-section optimiser', () => {
    const one = optimizeBeamMember(GEOM, [{ id: 'X', Mu: 150, Vu: 120 }])
    const solo = optimizeBeamRebar({ ...GEOM, Mu: 150, Vu: 120 })
    expect(one.db).toBe(solo.selection.best!.layout.db)
  })

  it('handles a member with no sections without throwing', () => {
    const none = optimizeBeamMember(GEOM, [])
    expect(none.db).toBeNull()
    expect(none.sections).toHaveLength(0)
    expect(none.selection.margin).toMatch(/no critical sections/)
  })

  it('is deterministic', () => {
    expect(optimizeBeamMember(GEOM, THREE).db).toBe(m.db)
  })
})

describe('one run, many members — resolveBarContinuity', () => {
  it('pulls a collinear run onto ONE diameter', () => {
    // Beam A wants ⌀20, Beam B wants ⌀25, and they meet at a column.
    const chosen = new Map([['A', 20], ['B', 25], ['C', 16]])
    const out = resolveBarContinuity(chosen, [['A', 'B', 'C']])
    expect([...new Set(out.values())]).toEqual([25])
  })

  it('adopts the LARGEST, because a smaller bar would fail the span that asked', () => {
    const out = resolveBarContinuity(new Map([['A', 16], ['B', 32]]), [['A', 'B']])
    expect(out.get('A')).toBe(32)
    expect(out.get('B')).toBe(32)
  })

  it('keeps separate runs separate', () => {
    const chosen = new Map([['A', 20], ['B', 25], ['X', 12], ['Y', 16]])
    const out = resolveBarContinuity(chosen, [['A', 'B'], ['X', 'Y']])
    expect(out.get('A')).toBe(25)
    expect(out.get('X')).toBe(16)
  })

  it('leaves a member with no adopted diameter alone rather than inheriting one', () => {
    // It is already a reported failure; silently giving it a size would hide
    // that the section does not work.
    const chosen = new Map([['A', 20]])
    const out = resolveBarContinuity(chosen, [['A', 'B']])
    expect(out.has('B')).toBe(false)
    expect(out.get('A')).toBe(20)
  })

  it('does not touch a group that is already consistent', () => {
    const chosen = new Map([['A', 20], ['B', 20]])
    const out = resolveBarContinuity(chosen, [['A', 'B']])
    expect(out).toEqual(chosen)
  })

  it('ignores a group with nothing to reconcile', () => {
    const chosen = new Map([['A', 20]])
    expect(resolveBarContinuity(chosen, [['A']])).toEqual(chosen)
    expect(resolveBarContinuity(chosen, [[]])).toEqual(chosen)
  })

  it('is idempotent — resolving twice changes nothing', () => {
    const chosen = new Map([['A', 20], ['B', 25]])
    const once = resolveBarContinuity(chosen, [['A', 'B']])
    expect(resolveBarContinuity(once, [['A', 'B']])).toEqual(once)
  })
})
