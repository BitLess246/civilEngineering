// ─────────────────────────────────────────────────────────────────────────
// Isolated square footing — uniaxial eccentric load (axial + moment about one
// axis). Sizes B so the peak SERVICE pressure stays within q_net with NO
// uplift (e ≤ B/6, full bearing); designs shear & flexure on the FACTORED
// peak pressure (conservative), punching on the average pressure.
// ─────────────────────────────────────────────────────────────────────────
import { netBearing } from './bearing';
import { punchingDepth, oneWayShearDepth, type ColumnPosition } from './shear';
import { flexuralSteel, barLayout } from './flexure';

export interface EccentricFootingInput {
  serviceLoad: number;    // P, kN
  ultimateLoad: number;   // Pu, kN
  serviceMoment: number;  // M, kN·m (service, about one axis)
  ultimateMoment: number; // Mu, kN·m (factored)
  columnWidth: number;    // column x-dimension (along the eccentricity), mm
  columnWidthY?: number;  // column y-dimension, mm (default columnWidth)
  fc: number;
  fy: number;
  qAllow: number;
  gammaSoil: number;
  gammaConc: number;
  H: number;
  barDia: number;
  cover: number;
  surcharge?: number;
  position?: ColumnPosition;
  lambda?: number;
  /** Detailed design (size B & D_c) or analyze a given section. Default 'design'. */
  analysis?: 'design' | 'analyze';
  givenB?: number;       // m, analyze only
  givenDc?: number;      // mm, analyze only
  /** 'iteration' (fixed point) or 'approximate' (one pass from D_c = 250 mm). */
  solutionMethod?: 'iteration' | 'approximate';
}

export interface EccentricFootingResult {
  B: number;            // m
  Dc: number;           // mm
  e: number;            // service eccentricity M/P, m
  eU: number;           // factored eccentricity Mu/Pu, m
  qNet: number;         // kPa
  qMaxService: number;  // kPa
  qMinService: number;  // kPa (≥ 0 when full bearing)
  quMax: number;        // factored peak pressure, kPa
  dPunch: number;
  dBeam: number;
  dFlex: number;
  /** e ≤ B/6 — pressure trapezoid stays positive (no uplift). */
  kernOK: boolean;
  steelArea: number;
  rho: number;
  usedMinSteel: boolean;
  bars: number;
  barSpacing: number;
  analysis: 'design' | 'analyze';
  method: 'iteration' | 'approximate';
  /** Provided effective depth for shear (D_c − cover − d_b), mm. */
  dProvided: number;
  punchOK: boolean;
  beamOK: boolean;
  /** Analyze only: peak service pressure within q_net. */
  bearingOK: boolean;
}

function roundUp(v: number, step: number): number {
  return Math.ceil(v / step) * step;
}

export function designEccentricSquareFooting(i: EccentricFootingInput): EccentricFootingResult {
  const e = i.serviceLoad > 0 ? Math.abs(i.serviceMoment) / i.serviceLoad : 0;
  const eU = i.ultimateLoad > 0 ? Math.abs(i.ultimateMoment) / i.ultimateLoad : 0;
  const cy = i.columnWidthY ?? i.columnWidth;
  // The smaller column dimension gives the longer (governing) cantilever.
  const cm = Math.min(i.columnWidth, cy) / 1000;
  const surcharge = i.surcharge ?? 0;

  const analysis = i.analysis ?? 'design';
  const method = i.solutionMethod ?? 'iteration';
  const qNetAt = (Dc: number) =>
    netBearing({ qAllow: i.qAllow, gammaSoil: i.gammaSoil, gammaConc: i.gammaConc, H: i.H, Dc, surcharge });
  // Grow B until the peak service pressure fits AND the load stays in the kern.
  const sizeB = (qNet: number) => {
    let B = roundUp(Math.max(6 * e, Math.sqrt(i.serviceLoad / qNet)), 0.05);
    for (let g = 0; g < 600; g++) {
      const qm = (i.serviceLoad / (B * B)) * (1 + (6 * e) / B);
      if (qm <= qNet && B >= 6 * e - 1e-9) break;
      B = roundUp(B + 0.05, 0.05);
    }
    return B;
  };
  // Punching uses the average pressure relief; one-way & flexure use the peak.
  const shearDepths = (B: number, quMax: number) => ({
    dPunch: punchingDepth({ Pu: i.ultimateLoad, qu: i.ultimateLoad / (B * B), c: i.columnWidth, cy, fc: i.fc, position: i.position, lambda: i.lambda }),
    dBeam: oneWayShearDepth({ qu: quMax, B, c: cm, fc: i.fc, lambda: i.lambda }),
  });

  let Dc = 0.25;
  let B = 0, qNet = 0, quMax = 0, dPunch = 0, dBeam = 0, qMaxService = 0;
  let punchOK = true, beamOK = true, bearingOK = true;
  if (analysis === 'analyze') {
    B = i.givenB ?? 0;
    Dc = (i.givenDc ?? 250) / 1000;
    qNet = qNetAt(Dc);
    qMaxService = (i.serviceLoad / (B * B)) * (1 + (6 * e) / B);
    quMax = (i.ultimateLoad / (B * B)) * (1 + (6 * eU) / B);
    ({ dPunch, dBeam } = shearDepths(B, quMax));
    const dProv = Dc * 1000 - i.cover - i.barDia;
    punchOK = dProv >= dPunch;
    beamOK = dProv >= dBeam;
    bearingOK = qMaxService <= qNet + 1e-9;
  } else if (method === 'approximate') {
    qNet = qNetAt(Dc);
    B = sizeB(qNet);
    qMaxService = (i.serviceLoad / (B * B)) * (1 + (6 * e) / B);
    quMax = (i.ultimateLoad / (B * B)) * (1 + (6 * eU) / B);
    ({ dPunch, dBeam } = shearDepths(B, quMax));
    Dc = roundUp(Math.max(dPunch, dBeam) + i.cover + i.barDia, 25) / 1000;
  } else {
    for (let k = 0; k < 10; k++) {
      qNet = qNetAt(Dc);
      B = sizeB(qNet);
      qMaxService = (i.serviceLoad / (B * B)) * (1 + (6 * e) / B);
      quMax = (i.ultimateLoad / (B * B)) * (1 + (6 * eU) / B);
      ({ dPunch, dBeam } = shearDepths(B, quMax));
      const newDc = roundUp(Math.max(dPunch, dBeam) + i.cover + i.barDia, 25) / 1000;
      if (Math.abs(newDc - Dc) < 1e-4) { Dc = newDc; break; }
      Dc = newDc;
    }
  }

  const DcMm = Dc * 1000;
  const dFlex = DcMm - i.cover - i.barDia / 2;
  const arm = (B - cm) / 2;
  const Mu = quMax * B * (arm * arm) / 2;   // conservative: peak pressure across the width
  const b = B * 1000;
  const flex = flexuralSteel({ Mu, b, d: dFlex, fc: i.fc, fy: i.fy });
  const layout = barLayout({ As: flex.As, db: i.barDia, b, cover: i.cover });
  const qMinService = (i.serviceLoad / (B * B)) * (1 - (6 * e) / B);

  return {
    B, Dc: DcMm, e, eU, qNet, qMaxService, qMinService, quMax,
    dPunch, dBeam, dFlex, kernOK: e <= B / 6 + 1e-9,
    steelArea: flex.As, rho: flex.rho, usedMinSteel: flex.usedMin, bars: layout.n, barSpacing: layout.spacing,
    analysis, method, dProvided: DcMm - i.cover - i.barDia, punchOK, beamOK, bearingOK,
  };
}
