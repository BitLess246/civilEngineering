// ─────────────────────────────────────────────────────────────────────────
// 3D space-frame analysis — Phase 5 of the 3D roadmap. 12-DOF members
// (axial + St-Venant torsion + biaxial Hermite bending) on the shared
// fem.ts core. DOF order per node: [ux, uy, uz, θx, θy, θz]; y is UP
// (matching the model space). Local axes: x′ along the member; y′ as close
// to global up as possible (global Z for verticals); z′ = x′ × y′.
// Loads: nodal (F/M all axes) and member gravity loads (global −Y): UDL,
// trapezoid (vdl) and point — converted to consistent local fixed-end
// vectors (Gauss + Hermite for the distributed ones).
// Units: coordinates m; E,G MPa; A mm²; I,J mm⁴; forces kN, kN·m.
// ─────────────────────────────────────────────────────────────────────────
import { luFactor, luSolve, symFactor, symSolve, matVec, matVecT, hermite, gauss5Vec } from './fem'
import type { SymFactor } from './fem'
import { nscpCombos, type Combo, type LoadCategory } from './beamAnalysis'
import type { ProgressFn } from './progress'
import { triShell } from './shell'

/** Second-order (P-Δ) options for the frame solve. */
export interface PDeltaOpts {
  pDelta?: boolean; maxIter?: number; tol?: number
  /** Constant geometric-stiffness axial state, per member (tension +), kN. When
   *  set together with `pDelta`, Kg is built ONCE from these forces (no
   *  self-consistent iteration) so the tangent Kt = Ke + Kg is constant — the
   *  ETABS-style "P-Δ from gravity loads" used by the pushover, where the axial
   *  pattern is frozen at a gravity preload while the lateral load is scaled.
   *  Length must equal the member count; a singular tangent returns null. */
  fixedAxial?: number[]
}

export interface F3Node { id: string; x: number; y: number; z: number }
export interface F3Member {
  id: string; i: string; j: string
  E: number; G: number      // MPa
  A: number                 // mm²
  Iy: number; Iz: number    // mm⁴ (Iz: bending under gravity for horizontal members)
  J: number                 // mm⁴
  /** Shear areas for Timoshenko shear deformation, mm² (Asy: shear along y′,
   *  pairs with bending about z′; Asz: along z′, pairs with bending about y′).
   *  Omitted or 0 → rigid in shear (classic Euler–Bernoulli element). Note:
   *  fixed-end forces stay Euler — exact for symmetric member loads (UDL);
   *  asymmetric point/VDL FEMs carry a small O(Φ) approximation. */
  Asy?: number; Asz?: number
  /** Released local DOFs at end i: [ux, uy, uz, θx, θy, θz] (true = force/moment = 0). */
  relI?: [boolean, boolean, boolean, boolean, boolean, boolean]
  /** Released local DOFs at end j: [ux, uy, uz, θx, θy, θz]. */
  relJ?: [boolean, boolean, boolean, boolean, boolean, boolean]
  /** Rigid end offset (member offset / rigid link) at end i: vector from node i to the
   *  member end in GLOBAL coords [m]. The span between the offset ends carries the flexible
   *  element; node↔end is a rigid arm. Used to model centroidal/eccentric connections. */
  offI?: [number, number, number]
  /** Rigid end offset at end j: vector from node j to the member end in global coords [m]. */
  offJ?: [number, number, number]
  /** Local-axis rotation about x′, degrees (ETABS local axis 2 angle). Orients
   *  the section: depth lies along y′. The bridge defaults verticals to 90°. */
  rot?: number
}
/** Flat triangular shell element (CST membrane + DKT plate bending) framing into
 *  three nodes of the model. Carries in-plane (wall) and out-of-plane (slab)
 *  stiffness in the same global solve as the frame members. E in MPa, t in mm. */
export interface F3Shell { id: string; nodes: [string, string, string]; E: number; nu: number; t: number }

export type F3Fixity = 'pin' | 'fixed' | 'spring'
export interface F3Support {
  node: string
  fixity: F3Fixity
  /** Spring stiffness per global axis [kN/m], used when fixity = 'spring'. */
  kx?: number; ky?: number; kz?: number
}

/**
 * Rigid floor diaphragm group: one master node and its slave nodes at the same
 * storey level. The constraint ties the in-plane DOFs {ux, uz, θy} of each
 * slave to the master via rigid body kinematics (arm effect included).
 */
export interface F3DiaphragmGroup {
  masterNode: string
  slaveNodes: string[]
}

export type F3Load =
  | { kind: 'node'; node: string; Fx?: number; Fy?: number; Fz?: number; Mx?: number; My?: number; Mz?: number; cat: LoadCategory }
  | { kind: 'member-udl'; member: string; w: number; cat: LoadCategory }                       // kN/m, global −Y
  | { kind: 'member-vdl'; member: string; x1: number; x2: number; w1: number; w2: number; cat: LoadCategory } // global −Y
  | { kind: 'member-point'; member: string; a: number; P: number; cat: LoadCategory }          // kN, global −Y at a from i
  /** Thermal axial prestress PT = EA·α·ΔT (kN). Positive ΔT = heating = member wants to elongate.
   *  Fixed-end forces in local x′: −PT at i-node, +PT at j-node (self-equilibrating pair). */
  | { kind: 'member-thermal'; member: string; PT: number; cat: LoadCategory }

export interface F3MemberResult {
  id: string; L: number
  f: number[]                 // local end forces ON the member (12)
  xs: number[]
  N: number[]; Vy: number[]; Vz: number[]; T: number[]; My: number[]; Mz: number[]
  Nmax: number; Vmax: number; Mmax: number; Tmax: number
}
export interface F3Reaction { node: string; fixity: F3Fixity; F: [number, number, number]; M: [number, number, number] }
/** Status of the iterative P-Δ solve (self-consistent Kg(N) path only; the
 *  `fixedAxial` path is a single solve and returns null outright when singular). */
export interface F3PDeltaStatus {
  converged: boolean   // residual < tol reached with a non-singular tangent
  singular: boolean    // tangent LU failed (elastic instability) — d is the last iterate
  iterations: number   // iterations performed
  residual: number     // last relative increment ‖Δd‖/‖d‖ (0 when d = 0 exactly)
}

export interface F3Result {
  d: number[]
  reactions: F3Reaction[]
  members: F3MemberResult[]
  Mmax: number; Vmax: number; Nmax: number
  /** Present only when an iterative P-Δ solve ran. Callers must check
   *  converged/singular rather than trusting d blindly near instability. */
  pDelta?: F3PDeltaStatus
}

/** St-Venant torsional constant for a solid rectangle b×h (mm). */
export function rectJ(b: number, h: number): number {
  const a = Math.max(b, h) / 2, c = Math.min(b, h) / 2
  return a * c ** 3 * (16 / 3 - 3.36 * (c / a) * (1 - c ** 4 / (12 * a ** 4)))
}

function scaleF3(ld: F3Load, f: number): F3Load {
  if (ld.kind === 'node') return { ...ld, Fx: (ld.Fx ?? 0) * f, Fy: (ld.Fy ?? 0) * f, Fz: (ld.Fz ?? 0) * f, Mx: (ld.Mx ?? 0) * f, My: (ld.My ?? 0) * f, Mz: (ld.Mz ?? 0) * f }
  if (ld.kind === 'member-udl') return { ...ld, w: ld.w * f }
  if (ld.kind === 'member-vdl') return { ...ld, w1: ld.w1 * f, w2: ld.w2 * f }
  if (ld.kind === 'member-thermal') return { ...ld, PT: ld.PT * f }
  return { ...ld, P: ld.P * f }
}

