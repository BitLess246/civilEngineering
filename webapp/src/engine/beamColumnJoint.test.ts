import { STEEL } from './sheetInk'
import { describe, it, expect } from 'vitest'
import {
  designBeamColumnJoint, buildBeamColumnJointDetail, effectiveJointWidth, jointHookLdh, wrapNote,
  JOINT_GAMMA, PHI_JOINT, THROUGH_BAR_DIAS, THROUGH_BAR_DIAS_LIGHTWEIGHT, PROBABLE_FY,
  JOINT_HOOP_SPACING_MAX, throughBarCheck, jointForces,
  type BeamColumnJointInput,
} from './beamColumnJoint'

/** Bar paths only. Leaders draw an arrowhead as a filled path in the annotation
 *  ink, so a bare `kind === 'path'` filter counts those as bars too. */
const REBAR_INK = STEEL

// ─────────────────────────────────────────────────────────────────────────
// WORKED EXAMPLE — the joint the model actually produces, and what it does
// and does NOT fail.
//
//   Column   400 × 400, ⌀20 verticals, ⌀10 hoops @ 100, cover 40
//   Beam     250 × 300 framing in one side, ⌀28 bars, 2 top / 2 bottom
//   Joint    confined on three faces, f'c 21 MPa, fy 415 MPa
//
// BY HAND
//
//   Effective width §418.8.4.3 / §415.4.2 — the least of
//     b + h  = 250 + 400 = 650
//     b + 2x = 250 + 2(200) = 650        (beam centred, x = colB/2)
//     colB   = 400                        ← governs
//   Aj = bj·h = 400 × 400 = 160 000 mm²
//
//   Strength §418.8.4.3, three faces → γ = 1.2
//     Vn  = 1.2 · 1.0 · √21 · 160 000 = 879 855 N = 879.85 kN
//     φVn = 0.85 · 879.85 = 747.87 kN            (φ = 0.85, §421.2.4.3)
//
//   Demand §418.8.2.1 — the BARS at 1.25fy, not the factored moment
//     As,top = 2 · π/4 · 28² = 1231.50 mm²
//     Vu = 1.25 · 415 · 1231.50 / 1000 = 638.84 kN  ≤ 747.87 ✓
//
//   §418.8.2.3 — NOT APPLICABLE. The rule is written "where longitudinal beam
//                reinforcement EXTENDS THROUGH a beam-column joint"; these ⌀28
//                bars terminate in the column with hooks, so they are governed
//                by §418.8.2.2 and §418.8.5 instead. Asking the 20db rule of a
//                terminated bar was this module's own bug, caught in review.
//   §418.8.5.1 — ℓdh = fy·db/(5.4λ√f'c) = 415(28)/(5.4·1.00·√21)
//                = 11620/24.746 = 469.6 mm
//                available inside the confined core, measured to the inside of
//                the far-face ⌀20 vertical the hook turns down behind:
//                400 − 40 cover − 10 hoop − 20 col bar = 330  ✗
//
// So ONE failure, not two: the ⌀28 bar cannot be ANCHORED in a 400 mm column.
// Whether it could pass through is a question nobody asked, because it does not.
// ─────────────────────────────────────────────────────────────────────────
const joint: BeamColumnJointInput = {
  mark: 'J1',
  colB: 400, colH: 400, colBarDia: 20, colBars: 8, hoopDia: 10, hoopSpacing: 100,
  beamB: 250, beamH: 300, beamBarDia: 28, topBars: 2, botBars: 2,
  confinement: 'three-faces', fc: 21, fy: 415, cover: 40,
  // exterior joint: the beam stops here, so its bars are hooked, not through
}
/** The same joint sized so it works: a 600 column and ⌀20 beam bars. */
const good: BeamColumnJointInput = {
  ...joint, mark: 'J2',
  colB: 600, colH: 600, beamB: 500, beamH: 500, beamBarDia: 20,
  topBars: 4, botBars: 3, interior: true, confinement: 'four-faces', wideBeams: true,
}

describe('effective joint width — §418.8.4.3 / §415.4.2', () => {
  it('takes the least of b+h, b+2x and the column width', () => {
    expect(effectiveJointWidth(250, 400, 400)).toBe(400)      // the column governs
    expect(effectiveJointWidth(250, 900, 300)).toBe(550)      // b + h governs
  })

  it('narrows for an ECCENTRIC beam — it cannot mobilise the far side', () => {
    // Beam pushed 150 mm off centre in a 600 column: x = 300 − 150 = 150,
    // so b + 2x = 200 + 300 = 500 rather than the full 600.
    expect(effectiveJointWidth(200, 600, 600, 0)).toBe(600)
    expect(effectiveJointWidth(200, 600, 600, 150)).toBe(500)
    expect(effectiveJointWidth(200, 600, 600, 300)).toBe(200)
  })
})

