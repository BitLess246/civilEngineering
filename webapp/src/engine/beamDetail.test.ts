import { describe, it, expect } from 'vitest'
import {
  buildBeamDetail, continuousTopSteel, barExtension, zoneSpacing, hoopPositions, wrapNote,
  FIRST_HOOP, HOOP_ZONE_DEPTHS, HOOK_END_COVER, EXTRA_TOP_FRACTION, EXTRA_BOTTOM_FRACTION,
} from './beamDetail'

const sections = [
  { label: 'LEFT', x: 0, hogging: true, bars: 4, stirrupSpacing: 100 },
  { label: 'MID', x: 3, hogging: false, bars: 5, stirrupSpacing: 200 },
  { label: 'RIGHT', x: 6, hogging: true, bars: 6, stirrupSpacing: 100 },
]
const b = { mark: 'B1', L: 6, b: 300, h: 500, barDia: 16, stirrupDia: 10, legs: 2, sections, colB: 400 }

/**
 * The real thing the pipeline hands this sheet for a lightly loaded beam: the
 * midspan section needs NO stirrups, so it reports a spacing of zero.
 */
const noMidStirrups = {
  ...b, mark: 'B2', b: 250, h: 300, barDia: 28,
  sections: [
    { label: 'End i', x: 0, hogging: true, bars: 2, stirrupSpacing: 110 },
    { label: 'End j', x: 6, hogging: true, bars: 2, stirrupSpacing: 110 },
    { label: 'Interior', x: 3, hogging: false, bars: 2, stirrupSpacing: 0 },
  ],
}

describe('continuous top steel — §409.7.7', () => {
  it('takes the greater of the two adjacent spans', () => {
    // A support is ONE piece of concrete with ONE set of top bars through it.
    expect(continuousTopSteel(4, 6)).toBe(6)
    expect(continuousTopSteel(6, 4)).toBe(6)
  })
  it('falls back to this span when there is no adjacent one (end support)', () => {
    expect(continuousTopSteel(4)).toBe(4)
    expect(continuousTopSteel(4, undefined)).toBe(4)
  })
})

describe('bar extension — §409.7.3.8.4', () => {
  it('is max(d, 12db), in metres', () => {
    expect(barExtension(440, 16)).toBeCloseTo(0.440, 9)   // d governs
    expect(barExtension(150, 25)).toBeCloseTo(0.300, 9)   // 12db governs
  })
})

describe('zoneSpacing — the bug this function exists to kill', () => {
  it('uses the designed spacing when the section has one', () => {
    expect(zoneSpacing(110, 300)).toBe(110)
    expect(zoneSpacing(200, 500)).toBe(200)
  })

  it('reads a ZERO as "none required", not as "as tight as possible"', () => {
    // The sheet used to clamp a zero with Math.max(s, 50), which drew 50 mm
    // hoops at midspan against 110 at the supports — the densest steel where
    // the shear is lowest. A zone with no designed stirrups gets the
    // §409.7.6.2.2 maximum instead: d/2, capped at 600.
    const s = zoneSpacing(0, 300, 40)                     // d ≈ 240 → 120
    expect(s).toBeCloseTo(120, 6)
    expect(s).toBeGreaterThan(50)
    expect(zoneSpacing(0, 1400, 40)).toBe(600)            // the 600 cap bites
  })
})

describe('hoopPositions — §418.6.4', () => {
  const L = 6, h = 0.5, face = 0.2

  it('puts the first hoop 50 mm off the support face at both ends', () => {
    const x = hoopPositions(L, h, 100, 200, face)
    expect(x[0]).toBeCloseTo(face + FIRST_HOOP / 1000, 9)
    expect(x[x.length - 1]).toBeCloseTo(L - face - FIRST_HOOP / 1000, 9)
  })

  it('spaces hoops CLOSER at the supports than at midspan', () => {
    const x = hoopPositions(L, h, 100, 200, face)
    const near = x.filter((v) => v < face + HOOP_ZONE_DEPTHS * h)
    const middle = x.filter((v) => v > L * 0.4 && v < L * 0.6)
    const gap = (a: number[]) => a.length < 2 ? Infinity
      : a.slice(1).reduce((m, v, k) => Math.min(m, v - a[k]), Infinity)
    expect(gap(near)).toBeLessThan(gap(middle))
    expect(gap(near)).toBeCloseTo(0.1, 6)
  })

  it('is symmetric about midspan', () => {
    const x = hoopPositions(L, h, 100, 200, face)
    const mirrored = x.map((v) => Math.round((L - v) * 1e6) / 1e6).sort((p, q) => p - q)
    expect(mirrored).toEqual(x)
  })

  it('survives a degenerate span', () => {
    expect(hoopPositions(0, 0.5, 100, 200)).toEqual([])
    expect(hoopPositions(6, 0.5, 0, 0).length).toBeGreaterThan(0)
  })
})

