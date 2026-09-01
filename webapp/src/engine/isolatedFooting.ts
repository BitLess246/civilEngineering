// ─────────────────────────────────────────────────────────────────────────
// Isolated square footing — concentric load. Composes bearing + shear +
// flexure into one design. Pure & typed; the React UI consumes this directly.
// ─────────────────────────────────────────────────────────────────────────
import { netBearing, squareSize } from './bearing';
import { punchingDepth, oneWayShearDepth, type ColumnPosition } from './shear';
import { flexuralSteel, matLayout, type AsMinBasis } from './flexure';

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
  /**
   * Which minimum steel rule the mat is held to — see `flexure.AsMinBasis`.
   *
   * Default `max`, the greater of §9.6.1.2's beam rule and §24.4.3.2's
   * shrinkage rule. §13.3.2.1 sends footings to the slab rule alone, which is
   * the lighter of the two here; taking the larger is what most offices detail
   * to and is the reading that cannot be wrong in the unsafe direction, so it
   * is the default and the slab-only reading is opt-in.
   */
  asMinBasis?: AsMinBasis;
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
  /** Which minimum was larger, and both candidates (mm²) — so a sheet can show
   *  the comparison rather than a bare number. */
  minGoverning: 'beam' | 'slab';
  asMinBeam: number;
  asMinSlab: number;
  bars: number;
  /** Centre-to-centre spacing, mm. */
  barSpacing: number;
  /** §7.7.2.3 limit the mat was laid out against, mm. */
  barSpacingMax: number;
  /** True when §7.7.2.3 — not the area — decided the bar count. */
  spacingGoverned: boolean;
  /** §25.2.1 clear spacing satisfied. False = the bars do not fit. */
  barsFit: boolean;
  /** Which paths produced this result. */
  analysis: 'design' | 'analyze';
  method: 'iteration' | 'approximate';
  /** Provided effective depth for shear (D_c − cover − d_b), mm. */
  dProvided: number;
  /** Capacity checks — always true for 'design'; meaningful for 'analyze'. */
  punchOK: boolean;
  beamOK: boolean;
  /** Property-line geometry — present whenever `position` is not interior. */
  offset: ColumnOffset | null;
}

/**
 * What an off-centre column does to the pad, once the column is at a free edge
 * rather than merely near one.
 *
 * A pad whose column face is flush with a property line carries its load a
 * distance (B − c)/2 from its own centroid, and that distance GROWS with B —
 * so the footing cannot be sized out of the problem, which is why a real
 * property-line footing is strapped or tied to an interior column rather than
 * left to stand alone. Sizing B from bearing and then reporting the
 * eccentricity that results is the honest order: it is not circular, and it
 * says plainly what the pad needs.
 */
/**
 * Which bearing regime the pad is in.
 *
 * `full`             resultant inside the kern; the linear trapezoid is exact.
 * `partial-uniaxial` lifts about one axis; the triangular block has a closed
 *                    form, so `qMax` is still exact.
 * `partial-biaxial`  lifts about both; the contact area is a polygon with no
 *                    closed form, so `qMax` is reported as the linear value
 *                    and is a LOWER BOUND on the truth. A pad in this state
 *                    has already failed the kern check — the number is there
 *                    to show the scale, not to design on.
 */
export type BearingState = 'full' | 'partial-uniaxial' | 'partial-biaxial';

export interface ColumnOffset {
  /** Column centroid from the pad centroid, m — +x toward the free edge. */
  ex: number;
  ey: number;
  /** Resultant eccentricity including the applied moment, m. */
  e: number;
  /**
   * The peak bearing pressure the soil ACTUALLY sees, kPa.
   *
   * Inside the kern this is the linear trapezoid, q = P/A(1 + 6e_x/B + 6e_y/L)
   * — biaxial, both terms, because they add rather than compete.
   *
   * Outside it the linear formula is no longer the answer. Soil takes no
   * tension, so the block redistributes onto whatever is still in contact, and
   * the peak RISES well above the extrapolation: on the worked 2.0 × 3.0 pad
   * the linear value is 510 kPa where the triangular block that actually
   * forms peaks at 1000. Reporting the extrapolation as the peak understates
   * the demand by half, which is the wrong direction. See `bearing`.
   */
  qMax: number;
  /** Minimum linear ordinate, kPa — negative means that corner lifts. It is
   *  the SIGN that carries the finding; the magnitude is fictitious. */
  qMin: number;
  /** How `qMax` was arrived at, and therefore how far to trust it. */
  bearing: BearingState;
  /** Length still in contact, m — uniaxial partial bearing only. */
  contactLength: number | null;
  /**
   * Whether the resultant stays in the kern, so the whole base bears.
   *
   * Biaxially the kern is a RHOMBUS, not a pair of independent middle thirds:
   * q_min ≥ 0 requires e_x/B + e_y/L ≤ 1/6, which is stricter than either axis
   * on its own and is what a corner column actually has to satisfy.
   */
  kernOK: boolean;
  /** e_x/B + e_y/L, against the 1/6 the kern allows — the utilisation. */
  kernRatio: number;
  /**
   * Moment a strap or tie beam must take at the column to bring the resultant
   * back to the pad centroid, kN·m. Zero when the pad already balances.
   */
  restraint: number;
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
  // `h` lets the §24.4.3.2 gross-section minimum enter the comparison at all —
  // without it only the beam rule can apply, which is how the slab rule that
  // §13.3.2.1 actually points at was silently never considered.
  const flex = flexuralSteel({
    Mu, b, d: dFlex, h: DcMm, fc: i.fc, fy: i.fy, asMinBasis: i.asMinBasis,
  });
  // A footing is detailed as a one-way slab (ACI 318-14 §13.3.2.1), so the
  // §7.7.2.3 maximum spacing sets the bar count whenever the area does not.
  const layout = matLayout({
    As: flex.As, db: i.barDia, b, cover: i.cover, h: DcMm, kind: 'one-way',
  });

