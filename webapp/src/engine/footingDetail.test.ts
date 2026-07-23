import { describe, it, expect } from 'vitest'
import { buildFootingDetail, type FootingDetailInput } from './footingDetail'
import { planToSvg, type PlanPrimitive } from './planRenderer'

const base: FootingDetailInput = {
  mark: 'WF-1', B: 1.2, H: 0.35, cover: 75, barDia: 16, bars: 8, barSpacing: 150,
  colB: 300, colH: 300, colBars: 8, colBarDia: 16, foundingElev: -1.05,
}
const texts = (p: PlanPrimitive[]) => p.filter((x) => x.kind === 'text').map((x) => (x as { text: string }).text)

describe('footingDetail — column-footing detail sheet', () => {
  const d = buildFootingDetail(base, { detailNo: '1', sheetRef: 'S-05' })

  it('draws both views (PLAN + SECTION A-A) and a titled detail tag', () => {
    const t = texts(d.primitives)
    expect(t).toContain('PLAN'); expect(t).toContain('SECTION A-A'); expect(t).toContain('A')
    expect(d.title).toBe('COLUMN FOOTING DETAIL — WF-1')
    expect(t).toContain('S-05'); expect(t).toContain('1:25 MTS')
  })

  it('lays the two views side by side (section right of the plan)', () => {
    const rects = d.primitives.filter((p) => p.kind === 'rect') as { x: number; w: number }[]
    expect(rects.some((r) => Math.abs(r.x + base.B / 2) < 1e-6)).toBe(true)   // plan footing at x=-B/2
    expect(rects.some((r) => r.x > base.B && Math.abs(r.w - base.B) < 1e-6)).toBe(true)   // section footing shifted right
  })

  it('labels reinforcement with count + diameter (Ø) both ways and vertical bars', () => {
    const t = texts(d.primitives)
    expect(t.some((s) => s === '8-16mmØ BOTHWAY')).toBe(true)
    expect(t.some((s) => s === '8-16mmØ VERT. BARS')).toBe(true)
  })

  it('draws each bar as an OUTLINE tube (closed rebar path), both ways', () => {
    // every bar is one closed rebar-coloured path; plan has 2·bars (both ways)
    const rebar = d.primitives.filter((p) => p.kind === 'path' && (p as { stroke?: string }).stroke === '#b45309')
    expect(rebar.length).toBeGreaterThanOrEqual(2 * base.bars)
    expect(rebar.every((p) => (p as { closed?: boolean }).closed)).toBe(true)
    // filled rebar circles = n section bar-ends + colBars plan vertical bars
    const ends = d.primitives.filter((p) => p.kind === 'circle' && (p as { fill?: string }).fill === '#b45309')
    expect(ends.length).toBe(base.bars + (base.colBars ?? 8))
  })

  it('shows the full ring of column vertical bars in plan (not just corners)', () => {
    const ends = d.primitives.filter((p) => p.kind === 'circle' && (p as { fill?: string }).fill === '#b45309')
    // colBars column dots + n section bar-ends; the column ring alone must be colBars
    expect(ends.length - base.bars).toBe(base.colBars)
  })

  it('labels the column ties as LATERAL TIES with a spacing schedule', () => {
    const t = texts(d.primitives)
    expect(t.some((s) => s.startsWith('LATERAL TIES = ⌀'))).toBe(true)
    expect(t.some((s) => s.includes('2@50'))).toBe(true)
  })

  it('mat bars are straight by default and hooked only when endHook="90"', () => {
    const straight = buildFootingDetail({ ...base, endHook: 'none' }, {})
    const hooked = buildFootingDetail({ ...base, endHook: '90' }, {})
    // hooked mat bars add vertices → more total path vertices than straight runs
    const verts = (dw: typeof straight) => dw.primitives.filter((p) => p.kind === 'path').reduce((m, p) => m + (p as { cmds: unknown[] }).cmds.length, 0)
    expect(verts(hooked)).toBeGreaterThan(verts(straight))
  })

  it('chained sub-dimensions in plan and a depth chain in section (mm)', () => {
    const dims = d.primitives.filter((p) => p.kind === 'dim') as { text: string }[]
    expect(dims.some((x) => x.text === '1200 mm')).toBe(true)   // overall B
    expect(dims.some((x) => x.text === '300')).toBe(true)       // column sub-dim (col width)
    expect(dims.some((x) => x.text === '450')).toBe(true)       // edge sub-dim (B−col)/2
    expect(dims.some((x) => x.text === '350')).toBe(true)       // footing depth H
  })

  it('marks the natural grade, a gravel base and the T.O.F. elevation', () => {
    const t = texts(d.primitives)
    expect(t).toContain('NATURAL GRADE LINE')
    expect(t).toContain('T.O.F. EL -1.05 m')
    // gravel aggregate stones (unfilled, stone stroke) under the footing
    expect(d.primitives.some((p) => p.kind === 'circle' && (p as { stroke?: string }).stroke === '#64748b')).toBe(true)
  })

  it('bounds enclose everything and serialise to valid SVG', () => {
    expect(d.bounds.maxX).toBeGreaterThan(d.bounds.minX)
    const svg = planToSvg(d, 1200)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
  })
})