describe('hook development in a joint — §418.8.5.1', () => {
  it('is fy·db/(5.4λ√f′c), floored at 8db and 150 mm', () => {
    expect(jointHookLdh(28, 415, 21)).toBeCloseTo(469.57, 1)
    expect(jointHookLdh(20, 415, 21)).toBeCloseTo(335.41, 1)
    // a small bar in strong concrete hits the 8db floor
    expect(jointHookLdh(12, 275, 60)).toBe(150)
    expect(jointHookLdh(25, 275, 60)).toBe(8 * 25)
  })

  it('is SHORTER than the general §425.4.3 hook, because the core is confined', () => {
    // §425.4.3.1 gives 0.24·fy·db/√f'c for the same bar — 528 mm against 470.
    const general = (0.24 * 415 * 28) / Math.sqrt(21)
    expect(jointHookLdh(28, 415, 21)).toBeLessThan(general)
  })
})

describe('throughBarCheck — §418.8.2.3, asked of the right bars', () => {
  it('does not apply to bars that terminate, and cannot fail then', () => {
    const t = throughBarCheck(false, 28, 400)
    expect(t.applies).toBe(false)
    expect(t.ok).toBe(true)                      // "not this rule", not "fail"
  })

  it('applies to bars that pass through, at 20db', () => {
    const t = throughBarCheck(true, 28, 400)
    expect(t.applies).toBe(true)
    expect(t.required).toBe(560)
    expect(t.ok).toBe(false)
    expect(throughBarCheck(true, 20, 400).ok).toBe(true)
  })

  it('wants 26db in lightweight concrete', () => {
    expect(THROUGH_BAR_DIAS_LIGHTWEIGHT).toBe(26)
    expect(throughBarCheck(true, 20, 500, 0.75).required).toBe(520)
    expect(throughBarCheck(true, 20, 500, 0.75).ok).toBe(false)
    expect(throughBarCheck(true, 20, 500, 1.0).ok).toBe(true)
  })
})

describe('jointForces — the free body, not a single product', () => {
  it('is T + C − Vcol, with C only where a far beam delivers it', () => {
    const As = 1000, fy = 415
    const ext = jointForces(As, As, fy, false, 0)
    expect(ext.T).toBeCloseTo(1.25 * fy * As / 1000, 9)
    expect(ext.C).toBe(0)                        // no far beam at an exterior joint
    expect(ext.Vu).toBeCloseTo(ext.T, 9)

    const int = jointForces(As, As, fy, true, 0)
    expect(int.C).toBeCloseTo(int.T, 9)          // C = the far beam's own bar tension
    expect(int.Vu).toBeCloseTo(int.T + int.C, 9)

    const held = jointForces(As, As, fy, true, 200)
    expect(held.Vcol).toBe(200)
    expect(held.Vu).toBeCloseTo(int.Vu - 200, 9)
    expect(jointForces(As, As, fy, false, 1e6).Vu).toBe(0)
  })
})

