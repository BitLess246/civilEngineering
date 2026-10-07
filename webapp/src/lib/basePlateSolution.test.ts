import { describe, it, expect } from 'vitest'
import { generateGridModel, buildGravityLoads } from '../engine/modelBuilder'
import { designStructure } from '../engine/pipeline'
import { basePlateRowSolution, basePlateContext } from './basePlateSolution'
import { buildBasePlateDetail } from '../engine/basePlateDetail'
import type { RectSection } from '../engine/model'
import type { PlanPrimitive } from '../engine/planRenderer'

const steel: RectSection = {
  id: 'S1', name: 'W310x79', b: 306, h: 310, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40,
  material: 'steel', shape: 'W310x79', steelFy: 345, steelFu: 448,
}
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }
const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section: steel })
m.loads = [...buildGravityLoads(m, 4.8, 2.4), ...m.nodes.filter((n) => n.y > 0).map((n) => ({ kind: 'node' as const, node: n.id, Fx: 30, cat: 'D' as const }))]
const d = designStructure(m, soil)!
const row = d.basePlates[0]!
const ctx = basePlateContext(m, row)

describe('basePlateRowSolution — the schedule row, worked', () => {
  const steps = basePlateRowSolution(row, ctx.col, ctx.fc, ctx.Fy)
  const flat = JSON.stringify(steps)
  it('walks bearing → axial thickness → base moment (both axes) → plate → weld → rods → verdict', () => {
    const t = steps.map((s) => s.title)
    expect(t[0]).toContain('Design forces')
    expect(t).toContainEqual(expect.stringContaining('§J8'))
    expect(t).toContainEqual(expect.stringContaining('strong axis'))
    expect(t).toContainEqual(expect.stringContaining('weak axis'))
    expect(t).toContainEqual(expect.stringContaining('Column to plate'))
    expect(t).toContainEqual(expect.stringContaining('Anchor rods'))
    expect(t[t.length - 1]).toBe('Verdict')
  })
  it('prints the engine numbers', () => {
    expect(ctx.col.d).toBe(307)
    expect(ctx.fc).toBe(28)
    expect(flat).toContain(`${Math.round(row.design.N)} \\\\times ${Math.round(row.design.B)} \\\\times ${row.tAdopt}`)
    expect(flat).toContain(row.moment!.strong.name)
    expect(flat).toContain(`w = ${row.weld.w}`)
    expect(flat).toContain(row.anchors!.check.governs)
  })
})

describe('buildBasePlateDetail — the plate as designed', () => {
  const dr = buildBasePlateDetail({ row, col: ctx.col })
  const texts = dr.primitives.flatMap((p) => (p.kind === 'text' ? [p.text] : []))
  it('names the plate, the rods and the weld at their designed sizes', () => {
    expect(texts).toContain(`PL ${Math.round(row.design.N)}×${Math.round(row.design.B)}×${row.tAdopt} (A36)`)
    expect(texts).toContain(`${row.anchors!.n}-⌀${row.anchors!.da} A307 HEADED`)
    expect(texts).toContain(`${row.weld.w} E70XX FILLET ALL ROUND`)
    const dims = dr.primitives.flatMap((p) => (p.kind === 'dim' ? [p.text] : []))
    expect(dims).toContain(`hef ${row.anchors!.hef}`)
    expect(dims).toContain(`N = ${Math.round(row.design.N)}`)
  })
  it('places four rods at ±rodX, ±rodY of the plate centre in plan', () => {
    const rods = dr.primitives.filter((p): p is Extract<PlanPrimitive, { kind: 'circle' }> => p.kind === 'circle' && Math.abs(p.r - row.anchors!.da / 2) < 1e-9)
    expect(rods).toHaveLength(4)
    const xs = [...new Set(rods.map((r) => r.cx.toFixed(6)))].map(Number).sort((a, b) => a - b)
    const ys = [...new Set(rods.map((r) => r.cy.toFixed(6)))].map(Number).sort((a, b) => a - b)
    expect(xs[1]! - xs[0]!).toBeCloseTo(2 * row.design.rodX, 6)
    expect(ys[1]! - ys[0]!).toBeCloseTo(2 * row.design.rodY, 6)
  })
  it('every primitive is finite and inside the sheet bounds', () => {
    const b = dr.bounds
    for (const p of dr.primitives) {
      const pts = p.kind === 'rect' ? [[p.x, p.y], [p.x + p.w, p.y + p.h]] : p.kind === 'circle' ? [[p.cx, p.cy]] : p.kind === 'text' ? [[p.x, p.y]] : p.kind === 'line' ? [[p.x1, p.y1], [p.x2, p.y2]] : []
      for (const [x, y] of pts) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true)
        expect(x).toBeGreaterThanOrEqual(b.minX - 1e-6); expect(x).toBeLessThanOrEqual(b.maxX + 1e-6)
        expect(y).toBeGreaterThanOrEqual(b.minY - 1e-6); expect(y).toBeLessThanOrEqual(b.maxY + 1e-6)
      }
    }
  })
})
