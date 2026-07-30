import { describe, it, expect } from 'vitest'
import { shearEnvelopeChart, consolidationChart, gradingChart, decadeTicks, linearTicks, tickDp } from './plots'
import { directShear } from './directShear'
import { consolidation, heightOfSolids } from './consolidation'
import { gradation } from '../sieve'
import { planToSvg } from '../../planRenderer'
import type { PlanPrimitive } from '../../planRenderer'

const texts = (d: { primitives: PlanPrimitive[] }) =>
  d.primitives.filter((p): p is Extract<PlanPrimitive, { kind: 'text' }> => p.kind === 'text')
    .map((p) => p.text)

const dots = (d: { primitives: PlanPrimitive[] }) =>
  d.primitives.filter((p) => p.kind === 'circle')

const SHEAR = [
  { normalStress: 50, peakShear: 48.87 },
  { normalStress: 100, peakShear: 77.74 },
  { normalStress: 200, peakShear: 135.47 },
]

const SPECIMEN = { initialHeight: 20, diameter: 75, dryMass: 79.5, specificGravity: 2.70 }

function consolidationCurve() {
  const hs = heightOfSolids(SPECIMEN.dryMass, SPECIMEN.specificGravity, (Math.PI / 4) * SPECIMEN.diameter ** 2)
  const e0 = SPECIMEN.initialHeight / hs - 1
  const points = [12.5, 25, 50, 100, 200, 400, 800, 1600].map((stress) => {
    const e = stress <= 200
      ? e0 - 0.04 * Math.log10(stress / 12.5)
      : e0 - 0.04 * Math.log10(200 / 12.5) - 0.40 * Math.log10(stress / 200)
    return { stress, compression: SPECIMEN.initialHeight - (1 + e) * hs }
  })
  return consolidation({ ...SPECIMEN, points })
}

const GRADING = gradation({
  totalMass: 500,
  readings: [
    { size: 9.5, massRetained: 10 },
    { size: 4.75, massRetained: 40 },
    { size: 2.0, massRetained: 75 },
    { size: 0.85, massRetained: 100 },
    { size: 0.425, massRetained: 110 },
    { size: 0.15, massRetained: 100 },
    { size: 0.075, massRetained: 45 },
  ],
  panMass: 20,
})

describe('decade ticks', () => {
  it('gives 1-2-5 ticks across the range', () => {
    expect(decadeTicks(10, 1000)).toEqual([10, 20, 50, 100, 200, 500, 1000])
  })

  it('is empty for a degenerate range rather than looping', () => {
    expect(decadeTicks(0, 100)).toEqual([])
    expect(decadeTicks(-1, 100)).toEqual([])
    expect(decadeTicks(100, 100)).toEqual([])
  })
})

describe('linear ticks', () => {
  it('gives ROUND numbers, not quarters of the data range', () => {
    // The first version divided the range in four: an envelope to 230 kPa was
    // labelled 57 / 115 / 172 / 230, which no one draws and no one can read a
    // footing stress off.
    expect(linearTicks(0, 230).ticks).toEqual([0, 50, 100, 150, 200, 250])
    expect(linearTicks(0, 163).ticks).toEqual([0, 50, 100, 150, 200])
  })

  it('snaps BOTH ends out, so no data point lands on the frame', () => {
    const a = linearTicks(1.56, 2.01)
    expect(a.lo).toBeLessThanOrEqual(1.56)
    expect(a.hi).toBeGreaterThanOrEqual(2.01)
    expect(a.ticks).toEqual([1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.1])
  })

  it('keeps ticks evenly spaced', () => {
    for (const [lo, hi] of [[0, 7], [0, 0.03], [12, 4800], [-5, 5]] as [number, number][]) {
      const { ticks } = linearTicks(lo, hi)
      expect(ticks.length).toBeGreaterThan(2)
      const step = ticks[1] - ticks[0]
      for (let i = 1; i < ticks.length; i++) {
        expect(ticks[i] - ticks[i - 1]).toBeCloseTo(step, 9)
      }
    }
  })

  it('is empty for a degenerate range rather than looping forever', () => {
    expect(linearTicks(5, 5).ticks).toEqual([])
    expect(linearTicks(10, 1).ticks).toEqual([])
    expect(linearTicks(NaN, 10).ticks).toEqual([])
  })

  it('prints a 2.5 step as 2.5, not 2', () => {
    expect(tickDp(2.5)).toBe(1)
    expect(tickDp(50)).toBe(0)
    expect(tickDp(0.05)).toBe(2)
  })
})