describe('designBeamColumnJoint — the worked example', () => {
  const r = designBeamColumnJoint(joint)

  it('carries the Table 418.8.4.3 γ values', () => {
    expect(JOINT_GAMMA['four-faces']).toBe(1.7)
    expect(JOINT_GAMMA['three-faces']).toBe(1.2)
    expect(JOINT_GAMMA['two-opposite']).toBe(1.2)
    expect(JOINT_GAMMA.other).toBe(1.0)
    expect(PHI_JOINT).toBe(0.85)                 // NOT the 0.75 of member shear
  })

  it('sizes the joint area and its shear strength', () => {
    expect(r.bj).toBe(400)
    expect(r.Aj).toBe(160000)
    expect(r.gamma).toBe(1.2)
    expect(r.Vn).toBeCloseTo(879.85, 1)
    expect(r.phiVn).toBeCloseTo(747.87, 1)
  })

  it('takes the demand from the joint FREE BODY, with the bars at 1.25fy', () => {
    expect(PROBABLE_FY).toBe(1.25)
    // Vu is not "1.25fyAs" — that is only the T term of T + C − Vcol.
    expect(r.forces.T).toBeCloseTo(638.84, 1)
    expect(r.forces.C).toBe(0)                   // exterior joint: no far beam
    expect(r.forces.Vcol).toBe(0)
    expect(r.Vu).toBeCloseTo(r.forces.T + r.forces.C - r.forces.Vcol, 9)
    expect(r.shearOK).toBe(true)
  })

  it('adds both faces at an INTERIOR joint, and credits the column shear', () => {
    const inner = designBeamColumnJoint({ ...joint, interior: true })
    expect(inner.Vu).toBeCloseTo(2 * 638.84, 1)          // top + bottom both pull
    const relieved = designBeamColumnJoint({ ...joint, Vcol: 100 })
    expect(relieved.Vu).toBeCloseTo(638.84 - 100, 1)
    // …and the credit cannot drive the demand negative
    expect(designBeamColumnJoint({ ...joint, Vcol: 5000 }).Vu).toBe(0)
  })

  it('does NOT apply §418.8.2.3 to bars that TERMINATE in the joint', () => {
    // The correction. §418.8.2.3 is conditioned on reinforcement "extending
    // through" the joint — it is a bond/slip rule for a bar pulled one way on
    // one face and pushed the other way on the other. A ⌀28 bar hooked into the
    // column never does that, so 20db(28) = 560 > 400 is not a failure of this
    // joint; it is a rule asked of the wrong bar.
    expect(THROUGH_BAR_DIAS).toBe(20)
    expect(r.terminated).toBe(true)
    expect(r.through.main.applies).toBe(false)
    expect(r.through.main.ok).toBe(true)
    expect(r.notes.join(' ')).not.toContain('§418.8.2.3')
  })

  it('DOES apply it once the same bars pass through', () => {
    // Same column, same bar — now continuing through an interior joint.
    const through = designBeamColumnJoint({ ...joint, interior: true, barsThrough: true })
    expect(through.through.main.applies).toBe(true)
    expect(through.through.main.required).toBe(560)
    expect(through.through.main.provided).toBe(400)
    expect(through.through.main.ok).toBe(false)
    expect(through.notes.join(' ')).toContain('§418.8.2.3')
    expect(through.notes.join(' ')).toContain('pass THROUGH the joint')
  })

  it('measures the SPANDREL\'s through bars against the column WIDTH', () => {
    // The reviewer's sharper case: it is not the hooked ⌀28 that triggers the
    // rule, it is whatever actually passes through — and for a spandrel that is
    // the perpendicular dimension.
    const withSpandrel = designBeamColumnJoint({ ...joint, spandrelBarDia: 25, spandrelThrough: true })
    expect(withSpandrel.through.spandrel.applies).toBe(true)
    expect(withSpandrel.through.spandrel.required).toBe(500)     // 20 × 25
    expect(withSpandrel.through.spandrel.provided).toBe(joint.colB)
    expect(withSpandrel.through.spandrel.ok).toBe(false)
    expect(withSpandrel.notes.join(' ')).toContain('of column WIDTH parallel to them')
    // …and a ⌀16 spandrel bar passes in the same 400 mm column
    expect(designBeamColumnJoint({ ...joint, spandrelBarDia: 16, spandrelThrough: true })
      .through.spandrel.ok).toBe(true)
  })

  it('FAILS the hook fit — 470 mm of ℓdh in 330 mm of column', () => {
    expect(r.ldh).toBeCloseTo(469.57, 1)
    // the inputs the number came from travel with it, so a reader can check it
    expect(r.ldhInputs).toEqual({ db: 28, fy: 415, fc: 21, lambda: 1 })
    expect(r.ldhAvail).toBe(330)              // 400 − 40 cover − 10 hoop − 20 col bar
    expect(r.ldhFits).toBe(false)
    expect(r.hookTail).toBe(336)                          // 12db
    expect(r.notes.join(' ')).toContain('§418.8.5.1')
  })

  it('is not OK overall — for the anchorage, and only the anchorage', () => {
    expect(r.ok).toBe(false)
    expect(r.shearOK).toBe(true)
    expect(r.through.main.ok).toBe(true)
    expect(r.ldhFits).toBe(false)
  })
})

