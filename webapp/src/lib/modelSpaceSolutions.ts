// Adapters that rebuild the detailed worked solutions for the model-space
// schedules from the design rows, reusing the same builders the standalone
// calculator pages use (beam / column / isolated footing).
import type { RectSection } from '../engine/model'
import type { BeamSectionDesign, ColumnScheduleRow, FootingScheduleRow, CombinedScheduleRow, SoilOptions,
  WoodBeamScheduleRow, WoodColumnScheduleRow, WoodSlabScheduleRow } from '../engine/pipeline'
import type { CombinedFootingInput } from '../engine/combinedFooting'
import { designAxialColumn, interaction, capacityAtEccentricity } from '../engine/columnDesign'
import { buildBeamSolution } from './beamSolution'
import { axialColumnSolution, eccentricColumnSolution, type SeismicTieOverride } from './columnSolution'
import { buildFoundationSolution, type SolutionCtx } from './foundationSolution'
import { buildCombinedFootingSolution } from './combinedFootingSolution'
import type { SolutionStep, SolutionLine } from './solution'

/** Worked solution for one beam/girder critical section. */
export function beamSectionSolution(sec: RectSection, s: BeamSectionDesign): SolutionStep[] {
  return buildBeamSolution({
    b: sec.b, h: sec.h, cover: sec.cover, barDia: sec.barDia,
    comprBarDia: 16, stirrupDia: sec.tieDia, fc: sec.fc, fy: sec.fy,
    Mu: Math.abs(s.Mu), Vu: s.Vu,
  }, s.design)
}

/** Worked solution for a column row — mirrors the pipeline's column design
 *  (axial bar selection, then the P–M check when e > 0). */
export function columnRowSolution(sec: RectSection, row: ColumnScheduleRow): SolutionStep[] {
  const base = {
    shape: 'tied' as const, b: sec.b, h: sec.h, cover: sec.cover,
    barDia: sec.barDia, tieDia: sec.tieDia, fc: sec.fc, fy: sec.fy, Pu: row.Pu,
  }
  const ax = designAxialColumn(base)
  const steps: SolutionStep[] = []
  if (row.e > 1e-4 && row.Pu > 0) {
    const ic = { b: sec.b, h: sec.h, cover: sec.cover, barDia: sec.barDia, tieDia: sec.tieDia, fc: sec.fc, fy: sec.fy, numBars: ax.bars, layout: row.layout }
    steps.push(...eccentricColumnSolution(ic, interaction(ic), row.Pu, row.Mu, capacityAtEccentricity(ic, row.e)))
  }
  const seismic: SeismicTieOverride | undefined =
    row.seismicSConf !== undefined && row.seismicLoZone !== undefined
      ? {
          system: row.tieSpacingLabel.toLowerCase().includes('smf') ? 'smf' : 'imf',
          tieSpacingFinal: row.tieSpacingFinal,
          seismicSConf: row.seismicSConf,
          seismicLoZone: row.seismicLoZone,
          tieSpacingLabel: row.tieSpacingLabel,
          seismicSOut: row.seismicSOut,
          gravitySpacing: row.tieSpacing,
        }
      : undefined
  steps.push(...axialColumnSolution(base, ax, seismic))
  return steps
}

/** Worked solution for an isolated (square) footing row. */
export function footingRowSolution(sec: RectSection, soil: SoilOptions, row: FootingScheduleRow): SolutionStep[] {
  const r = row.design
  const ctx: SolutionCtx = {
    type: 'square', loading: 'concentric', analysis: r.analysis, method: r.method,
    serviceLoad: row.P, ultimateLoad: row.Pu, loads: null,
    serviceMoment: 0, ultimateMoment: 0,
    columnWidth: Math.min(sec.b, sec.h), columnWidthY: Math.min(sec.b, sec.h), column: null,
    fc: sec.fc, fy: sec.fy,
    qAllow: soil.qAllow, gammaSoil: soil.gammaSoil, gammaConc: soil.gammaConc, H: soil.H,
    barDia: sec.barDia, cover: 75, surcharge: 0, position: 'interior',
    Bx: r.B, By: r.B, Dc: r.Dc, qNet: r.qNet, qu: r.qu,
    dPunch: r.dPunch, dBeamLong: r.dBeam, dBeamShort: r.dBeam, dProvided: r.dProvided,
    punchOK: r.punchOK, beamOK: r.beamOK,
    long: { As: r.steelArea, bars: r.bars, spacing: r.barSpacing, usedMin: r.usedMinSteel, rho: r.rho },
    short: null, ecc: null,
  }
  return buildFoundationSolution(ctx)
}

/** Worked solution for a combined-footing pair row (rigid method); secA/secB
 *  are the sections of the two columns landing on the paired support nodes. */
export function combinedRowSolution(secA: RectSection, secB: RectSection, soil: SoilOptions, row: CombinedScheduleRow): SolutionStep[] {
  const input: CombinedFootingInput = {
    col1Width: Math.min(secA.b, secA.h), col2Width: Math.min(secB.b, secB.h), spacing: row.spacing,
    dl1: row.dl1, ll1: row.ll1, dl2: row.dl2, ll2: row.ll2,
    leftRestrict: false, rightRestrict: false, leftOverhang: 0, rightOverhang: 0,
    fc: secA.fc, fy: secA.fy, qAllow: soil.qAllow, gammaSoil: soil.gammaSoil, gammaConc: soil.gammaConc,
    surcharge: 0, H: soil.H, barDia: secA.barDia, cover: 75,
  }
  return buildCombinedFootingSolution(input, row.design)
}

