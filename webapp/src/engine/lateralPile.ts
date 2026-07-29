// ─────────────────────────────────────────────────────────────────────────
// LATERALLY LOADED PILES — Broms ultimate capacity and p-y analysis. Layer L8.
//
// Two questions, two methods, deliberately both:
//
//  • BROMS (1964) — "what load fails it?" Closed-form ultimate capacity from
//    limit equilibrium, for short (rigid, soil-governed) and long (flexible,
//    hinge-governed) piles in clay and sand, free- or fixed-headed. Fast, no
//    iteration, and the right tool for sizing. The governing capacity is the
//    LOWER of the two failure modes, which is also what tells you which one a
//    pile is — a "short pile" is not a length, it is a verdict.
//
//  • p-y — "how far does it move, and where is the moment?" The pile is a beam
//    on nonlinear soil springs, solved by Newton. Serviceability lives here:
//    head deflection and the depth and magnitude of the maximum moment, which
//    Broms cannot give.
//
// The p-y solve uses 2-node BEAM ELEMENTS rather than a fourth-order finite
// difference. Same equation, but the boundary conditions are natural (a free
// head is simply an applied force and moment; a fixed head is a restrained
// rotation) instead of needing ghost nodes outside the pile, and the element
// end forces recover the moment diagram directly.
//
// Sign convention: y positive in the direction of the applied load, z positive
// downward from the ground surface. Soil reaction p opposes y.
//
// Units: lengths m; diameter m; EI kN·m²; forces kN; moments kN·m; unit weight
// kN/m³; cu and stresses kPa; subgrade modulus kN/m³; deflection returned in mm.
// Refs: Broms (1964a cohesive, 1964b cohesionless); Matlock (1970) soft clay;
// API RP 2A-WSD §6.8 sand; Reese & Van Impe, *Single Piles and Pile Groups*.
// ─────────────────────────────────────────────────────────────────────────
import { luFactor, luSolve } from './fem'

const deg = (d: number) => (d * Math.PI) / 180

// ══ Broms ultimate lateral capacity ═════════════════════════════════════════

export type PileHead = 'free' | 'fixed'

export interface BromsInput {
  /** Embedded length, m. */
  L: number
  /** Pile diameter / width, m. */
  d: number
  /** Height of the load above ground, m (free head only; 0 = at ground). */
  e?: number
  /** Yield (plastic) moment of the pile section, kN·m. */
  My: number
  head?: PileHead
}

export interface BromsClayInput extends BromsInput {
  /** Undrained shear strength, kPa. */
  cu: number
}

export interface BromsSandInput extends BromsInput {
  /** Effective unit weight, kN/m³. */
  gamma: number
  /** Friction angle, degrees. */
  phiDeg: number
}

export interface BromsResult {
  /** Capacity if the SOIL fails first (rigid pile rotation), kN. */
  shortPile: number
  /** Capacity if the PILE hinges first, kN. */
  longPile: number
  /** Governing ultimate lateral capacity — the lower of the two, kN. */
  Hu: number
  /** Which mechanism governs. */
  mode: 'short' | 'long'
  /** Maximum moment in the pile at Hu, kN·m. */
  Mmax: number
  /** Depth to the maximum moment, m below ground. */
  zMax: number
}

/**
 * Broms ultimate lateral capacity in COHESIVE soil.
 *
 * Soil resistance is taken as the classic 9·cu·d per unit length, developed
 * only below 1.5d — the top 1.5 diameters are assumed to shed by gapping and
 * softening and are given no resistance at all.
 *
 * FREE HEAD, short pile — derived rather than quoted. With q = 9·cu·d, a = 1.5d
 * and rotation at depth z_r, horizontal equilibrium gives H = q(2z_r − a − L)
 * and moment equilibrium about the load point gives
 *     z_r² + 2e·z_r − (e·a + a²/2 + e·L + L²/2) = 0,
 * so z_r follows in closed form and H with it. With e = 0 and a = 0 this
 * reduces to H = 0.414·q·L, the standard result — which is a test.
 *
 * LONG pile — a hinge forms where the shear is zero, at depth a + H/q:
 *     H·(e + a) + H²/(2q) = My      (free head)
 *     H·(e + a) + H²/(2q) = 2·My    (fixed head: hinges at the head AND in span)
 */
