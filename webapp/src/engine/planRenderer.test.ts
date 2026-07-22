import { describe, it, expect } from 'vitest'
import { generateGridModel } from './modelBuilder'
import { buildPlan, planToSvg } from './planRenderer'
import type { RectSection } from './model'

const section: RectSection = { id: 'S1', name: '400×400', b: 400, h: 400, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }

describe('planRenderer — framing plan geometry', () => {
  const model = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3], section, slabThickness: 150 })
  const plan = buildPlan(model)!

  it('derives grid bubbles A/B/C across x and 1/2 down z', () => {
    const labels = plan.primitives.filter((p) => p.kind === 'text').map((p) => (p as { text: string }).text)
    expect(labels).toContain('A'); expect(labels).toContain('B'); expect(labels).toContain('C')  // 3 column lines
    expect(labels).toContain('1'); expect(labels).toContain('2')                                  // 2 rows
  })

  it('draws a column square at each grid node and framing beams', () => {
    const rects = plan.primitives.filter((p) => p.kind === 'rect')
    expect(rects.length).toBe(6)              // 3×2 columns
    const beams = plan.primitives.filter((p) => p.kind === 'line' && (p as { stroke: string }).stroke === '#0f4c92')
    expect(beams.length).toBeGreaterThan(0)   // framing members on the level
  })

  it('emits chained grid dimensions in mm', () => {
    const dims = plan.primitives.filter((p) => p.kind === 'dim') as { text: string }[]
    expect(dims.some((d) => d.text === '6000')).toBe(true)   // 6 m bay → 6000 mm
    expect(dims.some((d) => d.text === '5000')).toBe(true)
  })

  it('bounds enclose every primitive and serialise to valid SVG', () => {
    expect(plan.bounds.maxX).toBeGreaterThan(plan.bounds.minX)
    const svg = planToSvg(plan, 1000)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
    expect(svg).toContain('<text')
    expect(plan.title).toBe('FRAMING PLAN')
  })

  it('foundation plan draws columns dashed (footing outline stage)', () => {
    const f = buildPlan(model, { kind: 'foundation' })!
    expect(f.title).toBe('FOUNDATION PLAN')
    const dashedRects = f.primitives.filter((p) => p.kind === 'rect' && (p as { dash?: number[] }).dash)
    expect(dashedRects.length).toBeGreaterThan(0)
  })
})