// ── Timber worked "solutions" (NDS §3 / NSCP §6) — narrate the stored LRFD
// stresses and stability factors; shared by the on-screen schedules and the PDF. ──
const wf0 = (v: number) => v.toFixed(0)
const wf1 = (v: number) => v.toFixed(1)
const wf2 = (v: number) => v.toFixed(2)
const wtxt = (text: string): SolutionLine => ({ text })

export function woodBeamRowSolution(r: WoodBeamScheduleRow): SolutionStep[] {
  return [
    { title: `Section ${wf0(r.b)}×${wf0(r.d)} mm — ${r.species || 'timber'} (${r.kind})`, clause: 'NDS 2018 §3 / NSCP §6', lines: [
      wtxt(`b = ${wf0(r.b)} mm · d = ${wf0(r.d)} mm · L = ${wf2(r.L)} m · role ${r.role}`),
    ] },
    { title: 'Flexure — bending with beam stability', clause: 'NDS §3.3', pass: r.utilM <= 1, lines: [
      wtxt(`f_b = M/S = ${wf2(r.fb)} MPa · C_L = ${wf2(r.CL)} → F′b = ${wf2(r.FbPrime)} MPa`),
      wtxt(`Mu = ${wf1(r.Mu)} kN·m → util f_b/F′b = ${wf2(r.utilM)} ${r.utilM <= 1 ? '✓' : '✗'}`),
    ] },
    { title: 'Horizontal shear', clause: 'NDS §3.4', pass: r.utilV <= 1, lines: [
      wtxt(`f_v = 1.5V/A = ${wf2(r.fv)} MPa ≤ F′v = ${wf2(r.FvPrime)} MPa`),
      wtxt(`Vu = ${wf1(r.Vu)} kN → util f_v/F′v = ${wf2(r.utilV)} ${r.utilV <= 1 ? '✓' : '✗'}`),
    ] },
  ]
}

export function woodColumnRowSolution(r: WoodColumnScheduleRow): SolutionStep[] {
  return [
    { title: `Section ${wf0(r.b)}×${wf0(r.d)} mm — ${r.species || 'timber'} (${r.kind})`, clause: 'NDS 2018 §3 / NSCP §6', lines: [
      wtxt(`b = ${wf0(r.b)} mm · d = ${wf0(r.d)} mm · L = ${wf2(r.L)} m`),
    ] },
    { title: 'Axial compression with column stability', clause: 'NDS §3.7', pass: r.fc <= r.FcPrime, lines: [
      wtxt(`slenderness le/d = ${wf1(r.slenderness)} → C_P = ${wf2(r.CP)} · F′c = ${wf2(r.FcPrime)} MPa`),
      wtxt(`f_c = P/A = ${wf2(r.fc)} MPa · Pu = ${wf1(r.Pu)} kN ${r.fc <= r.FcPrime ? '✓' : '✗'}`),
    ] },
    { title: 'Combined axial + flexure', clause: 'NDS §3.9.2', pass: r.ok, lines: [
      wtxt(`Mu = ${wf1(r.Mu)} kN·m → governing ratio = ${wf2(r.ratio)} ≤ 1.00 ${r.ok ? '✓' : '✗'}`),
    ] },
  ]
}

export function woodSlabRowSolution(r: WoodSlabScheduleRow): SolutionStep[] {
  const d = r.design, tk = d.takeoff
  const chk = (label: string, c: typeof d.joist): SolutionStep => ({
    title: label, clause: 'NDS §3.3–§3.4 / NSCP §6', pass: c.ok, lines: [
      wtxt(`${wf0(c.b)}×${wf0(c.d)} mm · span ${wf2(c.span)} m · w = ${wf2(c.w)} kN/m → M = ${wf2(c.M)} kN·m, V = ${wf2(c.V)} kN`),
      wtxt(`bending f_b/F′b = ${wf2(c.fb)}/${wf2(c.FbPrime)} (util ${wf2(c.bendingRatio)}) · shear f_v/F′v = ${wf2(c.fv)}/${wf2(c.FvPrime)} (util ${wf2(c.shearRatio)})`),
      wtxt(`Δ live ${wf2(c.deflLive)}/${wf2(c.deflLiveAllow)} mm · Δ total ${wf2(c.deflTotal)}/${wf2(c.deflTotalAllow)} mm ${c.ok ? '✓' : '✗'}`),
    ],
  })
  return [
    { title: 'Loads', clause: 'NSCP §203', lines: [
      wtxt(`superimposed dead ${wf2(d.loads.deadKpa)} kPa · live ${wf2(d.loads.liveKpa)} kPa · deck self ${wf2(d.loads.deckSelfKpa)} · joist self ${wf2(d.loads.joistSelfKpa)} → total ${wf2(d.loads.totalKpa)} kPa`),
    ] },
    chk('Decking', d.deck),
    chk('Joist', d.joist),
    { title: 'Take-off (board feet)', clause: 'BOM', lines: [
      wtxt(`${wf0(tk.joistCount)} joists · ${wf2(tk.joistLengthM)} m · ${wf0(tk.joistBoardFeet)} bd·ft · deck ${wf2(tk.deckAreaM2)} m² · ${wf0(tk.deckBoardFeet)} bd·ft${tk.bambooSlatCount != null ? ` · ${wf0(tk.bambooSlatCount)} bamboo slats` : ''}`),
    ] },
  ]
}
