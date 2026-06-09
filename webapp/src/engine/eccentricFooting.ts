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
  columnWidth: number;    // square column c, mm
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
}

function roundUp(v: number, step: number): number {
  return Math.ceil(v / step) * step;
}

export function designEccentricSquareFooting(i: EccentricFootingInput): EccentricFootingResult {
  const e = i.serviceLoad > 0 ? Math.abs(i.serviceMoment) / i.serviceLoad : 0;
  const eU = i.ultimateLoad > 0 ? Math.abs(i.ultimateMoment) / i.ultimateLoad : 0;
  const cm = i.columnWidth / 1000;
  const surcharge = i.surcharge ?? 0;

  let Dc = 0.25;
  let B = 0, qNet = 0, quMax = 0, dPunch = 0, dBeam = 0, qMaxService = 0;
  for (let k = 0; k < 10; k++) {
    qNet = netBearing({ qAllow: i.qAllow, gammaSoil: i.gammaSoil, gammaConc: i.gammaConc, H: i.H, Dc, surcharge });
    // Grow B until the peak service pressure fits AND the load stays in the kern.
    B = roundUp(Math.max(6 * e, Math.sqrt(i.serviceLoad / qNet)), 0.05);
    for (let g = 0; g < 600; g++) {
      const qm = (i.serviceLoad / (B * B)) * (1 + (6 * e) / B);
      if (qm <= qNet && B >= 6 * e - 1e-9) break;
      B = roundUp(B + 0.05, 0.05);
    }
    qMaxService = (i.serviceLoad / (B * B)) * (1 + (6 * e) / B);
    quMax = (i.ultimateLoad / (B * B)) * (1 + (6 * eU) / B);
    const quAvg = i.ultimateLoad / (B * B);
    // Punching uses the average pressure relief; one-way & flexure use the peak.
    dPunch = punchingDepth({ Pu: i.ultimateLoad, qu: quAvg, c: i.columnWidth, fc: i.fc, position: i.position, lambda: i.lambda });
    dBeam = oneWayShearDepth({ qu: quMax, B, c: cm, fc: i.fc, lambda: i.lambda });
    const newDc = roundUp(Math.max(dPunch, dBeam) + i.cover + i.barDia, 25) / 1000;
    if (Math.abs(newDc - Dc) < 1e-4) { Dc = newDc; break; }
    Dc = newDc;
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
  };
}