export function applyF3Combo(loads: F3Load[], factors: Partial<Record<LoadCategory, number>>): F3Load[] {
  return loads
    .map((ld) => scaleF3(ld, factors[ld.cat] ?? 0))
    .filter((ld) => {
      if (ld.kind === 'node') return [ld.Fx, ld.Fy, ld.Fz, ld.Mx, ld.My, ld.Mz].some((v) => Math.abs(v ?? 0) > 1e-9)
      if (ld.kind === 'member-udl') return Math.abs(ld.w) > 1e-9
      if (ld.kind === 'member-vdl') return Math.abs(ld.w1) + Math.abs(ld.w2) > 1e-9
      if (ld.kind === 'member-thermal') return Math.abs(ld.PT) > 1e-9
      return Math.abs(ld.P) > 1e-9
    })
}

/**
 * Resultant of an applied (already factored) load set in global axes, as
 * [ΣFx, ΣFy, ΣFz] (kN). Member gravity loads act in global −Y; their resultant
 * is the integral over the loaded length (UDL: w·L, VDL: ½(w1+w2)·Δ, point: P),
 * matching the equivalent nodal loads the solver assembles. Used for the
 * statics self-check ΣApplied + ΣReactions ≈ 0 (§8 — equilibrium sanity).
 */
export function appliedResultant(loads: F3Load[], memberLen: (id: string) => number): [number, number, number] {
  let fx = 0, fy = 0, fz = 0
  for (const ld of loads) {
    if (ld.kind === 'node') { fx += ld.Fx ?? 0; fy += ld.Fy ?? 0; fz += ld.Fz ?? 0 }
    else if (ld.kind === 'member-udl') { fy -= ld.w * memberLen(ld.member) }
    else if (ld.kind === 'member-vdl') {
      const L = memberLen(ld.member)
      const x1 = Math.max(0, ld.x1), x2 = Math.min(L, ld.x2)
      if (x2 > x1) fy -= 0.5 * (ld.w1 + ld.w2) * (x2 - x1)
    } else if (ld.kind === 'member-thermal') {
      // self-equilibrating — zero net global force
    } else { fy -= ld.P }
  }
  return [fx, fy, fz]
}

/** Local 12×12 stiffness. `phiY`/`phiZ` are the Timoshenko shear-flexibility
 *  parameters Φ = 12EI/(G·As·L²) per bending plane (Przemieniecki, Theory of
 *  Matrix Structural Analysis §5.6): the bending blocks become
 *    12EI/L³(1+Φ), 6EI/L²(1+Φ), (4+Φ)EI/L(1+Φ), (2−Φ)EI/L(1+Φ)
 *  Φ = 0 (the default) recovers the Euler–Bernoulli element exactly. */
/** Exported so `nonlinearFrame3d` builds its elements from THIS element rather
 *  than a re-derivation — which is what makes "the elastic case reproduces
 *  solveFrame3D exactly" a real check instead of a coincidence. */
export function kLocal(EA: number, GJ: number, EIy: number, EIz: number, L: number, phiY = 0, phiZ = 0): number[][] {
  const k = Array.from({ length: 12 }, () => new Array(12).fill(0))
  const set = (r: number, c: number, v: number) => { k[r][c] = v; k[c][r] = v }
  set(0, 0, EA / L); set(0, 6, -EA / L); set(6, 6, EA / L)
  set(3, 3, GJ / L); set(3, 9, -GJ / L); set(9, 9, GJ / L)
  // bending about z′ (uy, θz) — shear flexibility from Vy → phiZ
  const fz = 1 + phiZ
  const az = (12 * EIz) / (L ** 3 * fz), bz = (6 * EIz) / (L ** 2 * fz)
  const cz = ((4 + phiZ) * EIz) / (L * fz), dz = ((2 - phiZ) * EIz) / (L * fz)
  set(1, 1, az); set(1, 5, bz); set(1, 7, -az); set(1, 11, bz)
  set(5, 5, cz); set(5, 7, -bz); set(5, 11, dz)
  set(7, 7, az); set(7, 11, -bz)
  set(11, 11, cz)
  // bending about y′ (uz, θy) — mirrored signs; shear flexibility from Vz → phiY
  const fy = 1 + phiY
  const ay = (12 * EIy) / (L ** 3 * fy), by = (6 * EIy) / (L ** 2 * fy)
  const cy = ((4 + phiY) * EIy) / (L * fy), dy = ((2 - phiY) * EIy) / (L * fy)
  set(2, 2, ay); set(2, 4, -by); set(2, 8, -ay); set(2, 10, -by)
  set(4, 4, cy); set(4, 8, by); set(4, 10, dy)
  set(8, 8, ay); set(8, 10, by)
  set(10, 10, cy)
  return k
}

/** Local 12×12 geometric (initial-stress) stiffness for member axial force N
 *  (tension positive): adds stiffness in tension, removes it in compression —
 *  the basis of the P-Δ second-order iteration. Axial and torsion DOFs carry
 *  none; the two bending planes mirror kLocal's sign convention. */
export function kgLocal(N: number, L: number): number[][] {
  const k = Array.from({ length: 12 }, () => new Array(12).fill(0))
  const set = (r: number, c: number, v: number) => { k[r][c] = v; k[c][r] = v }
  const a = (6 * N) / (5 * L), b = N / 10, c = (2 * N * L) / 15, e = -(N * L) / 30
  // x′-y′ plane (uy, θz at 1,5,7,11)
  set(1, 1, a); set(1, 5, b); set(1, 7, -a); set(1, 11, b)
  set(5, 5, c); set(5, 7, -b); set(5, 11, e)
  set(7, 7, a); set(7, 11, -b)
  set(11, 11, c)
  // x′-z′ plane (uz, θy at 2,4,8,10) — mirrored coupling signs
  set(2, 2, a); set(2, 4, -b); set(2, 8, -a); set(2, 10, -b)
  set(4, 4, c); set(4, 8, b); set(4, 10, e)
  set(8, 8, a); set(8, 10, b)
  set(10, 10, c)
  return k
}

export type V3 = [number, number, number]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a: V3): V3 => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l] }

/** Rotation matrix rows = local axes (x′, y′, z′) in global components. */
/** Member local axes [x′, y′, z′]. `rotDeg` is an ETABS-style local-axis
 *  rotation about x′ (right-hand rule, i→j): +θ turns y′ toward z′. The section
 *  depth lies along y′, so rotDeg orients the strong axis. */
export function localAxes(dir: V3, rotDeg = 0): [V3, V3, V3] {
  const xp = norm(dir)
  const up: V3 = Math.abs(dot(xp, [0, 1, 0])) > 0.999 ? [0, 0, 1] : [0, 1, 0]
  const proj = dot(up, xp)
  const yp = norm([up[0] - proj * xp[0], up[1] - proj * xp[1], up[2] - proj * xp[2]])
  const zp = cross(xp, yp)
  if (!rotDeg) return [xp, yp, zp]
  const c = Math.cos((rotDeg * Math.PI) / 180), s = Math.sin((rotDeg * Math.PI) / 180)
  const ypr: V3 = [yp[0] * c + zp[0] * s, yp[1] * c + zp[1] * s, yp[2] * c + zp[2] * s]
  const zpr: V3 = [zp[0] * c - yp[0] * s, zp[1] * c - yp[1] * s, zp[2] * c - yp[2] * s]
  return [xp, ypr, zpr]
}

/** Resolve a member's local-axis rotation: an explicit value wins; otherwise
 *  vertical members default to 90° so the section depth lands on global X —
 *  the orientation the app draws (Member3D/MemberSteel3D), the joint designer
 *  assumes, and ETABS uses for columns (local 2 toward +X). */
export function defaultAxisRotation(dir: V3, explicit?: number): number {
  if (explicit !== undefined && Number.isFinite(explicit)) return explicit
  const L = Math.hypot(...dir)
  return L > 1e-9 && Math.abs(dir[1] / L) > 0.999 ? 90 : 0
}

