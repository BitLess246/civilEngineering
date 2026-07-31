import { describe, it, expect } from 'vitest'
import { liquefactionChart, TARGET_FS } from './liquefactionPlot'
import { liquefactionProfile } from './liquefaction'
import { finesByLayer, finesMap } from './finesContent'
import { planToSvg } from '../planRenderer'
import type { PlanPrimitive } from '../planRenderer'
import type { Borehole, Sample } from './model'
import type { LayerUnitWeight } from './sptProfile'

const texts = (d: { primitives: PlanPrimitive[] }) =>
  d.primitives.filter((p): p is Extract<PlanPrimitive, { kind: 'text' }> => p.kind === 'text').map((p) => p.text)

const circles = (d: { primitives: PlanPrimitive[] }) =>
  d.primitives.filter((p): p is Extract<PlanPrimitive, { kind: 'circle' }> => p.kind === 'circle')

const UW: Record<string, LayerUnitWeight> = {
  l1: { gamma: 18, gammaSat: 20 },
  l2: { gamma: 18, gammaSat: 20 },
  l3: { gamma: 17, gammaSat: 19 },
}

function hole(over: Partial<Borehole> = {}): Borehole {
  return {
    id: 'bh', name: 'BH-01', kind: 'borehole', actualDepth: 15, diameter: 100,
    groundwaterDepth: 1.5,
    layers: [
      { id: 'l1', depthTop: 0, depthBottom: 3, name: 'Silty Sand', symbol: 'SM' },
      { id: 'l2', depthTop: 3, depthBottom: 9, name: 'Poorly Graded Sand', symbol: 'SP' },
      { id: 'l3', depthTop: 9, depthBottom: 15, name: 'Lean Clay', symbol: 'CL' },
    ],
    samples: [],
    spt: [
      { id: 'n1', depth: 1.0, blows: [2, 3, 3], penetration: [150, 150, 150], hammer: 'safety', rodLength: 3 },
      { id: 'n2', depth: 4.5, blows: [2, 3, 3], penetration: [150, 150, 150], hammer: 'safety', rodLength: 6 },
      { id: 'n3', depth: 6.0, blows: [3, 4, 4], penetration: [150, 150, 150], hammer: 'safety', rodLength: 7.5 },
      { id: 'n4', depth: 12.0, blows: [5, 8, 9], penetration: [150, 150, 150], hammer: 'safety', rodLength: 13.5 },
    ],
    ...over,
  }
}

const PROFILE = liquefactionProfile(hole(), UW, { amax: 0.4, magnitude: 7.5 })

describe('FS profile chart', () => {
  const d = liquefactionChart(PROFILE, { waterTable: 1.5, holeDepth: 15 })

  it('plots one dot per EVALUATED test, not per test', () => {
    // Two of the four tests are skipped (above the water table, and clay).
    expect(circles(d)).toHaveLength(2)
  })

  it('runs depth DOWN the page', () => {
    const dots = circles(d).slice().sort((a, b) => a.cy - b.cy)
    // n2 at 4.5 m must sit above n3 at 6.0 m.
    expect(dots[0].cy).toBeLessThan(dots[1].cy)
  })

  it('shades the liquefiable half-plane rather than only marking points', () => {
    const shade = d.primitives.filter((p) => p.kind === 'rect' && p.fill === '#fee2e2')
    expect(shade).toHaveLength(1)
    // It must start at the frame's left edge and stop at FS = 1.
    const r = shade[0] as Extract<PlanPrimitive, { kind: 'rect' }>
    expect(r.x).toBeCloseTo(18, 6)
    expect(r.w).toBeGreaterThan(0)
  })

  it('STOPS the shading at the base of the hole', () => {
    // Shading past the last metre drilled claims a verdict over ground nobody
    // sampled, in the half of the chart a reader is most likely to skim.
    const shade = d.primitives.find((p) => p.kind === 'rect' && p.fill === '#fee2e2') as
      Extract<PlanPrimitive, { kind: 'rect' }>
    // The axis runs to 20 m; the hole stops at 15, so the shade covers 15/20.
    expect(shade.h / 62).toBeCloseTo(15 / 20, 3)
  })

  it('labels the design-margin line instead of leaving it as furniture', () => {
    expect(texts(d).join(' ')).toMatch(/target 1\.3/)
  })

  it('draws the FS = 1 line and the design margin', () => {
    const one = d.primitives.filter((p) => p.kind === 'line' && p.stroke === '#b91c1c' && p.dash == null)
    const target = d.primitives.filter((p) => p.kind === 'line' && p.stroke === '#047857' && p.dash != null)
    expect(one).toHaveLength(1)
    expect(target).toHaveLength(1)
    expect(TARGET_FS).toBe(1.3)
  })

  it('SHOWS the tests it did not evaluate, with the reason', () => {
    // A profile that silently drops the clay looks like a shorter hole.
    const t = texts(d).join(' ')
    expect(t).toMatch(/not saturated/)
    expect(t).toMatch(/cohesive — not this method/)
  })

  it('marks the water table', () => {
    expect(texts(d).join(' ')).toMatch(/WT 1\.5 m/)
  })

  it('marks where DRILLING STOPPED', () => {
    // Round depth ticks run the axis past the hole (20 m for a 15 m hole), and
    // the empty space below otherwise reads as ground that was checked and
    // passed. A layer that was never drilled cannot be cleared.
    expect(texts(d).join(' ')).toMatch(/base of hole 15\.0 m/)
  })

  it('prints the LPI and the worst FS', () => {
    const t = texts(d).join(' ')
    expect(t).toMatch(/LPI = /)
    expect(t).toMatch(/min FS = 0\.\d\d/)
    expect(t).toMatch(/liquefiable 4\.5–6\.0 m/)
  })

  it('says so plainly when nothing triggers', () => {
    const safe = liquefactionProfile(hole(), UW, { amax: 0.02, magnitude: 6 })
    expect(texts(liquefactionChart(safe)).join(' ')).toMatch(/no test triggers/)
  })

  it('CAPS a very high FS at the axis and flags the clipped point', () => {
    // Without the caret a clipped dot sitting on the frame reads as marginal.
    const safe = liquefactionProfile(hole(), UW, { amax: 0.01, magnitude: 5.5 })
    const chart = liquefactionChart(safe)
    const xs = circles(chart).map((c) => c.cx)
    expect(Math.max(...xs)).toBeLessThanOrEqual(18 + 96 + 1e-6)
    expect(texts(chart)).toContain('›')
  })

  it('survives a hole where nothing could be evaluated', () => {
    const dry = liquefactionProfile(hole({ groundwaterDepth: undefined }), UW, { amax: 0.4, magnitude: 7.5 })
    const chart = liquefactionChart(dry)
    expect(texts(chart).join(' ')).toMatch(/nothing evaluated/)
    expect(planToSvg(chart)).not.toMatch(/NaN|undefined|Infinity/)
  })

  it('serialises cleanly through the shared plan serialiser', () => {
    const svg = planToSvg(d)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).not.toMatch(/NaN|undefined|Infinity/)
  })

  it('keeps everything drawn inside the frame', () => {
    const xs: number[] = []
    const ys: number[] = []
    for (const p of d.primitives) {
      if (p.kind === 'line') { xs.push(p.x1, p.x2); ys.push(p.y1, p.y2) }
      else if (p.kind === 'rect') { xs.push(p.x, p.x + p.w); ys.push(p.y, p.y + p.h) }
      else if (p.kind === 'circle') { xs.push(p.cx - p.r, p.cx + p.r); ys.push(p.cy - p.r, p.cy + p.r) }
    }
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(18 - 1e-6)
    expect(Math.max(...xs)).toBeLessThanOrEqual(18 + 96 + 1e-6)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(8 - 1e-6)
    expect(Math.max(...ys)).toBeLessThanOrEqual(8 + 62 + 1e-6)
  })
})

