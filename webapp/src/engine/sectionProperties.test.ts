import { describe, expect, it } from 'vitest'
import {
  rectangle, circle, hollowCircle, iShape, tShape, channelShape, angleShape, rectComposite,
} from './sectionProperties'

const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol)

describe('closed-form shapes', () => {
  it('rectangle 200×300: A, I, S, r', () => {
    const s = rectangle(200, 300)
    near(s.A, 60000)
    near(s.Ix, 200 * 300 ** 3 / 12)
    near(s.Iy, 300 * 200 ** 3 / 12)
    near(s.Sx, 3e6)
    near(s.rx, 300 / Math.sqrt(12))
    near(s.cy, 150)
    near(s.cTop, 150); near(s.cBot, 150)
  })
  it('circle 200: I = πd⁴/64, S = πd³/32, r = d/4', () => {
    const s = circle(200)
    near(s.A, Math.PI * 200 ** 2 / 4, 1e-6)
    near(s.Ix, Math.PI * 200 ** 4 / 64, 1e-3)
    near(s.Sx, Math.PI * 200 ** 3 / 32, 1e-3)
    near(s.rx, 50)
  })
  it('tube D=200 d=100: r = √(D²+d²)/4', () => {
    const s = hollowCircle(200, 100)
    near(s.A, Math.PI * (200 ** 2 - 100 ** 2) / 4, 1e-6)
    near(s.Ix, Math.PI * (200 ** 4 - 100 ** 4) / 64, 1e-3)
    near(s.rx, Math.sqrt(200 ** 2 + 100 ** 2) / 4, 1e-6)
  })
  it('tube refuses d ≥ D', () => {
    expect(() => hollowCircle(100, 100)).toThrow(/inner diameter/)
  })
})

describe('I-shape 300×150×10×8 (built-up, parallel axis)', () => {
  const s = iShape(300, 150, 10, 8)
  it('area and symmetric centroid', () => {
    near(s.A, 2 * 150 * 10 + 280 * 8)
    near(s.cy, 150)
    near(s.cx, 75)
  })
  it('Ix matches the closed steel-formula', () => {
    const closed = (150 * 300 ** 3 - 142 * 280 ** 3) / 12
    near(s.Ix, closed, 1)
  })
  it('Iy = two flange plates plus the web', () => {
    near(s.Iy, 2 * (10 * 150 ** 3 / 12) + 280 * 8 ** 3 / 12, 1)
  })
  it('moduli and radii', () => {
    near(s.Sx, s.Ix / 150)
    near(s.rx, Math.sqrt(s.Ix / s.A))
  })
  it('the parallel-axis table explains every row', () => {
    const rows = s.rows!
    expect(rows).toHaveLength(3)
    near(rows.reduce((sum, r) => sum + r.A, 0), s.A)
    near(rows.reduce((sum, r) => sum + r.Ix + r.transferX, 0), s.Ix, 1)
    // flange transfer = A·dy² with dy = 145
    const flange = rows.find((r) => r.name === 'top flange')!
    near(flange.dy, 145)
    near(flange.transferX, 1500 * 145 ** 2, 1)
  })
})

describe('T-shape 300×150×20×10 (asymmetric)', () => {
  const s = tShape(300, 150, 20, 10)
  it('centroid sits toward the flange', () => {
    near(s.A, 2800 + 3000)
    near(s.cy, (2800 * 140 + 3000 * 290) / 5800, 1e-6)
    expect(s.cBot).toBeGreaterThan(s.cTop)
  })
  it('Ix by the parallel-axis table', () => {
    const ybar = (2800 * 140 + 3000 * 290) / 5800
    const web = 10 * 280 ** 3 / 12 + 2800 * (ybar - 140) ** 2
    const flange = 150 * 20 ** 3 / 12 + 3000 * (290 - ybar) ** 2
    near(s.Ix, web + flange, 1)
  })
  it('Sx is governed by the bottom (compression-side) fibre', () => {
    near(s.Sx, s.Ix / s.cBot)
  })
})

describe('channel 200×75×10×8', () => {
  // Web/flange corners counted once: flanges are (bf − tw) wide, so
  // A = 8·200 + 2·67·10 = 2940 (not 3100).
  const s = channelShape(200, 75, 10, 8)
  it('area and symmetric depth centroid', () => {
    near(s.A, 200 * 8 + 2 * 67 * 10)
    near(s.cy, 100)
  })
  it('centroid pulls toward the web (x̄ > bf/2)', () => {
    expect(s.cx).toBeGreaterThan(37.5)
    near(s.cx, (1600 * 71 + 1340 * 33.5) / 2940, 1e-3)
  })
  it('Ix (symmetric about the horizontal axis)', () => {
    const web = 8 * 200 ** 3 / 12 + 1600 * (100 - 100) ** 2
    const flange = 67 * 10 ** 3 / 12 + 670 * 95 ** 2
    near(s.Ix, web + 2 * flange, 1)
  })
})

describe('equal-leg angle 100×10', () => {
  const s = angleShape(100, 10)
  it('corner is counted once: A = 2at − t²', () => {
    near(s.A, 2 * 100 * 10 - 100)
  })
  it('symmetric centroid (cx = cy) away from the corner', () => {
    near(s.cx, (1000 * 5 + 900 * 55) / 1900, 1e-6)
    near(s.cx, s.cy, 1e-9)
  })
  it('equal Ix and Iy', () => {
    near(s.Ix, s.Iy, 1)
    const ybar = (1000 * 50 + 900 * 5) / 1900
    const vert = 10 * 100 ** 3 / 12 + 1000 * (ybar - 50) ** 2
    const horiz = 90 * 10 ** 3 / 12 + 900 * (ybar - 5) ** 2
    near(s.Ix, vert + horiz, 1)
  })
})

describe('custom built-up composite', () => {
  it('two stacked rectangles match the parallel-axis arithmetic', () => {
    const s = rectComposite([
      { x: 0, y: 0, w: 120, h: 20 },
      { x: 0, y: 20, w: 20, h: 180 },
    ])
    const A = 2400 + 3600
    const ybar = (2400 * 10 + 3600 * 110) / A
    near(s.cy, ybar, 1e-9)
    near(s.Ix, 120 * 20 ** 3 / 12 + 2400 * (ybar - 10) ** 2 + 20 * 180 ** 3 / 12 + 3600 * (ybar - 110) ** 2, 1)
  })
  it('degenerate rows are ignored, not fatal', () => {
    const s = rectComposite([
      { x: 0, y: 0, w: 100, h: 50 },
      { x: 0, y: 0, w: 0, h: 50 },
    ])
    near(s.A, 5000)
  })
  it('empty input throws', () => {
    expect(() => rectComposite([])).toThrow()
  })
})
