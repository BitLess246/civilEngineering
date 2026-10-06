/**
 * Hydraulics — fluid in motion, on the Hydrostatics page (PRC CELE syllabus,
 * Hydraulics): Bernoulli's energy equation with losses, pumps and turbines,
 * and the force of a water jet on a stationary or moving vane.
 *
 * Rotating and accelerating vessels live in `hydrostatics.ts` (`rotationRise`,
 * `accelTilt`, `accelPressure`); the copies that were here were removed — one
 * added the paraboloid to the at-rest liquid volume (spinning a vessel does not
 * change how much liquid is in it), the other's inclined case mixed g·cosθ into
 * a vertical effective gravity.
 *
 * Units: SI (m, kg, s, Pa, N, W).
 */

export interface BernoulliInput {
  /** Pressure at point 1 (Pa) */
  p1: number;
  /** Velocity at point 1 (m/s) */
  v1: number;
  /** Elevation at point 1 (m) */
  z1: number;
  /** Pressure at point 2 (Pa) — optional if solving for it */
  p2?: number;
  /** Velocity at point 2 (m/s) — optional if solving for it */
  v2?: number;
  /** Elevation at point 2 (m) — optional if solving for it */
  z2?: number;
  /** Fluid density (kg/m³) — default 1000 for water */
  rho?: number;
  /** Gravity (m/s²) — default 9.81 */
  g?: number;
  /** Head loss (m) — optional */
  hL?: number;
  /** Pump head added (m) — optional */
  hP?: number;
  /** Turbine head extracted (m) — optional */
  hT?: number;
  /** Solve for: "p2" | "v2" | "z2" | "hL" | "hP" | "hT" */
  solveFor?: "p2" | "v2" | "z2" | "hL" | "hP" | "hT";
}

/**
 * Bernoulli's energy equation with losses and machinery:
 * p1/γ + v1²/2g + z1 + hP = p2/γ + v2²/2g + z2 + hT + hL
 */
export function bernoulli(input: BernoulliInput): {
  p2: number;
  v2: number;
  z2: number;
  hL: number;
  hP: number;
  hT: number;
  head1: number;
  head2: number;
} {
  const { p1, v1, z1, p2, v2, z2, rho = 1000, g = 9.81, hL = 0, hP = 0, hT = 0, solveFor } = input;
  const gamma = rho * g;

  // Total head at point 1
  const head1 = p1 / gamma + (v1 * v1) / (2 * g) + z1;

  // If solving for a variable, compute it
  if (solveFor === "p2") {
    const head2 = head1 + hP - hT - hL;
    const p2Calc = (head2 - (v2 !== undefined ? (v2 * v2) / (2 * g) : 0) - (z2 !== undefined ? z2 : 0)) * gamma;
    return { p2: p2Calc, v2: v2 ?? 0, z2: z2 ?? 0, hL, hP, hT, head1, head2 };
  }

  if (solveFor === "v2") {
    const head2 = head1 + hP - hT - hL - (p2 !== undefined ? p2 / gamma : 0) - (z2 !== undefined ? z2 : 0);
    if (head2 < 0) throw new Error("Negative head: check inputs");
    const v2Calc = Math.sqrt(2 * g * head2);
    return { p2: p2 ?? 0, v2: v2Calc, z2: z2 ?? 0, hL, hP, hT, head1, head2 };
  }

  if (solveFor === "z2") {
    const head2 = head1 + hP - hT - hL;
    const z2Calc = head2 - (p2 !== undefined ? p2 / gamma : 0) - (v2 !== undefined ? (v2 * v2) / (2 * g) : 0);
    return { p2: p2 ?? 0, v2: v2 ?? 0, z2: z2Calc, hL, hP, hT, head1, head2 };
  }

  if (solveFor === "hL") {
    const head2 = (p2 !== undefined ? p2 / gamma : 0) + (v2 !== undefined ? (v2 * v2) / (2 * g) : 0) + (z2 !== undefined ? z2 : 0);
    const hLCalc = head1 + hP - hT - head2;
    return { p2: p2 ?? 0, v2: v2 ?? 0, z2: z2 ?? 0, hL: hLCalc, hP, hT, head1, head2 };
  }

  if (solveFor === "hP") {
    const head2 = (p2 !== undefined ? p2 / gamma : 0) + (v2 !== undefined ? (v2 * v2) / (2 * g) : 0) + (z2 !== undefined ? z2 : 0);
    const hPCalc = head2 + hT + hL - head1;
    return { p2: p2 ?? 0, v2: v2 ?? 0, z2: z2 ?? 0, hL, hP: hPCalc, hT, head1, head2 };
  }

  if (solveFor === "hT") {
    const head2 = (p2 !== undefined ? p2 / gamma : 0) + (v2 !== undefined ? (v2 * v2) / (2 * g) : 0) + (z2 !== undefined ? z2 : 0);
    const hTCalc = head1 + hP - head2 - hL;
    return { p2: p2 ?? 0, v2: v2 ?? 0, z2: z2 ?? 0, hL, hP, hT: hTCalc, head1, head2 };
  }

  // Default: compute point 2 values from point 1
  const head2 = head1 + hP - hT - hL;
  let p2Calc: number = p2 ?? 0, v2Calc: number = v2 ?? 0, z2Calc: number = z2 ?? 0;

  if (p2 === undefined) p2Calc = (head2 - (v2 !== undefined ? (v2 * v2) / (2 * g) : 0) - (z2 !== undefined ? z2 : 0)) * gamma;
  if (v2 === undefined) v2Calc = Math.sqrt(Math.max(0, 2 * g * (head2 - (p2 !== undefined ? p2 / gamma : 0) - (z2 !== undefined ? z2 : 0))));
  if (z2 === undefined) z2Calc = head2 - (p2 !== undefined ? p2 / gamma : 0) - (v2 !== undefined ? (v2 * v2) / (2 * g) : 0);

  return { p2: p2Calc, v2: v2Calc, z2: z2Calc, hL, hP, hT, head1, head2 };
}