function tMatrix(R: [V3, V3, V3]): number[][] {
  const T = Array.from({ length: 12 }, () => new Array(12).fill(0))
  for (let blk = 0; blk < 4; blk++)
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) T[3 * blk + r][3 * blk + c] = R[r][c]
  return T
}

// Written as plain loops rather than map/reduce: these run once per member per
// load case, and the closure the reducer allocates for each of the 144 entries
// cost more than the arithmetic did.
const mul = (A: number[][], B: number[][]): number[][] => {
  const n = A.length, m = B[0].length, p = B.length
  const C: number[][] = Array.from({ length: n }, () => new Array<number>(m).fill(0))
  for (let i = 0; i < n; i++) {
    const Ai = A[i], Ci = C[i]
    for (let j = 0; j < m; j++) {
      let s = 0
      for (let k = 0; k < p; k++) s += Ai[k] * B[k][j]
      Ci[j] = s
    }
  }
  return C
}
const transpose = (A: number[][]): number[][] => {
  const n = A.length, m = A[0].length
  const C: number[][] = Array.from({ length: m }, () => new Array<number>(n).fill(0))
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) C[j][i] = A[i][j]
  return C
}

/**
 * Tᵀ·k·T for a member whose transform is the plain rotation — T block-diagonal
 * with the same 3×3 R in all four blocks.
 *
 * BIT-IDENTICAL to the general 12×12 triple product, not an approximation of
 * it: the terms it skips are multiplications by the exact zeros that make up
 * three quarters of T, and adding 0·x to a running sum changes nothing. What
 * it saves is real though — 16 3×3 congruences instead of two dense 12×12
 * products, and no 12×12 T built at all.
 *
 * Members WITH rigid offsets have T = rotation · rigid-link, which is not
 * block-diagonal, and still take the general path.
 */
function congruence3(R: [V3, V3, V3], k: number[][]): number[][] {
  const out: number[][] = Array.from({ length: 12 }, () => new Array<number>(12).fill(0))
  const tmp = [new Array<number>(3).fill(0), new Array<number>(3).fill(0), new Array<number>(3).fill(0)]
  for (let bi = 0; bi < 4; bi++) {
    const oi = 3 * bi
    for (let bj = 0; bj < 4; bj++) {
      const oj = 3 * bj
      for (let r = 0; r < 3; r++) {                    // tmp = Rᵀ · k_block
        for (let c = 0; c < 3; c++) {
          let s = 0
          for (let q = 0; q < 3; q++) s += R[q][r] * k[oi + q][oj + c]
          tmp[r][c] = s
        }
      }
      for (let r = 0; r < 3; r++) {                    // out_block = tmp · R
        const tr = tmp[r], orow = out[oi + r]
        for (let c = 0; c < 3; c++) {
          let s = 0
          for (let q = 0; q < 3; q++) s += tr[q] * R[q][c]
          orow[oj + c] = s
        }
      }
    }
  }
  return out
}

/**
 * Rigid-link (member offset) transformation H mapping NODE DOFs → member-END DOFs, in
 * global coordinates. For a rigid arm r (node→end vector), the end displacement follows
 * rigid-body kinematics:  u_end = u_node + θ_node × r,  θ_end = θ_node. In matrix form the
 * per-end 6×6 block is [[I, M(r)],[0, I]] with M(r)·θ = θ × r, i.e.
 *   M(r) = [[0, rz, -ry], [-rz, 0, rx], [ry, -rx, 0]].
 * Composing with the rotation T (Teff = T·H) carries the offset through every Galerkin form
 * (Tᵀ k T, T·d, Tᵀ·f), so stiffness, loads, force recovery and Kg all stay consistent.
 */
function rigidLinkH(rI: V3, rJ: V3): number[][] {
  const H = Array.from({ length: 12 }, (_, i) => { const row = new Array(12).fill(0); row[i] = 1; return row })
  const block = (base: number, r: V3) => {
    const [rx, ry, rz] = r
    H[base + 0][base + 4] = rz;  H[base + 0][base + 5] = -ry
    H[base + 1][base + 3] = -rz; H[base + 1][base + 5] = rx
    H[base + 2][base + 3] = ry;  H[base + 2][base + 4] = -rx
  }
  block(0, rI)
  block(6, rJ)
  return H
}

// ── Geometry-only member data (load-independent) ──────────────────────────
export interface MemberGeom {
  L: number; R: [V3, V3, V3]
  kl: number[][]        // original 12×12 local stiffness (for force recovery)
  T: number[][]; kg: number[][]
  dofs: number[]
  gl: V3   // gravity unit vector in local coords: R · (0, −1, 0)
  // Release data — populated only when member has releases
  relIdx?: number[]     // which local DOFs (0-11) are released
  retIdx?: number[]     // which are retained (complement of relIdx)
  kff_inv?: number[][]  // inverse of k_ff sub-matrix (nf × nf)
  kfr?: number[][]      // k_fr sub-matrix (nf × nr), used in force recovery
}

// ── Shell element geometry (load-independent) ──────────────────────────────
export interface ShellGeom {
  id: string
  Ke: number[][]     // 18×18 global stiffness, DOF order [u,v,w,θx,θy,θz]×3 nodes
  dofs: number[]     // 18 global DOF indices
  A: number          // area (m²)
  normal: V3         // element +normal (global), for pressure loads
  nodeIds: [string, string, string]
}

function prepShellGeom(sh: F3Shell, nm: Map<string, F3Node>, idx: Map<string, number>): ShellGeom {
  const [na, nb, nc] = sh.nodes.map((id) => nm.get(id)!)
  const { Ke, A, f } = triShell(
    [na.x, na.y, na.z], [nb.x, nb.y, nb.z], [nc.x, nc.y, nc.z], sh.E, sh.nu, sh.t,
  )
  const dofs: number[] = []
  for (const id of sh.nodes) { const ni = idx.get(id)!; for (let k = 0; k < 6; k++) dofs.push(6 * ni + k) }
  return { id: sh.id, Ke, dofs, A, normal: f.R[2], nodeIds: sh.nodes }
}

// ── Load-dependent member data ─────────────────────────────────────────────
interface MemberLoads {
  feq: number[]         // original fixed-end forces (for postprocessMember)
  feqEff: number[]      // condensed feq (for global load vector assembly)
  /** Distributed load as the LINEAR SEGMENTS it is actually made of, already
   *  resolved into the member's three local directions (`w1`/`w2` are the
   *  global intensity at each end; `gl` projects it). Kept as data rather than
   *  as an intensity closure so the diagrams can integrate it in closed form —
   *  see `distShear`/`distMoment`. */
  dists: { x1: number; x2: number; w1: number; w2: number }[]
  gl: V3
  pts: { a: number; Py: number; Pz: number; Pa: number }[]
}

// ── Diagram quadrature, done exactly ─────────────────────────────────────
//
// The internal-force diagrams need ∫₀ˣ w and ∫₀ˣ w(m)·(x−m) dm at every
// sampling station. `w` is piecewise LINEAR — a list of segments — so both
// integrals have a closed form, and there is nothing to approximate.
//
// This used to be a trapezoid/midpoint sweep of up to 60 sub-intervals,
// re-run from zero at every station: ~25 stations × 4 integrals × 60 steps ×
// 2 evaluations ≈ 12 000 closure calls per member per load case, which is
// where essentially all of a solve went once the factorisation stopped being
// the bottleneck (99.8% of a combo solve at 204 members). It was also only
// approximate — the partition never lined up with a partial-length load's
// kinks, so any VDL or part-span UDL carried an O(Δ) error the closed form
// simply does not have.
//
// For one segment [a,b] with w(m) = w1 + s·(m−a), s = (w2−w1)/(b−a), taking
// c = min(b,x), U = c−a and X = x−a:
//
//   ∫ₐᶜ w dm            = w1·U + s·U²/2
//   ∫ₐᶜ w·(x−m) dm      = w1·X·U − w1·U²/2 + s·X·U²/2 − s·U³/3
//
// Units: w in kN/m, x in m ⇒ shear kN, moment kN·m.

