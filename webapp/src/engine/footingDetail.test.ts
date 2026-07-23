import { describe, it, expect } from 'vitest'
import { buildFootingDetail, type FootingDetailInput } from './footingDetail'
import { planToSvg, type PlanPrimitive } from './planRenderer'

const base: FootingDetailInput = {
  mark: 'WF-1', B: 1.8, H: 0.4, cover: 75, barDia: 16, bars: 8, barSpacing: 200,
  colB: 400, colH: 400, dowelDia: 20, foundingElev: -1.5,
}
const texts = (p: PlanPrimitive[]) => p.filter((x) => x.kind === 'text').map((x) => (x as { text: string }).text)

describe('footingDetail — typical footing detail sheet', () => {
  const d = buildFootingDetail(base, { detailNo: '1', sheetRef: 'S-05' })

  it('draws both views (PLAN + SECTION A-A) and a titled detail tag', () => {
    const t = texts(d.primitives)
    expect(t).toContain('PLAN')
    expect(t).toContain('SECTION A-A')
    expect(t).toContain('A')                       // A-A cut flags
    expect(d.title).toBe('TYPICAL FOOTING DETAIL — WF-1')
    expect(t).toContain('S-05'); expect(t).toContain('NTS')
  })

  it('lays out the two views side by side (section to the right of the plan)', () => {
    // plan is centred on x=0; the section sits entirely at positive x
    const rects = d.primitives.filter((p) => p.kind === 'rect') as { x: number; w: number }[]
    const planFooting = rects.find((r) => Math.abs(r.x + base.B / 2) < 1e-6)!   // x = -B/2
    expect(planFooting).toBeTruthy()
    const sectionFooting = rects.find((r) => r.x > base.B)!                     // shifted right by ≥ B
    expect(sectionFooting.w).toBeCloseTo(base.B, 6)
  })

  it('lays the bottom mat both ways (n bars) with a matching note', () => {
    // plan: n bars ∥x + n bars ∥y = 2n rebar lines
    const rebar = d.primitives.filter((p) => p.kind === 'line' && (p as { stroke?: string }).stroke === '#b45309')
    expect(rebar.length).toBeGreaterThanOrEqual(2 * base.bars)
    // section: n perpendicular bar ends drawn as filled circles
    const barEnds = d.primitives.filter((p) => p.kind === 'circle' && (p as { fill?: string }).fill === '#b45309')
    expect(barEnds.length).toBe(base.bars)
    expect(texts(d.primitives).some((s) => s.includes('⌀16') && s.includes('BOTH WAYS'))).toBe(true)
  })

  it('dimensions the footing width B and depth H in mm', () => {
    const dims = d.primitives.filter((p) => p.kind === 'dim') as { text: string }[]
    expect(dims.some((x) => x.text === '1800 mm')).toBe(true)   // B
    expect(dims.some((x) => x.text === '400 mm')).toBe(true)    // H
  })

  it('shows column dowels and a top-of-footing elevation with units', () => {
    const t = texts(d.primitives)
    expect(t.some((s) => s.startsWith('DOWELS'))).toBe(true)
    expect(t).toContain('T.O.F. EL -1.50 m')
  })

  it('bounds enclose everything and serialise to valid SVG', () => {
    expect(d.bounds.maxX).toBeGreaterThan(d.bounds.minX)
    const svg = planToSvg(d, 1200)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
  })
})
