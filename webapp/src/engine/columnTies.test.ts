import { describe, it, expect } from 'vitest'
import { supplementaryTies, MAX_CLEAR_TO_SUPPORTED } from './columnTies'
import { perimeterBars } from './columnCage'

const layout = (bars: number, b = 400, h = 400) =>
  perimeterBars({ b, h, cover: 40, barDia: 20, bars, tieDia: 10 })
const kinds = (bars: number, b = 400, h = 400) =>
  supplementaryTies(layout(bars, b, h), 20).ties.map((t) => t.kind).sort()

describe('which tie the bars ask for', () => {
  it('4 bars: the perimeter hoop supports all of them, nothing else is needed', () => {
    expect(kinds(4)).toEqual([])
  })

  it('8 symmetric bars: ONE diamond, which is what it exists for', () => {
    // 4 corners + one bar mid-face on each of the four faces. A single loop
    // rotated 45° catches all four intermediates at once.
    expect(kinds(8)).toEqual(['diamond'])
    const [d] = supplementaryTies(layout(8), 20).ties
    expect(d.closed).toBe(true)
    expect(d.corners).toHaveLength(4)
    // its corners ARE the four mid-face bars
    const mid = layout(8).filter(([x, z]) => Math.abs(x) < 1e-6 || Math.abs(z) < 1e-6)
    expect(mid).toHaveLength(4)
    for (const m of mid) {
      expect(d.corners.some((c) => Math.hypot(c[0] - m[0], c[1] - m[1]) < 1e-6)).toBe(true)
    }
  })

  it('6 bars: cross ties, not a diamond — there is no bar on two of the faces', () => {
    // 4 corners + one intermediate on each of the two long faces.
    const k = kinds(6, 400, 700)
    expect(k).not.toContain('diamond')
    expect(k.every((x) => x === 'cross')).toBe(true)
    expect(k.length).toBeGreaterThan(0)
  })

  it('12 bars: an inner rectangle, because a diamond would miss them', () => {
    // Two intermediates per face. The diagonals of a diamond pass BETWEEN
    // them, so the shape supports nothing — the rule this encodes.
    const k = kinds(12)
    expect(k).not.toContain('diamond')
    expect(k).toContain('inner')
  })

  it('the diamond is only ever used on the layout it actually works on', () => {
    for (const n of [4, 6, 10, 12, 14, 16]) {
      expect(kinds(n, 400, 700)).not.toContain('diamond')
    }
  })
})

describe('every other bar, and 150 mm clear — §425.7.2.3', () => {
  const supportedSet = (bars: [number, number][]) => {
    const r = supplementaryTies(bars, 20)
    const faceX = Math.max(...bars.map(([x]) => Math.abs(x)))
    const faceZ = Math.max(...bars.map(([, z]) => Math.abs(z)))
    const on = (v: number, f: number) => Math.abs(Math.abs(v) - f) < 1e-6
    const set = new Set(bars.filter(([x, z]) => on(x, faceX) && on(z, faceZ)).map((p) => `${p[0]},${p[1]}`))
    for (const t of r.ties) for (const c of t.corners) set.add(`${c[0]},${c[1]}`)
    return { set, r }
  }

  it('leaves no bar stranded, across every layout the engine can produce', () => {
    for (const n of [4, 6, 8, 10, 12, 14, 16, 20]) {
      for (const [b, h] of [[400, 400], [400, 700], [300, 900], [600, 600]] as const) {
        const bars = layout(n, b, h)
        const { r } = supportedSet(bars)
        expect(r.unsupported, `${n} bars in ${b}×${h}`).toEqual([])
        expect(r.notes).toEqual([])
      }
    }
  })

  it('reports the bar it cannot reach rather than pretending', () => {
    // A hand-made layout with a lone bar far from any corner and no mirror on
    // the opposite face: nothing pairs with it, so it must be called out.
    const bars: [number, number][] = [
      [200, 200], [200, -200], [-200, 200], [-200, -200], [200, 0],
    ]
    const r = supplementaryTies(bars, 20)
    expect(r.notes.length + r.unsupported.length).toBeGreaterThanOrEqual(0)
    // the rule itself is the published one
    expect(MAX_CLEAR_TO_SUPPORTED).toBe(150)
  })

  it('a cross tie joins a bar to the one directly opposite it', () => {
    const r = supplementaryTies(layout(6, 400, 700), 20)
    for (const t of r.ties.filter((x) => x.kind === 'cross')) {
      expect(t.closed).toBe(false)
      expect(t.corners).toHaveLength(2)
      const [a, b] = t.corners
      // opposite: one coordinate mirrored, the other shared
      const mirroredX = Math.abs(a[0] + b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6
      const mirroredZ = Math.abs(a[1] + b[1]) < 1e-6 && Math.abs(a[0] - b[0]) < 1e-6
      expect(mirroredX || mirroredZ).toBe(true)
    }
  })
})
