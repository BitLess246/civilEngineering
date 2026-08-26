import { describe, it, expect } from 'vitest'
import { endAnchors, hasRoom, type AnchorBar, type JointRoom } from './beamAnchorage'

/** A 500 deep beam, ⌀20 bars, 40 cover, ⌀10 stirrups → inset 60 mm. */
const tail = (12 * 20) / 1000                 // ℓext = 12·db
const bar = (role: 'top' | 'bottom', y: number, v: number): AnchorBar =>
  ({ role, y, v, dia: 20, tail })

/** `yTop` / `yBot` are the COVER LINE, 40 mm inside each face. */
const room = (over: Partial<JointRoom> = {}): JointRoom => ({
  above: true, below: true, yTop: 0.46, yBot: 0.04, face: 0.12, ...over,
})

describe('which way a beam bar turns where it stops', () => {
  const bars = [bar('top', 0.44, -0.09), bar('bottom', 0.06, -0.09)]

  it('turns each bar into the core by preference — top down, bottom up', () => {
    const [t, b] = endAnchors(bars, room())
    expect(t.dir).toBe('down')
    expect(b.dir).toBe('up')
  })

  it('staggers the two legs by a diameter, clash or not', () => {
    // Given the same embedment both legs stand on one line and their tails run
    // at each other. The stagger is the detail, not a repair, so it applies
    // whether or not this particular depth happens to make them touch.
    const [t, b] = endAnchors(bars, room())
    expect(t.u).toBeCloseTo(0.12, 9)              // the top bar holds the far face
    expect(t.u - b.u).toBeGreaterThanOrEqual(0.02 - 1e-9)   // …by one Ø
  })

  it('leaves bars in DIFFERENT lanes both at the far face', () => {
    // Nothing to pass, so nothing to give up: §418.8.4.1 gets its full
    // embedment on both.
    const [t, b] = endAnchors([bar('top', 0.44, -0.09), bar('bottom', 0.06, 0.09)], room())
    expect(t.u).toBeCloseTo(0.12, 9)
    expect(b.u).toBeCloseTo(0.12, 9)
  })

  it('will not turn a tail up out of a joint with no column above it', () => {
    // The roof case. A 300 deep beam's bottom bar turned up runs past the top
    // of the beam, and there is nothing above to be embedded in.
    const shallow = [bar('top', 0.24, -0.09), bar('bottom', 0.06, -0.09)]
    const r = room({ above: false, yTop: 0.26 })
    expect(hasRoom(shallow[1], 'up', r)).toBe(false)
    const [, b] = endAnchors(shallow, r)
    expect(b.dir).toBe('down')
    expect(b.note).toMatch(/not supported by concrete/)
  })

  it('…but allows it where the tail stays inside the beam anyway', () => {
    const r = room({ above: false })
    expect(hasRoom(bar('bottom', 0.06, 0), 'up', r)).toBe(true)   // 0.06 + 0.24 ≤ 0.46
    expect(endAnchors(bars, r)[1].dir).toBe('up')
  })

  it('turns the other way when the preferred way is blocked by another bar', () => {
    // A 350 deep beam: the bottom bar turned up reaches 0.30 and crosses the
    // top steel running at 0.29.
    const shallow = [bar('top', 0.29, -0.09), bar('bottom', 0.06, -0.09)]
    const [, b] = endAnchors(shallow, room({ yTop: 0.31 }))
    expect(b.dir).toBe('down')
    expect(b.note).toMatch(/blocked by another bar/)
  })

  it('turns sideways into a transverse beam when neither vertical is available', () => {
    const shallow = [bar('top', 0.24, -0.09), bar('bottom', 0.06, -0.09)]
    const r = room({ above: false, below: false, yTop: 0.26, yBot: 0.04, side: 1 })
    const out = endAnchors(shallow, r)
    expect(out.every((a) => a.dir === 'side')).toBe(true)
    expect(out[0].note).toMatch(/turned side/)
  })

  it('says so rather than hooking into air when there is nothing at all', () => {
    const shallow = [bar('top', 0.24, -0.09), bar('bottom', 0.06, -0.09)]
    const out = endAnchors(shallow, room({ above: false, below: false, yTop: 0.26, yBot: 0.04 }))
    for (const a of out) expect(a.note).toMatch(/no concrete to hook into/)
  })

  it('never draws two tails through each other', () => {
    // The whole point: sweep depth and bar size and check the result, rather
    // than trusting the rule that produced the clash in the first place.
    for (const h of [0.3, 0.35, 0.4, 0.5, 0.6, 0.75]) {
      for (const dia of [16, 20, 25, 32]) {
        const t = (12 * dia) / 1000
        const inset = (40 + 10 + dia / 2) / 1000
        const bs: AnchorBar[] = [
          { role: 'top', y: h - inset, v: -0.09, dia, tail: t },
          { role: 'bottom', y: inset, v: -0.09, dia, tail: t },
        ]
        const out = endAnchors(bs, room({ yTop: h - 0.04, yBot: 0.04, face: 0.12 }))
        const seg = out.map((a, k) => {
          const b = bs[k]
          const lo = a.dir === 'down' ? b.y - b.tail : b.y
          const hi = a.dir === 'up' ? b.y + b.tail : b.y
          return { u: a.u, lo, hi, v: a.dir === 'side' ? b.v + b.tail : b.v }
        })
        const clear = Math.abs(seg[0].u - seg[1].u) >= dia / 1000 - 1e-9
          || Math.abs(seg[0].v - seg[1].v) >= dia / 1000 - 1e-9
          || !(seg[0].lo < seg[1].hi - 1e-9 && seg[1].lo < seg[0].hi - 1e-9)
        expect(clear, `h=${h} ⌀${dia}`).toBe(true)
      }
    }
  })
})
