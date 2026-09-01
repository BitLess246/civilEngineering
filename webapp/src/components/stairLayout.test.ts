import { describe, it, expect } from 'vitest'
import { flightGeometry, along, barPath, stairBars, crossPast, rayMeetsLine, offsetPath, pathLength,
  MARGIN, DRAW_W, type Pt } from './stairLayout'

// span m, t/R/G mm. θ = atan(R/G), the same value `stairGeometry` hands the page.
const theta = (R: number, G: number) => (Math.atan2(R, G) * 180) / Math.PI
const cases = [
  { span: 3.5, t: 150, R: 150, G: 300 },   // the page's defaults
  { span: 3.0, t: 220, R: 190, G: 250 },   // steep, thick waist
  { span: 4.5, t: 175, R: 140, G: 320 },   // shallow, long
  { span: 2.0, t: 100, R: 175, G: 250 },   // short flight
  { span: 6.0, t: 250, R: 165, G: 280 },
]
const geoms = cases.map((c) => ({ ...c, g: flightGeometry(c.span, c.t, c.R, c.G, theta(c.R, c.G)) }))

describe('waist offset is actually NORMAL to the soffit', () => {
  // The bug this pins: the offset was (sinθ, −cosθ), whose dot product with the
  // soffit direction (cosθ, −sinθ) is 2 sinθ cosθ — not zero. The waist was
  // measured along a line that is not the normal, which is the one thing the
  // drawing exists to show, and every face built from it leaned by 2θ.
  it('the offset vector is perpendicular to the soffit, in every case', () => {
    for (const { g } of geoms) {
      const sx = g.x1 - g.x0, sy = g.y1 - g.y0            // soffit direction
      const dot = sx * g.nx + sy * g.ny
      expect(Math.abs(dot) / (Math.hypot(sx, sy) * Math.hypot(g.nx, g.ny))).toBeLessThan(1e-12)
    }
  })

  it('its length is the waist thickness, and it points up out of the slab', () => {
    for (const { t, g } of geoms) {
      expect(Math.hypot(g.nx, g.ny)).toBeCloseTo(t * g.scale, 9)
      expect(g.ny).toBeLessThan(0)                        // up, on a y-down canvas
      expect(g.nx).toBeLessThan(0)                        // ...and to the left
    }
  })

  it('the top face is t/cosθ above the soffit vertically', () => {
    // Two parallel lines a perpendicular distance t apart are t/cosθ apart
    // measured vertically. That identity is what lets the end faces be drawn
    // vertical while the thickness stays the ⟂ one the calculation uses.
    for (const { R, G, g } of geoms) {
      expect(g.tv).toBeCloseTo(g.tw / Math.cos(Math.atan2(R, G)), 9)
      expect(g.tv).toBeGreaterThan(g.tw)
    }
  })

  it('a point offset along the normal from the soffit lies on the top face', () => {
    for (const { g } of geoms) {
      const m: Pt = [(g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2]      // soffit midpoint
      const p: Pt = [m[0] + g.nx, m[1] + g.ny]
      // top face: the soffit raised by tv
      const onFace = g.y0 - g.tv + ((p[0] - g.x0) * (g.y1 - g.y0)) / (g.x1 - g.x0)
      expect(p[1]).toBeCloseTo(onFace, 6)
    }
  })
})

describe('the stepped profile is steps — vertical risers, horizontal treads', () => {
  it('every segment is axis-aligned; not one of them is a diagonal', () => {
    for (const { g } of geoms) {
      for (let i = 1; i < g.profile.length; i++) {
        const a = g.profile[i - 1], b = g.profile[i]
        const dx = Math.abs(b[0] - a[0]), dy = Math.abs(b[1] - a[1])
        expect(Math.min(dx, dy)).toBeLessThan(1e-9)        // one of them is zero
        expect(Math.max(dx, dy)).toBeGreaterThan(1e-9)     // and the other is not
      }
    }
  })

  it('risers rise exactly R and treads run exactly G, alternating', () => {
    for (const { R, G, g } of geoms) {
      expect(g.profile.length).toBe(2 * g.nSteps + 1)
      for (let i = 1; i < g.profile.length; i++) {
        const a = g.profile[i - 1], b = g.profile[i]
        if (i % 2 === 1) {                                  // riser: up by R
          expect(b[0]).toBeCloseTo(a[0], 9)
          expect(a[1] - b[1]).toBeCloseTo(R * g.scale, 9)
        } else {                                            // tread: across by G
          expect(b[1]).toBeCloseTo(a[1], 9)
          expect(b[0] - a[0]).toBeCloseTo(G * g.scale, 9)
        }
      }
    }
  })

  it('the inner corners sit on the waist top face, and the last tread ends at the top', () => {
    for (const { g } of geoms) {
      const face = (x: number) => g.y0 - g.tv + ((x - g.x0) * (g.y1 - g.y0)) / (g.x1 - g.x0)
      for (let i = 0; i < g.profile.length; i += 2) {       // 0, 2, 4… are inner corners
        expect(g.profile[i][1]).toBeCloseTo(face(g.profile[i][0]), 6)
      }
      const last = g.profile[g.profile.length - 1]
      expect(last[0]).toBeCloseTo(g.x1, 9)
      expect(last[1]).toBeCloseTo(g.y1 - g.tv, 9)
    }
  })
})

describe('the flight is one closed boundary with vertical end faces', () => {
  it('both end faces are vertical — the first and last risers, not diagonals', () => {
    for (const { g } of geoms) {
      const f = g.flight
      expect(f[0]).toEqual([g.x0, g.y0])                   // soffit, bottom
      expect(f[1]).toEqual([g.x1, g.y1])                   // soffit, top
      expect(f[2][0]).toBeCloseTo(g.x1, 9)                 // straight UP the top face
      expect(f[2][1]).toBeCloseTo(g.y1 - g.tv, 9)
      const closing = f[f.length - 1]                      // …and back down at x0
      expect(closing[0]).toBeCloseTo(g.x0, 9)
      expect(closing[1]).toBeCloseTo(g.y0 - g.tv, 9)
    }
  })

  it('walks the profile back down without repeating the corner it turned at', () => {
    for (const { g } of geoms) {
      expect(g.flight.length).toBe(3 + g.profile.length - 1)
      for (let i = 1; i < g.flight.length; i++) {
        expect(g.flight[i]).not.toEqual(g.flight[i - 1])
      }
    }
  })
})

describe('the frame holds the drawing', () => {
  it('nothing is clipped: the top tread clears the top margin, the flight fits the width', () => {
    for (const { g } of geoms) {
      const ys = g.flight.map((p) => p[1]), xs = g.flight.map((p) => p[0])
      expect(Math.min(...ys)).toBeCloseTo(MARGIN.top, 6)       // exactly the margin
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(0)
      expect(Math.max(...xs)).toBeLessThanOrEqual(g.W)
      expect(Math.max(...ys)).toBeLessThan(g.HT - MARGIN.bottom + 1e-9)
      expect(g.x1 - g.x0).toBeCloseTo(DRAW_W, 9)
    }
  })

  it('a flight with a single step still produces a valid frame', () => {
    const g = flightGeometry(0.3, 150, 175, 250, theta(175, 250))
    expect(g.nSteps).toBeGreaterThanOrEqual(1)
    expect(g.profile.length).toBe(2 * g.nSteps + 1)
    expect(Number.isFinite(g.HT)).toBe(true)
  })
})

describe('landings and the steel that runs through them', () => {
  const g = (landing: number) => flightGeometry(3.5, 125, 175, 280, 32, landing)

  it('draws no landing, and changes nothing, when none is asked for', () => {
    const a = g(0)
    expect(a.lowLanding).toEqual([])
    expect(a.upLanding).toEqual([])
    // the flight alone still fills the drawing width, as it always did
    expect(a.x1 - a.x0).toBeCloseTo(DRAW_W, 6)
  })

  it('shares ONE scale across landing + flight + landing', () => {
    // Drawn to its own scale a landing would misreport the 450 extension the
    // whole detail exists to dimension.
    const b = g(1200)
    const run = b.nSteps * 280
    expect(b.scale).toBeCloseTo(DRAW_W / (run + 2 * 1200), 9)
    expect(b.x1 - b.x0).toBeCloseTo(run * b.scale, 6)
    expect(b.x0 - MARGIN.left).toBeCloseTo(1200 * b.scale, 6)
  })

  it('butts each landing onto the flight at the same level and thickness', () => {
    const b = g(1200)
    // lower landing: soffit level with the flight's bottom, top a waist above
    expect(b.lowLanding[1]).toEqual([b.x0, b.y0])
    expect(b.lowLanding[2]).toEqual([b.x0, b.y0 - b.tv])
    // upper landing: level with the flight's top
    expect(b.upLanding[0]).toEqual([b.x1, b.y1])
    expect(b.upLanding[3]).toEqual([b.x1, b.y1 - b.tv])
  })

  it('runs both faces landing-to-landing as one bent line', () => {
    const b = g(1200)
    expect(b.soffitLine).toHaveLength(4)
    expect(b.topLine).toHaveLength(4)
    // the two interior points are the re-entrant corners
    expect(b.soffitLine[1]).toEqual(b.kinks.lowSoffit)
    expect(b.soffitLine[2]).toEqual(b.kinks.upSoffit)
    expect(b.topLine[1]).toEqual(b.kinks.lowTop)
    // and the top face is exactly one VERTICAL waist above the soffit
    expect(b.topLine[1][1]).toBeCloseTo(b.soffitLine[1][1] - b.tv, 9)
  })

  it('opens the frame up for the callouts a landing brings with it', () => {
    // Without the extra margin the upper landing's spacing label is cut off by
    // the viewBox — it sits above the flight's own top corner.
    expect(g(1200).MT).toBeGreaterThan(g(0).MT)
  })
})

describe('along', () => {
  it('steps a real distance in mm, scaled', () => {
    const p = along([0, 0], [100, 0], 450, 0.1)   // 450 mm at 0.1 units/mm
    expect(p[0]).toBeCloseTo(45, 9)
  })

  it('never overshoots the far end', () => {
    expect(along([0, 0], [10, 0], 9999, 1)).toEqual([10, 0])
  })

  it('does not divide by zero on a degenerate segment', () => {
    expect(along([5, 5], [5, 5], 450, 1)).toEqual([5, 5])
  })
})

describe('barPath — a bar is bent, and it does not stop in mid-air', () => {
  const straight: Pt[] = [[0, 0], [100, 0]]
  const bent: Pt[] = [[0, 0], [100, 0], [160, -60]]

  it('returns 90° into the slab at each free end, the way it is asked to', () => {
    // A bar ending at the cover line has nothing developing it. The return is
    // perpendicular to the run, and `hookDy` says which way down the PAGE it
    // turns — a top bar down into the slab, a soffit bar up.
    const down = barPath(straight, 5, { hookStart: 12, hookEnd: 12, hookDy: 1 })
    expect(down.d.startsWith('M0,12 L0,0')).toBe(true)      // starts below, comes up
    expect(down.d.endsWith('L100,0 L100,12')).toBe(true)    // and turns back down
    const up = barPath(straight, 5, { hookStart: 12, hookDy: -1 })
    expect(up.d.startsWith('M0,-12 L0,0')).toBe(true)
  })

  it('hooks the same way whichever way the bar is drawn', () => {
    // The old signed-perpendicular form flipped with the run direction, so the
    // bar drawn right-to-left hooked out through the cover instead of into the
    // slab. Both of these are soffit bars; both must turn UP the page.
    const ltr = barPath([[0, 0], [100, 0]], 5, { hookStart: 12, hookDy: -1 })
    const rtl = barPath([[100, 0], [0, 0]], 5, { hookStart: 12, hookDy: -1 })
    expect(ltr.d.startsWith('M0,-12')).toBe(true)
    expect(rtl.d.startsWith('M100,-12')).toBe(true)
  })

  it('hooks only the end it is asked to — a buried end needs none', () => {
    const one = barPath(straight, 5, { hookStart: 12, hookDy: 1 })
    expect(one.d.startsWith('M0,12')).toBe(true)
    expect(one.d.endsWith('L100,0')).toBe(true)
  })

  it('omits the hook when none is asked for', () => {
    expect(barPath(straight, 5).d).toBe('M0,0 L100,0')
  })

  it('turns an interior corner through a radius, tangent to both legs', () => {
    // The vertex is the quadratic's control point, so the curve leaves and
    // rejoins each leg along that leg — which is what a bending machine does.
    const p = barPath(bent, 10)
    expect(p.d).toContain('Q100,0')
    expect(p.bends).toEqual([[100, 0]])
    // …and the curve starts 10 back along the first leg
    expect(p.d).toContain('L90,0')
  })

  it('never eats more than half a leg, however large the radius', () => {
    // A radius wider than the segment would run the curve past the next corner
    // and fold the bar back on itself.
    const p = barPath(bent, 999)
    expect(p.d).toContain('L50,0')
  })

  it('says nothing about a bar with fewer than two points', () => {
    expect(barPath([[0, 0]], 5, { hookStart: 12 })).toEqual({ d: '', bends: [] })
  })
})

describe('crossPast — the anchorage a bar carries past a kink', () => {
  // A corner at the origin, arrived at travelling +x; the far face is the
  // horizontal line 30 below.
  const corner: Pt = [0, 0], from: Pt = [-100, 0]
  const far = { p: [0, 30] as Pt, dir: [1, 0] as Pt }

  it('runs straight on when the straight run is long enough', () => {
    const r = crossPast(corner, from, { p: [0, 1e6] as Pt, dir: [1, 0] as Pt }, 100, 1)
    expect(r).toHaveLength(1)
    expect(r[0]).toEqual([100, 0])
  })

  it('turns at the far face and spends the rest of the anchorage along it', () => {
    // The straight run never reaches 100 here: it meets the face after 30 and
    // must turn. This is the case a 150 waist is always in — about 240 mm of
    // straight run before a horizontal bar comes out through the soffit.
    const r = crossPast(corner, [0, -100], far, 100, 1)
    expect(r).toHaveLength(2)
    expect(r[0]).toEqual([0, 30])                 // hits the face
    expect(r[1][1]).toBeCloseTo(30, 9)            // then follows it
    expect(Math.abs(r[1][0])).toBeCloseTo(70, 9)  // for the remaining 70
  })

  it('the total length past the corner is the anchorage asked for, bend or no bend', () => {
    for (const ext of [40, 100, 300, 900]) {
      const bent = pathLength([corner, ...crossPast(corner, [0, -100], far, ext, 1)])
      expect(bent).toBeCloseTo(ext, 6)
    }
  })

  it('follows the face away from the corner whichever way round it is given', () => {
    // The face line has no inherent sense, so the tail's direction is taken
    // from the bar's. Arrival is on the slope here, as it is on a stair —
    // a bar arriving square to the face would leave the choice undecided.
    const arrive: Pt = [-80, -60]                    // travelling down-right
    const a = crossPast(corner, arrive, { p: [0, 30], dir: [1, 0] }, 100, 1)
    const b = crossPast(corner, arrive, { p: [0, 30], dir: [-1, 0] }, 100, 1)
    expect(a[1][0]).toBeCloseTo(b[1][0], 9)
    expect(a[1][0]).toBeGreaterThan(a[0][0])         // carries on, never doubles back
  })
})

describe('rayMeetsLine', () => {
  it('finds the crossing and how far along the ray it is', () => {
    const m = rayMeetsLine([0, 0], [1, 0], [7, -5], [0, 1])!
    expect(m.at).toEqual([7, 0])
    expect(m.dist).toBeCloseTo(7, 9)
  })

  it('says nothing when the lines are parallel, or the crossing is behind', () => {
    expect(rayMeetsLine([0, 0], [1, 0], [0, 5], [1, 0])).toBeNull()
    expect(rayMeetsLine([0, 0], [1, 0], [-7, -5], [0, 1])).toBeNull()
  })
})

describe('stairBars — which bar turns a kink, and which two cross it', () => {
  const g = flightGeometry(3.5, 150, 150, 300, 26.57, 1200)
  const cov = g.tv * 0.18
  const inset = (line: Pt[], dir: 1 | -1): Pt[] => line.map(([x, y]) => [x, y + dir * cov] as Pt)
  const bot = inset(g.soffitLine, -1), top = inset(g.topLine, 1)
  const bars = stairBars(bot, top, 450, g.scale, 4)
  const byId = (id: string) => bars.find((b) => b.id === id)!
  /** Is `p` a vertex of this bar — i.e. does the bar BEND there? */
  const bendsAt = (b: typeof bars[number], p: Pt) =>
    b.pts.slice(1, -1).some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1.5)

  it('draws four bars: one bent at each kink, and a pair crossing each', () => {
    expect(bars.map((b) => b.id).sort()).toEqual(
      ['soffit-lap', 'soffit-through', 'top-lap', 'top-through'])
    expect(bars.filter((b) => b.anchor)).toHaveLength(4)
  })

  it('the SOFFIT bar turns the bottom kink — the waist is on the inside of that turn', () => {
    expect(bendsAt(byId('soffit-through'), bot[1])).toBe(true)
  })

  it('...and NOTHING turns the top face there, where only the cover is', () => {
    // The resultant at that bend points up, out through the cover. Both top
    // bars must pass the corner without a vertex on it.
    expect(bendsAt(byId('top-lap'), top[1])).toBe(false)
    expect(bendsAt(byId('top-through'), top[1])).toBe(false)
  })

  it('the TOP bar turns the top kink, and nothing turns the soffit there', () => {
    expect(bendsAt(byId('top-through'), top[2])).toBe(true)
    expect(bendsAt(byId('soffit-through'), bot[2])).toBe(false)
    expect(bendsAt(byId('soffit-lap'), bot[2])).toBe(false)
  })

  it('every crossed bar carries the full anchorage past its kink', () => {
    for (const b of bars) {
      const a = b.anchor!
      expect(pathLength([a.corner, ...a.run])).toBeCloseTo(450 * g.scale, 6)
    }
  })

  it('no bar leaves the concrete — the straight run alone would', () => {
    // 450 mm straight out of the lower landing's top face exits the flight's
    // soffit after about 240 mm, which is what the first drawing did.
    const flightSoffitY = (x: number) => g.y0 - (x - g.x0) * Math.tan((26.57 * Math.PI) / 180)
    const end = byId('top-lap').pts[byId('top-lap').pts.length - 1]
    expect(end[1]).toBeLessThan(flightSoffitY(end[0]))     // still above the soffit
  })

  it('a lapping bar is placed CLEAR of the layer it laps past, not on top of it', () => {
    // Laid on the far face itself it is hidden under the bar already there.
    const turned = byId('top-through').pts[1]              // where it meets the landing soffit
    const soffitBar = bot[0][1]
    expect(Math.abs(turned[1] - soffitBar)).toBeGreaterThan(2)
  })

  it('one free end each — hooked there, buried at the other', () => {
    for (const b of bars) expect(b.hookStart + b.hookEnd).toBe(1)
  })

  it('a flight with no landings is just two straight bars', () => {
    const plain = flightGeometry(3.5, 150, 150, 300, 26.57, 0)
    const bs = stairBars(inset(plain.soffitLine, -1), inset(plain.topLine, 1), 450, plain.scale)
    expect(bs).toHaveLength(2)
    expect(bs.every((b) => b.pts.length === 2 && !b.anchor)).toBe(true)
  })
})