/** ∫₀ˣ of the distributed intensity in local direction `comp`. */
function distShear(ml: MemberLoads, comp: number, x: number): number {
  const g = ml.gl[comp]
  if (g === 0) return 0
  let s = 0
  for (const d of ml.dists) {
    if (d.x2 <= d.x1 || x <= d.x1) continue
    const c = Math.min(d.x2, x), U = c - d.x1
    const slope = (d.w2 - d.w1) / Math.max(d.x2 - d.x1, 1e-12)
    s += d.w1 * U + (slope * U * U) / 2
  }
  return s * g
}

/** ∫₀ˣ of the distributed intensity times its lever (x−m) — the moment it
 *  contributes at station x, in local direction `comp`. */
function distMoment(ml: MemberLoads, comp: number, x: number): number {
  const g = ml.gl[comp]
  if (g === 0) return 0
  let s = 0
  for (const d of ml.dists) {
    if (d.x2 <= d.x1 || x <= d.x1) continue
    const c = Math.min(d.x2, x), U = c - d.x1, X = x - d.x1
    const slope = (d.w2 - d.w1) / Math.max(d.x2 - d.x1, 1e-12)
    s += d.w1 * X * U - (d.w1 * U * U) / 2 + (slope * X * U * U) / 2 - (slope * U * U * U) / 3
  }
  return s * g
}

/** Pre-factored frame: assemble K once and LU-factor it; reuse for every load case.
 *  K is geometry-only (first-order elastic). P-Δ rebuilds Kt = K+Kg per iteration
 *  using Kff_raw as the elastic baseline, so both paths benefit. */
export interface FramePrecomp {
  nm: Map<string, F3Node>
  idx: Map<string, number>
  nodes: F3Node[]
  members: F3Member[]
  supports: F3Support[]
  geoms: MemberGeom[]
  shellGeoms: ShellGeom[]        // flat-shell elements (empty when none)
  ndof: number
  free: number[]
  freeIdx: Map<number, number>   // global DOF → position in free[]
  /** Factored K (K_ind when a diaphragm is active). Skyline LDLᵀ under an RCM
   *  reordering where the block is symmetric positive definite — which is the
   *  ordinary case — and the dense pivoting LU where it is not. */
  Kff: SymFactor | null
  Kff_raw: number[][]            // un-factored nf×nf elastic stiffness (P-Δ baseline)
  /** Diaphragm constraint transformation rows (present when rigid floor diaphragm active).
   *  diaT[k] = sparse row of T for the k-th free DOF; T maps free→independent DOFs. */
  diaT?: { ind: number; coeff: number }[][]
  /** Number of independent DOFs (< free.length when diaphragm active). */
  diaNi?: number
}

/**
 * Static condensation — eliminates released local DOFs from the element stiffness.
 * Returns the condensed 12×12 stiffness (zeros at released rows/cols) and the
 * recovery data needed to reconstruct released-DOF displacements after the global solve.
 *
 * Derivation (Schur complement): partition k into retained (r) and released (f):
 *   k_cond = k_rr − k_rf · k_ff⁻¹ · k_fr
 * Force recovery: d_f = k_ff⁻¹ · (feq_f − k_fr · d_r)
 */
function condenseLocal(kl: number[][], relIdx: number[]): {
  klEff: number[][]
  retIdx: number[]
  kff_inv: number[][]
  kfr: number[][]
} {
  const n = 12
  const relSet = new Set(relIdx)
  const retIdx = Array.from({ length: n }, (_, i) => i).filter((i) => !relSet.has(i))
  const nf = relIdx.length

  const k_rr = retIdx.map((r) => retIdx.map((c) => kl[r][c]))
  const k_rf = retIdx.map((r) => relIdx.map((c) => kl[r][c]))
  const k_fr = relIdx.map((r) => retIdx.map((c) => kl[r][c]))
  const k_ff = relIdx.map((r) => relIdx.map((c) => kl[r][c]))

  // Invert k_ff (at most 6×6)
  const kff_fac = luFactor(k_ff)
  const kff_inv: number[][] = Array.from({ length: nf }, (_, k) => {
    const e = new Array(nf).fill(0); e[k] = 1
    return kff_fac ? luSolve(kff_fac, e) : e
  })

  // k_rf · k_ff⁻¹ (nr × nf)
  const k_rf_kffinv = k_rf.map((row) =>
    Array.from({ length: nf }, (_, j) => row.reduce((s, v, k) => s + v * kff_inv[k][j], 0)),
  )

  // k_cond (nr × nr)
  const k_cond_small = k_rr.map((row, i) =>
    row.map((v, j) => v - k_rf_kffinv[i].reduce((s, u, k) => s + u * k_fr[k][j], 0)),
  )

  // Expand to 12×12
  const klEff = Array.from({ length: n }, () => new Array(n).fill(0))
  retIdx.forEach((ri, i) => retIdx.forEach((ci, j) => { klEff[ri][ci] = k_cond_small[i][j] }))

  return { klEff, retIdx, kff_inv, kfr: k_fr }
}

function prepMemberGeom(m: F3Member, nm: Map<string, F3Node>, idx: Map<string, number>): MemberGeom {
  const ni = nm.get(m.i)!, nj = nm.get(m.j)!
  // Member ends shift by the rigid offsets; the flexible element spans end→end.
  const offI = m.offI ?? [0, 0, 0], offJ = m.offJ ?? [0, 0, 0]
  const pi: V3 = [ni.x + offI[0], ni.y + offI[1], ni.z + offI[2]]
  const pj: V3 = [nj.x + offJ[0], nj.y + offJ[1], nj.z + offJ[2]]
  const dir: V3 = sub(pj, pi)
  const L = Math.hypot(...dir)
  const R = localAxes(dir, m.rot ?? 0)
  const EA = (m.E * m.A) / 1000
  const GJ = m.G * m.J * 1e-9
  const EIy = m.E * m.Iy * 1e-9
  const EIz = m.E * m.Iz * 1e-9
  // Timoshenko shear flexibility Φ = 12EI/(G·As·L²); 0 without a shear area.
  const GAsy = m.Asy ? (m.G * m.Asy) / 1000 : 0   // kN
  const GAsz = m.Asz ? (m.G * m.Asz) / 1000 : 0
  const phiZ = GAsy > 0 ? (12 * EIz) / (GAsy * L * L) : 0
  const phiY = GAsz > 0 ? (12 * EIy) / (GAsz * L * L) : 0
  const kl = kLocal(EA, GJ, EIy, EIz, L, phiY, phiZ)

  // Collect released local DOF indices (end i = 0..5, end j = 6..11)
  const relIdx: number[] = []
  m.relI?.forEach((r, k) => { if (r) relIdx.push(k) })
  m.relJ?.forEach((r, k) => { if (r) relIdx.push(6 + k) })

  let klEff = kl
  let releaseData: Pick<MemberGeom, 'relIdx' | 'retIdx' | 'kff_inv' | 'kfr'> | undefined
  if (relIdx.length > 0) {
    const cond = condenseLocal(kl, relIdx)
    klEff = cond.klEff
    releaseData = { relIdx, retIdx: cond.retIdx, kff_inv: cond.kff_inv, kfr: cond.kfr }
  }

  // Effective transform node→local: rotation T composed with the rigid-link H when offsets
  // are present (Teff = T·H). With no offsets H = I, so this is exactly the rotation.
  const hasOffset = (m.offI && m.offI.some((v) => v !== 0)) || (m.offJ && m.offJ.some((v) => v !== 0))
  const T = hasOffset ? mul(tMatrix(R), rigidLinkH(offI, offJ)) : tMatrix(R)
  // uses condensed stiffness when releases exist
  const kg = hasOffset ? mul(mul(transpose(T), klEff), T) : congruence3(R, klEff)
  const ii = idx.get(m.i)!, jj = idx.get(m.j)!
  const dofs = [...Array.from({ length: 6 }, (_, k) => 6 * ii + k), ...Array.from({ length: 6 }, (_, k) => 6 * jj + k)]
  const gl: V3 = [R[0][1] * -1, R[1][1] * -1, R[2][1] * -1]
  return { L, R, kl, T, kg, dofs, gl, ...releaseData }
}

