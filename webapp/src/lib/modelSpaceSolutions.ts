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
import type { SolutionStep } from './solution'

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

// ── Timber worked solutions (NDS §3 / NSCP §6, LRFD via Appendix N) — a full
// step-by-step in KaTeX, narrating the stored intermediates. Shared by the
// on-screen schedules and the direct PDF. ──
const wf0 = (v: number) => v.toFixed(0)
const wf1 = (v: number) => v.toFixed(1)
const wf2 = (v: number) => v.toFixed(2)
const e3 = (v: number) => `${(v / 1e3).toFixed(1)}\\times10^{3}`   // mm³/mm² compact form
const chk = (u: number) => (u <= 1 ? '\\le 1\\ \\checkmark' : '> 1\\ \\Rightarrow \\text{overstressed}')

export function woodBeamRowSolution(r: WoodBeamScheduleRow): SolutionStep[] {
  const braced = r.RB <= 1e-9
  const FbE = braced ? Infinity : (1.2 * r.Emin) / (r.RB * r.RB)
  return [
    { title: 'Section properties & factored demands', clause: 'NDS 2018 §3 / NSCP §6', lines: [
      { text: `${r.species || 'Timber'} (${r.kind}) — ${r.role}, span L = ${wf2(r.L)} m.` },
      { tex: `b\\times d = ${wf0(r.b)}\\times${wf0(r.d)}\\ \\text{mm}` },
      { tex: `S = \\dfrac{b\\,d^{2}}{6} = \\dfrac{${wf0(r.b)}\\cdot ${wf0(r.d)}^{2}}{6} = ${e3(r.S)}\\ \\text{mm}^{3}` },
      { tex: `A = b\\,d = ${e3(r.A)}\\ \\text{mm}^{2}` },
      { tex: `M_u = ${wf1(r.Mu)}\\ \\text{kN·m}, \\quad V_u = ${wf1(r.Vu)}\\ \\text{kN}` },
    ] },
    { title: 'Bending stress', clause: 'NDS §3.3', lines: [
      { tex: `f_b = \\dfrac{M_u}{S} = \\dfrac{${wf1(r.Mu)}\\times10^{6}}{${e3(r.S)}} = ${wf2(r.fb)}\\ \\text{MPa}` },
    ] },
    { title: 'Beam stability factor C_L', clause: 'NDS §3.3.3', lines: braced
      ? [ { text: 'Compression edge continuously braced (le = 0) ⇒ CL = 1.00.' } ]
      : [
          { tex: `R_B = \\sqrt{\\dfrac{\\ell_e\\,d}{b^{2}}} = ${wf2(r.RB)} \\quad(\\le 50)` },
          { tex: `F_{bE} = \\dfrac{1.2\\,E'_{min}}{R_B^{2}} = \\dfrac{1.2\\times ${wf0(r.Emin)}}{${wf2(r.RB)}^{2}} = ${wf1(FbE)}\\ \\text{MPa}` },
          { tex: `C_L = ${wf2(r.CL)} \\quad\\text{from } F_{bE}/F_b^{*}` },
        ] },
    { title: 'Adjusted bending value & check', clause: 'NDS §3.3 · Appendix N', pass: r.utilM <= 1, lines: [
      { tex: `F'_b = F_b^{*}\\,C_L = ${wf2(r.FbStar)}\\times ${wf2(r.CL)} = ${wf2(r.FbPrime)}\\ \\text{MPa}` },
      { tex: `\\dfrac{f_b}{F'_b} = \\dfrac{${wf2(r.fb)}}{${wf2(r.FbPrime)}} = ${wf2(r.utilM)}\\ ${chk(r.utilM)}` },
    ] },
    { title: 'Horizontal shear', clause: 'NDS §3.4', pass: r.utilV <= 1, lines: [
      { tex: `f_v = \\dfrac{1.5\\,V_u}{A} = \\dfrac{1.5\\times ${wf1(r.Vu)}\\times10^{3}}{${e3(r.A)}} = ${wf2(r.fv)}\\ \\text{MPa}` },
      { tex: `\\dfrac{f_v}{F'_v} = \\dfrac{${wf2(r.fv)}}{${wf2(r.FvPrime)}} = ${wf2(r.utilV)}\\ ${chk(r.utilV)}` },
    ] },
  ]
}

