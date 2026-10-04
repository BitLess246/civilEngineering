/**
 * Dynamics calculator — PRC CELE syllabus (Structural 35%).
 * Kinematics, kinetics, work-energy, impulse-momentum.
 * Units: SI (m, kg, s, N, J).
 */

export interface KinematicsRectilinearInput {
  /** Initial velocity (m/s) */
  u: number;
  /** Final velocity (m/s) — optional if using other equations */
  v?: number;
  /** Acceleration (m/s²) */
  a: number;
  /** Time (s) — optional */
  t?: number;
  /** Displacement (m) — optional */
  s?: number;
}

/**
 * Rectilinear motion: v = u + at, s = ut + ½at², v² = u² + 2as
 * Returns all kinematic variables given any 3 of {u, v, a, t, s}.
 */
export function kinematicsRectilinear(input: KinematicsRectilinearInput): {
  u: number;
  v: number;
  a: number;
  t: number;
  s: number;
} {
  const { u, v, a, t, s } = input;
  let vv = v, tt = t, ss = s;

  // u and a are required; need at least 1 more from {v, t, s} to solve for the other two
  const knownOptional = [vv !== undefined, tt !== undefined, ss !== undefined].filter(Boolean).length;
  if (knownOptional < 1) {
    throw new Error("Provide at least 1 of {v, t, s} (u and a are required)");
  }

  // Case 1: u, a, t known → v, s
  if (tt !== undefined && vv === undefined && ss === undefined) {
    vv = u + a * tt;
    ss = u * tt + 0.5 * a * tt * tt;
  }
  // Case 2: u, a, v known → t, s
  else if (vv !== undefined && tt === undefined && ss === undefined) {
    if (a === 0) throw new Error("Cannot solve for t when a = 0");
    tt = (vv - u) / a;
    ss = u * tt + 0.5 * a * tt * tt;
  }
  // Case 3: u, a, s known → v, t
  else if (ss !== undefined && vv === undefined && tt === undefined) {
    const disc = u * u + 2 * a * ss;
    if (disc < 0) throw new Error("No real solution for v with given s");
    vv = Math.sqrt(disc) * (a >= 0 ? 1 : -1);
    if (a === 0) throw new Error("Cannot solve for t when a = 0");
    tt = (vv - u) / a;
  }
  // Case 4: u, v, t known → a, s
  else if (vv !== undefined && tt !== undefined && ss === undefined) {
    if (tt === 0) throw new Error("Time cannot be zero");
    const aa = (vv - u) / tt;
    ss = u * tt + 0.5 * aa * tt * tt;
    return { u, v: vv, a: aa, t: tt, s: ss };
  }
  // Case 5: u, v, s known → a, t
  else if (vv !== undefined && ss !== undefined && tt === undefined) {
    const aa = (vv * vv - u * u) / (2 * ss);
    if (aa === 0) throw new Error("Cannot solve for t when a = 0");
    tt = (vv - u) / aa;
    return { u, v: vv, a: aa, t: tt, s: ss };
  }
  // Case 6: u, t, s known → v, a
  else if (tt !== undefined && ss !== undefined && vv === undefined) {
    if (tt === 0) throw new Error("Time cannot be zero");
    vv = (2 * ss) / tt - u;
    const aa = (vv - u) / tt;
    return { u, v: vv, a: aa, t: tt, s: ss };
  }
  // Case 7: v, t, s known (u unknown - not supported since u is required)
  else if (vv !== undefined && tt !== undefined && ss !== undefined) {
    ss = u * tt + 0.5 * a * tt * tt;
  }

  if (vv === undefined || tt === undefined || ss === undefined) {
    throw new Error("Unable to solve with given inputs");
  }

  return { u, v: vv, a, t: tt, s: ss };
}

export interface ProjectileInput {
  /** Initial speed (m/s) */
  u: number;
  /** Launch angle from horizontal (degrees) */
  thetaDeg: number;
  /** Initial height (m) — default 0 */
  y0?: number;
  /** Gravity (m/s²) — default 9.81 */
  g?: number;
}

