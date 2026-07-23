import { describe, it, expect } from 'vitest'
import { columnSectionPrimitives } from './columnSection'
import { planToSvg, type PlanPrimitive } from './planRenderer'

describe('columnSection — engine port of the report ColumnSchematic', () => {
  it('draws the full ring of vertical bars at the given centre/scale', () => {
    const P: PlanPrimitive[] = []
    columnSectionPrimitives(P, 5, 2, 0.5, { b: 375, h: 400, cover: 40, barDia: 20, tieDia: 10, bars: 6 })
    const dots = P.filter((p) => p.kind === 'circle')
    expect(dots.length).toBe(6)                                   // 2 top + 2 bottom + 2 side-mid
    expect(dots.every((p) => Math.abs((p as { cx: number }).cx - 5) <= 0.26)).toBe(true)   // centred at x=5
  })

  it('strokes the perimeter tie + crossties with round joins (no offset-tube artefacts)', () => {
    const P: PlanPrimitive[] = []
    columnSectionPrimitives(P, 0, 0, 0.4, { b: 400, h: 400, cover: 40, barDia: 20, tieDia: 10, bars: 4 })
    const strokes = P.filter((p) => p.kind === 'path' && (p as { fill?: string }).fill === 'none' && (p as { join?: string }).join === 'round')
    expect(strokes.length).toBeGreaterThanOrEqual(2)             // tie ring + 135° hook (4-bar: no crossties)
  })

  it('honours caller colours (orange rebar for the footing sheet)', () => {
    const P: PlanPrimitive[] = []
    columnSectionPrimitives(P, 0, 0, 0.4, { b: 400, h: 400, cover: 40, barDia: 20, tieDia: 10, bars: 4 }, { concrete: '#fff', outline: '#1e293b', rebar: '#b45309' })
    expect(P.some((p) => p.kind === 'circle' && (p as { fill?: string }).fill === '#b45309')).toBe(true)
    expect(P.some((p) => p.kind === 'path' && (p as { stroke?: string }).stroke === '#b45309')).toBe(true)
    expect(P.some((p) => p.kind === 'path' && (p as { fill?: string }).fill === '#fff')).toBe(true)   // white column
  })

  it('serialises as part of a drawing to valid SVG', () => {
    const P: PlanPrimitive[] = []
    columnSectionPrimitives(P, 0, 0, 0.4, { b: 400, h: 400, cover: 40, barDia: 20, tieDia: 10, bars: 6 })
    const svg = planToSvg({ primitives: P, bounds: { minX: -0.3, minY: -0.3, maxX: 0.3, maxY: 0.3 } }, 400)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('stroke-linejoin="round"')
  })
})
