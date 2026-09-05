import { describe, it, expect } from 'vitest'
import { generateGridModel, buildGravityLoads } from '../engine/modelBuilder'
import { designStructure, optimizeStructure } from '../engine/pipeline'
import { modelToFrame3D } from '../engine/modelBridge'
import { analyzeFrame3D } from '../engine/frame3d'
import { modalAnalysis } from '../engine/modal'
import { computeResponseSpectrum } from '../engine/responseSpectrum'
import { runPushoverModel } from '../engine/pushoverModel'
import { runNonlinearFrameModel } from '../engine/nonlinearFrameModel'
import { makeGroundMotion } from '../engine/timeHistoryModel'
import { buildStructureCages } from '../engine/cageBuilder'
import {
  buildAnalysisAppendix, analysisStatus, appendixAvailability, equilibriumRows, comboExpression,
  capacityCurveDrawing, type AppendixInput,
} from './analysisAppendix'

// ─────────────────────────────────────────────────────────────────────────
// The appendix reports ONLY what the engine produced. These build every
// result on one small frame and check the tables say what the results say —
// and that a result never run is carried as unavailable, not invented.
// ─────────────────────────────────────────────────────────────────────────
const section = { id: 's1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }
const model = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3, 3], section, slabThickness: 150 })
model.loads = buildGravityLoads(model, 4.8, 2.4)
const design = designStructure(model, soil)!
const br = modelToFrame3D(model, {})
const analysis = analyzeFrame3D(br.nodes, br.members, br.supports, br.loads, {}, undefined, br.diaphragmGroups, br.shells)!
const modal = modalAnalysis(model, 6)!
const rsa = computeResponseSpectrum(modal, { Ca: 0.44, Cv: 0.64, I: 1, R: 8.5 })
const pushover = runPushoverModel(model, { dir: 0, pattern: 'triangular', rho: 0.015, maxEvents: 12 })
const gm = makeGroundMotion({ kind: 'rampedSine', dt: 0.02, duration: 2, pga: 0.3 * 9.81, freq: 2, dir: 0 })
const nonlinearHinge = {
  inelastic: runNonlinearFrameModel(model, gm, { dir: 'x', zeta: 0.05, b: 0.03, rho: 0.015 }),
  elastic: runNonlinearFrameModel(model, gm, { dir: 'x', zeta: 0.05, elastic: true }),
}
const { cages } = buildStructureCages(model, design)

const full: AppendixInput = { model, design, analysis, modal, rsa, pushover, nonlinearHinge, cages }
const bare: AppendixInput = { model }

