import { describe, it, expect } from 'vitest'
import { generateGridModel, buildGravityLoads } from '../engine/modelBuilder'
import { designStructure, optimizeStructure, peakUtilisation } from '../engine/pipeline'
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
  capacityCurveDrawing, finalModelConsistency, APPENDIX_TITLES, LETTERS, type AppendixInput,
} from './analysisAppendix'
import { computeSeismic, buildECases, stabilityCheck, type DriftRow, type StabilityRow } from '../engine/seismic'
import { storeyWeightBreakdown } from '../engine/seismic'
import { DIAGRAM_W } from '../engine/analysisDiagram'

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
      // H is about the MODEL, not about a result, so it is available from the
      // moment there is a model to validate.
      qa: true,
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
    expect(ap.sections.map((s) => s.letter)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])
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
    const hist = s.tables.find((x) => x.title.includes('Iteration history'))!
    expect(hist.rows).toHaveLength(result.steps.length)
    expect(hist.rows[0][0]).toBe('0 (initial)')
    const diff = s.tables.find((x) => x.title.includes('Initial vs final design'))!
    expect(diff.rows.length).toBeGreaterThan(0)
    expect(s.notes![0]).toMatch(/GROWS/)

    // TWO COUNTS, TWO COLUMNS. `grown` is what the grow step acted on;
    // `changes` is what came out different once the hierarchy was enforced and
    // the design re-run — and the economy pass changes geometry while growing
    // nothing. Under one heading the first was read as the second: a step
    // reading 6 sat beside a G.3 trail listing 12.
    expect(hist.head).toContain('Sections grown')
    expect(hist.head).not.toContain('Sections changed')
    if (result.steps.some((x) => x.changes?.length)) {
      expect(hist.head).toContain('Geometry changes')
      const iGrown = hist.head.indexOf('Sections grown')
      const iChanged = hist.head.indexOf('Geometry changes')
      // and each column carries its OWN number
      const trail = s.tables.find((x) => x.title.includes('What each iteration changed'))
      const listed = trail ? trail.rows.length : 0
      const counted = hist.rows.reduce((n, r) => n + (Number(r[iChanged]) || 0), 0)
      expect(counted).toBe(listed)
      expect(hist.rows.some((r) => r[iGrown] !== r[iChanged])).toBe(true)
      expect(hist.note).toMatch(/geometry changes/i)
    }
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