function computeMemberLoads(geom: MemberGeom, m: F3Member, loads: F3Load[]): MemberLoads {
  const { L, gl } = geom
  const feq = new Array(12).fill(0)
  const dists: { x1: number; x2: number; w1: number; w2: number }[] = []
  const pts: MemberLoads['pts'] = []

  for (const ld of loads) {
    if (ld.kind === 'member-udl' && ld.member === m.id) dists.push({ x1: 0, x2: L, w1: ld.w, w2: ld.w })
    else if (ld.kind === 'member-vdl' && ld.member === m.id) dists.push({ x1: Math.max(0, ld.x1), x2: Math.min(L, ld.x2), w1: ld.w1, w2: ld.w2 })
    else if (ld.kind === 'member-point' && ld.member === m.id) {
      const a = Math.max(0, Math.min(L, ld.a))
      pts.push({ a, Py: ld.P * gl[1], Pz: ld.P * gl[2], Pa: ld.P * gl[0] })
      const xi = a / L
      const N = hermite(xi, L)
      feq[0] += ld.P * gl[0] * (1 - xi); feq[6] += ld.P * gl[0] * xi
      feq[1] += ld.P * gl[1] * N[0]; feq[5] += ld.P * gl[1] * N[1]
      feq[7] += ld.P * gl[1] * N[2]; feq[11] += ld.P * gl[1] * N[3]
      feq[2] += ld.P * gl[2] * N[0]; feq[4] -= ld.P * gl[2] * N[1]
      feq[8] += ld.P * gl[2] * N[2]; feq[10] -= ld.P * gl[2] * N[3]
    } else if (ld.kind === 'member-thermal' && ld.member === m.id) {
      // Equivalent axial end forces in local x′: {f_T}^e = EA·α·ΔT · {-1, +1}
      // derived from ∫[B]^T · E·α·ΔT · A · dx (standard FEM thermal load vector).
      feq[0] -= ld.PT   // i-end: compressive push (−x′)
      feq[6] += ld.PT   // j-end: compressive push (+x′)
    }
  }
  for (const dd of dists) {
    if (dd.x2 <= dd.x1) continue
    const wAt = (x: number) => dd.w1 + ((dd.w2 - dd.w1) * (x - dd.x1)) / Math.max(dd.x2 - dd.x1, 1e-12)
    const fe = gauss5Vec((x) => {
      const w = wAt(x)
      const xi = x / L
      const N = hermite(xi, L)
      return [
        w * gl[0] * (1 - xi), w * gl[0] * xi,
        w * gl[1] * N[0], w * gl[1] * N[1], w * gl[1] * N[2], w * gl[1] * N[3],
        w * gl[2] * N[0], -w * gl[2] * N[1], w * gl[2] * N[2], -w * gl[2] * N[3],
      ]
    }, dd.x1, dd.x2, 10)
    feq[0] += fe[0]; feq[6] += fe[1]
    feq[1] += fe[2]; feq[5] += fe[3]; feq[7] += fe[4]; feq[11] += fe[5]
    feq[2] += fe[6]; feq[4] += fe[7]; feq[8] += fe[8]; feq[10] += fe[9]
  }

  // Condense feq when member has releases: feqEff[ret] = feq[ret] - k_rf · k_ff⁻¹ · feq[rel]
  let feqEff = feq
  if (geom.relIdx && geom.relIdx.length > 0 && geom.retIdx && geom.kff_inv && geom.kfr) {
    const { relIdx, retIdx, kff_inv, kfr } = geom
    const feq_f = relIdx.map((i) => feq[i])
    // k_ff⁻¹ · feq_f
    const kffinv_feqf = kff_inv.map((row) => row.reduce((s, v, k) => s + v * feq_f[k], 0))
    feqEff = [...feq]
    relIdx.forEach((i) => { feqEff[i] = 0 })
    retIdx.forEach((ri, i) => {
      // k_rf[i][j] = kfr[j][i] (k_fr transposed, by symmetry of k_l)
      feqEff[ri] -= kfr.reduce((s, row, j) => s + row[i] * kffinv_feqf[j], 0)
    })
  }

  return { feq, feqEff, dists, gl, pts }
}

type TEntry = { ind: number; coeff: number }

/**
 * Build the diaphragm constraint transformation T (nf × ni). Each row represents
 * one free DOF: identity for independent DOFs, rigid-body expression for slaves.
 *
 * Constraint (y is up; in-plane DOFs are ux=0, uz=2, θy=4):
 *   ux_slave = ux_m − (z_s−z_m)·θy_m
 *   uz_slave = uz_m + (x_s−x_m)·θy_m
 *   θy_slave = θy_m
 *
 * Returns null if no constraints could be applied (e.g., master DOFs are constrained).
 */
function buildDiaphragmT(
  nodes: F3Node[], idx: Map<string, number>, freeIdx: Map<number, number>,
  diaphragms: F3DiaphragmGroup[], nf: number,
): { Trow: TEntry[][]; ni: number } | null {
  const isSlave = new Uint8Array(nf)
  // slaveRow[k] = expression in terms of master fpos values (will be remapped to ind below)
  const slaveExpr: ({ masterFpos: number; coeff: number }[] | null)[] = new Array(nf).fill(null)

  for (const dia of diaphragms) {
    const mi = idx.get(dia.masterNode)
    if (mi === undefined) continue
    const mn = nodes[mi]
    const fp_ux_m = freeIdx.get(6 * mi + 0)
    const fp_uz_m = freeIdx.get(6 * mi + 2)
    const fp_θy_m = freeIdx.get(6 * mi + 4)
    // If master's lateral DOFs are constrained, skip this floor
    if (fp_ux_m === undefined || fp_uz_m === undefined || fp_θy_m === undefined) continue

    for (const slaveId of dia.slaveNodes) {
      const si = idx.get(slaveId)
      if (si === undefined || si === mi) continue
      const sn = nodes[si]
      const dx = sn.x - mn.x, dz = sn.z - mn.z

      const fp_ux_s = freeIdx.get(6 * si + 0)
      if (fp_ux_s !== undefined && !isSlave[fp_ux_s]) {
        isSlave[fp_ux_s] = 1
        slaveExpr[fp_ux_s] = [
          { masterFpos: fp_ux_m, coeff: 1 },
          ...(Math.abs(dz) > 1e-9 ? [{ masterFpos: fp_θy_m, coeff: -dz }] : []),
        ]
      }
      const fp_uz_s = freeIdx.get(6 * si + 2)
      if (fp_uz_s !== undefined && !isSlave[fp_uz_s]) {
        isSlave[fp_uz_s] = 1
        slaveExpr[fp_uz_s] = [
          { masterFpos: fp_uz_m, coeff: 1 },
          ...(Math.abs(dx) > 1e-9 ? [{ masterFpos: fp_θy_m, coeff: dx }] : []),
        ]
      }
      const fp_θy_s = freeIdx.get(6 * si + 4)
      if (fp_θy_s !== undefined && !isSlave[fp_θy_s]) {
        isSlave[fp_θy_s] = 1
        slaveExpr[fp_θy_s] = [{ masterFpos: fp_θy_m, coeff: 1 }]
      }
    }
  }

  if (!isSlave.some((v) => v)) return null

  // Assign independent indices (in-order, skipping slaves)
  const indOf = new Int32Array(nf).fill(-1)
  let ni = 0
  for (let k = 0; k < nf; k++) if (!isSlave[k]) indOf[k] = ni++

  // Build final Trow with proper independent indices
  const Trow: TEntry[][] = []
  for (let k = 0; k < nf; k++) {
    if (!isSlave[k]) {
      Trow.push([{ ind: indOf[k], coeff: 1 }])
    } else {
      Trow.push(
        (slaveExpr[k] ?? [])
          .map(({ masterFpos, coeff }) => ({ ind: indOf[masterFpos], coeff }))
          .filter((e) => e.ind >= 0),
      )
    }
  }
  return { Trow, ni }
}