describe('wrapNote', () => {
  it('breaks on spaces and never exceeds the width', () => {
    const lines = wrapNote('TOP STEEL OVER A SUPPORT IS THE GREATER OF THE TWO ADJACENT SPANS', 20)
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(20)
    expect(lines.join(' ')).toBe('TOP STEEL OVER A SUPPORT IS THE GREATER OF THE TWO ADJACENT SPANS')
  })
})

const GLYPH = 0.63
const textsOf = (d: ReturnType<typeof buildBeamDetail>) =>
  d.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text)
/** Text primitives AND dimension labels — a dim is not a `text`. */
const allTextOf = (d: ReturnType<typeof buildBeamDetail>) =>
  d.primitives.filter((p) => p.kind === 'text' || p.kind === 'dim').map((p) => (p as { text: string }).text)
/** Vertical rebar lines — the hoops. */
const hoopsOf = (d: ReturnType<typeof buildBeamDetail>) =>
  (d.primitives.filter((p) => p.kind === 'line' && p.stroke === '#b45309'
    && Math.abs(p.x1 - p.x2) < 1e-9) as { x1: number }[]).map((l) => l.x1).sort((a, c) => a - c)
/** …only the ones in the SPAN. The joint hoops sit inside the columns, so a
 *  naive "first few hoops" window measures the gap across the support face. */
const spanHoopsOf = (d: ReturnType<typeof buildBeamDetail>, L: number, face: number) =>
  hoopsOf(d).filter((x) => x > face + 1e-9 && x < L - face - 1e-9)