export interface ProjectileResult {
  /** Time of flight (s) */
  timeOfFlight: number;
  /** Maximum height (m) */
  maxHeight: number;
  /** Range (m) */
  range: number;
  /** Velocity at impact (m/s) */
  impactSpeed: number;
  /** Impact angle below horizontal (degrees) */
  impactAngleDeg: number;
  /** Trajectory equation coefficients: y = Ax² + Bx + C */
  trajectory: { A: number; B: number; C: number };
}

/**
 * Projectile motion under constant gravity (no air resistance).
 * y = y0 + x·tanθ - (g·x²)/(2u²cos²θ)
 */
export function projectile(input: ProjectileInput): ProjectileResult {
  const { u, thetaDeg, y0 = 0, g = 9.81 } = input;
  const theta = (thetaDeg * Math.PI) / 180;
  const ux = u * Math.cos(theta);
  const uy = u * Math.sin(theta);

  if (ux === 0) {
    // Vertical throw
    const tUp = uy / g;
    const hMax = y0 + (uy * uy) / (2 * g);
    const tDown = Math.sqrt(2 * hMax / g);
    return {
      timeOfFlight: tUp + tDown,
      maxHeight: hMax,
      range: 0,
      impactSpeed: Math.sqrt(2 * g * hMax),
      impactAngleDeg: 90,
      trajectory: { A: 0, B: 0, C: y0 },
    };
  }

  // Time of flight: y = 0 = y0 + uy*t - ½gt²
  const disc = uy * uy + 2 * g * y0;
  const tFlight = (uy + Math.sqrt(disc)) / g;

  // Max height
  const tUp = uy / g;
  const hMax = y0 + uy * tUp - 0.5 * g * tUp * tUp;

  // Range
  const range = ux * tFlight;

  // Impact velocity
  const vx = ux;
  const vy = uy - g * tFlight;
  const impactSpeed = Math.hypot(vx, vy);
  const impactAngleDeg = (Math.atan2(-vy, vx) * 180) / Math.PI;

  // Trajectory: y = Ax² + Bx + C
  const A = -g / (2 * ux * ux);
  const B = Math.tan(theta);
  const C = y0;

  return {
    timeOfFlight: tFlight,
    maxHeight: hMax,
    range,
    impactSpeed,
    impactAngleDeg,
    trajectory: { A, B, C },
  };
}

export interface KineticsInput {
  /** Mass (kg) */
  m: number;
  /** Forces as { Fx, Fy, Fz } (N) — can be single or array for resultant */
  forces: { Fx: number; Fy: number; Fz: number } | Array<{ Fx: number; Fy: number; Fz: number }>;
  /** Initial velocity { vx, vy, vz } (m/s) — default {0,0,0} */
  v0?: { vx: number; vy: number; vz: number };
  /** Time interval (s) */
  t: number;
}

/**
 * Kinetics: F = ma (Newton's 2nd law) / D'Alembert's principle.
 * Returns acceleration, final velocity, displacement.
 */
export function kinetics(input: KineticsInput): {
  a: { ax: number; ay: number; az: number };
  v: { vx: number; vy: number; vz: number };
  s: { sx: number; sy: number; sz: number };
} {
  const { m, forces, v0 = { vx: 0, vy: 0, vz: 0 }, t } = input;
  const forceArr = Array.isArray(forces) ? forces : [forces];
  const Fx = forceArr.reduce((sum, f) => sum + f.Fx, 0);
  const Fy = forceArr.reduce((sum, f) => sum + f.Fy, 0);
  const Fz = forceArr.reduce((sum, f) => sum + f.Fz, 0);

  const ax = Fx / m;
  const ay = Fy / m;
  const az = Fz / m;

  const vx = v0.vx + ax * t;
  const vy = v0.vy + ay * t;
  const vz = v0.vz + az * t;

  const sx = v0.vx * t + 0.5 * ax * t * t;
  const sy = v0.vy * t + 0.5 * ay * t * t;
  const sz = v0.vz * t + 0.5 * az * t * t;

  return {
    a: { ax, ay, az },
    v: { vx, vy, vz },
    s: { sx, sy, sz },
  };
}

