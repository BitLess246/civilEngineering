import { describe, it, expect } from 'vitest'
import { generateGridModel } from '../engine/modelBuilder'
import { designStructure, optimizeStructure } from '../engine/pipeline'
import { modelToFrame3D } from '../engine/modelBridge'
import { analyzeFrame3D } from '../engine/frame3d'
import { modalAnalysis } from '../engine/modal'
import type { RectSection } from '../engine/model'
import { buildModelReport } from './modelReport'

// The workflow sections must be built ONLY from engine state: a run that was
// made prints its actual numbers, a run that was never made prints NOT RUN
// (or is left out) — never a fabricated pass. This file pins that contract on
// the standard example frame: real analysis + modal + optimizer runs, then the
// assembled payload.

const section: RectSection = { id: 'S1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }

function makeModel() {
  const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section, slabThickness: 200 })
  m.loads = m.plates.flatMap((p) => [
    { kind: 'area' as const, plate: p.id, q: 4.8, cat: 'D' as const },
    { kind: 'area' as const, plate: p.id, q: 2.4, cat: 'L' as const },
  ])
  return m
}

describe('report workflow sections (engine-state only)', () => {
  const model = makeModel()
  const br = modelToFrame3D(model)
  const analysis = analyzeFrame3D(br.nodes, br.members, br.supports, br.loads, {}, undefined, br.diaphragmGroups, br.shells)
  const modal = modalAnalysis(model, 6)
  const initialDesign = designStructure(model, soil)!
  const opt = optimizeStructure(model, soil)!
  // the UI adopts the optimizer's model+design pair before printing — mirror that
  const model2 = opt.model
  const design = opt.design
  const props: [string, string][] = [['Column grid', '6 m × 5 m']]
  const rpt = buildModelReport(model2, design, props, soil, null, null, {
    analysis, nodeOrder: br.nodes, modal, opt, tryBars: true,
  })

  it('executive panels pass only what actually ran, and name the optimizer honestly', () => {
    expect(rpt.exec).toBeDefined()
    const labels = rpt.exec!.analysis.map((s) => s.label)
    expect(labels).toContain('Linear static (3D FEM)')
    expect(rpt.exec!.analysis.find((s) => s.label === 'Linear static (3D FEM)')!.ok).toBe(true)
    expect(rpt.exec!.analysis.find((s) => s.label === 'Static equilibrium')!.ok).toBe(true)
    expect(rpt.exec!.analysis.find((s) => s.label === 'Modal')!.ok).toBe(true)
    // pushover was never run in this fixture — NOT RUN, never a pass
    expect(rpt.exec!.analysis.find((s) => s.label === 'Pushover')!.ok).toBeNull()
    expect(rpt.exec!.optimization!.ok).toBe(opt.converged)
  })

  it('static equilibrium: ΣApplied balances ΣReactions under the 1% gate', () => {
    const e = rpt.linear!.equilibrium!
    expect(e.ok).toBe(true)
    expect(e.residPct).toBeLessThan(1)
    for (const axis of [0, 1, 2] as const)
      expect(Math.abs(e.applied[axis] + e.reacted[axis])).toBeLessThan(1e-6 * Math.max(1, Math.abs(e.applied[1])))
  })

  it('governing forces mirror the design rows one-to-one', () => {
    const rows = rpt.linear!.governingForces!.rows
    expect(rows).toHaveLength(design.beams.length + design.columns.length)
  })

  it('displacement levels map through the bridge node order (guard satisfied)', () => {
    const d = rpt.linear!.displacements!
    expect(d.rows.length).toBeGreaterThan(0)
    // one row per distinct node Y elevation, ascending
    const levels = d.rows.map((r) => Number(r[0]))
    expect([...levels].sort((a, b) => a - b)).toEqual(levels)
  })

  it('modal table carries every mode; coverage note matches the engine cumulative ratio', () => {
    expect(rpt.modal).toBeDefined()
    expect(rpt.modal!.table.rows).toHaveLength(modal!.modes.length)
    expect(rpt.modal!.coverage).toEqual(modal!.cumRatio)
  })

  it('optimizer section: iteration steps recorded, initial-vs-final covers exactly the changed geometry', () => {
    expect(rpt.optimization).toBeDefined()
    expect(rpt.optimization!.converged).toBe(opt.converged)
    expect(rpt.optimization!.steps.rows).toHaveLength(opt.steps.length)
    const changed = opt.initialModel!.sections.filter((s, i) => {
      const t = opt.model.sections[i]
      return t && (s.b !== t.b || s.h !== t.h || s.shape !== t.shape)
    })
    const changedPlates = opt.initialModel!.plates.filter((p, i) => {
      const q = opt.model.plates[i]
      return q && p.thickness !== q.thickness
    })
    expect(rpt.optimization!.initialVsFinal.rows).toHaveLength(changed.length + changedPlates.length)
    // every initial-vs-final row must name a real change (no padding rows)
    for (const r of rpt.optimization!.initialVsFinal.rows) expect(r[1]).not.toBe(r[2])
    expect(rpt.optimization!.totals[0].label).toBe('Concrete (m³)')
    expect(rpt.optimization!.totals[0].after).toBe(design.totals.concrete.toFixed(2))
  })

  it('traceability rows exist for the governing members and carry bar text', () => {
    expect(rpt.trace!.length).toBeGreaterThan(0)
    expect(rpt.trace!.length).toBeLessThanOrEqual(12)
    for (const t of rpt.trace!) {
      expect(t.provided).toMatch(/⌀/)
      expect(t.demand.length).toBeGreaterThan(0)
      expect(t.ok).not.toBe(false)   // the fixture design passes
    }
  })

  it('status table: PASS for runs made, NOT RUN for runs skipped, COMPLETE for the optimizer', () => {
    const st = Object.fromEntries(rpt.status!.map((s) => [s.check, s.status]))
    expect(st['Linear analysis (3D FEM)']).toBe('PASS')
    expect(st['Pushover analysis']).toBe('NOT RUN')
    expect(st['Biaxial pushover']).toBe('NOT RUN')
    expect(st['Optimization']).toBe('COMPLETE')
    expect(st['Final detailing']).toBe('PASS')
  })

  it('appendices are lettered gap-free A, B, C… with rectangular tables', () => {
    const aps = rpt.appendices!
    expect(aps.length).toBeGreaterThanOrEqual(3)
    aps.forEach((ap, i) => expect(ap.letter).toBe(String.fromCharCode(65 + i)))
    for (const ap of aps) for (const t of ap.tables) for (const r of t.rows) expect(r).toHaveLength(t.head.length)
    // the model appendix carries the full node list
    const nodes = aps.find((ap) => ap.title === 'Analytical model')!
    expect(nodes.tables.find((t) => t.title === 'Nodes')!.rows).toHaveLength(model.nodes.length)
  })

  it('without extras the payload keeps the old shape (no workflow fields)', () => {
    const plain = buildModelReport(model, initialDesign, props, soil)
    expect(plain.exec).toBeUndefined()
    expect(plain.modelSummary).toBeUndefined()
    expect(plain.loading).toBeUndefined()
    expect(plain.linear).toBeUndefined()
    expect(plain.modal).toBeUndefined()
    expect(plain.optimization).toBeUndefined()
    expect(plain.trace).toBeUndefined()
    expect(plain.status).toBeUndefined()
    expect(plain.appendices).toBeUndefined()
  })
})