// ─────────────────────────────────────────────────────────────────────────────
// WATER JET ON BEND / VANE
// ─────────────────────────────────────────────────────────────────────────────

export interface WaterJetInput {
  /** Jet velocity (m/s) */
  v: number;
  /** Jet diameter (m) */
  d: number;
  /** Fluid density (kg/m³) — default 1000 */
  rho?: number;
  /** Deflection of the jet by the vane, degrees: 90 = a flat plate normal to
   *  the jet (or a 90° bend), 180 = a full reversal (Pelton cup). */
  thetaDeg: number;
  /** Vane velocity (m/s) — for moving vane, default 0 (stationary) */
  u?: number;
}

/**
 * Water jet impact on stationary or moving vane/bend.
 * Force = ρ·A·(v - u)²·(1 - cosθ) for stationary vane
 * For moving vane: relative velocity v_r = v - u
 */
export function waterJet(input: WaterJetInput): {
  A: number;
  Q: number;
  m_dot: number;
  F: number;
  F_x: number;
  F_y: number;
  power: number;
  efficiency: number;
} {
  const { v, d, rho = 1000, thetaDeg, u = 0 } = input;
  const A = Math.PI * d * d / 4;
  const v_r = v - u; // Relative velocity
  const Q = A * v_r;
  const m_dot = rho * Q;
  const theta = (thetaDeg * Math.PI) / 180;

  // Force on vane (assuming jet leaves parallel to vane surface)
  // F = m_dot * v_r * (1 - cosθ) in direction of initial jet
  const F = m_dot * v_r * (1 - Math.cos(theta));
  const F_x = F;
  const F_y = m_dot * v_r * Math.sin(theta);

  // Power for moving vane
  const power = F_x * u;
  // Efficiency = power delivered / kinetic power of the JET, ½ρ(Av)v² — the
  // jet's own discharge A·v, not the relative flow the single vane intercepts.
  // (This used ½·ṁ·v² with ṁ at the RELATIVE velocity, overstating η by v/(v−u).)
  const power_in = 0.5 * rho * A * v * v * v;
  const efficiency = power_in > 0 ? power / power_in : 0;

  return { A, Q, m_dot, F, F_x, F_y, power, efficiency };
}