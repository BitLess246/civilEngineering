import { describe, it, expect } from 'vitest'
import { buildColumnSection, columnSectionPrimitives } from './columnSection'
import { planToSvg, type PlanPrimitive } from './planRenderer'

const texts = (p: PlanPrimitive[]) => p.filter((x) => x.kind === 'text').map((x) => (x as { text: string }).text)

describe('columnSection — engine port of the report ColumnSchematic', () => {
  const d = buildColumnSection({ b: 375, h: 400, cover: 40, barDia: 20, tieDia: 10, bars: 6, tieSpacing: 200 })

  it('labels SECTION with the bar note and b/h dimensions', () => {
    const t = texts(d.primitives)
    expect(t).toContain('SECTION')
    expect(t.some((s) => s.includes('6 ⌀20') && s.includes('ties ⌀10'))).toBe(true)
    const dims = d.primitives.filter((p) => p.kind === 'dim') as { text: string }[]
    expect(dims.some((x) => x.text === 'b = 375 mm')).toBe(true)
    expect(dims.some((x) => x.text === 'h = 400 mm')).toBe(true)
  })

  it('draws the full ring of vertical bars (6 filled dots)', () => {
    const dots = d.primitives.filter((p) => p.kind === 'circle' && (p as { fill?: string }).fill === '#37526e')
    expect(dots.length).toBe(6)
  })

  it('draws the perimeter tie as a filled even-odd ring plus crosstie ribbons', () => {
    const ties = d.primitives.filter((p) => p.kind === 'path' && (p as { fill?: string }).fill === '#37526e')
    expect(ties.length).toBeGreaterThanOrEqual(2)   // ring + ≥1 crosstie + the 135° hook
    expect(ties.some((p) => (p as { fillRule?: string }).fillRule === 'evenodd')).toBe(true)
  })

  it('serialises to valid SVG', () => {
    const svg = planToSvg(d, 400)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
    expect(svg).toContain('fill-rule="evenodd"')
  })

  it('columnSectionPrimitives appends to an existing drawing at a given centre/scale', () => {
    const P: PlanPrimitive[] = []
    columnSectionPrimitives(P, 5, 2, 0.5, { b: 400, h: 400, cover: 40, barDia: 20, tieDia: 10, bars: 4 })
    const dots = P.filter((p) => p.kind === 'circle')
    expect(dots.length).toBe(4)   // 4 corner bars
    expect(dots.every((p) => Math.abs((p as { cx: number }).cx - 5) <= 0.26)).toBe(true)   // centred at x=5
  })
})