describe('buildBeamDetail', () => {
  const d = buildBeamDetail(b, { detailNo: '1', sheetRef: 'S-07' })
  const texts = textsOf(d)
  const flat = allTextOf(d).join(' ').replace(/\s+/g, ' ')

  it('titles with the mark and section, and returns finite bounds', () => {
    expect(d.title).toBe('TYPICAL DETAIL OF CONTINUOUS BEAM — B1')
    expect(flat).toContain('B1 (300×500)')
    for (const v of Object.values(d.bounds)) expect(Number.isFinite(v)).toBe(true)
    expect(d.bounds.maxX).toBeGreaterThan(d.bounds.minX)
    expect(d.bounds.maxY).toBeGreaterThan(d.bounds.minY)
  })

  it('calls out continuous top and bottom steel and the extra bars at each support', () => {
    expect(flat).toContain('6-⌀16 TOP CONT.')        // the greater of the two supports
    expect(flat).toContain('4-⌀16 EXTRA')
    expect(flat).toContain('6-⌀16 EXTRA')
    expect(flat).toContain('5-⌀16 BOT. CONT. + EXTRA')
  })

  it('applies the continuity rule when an adjacent span is supplied', () => {
    const cont = buildBeamDetail({ ...b, adjacentTopLeft: 8 })
    expect(textsOf(cont).join(' ')).toContain('8-⌀16 EXTRA')
  })

  it('runs extra top bars 0.25L and starts extra bottom bars 0.15L off the support', () => {
    expect(EXTRA_TOP_FRACTION).toBe(0.25)
    expect(EXTRA_BOTTOM_FRACTION).toBe(0.15)
    expect(flat).toContain(`0.25L = ${Math.round(0.25 * b.L * 1000)}`)
    expect(flat).toContain('0.15L')
    // the extra bottom bar really does start 0.15L in and stop 0.15L short
    const bars = d.primitives.filter((p) => p.kind === 'line' && p.stroke === '#b45309'
      && Math.abs(p.y1 - p.y2) < 1e-9) as { x1: number; x2: number }[]
    const extra = bars.find((l) => Math.abs(l.x1 - 0.15 * b.L) < 1e-9)
    expect(extra).toBeDefined()
    expect(extra!.x2).toBeCloseTo(b.L - 0.15 * b.L, 9)
  })

  it('HOOPS ARE TIGHTEST AT THE SUPPORTS — including when midspan needs none', () => {
    // The defect this test exists for: the pipeline reports stirrupSpacing = 0
    // at a midspan section that needs no stirrups, and the sheet drew that as
    // 50 mm — denser than the 110 mm at the supports.
    for (const fixture of [b, noMidStirrups]) {
      const L = fixture.L, face = (fixture.colB ?? 400) / 2000
      const x = spanHoopsOf(buildBeamDetail(fixture), L, face)
      expect(x.length).toBeGreaterThan(6)
      const gapIn = (lo: number, hi: number) => {
        const w = x.filter((v) => v >= lo && v <= hi)
        return w.length < 2 ? Infinity : Math.min(...w.slice(1).map((v, k) => v - w[k]))
      }
      const gapNear = gapIn(face, face + 2 * (fixture.h / 1000))     // the 2h zone
      const gapMid = gapIn(L * 0.4, L * 0.6)
      expect(gapNear, `${fixture.mark}: support hoops must be tighter`).toBeLessThan(gapMid)
    }
    // and the fixture that started this: 110 at the supports, the §409.7.6.2.2
    // maximum (d/2 = 120) through the middle — never the old 50 mm floor
    const x2 = spanHoopsOf(buildBeamDetail(noMidStirrups), 6, 0.2)
    expect(Math.min(...x2.slice(1).map((v, k) => v - x2[k]))).toBeCloseTo(0.11, 6)
  })

  it('states the adopted spacings, and that the widest is where shear is lowest', () => {
    expect(flat).toContain('HOOPS @ 100')
    expect(flat).toContain('@ 200')
    expect(flat).toContain('§418.6.4.1')
    expect(flat).toContain('WIDEST WHERE THE SHEAR IS LOWEST')
    // the no-stirrup beam quotes the code maximum, not the drawing floor
    const bare = textsOf(buildBeamDetail(noMidStirrups)).join(' ')
    expect(bare).toContain('HOOPS @ 110')
    expect(bare).not.toContain('@ 50 ')
  })

  it('hooks the beam bars into an END support and runs them through a continuous one', () => {
    // Image-3 rule: at an end support the bars have nowhere to go, so they turn
    // down into the column with 60 mm clear to the end of the hook.
    const paths = (x: ReturnType<typeof buildBeamDetail>) => x.primitives.filter((p) => p.kind === 'path')
    expect(paths(d)).toHaveLength(2)                    // both ends are end supports
    expect(flat).toContain(`${HOOK_END_COVER} CL.`)

    const bothCont = buildBeamDetail({ ...b, continuousLeft: true, continuousRight: true })
    expect(paths(bothCont)).toHaveLength(0)             // nothing to hook
    expect(textsOf(bothCont).join(' ')).not.toContain('CL.')

    const oneEnd = buildBeamDetail({ ...b, continuousRight: true })
    expect(paths(oneEnd)).toHaveLength(1)
  })

  it('marks the 2h hoop zone and the 50 mm first hoop', () => {
    expect(flat).toContain(`2h = ${Math.round(HOOP_ZONE_DEPTHS * b.h)}`)
    expect(flat).toContain(`${FIRST_HOOP} FIRST HOOP`)
  })

  it('puts the title block BELOW the drawing and the notes', () => {
    // Y is negated at emit time, so "further down the sheet" is a LARGER y.
    const beamBottom = Math.max(...d.primitives
      .filter((p) => p.kind === 'rect')
      .map((p) => (p as { y: number; h: number }).y + (p as { y: number; h: number }).h))
    const titleText = d.primitives.find((p) => p.kind === 'text'
      && (p as { text: string }).text.startsWith('TYPICAL DETAIL')) as { y: number }
    const noteText = d.primitives.find((p) => p.kind === 'text'
      && (p as { text: string }).text.startsWith('TOP STEEL OVER')) as { y: number }
    expect(titleText.y).toBeGreaterThan(beamBottom)
    expect(titleText.y).toBeGreaterThan(noteText.y)
  })

  it('carries an AIA bubble — detail number over sheet reference — and a scale line', () => {
    expect(texts).toContain('1')
    expect(texts).toContain('S-07')
    expect(texts).toContain('SCALE')
    expect(texts).toContain('NTS')
    const bubble = d.primitives.find((p) => p.kind === 'circle') as { cx: number; cy: number; r: number }
    expect(bubble).toBeDefined()
    // the split line runs across the bubble, and the two labels straddle it
    const num = d.primitives.find((p) => p.kind === 'text' && (p as { text: string }).text === '1') as { y: number }
    const ref = d.primitives.find((p) => p.kind === 'text' && (p as { text: string }).text === 'S-07') as { y: number }
    expect(num.y).toBeLessThan(bubble.cy)               // above the split
    expect(ref.y).toBeGreaterThan(bubble.cy)            // below it
    expect(texts.indexOf('SCALE')).toBeGreaterThan(-1)
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

  it('survives a degenerate member without throwing', () => {
    const bare = buildBeamDetail({ ...b, L: 0, sections: [] })
    expect(bare.primitives.length).toBeGreaterThan(0)
    for (const v of Object.values(bare.bounds)) expect(Number.isFinite(v)).toBe(true)
  })
})
