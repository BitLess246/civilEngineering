// Adapters that rebuild the detailed worked solutions for the model-space
// schedules from the design rows, reusing the same builders the standalone
// calculator pages use (beam / column / isolated footing).
import type { RectSection } from '../engine/model'
import type { BeamSectionDesign, ColumnScheduleRow, FootingScheduleRow, CombinedScheduleRow, SoilOptions } from '../engine/pipeline'
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
