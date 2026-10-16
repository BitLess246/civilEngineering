import { describe, it, expect } from 'vitest'
import { leader, leaderKnee, multiLeader } from './detailSheet'
import { SHEET_NOTE } from './sheetInk'
import type { PlanPrimitive } from './planRenderer'

// ─────────────────────────────────────────────────────────────────────────
// THE HOUSE LEADER — the one annotation shape every detail sheet uses.
//
// Its parts, in the order they are drawn: a filled arrowhead at the target, a
// single stroke running from the glyph beside the label, along the landing to
// the knee and on to the back of the arrowhead, and the label itself. The
// geometry is `leaderShape` (its own tests hold the ≥ 90° knee); these check
// that the sheet leader prints it.
// ─────────────────────────────────────────────────────────────────────────
const size = 0.1
const base = { text: 'CALLOUT', size }

/** The leader's one open stroke: glyph (0–5) → landing → knee (6) → back of the arrowhead (7). */
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

  it('is an arrowhead, ONE stroke ending in the glyph, and a label', () => {
    // The glyph closes the landing beside the label — up, across, down past
    // the landing and a short return — proportioned to the text, so the end
    // of a leader reads as its end.
    expect(ps.filter((p) => p.kind === 'path')).toHaveLength(2)
    expect(stroke(ps).cmds).toHaveLength(8)
    expect(head(ps).cmds).toHaveLength(3)
    expect(label(ps).text).toBe('CALLOUT')
  })

  it('draws landing and leg as one stroke, so the knee is a corner', () => {
    // Drawn as two primitives they met at the knee only as closely as two
    // round caps allow, and at print weight that shows as a nick.
    const c = stroke(ps).cmds
    expect(c[5]!.y).toBe(c[6]!.y)                    // the landing is level
    expect(c[6]!.y).not.toBe(c[7]!.y)                // and the leg leaves it
  })

  it('starts the landing clear of the label and ends it a knee away', () => {
    const c = stroke(ps).cmds
    expect(Math.abs(c[5]!.x - 0)).toBeGreaterThan(0)         // a gap (the glyph) from the anchor
    expect(Math.abs(c[6]!.x - 0)).toBeCloseTo(leaderKnee(size), 9)
  })

  it('stops the leg at the BACK of the arrowhead, not at the point', () => {
    const c = stroke(ps).cmds
    const tip = head(ps).cmds[0]!
    expect(tip.x).toBe(2)
    expect(tip.y).toBe(1)
    expect(Math.hypot(c[7]!.x - tip.x, c[7]!.y - tip.y)).toBeGreaterThan(0)
  })
})

describe('leader — the landing runs TOWARDS what it points at', () => {
  // It used to run to whichever side `side` named, even when the target was
  // the other way, so the leg left the knee, doubled back under the label and
  // crossed it on the way out. 24 of the 134 leaders in the sheet set were
  // drawn that way.
  const dir = (ps: PlanPrimitive[]) => {
    const c = stroke(ps).cmds
    return Math.sign(c[6]!.x - c[5]!.x)
  }

  it('ignores a side that would send the landing away from the target', () => {
    for (const side of ['left', 'right'] as const) {
      expect(dir(leader({ ...base, x: 3, y: 1, tx: 0, ty: 0, side }))).toBe(1)
      expect(dir(leader({ ...base, x: -3, y: 1, tx: 0, ty: 0, side }))).toBe(-1)
    }
  })

  it('never folds the leg back: the angle between leg and landing is at least 90°', () => {
    // A target nearly straight below the label used to send the leg back
    // UNDER its own landing — an acute knee. The knee now stops at the target
    // (the leg drops square) and a target too nearly under its label slides
    // the label along its line until it can.
    for (const x of [-4, -1, -0.05, 0, 0.05, 1, 4]) for (const y of [-2, 1, 3]) {
      const c = stroke(leader({ ...base, x, y, tx: 0, ty: 0 })).cmds
      const land = { x: c[5]!.x - c[6]!.x, y: c[5]!.y - c[6]!.y }
      const leg = { x: c[7]!.x - c[6]!.x, y: c[7]!.y - c[6]!.y }
      expect(land.x * leg.x + land.y * leg.y, `target (${x}, ${y})`).toBeLessThanOrEqual(1e-12)
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
    const dirs = arms.map((a) => Math.sign(a.cmds[6]!.x - a.cmds[5]!.x))
    expect(dirs.sort()).toEqual([-1, 1])
    // one label, not two
    expect(ps.filter((p) => p.kind === 'text')).toHaveLength(1)
  })
})
