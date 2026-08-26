import { describe, it, expect } from 'vitest'
import { flightGeometry, along, MARGIN, DRAW_W, type Pt } from './stairLayout'

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
