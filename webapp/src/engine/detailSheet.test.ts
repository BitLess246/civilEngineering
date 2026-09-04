import { describe, it, expect } from 'vitest'
import { leader, leaderKnee, multiLeader } from './detailSheet'
import { SHEET_NOTE } from './sheetInk'
import type { PlanPrimitive } from './planRenderer'

// ─────────────────────────────────────────────────────────────────────────
// THE HOUSE LEADER — the one annotation shape every detail sheet uses.
//
// Its parts, in the order they are drawn: a filled arrowhead at the target, a
// single stroke running from a gap beside the label out to the knee and on to
// the back of the arrowhead, and the label itself.
// ─────────────────────────────────────────────────────────────────────────
const size = 0.1
const base = { text: 'CALLOUT', size }

/** The leader's one open stroke: label gap → knee → back of the arrowhead. */
const stroke = (ps: PlanPrimitive[]) =>
  ps.find((p): p is Extract<PlanPrimitive, { kind: 'path' }> =>
    p.kind === 'path' && p.fill === 'none' && p.stroke === SHEET_NOTE)!
const head = (ps: PlanPrimitive[]) =>
  ps.find((p): p is Extract<PlanPrimitive, { kind: 'path' }> =>
    p.kind === 'path' && p.closed === true)!
const label = (ps: PlanPrimitive[]) =>
  ps.find((p): p is Extract<PlanPrimitive, { kind: 'text' }> => p.kind === 'text')!

describe('leader — the parts it is made of', () => {
  const ps = leader({ ...base, x: 2, y: 1, tx: 0, ty: 0 })

  it('is an arrowhead, ONE stroke and a label — and no glyph', () => {
    // The landing used to end on a glyph: a stroke that ran up, across, down,
    // across and part-way back up, meant to separate the leader from its
    // label. At sheet scale it printed as a small closed tick that reads as
    // neither text nor steel. A gap does that job.
    expect(ps.filter((p) => p.kind === 'path')).toHaveLength(2)
    expect(stroke(ps).cmds).toHaveLength(3)
    expect(head(ps).cmds).toHaveLength(3)
    expect(label(ps).text).toBe('CALLOUT')
  })

  it('draws landing and leg as one stroke, so the knee is a corner', () => {
    // Drawn as two primitives they met at the knee only as closely as two
    // round caps allow, and at print weight that shows as a nick.
    const c = stroke(ps).cmds
    expect(c[0]!.y).toBe(c[1]!.y)                    // the landing is level
    expect(c[1]!.y).not.toBe(c[2]!.y)                // and the leg leaves it
  })

  it('starts the landing clear of the label and ends it a knee away', () => {
    const c = stroke(ps).cmds
    expect(Math.abs(c[0]!.x - 0)).toBeGreaterThan(0)         // a gap from the anchor
    expect(Math.abs(c[1]!.x - 0)).toBeCloseTo(leaderKnee(size), 9)
  })

  it('stops the leg at the BACK of the arrowhead, not at the point', () => {
    const c = stroke(ps).cmds
    const tip = head(ps).cmds[0]!
    expect(tip.x).toBe(2)
    expect(tip.y).toBe(1)
    expect(Math.hypot(c[2]!.x - tip.x, c[2]!.y - tip.y)).toBeGreaterThan(0)
  })
})

describe('leader — the landing runs TOWARDS what it points at', () => {
  // It used to run to whichever side `side` named, even when the target was
  // the other way, so the leg left the knee, doubled back under the label and
  // crossed it on the way out. 24 of the 134 leaders in the sheet set were
  // drawn that way.
  const dir = (ps: PlanPrimitive[]) => {
    const c = stroke(ps).cmds
    return Math.sign(c[1]!.x - c[0]!.x)
  }

  it('ignores a side that would send the landing away from the target', () => {
    for (const side of ['left', 'right'] as const) {
      expect(dir(leader({ ...base, x: 3, y: 1, tx: 0, ty: 0, side }))).toBe(1)
      expect(dir(leader({ ...base, x: -3, y: 1, tx: 0, ty: 0, side }))).toBe(-1)
    }
  })

  it('never lets the leg run back INTO the label', () => {
    // The text sits on the far side of the anchor from the landing, so the leg
    // reaching past the anchor is the leg crossing the words. A target nearly
    // straight below the label may still slope back UNDER the landing — that
    // is a leader, not a defect; what it may not do is reach the text.
    for (const x of [-4, -1, -0.05, 0, 0.05, 1, 4]) {
      const c = stroke(leader({ ...base, x, y: 1, tx: 0, ty: 0 })).cmds
      const s = Math.sign(c[1]!.x - c[0]!.x) || 1        // out towards the target
      const intoText = Math.sign(c[2]!.x - 0) === -s && Math.abs(c[2]!.x) > 1e-9
      expect(intoText, `target at x = ${x}`).toBe(false)
    }
  })

  it('honours the side asked for when the target is under the label', () => {
    // Straight below, either side is a real choice and the caller's is kept.
    expect(dir(leader({ ...base, x: 0, y: 2, tx: 0, ty: 0, side: 'left' }))).toBe(-1)
    expect(dir(leader({ ...base, x: 0, y: 2, tx: 0, ty: 0, side: 'right' }))).toBe(1)
  })

  it('anchors the label away from the landing, on either side', () => {
    expect(label(leader({ ...base, x: 3, y: 0, tx: 0, ty: 0 })).anchor).toBe('end')
    expect(label(leader({ ...base, x: -3, y: 0, tx: 0, ty: 0 })).anchor).toBe('start')
  })
})

describe('multiLeader — one label, an arm to each thing it names', () => {
  const ps = multiLeader({
    targets: [{ x: -3, y: 1 }, { x: 3, y: 1 }], tx: 0, ty: 0, text: 'BOTH', size,
  })

  it('sends each arm out of the edge nearest its own target', () => {
    const arms = ps.filter((p): p is Extract<PlanPrimitive, { kind: 'path' }> =>
      p.kind === 'path' && p.fill === 'none' && p.stroke === SHEET_NOTE)
    expect(arms).toHaveLength(2)
    const dirs = arms.map((a) => Math.sign(a.cmds[1]!.x - a.cmds[0]!.x))
    expect(dirs.sort()).toEqual([-1, 1])
    // one label, not two
    expect(ps.filter((p) => p.kind === 'text')).toHaveLength(1)
  })
})
