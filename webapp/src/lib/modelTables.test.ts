import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { modelResultTables, flattenRows, analysisSections } from './modelTables'
import { buildScheduleWorkbook } from './scheduleExcel'
import { generateGridModel, buildGravityLoads } from '../engine/modelBuilder'
import { modelToFrame3D } from '../engine/modelBridge'
import { analyzeFrame3D } from '../engine/frame3d'
import { designStructure } from '../engine/pipeline'
import { computeSeismic } from '../engine/seismic'
import type { RectSection } from '../engine/model'

const S: RectSection = { id: 's', name: 's', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const model = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.5, 3], section: S })
model.loads = buildGravityLoads(model, 1.5, 2.4)
const br = modelToFrame3D(model)
const analysis = analyzeFrame3D(br.nodes, br.members, br.supports, br.loads)!
const design = designStructure(model, { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 } as never)!
const sp = { Ca: 0.44, Cv: 0.64, I: 1, R: 8.5, Z: 0.4 }
const seismic = { x: computeSeismic(model, { ...sp, dir: 'x' })!, z: computeSeismic(model, { ...sp, dir: 'z' })! }
const report = modelResultTables({ model, analysis, nodeOrder: br.nodes.map((n) => n.id), design, seismic })
const sheet = (t: string) => report.sections.find((s) => s.title === t)!
const col = (t: string, c: string) => sheet(t).columns.indexOf(c)

describe('modelResultTables — what goes into the workbook', () => {
  it('carries the model: every node, member and load', () => {
    expect(sheet('Nodes').rows).toHaveLength(model.nodes.length)
    expect(sheet('Members').rows).toHaveLength(model.members.length)
    expect(sheet('Loads').rows).toHaveLength(model.loads.length)
  })

  it('one displacement row per model node per solved combination, in mm', () => {
    const solved = analysis.perCombo.filter((r) => r.result && !r.skipped)
    expect(sheet('Node displacements').rows).toHaveLength(solved.length * model.nodes.length)
    const r0 = solved[0].result!, k = br.nodes.findIndex((n) => n.id === 'n1.0.2')
    const row = sheet('Node displacements').rows.find((r) => r[0] === solved[0].combo.name && r[1] === 'n1.0.2')!
    expect(row[col('Node displacements', 'Uy (mm)')]).toBeCloseTo(r0.d[6 * k + 1] * 1000, 3)
  })

  it('the exported reactions balance the applied gravity load in every combination', () => {
    const t = sheet('Support reactions'), fy = col('Support reactions', 'Fy (kN)')
    for (const r of analysis.perCombo.filter((q) => q.result && !q.skipped)) {
      const sum = t.rows.filter((x) => x[0] === r.combo.name).reduce((s, x) => s + (x[fy] as number), 0)
      const direct = r.result!.reactions.reduce((s, x) => s + x.F[1], 0)
      expect(sum).toBeCloseTo(direct, 2)
      expect(sum).toBeGreaterThan(0)
    }
  })

  it('member end forces are the solver\'s, both ends, every combination', () => {
    const gov = analysis.perCombo[analysis.govIdx], m = gov.result!.members[0]
    const t = sheet('Member end forces')
    const j = t.rows.find((r) => r[0] === gov.combo.name && r[1] === m.id && r[2] === 'j')!
    expect(j[col('Member end forces', 'Mz (kN·m)')]).toBeCloseTo(m.f[11], 3)
    expect(t.rows.length).toBe(analysis.perCombo.filter((r) => r.result && !r.skipped).length * br.members.length * 2)
  })

  it('the envelope names the combination each maximum came from', () => {
    const t = sheet('Member envelope')
    expect(t.rows).toHaveLength(br.members.length)
    for (const r of t.rows) expect(analysis.perCombo.map((c) => c.combo.name)).toContain(r[7])
  })

  it('carries the design schedules, with each beam\'s critical sections as their own sheet', () => {
    expect(sheet('RC beams').rows).toHaveLength(design.beams.length)
    expect(sheet('RC columns').rows).toHaveLength(design.columns.length)
    const secs = sheet('RC beams — sections')
    expect(secs.rows).toHaveLength(design.beams.reduce((s, b) => s + b.sections.length, 0))
    expect(secs.columns[0]).toBe('Member')
    expect(secs.columns.some((c) => c.startsWith('design.'))).toBe(true)
  })

  it('carries the seismic base shear and storey forces for both directions', () => {
    expect(sheet('Seismic base shear').rows).toHaveLength(2)
    expect(sheet('Seismic storey forces').rows).toHaveLength(seismic.x.storeys.length + seismic.z.storeys.length)
  })

  it('every sheet title is a legal, unique Excel sheet name', () => {
    const t = report.sections.map((s) => s.title)
    for (const x of t) { expect(x.length).toBeLessThanOrEqual(31); expect(x).not.toMatch(/[:\\/?*[\]]/) }
    expect(new Set(t.map((x) => x.toLowerCase())).size).toBe(t.length)
  })

  it('says in the summary which results are in it — an absent run is not an empty sheet', () => {
    const only = modelResultTables({ model })
    expect(only.meta.find(([k]) => k === 'Included')![1]).toBe('Model')
    expect(only.sections.some((s) => s.title === 'Node displacements')).toBe(false)
    expect(report.meta.find(([k]) => k === 'Included')![1]).toBe('Model, Linear analysis, Seismic, Design schedules')
  })
})