  return {
    B, Dc: DcMm, qNet, qu, dPunch, dBeam, dFlex,
    steelArea: flex.As, rho: flex.rho, usedMinSteel: flex.usedMin,
    minGoverning: flex.minGoverning, asMinBeam: flex.asMinBeam, asMinSlab: flex.asMinSlab,
    bars: layout.n, barSpacing: layout.spacing,
    barSpacingMax: layout.sMax, spacingGoverned: layout.spacingGoverned,
    barsFit: layout.clearOK,
    analysis, method, dProvided: DcMm - i.cover - i.barDia, punchOK, beamOK,
    offset: columnOffset(i, B, cy),
  };
}

/**
 * The property-line consequences of an edge or corner column — see
 * `ColumnOffset`. Null for an interior column, where there are none.
 *
 * The column face is taken FLUSH with each free edge, which is what "at the
 * edge" means for a pad: the centroid then sits (B − c)/2 from the pad's own,
 * toward that edge. On a corner both axes are offset and the resultant is the
 * vector sum, checked on the governing axis.
 */
export function columnOffset(
  i: Pick<SquareFootingInput, 'serviceLoad' | 'columnWidth' | 'columnWidthY' | 'position'>,
  B: number, cyMm?: number, L = B,
): ColumnOffset | null {
  const position = i.position ?? 'interior';
  if (position === 'interior') return null;
  const cx = i.columnWidth / 1000;
  const cy = (cyMm ?? i.columnWidthY ?? i.columnWidth) / 1000;
  // The column centroid sits c/2 in from the face it is flush with, so the
  // offset is (B − c)/2 — the exact form of the (B/2) idealisation that drops
  // the column's own width.
  const ex = Math.max(0, (B - cx) / 2);
  const ey = position === 'corner' ? Math.max(0, (L - cy) / 2) : 0;
  const e = Math.hypot(ex, ey);
  const P = i.serviceLoad;
  const A = B * L;
  // Biaxial, both terms. Beyond the kern this is the linear extrapolation, so
  // qMin goes negative — reported rather than clipped, because the negative IS
  // the finding: that part of the base lifts off the soil.
  const kx = A > 0 ? (6 * ex) / B : 0;
  const ky = A > 0 ? (6 * ey) / L : 0;
  const qLinMax = A > 0 ? (P / A) * (1 + kx + ky) : 0;
  const qMin = A > 0 ? (P / A) * (1 - kx - ky) : 0;
  const kernRatio = B > 0 && L > 0 ? (ex / B + ey / L) / (1 / 6) : 0;
  const kernOK = kernRatio <= 1 + 1e-9;

  // ── the redistribution, when the base lifts ────────────────────────────
  // Soil carries no tension, so once q_min goes negative the pressure is not
  // the extrapolated trapezoid — it collapses onto the contact area and the
  // peak goes UP. Uniaxially that is a triangle of length 3(B/2 − e) whose
  // volume must still be P, which fixes the peak exactly.
  const uniaxial = ey <= 1e-12 || ex <= 1e-12;
  const bearing: BearingState = kernOK ? 'full'
    : uniaxial ? 'partial-uniaxial' : 'partial-biaxial';
  let qMax = qLinMax;
  let contactLength: number | null = null;
  if (bearing === 'partial-uniaxial') {
    // Which axis is eccentric decides which dimension the triangle runs along.
    const [ecc, along, across] = ex > ey ? [ex, B, L] : [ey, L, B];
    contactLength = Math.max(1e-9, 3 * (along / 2 - ecc));
    qMax = (2 * P) / (contactLength * across);
  }
  return {
    ex, ey, e, qMax, qMin, bearing, contactLength,
    kernOK, kernRatio,
    restraint: P * e,
  };
}