/** Apply constraint transformation: K_ind[a,b] = Σ_{i,j} T[i,a]·Kff[i][j]·T[j,b] */
function applyTtoK(Kff: number[][], Trow: TEntry[][], ni: number): number[][] {
  const nf = Kff.length
  const K = Array.from({ length: ni }, () => new Array(ni).fill(0))
  for (let i = 0; i < nf; i++) {
    for (const { ind: a, coeff: ca } of Trow[i]) {
      for (let j = 0; j < nf; j++) {
        const kij = Kff[i][j]
        if (kij === 0) continue
        for (const { ind: b, coeff: cb } of Trow[j]) K[a][b] += ca * kij * cb
      }
    }
  }
  return K
}

/** Transform load vector: Ff_ind[a] = Σ_i T^T[a,i]·Ff[i] = Σ_i T[i,a]·Ff[i] */
function applyTtoLoad(Ff: number[], Trow: TEntry[][], ni: number): number[] {
  const Ff_ind = new Array(ni).fill(0)
  Ff.forEach((v, i) => { for (const { ind, coeff } of Trow[i]) Ff_ind[ind] += coeff * v })
  return Ff_ind
}

/** Recover free DOF displacements: d_f[i] = Σ_a T[i,a]·d_ind[a] */
function applyTrecover(d_ind: number[], Trow: TEntry[][]): number[] {
  return Trow.map((row) => row.reduce((s, { ind, coeff }) => s + coeff * d_ind[ind], 0))
}

/** Assemble K from member geometry, find free DOFs, LU-factor Kff.
 *  Call once per geometry/support change; reuse for every load case. */
export function precomputeFrame(
  nodes: F3Node[], members: F3Member[], supports: F3Support[],
  diaphragms?: F3DiaphragmGroup[], shells?: F3Shell[],
): FramePrecomp {
  const nm = new Map(nodes.map((n) => [n.id, n]))
  const idx = new Map(nodes.map((n, i) => [n.id, i]))
  const ndof = 6 * nodes.length

  const geoms = members.map((m) => prepMemberGeom(m, nm, idx))
  const shellGeoms = (shells ?? [])
    .filter((sh) => sh.nodes.every((id) => nm.has(id)))
    .map((sh) => prepShellGeom(sh, nm, idx))

  const constrained = new Set<number>()
  for (const s of supports) {
    const i = idx.get(s.node)
    if (i === undefined) continue
    if (s.fixity === 'spring') continue   // spring DOFs stay free; stiffness added below
    for (let k = 0; k < (s.fixity === 'fixed' ? 6 : 3); k++) constrained.add(6 * i + k)
  }
  const free: number[] = []
  for (let d = 0; d < ndof; d++) if (!constrained.has(d)) free.push(d)
  const freeIdx = new Map(free.map((dof, k) => [dof, k]))

  const nf = free.length
  const Kff_raw: number[][] = Array.from({ length: nf }, () => new Array(nf).fill(0))
  for (const g of geoms) {
    for (let a = 0; a < 12; a++) {
      const ia = freeIdx.get(g.dofs[a])
      if (ia === undefined) continue
      for (let b = 0; b < 12; b++) {
        const ib = freeIdx.get(g.dofs[b])
        if (ib === undefined) continue
        Kff_raw[ia][ib] += g.kg[a][b]
      }
    }
  }
  // Flat-shell elements: add their 18×18 global stiffness to the free block.
  for (const sg of shellGeoms) {
    for (let a = 0; a < 18; a++) {
      const ia = freeIdx.get(sg.dofs[a])
      if (ia === undefined) continue
      for (let b = 0; b < 18; b++) {
        const ib = freeIdx.get(sg.dofs[b])
        if (ib === undefined) continue
        Kff_raw[ia][ib] += sg.Ke[a][b]
      }
    }
  }

  // Spring supports: add translational spring stiffness to Kff diagonal
  for (const s of supports) {
    if (s.fixity !== 'spring') continue
    const i = idx.get(s.node)
    if (i === undefined) continue
    const ks = [s.kx ?? 0, s.ky ?? 0, s.kz ?? 0]
    ks.forEach((k, dir) => {
      if (k <= 0) return
      const pos = freeIdx.get(6 * i + dir)
      if (pos !== undefined) Kff_raw[pos][pos] += k
    })
  }

  if (diaphragms && diaphragms.length > 0) {
    const dia = buildDiaphragmT(nodes, idx, freeIdx, diaphragms, nf)
    if (dia) {
      const K_ind = applyTtoK(Kff_raw, dia.Trow, dia.ni)
      const Kff_ind = symFactor(K_ind)
      return { nm, idx, nodes, members, supports, geoms, shellGeoms, ndof, free, freeIdx,
               Kff: Kff_ind, Kff_raw, diaT: dia.Trow, diaNi: dia.ni }
    }
  }
  const Kff = symFactor(Kff_raw)   // null if singular; {n:0} if nf===0
  return { nm, idx, nodes, members, supports, geoms, shellGeoms, ndof, free, freeIdx, Kff, Kff_raw }
}

/** Plain-JSON-serializable form of FramePrecomp — Maps become entry arrays for postMessage. */
export interface FramePrecompSerial {
  nodes: F3Node[]
  members: F3Member[]
  supports: F3Support[]
  geoms: MemberGeom[]
  shellGeoms: ShellGeom[]
  ndof: number
  free: number[]
  freeIdxEntries: [number, number][]
  Kff: SymFactor | null
  Kff_raw: number[][]
  diaT?: { ind: number; coeff: number }[][]
  diaNi?: number
}

export function serializePrecomp(p: FramePrecomp): FramePrecompSerial {
  return {
    nodes: p.nodes, members: p.members, supports: p.supports,
    geoms: p.geoms, shellGeoms: p.shellGeoms, ndof: p.ndof, free: p.free,
    freeIdxEntries: [...p.freeIdx],
    Kff: p.Kff, Kff_raw: p.Kff_raw,
    ...(p.diaT ? { diaT: p.diaT, diaNi: p.diaNi } : {}),
  }
}

export function deserializePrecomp(s: FramePrecompSerial): FramePrecomp {
  return {
    nm: new Map(s.nodes.map((n) => [n.id, n])),
    idx: new Map(s.nodes.map((n, i) => [n.id, i])),
    nodes: s.nodes, members: s.members, supports: s.supports,
    geoms: s.geoms, shellGeoms: s.shellGeoms ?? [], ndof: s.ndof, free: s.free,
    freeIdx: new Map(s.freeIdxEntries),
    Kff: s.Kff, Kff_raw: s.Kff_raw,
    ...(s.diaT ? { diaT: s.diaT, diaNi: s.diaNi } : {}),
  }
}

