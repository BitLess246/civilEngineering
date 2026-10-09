/**
 * Dynamics calculator — PRC CELE syllabus (Structural 35%).
 * Kinematics, kinetics, work-energy, impulse-momentum, friction, belt friction.
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
  // The body reaches s at the EARLIEST t ≥ 0 of ½at² + ut − s = 0, and v follows
  // from that t. Taking v = sign(a)·√(u² + 2as) instead picked the wrong root
  // for a decelerating body: u = 10, a = −2, s = 9 reached s at t = 1 (v = +8),
  // but returned t = 9, v = −8 — the second pass, after it had turned back.
  else if (ss !== undefined && vv === undefined && tt === undefined) {
    const disc = u * u + 2 * a * ss;
    if (disc < 0) throw new Error("No real solution for v with given s");
    if (a === 0) {
      if (u === 0 || ss / u < 0) throw new Error("The body never reaches s with a = 0");
      tt = ss / u;
    } else {
      const r = Math.sqrt(disc);
      const roots = [(-u + r) / a, (-u - r) / a].filter((x) => x >= -1e-12).sort((x, y) => x - y);
      if (!roots.length) throw new Error("The body never reaches s");
      tt = Math.max(0, roots[0]);
    }
    vv = u + a * tt;
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

  // Max height — reached at launch when the throw is downward (uy < 0)
  const tUp = Math.max(0, uy / g);
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
 * Work-Energy theorem: ΔKE = ½m(v2² − v1²) = Wnet + Wnc − ΔPE, where Wnet is
 * the work of any other applied force, Wnc the non-conservative work (friction
 * negative) and ΔPE = PE2 − PE1. A body that rises (ΔPE > 0) LOSES kinetic
 * energy — the classic form Wnc = ΔKE + ΔPE. (This used to add ΔPE, so a rising
 * body sped up.)
 */
export function workEnergy(input: WorkEnergyInput): { v2: number; Wnet: number; deltaKE: number } {
  const { m, v1, v2, Wnet, Wnc = 0, deltaPE = 0 } = input;

  if (v2 !== undefined && Wnet !== undefined) {
    throw new Error("Provide either v2 or Wnet, not both");
  }

  if (v2 !== undefined) {
    const deltaKE = 0.5 * m * (v2 * v2 - v1 * v1);
    const WnetCalc = deltaKE - Wnc + deltaPE;
    return { v2, Wnet: WnetCalc, deltaKE };
  }

  if (Wnet !== undefined) {
    const deltaKE = Wnet + Wnc - deltaPE;
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

// ─────────────────────────────────────────────────────────────────────────────
// FRICTION
// ─────────────────────────────────────────────────────────────────────────────

export interface FrictionInput {
  /** Mass (kg) */
  m: number;
  /** Coefficient of static friction */
  mu_s: number;
  /** Coefficient of kinetic friction */
  mu_k: number;
  /** Incline angle (degrees) — 0 for horizontal */
  thetaDeg: number;
  /** Applied force parallel to surface (N) — positive up the incline */
  F_applied?: number;
  /** Whether motion is impending/occurring */
  motion?: "impending" | "sliding" | "static";
}

/**
 * Friction on an inclined or horizontal plane.
 * Returns friction force, normal force, net force, and acceleration.
 */
export function friction(input: FrictionInput): {
  N: number;
  F_friction_max: number;
  F_friction: number;
  F_net: number;
  a: number;
  motion: "static" | "sliding";
} {
  const { m, mu_s, mu_k, thetaDeg, F_applied = 0, motion = "static" } = input;
  const theta = (thetaDeg * Math.PI) / 180;
  const W = m * 9.81;
  const N = W * Math.cos(theta);
  const F_friction_max = mu_s * N;
  const W_parallel = W * Math.sin(theta);

  // Determine if motion occurs
  const F_net_no_friction = F_applied - W_parallel;
  const F_friction_needed = Math.abs(F_net_no_friction);

  let F_friction: number;
  let motionResult: "static" | "sliding";

  if (motion === "sliding") {
    F_friction = mu_k * N * Math.sign(F_net_no_friction) * -1;
    motionResult = "sliding";
  } else if (F_friction_needed <= F_friction_max) {
    F_friction = -F_net_no_friction; // Static friction balances
    motionResult = "static";
  } else {
    // Impending motion - use kinetic friction
    F_friction = mu_k * N * Math.sign(F_net_no_friction) * -1;
    motionResult = "sliding";
  }

  const F_net = F_applied - W_parallel + F_friction;
  const a = F_net / m;

  return { N, F_friction_max, F_friction, F_net, a, motion: motionResult };
}

// ─────────────────────────────────────────────────────────────────────────────
// BELT FRICTION (CAPSTAN EQUATION)
// ─────────────────────────────────────────────────────────────────────────────

export interface BeltFrictionInput {
  /** Tension on tight side (N) */
  T1?: number;
  /** Tension on slack side (N) */
  T2?: number;
  /** Coefficient of friction between belt and pulley */
  mu: number;
  /** Angle of wrap (radians) */
  beta: number;
  /** Solve for: "T1" | "T2" | "mu" | "beta" */
  solveFor: "T1" | "T2" | "mu" | "beta";
}

/**
 * Belt friction / capstan equation: T1 = T2 * e^(μβ)
 * V-belt: T1 = T2 * e^(μβ / sin(α/2)) where α = groove angle
 */
export function beltFriction(input: BeltFrictionInput): {
  T1: number;
  T2: number;
  mu: number;
  beta: number;
  ratio: number;
} {
  const { T1, T2, mu, beta, solveFor } = input;
  const ratio = Math.exp(mu * beta);

  let T1Calc: number = T1 ?? 0, T2Calc: number = T2 ?? 0, muCalc = mu, betaCalc = beta;

  if (solveFor === "T1") {
    if (T2 === undefined) throw new Error("T2 required to solve for T1");
    T1Calc = T2 * ratio;
  } else if (solveFor === "T2") {
    if (T1 === undefined) throw new Error("T1 required to solve for T2");
    T2Calc = T1 / ratio;
  } else if (solveFor === "mu") {
    if (T1 === undefined || T2 === undefined) throw new Error("T1 and T2 required to solve for μ");
    if (T1 <= 0 || T2 <= 0) throw new Error("Tensions must be positive");
    muCalc = Math.log(T1 / T2) / beta;
  } else if (solveFor === "beta") {
    if (T1 === undefined || T2 === undefined) throw new Error("T1 and T2 required to solve for β");
    if (T1 <= 0 || T2 <= 0) throw new Error("Tensions must be positive");
    betaCalc = Math.log(T1 / T2) / mu;
  }

  // the ratio of the SOLVED belt: solving for μ or β must report e^(μβ) of
  // the answer, not of the input left over in the form
  return { T1: T1Calc, T2: T2Calc, mu: muCalc, beta: betaCalc, ratio: Math.exp(muCalc * betaCalc) };
}