describe('offsetPath — dimensioning a bent bar', () => {
  it('traces the bar it measures — every point steps off by the offset', () => {
    // It does NOT preserve length, and is not claimed to: a parallel offset
    // round the inside of a corner is always shorter. What it must do is stay
    // the stated distance from the path, so the end ticks land on the bar's
    // real ends.
    const bent: Pt[] = [[0, 0], [60, 0], [60, 40]]
    const off = offsetPath(bent, 10, 1)
    expect(off).toHaveLength(3)
    expect(Math.hypot(off[0][0] - bent[0][0], off[0][1] - bent[0][1])).toBeCloseTo(10, 9)
    expect(Math.hypot(off[2][0] - bent[2][0], off[2][1] - bent[2][1])).toBeCloseTo(10, 9)
  })

  it('the chord it replaces really is shorter than the bar', () => {
    // Which is why the dimension follows the path instead: 450 printed beside
    // the straight line between the ends would be measuring 361.
    const bent: Pt[] = [[0, 0], [60, 0], [60, 40]]
    expect(Math.hypot(bent[2][0] - bent[0][0], bent[2][1] - bent[0][1]))
      .toBeLessThan(pathLength(bent) - 15)
  })

  it('steps off to the side asked for', () => {
    const line: Pt[] = [[0, 0], [100, 0]]
    expect(offsetPath(line, 10, 1)[0][1]).toBeCloseTo(10, 9)
    expect(offsetPath(line, 10, -1)[0][1]).toBeCloseTo(-10, 9)
  })
})