export function bromsClay(p: BromsClayInput): BromsResult {
  const { L, d, cu, My } = p
  const e = p.e ?? 0
  const head = p.head ?? 'free'
  const q = 9 * cu * d           // kN/m
  const a = 1.5 * d

  let short: number
  if (head === 'fixed') {
    // translation without rotation: the whole effective length resists
    short = Math.max(q * (L - a), 0)
  } else {
    const c = e * a + (a * a) / 2 + e * L + (L * L) / 2
    const zr = -e + Math.sqrt(Math.max(e * e + c, 0))
    short = Math.max(q * (2 * zr - a - L), 0)
  }

  // long pile: solve H(e+a) + H²/(2q) = m·My
  const m = head === 'fixed' ? 2 : 1
  const long = q > 0
    ? q * (-(e + a) + Math.sqrt((e + a) ** 2 + (2 * m * My) / q))
    : Infinity

  const Hu = Math.min(short, long)
  const f = q > 0 ? Hu / q : 0
  const zMax = a + f
  const Mmax = head === 'fixed'
    ? Hu * (e + a) + (Hu * Hu) / (2 * q) - (m === 2 ? My : 0)
    : Hu * (e + a) + (Hu * Hu) / (2 * q)
  return { shortPile: short, longPile: long, Hu, mode: short <= long ? 'short' : 'long', Mmax, zMax }
}

/**
 * Broms ultimate lateral capacity in COHESIONLESS soil.
 *
 * Resistance is the triangular 3·Kp·γ·z·d per unit length (three times Rankine
 * passive, Broms' allowance for the three-dimensional wedge).
 *
 * FREE HEAD, short — moments about the toe with the resultant 1.5·Kp·γ·d·L² at
 * L/3 above it give the standard  Hu = 0.5·Kp·γ·d·L³/(e + L).
 * FIXED HEAD, short — pure translation, so the full resultant is available:
 * Hu = 1.5·Kp·γ·d·L².
 * LONG — a hinge forms at depth f where the shear vanishes, H = 1.5·Kp·γ·d·f²,
 * and M = H·e + (2/3)·H·f = m·My is solved for H (m = 2 when fixed-headed).
 */
export function bromsSand(p: BromsSandInput): BromsResult {
  const { L, d, gamma, phiDeg, My } = p
  const e = p.e ?? 0
  const head = p.head ?? 'free'
  const Kp = Math.tan(deg(45 + phiDeg / 2)) ** 2
  const c = 1.5 * Kp * gamma * d          // H = c·f² at the hinge depth

  const short = head === 'fixed'
    ? c * L * L
    : (0.5 * Kp * gamma * d * L ** 3) / Math.max(e + L, 1e-9)

  // long: H·e + (2/3)·H·√(H/c) = m·My — monotone in H, so bisect
  const m = head === 'fixed' ? 2 : 1
  const g = (H: number) => H * e + (2 / 3) * H * Math.sqrt(H / c) - m * My
  let lo = 0, hi = Math.max(short * 4, 1)
  for (let i = 0; i < 200 && g(hi) < 0; i++) hi *= 2
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (g(mid) < 0) lo = mid; else hi = mid }
  const long = c > 0 ? (lo + hi) / 2 : Infinity

  const Hu = Math.min(short, long)
  const zMax = Math.sqrt(Math.max(Hu / c, 0))
  const Mmax = Hu * e + (2 / 3) * Hu * zMax - (m === 2 ? My : 0)
  return { shortPile: short, longPile: long, Hu, mode: short <= long ? 'short' : 'long', Mmax, zMax }
}

// ══ p-y curves ══════════════════════════════════════════════════════════════

export interface PyPoint {
  /** Soil reaction per unit length, kN/m. */
  p: number
  /** Tangent dp/dy, kN/m per m. */
  k: number
}