export interface WorkEnergyInput {
  /** Mass (kg) */
  m: number;
  /** Initial velocity (m/s) */
  v1: number;
  /** Final velocity (m/s) — optional if solving for it */
  v2?: number;
  /** Net work done (J) — optional if solving for it */
  Wnet?: number;
  /** Non-conservative work (J) — optional */
  Wnc?: number;
  /** Change in potential energy (J) — optional */
  deltaPE?: number;
}

/**
 * Work-Energy theorem: Wnet = ΔKE = ½m(v2² - v1²)
 * With non-conservative forces: Wnc + ΔPE = ΔKE
 */
export function workEnergy(input: WorkEnergyInput): { v2: number; Wnet: number; deltaKE: number } {
  const { m, v1, v2, Wnet, Wnc = 0, deltaPE = 0 } = input;

  if (v2 !== undefined && Wnet !== undefined) {
    throw new Error("Provide either v2 or Wnet, not both");
  }

  if (v2 !== undefined) {
    const deltaKE = 0.5 * m * (v2 * v2 - v1 * v1);
    const WnetCalc = deltaKE - Wnc - deltaPE;
    return { v2, Wnet: WnetCalc, deltaKE };
  }

  if (Wnet !== undefined) {
    const deltaKE = Wnet + Wnc + deltaPE;
    const v2sq = v1 * v1 + (2 * deltaKE) / m;
    if (v2sq < 0) throw new Error("Imaginary velocity: check energy inputs");
    return { v2: Math.sqrt(v2sq), Wnet, deltaKE };
  }

  throw new Error("Provide either v2 or Wnet");
}

export interface ImpulseMomentumInput {
  /** Mass (kg) */
  m: number;
  /** Initial velocity (m/s) */
  v1: number;
  /** Final velocity (m/s) — optional if solving for it */
  v2?: number;
  /** Impulse (N·s) — optional if solving for it */
  I?: number;
  /** Average force (N) and time (s) — alternative to impulse */
  Favg?: number;
  t?: number;
}

/**
 * Impulse-Momentum: I = Δp = m(v2 - v1)
 * I = Favg × t for constant force
 */
export function impulseMomentum(input: ImpulseMomentumInput): { v2: number; I: number; deltaP: number } {
  const { m, v1, v2, I, Favg, t } = input;

  if (I !== undefined && (Favg !== undefined || t !== undefined)) {
    throw new Error("Provide either I or (Favg, t), not both");
  }

  const impulse = I ?? (Favg !== undefined && t !== undefined ? Favg * t : undefined);

  if (v2 !== undefined && impulse !== undefined) {
    throw new Error("Provide either v2 or impulse, not both");
  }

  if (v2 !== undefined) {
    const deltaP = m * (v2 - v1);
    return { v2, I: deltaP, deltaP };
  }

  if (impulse !== undefined) {
    const v2Calc = v1 + impulse / m;
    return { v2: v2Calc, I: impulse, deltaP: impulse };
  }

  throw new Error("Provide either v2 or impulse (or Favg and t)");
}

export interface CurvilinearInput {
  /** Speed (m/s) */
  v: number;
  /** Radius of curvature (m) */
  rho: number;
  /** Tangential acceleration (m/s²) — optional */
  at?: number;
}

/**
 * Curvilinear motion: an = v²/ρ, at = dv/dt
 * Total acceleration magnitude: a = √(at² + an²)
 */
export function curvilinear(input: CurvilinearInput): {
  an: number;
  at: number;
  a: number;
  thetaDeg: number; // angle between a and tangent
} {
  const { v, rho, at = 0 } = input;
  const an = (v * v) / rho;
  const a = Math.hypot(at, an);
  const thetaDeg = (Math.atan2(an, at) * 180) / Math.PI;
  return { an, at, a, thetaDeg };
}