// ─────────────────────────────────────────────────────────────────────────
// Soil bearing — net allowable pressure and footing plan sizing.
// Units: forces kN, pressures kPa, lengths m unless noted.
// ─────────────────────────────────────────────────────────────────────────

export interface NetBearingInput {
  /** Gross allowable soil bearing capacity q_a, kPa. */
  qAllow: number;
  /** Unit weight of soil γ_s, kN/m³. */
  gammaSoil: number;
  /** Unit weight of concrete γ_c, kN/m³. */
  gammaConc: number;
  /** Total footing depth H (ground surface → underside of footing), m. */
  H: number;
  /** Footing slab thickness D_c, m. */
  Dc: number;
  /** Surcharge q, kPa (default 0). */
  surcharge?: number;
}

/**
 * Net allowable soil pressure available for the superstructure load:
 *   q_net = q_a − γ_s·D_s − γ_c·D_c − q,  with D_s = H − D_c (soil cover above footing).
 */
export function netBearing(i: NetBearingInput): number {
  const Ds = i.H - i.Dc;
  return i.qAllow - i.gammaSoil * Ds - i.gammaConc * i.Dc - (i.surcharge ?? 0);
}

/** Required bearing area A = P / q_net (m²). */
export function requiredArea(serviceLoad: number, qNet: number): number {
  return serviceLoad / qNet;
}

/** Side of a square footing for a given area (m), optionally rounded up to a step. */
export function squareSize(area: number, step = 0): number {
  const B = Math.sqrt(area);
  return step > 0 ? Math.ceil(B / step) * step : B;
}
