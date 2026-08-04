import { describe, it, expect } from 'vitest'
import { sectionFrame, fillRatio, DRAW, MARGIN, MIN_DRAW_W } from './sectionLayout'

/** What the old fixed frame did, for comparison. 340×285 outer, 210×200 inner. */
const OLD = (bf: number, h: number) => {
  const s = Math.min(210 / bf, 200 / h)
  return { w: bf * s, ht: h * s, W: 340, HT: 285 }
}
const oldFill = (bf: number, h: number) => {
  const o = OLD(bf, h)
  return (o.w * o.ht) / (o.W * o.HT)
}

// Real sections, not invented ones: the page's own defaults, a slab-and-joist
// flange, and a deep narrow beam.
const CASES: [string, number, number][] = [
  ['page default', 1800, 600],
  ['wide flange', 2400, 500],
  ['modest flange', 900, 550],
  ['deep, narrow flange', 500, 900],
  ['nearly square', 600, 600],
]

describe('sectionFrame', () => {
  it.each(CASES)('%s: uses more of the frame than the old fixed one', (_n, bf, h) => {
    const f = sectionFrame(bf, h, 4)
    expect(fillRatio(f)).toBeGreaterThan(oldFill(bf, h))
  })

  it.each(CASES)('%s: fills the drawing area on its limiting axis', (_n, bf, h) => {
    // THE invariant, and a better statement than any ratio. The section is
    // scaled until it hits one edge of the drawing area; the frame is then that
    // section plus fixed margins, and nothing else. So there is no dead space
    // anywhere except the margins that carry the dimension lines.
    //
    // A ratio would have been a statement about those margins instead: a
    // 2400×500 flange draws 54 units tall, so the 94 units of top-and-bottom
    // margin dominate its area no matter how well the drawing is placed.
    const f = sectionFrame(bf, h, 4)
    const atWidth = Math.abs(f.w - DRAW.width) < 1e-9
    const atHeight = Math.abs(f.ht - DRAW.height) < 1e-9
    expect(atWidth || atHeight).toBe(true)
  })

  it('draws a wide section at the full drawing width', () => {
    // 1800×600 is width-limited, so it should use every unit of DRAW.width.
    const f = sectionFrame(1800, 600, 4)
    expect(f.w).toBeCloseTo(DRAW.width, 6)
    expect(f.W).toBeCloseTo(MARGIN.left + DRAW.width + MARGIN.right, 6)
  })

  it('caps the height rather than letting a deep beam run off', () => {
    const f = sectionFrame(400, 3000, 4)
    expect(f.ht).toBeLessThanOrEqual(DRAW.height + 1e-9)
  })

  it('shrinks the frame around a narrow section instead of padding it', () => {
    // The old failure rotated 90°: a narrow section floating in side margins.
    const narrow = sectionFrame(300, 900, 4)
    const wide = sectionFrame(2400, 500, 4)
    expect(narrow.W).toBeLessThan(wide.W)
  })

  it('never goes narrower than the bw label needs', () => {
    const f = sectionFrame(50, 900, 4)
    expect(f.W).toBeGreaterThanOrEqual(MARGIN.left + MIN_DRAW_W + MARGIN.right)
    // …and the section stays centred in whatever floor was applied.
    expect(f.x0 + f.w / 2).toBeCloseTo(MARGIN.left + MIN_DRAW_W / 2, 6)
  })

  it('gives the bar callout its own room, and takes it back when there is none', () => {
    const withBars = sectionFrame(1800, 600, 4)
    const without = sectionFrame(1800, 600, 0)
    expect(withBars.HT - without.HT).toBe(MARGIN.bottomWithBars - MARGIN.bottom)
  })

  it('keeps the frame aspect close to the section aspect', () => {
    // The old frame was 340×285 (1.19) whatever the beam looked like. This is
    // the property that killed the dead band: the frame now follows the shape.
    for (const [, bf, h] of CASES) {
      const f = sectionFrame(bf, h, 4)
      const section = f.w / f.ht, frame = f.W / f.HT
      expect(frame / section).toBeGreaterThan(0.35)
      expect(frame / section).toBeLessThan(3.2)
    }
  })

  it('scales uniformly — a section is never stretched', () => {
    const f = sectionFrame(1800, 600, 4)
    expect(f.w / 1800).toBeCloseTo(f.scale, 12)
    expect(f.ht / 600).toBeCloseTo(f.scale, 12)
  })
})
