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
  /** Square column width c, mm. */
  columnWidth: number;
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
}

function roundUp(v: number, step: number): number {
  return Math.ceil(v / step) * step;
}

export function designSquareFooting(i: SquareFootingInput): SquareFootingResult {
  const cm = i.columnWidth / 1000; // column width, m
  const surcharge = i.surcharge ?? 0;

  // Size B and depth together — D_c feeds back into q_net, so iterate to a
  // fixed point (mirrors the legacy "iteration" method).
  let Dc = 0.25; // m, trial
  let B = 0;
  let qNet = 0;
  let qu = 0;
  let dPunch = 0;
  let dBeam = 0;
  for (let k = 0; k < 8; k++) {
    qNet = netBearing({ qAllow: i.qAllow, gammaSoil: i.gammaSoil, gammaConc: i.gammaConc, H: i.H, Dc, surcharge });
    B = squareSize(i.serviceLoad / qNet, 0.05);
    qu = i.ultimateLoad / (B * B);
    dPunch = punchingDepth({ Pu: i.ultimateLoad, qu, c: i.columnWidth, fc: i.fc, position: i.position, lambda: i.lambda });
    dBeam = oneWayShearDepth({ qu, B, c: cm, fc: i.fc, lambda: i.lambda });
    const newDc = roundUp(Math.max(dPunch, dBeam) + i.cover + i.barDia, 25) / 1000;
    if (Math.abs(newDc - Dc) < 1e-4) { Dc = newDc; break; }
    Dc = newDc;
  }

  const DcMm = Dc * 1000;
  const dFlex = DcMm - i.cover - i.barDia / 2;
  const arm = (B - cm) / 2;                         // cantilever from column face, m
  const Mu = qu * B * (arm * arm) / 2;              // kN·m over the full width B
  const b = B * 1000;                               // design width, mm
  const flex = flexuralSteel({ Mu, b, d: dFlex, fc: i.fc, fy: i.fy });
  const layout = barLayout({ As: flex.As, db: i.barDia, b, cover: i.cover });

  return {
    B,
    Dc: DcMm,
    qNet,
    qu,
    dPunch,
    dBeam,
    dFlex,
    steelArea: flex.As,
    rho: flex.rho,
    usedMinSteel: flex.usedMin,
    bars: layout.n,
    barSpacing: layout.spacing,
  };
}
