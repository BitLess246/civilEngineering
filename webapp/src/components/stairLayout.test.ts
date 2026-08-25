import { describe, it, expect } from 'vitest'
import { flightGeometry, MARGIN, DRAW_W, type Pt } from './stairLayout'

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
