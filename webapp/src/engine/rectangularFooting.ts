// ─────────────────────────────────────────────────────────────────────────
// Isolated rectangular footing — concentric load, square column.
// Sizes Bx × By for bearing, checks punching + one-way shear in both
// directions, and designs flexure each way (with the short-direction central
// band per NSCP 2015 §413.3.3.3 / ACI 318-14 §13.3.3.3).
// ─────────────────────────────────────────────────────────────────────────
import { netBearing } from './bearing';
import { punchingDepth, oneWayShearDepth, type ColumnPosition } from './shear';
import { flexuralSteel, barLayout } from './flexure';

/** How the plan dimensions are determined. */
export type RectSizing =
  | { mode: 'ratio'; ratio: number }      // Bx / By aspect ratio (≥ 1 → long along x)
  | { mode: 'fixedWidth'; By: number };   // By constrained (m); Bx solved for area

export interface RectFootingInput {
  serviceLoad: number;   // P, kN
  ultimateLoad: number;  // Pu, kN
  columnWidth: number;   // square column c, mm
  fc: number;            // MPa
  fy: number;            // MPa
  qAllow: number;        // kPa
  gammaSoil: number;     // kN/m³
  gammaConc: number;     // kN/m³
  H: number;             // m
  barDia: number;        // mm
  cover: number;         // mm
  surcharge?: number;    // kPa
  position?: ColumnPosition;
  lambda?: number;
  sizing: RectSizing;
  /** Detailed design (size plan & D_c) or analyze a given section. Default 'design'. */
  analysis?: 'design' | 'analyze';
  givenBx?: number;      // m, analyze only
  givenBy?: number;      // m, analyze only
  givenDc?: number;      // mm, analyze only
  /** 'iteration' (fixed point) or 'approximate' (one pass from D_c = 250 mm). */
  solutionMethod?: 'iteration' | 'approximate';
}

export interface DirectionSteel {
  As: number;       // mm² over the design width
  rho: number;
  usedMin: boolean;
  bars: number;
  spacing: number;  // mm o.c.
}

export interface RectFootingResult {
  Bx: number;       // m (long)
  By: number;       // m (short)
  Dc: number;       // mm
  qNet: number;     // kPa
  qu: number;       // kPa
  dPunch: number;
  dBeamLong: number;
  dBeamShort: number;
  dFlex: number;
  long: DirectionSteel;                              // bars along x, spread over By
  short: DirectionSteel & { bandBars: number; bandFraction: number }; // bars along y + central band
  analysis: 'design' | 'analyze';
  method: 'iteration' | 'approximate';
  /** Provided effective depth for shear (D_c − cover − d_b), mm. */
  dProvided: number;
  punchOK: boolean;
  beamOK: boolean;
}

function roundUp(v: number, step: number): number {
  return Math.ceil(v / step) * step;
}

function sizePlan(area: number, sizing: RectSizing): { Bx: number; By: number } {
  if (sizing.mode === 'fixedWidth') {
    const By = sizing.By;
    return { Bx: roundUp(area / By, 0.05), By: roundUp(By, 0.05) };
  }
  const r = Math.max(1, sizing.ratio);               // long along x
  const By = Math.sqrt(area / r);
  return { Bx: roundUp(r * By, 0.05), By: roundUp(By, 0.05) };
}