describe('ℓdh available — measured to the far-face column bar', () => {
  // A 250 × 250 column with ⌀10 lateral ties at 40 cover and ⌀16 verticals,
  // a 200 × 300 beam with ⌀16 mains hooked into it. The hook turns down BEHIND
  // the far vertical, so what it has to work with is
  //
  //   250 − 40 cover − 10 tie − 16 vertical = 184 mm
  //
  // and not the 200 mm that leaving the vertical out of the sum reports. The
  // difference is the whole bar diameter and it lands on `ldhFits`.
  const tight: BeamColumnJointInput = {
    colB: 250, colH: 250, colBarDia: 16, colBars: 4, hoopDia: 10, hoopSpacing: 100,
    beamB: 200, beamH: 300, beamBarDia: 16, topBars: 2, botBars: 2,
    fc: 20.7, fy: 414, cover: 40,
  }

  it('takes the column vertical off the available embedment', () => {
    const r = designBeamColumnJoint(tight)
    expect(r.ldhAvail).toBe(184)
    expect(r.terminated).toBe(true)
  })

  it('scales with the vertical, not just with the column', () => {
    // same column, ⌀25 verticals — 9 mm more bar is 9 mm less room for the hook
    expect(designBeamColumnJoint({ ...tight, colBarDia: 25 }).ldhAvail).toBe(175)
  })

  it('reports the shortfall the seismic hook leaves in that column', () => {
    const r = designBeamColumnJoint(tight)
    // §418.8.5.1  ℓdh = 414(16)/(5.4·1·√20.7) = 6624/24.569 = 269.6 mm,
    // over the 8db = 128 and 150 mm floors, so the formula governs.
    expect(r.ldh).toBeCloseTo(269.61, 1)
    expect(r.ldhFits).toBe(false)             // 269.6 > 184 — the bar cannot develop
    expect(r.notes.join(' ')).toContain('184 mm available')
  })

  it('never goes negative on a column smaller than its own cover', () => {
    expect(designBeamColumnJoint({ ...tight, colH: 60 }).ldhAvail).toBe(0)
  })
})

describe('designBeamColumnJoint — a joint that works', () => {
  const r = designBeamColumnJoint(good)

  it('passes every check once the column is big enough for the bar', () => {
    expect(r.through.main.applies).toBe(true)      // interior joint, bars through
    expect(r.through.main.required).toBe(400)      // 20 × ⌀20
    expect(r.through.main.ok).toBe(true)
    expect(r.ldhFits).toBe(true)
    expect(r.shearOK).toBe(true)
    expect(r.ok).toBe(true)
    expect(r.notes).toEqual([])
  })

  it('halves the joint hoops where four wide beams frame in — §418.8.3.2', () => {
    expect(r.halvedHoops).toBe(true)
    expect(r.jointHoopSpacing).toBe(Math.min(JOINT_HOOP_SPACING_MAX, 2 * 100))
    // …and does not, without the four faces
    const three = designBeamColumnJoint({ ...good, confinement: 'three-faces' })
    expect(three.halvedHoops).toBe(false)
    expect(three.jointHoopSpacing).toBe(100)
    const narrow = designBeamColumnJoint({ ...good, wideBeams: false })
    expect(narrow.halvedHoops).toBe(false)
  })

  it('fails on shear when the joint is unconfined and the beams are heavy', () => {
    const weak = designBeamColumnJoint({ ...good, confinement: 'other', topBars: 8, botBars: 8 })
    expect(weak.gamma).toBe(1.0)
    expect(weak.shearOK).toBe(false)
    expect(weak.notes.join(' ')).toContain('§418.8.4.3')
    expect(weak.notes.join(' ')).toContain('γ = 1.0')
  })
})

describe('wrapNote', () => {
  it('breaks on spaces and never exceeds the width', () => {
    const l = wrapNote('COLUMN CONFINEMENT HOOPS CONTINUE THROUGH THE JOINT', 18)
    for (const x of l) expect(x.length).toBeLessThanOrEqual(18)
    expect(l.join(' ')).toBe('COLUMN CONFINEMENT HOOPS CONTINUE THROUGH THE JOINT')
  })
})

const GLYPH = 0.63
const textOf = (d: ReturnType<typeof buildBeamColumnJointDetail>) =>
  d.primitives.filter((p) => p.kind === 'text' || p.kind === 'dim').map((p) => (p as { text: string }).text)