describe('G · the optimizer trail the pipeline records', () => {
  const optimizeSmall = () => {
    const m = generateGridModel({ baysX: [7], baysZ: [6], storeyH: [3], section: { ...section, b: 200, h: 300 }, slabThickness: 150 })
    m.loads = buildGravityLoads(m, 6, 4)
    return { before: m.sections, result: optimizeStructure(m, soil, {}, 6)! }
  }

  it('the initial-vs-final table reads the engine\'s own initial model, not whatever the caller passes', () => {
    const { result } = optimizeSmall()
    // a deliberately WRONG before — every entry 999×999. If the table read the
    // caller's sections instead of the result's initialModel, it would show them.
    const wrongBefore = result.model.sections.map((s) => ({ ...s, b: 999, h: 999 }))
    const ap = buildAnalysisAppendix({ model: result.model, design: result.design, optimization: { result, before: wrongBefore } })
    const s = ap.sections[6]
    const diff = s.tables.find((x) => x.title.includes('Initial vs final design'))!
    expect(diff.rows.length).toBeGreaterThan(0)
    for (const row of diff.rows) {
      expect(row.join(' ')).not.toContain('999')
      expect(row.join(' ')).not.toContain('no section changed')
    }
  }, 60000)

  it('the trail lists the accepted changes per step, with from ≠ to, and quantities both ends', () => {
    const { result } = optimizeSmall()
    const ap = buildAnalysisAppendix({ model: result.model, design: result.design, optimization: { result } })
    const s = ap.sections[6]
    const trail = s.tables.find((x) => x.title.includes('What each iteration changed'))!
    expect(trail.head).toEqual(['Iteration', 'Kind', 'Element', 'From', 'To'])
    const grown = trail.rows.filter((r) => r[1] === 'section')
    expect(grown.length).toBeGreaterThan(0)
    for (const r of grown) expect(r[3]).not.toBe(r[4])
    const qty = s.tables.find((x) => x.title.includes('Material quantities'))!
    expect(qty.head).toEqual(['Item', 'Initial', 'Final', 'Change'])
    expect(qty.rows.map((r) => r[0])).toContain('Concrete')
    // the two ends are the pipeline's own designs — concrete exists on both
    const concrete = qty.rows.find((r) => r[0] === 'Concrete')!
    expect(parseFloat(concrete[1])).toBeGreaterThan(0)
    expect(parseFloat(concrete[2])).toBeGreaterThan(0)
  }, 60000)

  // ─────────────────────────────────────────────────────────────────────
  // "ECONOMY" IS NOT AN OBJECTIVE FUNCTION.
  //
  // The section claimed the optimizer weighed economy and then printed a
  // quantities table where the concrete went UP, with nothing to reconcile
  // the two. Both halves are fixed here: the objective is written down
  // (minimum SECTION SIZE subject to compliance — cost is not a term), and
  // the quantities note says why growing into compliance costs concrete.
  // ─────────────────────────────────────────────────────────────────────
  it('states the objective and its constraints before any result', () => {
    const { result } = optimizeSmall()
    const ap = buildAnalysisAppendix({ model: result.model, design: result.design, optimization: { result } })
    const s = ap.sections[6]
    const obj = s.tables[0]
    expect(obj.title).toContain('Objective function and constraints')
    expect(obj.head).toEqual(['Role', 'Term', 'How it is measured'])
    const roles = obj.rows.map((r) => r[0])
    expect(roles).toContain('Objective')
    expect(roles).toContain('Constraint')
    // and it says what is NOT being minimised, which is the claim that was wrong
    const excluded = obj.rows.find((r) => r[0] === 'Not in the objective')!
    expect(excluded[1]).toMatch(/cost/i)
    expect(excluded[1]).toMatch(/[Cc]oncrete volume/)
    expect(obj.note).toMatch(/outcomes/i)
  }, 60000)

  it('the quantities table weighs the reinforcement and explains the concrete', () => {
    const { result } = optimizeSmall()
    const ap = buildAnalysisAppendix({ model: result.model, design: result.design, optimization: { result } })
    const s = ap.sections[6]
    const qty = s.tables.find((x) => x.title.includes('Material quantities'))!
    const items = qty.rows.map((r) => r[0])
    expect(items).toContain('Reinforcement — total fabricated')
    expect(items).toContain('Reinforcement — total purchased (laps + off-cuts)')
    expect(items).toContain('Reinforcement intensity')
    expect(items).toContain('Formwork')
    // one row per bar Ø the take-off actually found, weighed not guessed
    const perDia = qty.rows.filter((r) => /^Reinforcement ⌀\d+$/.test(r[0]))
    expect(perDia.length).toBeGreaterThan(0)
    for (const r of perDia) expect(r[1]).toMatch(/ kg$/)
    // the per-Ø weights add up to the fabricated total (rounding aside)
    const total = parseFloat(qty.rows.find((r) => r[0] === 'Reinforcement — total fabricated')![2])
    const summed = perDia.reduce((n, r) => n + parseFloat(r[2]), 0)
    expect(Math.abs(summed - total)).toBeLessThanOrEqual(perDia.length)
    // and the note reconciles the direction the volume moved with the checks —
    // whichever way it moved, the note has to say why, never just print it
    const fails0 = result.steps[0].fails
    const concrete = qty.rows.find((r) => r[0] === 'Concrete')!
    const rose = parseFloat(concrete[2]) > parseFloat(concrete[1])
    expect(qty.note).toMatch(rose ? /Concrete rises because/ : /shrink phase took back more/)
    if (rose) {
      expect(qty.note).toContain(`${fails0} check`)
      expect(qty.note).toMatch(/intensity/)
    }
    expect(qty.note).toContain(`failing ${fails0} check`)
  }, 60000)

  it('the stats carry how far the design travelled, not only whether it arrived', () => {
    const { result } = optimizeSmall()
    const ap = buildAnalysisAppendix({ model: result.model, design: result.design, optimization: { result } })
    const peak = ap.sections[6].stats!.find((x) => x.label === 'Peak utilisation')!
    expect(peak.value).toMatch(/^\d+\.\d\d → \d+\.\d\d$/)
    const [a, b] = peak.value.split(' → ').map(Number)
    expect(a).toBeCloseTo(peakUtilisation(result.initialDesign!), 2)
    expect(b).toBeCloseTo(peakUtilisation(result.design), 2)
  }, 60000)

  it('a saved run from before the engine carried the initial state still prints the section diff from the caller\'s sections, with no quantities table', () => {
    const { before, result } = optimizeSmall()
    const legacy = structuredClone(result) as unknown as Record<string, unknown>
    delete legacy.initialDesign
    delete legacy.initialModel
    const ap = buildAnalysisAppendix({
      model: result.model, design: result.design,
      optimization: { result: legacy as unknown as typeof result, before },
    })
    const s = ap.sections[6]
    const diff = s.tables.find((x) => x.title.includes('Initial vs final design'))!
    expect(diff.rows.length).toBeGreaterThan(0)
    expect(s.tables.find((x) => x.title.includes('Material quantities'))).toBeUndefined()
  }, 60000)
})

