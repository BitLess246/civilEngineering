// ─────────────────────────────────────────────────────────────────────────
// Calculation engine — first typed slice.
// Framework-agnostic, pure functions. The rest of the existing JS engine
// (foundation sizing, FEM, beam shear, …) will be ported here over Phase 1.
// ─────────────────────────────────────────────────────────────────────────

/** A service (unfactored) gravity load split into dead and live. */
export interface ServiceLoad {
  /** Dead load, kN. */
  dead: number;
  /** Live load, kN. */
  live: number;
}

/**
 * Ultimate (factored) gravity load `Pu = max(1.4 D, 1.2 D + 1.6 L)`.
 * NSCP 2015 §203.3.1 / ACI 318-14 §5.3.1.
 */
export function factoredLoad({ dead, live }: ServiceLoad): number {
  return Math.max(1.4 * dead, 1.2 * dead + 1.6 * live);
}

/**
 * β₁ equivalent-stress-block depth factor (NSCP 2015 §422.2.2.4.3).
 * @param fc concrete compressive strength f′c, MPa
 */
export function beta1(fc: number): number {
  if (fc <= 28) return 0.85;
  return Math.max(0.65, 0.85 - (0.05 * (fc - 28)) / 7);
}