describe('failure envelope chart', () => {
  const r = directShear({ points: SHEAR })
  const d = shearEnvelopeChart(r, SHEAR)

  it('plots one dot per specimen', () => {
    expect(dots(d)).toHaveLength(3)
  })

  it('prints c′, φ′ and R² on the chart', () => {
    const t = texts(d).join(' ')
    expect(t).toMatch(/c' = 20\.0 kPa/)
    expect(t).toMatch(/φ' = 30\.0°/)
    expect(t).toMatch(/R² = /)
  })

  it('DASHES the line outside the tested stress range', () => {
    // Extrapolation should be visible rather than implied — the whole reason
    // the result carries a stress-range caveat.
    const dashed = d.primitives.filter((p) => p.kind === 'line' && p.dash != null && p.stroke === '#0056b3')
    expect(dashed.length).toBeGreaterThanOrEqual(2)
  })

  it('says so on the chart when the fit is poor', () => {
    const bad = directShear({
      points: [
        { normalStress: 50, peakShear: 90 },
        { normalStress: 100, peakShear: 60 },
        { normalStress: 200, peakShear: 140 },
      ],
    })
    const chart = shearEnvelopeChart(bad, [
      { normalStress: 50, peakShear: 90 },
      { normalStress: 100, peakShear: 60 },
      { normalStress: 200, peakShear: 140 },
    ])
    expect(texts(chart).join(' ')).toMatch(/check for an outlier/)
  })

  it('serialises through the shared plan serialiser', () => {
    const svg = planToSvg(d)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).not.toMatch(/NaN|undefined/)
  })
})

describe('consolidation chart', () => {
  const r = consolidationCurve()
  const d = consolidationChart(r)

  it('plots every load increment', () => {
    expect(dots(d)).toHaveLength(8)
  })

  it('marks the fitted break, which is what the result note tells you to check', () => {
    const t = texts(d).join(' ')
    expect(t).toMatch(/σ'p ≈ 200 kPa/)
    const marker = d.primitives.filter((p) => p.kind === 'line' && p.stroke === '#b45309' && p.dash != null)
    expect(marker.length).toBe(1)
  })

  it('prints Cc and Cr', () => {
    expect(texts(d).join(' ')).toMatch(/Cc = 0\.400\s+Cr = 0\.040/)
  })

  it('uses a LOG stress axis', () => {
    // A linear axis hides the straight-line behaviour the reading depends on.
    // Equal decades must occupy equal width: 12.5→125 and 125→1250.
    const ticks = texts(d)
    expect(ticks).toContain('100')
    expect(ticks).toContain('1000')
    const xs = d.primitives
      .filter((p): p is Extract<PlanPrimitive, { kind: 'text' }> => p.kind === 'text')
      .filter((p) => ['10', '100', '1000'].includes(p.text))
      .sort((a, b) => Number(a.text) - Number(b.text))
      .map((p) => p.x)
    expect(xs).toHaveLength(3)
    expect(xs[1] - xs[0]).toBeCloseTo(xs[2] - xs[1], 4)
  })

  it('draws void ratio falling DOWN the page, the drafting convention', () => {
    const circles = d.primitives.filter((p): p is Extract<PlanPrimitive, { kind: 'circle' }> => p.kind === 'circle')
    // Points are emitted in increasing stress, and e falls as σ′ rises, so y
    // must increase along the series.
    for (let i = 1; i < circles.length; i++) {
      expect(circles[i].cy).toBeGreaterThan(circles[i - 1].cy)
    }
  })

  it('survives a result with no rows', () => {
    const empty = { ...r, rows: [] }
    const chart = consolidationChart(empty)
    expect(planToSvg(chart)).not.toMatch(/NaN/)
  })
})

describe('grading chart', () => {
  const d = gradingChart(GRADING)

  it('plots every sieve', () => {
    expect(dots(d)).toHaveLength(7)
  })

  it('runs COARSE TO FINE left to right', () => {
    // The convention on every published grading chart, which is why the size
    // axis runs backwards.
    const circles = d.primitives.filter((p): p is Extract<PlanPrimitive, { kind: 'circle' }> => p.kind === 'circle')
    for (let i = 1; i < circles.length; i++) {
      expect(circles[i].cx).toBeGreaterThan(circles[i - 1].cx)
    }
  })

  it('marks the D2487 fraction boundaries', () => {
    const t = texts(d).join(' ')
    expect(t).toMatch(/gravel \| sand/)
    expect(t).toMatch(/sand \| fines/)
  })

  it('prints the fractions and the shape parameters', () => {
    const t = texts(d).join(' ')
    expect(t).toMatch(/gravel 10%\s+sand 86%\s+fines 4%/)
    expect(t).toMatch(/Cu = /)
  })

  it('says when Cu and Cc are unavailable rather than omitting them', () => {
    const fines = gradation({
      totalMass: 100,
      readings: [
        { size: 4.75, massRetained: 20 },
        { size: 0.425, massRetained: 45 },
        { size: 0.075, massRetained: 20 },
      ],
      panMass: 15,
    })
    expect(texts(gradingChart(fines)).join(' ')).toMatch(/does not reach 10% passing/)
  })

  it('survives an empty grading', () => {
    const empty = gradation({ totalMass: 100, readings: [{ size: 1, massRetained: 100 }] })
    expect(planToSvg(gradingChart(empty))).not.toMatch(/NaN/)
  })
})

describe('nothing drawn escapes the frame', () => {
  // Two separate defects, both found by looking at a render rather than by a
  // passing test: rounding the axes to nice ticks sent the extrapolated
  // envelope off the TOP (τ = 164 kPa at the right edge, y-axis to 150), and
  // the opaque annotation plates hung far enough below their anchor to white
  // out a section of the bottom axis.
  const BOX = { left: 18, top: 8, w: 96, h: 62 }

  const extent = (d: { primitives: PlanPrimitive[] }) => {
    const xs: number[] = []
    const ys: number[] = []
    for (const p of d.primitives) {
      if (p.kind === 'line') { xs.push(p.x1, p.x2); ys.push(p.y1, p.y2) }
      else if (p.kind === 'rect') { xs.push(p.x, p.x + p.w); ys.push(p.y, p.y + p.h) }
      else if (p.kind === 'circle') { xs.push(p.cx - p.r, p.cx + p.r); ys.push(p.cy - p.r, p.cy + p.r) }
    }
    return { xs, ys }
  }

  const charts: [string, { primitives: PlanPrimitive[] }][] = [
    ['failure envelope', shearEnvelopeChart(directShear({ points: SHEAR }), SHEAR)],
    ['consolidation', consolidationChart(consolidationCurve())],
    ['grading', gradingChart(GRADING)],
  ]

  for (const [name, chart] of charts) {
    it(`stays inside the plot area — ${name}`, () => {
      const { xs, ys } = extent(chart)
      expect(Math.min(...xs), 'left').toBeGreaterThanOrEqual(BOX.left - 1e-6)
      expect(Math.max(...xs), 'right').toBeLessThanOrEqual(BOX.left + BOX.w + 1e-6)
      expect(Math.min(...ys), 'top').toBeGreaterThanOrEqual(BOX.top - 1e-6)
      expect(Math.max(...ys), 'bottom').toBeLessThanOrEqual(BOX.top + BOX.h + 1e-6)
    })
  }
})

describe('all three serialise cleanly', () => {
  it('produce valid SVG with no new painting code', () => {
    const charts = [
      shearEnvelopeChart(directShear({ points: SHEAR }), SHEAR),
      consolidationChart(consolidationCurve()),
      gradingChart(GRADING),
    ]
    for (const c of charts) {
      const svg = planToSvg(c)
      expect(svg.startsWith('<svg')).toBe(true)
      expect(svg).toContain('</svg>')
      expect(svg).not.toMatch(/NaN|undefined|Infinity/)
    }
  })
})