describe('buildBeamColumnJointDetail', () => {
  const d = buildBeamColumnJointDetail(joint, { detailNo: '1', sheetRef: 'S-10' })
  const flat = textOf(d).join(' ').replace(/\s+/g, ' ')

  it('titles and returns finite, ordered bounds', () => {
    expect(d.title).toBe('TYPICAL BEAM–COLUMN JOINT — J1')
    for (const v of Object.values(d.bounds)) expect(Number.isFinite(v)).toBe(true)
    expect(d.bounds.maxX).toBeGreaterThan(d.bounds.minX)
    expect(d.bounds.maxY).toBeGreaterThan(d.bounds.minY)
  })

  it('carries BOTH views, the plan below the section', () => {
    expect(flat).toContain('VERTICAL SECTION Y-Y')
    expect(flat).toContain('PLAN SECTION X-X')
    const yy = d.primitives.find((p) => p.kind === 'text' && (p as { text: string }).text === 'VERTICAL SECTION Y-Y') as { y: number }
    const xx = d.primitives.find((p) => p.kind === 'text' && (p as { text: string }).text === 'PLAN SECTION X-X') as { y: number }
    expect(xx.y).toBeGreaterThan(yy.y)                    // y runs DOWN the sheet
  })

  it('hooks the beam bars behind the far-face column bar, and SAYS the same number', () => {
    const paths = d.primitives.filter((p) => p.kind === 'path' && p.stroke === REBAR_INK) as { cmds: { x: number; y: number }[] }[]
    // two hooked bars in the elevation (top + bottom) and two runs in the plan
    expect(paths.length).toBe(4)
    const hooked = paths.filter((p) => p.cmds.length === 3)
    expect(hooked).toHaveLength(2)
    for (const p of hooked) {
      const [, b2, c] = p.cmds
      expect(Math.abs(c.x - b2.x)).toBeLessThan(1e-9)      // the tail turns square
      expect(Math.abs(c.y - b2.y)).toBeGreaterThan(0)
    }
    // The clear is cover + hoop + column bar = 40 + 10 + 20, NOT a nominal 60,
    // and NOT the cover-plus-60 (= 100) the sheet used to draw while annotating
    // it as 60 — the drawing and its own note disagreed by 40 mm.
    expect(d.result.ldhClear).toBe(70)
    expect(flat).toContain('70 CL. TO END OF HOOKS')
    expect(flat).toContain('70 CLEAR TO THE END OF THE HOOK')
    // and the drawn bend really is at that clear, measured from the far face
    const hookXs = hooked.map((p) => p.cmds[1].x).sort((a, b) => a - b)
    expect(hookXs[0]).toBeCloseTo(70 / 1000, 9)
    // the two hooks are separated by a bar Ø so they do not merge into what
    // reads as one closed loop where their 12db tails pass each other
    expect(hookXs[1] - hookXs[0]).toBeCloseTo(joint.beamBarDia / 1000, 9)
  })

  it('breaks the hoops behind the ℓdh dimension instead of printing over them', () => {
    // A white mask sits under the dimension: the line, its ticks and its label
    // used to overprint the very reinforcement the sheet is drawing.
    const masks = d.primitives.filter((p) => p.kind === 'rect' && p.fill === '#fff')
    expect(masks.length).toBeGreaterThan(0)
    const dim = d.primitives.find((p) => p.kind === 'dim'
      && (p as { text: string }).text.startsWith('ℓdh')) as { x1: number; x2: number; y1: number }
    const covers = masks.some((m) => {
      const r = m as { x: number; y: number; w: number; h: number }
      return r.x <= Math.min(dim.x1, dim.x2) && r.x + r.w >= Math.max(dim.x1, dim.x2)
        && r.y <= dim.y1 && r.y + r.h >= dim.y1
    })
    expect(covers).toBe(true)
  })

  it('draws THROUGH bars straight through, and drops the hook notes with them', () => {
    // A sheet must not carry a note about a detail it does not draw: the
    // through case has no hook, so no ℓdh dimension and no clear-to-hook callout.
    const t = buildBeamColumnJointDetail({ ...joint, interior: true, barsThrough: true }, { detailNo: '2' })
    const paths = t.primitives.filter((p) => p.kind === 'path' && p.stroke === REBAR_INK) as { cmds: { x: number; y: number }[] }[]
    expect(paths.length).toBe(4)
    for (const p of paths) expect(p.cmds).toHaveLength(2)      // straight, no turn
    const tf = textOf(t).join(' ').replace(/\s+/g, ' ')
    expect(tf).toContain('RUN CONTINUOUS THROUGH THE JOINT')
    expect(tf).not.toContain('CL. TO END OF HOOKS')
    expect(tf).not.toContain('TAIL 12db')
    expect(tf).not.toContain('ℓdh =')
    // …while the terminated sheet does carry all three
    expect(flat).toContain('70 CL. TO END OF HOOKS')
    expect(flat).toContain('TAIL 12db')
  })

  it('draws the column hoops continuing THROUGH the joint', () => {
    // Horizontal rebar lines inside the joint block (0 ≤ y ≤ beam depth).
    const bh = joint.beamH / 1000
    const inJoint = d.primitives.filter((p) => p.kind === 'line' && p.stroke === STEEL
      && Math.abs(p.y1 - p.y2) < 1e-9 && p.y1 > 0 && p.y1 < bh) as unknown[]
    expect(inJoint.length).toBeGreaterThan(0)
    expect(flat).toContain(`JOINT HOOPS ⌀10 @ ${d.result.jointHoopSpacing}`)
  })

  it('states the joint CHECKS to the engineer, and the placing on the sheet', () => {
    // Vu = T + C − Vcol, φVn and the Aj they were worked on are results. Where
    // they fail the answer is to enlarge the joint, which nobody tying steel
    // can do — so they travel beside the drawing, not on it.
    const dn = d.designNotes.join(' ')
    expect(dn).toContain('§418.8.4')
    expect(dn).toContain('§418.8.2.3')
    expect(dn).toContain('§418.8.5.1')
    expect(dn).toContain('not by §418.8.2.3')
    expect(d.result.ok).toBe(false)
    expect(d.designNotes.length).toBeGreaterThan(3)
    // the sheet says what to build, and points at the rules
    expect(flat).toContain('TERMINATE IN THE JOINT WITH STANDARD 90° HOOKS')
    expect(flat).toContain('REFER TO S-01')
    expect(flat).not.toContain('φVn')
  })

  it('drops the warnings when the joint works', () => {
    const ok = buildBeamColumnJointDetail(good, { detailNo: '2' })
    expect(ok.result.ok).toBe(true)
    const warn = ok.primitives.filter((p) => p.kind === 'text' && p.color === '#b91c1c')
    expect(warn).toHaveLength(0)
  })

  it('puts the title block below both views and the notes', () => {
    const titleText = d.primitives.find((p) => p.kind === 'text'
      && (p as { text: string }).text.startsWith('TYPICAL BEAM')) as { y: number }
    const planText = d.primitives.find((p) => p.kind === 'text'
      && (p as { text: string }).text === 'PLAN SECTION X-X') as { y: number }
    expect(titleText.y).toBeGreaterThan(planText.y)
    expect(textOf(d)).toContain('SCALE')
    expect(textOf(d)).toContain('NTS')
    expect(textOf(d)).toContain('S-10')
  })

  it('draws every primitive, text extents included, inside the sheet bounds', () => {
    for (const p of d.primitives) {
      let xs: number[] = [], ys: number[] = []
      if (p.kind === 'line' || p.kind === 'dim') { xs = [p.x1, p.x2]; ys = [p.y1, p.y2] }
      else if (p.kind === 'rect') { xs = [p.x, p.x + p.w]; ys = [p.y, p.y + p.h] }
      else if (p.kind === 'circle') { xs = [p.cx - p.r, p.cx + p.r]; ys = [p.cy - p.r, p.cy + p.r] }
      else if (p.kind === 'path') { xs = p.cmds.map((c) => c.x); ys = p.cmds.map((c) => c.y) }
      else if (p.kind === 'text') {
        const w = p.text.length * GLYPH * p.size
        const lead = p.anchor === 'middle' ? -w / 2 : p.anchor === 'end' ? -w : 0
        xs = [p.x + lead, p.x + lead + w]; ys = [p.y - p.size / 2, p.y + p.size / 2]
      }
      for (const x of xs) { expect(x).toBeGreaterThanOrEqual(d.bounds.minX - 1e-9); expect(x).toBeLessThanOrEqual(d.bounds.maxX + 1e-9) }
      for (const y of ys) { expect(y).toBeGreaterThanOrEqual(d.bounds.minY - 1e-9); expect(y).toBeLessThanOrEqual(d.bounds.maxY + 1e-9) }
    }
  })

  it('survives a degenerate joint without throwing', () => {
    const bare = buildBeamColumnJointDetail({
      colB: 0, colH: 0, colBarDia: 0, colBars: 0, hoopDia: 0, hoopSpacing: 0,
      beamB: 0, beamH: 0, beamBarDia: 0, topBars: 0, botBars: 0,
    })
    expect(bare.primitives.length).toBeGreaterThan(0)
    for (const v of Object.values(bare.bounds)) expect(Number.isFinite(v)).toBe(true)
  })
})