/**
 * MATLOCK (1970) soft-clay p-y curve.
 *   pu = min(3 + γ′z/cu + J·z/D, 9)·cu·D      (the 9·cu·D deep value is the cap)
 *   p  = 0.5·pu·(y/y50)^(1/3) ≤ pu,   y50 = 2.5·ε50·D
 * J is Matlock's empirical factor, 0.5 for soft clay.
 *
 * REGULARISED at the origin. The cube root has an INFINITE tangent at y = 0,
 * which is an artifact of the empirical fit — real soil has a finite initial
 * stiffness — and it makes a Newton solve unable to balance the near-zero
 * springs down the shaft: measured, the residual stalled at ~2e-6 no matter how
 * many iterations were allowed, while the deflections themselves had long since
 * stopped changing. Below |y| = 1e-3·y50 the curve is therefore the straight
 * secant through that point. The cutoff is around 0.015 mm on a 600 mm pile —
 * far below anything the analysis is claiming to resolve — and `p` stays
 * continuous across it.
 */
export function matlockClayPy(
  y: number, z: number, p: { cu: number; gamma: number; D: number; e50?: number; J?: number },
): PyPoint {
  const { cu, gamma, D } = p
  const e50 = p.e50 ?? 0.01, J = p.J ?? 0.5
  const N = Math.min(3 + (gamma * z) / Math.max(cu, 1e-9) + (J * z) / Math.max(D, 1e-9), 9)
  const pu = N * cu * D
  const y50 = 2.5 * e50 * D
  const ay = Math.abs(y)
  if (!(pu > 0) || !(y50 > 0)) return { p: 0, k: 0 }
  const rMin = 1e-3
  const r = ay / y50
  if (r <= rMin) {
    // straight secant through (rMin·y50, p(rMin·y50)) — see the note above
    const kLin = (0.5 * pu * Math.cbrt(rMin)) / (rMin * y50)
    return { p: kLin * y, k: kLin }
  }
  if (r >= 8) return { p: Math.sign(y) * pu, k: 0 } // 0.5·8^(1/3) = 1 ⇒ pu reached
  const f = 0.5 * pu * Math.cbrt(r)
  return { p: Math.sign(y) * f, k: (0.5 * pu) / (3 * y50 * Math.cbrt(r * r)) }
}

/** API RP 2A coefficients C1, C2, C3 from the friction angle — the analytical
 *  wedge expressions, not a curve fit read off the published chart. */
export function apiSandCoeffs(phiDeg: number): { C1: number; C2: number; C3: number } {
  const phi = deg(phiDeg)
  const alpha = phi / 2
  const beta = deg(45 + phiDeg / 2)
  const K0 = 0.4
  const Ka = Math.tan(deg(45 - phiDeg / 2)) ** 2
  const tb = Math.tan(beta), tbp = Math.tan(beta - phi)
  const C1 = (K0 * Math.tan(phi) * Math.sin(beta)) / (tbp * Math.cos(alpha))
    + (tb * tb * Math.tan(alpha)) / tbp
    + K0 * tb * (Math.tan(phi) * Math.sin(beta) - Math.tan(alpha))
  const C2 = tb / tbp - Ka
  const C3 = Ka * (tb ** 8 - 1) + K0 * Math.tan(phi) * tb ** 4
  return { C1, C2, C3 }
}

/**
 * API RP 2A-WSD sand p-y curve:
 *   pu = min((C1·z + C2·D)·γ·z,  C3·D·γ·z)     — wedge near surface, flow deep
 *   p  = A·pu·tanh(k·z·y/(A·pu)),   A = max(3 − 0.8·z/D, 0.9)
 * `k` is the initial modulus of subgrade reaction, kN/m³.
 */
export function apiSandPy(
  y: number, z: number, p: { gamma: number; phiDeg: number; D: number; k: number },
): PyPoint {
  const { gamma, phiDeg, D, k } = p
  const { C1, C2, C3 } = apiSandCoeffs(phiDeg)
  const pu = Math.min((C1 * z + C2 * D) * gamma * z, C3 * D * gamma * z)
  const A = Math.max(3 - (0.8 * z) / Math.max(D, 1e-9), 0.9)
  const cap = A * pu
  if (!(cap > 0) || !(k > 0) || !(z > 0)) return { p: 0, k: 0 }
  const arg = (k * z * y) / cap
  const th = Math.tanh(arg)
  return { p: cap * th, k: k * z * (1 - th * th) }
}

// ══ p-y analysis: beam on nonlinear soil springs ════════════════════════════

export type SoilModel =
  | { kind: 'clay'; cu: number; gamma: number; e50?: number; J?: number }
  | { kind: 'sand'; gamma: number; phiDeg: number; k: number }