export function woodColumnRowSolution(r: WoodColumnScheduleRow): SolutionStep[] {
  const axial = r.fc / r.FcPrime
  const steps: SolutionStep[] = [
    { title: 'Section properties & factored demands', clause: 'NDS 2018 §3 / NSCP §6', lines: [
      { text: `${r.species || 'Timber'} (${r.kind}) column, length L = ${wf2(r.L)} m.` },
      { tex: `A = b\\,d = ${wf0(r.b)}\\times${wf0(r.d)} = ${e3(r.A)}\\ \\text{mm}^{2}` },
      { tex: `P_u = ${wf1(r.Pu)}\\ \\text{kN}, \\quad M_u = ${wf1(r.Mu)}\\ \\text{kN·m}` },
    ] },
    { title: 'Axial stress', clause: 'NDS §3.6', lines: [
      { tex: `f_c = \\dfrac{P_u}{A} = \\dfrac{${wf1(r.Pu)}\\times10^{3}}{${e3(r.A)}} = ${wf2(r.fc)}\\ \\text{MPa}` },
    ] },
    { title: 'Column stability factor C_P', clause: 'NDS §3.7.1', lines: [
      { tex: `\\dfrac{\\ell_e}{d} = ${wf1(r.slenderness)} \\quad(\\le 50)` },
      { tex: `F_{cE} = \\dfrac{0.822\\,E'_{min}}{(\\ell_e/d)^{2}} = \\dfrac{0.822\\times ${wf0(r.Emin)}}{${wf1(r.slenderness)}^{2}} = ${wf1(r.FcE)}\\ \\text{MPa}` },
      { tex: `C_P = ${wf2(r.CP)} \\quad\\text{from } F_{cE}/F_c^{*}` },
      { tex: `F'_c = F_c^{*}\\,C_P = ${wf2(r.FcStar)}\\times ${wf2(r.CP)} = ${wf2(r.FcPrime)}\\ \\text{MPa}` },
    ] },
  ]
  if (r.Mu > 1e-6) {
    steps.push({ title: 'Combined axial + flexure (beam-column)', clause: 'NDS §3.9.2', pass: r.ok, lines: [
      { tex: `\\left(\\dfrac{f_c}{F'_c}\\right)^{2} + \\dfrac{f_b}{F'_b\\left(1-f_c/F_{cE}\\right)} = ${wf2(r.ratio)}\\ ${chk(r.ratio)}` },
      { text: `Axial term f_c/F′c = ${wf2(axial)}; the §3.9.2 interaction governs at ${wf2(r.ratio)}.` },
    ] })
  } else {
    steps.push({ title: 'Axial check', clause: 'NDS §3.7', pass: r.ok, lines: [
      { tex: `\\dfrac{f_c}{F'_c} = \\dfrac{${wf2(r.fc)}}{${wf2(r.FcPrime)}} = ${wf2(r.ratio)}\\ ${chk(r.ratio)}` },
    ] })
  }
  return steps
}

export function woodSlabRowSolution(r: WoodSlabScheduleRow): SolutionStep[] {
  const d = r.design, tk = d.takeoff
  const member = (label: string, clause: string, c: typeof d.joist): SolutionStep => ({
    title: label, clause, pass: c.ok, lines: [
      { tex: `${wf0(c.b)}\\times${wf0(c.d)}\\ \\text{mm}, \\quad \\text{span } L = ${wf2(c.span)}\\ \\text{m}, \\quad w = ${wf2(c.w)}\\ \\text{kN/m}` },
      { tex: `M = ${wf2(c.M)}\\ \\text{kN·m}, \\quad V = ${wf2(c.V)}\\ \\text{kN}` },
      { tex: `\\dfrac{f_b}{F'_b} = \\dfrac{${wf2(c.fb)}}{${wf2(c.FbPrime)}} = ${wf2(c.bendingRatio)}\\ ${chk(c.bendingRatio)}` },
      { tex: `\\dfrac{f_v}{F'_v} = \\dfrac{${wf2(c.fv)}}{${wf2(c.FvPrime)}} = ${wf2(c.shearRatio)}\\ ${chk(c.shearRatio)}` },
      { tex: `\\Delta_{L} = ${wf2(c.deflLive)}\\ \\text{mm} \\le \\dfrac{L}{360} = ${wf2(c.deflLiveAllow)}\\ \\text{mm}, \\quad \\Delta_{T} = ${wf2(c.deflTotal)} \\le \\dfrac{L}{240} = ${wf2(c.deflTotalAllow)}` },
    ],
  })
  return [
    { title: 'Floor loads', clause: 'NSCP §203', lines: [
      { tex: `w_{tot} = ${wf2(d.loads.deadKpa)}_{SDL} + ${wf2(d.loads.deckSelfKpa)}_{deck} + ${wf2(d.loads.joistSelfKpa)}_{joist} + ${wf2(d.loads.liveKpa)}_{L} = ${wf2(d.loads.totalKpa)}\\ \\text{kPa}` },
    ] },
    member('Decking — spans the joist spacing', 'NDS §3.3–§3.4', d.deck),
    member('Joist — spans the panel', 'NDS §3.3–§3.4', d.joist),
    { title: 'Take-off (bill of materials)', clause: 'BOM', lines: [
      { text: `${wf0(tk.joistCount)} joists · ${wf2(tk.joistLengthM)} m total · ${wf0(tk.joistBoardFeet)} bd·ft; deck ${wf2(tk.deckAreaM2)} m² · ${wf0(tk.deckBoardFeet)} bd·ft${tk.bambooSlatCount != null ? ` · ${wf0(tk.bambooSlatCount)} bamboo slats` : ''}.` },
    ] },
  ]
}