// ─────────────────────────────────────────────────────────────────────────
// TRACEABILITY — the joins between the stages, and the chain that leads to
// the seismic forces. The appendix reported a lumped mass and a base shear
// and nothing in between, so "where did the mass come from" and "which base
// shear was the design made for" each took three pages to answer.
// ─────────────────────────────────────────────────────────────────────────
describe('B.6 · mass source', () => {
  const tbl = () => buildAnalysisAppendix(full).sections.find((s) => s.key === 'loading')!
    .tables.find((t) => t.title.startsWith('B.6'))

  it('itemises the seismic weight and totals to W = M·g', () => {
    const t = tbl()!
    expect(t).toBeDefined()
    const last = t.rows[t.rows.length - 1]!
    expect(last[0]).toBe('Total')
    const wb = storeyWeightBreakdown(model)
    const W = wb.reduce((s, r) => s + r.w, 0)
    expect(Number(last[5])).toBeCloseTo(W, 0)
    expect(Number(last[6])).toBeCloseTo(W / 9.81, 1)
    // a row per level, and each row's items add up to its own weight
    expect(t.rows).toHaveLength(wb.length + 1)
    for (let k = 0; k < wb.length; k++) {
      const r = t.rows[k]!
      expect(Number(r[1]) + Number(r[2]) + Number(r[3]) + Number(r[4])).toBeCloseTo(Number(r[5]), 0)
    }
  })

  it('is the same W the static seismic force is built on', () => {
    const s = computeSeismic(model, { Ca: 0.44, Cv: 0.64, I: 1, R: 8.5, dir: 'x' })!
    const W = storeyWeightBreakdown(model).reduce((a, r) => a + r.w, 0)
    expect(s.W).toBeCloseTo(W, 6)
  })
})

