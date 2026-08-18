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

// ─────────────────────────────────────────────────────────────────────────
// HOOK LEGS TO THEIR REAL DIMENSION — §425.3.2 gives the seismic-hook
// extension beyond the bend as max(6·db, 75) mm on the TIE diameter. The
// section used to draw both the 135° corner hook and the crosstie stubs from
// drawing constants (`rw * 1.6`, `stub * 1.9`), so it read correctly as a
// diagram while none of its hook legs was the length the schedule quotes.
// ─────────────────────────────────────────────────────────────────────────
describe('columnSection — hook legs are §425.3.2 lengths, not drawing constants', () => {
  /** The two tangent legs of the 135° corner hook, in drawing units. */
  const cornerHookLegs = (P: PlanPrimitive[]) =>
    (P.filter((p) => p.kind === 'path'
      && (p as { cmds: unknown[] }).cmds.length === 2) as { cmds: { x: number; y: number }[] }[])
      .map(({ cmds: [a, b] }) => Math.hypot(b.x - a.x, b.y - a.y))

  it('draws the corner hook legs at max(6·dt, 75) — the 75 floor for a ⌀10 tie', () => {
    const P: PlanPrimitive[] = []
    // side 0.4 m for a 400 mm column → 1 mm = 0.001 drawing units
    columnSectionPrimitives(P, 0, 0, 0.4, { b: 400, h: 400, cover: 40, barDia: 20, tieDia: 10, bars: 4 })
    const legs = cornerHookLegs(P)
    expect(legs).toHaveLength(2)
    // 6 × 10 = 60 < 75, so the floor governs
    for (const l of legs) expect(l).toBeCloseTo(75 / 1000, 9)
  })

  it('lets 6·dt govern once the tie is big enough', () => {
    const P: PlanPrimitive[] = []
    // ⌀16 tie → 6 × 16 = 96 > 75
    columnSectionPrimitives(P, 0, 0, 0.4, { b: 400, h: 400, cover: 40, barDia: 25, tieDia: 16, bars: 4 })
    for (const l of cornerHookLegs(P)) expect(l).toBeCloseTo(96 / 1000, 9)
  })

  it('scales the leg with the drawing, not with the bar radius', () => {
    // The same column drawn half the size halves the leg — it is a real length
    // being scaled, not a constant multiple of however big the bar dot is.
    const big: PlanPrimitive[] = [], small: PlanPrimitive[] = []
    const sec = { b: 400, h: 400, cover: 40, barDia: 20, tieDia: 10, bars: 4 }
    columnSectionPrimitives(big, 0, 0, 0.4, sec)
    columnSectionPrimitives(small, 0, 0, 0.2, sec)
    expect(cornerHookLegs(small)[0]).toBeCloseTo(cornerHookLegs(big)[0] / 2, 9)
  })

  it('keeps a crosstie stub short of the bar it returns to', () => {
    // A narrow column: the extension would otherwise be drawn past the far bar,
    // reporting a tie that cannot be bent rather than a longer hook.
    const P: PlanPrimitive[] = []
    columnSectionPrimitives(P, 0, 0, 0.15, { b: 150, h: 150, cover: 20, barDia: 12, tieDia: 10, bars: 6 })
    const crossties = P.filter((p) => p.kind === 'path'
      && (p as { cmds: unknown[] }).cmds.length > 4) as { cmds: { x: number; y: number }[] }[]
    for (const t of crossties) {
      const xs = t.cmds.map((c) => c.x), ys = t.cmds.map((c) => c.y)
      // every point stays inside the concrete outline
      expect(Math.max(...xs.map(Math.abs))).toBeLessThanOrEqual(0.075 + 1e-9)
      expect(Math.max(...ys.map(Math.abs))).toBeLessThanOrEqual(0.075 + 1e-9)
    }
  })
})
