// ─────────────────────────────────────────────────────────────────────────
// Isolated square footing — concentric load. Composes bearing + shear +
// flexure into one design. Pure & typed; the React UI consumes this directly.
// ─────────────────────────────────────────────────────────────────────────
import { netBearing, squareSize } from './bearing';
import { punchingDepth, oneWayShearDepth, type ColumnPosition } from './shear';
import { flexuralSteel, barLayout } from './flexure';

export interface SquareFootingInput {
  /** Service (unfactored) axial load P, kN. */
  serviceLoad: number;
  /** Ultimate (factored) axial load Pu, kN. */
  ultimateLoad: number;
  /** Column width c (x-dimension for a rectangular column), mm. */
  columnWidth: number;
  /** Column y-dimension, mm — defaults to columnWidth (square). */
  columnWidthY?: number;
  /** f′c, MPa. */
  fc: number;
  /** fy, MPa. */
  fy: number;
  /** Gross allowable soil bearing q_a, kPa. */
  qAllow: number;
  /** γ_soil, kN/m³. */
  gammaSoil: number;
  /** γ_concrete, kN/m³. */
  gammaConc: number;
  /** Total footing depth H, m. */
  H: number;
  /** Main bar diameter d_b, mm. */
  barDia: number;
  /** Clear cover, mm. */
  cover: number;
  /** Surcharge, kPa (default 0). */
  surcharge?: number;
  /** Column position (α_s for punching), default interior. */
  position?: ColumnPosition;
  /** Lightweight-concrete factor λ (default 1). */
  lambda?: number;
  /** Detailed design (size B & D_c) or analyze a given section. Default 'design'. */
  analysis?: 'design' | 'analyze';
  /** Provided footing side B, m — required when analysis = 'analyze'. */
  givenB?: number;
  /** Provided slab thickness D_c, mm — required when analysis = 'analyze'. */
  givenDc?: number;
  /**
   * 'iteration' re-solves q_net/B/D_c to a fixed point; 'approximate' does one
   * pass from an assumed D_c = 250 mm (legacy "Approximate"). Default 'iteration'.
   */
  solutionMethod?: 'iteration' | 'approximate';
}

export interface SquareFootingResult {
  /** Footing side B, m (rounded up to 50 mm). */
  B: number;
  /** Governing slab thickness D_c, mm (rounded up to 25 mm). */
  Dc: number;
  /** Net allowable pressure at the final D_c, kPa. */
  qNet: number;
  /** Factored bearing pressure qu = Pu/B², kPa. */
  qu: number;
  /** Effective depths, mm. */
  dPunch: number;
  dBeam: number;
  dFlex: number;
  /** Flexural design (per footing width). */
  steelArea: number;
  rho: number;
  usedMinSteel: boolean;
  bars: number;
  barSpacing: number;
  /** Which paths produced this result. */
  analysis: 'design' | 'analyze';
  method: 'iteration' | 'approximate';
  /** Provided effective depth for shear (D_c − cover − d_b), mm. */
  dProvided: number;
  /** Capacity checks — always true for 'design'; meaningful for 'analyze'. */
  punchOK: boolean;
  beamOK: boolean;
}

function roundUp(v: number, step: number): number {
  return Math.ceil(v / step) * step;
}

export function designSquareFooting(i: SquareFootingInput): SquareFootingResult {
  const cy = i.columnWidthY ?? i.columnWidth;
  // One-way shear & flexure act both ways on a square footing; the smaller
  // column dimension gives the longer cantilever, so it governs both.
  const cm = Math.min(i.columnWidth, cy) / 1000;
  const surcharge = i.surcharge ?? 0;
  const analysis = i.analysis ?? 'design';
  const method = i.solutionMethod ?? 'iteration';
  const qNetAt = (Dc: number) =>
    netBearing({ qAllow: i.qAllow, gammaSoil: i.gammaSoil, gammaConc: i.gammaConc, H: i.H, Dc, surcharge });
  const reqPunch = (qu: number) =>
    punchingDepth({ Pu: i.ultimateLoad, qu, c: i.columnWidth, cy, fc: i.fc, position: i.position, lambda: i.lambda });
  const reqBeam = (qu: number, B: number) =>
    oneWayShearDepth({ qu, B, c: cm, fc: i.fc, lambda: i.lambda });

  let B = 0, Dc = 0.25, qNet = 0, qu = 0, dPunch = 0, dBeam = 0;
  let punchOK = true, beamOK = true;

  if (analysis === 'analyze') {
    // Given B and D_c — compute pressures, then check shear adequacy.
    B = i.givenB ?? 0;
    Dc = (i.givenDc ?? 250) / 1000;
    qNet = qNetAt(Dc);
    qu = i.ultimateLoad / (B * B);
    dPunch = reqPunch(qu);
    dBeam = reqBeam(qu, B);
    const dProvidedShear = Dc * 1000 - i.cover - i.barDia;
    punchOK = dProvidedShear >= dPunch;
    beamOK = dProvidedShear >= dBeam;
  } else if (method === 'approximate') {
    // Single pass from an assumed D_c = 250 mm (no re-iteration of q_net/B).
    Dc = 0.25;
    qNet = qNetAt(Dc);
    B = squareSize(i.serviceLoad / qNet, 0.05);
    qu = i.ultimateLoad / (B * B);
    dPunch = reqPunch(qu);
    dBeam = reqBeam(qu, B);
    Dc = roundUp(Math.max(dPunch, dBeam) + i.cover + i.barDia, 25) / 1000;
  } else {
    // Iteration — D_c feeds back into q_net, so solve to a fixed point.
    for (let k = 0; k < 8; k++) {
      qNet = qNetAt(Dc);
      B = squareSize(i.serviceLoad / qNet, 0.05);
      qu = i.ultimateLoad / (B * B);
      dPunch = reqPunch(qu);
      dBeam = reqBeam(qu, B);
      const newDc = roundUp(Math.max(dPunch, dBeam) + i.cover + i.barDia, 25) / 1000;
      if (Math.abs(newDc - Dc) < 1e-4) { Dc = newDc; break; }
      Dc = newDc;
    }
  }

  const DcMm = Dc * 1000;
  const dFlex = DcMm - i.cover - i.barDia / 2;
  const arm = (B - cm) / 2;                         // cantilever from column face, m
  const Mu = qu * B * (arm * arm) / 2;              // kN·m over the full width B
  const b = B * 1000;                               // design width, mm
  const flex = flexuralSteel({ Mu, b, d: dFlex, fc: i.fc, fy: i.fy });
  const layout = barLayout({ As: flex.As, db: i.barDia, b, cover: i.cover });

  return {
    B, Dc: DcMm, qNet, qu, dPunch, dBeam, dFlex,
    steelArea: flex.As, rho: flex.rho, usedMinSteel: flex.usedMin,
    bars: layout.n, barSpacing: layout.spacing,
    analysis, method, dProvided: DcMm - i.cover - i.barDia, punchOK, beamOK,
  };
}
