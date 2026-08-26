import { describe, it, expect } from 'vitest'
import type { PlanPrimitive } from './planRenderer'
import { buildBeamCage } from './beamCage'
import { STEEL_LIGHT, STEEL_CONTEXT } from './sheetInk'
import {
  buildBeamDetail, continuousTopSteel, barExtension, zoneSpacing, hoopPositions, wrapNote,
  FIRST_HOOP, HOOP_ZONE_DEPTHS, HOOK_END_COVER, EXTRA_TOP_FRACTION, EXTRA_BOTTOM_FRACTION,
  endHookAnchorage, crankBars, hook90, hookBendDiameter, HOOK_TAIL_DB, REBAR_INK,
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

/**
 * The cranked bars, found by SHAPE rather than by ink.
 *
 * All reinforcement is one accent now — a cranked bar is the same bar, not a
 * different kind of steel — so a filter on colour would catch the hooks too.
 * A crank is straight segments only; a hook ends in an arc.
 */
const crankedPaths = (d: { primitives: PlanPrimitive[] }) =>
  d.primitives
    .filter((p): p is Extract<PlanPrimitive, { kind: 'path' }> =>
      p.kind === 'path' && p.stroke === REBAR_INK)
    .filter((p) => p.cmds.length >= 3 && p.cmds.every((c) => c.c === 'M' || c.c === 'L'))


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
/** Vertical hoop lines. Hoops carry their own ink so they sit behind the
 *  longitudinal steel — matching on the bar ink now finds nothing. */
const HOOP_INK = STEEL_LIGHT
const hoopsOf = (d: ReturnType<typeof buildBeamDetail>) =>
  (d.primitives.filter((p) => p.kind === 'line' && p.stroke === HOOP_INK
    && Math.abs(p.x1 - p.x2) < 1e-9) as { x1: number }[]).map((l) => l.x1).sort((a, c) => a - c)
/** …only the ones in the SPAN. The joint hoops sit inside the columns, so a
 *  naive "first few hoops" window measures the gap across the support face. */
/** Leader arrowheads: a closed, filled three-point path. */
const arrowheadsOf = (d: { primitives: PlanPrimitive[] }) =>
  d.primitives.filter((p) => p.kind === 'path' && p.closed === true && p.cmds.length === 3).length

const spanHoopsOf = (d: ReturnType<typeof buildBeamDetail>, L: number, face: number) =>
  hoopsOf(d).filter((x) => x > face + 1e-9 && x < L - face - 1e-9)

describe('hook90 — NSCP Table 425.3.1 standard hook', () => {
  it('bends 6db up to ⌀25 and 8db above, 10db past ⌀36', () => {
    expect(hookBendDiameter(16)).toBe(96)          // 6 x 16
    expect(hookBendDiameter(25)).toBe(150)         // 6 x 25, still the smaller rule
    expect(hookBendDiameter(28)).toBe(224)         // 8 x 28
    expect(hookBendDiameter(36)).toBe(288)
    expect(hookBendDiameter(43)).toBe(430)         // 10 x 43
  })

  it('carries a 12db tail and a centreline radius of (D + db)/2', () => {
    const h = hook90(20)
    expect(HOOK_TAIL_DB).toBe(12)
    expect(h.bendDia).toBe(120)                    // 6 x 20
    expect(h.ext).toBe(240)                        // 12 x 20
    expect(h.radius).toBe(70)                      // 120/2 + 20/2
    expect(h.depth).toBe(310)                      // radius + tail
  })

  it('a ⌀28 hook is deeper than the 12db a corner-drawn hook implies', () => {
    // The sheet drew a square corner and dimensioned the tail alone, so a ⌀28
    // hook read as 336 deep. The 8db bend adds another 126 before the tail
    // even starts.
    const h = hook90(28)
    expect(h.ext).toBe(336)
    expect(h.radius).toBe(126)                     // (224 + 28)/2
    expect(h.depth).toBe(462)
    expect(h.depth / h.ext).toBeCloseTo(1.375, 3)  // 37.5% more than the tail alone
  })

  it('measures ℓdh to the OUTSIDE of the turned-down leg (§425.4.3)', () => {
    // outside = centreline radius + half a bar: the far face of the bend, which
    // is the face the code dimensions to, not the bar centreline.
    const h = hook90(20)
    expect(h.outside).toBe(80)                     // 70 + 10
  })
})

describe('crankBars — cranked bar ends', () => {
  const base = {
    L: 6, h: 450, cover: 40, stirrupDia: 10, barDia: 20, colB: 400,
    topRun: 1.5, botStart: 0.9,
  }

  it('sizes the crank off the member and turns it at 45°', () => {
    const c = crankBars(base)
    expect(c.angleDeg).toBe(45)
    expect(c.rise).toBeCloseTo(0.33 * 450, 6)               // 148.5, under the 0.05L cap
    expect(c.run).toBeCloseTo(c.rise, 6)                    // 45° -> run equals rise
    expect(c.inclined).toBeCloseTo(Math.hypot(c.rise, c.run), 9)
  })

  it('caps the crank on a short span so it cannot eat the run it sits in', () => {
    // 0.05L governs below about a 6.7 m span for this depth.
    const c = crankBars({ ...base, L: 2, topRun: 0.5, botStart: 0.3 })
    expect(c.rise).toBeCloseTo(0.05 * 2000, 6)              // 100, not 148.5
  })

  it('cranks the extra TOP bar DOWN where it stops, continuing its direction', () => {
    const c = crankBars(base)
    const d = c.run / 1000
    expect(c.top[0].at).toBeCloseTo(1.5, 9)
    expect(c.top[0].tip).toBeCloseTo(1.5 + d, 9)            // left bar runs right
    expect(c.top[1].at).toBeCloseTo(4.5, 9)
    expect(c.top[1].tip).toBeCloseTo(4.5 - d, 9)            // right bar runs left
    for (const e of c.top) expect(e.drop).toBeCloseTo(c.rise / 1000, 9)
  })

  it('cranks the extra BOTTOM bar UP at each of its two ends', () => {
    const c = crankBars(base)
    const d = c.run / 1000
    expect(c.bot[0].at).toBeCloseTo(0.9, 9)
    expect(c.bot[0].tip).toBeCloseTo(0.9 - d, 9)            // outward, towards the support
    expect(c.bot[1].at).toBeCloseTo(5.1, 9)
    expect(c.bot[1].tip).toBeCloseTo(5.1 + d, 9)
  })

  it('overlaps the two runs so no length of span is left with neither bar', () => {
    const c = crankBars(base)
    expect(c.overlaps).toHaveLength(2)
    expect(c.overlaps[0]).toEqual({ from: 0.9, to: 1.5, length: 600 })
    expect(c.overlaps[1].from).toBeCloseTo(4.5, 9)
    expect(c.overlaps[1].to).toBeCloseTo(5.1, 9)
    expect(c.ok).toBe(true)
  })

  it('flags a gap when the bottom bar starts beyond where the top bar stops', () => {
    const c = crankBars({ ...base, topRun: 0.6, botStart: 1.2 })
    expect(c.overlaps).toHaveLength(0)
    expect(c.ok).toBe(false)
    expect(c.notes.join(' ')).toContain('NEITHER')
  })

  it('flags extra top bars that meet at midspan', () => {
    const c = crankBars({ ...base, topRun: 3.2 })
    expect(c.ok).toBe(false)
    expect(c.notes.join(' ')).toContain('MEET OR CROSS AT MIDSPAN')
  })

  it('quotes the Class B lap for the through bars, not for the extras', () => {
    // A top bar and a bottom bar are in opposite faces and never splice with
    // one another — the overlap is continuity, not a lap.
    expect(crankBars({ ...base, ld: 800 }).lap).toBeCloseTo(1040, 6)
    expect(crankBars({ ...base, ld: 100 }).lap).toBe(300)
  })

  it('draws each cranked bar as one continuous path, not a bar plus a diagonal', () => {
    // One bar, not a straight bar plus a separate diagonal — two pieces on the
    // sheet get fabricated as two bars.
    const d2 = buildBeamDetail({ ...b, continuousLeft: true, continuousRight: true })
    const cranks = crankedPaths(d2)
    expect(cranks).toHaveLength(3)                          // two top bars, one bottom
    expect(cranks.filter((c) => c.cmds.length === 3)).toHaveLength(2)   // run + crank
    expect(cranks.filter((c) => c.cmds.length === 4)).toHaveLength(1)   // cranked both ends
  })

  it('draws the crank at the true 45° it is labelled with', () => {
    // The drawn kink has to be the angle the note quotes, or the sheet says one
    // thing and the bender reads another off the paper.
    const d2 = buildBeamDetail({ ...b, continuousLeft: true, continuousRight: true })
    const path = crankedPaths(d2).find((p) => p.cmds.length === 4)!
    const [p0, p1] = path.cmds                              // the opening crank
    expect(Math.abs(p1.x - p0.x)).toBeCloseTo(Math.abs(p1.y - p0.y), 9)
  })

  it('says bent bars cannot be counted for shear in a special moment frame', () => {
    // §418.6.3.1 requires hoops there; the bar is still drawn as flexural steel.
    const c = crankBars({ ...base, seismic: true })
    expect(c.notes.join(' ')).toContain('§418.6.3.1')
  })
})

describe('the four corner bars', () => {
  // The rule: every beam carries four longitudinal corner bars, two per face,
  // continuous, never cranked. On a singly reinforced section the compression
  // face's two are stirrup hangers and take no part in the analysis.

  const simplySupported = {
    ...b,
    continuousLeft: false, continuousRight: false,
    sections: [
      // no hogging sections at all — nothing designed in the top face
      { label: 'MID', x: 3, hogging: false, bars: 5, stirrupSpacing: 150 },
    ],
  }

  it('still draws two top bars when the analysis asked for none', () => {
    // The defect: the through count was clamped to the designed count, so a
    // simply supported beam came out with NO top steel and its stirrups tied
    // to nothing.
    const d2 = buildBeamDetail(simplySupported)
    const flat2 = allTextOf(d2).join(' ').replace(/\s+/g, ' ')
    expect(flat2).toContain('2-⌀16 TOP THRU')
    // WHY they are there is a design fact, not a construction instruction, so
    // it goes to the engineer rather than onto the bar bender's drawing.
    expect(flat2).not.toContain('NOT COUNTED')
    expect(d2.designNotes.join(' ')).toContain('stirrup hangers')
  })

  it('draws the top bars as real bars, not as an annotation', () => {
    const d2 = buildBeamDetail(simplySupported)
    const bars = d2.primitives.filter(
      (p) => p.kind === 'line' && p.stroke === REBAR_INK && Math.abs(p.y1 - p.y2) < 1e-9,
    ) as { y1: number }[]
    // one line per face, and the top one really is above the bottom one
    expect(bars.length).toBeGreaterThanOrEqual(2)
    const ys = bars.map((l) => l.y1).sort((p, q) => p - q)
    expect(ys[0]).toBeLessThan(ys[ys.length - 1])
  })

  it('counts the compression face once the section is doubly reinforced', () => {
    const dr = buildBeamDetail({
      ...b,
      sections: b.sections.map((sn) => sn.hogging ? sn : { ...sn, compressionBars: 3 }),
    })
    const f = allTextOf(dr).join(' ').replace(/\s+/g, ' ')
    expect(f).not.toContain('REINFORCED')                 // not a placing instruction
    expect(dr.designNotes.join(' ')).toContain("doubly reinforced")
    expect(dr.designNotes.join(' ')).toContain("counted as A's")
  })

  it('never cranks a corner bar', () => {
    // The cranked paths are the extras. Whatever the beam, the through bars
    // stay straight lines — a cranked corner bar would leave the stirrups
    // unsupported where it left the face.
    for (const fixture of [b, simplySupported, noMidStirrups]) {
      const d2 = buildBeamDetail(fixture)
      const straight = d2.primitives.filter(
        (p) => p.kind === 'line' && p.stroke === REBAR_INK && Math.abs(p.y1 - p.y2) < 1e-9,
      )
      expect(straight.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('says a corner bar is only ever interrupted by a stock-length splice', () => {
    // 6 m stock: a 6 m span plus its column widths does not fit in one stick
    const long = buildBeamDetail({ ...b, L: 12 })
    const lf = allTextOf(long).join(' ').replace(/\s+/g, ' ')
    // The lap LENGTH is on S-01's schedule of measures and the rule is in its
    // notes; how many this beam needs is a design fact for the engineer. The
    // sheet itself carries neither — it says what to place.
    expect(lf).not.toMatch(/CLASS B/)
    expect(lf).toContain('REFER TO S-01')
    expect(long.designNotes.join(' ')).toMatch(/Class B lap/)
    expect(long.designNotes.join(' ')).toContain('12400 long')

    const short = buildBeamDetail({ ...b, L: 4, colB: 300 })
    expect(short.designNotes.join(' ')).not.toMatch(/Class B lap/)
  })
})

describe('hoops and overlaps on a beam with no support design', () => {
  const ss = {
    ...b,
    continuousLeft: false, continuousRight: false,
    sections: [{ label: 'MID', x: 3, hogging: false, bars: 5, stirrupSpacing: 150 }],
  }

  it('never draws the end hoops looser than the midspan ones', () => {
    // With no support section designed the end falls back to the §409.7.6.2.2
    // maximum, which can exceed a designed midspan spacing — putting the
    // thinnest hoops where the shear is highest, and contradicting the sheet's
    // own note that spacing is widest where shear is lowest.
    const d2 = buildBeamDetail(ss)
    const x = spanHoopsOf(d2, ss.L, (ss.colB ?? 400) / 2000)
    const gaps = x.slice(1).map((v, k) => v - x[k])
    const near = Math.min(...gaps.slice(0, 3))
    const mid = Math.max(...gaps)
    expect(near).toBeLessThanOrEqual(mid + 1e-9)
    expect(allTextOf(d2).join(' ')).toContain('HOOPS @ 150 C/C FOR 2h EA. END')
  })

  it('does not dimension the run of a bar it never draws', () => {
    // `ss` has no extra TOP bar, so 0.25L is a run nothing takes — but it does
    // have extra BOTTOM bars, so 0.15L and the crank note both still belong.
    const f2 = allTextOf(buildBeamDetail(ss)).join(' ')
    expect(f2).not.toContain('0.25L = ')
    expect(f2).toContain('0.15L')
    expect(f2).toContain('CRANK 45° TYP.')            // labelled on the drawing
    const f3 = allTextOf(buildBeamDetail(b)).join(' ')
    expect(f3).toContain('0.25L = ')
    expect(f3).toContain('CRANK 45° TYP.')
  })

  it('does not band an overlap with a bar it never draws', () => {
    // No hogging steel means no extra TOP bar, so there is nothing for the
    // bottom extra to overlap with. Banding it anyway claimed a lap against a
    // bar that is not on the sheet.
    const d2 = buildBeamDetail(ss)
    // No band is drawn any more — there is no bar at mid-depth to draw — so
    // what tells the reader is the note, and the arms it points with.
    expect(allTextOf(d2).join(' ')).not.toContain('OVERLAP')
    // …and a beam that HAS both bars gets the note, with one arm per end
    const both = buildBeamDetail(b)
    expect(allTextOf(both).join(' ')).toContain('OVERLAP')
    expect(arrowheadsOf(both)).toBeGreaterThanOrEqual(arrowheadsOf(d2) + 2)
  })
})

describe('the supporting columns\' own steel', () => {
  const COLBAR = STEEL_CONTEXT
  const withCage = {
    ...b,
    columnCage: { bars: 12, sConfined: 100, sOutside: 150, lo: 600 },
    hookAnchorage: { colH: 500, colBarDia: 25, colTieDia: 12, colCover: 40, fc: 28, fy: 415 },
  }

  it('draws nothing extra when no cage is supplied', () => {
    expect(buildBeamDetail(b).primitives.filter((p) => p.kind === 'path' && p.stroke === COLBAR)).toHaveLength(0)
  })

  it('draws every column vertical, both columns', () => {
    const d2 = buildBeamDetail(withCage)
    const v = d2.primitives.filter((p) => p.kind === 'path' && p.stroke === COLBAR)
    expect(v).toHaveLength(24)                          // 12 bars x 2 columns
  })

  it('runs the verticals past the beam, not just up to it', () => {
    // A column bar is continuous through the joint. Stopping it at the beam
    // soffit would draw a column spliced at every floor.
    const d2 = buildBeamDetail(withCage)
    const v = d2.primitives.filter(
      (p) => p.kind === 'path' && p.stroke === COLBAR,
    ) as Extract<PlanPrimitive, { kind: 'path' }>[]
    const hM = b.h / 1000
    for (const p of v) {
      const ys = p.cmds.map((c) => c.y)
      // primitive space is y-down, so the top of the beam is the SMALLER y
      expect(Math.min(...ys)).toBeLessThan(-hM + 1e-9)
      expect(Math.max(...ys)).toBeGreaterThan(1e-9)
    }
  })

  it('leaves the joint band to the joint hoops', () => {
    // §418.8.3 — the hoops through the joint belong to the joint, and the sheet
    // already draws them. Column ties there too would draw the steel twice.
    const d2 = buildBeamDetail(withCage)
    const ties = d2.primitives.filter(
      (p) => p.kind === 'path' && p.stroke === HOOP_INK,
    ) as Extract<PlanPrimitive, { kind: 'path' }>[]
    expect(ties.length).toBeGreaterThan(0)
    const hM = b.h / 1000
    for (const t of ties) {
      const y = t.cmds[0].y                             // a tie is level
      expect(y > -hM - 1e-9 && y < 1e-9).toBe(false)    // not inside the beam depth
    }
  })
})

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

  it('splits each face into the bars that run through and the bars that are cranked', () => {
    // 6 top at the worse support -> max(2, ceil(6/3)) = 2 through, so the left
    // support's 4 leave 2 extra and the right's 6 leave 4.
    expect(flat).toContain('2-⌀16 TOP THRU')
    expect(flat).toContain('2-⌀16 EXTRA TOP')
    expect(flat).toContain('4-⌀16 EXTRA TOP')
    // 5 bottom -> max(2, ceil(5/4)) = 2 through, 3 cranked
    expect(flat).toContain('2-⌀16 BOT. THRU (CORNER) — CONT. + 3-⌀16 EXTRA')
  })

  it('applies the continuity rule when an adjacent span is supplied', () => {
    // 8 from the adjacent span governs the left support: 3 through, 5 extra.
    const cont = textsOf(buildBeamDetail({ ...b, adjacentTopLeft: 8 })).join(' ')
    expect(cont).toContain('3-⌀16 TOP THRU')
    expect(cont).toContain('5-⌀16 EXTRA TOP')
  })

  it('runs extra top bars 0.25L and starts extra bottom bars 0.15L off the support', () => {
    expect(EXTRA_TOP_FRACTION).toBe(0.25)
    expect(EXTRA_BOTTOM_FRACTION).toBe(0.15)
    expect(flat).toContain(`0.25L = ${Math.round(0.25 * b.L * 1000)}`)
    expect(flat).toContain('0.15L')
    // the extra bottom bar really does run 0.15L in to 0.15L short — it is one
    // cranked path now, so the straight middle is its third and fourth points
    // The bottom bar is the cranked path with no arc in it — a top bar hooked
    // into an end support also has four commands, but three of them are its hook.
    const bot = crankedPaths(d).find((p) => p.cmds.length === 4)!
    expect(bot).toBeDefined()
    // cmds[0] is the crank tip, cmds[1] and cmds[2] the straight run it ends
    expect(bot.cmds[1].x).toBeCloseTo(0.15 * b.L, 9)
    expect(bot.cmds[2].x).toBeCloseTo(b.L - 0.15 * b.L, 9)
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
    // The callout states the spacings; the clause and the reasoning are on
    // S-01, where a rule belongs.
    expect(flat).toContain('HOOPS @ 100')
    expect(flat).toContain('@ 200')
    expect(flat).not.toContain('WIDEST WHERE THE SHEAR IS LOWEST')
    // the no-stirrup beam quotes the code maximum, not the drawing floor
    const bare = textsOf(buildBeamDetail(noMidStirrups)).join(' ')
    expect(bare).toContain('HOOPS @ 110')
    expect(bare).not.toContain('@ 50 ')
  })

  it('hooks the beam bars into an END support and runs them through a continuous one', () => {
    // Image-3 rule: at an end support the bars have nowhere to go, so they turn
    // down into the column with 60 mm clear to the end of the hook.
    // Hook paths only. Cranked bars are paths too and are drawn in their own
    // ink, so a bare `kind === 'path'` count would now conflate the two.
    // Both the top and the bottom THROUGH bar hook, so an end support carries
    // two of them — the top turning down, the bottom turning up.
    // Hooks only: cranked bars share the accent now, so the arc is what tells
    // them apart — a hook ends in one, a crank is straight all the way.
    const paths = (x: ReturnType<typeof buildBeamDetail>) =>
      x.primitives.filter((p) => p.kind === 'path' && p.stroke === REBAR_INK
        && p.cmds.some((c) => c.c === 'A'))
    // Two through bars hook at each end, and so does each extra top bar — six
    // in all here. They were four only because the extras used to be drawn in
    // a second colour this filter did not catch.
    expect(paths(d)).toHaveLength(6)
    expect(flat).toContain(`${HOOK_END_COVER} CL.`)

    const bothCont = buildBeamDetail({ ...b, continuousLeft: true, continuousRight: true })
    expect(paths(bothCont)).toHaveLength(0)             // nothing to hook
    expect(textsOf(bothCont).join(' ')).not.toContain('CL.')

    const oneEnd = buildBeamDetail({ ...b, continuousRight: true })
    expect(paths(oneEnd)).toHaveLength(3)      // two through bars and one extra top
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
      && (p as { text: string }).text.startsWith('REFER TO')) as { y: number }
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

// ─────────────────────────────────────────────────────────────────────────
// ℓdh AT A HOOKED END — the sheet used to draw the end hook 60 mm inside the
// far face and never ask whether the bar it drew could actually be developed.
// Given the column, it now dimensions the anchorage and says so when it fails.
// ─────────────────────────────────────────────────────────────────────────
describe('buildBeamDetail — the end hook is dimensioned, not drawn by eye', () => {
  /** An END span: the bars have to hook at both supports. */
  const ends = { ...b, continuousLeft: false, continuousRight: false }
  /** A 250 column with ⌀16 verticals and ⌀10 ties — 184 mm for the hook. */
  const tightCol = {
    ...ends,
    hookAnchorage: { colH: 250, colBarDia: 16, colTieDia: 10, colCover: 40, fc: 20.7, fy: 414 },
  }
  /** The same beam in a 600 column, where the same bar develops comfortably. */
  const roomyCol = {
    ...ends,
    hookAnchorage: { colH: 600, colBarDia: 16, colTieDia: 10, colCover: 40, fc: 20.7, fy: 414 },
  }

  it('reports the anchorage from the column, stopping at its far-face bar', () => {
    const a = endHookAnchorage(tightCol)!
    expect(a.avail).toBe(184)                      // 250 − 40 − 10 − 16
    expect(a.clear).toBe(66)                       // cover + tie + bar
    // §418.8.5.1 — the same clause the joint sheet prints, for ⌀16:
    // 414(16)/(5.4·√20.7) = 269.6 mm
    expect(a.ldh).toBeCloseTo(269.61, 1)
    expect(a.fits).toBe(false)
    expect(a.shortfall).toBeCloseTo(85.61, 1)
  })

  it('returns nothing to dimension when the sheet was given no column', () => {
    expect(endHookAnchorage(ends)).toBeNull()
    // …and the drawing still builds, with the hook at its nominal 60 clear
    expect(allTextOf(buildBeamDetail(ends)).join(' ')).toContain(`${HOOK_END_COVER} CL.`)
  })

  it('does NOT dimension ℓdh on the sheet — it is a design result', () => {
    // How much anchorage the hook achieves against how much the column leaves
    // it is a calculation, and the answer where it fails is to deepen the
    // column or change the bar — neither of which anyone reading this sheet
    // can do. `endHookAnchorage` still works it out; it just goes elsewhere.
    const flat = allTextOf(buildBeamDetail(tightCol)).join(' ').replace(/\s+/g, ' ')
    expect(flat).not.toContain('AVAIL')
    expect(flat).not.toMatch(/ℓdh \d+ REQ/)
    expect(endHookAnchorage(tightCol)!.avail).toBe(184)
  })

  it('says the bar does not develop — and that a longer tail is not the fix', () => {
    // A bar that does not develop is an unresolved design question, not a
    // placing instruction — it goes to the engineer, and the sheet still calls
    // the shortfall out graphically where the hook is drawn.
    const dt = buildBeamDetail(tightCol)
    const flat = allTextOf(dt).join(' ').replace(/\s+/g, ' ')
    expect(flat).not.toContain('SHORT')            // no alarm nobody here can act on
    expect(flat).not.toContain('DO NOT DEVELOP')
    const dn = dt.designNotes.join(' ')
    expect(dn).toContain('do not develop here')
    expect(dn).toContain('a longer tail does not count')
    expect(dn).toContain('336')                    // the depth that would work
  })

  it('passes the same bar in a column deep enough for it, with no warning', () => {
    const a = endHookAnchorage(roomyCol)!
    expect(a.avail).toBe(534)
    expect(a.fits).toBe(true)
    const dr2 = buildBeamDetail(roomyCol)
    const flat = allTextOf(dr2).join(' ').replace(/\s+/g, ' ')
    // Nothing to say: a bar that develops needs no note either way.
    expect(dr2.designNotes.join(' ')).not.toMatch(/ℓdh/)
    expect(flat).not.toContain('SHORT')
    // no warning geometry either
    expect(buildBeamDetail(roomyCol).primitives
      .some((p) => 'stroke' in p && p.stroke === '#b91c1c')).toBe(false)
  })

  it('places the hook behind the column cage rather than at a nominal 60', () => {
    const drawn = buildBeamDetail(tightCol)
    const flat = allTextOf(drawn).join(' ')
    expect(flat).toContain('66 CL.')               // 40 + 10 + 16, not 60
    // the drawn support is the column dimension PARALLEL to the bars — the one
    // ℓdh runs in — so a 250 column is drawn 250 wide, not at the 400 default
    const cols = drawn.primitives.filter((p) => p.kind === 'rect' && p.fill === '#f1f5f9') as { w: number }[]
    expect(cols.length).toBeGreaterThan(0)
    for (const c of cols) expect(c.w).toBeCloseTo(0.25, 9)
  })
})

describe('the elevation turns its hooks the way the CAGE does', () => {
  /** Every hook path drawn at a given bar level. */
  const hooks = (d: { primitives: PlanPrimitive[] }, barZ: number) =>
    d.primitives.filter((p): p is Extract<PlanPrimitive, { kind: 'path' }> =>
      p.kind === 'path' && p.stroke === REBAR_INK && Array.isArray(p.cmds) && p.cmds.length === 3)
      .filter((p) => {
        const last = p.cmds[p.cmds.length - 1] as { y?: number }
        return Math.abs((last.y ?? 0) - -barZ) < 1e-6
      })
  /** A 300 deep beam on ⌀28 bars: two 12db tails are longer than the depth. */
  const shallow = {
    ...b, h: 300, barDia: 28,
    sections: [
      { label: 'End i', x: 0, hogging: true, bars: 2, stirrupSpacing: 110 },
      { label: 'End j', x: 6, hogging: true, bars: 2, stirrupSpacing: 110 },
      { label: 'Mid', x: 3, hogging: false, bars: 2, stirrupSpacing: 200 },
    ],
  }
  const yBotShallow = (40 + 10 + 28 / 2) / 1000

  it('turns the bottom hook DOWN where turning up has nothing to sit in', () => {
    // The point of wiring the sheet to `beamAnchorage`: by the old rule this
    // tail went up out of the top of the beam, into air.
    const d = buildBeamDetail({ ...shallow, columnAboveLeft: false, columnAboveRight: false })
    const h = hooks(d, yBotShallow)
    expect(h.length).toBe(2)
    // screen y grows downward, so a tail that starts BELOW the bar runs down
    for (const p of h) expect((p.cmds[0] as { y: number }).y).toBeGreaterThan(-yBotShallow)
    // …and the REASON goes to the engineer, not onto the sheet
    expect(d.designNotes.join(' ')).toMatch(/turned down/)
  })

  it('turns it UP in a beam deep enough to take the tail', () => {
    const d = buildBeamDetail(b)                    // 500 deep, ⌀16
    const h = hooks(d, (40 + 10 + b.barDia / 2) / 1000)
    expect(h.length).toBe(2)
    for (const p of h) {
      expect((p.cmds[0] as { y: number }).y).toBeLessThan(-(40 + 10 + b.barDia / 2) / 1000)
    }
  })

  it('stands the bottom hook one diameter deeper in than the top one', () => {
    // Top and bottom share one lane in an elevation, so the stagger always
    // applies — and it is the same stagger `endAnchors` gives the 3D cage.
    const d = buildBeamDetail(b)
    const ins = (40 + 10 + b.barDia / 2) / 1000
    const topX = hooks(d, b.h / 1000 - ins).map((p) => (p.cmds[0] as { x: number }).x)
    const botX = hooks(d, ins).map((p) => (p.cmds[0] as { x: number }).x)
    expect(topX).toHaveLength(2)
    expect(botX).toHaveLength(2)
    expect(botX[0] - topX[0]).toBeCloseTo(b.barDia / 1000, 6)   // left end, further in
    expect(topX[1] - botX[1]).toBeCloseTo(b.barDia / 1000, 6)   // right end, mirrored
  })
})

describe('the sheet and the 3D cage are the SAME bar', () => {
  it('turns the bottom hook the same way in both, over depth and bar size', () => {
    // The failure this guards against is the one the repo has hit before: two
    // views of one joint drawn from two rules, and nobody notices until it is
    // built. Both now ask `beamAnchorage`, so this holds by construction —
    // which is worth a test precisely because it is easy to break by adding a
    // special case to one of them.
    for (const [h, dia] of [[300, 28], [350, 25], [400, 20], [500, 16], [600, 25], [750, 32]] as const) {
      for (const above of [true, false]) {
        const sections = [
          { label: 'i', x: 0, hogging: true, bars: 3, stirrupSpacing: 110 },
          { label: 'm', x: 3, hogging: false, bars: 3, stirrupSpacing: 200 },
          { label: 'j', x: 6, hogging: true, bars: 3, stirrupSpacing: 110 },
        ]
        const ins = (40 + 10 + dia / 2) / 1000
        const d = buildBeamDetail({
          mark: 'B', L: 6, b: 300, h, barDia: dia, stirrupDia: 10, legs: 2,
          sections, colB: 400, columnAboveLeft: above, columnAboveRight: above,
        })
        const hooks = d.primitives.filter((p): p is Extract<PlanPrimitive, { kind: 'path' }> =>
          p.kind === 'path' && Array.isArray(p.cmds) && p.cmds.length === 3
          && Math.abs(((p.cmds[2] as { y?: number }).y ?? 0) + ins) < 1e-6)
        expect(hooks.length, `h=${h} ⌀${dia}`).toBe(2)
        const onSheet = (hooks[0].cmds[0] as { y: number }).y > -ins ? 'down' : 'up'

        const cage = buildBeamCage({
          mark: 'B', L: 6, colBLeft: 400, colBRight: 400, b: 300, h, cover: 40,
          barDia: dia, stirrupDia: 10, topBars: 3, botBars: 3, sEnd: 110, sMid: 200,
          colCover: 40, colTieDia: 10, colBarDia: 20,
          columnAboveLeft: above, columnAboveRight: above,
          axis: { x0: 0, z0: 0, x1: 6, z1: 0 }, ySoffit: 0,
        })
        const bot = cage.runs.find((r) => r.mark === 'B-B1')!
        const inCage = bot.path[0][1] < bot.path[1][1] ? 'down' : 'up'
        expect(inCage, `h=${h} ⌀${dia} above=${above}`).toBe(onSheet)
      }
    }
  })
})