describe('flattenRows', () => {
  it('scalars as columns, nested objects one level as parent.child, object arrays as a child sheet', () => {
    const [main, child] = flattenRows('T', [
      { id: 'a', n: 1.23456789, ok: true, d: { As: 400, deep: { no: 1 } }, xs: [1, 2], parts: [{ k: 1 }, { k: 2 }] },
    ])
    expect(main.columns).toEqual(['Member', 'n', 'OK', 'd.As', 'xs'])
    expect(main.rows[0]).toEqual(['a', 1.23457, 'yes', 400, '1, 2'])
    expect(child.title).toBe('T — parts')
    expect(child.rows).toEqual([['a', 1], ['a', 2]])
  })
})

describe('the .xlsx itself', () => {
  it('writes and reads back: sheets, numeric cells as numbers', async () => {
    const wb = buildScheduleWorkbook(report)
    const buf = await wb.xlsx.writeBuffer()
    const back = new ExcelJS.Workbook()
    await back.xlsx.load(buf as ArrayBuffer)
    expect(back.worksheets.map((w) => w.name)).toEqual(['Summary', ...report.sections.map((s) => s.title)])
    const ws = back.getWorksheet('Support reactions')!
    expect(typeof ws.getRow(2).getCell(5).value).toBe('number')
  })

  it('a skipped combination is listed as skipped, not silently dropped', () => {
    const fake = { ...analysis, perCombo: [...analysis.perCombo, { ...analysis.perCombo[0], combo: { name: 'X', f: {} }, result: null, skipped: true }] }
    const lc = analysisSections(fake, br.nodes.map((n) => n.id))[0]
    expect(lc.rows.at(-1)).toContain('skipped')
  })
})

