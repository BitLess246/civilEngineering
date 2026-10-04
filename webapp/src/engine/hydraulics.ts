/**
 * Hydraulics calculator — PRC CELE syllabus (Hydraulics 30%).
 * Bernoulli's energy equation, rotating/moving vessels, water jet on vane/bend.
 * Units: SI (m, kg, s, Pa, N, J).
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
// ROTATING VESSEL WITH LIQUID
// ─────────────────────────────────────────────────────────────────────────────

export interface RotatingVesselInput {
  /** Angular velocity (rad/s) */
  omega: number;
  /** Radius of vessel (m) */
  R: number;
  /** Fluid density (kg/m³) — default 1000 */
  rho?: number;
  /** Gravity (m/s²) — default 9.81 */
  g?: number;
  /** Initial fluid height at rest (m) — optional */
  h0?: number;
}

/**
 * Rotating vessel (forced vortex): free surface is paraboloid z = ω²r²/2g
 * Pressure: p = p_atm + ρ(g·h + ω²r²/2) at depth h below surface
 */
export function rotatingVessel(input: RotatingVesselInput): {
  z_rim: number;
  z_center: number;
  h_surface: (r: number) => number;
  p_at_r: (r: number, h: number) => number;
  volume: number;
} {
  const { omega, R, rho = 1000, g = 9.81, h0 } = input;
  const z_rim = (omega * omega * R * R) / (2 * g);
  const z_center = 0;
  const volume = Math.PI * R * R * (h0 ?? 0) + (Math.PI * R * R * z_rim) / 2;

  const h_surface = (r: number) => (omega * omega * r * r) / (2 * g);
  const p_at_r = (r: number, h: number) => rho * g * h + rho * (omega * omega * r * r) / 2;

  return { z_rim, z_center, h_surface, p_at_r, volume };
}

// ─────────────────────────────────────────────────────────────────────────────
// MOVING VESSEL WITH LIQUID (VERTICAL / HORIZONTAL / INCLINED)
// ─────────────────────────────────────────────────────────────────────────────

export interface MovingVesselInput {
  /** Acceleration (m/s²) */
  a: number;
  /** Direction: "horizontal" | "vertical" | "inclined" */
  direction: "horizontal" | "vertical" | "inclined";
  /** Incline angle (deg) — only for "inclined" */
  thetaDeg?: number;
  /** Fluid density (kg/m³) — default 1000 */
  rho?: number;
  /** Gravity (m/s²) — default 9.81 */
  g?: number;
  /** Vessel dimensions for pressure at point */
  depth?: number;  // depth below free surface (m)
  x?: number;      // horizontal distance from reference (m)
}

/**
 * Vessel with liquid under linear acceleration:
 * - Horizontal: surface tilts tanθ = a/g, p = ρ(g·h + a·x)
 * - Vertical: p = ρ(g + a_z)h (a_z positive up)
 * - Inclined: combine components
 */
export function movingVessel(input: MovingVesselInput): {
  thetaDeg: number;
  p: number;
  p_distribution: (h: number) => number;
  free_surface_slope: number;
} {
  const { a, direction, thetaDeg = 0, rho = 1000, g = 9.81, depth = 1, x = 0 } = input;

  if (direction === "horizontal") {
    // Free surface tilts: tanθ = a/g
    const theta = Math.atan(a / g);
    const thetaDegCalc = (theta * 180) / Math.PI;
    const pCalc = rho * (g * depth + a * x);
    return {
      thetaDeg: thetaDegCalc,
      p: pCalc,
      p_distribution: (h: number) => rho * (g * h + a * x),
      free_surface_slope: Math.tan(theta),
    };
  }

  if (direction === "vertical") {
    // Vertical acceleration: p = ρ(g + a)h where a positive upward
    const g_eff = g + a;
    const pCalc = rho * g_eff * depth;
    return {
      thetaDeg: 0,
      p: pCalc,
      p_distribution: (h: number) => rho * g_eff * h,
      free_surface_slope: 0,
    };
  }

  // Inclined
  const theta = (thetaDeg * Math.PI) / 180;
  const a_parallel = a * Math.cos(theta);
  const a_perp = a * Math.sin(theta);
  const g_eff_perp = g * Math.cos(theta) + a_perp;
  const pCalc = rho * g_eff_perp * depth;
  return {
    thetaDeg: thetaDeg,
    p: pCalc,
    p_distribution: (h: number) => rho * g_eff_perp * h,
    free_surface_slope: a_parallel / g_eff_perp,
  };
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
  /** Deflection angle (deg) — 180 for flat plate normal, 90 for 90° bend, etc. */
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
  // Efficiency = power out / power in
  const power_in = 0.5 * m_dot * v * v;
  const efficiency = power_in > 0 ? power / power_in : 0;

  return { A, Q, m_dot, F, F_x, F_y, power, efficiency };
}