// ── Fines content from the sieve record ───────────────────────────────────

const sieveSample = (id: string, name: string, layerId: string, depth: number, retained: number): Sample => ({
  id, name, layerId, type: 'disturbed', depthTop: depth, depthBottom: depth + 0.45,
  tests: [{
    id: `${id}-t`, type: 'sieve', standard: 'd6913', status: 'complete',
    data: {
      totalMass: 100, panMass: retained,
      readings: [{ size: 4.75, massRetained: 20 }, { size: 0.075, massRetained: 80 - retained }],
    },
  }],
})

describe('fines content comes from the sieve, not from nowhere', () => {
  it('reads the fines percentage off a completed sieve', () => {
    const bh = hole({ samples: [sieveSample('s1', 'S-01', 'l2', 4.0, 30)] })
    const rows = finesByLayer(bh)
    expect(rows).toHaveLength(1)
    expect(rows[0].layerId).toBe('l2')
    expect(rows[0].fines).toBeCloseTo(30, 6)
    expect(rows[0].sampleName).toBe('S-01')
  })

  it('returns NOTHING for a layer with no sieve rather than a default', () => {
    // A guessed fines content is unconservative in the direction that matters:
    // it makes a silty sand look like a stronger clean sand.
    expect(finesByLayer(hole())).toEqual([])
  })

  it('averages several sieves in one layer and lists them all', () => {
    const bh = hole({
      samples: [sieveSample('s1', 'S-01', 'l2', 4.0, 20), sieveSample('s2', 'S-02', 'l2', 7.0, 40)],
    })
    const rows = finesByLayer(bh)
    expect(rows[0].fines).toBeCloseTo(30, 6)
    expect(rows[0].fromSamples.map((f) => f.sampleName)).toEqual(['S-01', 'S-02'])
  })

  it('attributes a sample by DEPTH when it has no layer id', () => {
    const s = { ...sieveSample('s1', 'S-01', 'l2', 4.0, 30), layerId: undefined }
    expect(finesByLayer(hole({ samples: [s] }))[0].layerId).toBe('l2')
  })

  it('drops a sieve whose masses do not reconcile instead of throwing', () => {
    const broken: Sample = {
      id: 's9', name: 'S-09', layerId: 'l2', type: 'disturbed', depthTop: 4, depthBottom: 4.45,
      tests: [{
        id: 't9', type: 'sieve', standard: 'd6913', status: 'complete',
        data: { totalMass: 0, panMass: 0, readings: [{ size: 4.75, massRetained: 10 }] },
      }],
    }
    expect(() => finesByLayer(hole({ samples: [broken] }))).not.toThrow()
  })

  it('feeds the profile, and a silty layer comes out with a HIGHER FS', () => {
    const bh = hole({ samples: [sieveSample('s1', 'S-01', 'l2', 4.0, 30)] })
    const clean = liquefactionProfile(bh, UW, { amax: 0.4, magnitude: 7.5 })
    const withFines = liquefactionProfile(bh, UW, {
      amax: 0.4, magnitude: 7.5, finesContent: finesMap(finesByLayer(bh)),
    })
    const a = clean.rows.find((r) => r.testId === 'n3')!.result!
    const b = withFines.rows.find((r) => r.testId === 'n3')!.result!
    expect(b.factorOfSafety!).toBeGreaterThan(a.factorOfSafety!)
    expect(b.notes.join(' ')).not.toMatch(/treated as CLEAN SAND/)
  })
})