describe('modelResultTables — dynamics, pushover and nonlinear', async () => {
  const { modalAnalysis } = await import('../engine/modal')
  const { computeResponseSpectrum } = await import('../engine/responseSpectrum')
  const { runTimeHistoryModel, makeGroundMotion } = await import('../engine/timeHistoryModel')
  const { runPushoverModel } = await import('../engine/pushoverModel')
  const { runBiaxialPushover } = await import('../engine/biaxialFrameModel')
  const { runNonlinearModel } = await import('../engine/nonlinearModel')
  const { runNonlinearFrameModel } = await import('../engine/nonlinearFrameModel')

  const modal = modalAnalysis(model, 6)!
  const rsa = computeResponseSpectrum(modal, { Ca: 0.44, Cv: 0.64, I: 1, R: 8.5 } as never)
  const gm = makeGroundMotion({ kind: 'rampedSine', dt: 0.02, duration: 2, pga: 3, freq: 1.5, dir: 0 })
  const timeHistory = runTimeHistoryModel(model, { spec: { kind: 'rampedSine', dt: 0.02, duration: 2, pga: 3, freq: 1.5, dir: 0 }, nModes: 6 })!
  const pushover = runPushoverModel(model)!
  const biaxial = runBiaxialPushover(model, { steps: 6 })!
  const nonlinear = { inelastic: runNonlinearModel(model, gm), elastic: runNonlinearModel(model, gm, { elastic: true }) }
  const nonlinearFrame = { inelastic: runNonlinearFrameModel(model, gm), elastic: runNonlinearFrameModel(model, gm, { elastic: true }) }
  const r = modelResultTables({ model, modal, rsa, timeHistory, pushover, biaxial, nonlinear, nonlinearFrame })
  const sh = (t: string) => r.sections.find((s) => s.title === t)!

  it('modal: one row per mode with periods, mass ratios and their running sum; every mode shape', () => {
    const t = sh('Modal periods')
    expect(t.rows).toHaveLength(modal.modes.length)
    expect(t.rows[0][1]).toBeCloseTo(modal.modes[0].period, 4)
    const cumX = t.columns.indexOf('ΣMeff/M X')
    expect(t.rows.at(-1)![cumX]).toBeCloseTo(modal.modes.reduce((s, m) => s + m.effMassRatio[0], 0), 4)
    expect(sh('Mode shapes').rows).toHaveLength(modal.modes.reduce((s, m) => s + Object.keys(m.shape).length, 0))
  })
  it('response spectrum: per mode, then SRSS and CQC', () => {
    const t = sh('Response spectrum')
    expect(t.rows).toHaveLength(rsa.modalForces.length + 3)
    expect(t.rows.at(-2)![0]).toBe('CQC')
  })
  it('time history: the whole record, the modal peaks and every node\'s peak (mm)', () => {
    expect(sh('Time history').rows).toHaveLength(timeHistory.result.t.length)
    expect(sh('Time history').rows[5][1]).toBeCloseTo(timeHistory.result.baseShear[5], 3)
    const node = Object.keys(timeHistory.result.peakDisp)[0]
    const row = sh('Time history peaks').rows.find((x) => x[0] === node)!
    expect(row[1]).toBeCloseTo(timeHistory.result.peakDisp[node][0] * 1000, 3)
  })
  it('pushover: the capacity curve event by event, and the hinges', () => {
    expect(sh('Pushover curve').rows).toHaveLength(pushover.result.curve.length)
    expect(sh('Pushover hinges').rows).toHaveLength(pushover.result.hinges.length)
    expect(sh('Biaxial pushover').rows).toHaveLength(biaxial.curve.length)
  })
  it('nonlinear: storey springs with ductility, the step history, and the hinge frame', () => {
    expect(sh('NLTH storeys').columns).toContain('Ductility demand')
    expect(sh('NLTH history').rows).toHaveLength(nonlinear.inelastic!.response.u.length)
    expect(sh('NL frame history').rows).toHaveLength(nonlinearFrame.inelastic!.response.t.length)
    expect(sh('NL frame hinges').rows).toHaveLength(nonlinearFrame.inelastic!.response.hinges.length)
    expect(sh('NL frame elastic history')).toBeDefined()
  })
  it('lists each in the summary', () => {
    expect(r.meta.find(([k]) => k === 'Included')![1])
      .toBe('Model, Modal, Response spectrum, Time history, Pushover, Biaxial pushover, Nonlinear time history, Nonlinear frame time history')
  })
})