function postprocessMember(m: F3Member, g: MemberGeom, ml: MemberLoads, d: number[]): F3MemberResult {
  const de = g.dofs.map((dof) => d[dof])
  let dl = matVec(g.T, de)

  // Recover released-DOF internal displacements so f at released ends = 0
  // d_f = k_ff⁻¹ · (feq_f − k_fr · d_r)
  if (g.relIdx && g.relIdx.length > 0 && g.retIdx && g.kff_inv && g.kfr) {
    const { relIdx, retIdx, kff_inv, kfr } = g
    const d_r = retIdx.map((i) => dl[i])
    const feq_f = relIdx.map((i) => ml.feq[i])
    const kfr_dr = kfr.map((row) => row.reduce((s, v, k) => s + v * d_r[k], 0))
    const rhs = feq_f.map((v, k) => v - kfr_dr[k])
    const d_f = kff_inv.map((row) => row.reduce((s, v, k) => s + v * rhs[k], 0))
    dl = [...dl]
    relIdx.forEach((ri, k) => { dl[ri] = d_f[k] })
  }

  const f = matVec(g.kl, dl).map((v, k) => v - ml.feq[k])

  const NS = 24
  const xsSet = new Set<number>()
  for (let k = 0; k <= NS; k++) xsSet.add((g.L * k) / NS)
  ml.pts.forEach((pt) => { xsSet.add(Math.max(0, pt.a - 1e-6)); xsSet.add(pt.a); xsSet.add(Math.min(g.L, pt.a + 1e-6)) })
  const xs = [...xsSet].sort((a, b) => a - b)

  const NN: number[] = [], Vy: number[] = [], Vz: number[] = [], TT: number[] = [], My: number[] = [], Mz: number[] = []
  for (const x of xs) {
    let n = -(f[0] + distShear(ml, 0, x))
    let vy = f[1] + distShear(ml, 1, x)
    let vz = f[2] + distShear(ml, 2, x)
    let mz = -f[5] + f[1] * x + distMoment(ml, 1, x)
    // `f` holds the local end forces ON the member, so the internal moment at
    // the i-end is the NEGATIVE of the stored end moment — for both axes. This
    // line used `+f[4]`, which left the i-end magnitude right (|±f[4]| is the
    // same) and every other station wrong by 2·f[4]: a fixed-base column came
    // back with a carry-over of 0.25 instead of the slope-deflection 0.50.
    // Caught by the STAAD.Pro cross-check on the Gridframe model.
    let my = -f[4] - f[2] * x - distMoment(ml, 2, x)
    for (const pt of ml.pts) {
      if (pt.a <= x) {
        n -= pt.Pa
        vy += pt.Py; vz += pt.Pz
        mz += pt.Py * (x - pt.a)
        my -= pt.Pz * (x - pt.a)
      }
    }
    NN.push(n); Vy.push(vy); Vz.push(vz); TT.push(-f[3]); My.push(my); Mz.push(mz)
  }
  return {
    id: m.id, L: g.L, f, xs, N: NN, Vy, Vz, T: TT, My, Mz,
    Nmax: Math.max(...NN.map(Math.abs)),
    Vmax: Math.max(...Vy.map(Math.abs), ...Vz.map(Math.abs)),
    Mmax: Math.max(...My.map(Math.abs), ...Mz.map(Math.abs)),
    Tmax: Math.max(...TT.map(Math.abs)),
  }
}

/** Solve one load case using a pre-factored frame — O(n²) first-order solve;
 *  P-Δ re-factors the tangent stiffness per iteration (unchanged cost vs. before). */