describe('D.2b · seismic force reconciliation', () => {
  const seismic = {
    x: computeSeismic(model, { Ca: 0.44, Cv: 0.64, I: 1, R: 8.5, dir: 'x' })!,
    z: computeSeismic(model, { Ca: 0.44, Cv: 0.64, I: 1, R: 8.5, dir: 'z' })!,
  }
  const t = () => buildAnalysisAppendix({ ...full, seismic }).sections.find((s) => s.key === 'modal')!
    .tables.find((x) => x.title.startsWith('D.2b'))!

  it('puts the static and the modal base shears in one table, with the ratio', () => {
    const tbl = t()
    const label = (n: string) => tbl.rows.find((r) => r[0] === n)!
    expect(Number(label('Seismic weight W (kN)')[1])).toBeCloseTo(seismic.x.W, 0)
    expect(Number(label('Static base shear V (kN)')[1])).toBeCloseTo(seismic.x.V, 0)
    expect(label('Modal CQC (kN)')).toBeDefined()
    expect(label('V_CQC / V_static')).toBeDefined()
    // and it says which forces the design was actually run for
    expect(Number(label('Design base shear used (kN)')[1])).toBeCloseTo(seismic.x.V, 0)
    expect(tbl.note).toMatch(/STATIC/)
  })

  it('says whether §208.6.4.2 scaling would be needed, and by how much', () => {
    expect(t().note).toMatch(/§208\.6\.4\.2/)
  })
})

