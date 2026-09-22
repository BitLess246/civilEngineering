/**
 * The legibility rules, and every mark in the app held to them.
 *
 * WHY THIS EXISTS. The icon guards checked the grid, the stroke, the command
 * letters and the path count — and passed a ribbon that was illegible at the
 * 20 px it ships at. Rendered and inspected at 4×, four of the twelve marks
 * were solid blocks: a UDL whose arrows sat 4.5 units apart, a moment diagram
 * hatched every 2.4, a beam elevation with its bars 2.5 inside its own
 * outline, a hysteresis loop spanning 11 units of 24.
 *
 * Every one of those passed every existing property. So the properties were
 * not wrong, they were incomplete: they described a well-FORMED drawing and
 * said nothing about a readable one. These are the missing half.
 */
import { describe, it, expect } from 'vitest'
import {
  segments, points, arcBox, crowdedPairs, extent, MIN_FEATURE_GAP, MIN_EXTENT,
} from './iconLegibility'
import { RIBBON_ICONS, ACTION_ICONS } from './ribbonIcons'
import { GROUP_ICONS } from './toolGroupIcons'

describe('the path reader', () => {
  it('reads M/L/H/V into absolute segments', () => {
    expect(segments('M2 5H22')).toEqual([{ x1: 2, y1: 5, x2: 22, y2: 5 }])
    expect(segments('M4 21V4')).toEqual([{ x1: 4, y1: 21, x2: 4, y2: 4 }])
    expect(segments('M12 5L5 16H19')).toEqual([
      { x1: 12, y1: 5, x2: 5, y2: 16 },
      { x1: 5, y1: 16, x2: 19, y2: 16 },
    ])
  })

  it('carries the pen through a curve without inventing a segment', () => {
    // A straight-line approximation of a cubic would produce gaps that are not
    // there and fail drawings that read fine. Better to see less than to see
    // wrong — the module says so and this pins it.
    const s = segments('M3 5C8 21 16 21 21 5V9')
    expect(s).toEqual([{ x1: 21, y1: 5, x2: 21, y2: 9 }])
  })

  it('handles several subpaths in one d, which the load arrows use', () => {
    expect(segments('M5 4V15M2.6 12.6L5 15L7.4 12.6')).toHaveLength(3)
  })
})

describe('crowding', () => {
  it('flags parallel strokes closer than the stroke can separate', () => {
    // ICON_STROKE is 1.6 units, centred, so 3 units apart leaves 1.4 of air —
    // the floor. At 2 there is 0.4, which at 20 px is a third of a pixel.
    expect(crowdedPairs({ depicts: 'x', paths: ['M2 5H20', 'M2 7H20'] }))
      .not.toEqual([])
    expect(crowdedPairs({ depicts: 'x', paths: ['M2 5H20', 'M2 9H20'] }))
      .toEqual([])
  })

  it('ignores parallel strokes that do not overlap', () => {
    // Two verticals 1 unit apart but stacked end to end never touch. Forcing
    // them apart would bend drawings for nothing, so the check asks whether
    // the strokes are actually beside each other.
    expect(crowdedPairs({ depicts: 'x', paths: ['M5 2V8', 'M6 14V20'] })).toEqual([])
  })

  it('reproduces the four marks that shipped illegible', () => {
    // The actual first-draft geometry, kept as the regression case. Every one
    // of these passed the grid, stroke, command and count guards.
    // NOT the UDL, and the omission is the honest part. Its four arrows sat
    // 4.5 units apart — over the floor — and it read as a solid comb anyway,
    // because what merged was the ARROWHEADS: 3.6 units wide at 4.5 centres,
    // and diagonal, so this rule cannot see them. The rule catches crowding
    // between parallel strokes and nothing else; the 4× render is still what
    // catches the rest, and this comment is here so nobody reads a green suite
    // as "the marks are legible".
    const wasBad = [
      // the moment diagram: five hatch lines at 2.4
      ['M7.2 6V13.3', 'M9.6 6V15.1', 'M12 6V15.8', 'M14.4 6V15.1', 'M16.8 6V13.3'],
      // the beam elevation: bars 2 inside the outline, stirrups at 3
      ['M3 7H21V17H3Z', 'M4.8 9H19.2', 'M7 8.6V15.4', 'M10 8.6V15.4'],
      // the sheet: border 2.5 inside the sheet
      ['M3.5 3.5H20.5V20.5H3.5Z', 'M5.5 5.5H18.5V18.5H5.5Z'],
    ]
    for (const paths of wasBad) {
      expect(crowdedPairs({ depicts: 'x', paths }), paths[0]).not.toEqual([])
    }
  })
})