export function designRectangularFooting(i: RectFootingInput): RectFootingResult {
  const cm = i.columnWidth / 1000;
  const surcharge = i.surcharge ?? 0;
  const analysis = i.analysis ?? 'design';
  const method = i.solutionMethod ?? 'iteration';
  const qNetAt = (Dc: number) =>
    netBearing({ qAllow: i.qAllow, gammaSoil: i.gammaSoil, gammaConc: i.gammaConc, H: i.H, Dc, surcharge });
  const shearDepths = (qu: number, Bx: number, By: number) => ({
    dPunch: punchingDepth({ Pu: i.ultimateLoad, qu, c: i.columnWidth, fc: i.fc, position: i.position, lambda: i.lambda }),
    // One-way shear: d depends on the span dimension only (the perpendicular
    // width cancels), so pass each plan dimension as the span.
    dBeamLong: oneWayShearDepth({ qu, B: Bx, c: cm, fc: i.fc, lambda: i.lambda }),
    dBeamShort: oneWayShearDepth({ qu, B: By, c: cm, fc: i.fc, lambda: i.lambda }),
  });

  let Dc = 0.25;
  let Bx = 0, By = 0, qNet = 0, qu = 0, dPunch = 0, dBeamLong = 0, dBeamShort = 0;
  let punchOK = true, beamOK = true;
  if (analysis === 'analyze') {
    // Given plan & thickness — compute pressures, check shear adequacy.
    Bx = i.givenBx ?? 0; By = i.givenBy ?? 0;
    Dc = (i.givenDc ?? 250) / 1000;
    qNet = qNetAt(Dc);
    qu = i.ultimateLoad / (Bx * By);
    ({ dPunch, dBeamLong, dBeamShort } = shearDepths(qu, Bx, By));
    const dProv = Dc * 1000 - i.cover - i.barDia;
    punchOK = dProv >= dPunch;
    beamOK = dProv >= Math.max(dBeamLong, dBeamShort);
  } else if (method === 'approximate') {
    // One pass from the assumed D_c = 250 mm.
    qNet = qNetAt(Dc);
    ({ Bx, By } = sizePlan(i.serviceLoad / qNet, i.sizing));
    qu = i.ultimateLoad / (Bx * By);
    ({ dPunch, dBeamLong, dBeamShort } = shearDepths(qu, Bx, By));
    Dc = roundUp(Math.max(dPunch, dBeamLong, dBeamShort) + i.cover + i.barDia, 25) / 1000;
  } else {
    for (let k = 0; k < 8; k++) {
      qNet = qNetAt(Dc);
      ({ Bx, By } = sizePlan(i.serviceLoad / qNet, i.sizing));
      qu = i.ultimateLoad / (Bx * By);
      ({ dPunch, dBeamLong, dBeamShort } = shearDepths(qu, Bx, By));
      const newDc = roundUp(Math.max(dPunch, dBeamLong, dBeamShort) + i.cover + i.barDia, 25) / 1000;
      if (Math.abs(newDc - Dc) < 1e-4) { Dc = newDc; break; }
      Dc = newDc;
    }
  }

  const DcMm = Dc * 1000;
  const dFlex = DcMm - i.cover - i.barDia / 2;

  // Long direction: cantilever in x, bars run along x and spread across By.
  const armX = (Bx - cm) / 2;
  const MuLong = qu * By * (armX * armX) / 2;
  const bLong = By * 1000;
  const flexLong = flexuralSteel({ Mu: MuLong, b: bLong, d: dFlex, fc: i.fc, fy: i.fy });
  const layoutLong = barLayout({ As: flexLong.As, db: i.barDia, b: bLong, cover: i.cover });

  // Short direction: cantilever in y, bars run along y and spread across Bx,
  // with the central-band concentration.
  const armY = (By - cm) / 2;
  const MuShort = qu * Bx * (armY * armY) / 2;
  const bShort = Bx * 1000;
  const flexShort = flexuralSteel({ Mu: MuShort, b: bShort, d: dFlex, fc: i.fc, fy: i.fy });
  const layoutShort = barLayout({ As: flexShort.As, db: i.barDia, b: bShort, cover: i.cover });
  const beta = Bx / By;                               // long / short
  const bandFraction = 2 / (beta + 1);
  const bandBars = Math.max(2, Math.ceil(layoutShort.n * bandFraction));

  return {
    Bx, By, Dc: DcMm, qNet, qu, dPunch, dBeamLong, dBeamShort, dFlex,
    long: { As: flexLong.As, rho: flexLong.rho, usedMin: flexLong.usedMin, bars: layoutLong.n, spacing: layoutLong.spacing },
    short: {
      As: flexShort.As, rho: flexShort.rho, usedMin: flexShort.usedMin,
      bars: layoutShort.n, spacing: layoutShort.spacing, bandBars, bandFraction,
    },
    analysis, method, dProvided: DcMm - i.cover - i.barDia, punchOK, beamOK,
  };
}
