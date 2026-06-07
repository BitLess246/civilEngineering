// ─────────────────────────────────────────────────────────────────────────
// Flexure — required steel from the factored moment, and a bar layout.
// NSCP 2015 / ACI 318-14 (tension-controlled, φ = 0.90).
// Convention: Mu in kN·m, b & d & db & cover in mm, fc & fy in MPa.
// ─────────────────────────────────────────────────────────────────────────

const PHI_FLEXURE = 0.90;

export interface FlexuralSteel {
  /** Adopted reinforcement ratio (≥ ρ_min). */
  rho: number;
  /** Required steel area, mm². */
  As: number;
  /** True when ρ_min governed. */
  usedMin: boolean;
}

/** Minimum flexural ratio ρ_min = max(1.4/fy, √f′c/(4 fy)). */
export function rhoMin(fc: number, fy: number): number {
  return Math.max(1.4 / fy, Math.sqrt(fc) / (4 * fy));
}

export function flexuralSteel(params: {
  Mu: number; b: number; d: number; fc: number; fy: number; phi?: number;
}): FlexuralSteel {
  const { Mu, b, d, fc, fy } = params;
  const phi = params.phi ?? PHI_FLEXURE;
  const Rn = (Mu * 1e6) / (phi * b * d * d);                       // MPa
  const rhoCalc = (0.85 * fc / fy) * (1 - Math.sqrt(Math.max(0, 1 - (2 * Rn) / (0.85 * fc))));
  const rMin = rhoMin(fc, fy);
  const usedMin = rhoCalc < rMin;
  const rho = usedMin ? rMin : rhoCalc;
  return { rho, As: rho * b * d, usedMin };
}

export interface BarLayout {
  /** Number of bars (≥ 2). */
  n: number;
  /** Centre-to-centre spacing, mm. */
  spacing: number;
}

/** Bar count + spacing for a required As across width b, using ⌀db bars and clear cover. */
export function barLayout(params: { As: number; db: number; b: number; cover: number }): BarLayout {
  const Ab = (Math.PI / 4) * params.db * params.db;
  const n = Math.max(2, Math.ceil(params.As / Ab));
  const spacing = n > 1 ? (params.b - 2 * params.cover - n * params.db) / (n - 1) : params.b;
  return { n, spacing };
}