export interface PyInput {
  /** Embedded length, m. */
  L: number
  /** Diameter, m. */
  D: number
  /** Flexural rigidity EI, kN·m². */
  EI: number
  /** Applied lateral load at the head, kN. */
  H: number
  /**
   * Overturning moment applied at the head, kN·m — POSITIVE in the same sense
   * as H, i.e. it pushes the head further in the load direction. Free head only.
   *
   * Stated physically rather than in the solver's DOF convention on purpose:
   * with θ = dy/dz and z measured downward, the head rotation under H is
   * NEGATIVE, so the work-conjugate nodal moment has the opposite sign to the
   * overturning sense. Exposing the raw convention would have handed callers a
   * silent sign error — an eccentric load would have made the pile deflect LESS.
   */
  M?: number
  /** Load eccentricity above ground, m. Equivalent to `M = H·e`, and usually
   *  the number actually to hand. Added to `M` if both are given. */
  e?: number
  head?: PileHead
  soil: SoilModel
  /** Number of elements (default 50). */
  elements?: number
  maxIter?: number
  tol?: number
  /**
   * Backtracking halvings allowed per Newton iteration (default 25).
   *
   * Not optional in practice for clay: Matlock's curve is p ∝ y^(1/3), whose
   * tangent is INFINITE at y = 0, so full Newton overshoots wildly while the
   * deflections are still small and the solve fails at exactly the service
   * loads one cares about. Measured before the line search was added: every
   * load below about 150 kN on a 12 m pile failed to converge, some reporting a
   * negative head deflection. With it, the same cases converge in a few steps.
   */
  maxBacktrack?: number
}

export interface PyStation {
  z: number
  /** Deflection, mm. */
  y: number
  /** Bending moment, kN·m. */
  moment: number
  /** Soil reaction, kN/m. */
  p: number
}

export interface PyResult {
  stations: PyStation[]
  /** Head deflection, mm. */
  yHead: number
  /** Maximum |moment| and where it occurs. */
  Mmax: number
  zMmax: number
  converged: boolean
  iterations: number
  /** Relative residual at the end. */
  residual: number
}

/**
 * Solve a laterally loaded pile as a beam on nonlinear p-y springs.
 *
 * Newton on the free DOFs, with the spring tangent from the p-y curve. The
 * clay curve has a VERTICAL tangent at the origin (p ∝ y^1/3), which would make
 * the first iteration's stiffness infinite; the tangent is therefore capped at
 * a large multiple of the beam stiffness rather than used raw. That cap only
 * ever affects the first step away from zero — the converged answer satisfies
 * the true curve, which the residual check enforces.
 */