describe('availability — nothing is offered that was not run', () => {
  it('a bare model has only the model and loading sections', () => {
    expect(appendixAvailability(bare)).toEqual({
      model: true, loading: true, analysis: false, modal: false, nonlinear: false, pushover: false, optimization: false,
    })
  })
  it('every result switches its section on', () => {
    const a = appendixAvailability(full)
    expect(a.analysis && a.modal && a.pushover && a.nonlinear).toBe(true)
    expect(a.optimization).toBe(false)
  })
  it('an unavailable section is carried with a reason, never with tables', () => {
    const ap = buildAnalysisAppendix(bare)
    for (const s of ap.sections.filter((x) => !x.available)) {
      expect(s.unavailable).toBeTruthy()
      expect(s.tables).toEqual([])
    }
    expect(ap.sections.map((s) => s.letter)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
  })
})

describe('A · analytical model', () => {
  const s = buildAnalysisAppendix(bare).sections[0]
  it('lists every node, member and support', () => {
    const t = (title: string) => s.tables.find((x) => x.title.startsWith(title))!
    expect(t('A.1').rows).toHaveLength(model.nodes.length)
    expect(t('A.2').rows).toHaveLength(model.members.length)
    expect(t('A.3').rows).toHaveLength(model.plates.length)
    expect(t('A.4').rows).toHaveLength(model.supports.length)
    for (const tb of s.tables) for (const r of tb.rows) expect(r).toHaveLength(tb.head.length)
  })
  it('counts what it lists', () => {
    const stat = (l: string) => s.stats!.find((x) => x.label === l)!.value
    expect(stat('Nodes')).toBe(String(model.nodes.length))
    expect(stat('Members')).toBe(String(model.members.length))
    expect(stat('Materials')).toBe('1')
  })
})

describe('B · loading', () => {
  it('names the load cases actually on the model and the combinations actually run', () => {
    const s = buildAnalysisAppendix(full).sections[1]
    const cases = s.tables.find((x) => x.title.startsWith('B.1'))!
    expect(cases.rows.map((r) => r[0])).toEqual(expect.arrayContaining(['D', 'L']))
    const assigns = s.tables.find((x) => x.title.startsWith('B.2'))!
    expect(assigns.rows).toHaveLength(model.loads.length)
    const combos = s.tables.find((x) => x.title.startsWith('B.5'))!
    expect(combos.rows).toHaveLength(analysis.perCombo.length)
    expect(combos.rows[0][1]).toMatch(/D/)
  })
  it('writes a combination the way the code does', () => {
    expect(comboExpression({ D: 1.2, L: 1.6, Lr: 0.5 })).toBe('1.2D + 1.6L + 0.5Lr')
    expect(comboExpression({ D: 0.9, E: -1 })).toBe('0.9D − 1.0E')
  })
})

describe('C · linear static analysis', () => {
  const s = buildAnalysisAppendix(full).sections[2]
  it('balances applied load against reactions on every combination', () => {
    const eq = equilibriumRows(model, analysis)
    expect(eq.length).toBeGreaterThan(0)
    for (const r of eq) expect(r.ok, `${r.combo} residual ${r.residualPct}%`).toBe(true)
    const t = s.tables.find((x) => x.title.startsWith('C.1'))!
    expect(t.rows.every((r) => r[r.length - 1] === 'PASS')).toBe(true)
  })
  it('reports the governing combination\'s reactions at every support', () => {
    const t = s.tables.find((x) => x.title.startsWith('C.2'))!
    expect(t.rows).toHaveLength(model.supports.length)
    // ΣFY of the printed reactions is the frame's weight, upward
    const sumFy = t.rows.reduce((a, r) => a + parseFloat(r[3]), 0)
    expect(sumFy).toBeGreaterThan(0)
  })
  it('gives every node a displacement row and every member a force row', () => {
    expect(s.tables.find((x) => x.title.startsWith('C.4'))!.rows).toHaveLength(model.nodes.length)
    expect(s.tables.find((x) => x.title.startsWith('C.5'))!.rows).toHaveLength(model.members.length)
    const gov = s.tables.find((x) => x.title.startsWith('C.6'))!
    expect(gov.rows).toHaveLength(model.members.length)
    for (const r of gov.rows) expect(analysis.perCombo.some((c) => c.combo.name === r[1])).toBe(true)
  })
})

describe('D · modal', () => {
  it('lists every mode with a cumulative mass that ends at the engine\'s own total', () => {
    const s = buildAnalysisAppendix(full).sections[3]
    const t = s.tables.find((x) => x.title.startsWith('D.1'))!
    expect(t.rows).toHaveLength(modal.modes.length)
    const last = t.rows[t.rows.length - 1]
    expect(parseFloat(last[7])).toBeCloseTo(modal.cumRatio[0] * 100, 0)
    expect(s.tables.some((x) => x.title.startsWith('D.2'))).toBe(true)
  })
})

describe('E and F · nonlinear and pushover', () => {
  const ap = buildAnalysisAppendix(full)
  it('reports the hinge model\'s convergence and yielded hinges as the engine returned them', () => {
    const s = ap.sections[4]
    expect(s.available).toBe(true)
    const conv = s.stats!.find((x) => x.label === 'Convergence')!.value
    expect(conv).toBe(nonlinearHinge.inelastic!.response.converged ? 'every step' : 'NOT every step')
    expect(s.stats!.find((x) => x.label === 'Yielded hinges')!.value).toBe(String(nonlinearHinge.inelastic!.response.yieldedHinges))
  })
  it('draws the capacity curve from the events and lists each hinge as it formed', () => {
    const s = ap.sections[5]
    expect(s.available).toBe(true)
    expect(s.figures!.length).toBeGreaterThan(0)
    const t = s.tables.find((x) => x.title.startsWith('F.2'))!
    expect(t.rows).toHaveLength(Math.max(0, pushover!.result.curve.length - 1))
    expect(s.notes!.some((n) => /No target displacement or performance point/.test(n))).toBe(true)
  })
  it('a capacity curve drawing spans its box and marks the events', () => {
    const d = capacityCurveDrawing([{ x: 0, y: 0 }, { x: 10, y: 100, mark: true }, { x: 20, y: 120 }], { title: 'T', xLabel: 'x', yLabel: 'y' })
    expect(d.bounds.maxX).toBeGreaterThan(d.bounds.minX)
    expect(d.primitives.filter((p) => p.kind === 'circle')).toHaveLength(3)
    expect(d.primitives.some((p) => p.kind === 'path')).toBe(true)
  })
})

describe('G · optimization', () => {
  it('reports the iterations the optimizer ran and the sections it changed', () => {
    const m = generateGridModel({ baysX: [7], baysZ: [6], storeyH: [3], section: { ...section, b: 200, h: 300 }, slabThickness: 150 })
    m.loads = buildGravityLoads(m, 6, 4)
    const result = optimizeStructure(m, soil, {}, 6)!
    const ap = buildAnalysisAppendix({ model: result.model, design: result.design, optimization: { result, before: m.sections } })
    const s = ap.sections[6]
    expect(s.available).toBe(true)
    const hist = s.tables.find((x) => x.title.startsWith('G.1'))!
    expect(hist.rows).toHaveLength(result.steps.length)
    expect(hist.rows[0][0]).toBe('0 (initial)')
    const diff = s.tables.find((x) => x.title.startsWith('G.2'))!
    expect(diff.rows.length).toBeGreaterThan(0)
    expect(s.notes![0]).toMatch(/GROWS/)
  }, 60000)
})

describe('the status table', () => {
  it('says NOT RUN for what was not run, and never PASS for a section that merely exists', () => {
    const rows = analysisStatus(bare)
    expect(rows.every((r) => r.verdict === 'NOT RUN')).toBe(true)
  })
  it('reports each verdict from its own result', () => {
    const rows = analysisStatus(full)
    const at = (c: string) => rows.find((r) => r.check.startsWith(c))!
    expect(at('Static equilibrium').verdict).toBe('PASS')
    expect(at('Linear analysis').verdict).toBe('PASS')
    expect(['PASS', 'ADVISORY']).toContain(at('Modal').verdict)
    expect(at('Pushover').verdict).toBe('COMPLETE')
    expect(at('Beam design').verdict).toBe(design.beams.every((b) => b.ok) ? 'PASS' : 'FAIL')
    expect(at('Column design').verdict).toBe(design.columns.every((b) => b.ok) ? 'PASS' : 'FAIL')
    expect(at('Optimization').verdict).toBe('NOT RUN')
    expect(['PASS', 'ADVISORY']).toContain(at('Final detailing').verdict)
  })
})