describe('the final-model consistency check', () => {
  it('proves the structure that was detailed is the one that was analysed', () => {
    const rows = finalModelConsistency(full)
    expect(rows.length).toBeGreaterThanOrEqual(3)
    expect(rows.every((r) => r.verdict === 'PASS')).toBe(true)
    const names = rows.map((r) => r.check)
    expect(names).toContain('Design sections = analysis model')
    expect(names).toContain('Schedule = placed cages')
    // every PASS states the count it compared — not just an assurance
    for (const r of rows) expect(r.detail).toMatch(/\d/)
  })

  it('FAILS when a scheduled member has no cage', () => {
    const short = { ...full, cages: cages.filter((c) => c.member !== design.columns[0].id) }
    const row = finalModelConsistency(short).find((r) => r.check === 'Schedule = placed cages')!
    expect(row.verdict).toBe('FAIL')
    expect(row.detail).toContain(design.columns[0].id)
  })

  it('is carried in the status table, so the report cannot omit it', () => {
    const checks = analysisStatus(full).map((r) => r.check)
    expect(checks).toContain('Design sections = analysis model')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// H · MODEL QA/QC — the checks that are about the MODEL rather than a result.
// `validateMesh` has always run (it gates the solve) but it reported into the
// editor and nowhere else, so a report could not say whether the model it was
// built from was sound.
// ─────────────────────────────────────────────────────────────────────────
describe('H · model QA/QC', () => {
  const qa = (input: AppendixInput = full) =>
    buildAnalysisAppendix(input).sections.find((s) => s.key === 'qa')!

  it('is available from the moment there is a model, and lists the rules by name', () => {
    const s = qa(bare)
    expect(s.available).toBe(true)
    const v = s.tables.find((t) => t.title.startsWith('H.1'))!
    expect(v).toBeDefined()
    // a sound model says so with the counts it checked, not with a word
    expect(v.rows[0]![3]).toMatch(/\d+ nodes, \d+ members/)
  })

  it('reports a real finding as a row, with its rule name and refs', () => {
    const broken = { ...full, model: { ...model, loads: [...model.loads, { kind: 'member-udl' as const, member: 'ghost', w: 5, cat: 'D' as const }] } }
    const v = qa(broken).tables.find((t) => t.title.startsWith('H.1'))!
    const row = v.rows.find((r) => r[0] === 'load-missing-target')!
    expect(row).toBeDefined()
    expect(row[1]).toBe('ERROR')
    expect(qa(broken).notes?.[0]).toContain('validation error')
  })

  it('says how many iterations a converged run actually took', () => {
    const c = qa().tables.find((t) => t.title.startsWith('H.2'))
    // the fixture runs a pushover, so there is at least one iterative run
    expect(c).toBeDefined()
    expect(c!.rows.some((r) => /Pushover/.test(r[0]!))).toBe(true)
    // a run that does not iterate in that sense says so rather than inventing one
    expect(c!.note).toMatch(/dash is a run that does not iterate/)
  })

  it('builds the compliance matrix FROM the status rows, so it cannot claim a check that never ran', () => {
    const status = analysisStatus(full)
    const m = qa().tables.find((t) => t.title.startsWith('H.3'))!
    expect(m.rows).toHaveLength(status.length)
    for (const r of status) {
      const row = m.rows.find((x) => x[0] === r.check)!
      expect(row[2]).toBe(r.verdict)
    }
    // NOT RUN survives into the matrix rather than becoming a pass
    const bareM = qa(bare).tables.find((t) => t.title.startsWith('H.3'))!
    expect(bareM.rows.some((r) => r[2] === 'NOT RUN')).toBe(true)
    expect(bareM.rows.every((r) => r[2] !== 'PASS' || r[1] !== '—')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// THE TABLES NEEDED A PICTURE TO BE READ AGAINST.
//
// The appendix was complete and unauditable: `c0.1.0` in a reaction table
// means nothing until it can be found on a drawing of the structure, and an
// envelope saying the peak moment is 97 kN·m says nothing about whether it is
// where a moment belongs. A is the model, B is what was applied to it, C is
// what came back.
// ─────────────────────────────────────────────────────────────────────────
describe('the figures', () => {
  const ap = buildAnalysisAppendix(full)
  const sec = (k: string, i: AppendixInput = full) =>
    (i === full ? ap : buildAnalysisAppendix(i)).sections.find((s) => s.key === k)!
  const captions = (k: string, i: AppendixInput = full) => (sec(k, i).figures ?? []).map((f) => f.caption)
  const seisX = computeSeismic(model, { Ca: 0.44, Cv: 0.64, I: 1, R: 8.5, dir: 'x' })!
  const seisZ = computeSeismic(model, { Ca: 0.44, Cv: 0.64, I: 1, R: 8.5, dir: 'z' })!

  it('A opens with the analytical model, and asks for the room to letter it', () => {
    const figs = sec('model').figures!
    expect(figs).toHaveLength(1)
    expect(figs[0].caption).toMatch(/^A\.1 Analytical model/)
    // ids on a figure squeezed to the default 95 mm are unreadable, so this
    // one claims a taller slot
    expect(figs[0].maxH).toBeGreaterThan(95)
    const t = figs[0].drawing.primitives
      .flatMap((p) => (p.kind === 'text' ? [p.text] : []))
    expect(t).toContain(model.nodes[0].id)
    expect(t).toContain(model.members[0].id)
  })

  it('B draws one figure per load category the model carries, and none for the rest', () => {
    const cats = [...new Set(model.loads.map((l) => l.cat))]
    expect(captions('loading')).toHaveLength(cats.length)
    for (const c of cats) expect(captions('loading').join(' ')).toContain(c)
    // nothing invented: a category with no assignment gets no figure
    expect(captions('loading').join(' ')).not.toMatch(/WIND/)
  })

  // ─────────────────────────────────────────────────────────────────────
  // THE REPORT SHOWED ONE SEISMIC FIGURE FOR A RUN THAT ENVELOPED EIGHT.
  //
  // A model carries ONE lateral pattern — the primary direction, untorsioned,
  // because that is what the viewport overlay and the drift check read. The
  // analysis solves every case the E/W builders produced, one FEM run per
  // combination per case. Drawn from the model's own loads alone, the report
  // could not show that, and eleven solved cases looked like they had never
  // been analysed.
  // ─────────────────────────────────────────────────────────────────────
  describe('every directional lateral case', () => {
    const eCases = buildECases(model, seisX.loads, seisZ.loads, { dirs: ['+X', '-X', '+Z', '-Z'], torsion: true })
    const withCases = { ...full, lateral: eCases }
    const caps = () => captions('loading', withCases)

    it('draws one figure per case, on top of the per-category ones', () => {
      expect(eCases).toHaveLength(8)
      const cats = [...new Set(model.loads.map((l) => l.cat))]
      expect(caps()).toHaveLength(cats.length + eCases.length)
      for (const c of eCases) expect(caps().join(' ')).toContain(c.name)
    })

    it('prints each case resultant, so ⟳ and ⟲ are told apart by number', () => {
      // The two differ only by a torsion increment that is small beside the
      // storey force, so the PICTURES look alike — the caption is what
      // distinguishes them, and a reader has to be able to check it.
      const cw = caps().find((c) => c.includes('E+X⟳'))!
      const ccw = caps().find((c) => c.includes('E+X⟲'))!
      expect(cw).toMatch(/ΣFx = /)
      expect(cw).toMatch(/Mt = /)
      expect(cw).not.toBe(ccw)
    })

    it('B.7 lists every case with its resultant', () => {
      const t = buildAnalysisAppendix(withCases).sections.find((s) => s.key === 'loading')!
        .tables!.find((x) => x.title.startsWith('B.7'))!
      expect(t.rows).toHaveLength(eCases.length)
      // On this symmetric plan the ⟳/⟲ pair of a direction is ±0.05·L⊥·V and
      // nothing else: the storey force itself contributes no torque, because
      // its equal split lands on a geometric centroid that IS the mass one.
      const mt = (n: string) => Number(t.rows.find((r) => r[0] === n)![4])
      expect(mt('E+X⟳')).toBeCloseTo(-mt('E+X⟲'), 6)
    })

    it('adds nothing when there is only one case to draw', () => {
      const cats = [...new Set(model.loads.map((l) => l.cat))]
      expect(captions('loading', { ...full, lateral: [eCases[0]] })).toHaveLength(cats.length)
    })
  })

  it('C draws the deflected shape, the reactions and the three force diagrams', () => {
    const caps = captions('analysis')
    expect(caps).toHaveLength(5)
    expect(caps[0]).toMatch(/Deflected shape/)
    expect(caps[1]).toMatch(/Support reactions/)
    expect(caps.slice(2).join(' ')).toMatch(/Bending moment Mz/)
    expect(caps.slice(2).join(' ')).toMatch(/Shear Vy/)
    expect(caps.slice(2).join(' ')).toMatch(/Axial force N/)
    // every one names the combination it belongs to — a diagram of an unnamed
    // load case is not evidence of anything
    const govName = analysis.perCombo[analysis.govIdx].combo.name
    for (const c of caps) expect(c).toContain(govName)
  })

  it('C says the deflected shape is the element shape function, not the loaded shape', () => {
    expect(captions('analysis')[0]).toMatch(/cubic shape function/)
    expect(captions('analysis')[0]).toMatch(/not included/)
  })

  it('a model with no analysis carries no result figures at all', () => {
    const ap2 = buildAnalysisAppendix(bare)
    expect(ap2.sections.find((s) => s.key === 'analysis')!.figures).toBeUndefined()
    // …but the model figure does not need an analysis to be drawn
    expect(ap2.sections.find((s) => s.key === 'model')!.figures).toHaveLength(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// D, E and F get their pictures too. The dynamics sections were the worst
// of it: a mode is a SHAPE and D.1 could only give its period, a response
// history reported as three peak numbers cannot say whether the structure
// rang down or ratcheted, and a pushover's whole finding is the PATTERN of
// hinges, which F.2 lists one row at a time.
// ─────────────────────────────────────────────────────────────────────────
describe('the dynamics figures', () => {
  const ap = buildAnalysisAppendix(full)
  const sec = (k: string) => ap.sections.find((s) => s.key === k)!
  const captions = (k: string) => (sec(k).figures ?? []).map((f) => f.caption)

  it('D draws the first three modes, each naming its own period', () => {
    const caps = captions('modal')
    expect(caps).toHaveLength(3)
    caps.forEach((c, k) => {
      expect(c).toContain(`Mode ${k + 1}`)
      expect(c).toContain(modal.modes[k].period.toFixed(3))
    })
    // three, not one per mode solved — a fourth rarely changes the reading
    expect(modal.modes.length).toBeGreaterThan(3)
  })

  it('D says the shape is normalised and drawn as chords, so neither is mistaken for a result', () => {
    expect(captions('modal')[0]).toMatch(/normalised/)
    expect(captions('modal')[0]).toMatch(/straight chords/)
  })

  it('E draws both traces and the frame the history actually ran on', () => {
    const caps = captions('nonlinear')
    expect(caps).toHaveLength(3)
    expect(caps[0]).toMatch(/Control-node displacement/)
    expect(caps[1]).toMatch(/Base shear/)
    expect(caps[2]).toMatch(/EQUIVALENT PLANE FRAME/)
    // and it says WHY that frame is not the model — its member ids are its own
    expect(caps[2]).toMatch(/combined|condensed/i)
  })

  it('E adapts when nothing yielded, instead of printing an empty hinge map', () => {
    const yielded = nonlinearHinge.inelastic!.response.hinges.some((h) => h.yielded)
    const cap = captions('nonlinear')[2]
    expect(cap).toMatch(yielded ? /Where the hinges yielded/ : /No hinge yielded/)
  })

  it('F draws the hinge locations numbered in formation order', () => {
    const caps = captions('pushover')
    const hingeFig = caps.find((c) => c.startsWith('F.2f'))!
    expect(hingeFig).toMatch(/yield sequence/)
    expect(hingeFig).toContain(`${pushover!.result.hinges.length} hinge`)
    // and it tells the reader what to look FOR, which the table cannot
    expect(hingeFig).toMatch(/beams with the columns intact/)
    expect(hingeFig).toMatch(/soft|one storey|row of them/)
  })

  it('the pushover curve uses the shared chart renderer, at the appendix\'s own type size', () => {
    // it used to draw its own 100 × 60 box, which the painter then magnified
    // 1.8× — pushover figures carried type half again as large as every other
    const curve = sec('pushover').figures!.find((f) => f.caption.startsWith('F.1'))!
    expect(curve.drawing.bounds.maxX).toBe(DIAGRAM_W)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// APPENDIX H COULD NOT BE TICKED, SO IT NEVER PRINTED.
//
// `ExportReportDialog` carried a hand-written list of seven keys and a
// hand-written ['A'..'G'] to letter them. Appendix H (Model QA/QC) shipped
// after it, so the section existed, was available, was built — and was
// absent from `include` on every export, which drops it. This pins the list
// to its source of truth so the next section cannot repeat it.
// ─────────────────────────────────────────────────────────────────────────
describe('the export dialog and the appendix agree on what exists', () => {
  it('every appendix section has a title and a letter, and the letters are the print order', () => {
    const keys = Object.keys(APPENDIX_TITLES) as (keyof typeof APPENDIX_TITLES)[]
    const letters = keys.map((k) => LETTERS[k])
    expect(letters).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])
    // …and the built appendix comes back in that same order
    expect(buildAnalysisAppendix(bare).sections.map((s) => s.letter)).toEqual(letters)
  })

  it('availability answers for every key — a section with no entry can never be ticked', () => {
    const a = appendixAvailability(full)
    for (const k of Object.keys(APPENDIX_TITLES) as (keyof typeof APPENDIX_TITLES)[])
      expect(typeof a[k]).toBe('boolean')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// THE REPORT SHOULD NOT MAKE A READER ASK HOW THE FORCE GOT THERE.
//
// B.3 tabulated the storey forces and never said what produced them, nor how
// each level's force reached its nodes — so both had to be traced in the
// source to be known. These pin the two statements.
// ─────────────────────────────────────────────────────────────────────────
describe('B.3/B.4 state how the lateral force is distributed', () => {
  const seis = {
    x: computeSeismic(model, { Ca: 0.44, Cv: 0.64, I: 1, R: 8.5, dir: 'x' })!,
    z: computeSeismic(model, { Ca: 0.44, Cv: 0.64, I: 1, R: 8.5, dir: 'z' })!,
  }
  const noteOf = (prefix: string, input: AppendixInput) =>
    buildAnalysisAppendix(input).sections.find((s) => s.key === 'loading')!
      .tables!.find((t) => t.title.startsWith(prefix))!.note ?? ''

  it('B.3 gives the §208.5.5 vertical distribution, Ft included', () => {
    const n = noteOf('B.3', { ...full, seismic: seis })
    expect(n).toMatch(/Fx = \(V − Ft\)·wx·hx \/ Σ\(wi·hi\)/)
    expect(n).toMatch(/0\.07·T·V/)
    expect(n).toMatch(/T > 0\.7/)
  })

  it('B.3 gives the horizontal basis, and its fallback', () => {
    const n = noteOf('B.3', { ...full, seismic: seis })
    expect(n).toMatch(/E·I of the column BELOW/)
    expect(n).toMatch(/12·E·I\/h³/)          // the equivalence it rests on
    expect(n).toMatch(/equal split/)          // and what happens without columns
  })

  it('no longer claims the force is divided equally', () => {
    // It was, until the stiffness share-out replaced it; a report that still
    // said so would be a documented lie rather than a stale comment.
    const n = noteOf('B.7', { ...full, lateral: buildECases(model, seis.x.loads, seis.z.loads, { dirs: ['+X', '-X'], torsion: true }) })
    expect(n).not.toMatch(/divided EQUALLY/)
    expect(n).toMatch(/centre of RIGIDITY/)
  })
})

describe('D.3b — the P-Δ requirement reaches the report', () => {
  const drift: DriftRow[] = [
    { elevation: 3, hs: 3000, ds: 6, dM: 0, limit: 0, ok: true },
    { elevation: 6, hs: 3000, ds: 3, dM: 0, limit: 0, ok: true },
  ]
  const force = [{ elevation: 3, F: 40 }, { elevation: 6, F: 60 }]
  const rows = (p: { R: number; Z?: number }) => stabilityCheck(model, drift, force, p)!
  const table = (stability: StabilityRow[] | null) =>
    buildAnalysisAppendix({ ...full, drift, stability }).sections.find((s) => s.key === 'modal')!
      .tables!.find((t) => t.title.startsWith('D.3b'))

  it('prints θ per storey with the clause and the formula', () => {
    const t = table(rows({ R: 8.5 }))!
    expect(t.rows).toHaveLength(2)
    expect(t.title).toContain('§208.5.10.2')
    expect(t.note).toMatch(/θ = Px·Δs \/ \(Vx·hs\)/)
    // the printed θ is the engine's, not a second opinion
    expect(t.rows[0][5]).toBe(rows({ R: 8.5 })[0].theta.toFixed(3))
  })

  it('says REQUIRED and names the storeys when θ passes 0.10', () => {
    // Shrink Vx until θ crosses; Px is fixed by the model.
    const hot = stabilityCheck(model, drift, [{ elevation: 3, F: 1 }, { elevation: 6, F: 1 }], { R: 8.5 })!
    expect(hot.some((r) => r.pDeltaRequired)).toBe(true)
    const t = table(hot)!
    expect(t.rows.some((r) => r[7] === 'REQUIRED')).toBe(true)
    expect(t.note).toMatch(/second-order analysis is REQUIRED/)
    expect(t.note).toMatch(/EL 3\.00/)
  })

  it('says a first-order run satisfies the clause when no storey does', () => {
    const t = table(rows({ R: 8.5 }))!
    expect(rows({ R: 8.5 }).some((r) => r.pDeltaRequired)).toBe(false)
    expect(t.note).toMatch(/a first-order analysis satisfies the clause/)
    expect(t.note).not.toMatch(/REQUIRED/)
  })

  it('is absent, not empty, when no stability check ran', () => {
    // The control: a run without it must not publish a table implying θ ≤ 0.10.
    expect(table(null)).toBeUndefined()
    expect(buildAnalysisAppendix(bare).sections.find((s) => s.key === 'modal')!.tables ?? [])
      .not.toContainEqual(expect.objectContaining({ title: expect.stringContaining('D.3b') }))
  })
})