describe('extent', () => {
  it('measures how much of the box a mark uses', () => {
    expect(extent({ depicts: 'x', paths: ['M2 3H22V21H2Z'] })).toEqual({ w: 20, h: 18 })
  })

  it('sees a curve, which reading straight segments alone did not', () => {
    // The mode shapes measured 9 units tall against their real 22, because
    // only their two baselines are straight. A mark can be almost entirely
    // curve and still fill its box.
    const e = extent({ depicts: 'x', paths: ['M3 18C6 13 9 13 12 18C15 23 18 23 21 18'] })
    expect(e.w).toBe(18)
    expect(e.h).toBe(10)
  })

  it('reads an arc as its box, never as its radii and flags', () => {
    // Two things this pins. A naive pair scan read `A5 5 0 0 1 14 19` as the
    // points (5, 5), (0, 0) and (1, 14) — a radius, two flags and a rotation,
    // none of which are coordinates. And reading only the ENDPOINT measured
    // a circle whose endpoints share an axis as zero wide, which is what made
    // `Timber` report 0.0×17.6.
    //
    // Chord (14,9)→(14,19) is 10 long with r = 5, so it is a semicircle about
    // (14, 14) and its box is (9,9)–(19,19). The endpoint is inside that box,
    // so it does not need pushing separately.
    expect(points('M4 9H14A5 5 0 0 1 14 19')).toEqual([
      [4, 9], [14, 9], [9, 9], [19, 19],
    ])
    for (const p of points('M4 9H14A5 5 0 0 1 14 19')) {
      expect(p, 'a flag or a rotation leaked in as a point').not.toEqual([0, 0])
    }
  })

  it('counts a filled dot to its edge, not its centre', () => {
    const e = extent({ depicts: 'x', paths: ['M10 10H12'], dots: [{ cx: 20, cy: 20, r: 2 }] })
    expect(e.w).toBe(12)      // 10 → 22
  })
})

describe('every mark in the app reads at the size it ships at', () => {
  /**
   * NO ALLOWLIST. There was one: applying the rule to the eleven sidebar marks
   * found five crowded and two small, and they were named with their
   * measurements rather than redrawn, because rewriting eleven shipped icons
   * inside a PR about the ribbon would have made that diff unreviewable.
   *
   * They are redrawn now, so the list is gone — which is the point of having
   * written it down instead of skipping the set. What the 4× render showed,
   * and what makes this more than a rule-following exercise: four of the five
   * were genuinely unreadable in the rail. `Analysis` drew a bowtie, `Concrete`
   * a double-edged box with nothing in it, `Geotechnical` a hatched rectangle,
   * `Foundations` a blob. The rule found them from the geometry alone.
   *
   * `Timber` was the exception and it is worth keeping straight: it read fine
   * and the PROXY was wrong, because it is two arcs whose every named point
   * shares x = 12. `arcBox` fixed the proxy; the mark never changed.
   */
  const ALL = {
    ...Object.fromEntries(Object.entries(RIBBON_ICONS).map(([k, v]) => [`ribbon/${k}`, v])),
    ...Object.fromEntries(Object.entries(ACTION_ICONS).map(([k, v]) => [`action/${k}`, v])),
    ...Object.fromEntries(Object.entries(GROUP_ICONS).map(([k, v]) => [`sidebar/${k}`, v])),
  }

  it('found them all', () => {
    // 12 ribbon tabs + 4 actions + 11 sidebar groups.
    expect(Object.keys(ALL).length).toBe(27)
  })

  it('keeps parallel strokes far enough apart to stay two strokes', () => {
    const crowded = Object.entries(ALL)
      .map(([k, icon]) => [k, crowdedPairs(icon)] as const)
      .filter(([, hits]) => hits.length > 0)
      .map(([k, hits]) => `${k}: ${hits.join('; ')}`)
    expect(crowded, `closer than ${MIN_FEATURE_GAP} units`).toEqual([])
  })

  it('fills its box, because a small drawing is a crowded drawing', () => {
    const small = Object.entries(ALL)
      .map(([k, icon]) => [k, extent(icon)] as const)
      .filter(([, e]) => e.w < MIN_EXTENT || e.h < MIN_EXTENT)
      .map(([k, e]) => `${k}: ${e.w.toFixed(1)}×${e.h.toFixed(1)}`)
    expect(small, `under ${MIN_EXTENT} of 24 units`).toEqual([])
  })
})

describe('arcBox — what let a circle measure zero units wide', () => {
  it('bounds a semicircle by the circle it lies on', () => {
    // Timber's own geometry: a half arc from (12, 3.2) to (12, 20.8) with r 8.8.
    // Its endpoints share x, so an endpoint-only box is a vertical line.
    const box = arcBox(12, 3.2, 8.8, 8.8, true, false, 12, 20.8)
    const xs = box.map((p) => p[0])
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(17.6, 6)
  })

  it('centres the circle on the chord midpoint when the chord is a diameter', () => {
    const box = arcBox(2, 12, 10, 10, true, false, 22, 12)
    expect(box).toEqual([[2, 2], [22, 22]])
  })

  it('grows radii that cannot span the chord, as a browser does', () => {
    // SVG F.6.6: r = 1 cannot reach from (0,0) to (10,0), so it is scaled to
    // 5 and the arc becomes a semicircle. Silently keeping r = 1 would put
    // the box in the wrong place entirely.
    const box = arcBox(0, 0, 1, 1, false, true, 10, 0)
    expect(box[0][0]).toBeCloseTo(0, 6)
    expect(box[1][0]).toBeCloseTo(10, 6)
  })

  it('treats a zero radius as the straight line the spec says it is', () => {
    expect(arcBox(1, 2, 0, 5, false, false, 7, 9)).toEqual([[1, 2], [7, 9]])
  })

  it('sees Timber through the full extent path', () => {
    const e = extent(GROUP_ICONS.Timber)
    expect(e.w).toBeCloseTo(17.6, 1)
    expect(e.h).toBeCloseTo(17.6, 1)
  })
})