export function solveWithGeometry(
  precomp: FramePrecomp, loads: F3Load[], opts?: PDeltaOpts,
): F3Result | null {
  const { idx, members, geoms, shellGeoms, ndof, free, freeIdx, Kff, Kff_raw, supports, diaT, diaNi } = precomp
  let pdStatus: F3PDeltaStatus | undefined
  // Axial state of the FINAL tangent when P-Δ ran — reactions must then be
  // (K + Kg)·d − F, or the secondary P-Δ shear/moment never reaches supports.
  let geoAxial: ((mi: number) => number) | null = null

  // Bucket the member loads by the member they act on, once. `computeMemberLoads`
  // used to scan the WHOLE load list for every member, which is O(members ×
  // loads) per load case — on a frame where nearly every member carries its own
  // self-weight those two counts grow together, so the sweep grew quadratically
  // in the model. Each member now sees only its own loads, in the order it saw
  // them before.
  const byMember = new Map<string, F3Load[]>()
  for (const ld of loads) {
    if (!('member' in ld) || typeof ld.member !== 'string') continue
    const cur = byMember.get(ld.member)
    if (cur) cur.push(ld); else byMember.set(ld.member, [ld])
  }
  const mloads = members.map((m, i) => computeMemberLoads(geoms[i], m, byMember.get(m.id) ?? []))

  // Assemble global load vector F (use condensed feqEff so released DOFs get no moment)
  const F = new Array(ndof).fill(0)
  geoms.forEach((g, i) => {
    const fg = matVecT(g.T, mloads[i].feqEff)
    for (let a = 0; a < 12; a++) F[g.dofs[a]] += fg[a]
  })
  for (const ld of loads) {
    if (ld.kind !== 'node') continue
    const i = idx.get(ld.node)
    if (i === undefined) continue
    const v = [ld.Fx ?? 0, ld.Fy ?? 0, ld.Fz ?? 0, ld.Mx ?? 0, ld.My ?? 0, ld.Mz ?? 0]
    for (let k = 0; k < 6; k++) F[6 * i + k] += v[k]
  }

  const d = new Array(ndof).fill(0)
  if (free.length > 0) {
    if (!Kff) return null   // singular stiffness
    const Ff = free.map((dof) => F[dof])
    const nf = free.length

    // Free-block tangent Kt = Ke + Σ Kg(N): geometric stiffness assembled from a
    // per-member axial force (tension +). Shared by the self-consistent P-Δ
    // iteration and the fixed-axial (constant geometric tangent) pushover path.
    const assembleKtff = (axialOf: (mi: number) => number): number[][] => {
      const Ktff: number[][] = Array.from({ length: nf }, (_, i) => [...Kff_raw[i]])
      for (let mi = 0; mi < geoms.length; mi++) {
        const g = geoms[mi]
        const kgg = mul(mul(transpose(g.T), kgLocal(axialOf(mi), g.L)), g.T)
        for (let a = 0; a < 12; a++) {
          const ia = freeIdx.get(g.dofs[a])
          if (ia === undefined) continue
          for (let b = 0; b < 12; b++) {
            const ib = freeIdx.get(g.dofs[b])
            if (ib === undefined) continue
            Ktff[ia][ib] += kgg[a][b]
          }
        }
      }
      return Ktff
    }
    // Representative member axial (tension +) recovered from the current state d.
    const axialFromState = (mi: number): number => {
      const g = geoms[mi], ml = mloads[mi]
      const dl = matVec(g.T, g.dofs.map((dof) => d[dof]))
      const f = matVec(g.kl, dl).map((v, k) => v - ml.feq[k])
      return (f[6] - f[0]) / 2
    }

    if (opts?.pDelta && opts.fixedAxial) {
      // Constant geometric tangent from a prescribed axial state (ETABS-style
      // "P-Δ from gravity"): one solve, no self-consistent iteration. A singular
      // tangent (elastic instability under the preload) returns null.
      const fixed = opts.fixedAxial
      const Ktff = assembleKtff((mi) => fixed[mi] ?? 0)
      if (diaT && diaNi !== undefined) {
        const fac = luFactor(applyTtoK(Ktff, diaT, diaNi))
        if (!fac) return null
        const dn = applyTrecover(luSolve(fac, applyTtoLoad(Ff, diaT, diaNi)), diaT)
        free.forEach((dof, k) => (d[dof] = dn[k]))
      } else {
        const fac = luFactor(Ktff)
        if (!fac) return null
        const dn = luSolve(fac, Ff)
        free.forEach((dof, k) => (d[dof] = dn[k]))
      }
      geoAxial = (mi) => fixed[mi] ?? 0
    } else if (diaT && diaNi !== undefined) {
      // Constrained solve: transform load to independent DOFs, solve, recover full d_f
      const Ff_ind = applyTtoLoad(Ff, diaT, diaNi)
      const d_ind = symSolve(Kff, Ff_ind)   // Kff is already K_ind = T^T K T
      const d0 = applyTrecover(d_ind, diaT)
      free.forEach((dof, k) => (d[dof] = d0[k]))

      // P-Δ with diaphragm: transform tangent K to independent space each iteration
      if (opts?.pDelta) {
        const maxIter = opts.maxIter ?? 20
        const tol = opts.tol ?? 1e-5
        let res = Infinity, singular = false, iters = 0
        for (let it = 0; it < maxIter; it++) {
          const Kt_ind = applyTtoK(assembleKtff(axialFromState), diaT, diaNi)
          const Ktff_fac = luFactor(Kt_ind)
          if (!Ktff_fac) { singular = true; break }   // elastic instability — retain last d, flagged in status
          const dn = applyTrecover(luSolve(Ktff_fac, Ff_ind), diaT)
          let num = 0, den = 0
          free.forEach((dof, k) => { num += (dn[k] - d[dof]) ** 2; den += dn[k] ** 2 })
          free.forEach((dof, k) => (d[dof] = dn[k]))
          iters = it + 1
          res = den === 0 ? 0 : Math.sqrt(num / den)
          if (res < tol) break
        }
        pdStatus = { converged: !singular && res < tol, singular, iterations: iters, residual: res }
        geoAxial = axialFromState
      }
    } else {
      const d0 = symSolve(Kff, Ff)
      free.forEach((dof, k) => (d[dof] = d0[k]))

      // P-Δ: iterate K + Kg(N); Kg depends on load-case axial forces so Kff_raw
      // is the elastic baseline and we re-factor Ktff each iteration.
      if (opts?.pDelta) {
        const maxIter = opts.maxIter ?? 20
        const tol = opts.tol ?? 1e-5
        let res = Infinity, singular = false, iters = 0
        for (let it = 0; it < maxIter; it++) {
          const Ktff_fac = luFactor(assembleKtff(axialFromState))
          if (!Ktff_fac) { singular = true; break }          // elastic instability — retain last d, flagged in status
          const dn = luSolve(Ktff_fac, Ff)
          let num = 0, den = 0
          free.forEach((dof, k) => { num += (dn[k] - d[dof]) ** 2; den += dn[k] ** 2 })
          free.forEach((dof, k) => (d[dof] = dn[k]))
          iters = it + 1
          res = den === 0 ? 0 : Math.sqrt(num / den)
          if (res < tol) break
        }
        pdStatus = { converged: !singular && res < tol, singular, iterations: iters, residual: res }
        geoAxial = axialFromState
      }
    }
  }

  // Reactions: compute K·d via member contributions (avoids storing full K).
  // When P-Δ ran, add each member's Kg(N)·d so reactions carry the secondary
  // shear/moment: R = (K + Kg)·d − F, consistent with the tangent that solved d.
  // Kg is self-equilibrating per member, so ΣR = ΣF is unchanged.
  const Kd = new Array(ndof).fill(0)
  for (let mi = 0; mi < geoms.length; mi++) {
    const g = geoms[mi]
    const de = g.dofs.map((dof) => d[dof])
    const gde = matVec(g.kg, de)
    for (let a = 0; a < 12; a++) Kd[g.dofs[a]] += gde[a]
    if (geoAxial) {
      const kgg = mul(mul(transpose(g.T), kgLocal(geoAxial(mi), g.L)), g.T)
      const gge = matVec(kgg, de)
      for (let a = 0; a < 12; a++) Kd[g.dofs[a]] += gge[a]
    }
  }
  for (const sg of shellGeoms) {
    const de = sg.dofs.map((dof) => d[dof])
    const gde = matVec(sg.Ke, de)
    for (let a = 0; a < 18; a++) Kd[sg.dofs[a]] += gde[a]
  }
  const Rv = Kd.map((v, i) => v - F[i])

  const reactions: F3Reaction[] = supports
    .filter((s) => idx.has(s.node))
    .map((s) => {
      const i = idx.get(s.node)!
      if (s.fixity === 'spring') {
        // Spring reaction = restoring force = −k·d (opposes displacement, consistent with
        // pin/roller/fixed sign: positive = force the support exerts ON the structure in +axis).
        return {
          node: s.node, fixity: s.fixity,
          F: [
            -(s.kx ?? 0) * d[6 * i + 0],
            -(s.ky ?? 0) * d[6 * i + 1],
            -(s.kz ?? 0) * d[6 * i + 2],
          ] as [number, number, number],
          M: [0, 0, 0] as [number, number, number],
        }
      }
      return {
        node: s.node, fixity: s.fixity,
        F: [Rv[6 * i], Rv[6 * i + 1], Rv[6 * i + 2]] as [number, number, number],
        M: s.fixity === 'fixed' ? [Rv[6 * i + 3], Rv[6 * i + 4], Rv[6 * i + 5]] as [number, number, number] : [0, 0, 0] as [number, number, number],
      }
    })

  const results: F3MemberResult[] = members.map((m, mi) =>
    postprocessMember(m, geoms[mi], mloads[mi], d))

  return {
    d, reactions, members: results,
    Mmax: Math.max(...results.map((r) => r.Mmax), 0),
    Vmax: Math.max(...results.map((r) => r.Vmax), 0),
    Nmax: Math.max(...results.map((r) => r.Nmax), 0),
    ...(pdStatus ? { pDelta: pdStatus } : {}),
  }
}

/** Backward-compatible single-solve entry point. */
export function solveFrame3D(
  nodes: F3Node[], members: F3Member[], supports: F3Support[], loads: F3Load[],
  opts?: PDeltaOpts, shells?: F3Shell[],
): F3Result | null {
  return solveWithGeometry(precomputeFrame(nodes, members, supports, undefined, shells), loads, opts)
}

// ── NSCP combination orchestration ────────────────────────────────────────
export interface F3ComboRun { combo: Combo; result: F3Result | null; factored: F3Load[]; skipped: boolean }
export interface F3Analysis { perCombo: F3ComboRun[]; govIdx: number }

export interface F3AnalyzeOpts extends PDeltaOpts {
  /** NSCP §203.3.1 live-load factor f₁ (1.0 assembly/garage/Lo>4.8 kPa, else 0.5). */
  f1?: number
}

/** Analyze all NSCP combinations, sharing one K factorization across every combo. */
export function analyzeFrame3D(
  nodes: F3Node[], members: F3Member[], supports: F3Support[], loads: F3Load[],
  opts?: F3AnalyzeOpts, onProgress?: ProgressFn,
  diaphragms?: F3DiaphragmGroup[], shells?: F3Shell[],
): F3Analysis | null {
  const perCombo: F3ComboRun[] = []
  let govIdx = -1, govM = -1
  const combos = nscpCombos(opts?.f1 ?? 1.0)
  const precomp = precomputeFrame(nodes, members, supports, diaphragms, shells)   // factor K once
  combos.forEach((combo, i) => {
    onProgress?.({ phase: 'Analyzing load cases', current: i + 1, total: combos.length, detail: combo.name })
    const factored = applyF3Combo(loads, combo.f)
    if (factored.length === 0) { perCombo.push({ combo, result: null, factored, skipped: true }); return }
    const r = solveWithGeometry(precomp, factored, opts)
    perCombo.push({ combo, result: r, factored, skipped: false })
    if (r && r.Mmax > govM) { govM = r.Mmax; govIdx = perCombo.length - 1 }
  })
  return govIdx < 0 ? null : { perCombo, govIdx }
}