export function pyAnalysis(inp: PyInput): PyResult {
  const { L, D, EI, H } = inp
  const n = Math.max(4, Math.floor(inp.elements ?? 50))
  const head = inp.head ?? 'free'
  const maxIter = inp.maxIter ?? 60
  const tol = inp.tol ?? 1e-9
  const maxBacktrack = inp.maxBacktrack ?? 25
  const h = L / n
  const nn = n + 1
  const ndof = 2 * nn                       // y, θ per node

  // element stiffness of a uniform beam, 4×4 on [y1, θ1, y2, θ2]
  const ke = [
    [12 * EI / h ** 3, 6 * EI / h ** 2, -12 * EI / h ** 3, 6 * EI / h ** 2],
    [6 * EI / h ** 2, 4 * EI / h, -6 * EI / h ** 2, 2 * EI / h],
    [-12 * EI / h ** 3, -6 * EI / h ** 2, 12 * EI / h ** 3, -6 * EI / h ** 2],
    [6 * EI / h ** 2, 2 * EI / h, -6 * EI / h ** 2, 4 * EI / h],
  ]
  const Kb: number[][] = Array.from({ length: ndof }, () => new Array(ndof).fill(0))
  for (let e = 0; e < n; e++) {
    const dofs = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3]
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) Kb[dofs[r]][dofs[c]] += ke[r][c]
  }

  const trib = (i: number) => (i === 0 || i === n ? h / 2 : h)
  const curve = (y: number, z: number): PyPoint =>
    inp.soil.kind === 'clay'
      ? matlockClayPy(y, z, { cu: inp.soil.cu, gamma: inp.soil.gamma, D, e50: inp.soil.e50, J: inp.soil.J })
      : apiSandPy(y, z, { gamma: inp.soil.gamma, phiDeg: inp.soil.phiDeg, D, k: inp.soil.k })

  // cap on the spring tangent: the clay curve is vertical at y = 0
  const kCap = (1e6 * EI) / h ** 3

  // external load vector
  const F = new Array(ndof).fill(0)
  F[0] = H
  // negated: see the sign note on `M`
  if (head === 'free') F[1] = -((inp.M ?? 0) + H * (inp.e ?? 0))

  // fixed head restrains the head rotation
  const fixed = new Set<number>()
  if (head === 'fixed') fixed.add(1)
  const free = Array.from({ length: ndof }, (_, i) => i).filter((i) => !fixed.has(i))
  const fpos = new Map(free.map((g, i) => [g, i]))
  const nf = free.length

  const d = new Array(ndof).fill(0)
  let it = 0, ok = false, rel = 0

  const soilForce = (dv: number[]) => {
    const fs = new Array(ndof).fill(0)
    for (let i = 0; i < nn; i++) {
      const z = i * h
      const { p } = curve(dv[2 * i], z)
      fs[2 * i] += p * trib(i)
    }
    return fs
  }

  /** Out-of-balance on the free DOFs, with the scale its norm is judged by. */
  const residualAt = (dv: number[]) => {
    const fs = soilForce(dv)
    const R = new Array(nf).fill(0)
    let rn = 0, scale = 1e-12
    for (const g of free) {
      let kd = 0
      for (let q = 0; q < ndof; q++) kd += Kb[g][q] * dv[q]
      const internal = kd + fs[g]
      const r = F[g] - internal
      R[fpos.get(g)!] = r
      rn += r * r
      scale = Math.max(scale, Math.abs(internal), Math.abs(F[g]))
    }
    return { R, rn: Math.sqrt(rn), rel: Math.sqrt(rn) / scale }
  }

  for (; it < maxIter; it++) {
    const cur = residualAt(d)
    const R = cur.R
    rel = cur.rel
    if (rel <= tol) { ok = true; break }

    const Kt: number[][] = Array.from({ length: nf }, () => new Array(nf).fill(0))
    for (const g of free) {
      const r = fpos.get(g)!
      for (const g2 of free) Kt[r][fpos.get(g2)!] = Kb[g][g2]
    }
    for (let i = 0; i < nn; i++) {
      const g = 2 * i
      const pr = fpos.get(g)
      if (pr === undefined) continue
      const { k } = curve(d[g], i * h)
      Kt[pr][pr] += Math.min(Number.isFinite(k) ? k : kCap, kCap) * trib(i)
    }
    const lu = luFactor(Kt)
    if (!lu) break
    const du = luSolve(lu, R)

    // backtracking line search — see `maxBacktrack`
    let step = 1
    for (let k = 0; k <= maxBacktrack; k++) {
      const trial = [...d]
      for (const g of free) trial[g] += step * du[fpos.get(g)!]
      if (residualAt(trial).rn < cur.rn || k === maxBacktrack) {
        for (const g of free) d[g] = trial[g]
        break
      }
      step *= 0.5
    }
  }

  // recover moments from element end forces
  const stations: PyStation[] = []
  for (let i = 0; i < nn; i++) {
    const z = i * h
    const e = Math.min(i, n - 1)
    const dofs = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3]
    const v = dofs.map((g) => d[g])
    const fe = ke.map((row) => row.reduce((s, kv, c) => s + kv * v[c], 0))
    // moment at the requested end of that element (sign: sagging positive)
    const M = i === e ? -fe[1] : fe[3]
    stations.push({ z, y: d[2 * i] * 1000, moment: M, p: curve(d[2 * i], z).p })
  }
  let Mmax = 0, zMmax = 0
  for (const s of stations) if (Math.abs(s.moment) > Math.abs(Mmax)) { Mmax = s.moment; zMmax = s.z }

  return {
    stations, yHead: d[0] * 1000, Mmax: Math.abs(Mmax), zMmax,
    converged: ok, iterations: it, residual: rel,
  }
}
