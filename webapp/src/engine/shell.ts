// ─────────────────────────────────────────────────────────────────────────
// Flat-shell finite elements — Tier 3 #13 of the STAAD-parity roadmap.
// True thin-shell walls & slabs (vs. the tributary "load source" plates).
//
// Element: a 3-node flat triangular shell = CST membrane (in-plane) + DKT
// (Discrete Kirchhoff Triangle, Batoz/Bathe/Ho 1980) plate bending, with a
// small drilling stiffness on the out-of-plane node rotation so the 6-DOF
// node assembly stays non-singular and is compatible with the frame solver.
// DOF order per node: [u, v, w, θx, θy, θz] (same as frame3d). Quad panels
// are meshed as two triangles by the caller.
//
// Theory:
//  • Membrane — plane stress, Dm = E/(1−ν²)·[[1,ν,0],[ν,1,0],[0,0,(1−ν)/2]],
//    Km = t·A·Bᵀ Dm B with the constant CST strain matrix (exact for constant
//    strain → passes the membrane patch test).
//  • Bending — Db = E·t³/12(1−ν²)·[[1,ν,0],[ν,1,0],[0,0,(1−ν)/2]];
//    Kb = ∫∫ Bᵀ Db B dA over the triangle via the 3-point mid-edge rule
//    (exact for the linear DKT curvature field). DKT enforces the Kirchhoff
//    thin-plate constraint discretely → converges to Timoshenko plate theory.
//
// Units (consistent kN, m): coordinates m; E MPa→kN/m² (×1e3); t mm→m (÷1e3);
// stiffness kN/m (translation) / kN·m (rotation), matching frame3d.
// ─────────────────────────────────────────────────────────────────────────
import { luFactor, luSolve } from './fem'

export type V3 = [number, number, number]

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2])
const norm = (a: V3): V3 => { const l = len(a); return [a[0] / l, a[1] / l, a[2] / l] }

const zeros = (r: number, c: number): number[][] => Array.from({ length: r }, () => new Array(c).fill(0))
const transpose = (A: number[][]): number[][] => A[0].map((_, j) => A.map((row) => row[j]))
const mul = (A: number[][], B: number[][]): number[][] =>
  A.map((row) => B[0].map((_, j) => row.reduce((s, v, k) => s + v * B[k][j], 0)))

// ── Local triangle frame ──────────────────────────────────────────────────
// x̂ along node1→node2; ẑ the element normal (node1→2 × node1→3); ŷ = ẑ × x̂.
// Local 2D corner coordinates: n1 at origin, n2 on the +x̂ axis.
export interface TriFrame {
  A: number                       // area (m²)
  x: [number, number, number]     // local x of the 3 corners (m)
  y: [number, number, number]     // local y of the 3 corners (m)
  R: [V3, V3, V3]                 // rows = x̂, ŷ, ẑ (global→local)
}

export function triFrame(p1: V3, p2: V3, p3: V3): TriFrame {
  const v1 = sub(p2, p1), v2 = sub(p3, p1)
  const n = cross(v1, v2)
  const A = len(n) / 2
  const xh = norm(v1)
  const zh = norm(n)
  const yh = cross(zh, xh)
  return {
    A,
    x: [0, len(v1), dot(v2, xh)],
    y: [0, 0, dot(v2, yh)],
    R: [xh, yh, zh],
  }
}

// ── Plane-stress / plate constitutive matrices (per the chosen E, ν, t) ─────
function planeStress(Escale: number, nu: number): number[][] {
  const c = Escale / (1 - nu * nu)
  return [[c, c * nu, 0], [c * nu, c, 0], [0, 0, c * (1 - nu) / 2]]
}

// ── CST membrane (3×2 = 6 DOF: u1,v1,u2,v2,u3,v3) ──────────────────────────
export function cstMembrane(f: TriFrame, E: number, nu: number, t: number): number[][] {
  const Es = E * 1e3, tm = t / 1000, A = f.A
  const [x1, x2, x3] = f.x, [y1, y2, y3] = f.y
  const b = [y2 - y3, y3 - y1, y1 - y2]
  const c = [x3 - x2, x1 - x3, x2 - x1]
  const inv = 1 / (2 * A)
  const B = [
    [b[0] * inv, 0, b[1] * inv, 0, b[2] * inv, 0],
    [0, c[0] * inv, 0, c[1] * inv, 0, c[2] * inv],
    [c[0] * inv, b[0] * inv, c[1] * inv, b[1] * inv, c[2] * inv, b[2] * inv],
  ]
  const D = planeStress(Es, nu)
  const DB = mul(D, B)
  const K = mul(transpose(B), DB)
  return K.map((row) => row.map((v) => v * tm * A))
}

// ── DKT plate bending (3×3 = 9 DOF: w,θx,θy per node) ──────────────────────
// θx = ∂w/∂y, θy = −∂w/∂x (Kirchhoff). Batoz/Bathe/Ho (1980) shape-function
// derivative arrays HX,HY (w.r.t. area coords ξ,η) → curvature matrix B (3×9).
export function dktBending(f: TriFrame, E: number, nu: number, t: number): number[][] {
  const Es = E * 1e3, tm = t / 1000
  const [x1, x2, x3] = f.x, [y1, y2, y3] = f.y
  const x21 = x2 - x1, x31 = x3 - x1, y21 = y2 - y1, y31 = y3 - y1
  const det2A = x21 * y31 - x31 * y21   // = 2A (oriented +)

  // side differences k = 4(23), 5(31), 6(12)
  const sd = (xi: number, xj: number, yi: number, yj: number) => {
    const dx = xi - xj, dy = yi - yj, l2 = dx * dx + dy * dy
    return { P: -6 * dx / l2, t: -6 * dy / l2, q: 3 * dx * dy / l2, r: 3 * dy * dy / l2 }
  }
  const s4 = sd(x2, x3, y2, y3), s5 = sd(x3, x1, y3, y1), s6 = sd(x1, x2, y1, y2)
  const P4 = s4.P, P5 = s5.P, P6 = s6.P
  const t4 = s4.t, t5 = s5.t, t6 = s6.t
  const q4 = s4.q, q5 = s5.q, q6 = s6.q
  const r4 = s4.r, r5 = s5.r, r6 = s6.r

  const HXxi = (xi: number, eta: number): number[] => [
    P6 * (1 - 2 * xi) + (P5 - P6) * eta,
    q6 * (1 - 2 * xi) - (q5 + q6) * eta,
    -4 + 6 * (xi + eta) + r6 * (1 - 2 * xi) - eta * (r5 + r6),
    -P6 * (1 - 2 * xi) + eta * (P4 + P6),
    q6 * (1 - 2 * xi) + eta * (q4 - q6),
    -2 + 6 * xi + r6 * (1 - 2 * xi) + eta * (r4 - r6),
    -eta * (P4 + P5),
    eta * (q4 - q5),
    -eta * (r5 - r4),
  ]
  const HYxi = (xi: number, eta: number): number[] => [
    t6 * (1 - 2 * xi) + (t5 - t6) * eta,
    1 + r6 * (1 - 2 * xi) - (r5 + r6) * eta,
    -q6 * (1 - 2 * xi) + eta * (q5 + q6),
    -t6 * (1 - 2 * xi) + eta * (t4 + t6),
    -1 + r6 * (1 - 2 * xi) + eta * (r4 - r6),
    -q6 * (1 - 2 * xi) - eta * (q4 - q6),
    -eta * (t4 + t5),
    eta * (r4 - r5),
    -eta * (q4 - q5),
  ]
  const HXeta = (xi: number, eta: number): number[] => [
    -P5 * (1 - 2 * eta) - (P6 - P5) * xi,
    q5 * (1 - 2 * eta) - (q5 + q6) * xi,
    -4 + 6 * (xi + eta) + r5 * (1 - 2 * eta) - xi * (r5 + r6),
    xi * (P4 + P6),
    xi * (q4 - q6),
    -xi * (r6 - r4),
    P5 * (1 - 2 * eta) - xi * (P4 + P5),
    q5 * (1 - 2 * eta) + xi * (q4 - q5),
    -2 + 6 * eta + r5 * (1 - 2 * eta) + xi * (r4 - r5),
  ]
  const HYeta = (xi: number, eta: number): number[] => [
    -t5 * (1 - 2 * eta) - (t6 - t5) * xi,
    1 + r5 * (1 - 2 * eta) - (r5 + r6) * xi,
    -q5 * (1 - 2 * eta) + xi * (q5 + q6),
    xi * (t4 + t6),
    xi * (r4 - r6),
    -xi * (q4 - q6),
    t5 * (1 - 2 * eta) - xi * (t4 + t5),
    -1 + r5 * (1 - 2 * eta) + xi * (r4 - r5),
    -q5 * (1 - 2 * eta) - xi * (q4 - q5),
  ]

  const D = planeStress(Es, nu).map((row) => row.map((v) => v * (tm * tm * tm / 12)))  // = Db (×t³/12 vs membrane ×t)
  const inv = 1 / det2A
  const Bof = (xi: number, eta: number): number[][] => {
    const hxx = HXxi(xi, eta), hxe = HXeta(xi, eta), hyx = HYxi(xi, eta), hye = HYeta(xi, eta)
    const row1 = hxx.map((_, i) => inv * (y31 * hxx[i] - y21 * hxe[i]))
    const row2 = hxx.map((_, i) => inv * (-x31 * hyx[i] + x21 * hye[i]))
    const row3 = hxx.map((_, i) => inv * (-x31 * hxx[i] + x21 * hxe[i] + y31 * hyx[i] - y21 * hye[i]))
    return [row1, row2, row3]
  }

  // 3-point mid-edge integration (exact for the linear DKT curvature), weight A/3
  const gps: [number, number][] = [[0.5, 0], [0, 0.5], [0.5, 0.5]]
  const A = det2A / 2
  let K = zeros(9, 9)
  for (const [xi, eta] of gps) {
    const B = Bof(xi, eta)
    const DB = mul(D, B)
    const k = mul(transpose(B), DB)
    K = K.map((row, i) => row.map((v, j) => v + (A / 3) * k[i][j]))
  }
  return K
}

// ── Flat shell triangle: 18×18 element stiffness in GLOBAL coordinates ──────
export interface TriShell {
  Ke: number[][]   // 18×18 global stiffness, DOF order [u,v,w,θx,θy,θz]×3 nodes
  A: number
  f: TriFrame
}

/** Assemble membrane + bending + drilling into the local 18-DOF stiffness,
 *  then rotate to global. `drill` scales the (penalty) drilling stiffness on θz. */
export function triShell(p1: V3, p2: V3, p3: V3, E: number, nu: number, t: number, drill = 1e-3): TriShell {
  const f = triFrame(p1, p2, p3)
  const Km = cstMembrane(f, E, nu, t)   // 6  (u,v)×3
  const Kb = dktBending(f, E, nu, t)    // 9  (w,θx,θy)×3

  const KL = zeros(18, 18)
  // membrane → local DOFs (u@6a+0, v@6a+1); Km order u1,v1,u2,v2,u3,v3
  const mMap = [0, 1, 6, 7, 12, 13]
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) KL[mMap[i]][mMap[j]] += Km[i][j]
  // bending → local DOFs (w@6a+2, θx@6a+3, θy@6a+4); Kb order w1,θx1,θy1,...
  const bMap = [2, 3, 4, 8, 9, 10, 14, 15, 16]
  for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) KL[bMap[i]][bMap[j]] += Kb[i][j]
  // drilling penalty on θz (5,11,17) — small absolute stiffness removes the
  // local zero-energy mode without polluting results (standard flat-shell fix).
  let kmax = 0
  for (let i = 0; i < 18; i++) kmax = Math.max(kmax, Math.abs(KL[i][i]))
  const kd = drill * kmax
  for (const d of [5, 11, 17]) KL[d][d] += kd

  // global→local block-diagonal transform T (6 blocks of R)
  const R = f.R
  const T = zeros(18, 18)
  for (let blk = 0; blk < 6; blk++)
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) T[3 * blk + r][3 * blk + c] = R[r][c]
  const Ke = mul(mul(transpose(T), KL), T)   // Ke_glob = Tᵀ KL T
  return { Ke, A: f.A, f }
}

// ── Standalone shell solver (validation / small models) ────────────────────
export interface ShellNode { id: string; x: number; y: number; z: number }
export interface ShellElem { id: string; nodes: [string, string, string]; E: number; nu: number; t: number }
export interface ShellSupport {
  node: string
  ux?: boolean; uy?: boolean; uz?: boolean; rx?: boolean; ry?: boolean; rz?: boolean
}
export interface ShellNodeLoad { node: string; Fx?: number; Fy?: number; Fz?: number; Mx?: number; My?: number; Mz?: number }
/** Uniform pressure q (kN/m²) on an element along its +normal (ẑ). Lumped 1/3 to each node. */
export interface ShellPressure { elem: string; q: number }

export interface ShellResult {
  d: number[]                                  // full DOF vector (6·nNodes)
  disp: Map<string, V3>                        // nodal translation (m)
  rot: Map<string, V3>                         // nodal rotation (rad)
}

export function solveShell(
  nodes: ShellNode[], elems: ShellElem[], supports: ShellSupport[],
  loads: ShellNodeLoad[] = [], pressures: ShellPressure[] = [],
): ShellResult | null {
  const idx = new Map(nodes.map((n, i) => [n.id, i]))
  const ndof = 6 * nodes.length
  const K = zeros(ndof, ndof)
  const F = new Array(ndof).fill(0)

  const pById = new Map(pressures.map((p) => [p.elem, p.q]))
  for (const e of elems) {
    const n = e.nodes.map((id) => nodes[idx.get(id)!])
    const p1: V3 = [n[0].x, n[0].y, n[0].z], p2: V3 = [n[1].x, n[1].y, n[1].z], p3: V3 = [n[2].x, n[2].y, n[2].z]
    const { Ke, A, f } = triShell(p1, p2, p3, e.E, e.nu, e.t)
    const map: number[] = []
    for (const id of e.nodes) { const b = 6 * idx.get(id)!; for (let k = 0; k < 6; k++) map.push(b + k) }
    for (let i = 0; i < 18; i++) for (let j = 0; j < 18; j++) K[map[i]][map[j]] += Ke[i][j]
    // pressure → lumped nodal force along global normal ẑ
    const q = pById.get(e.id)
    if (q) {
      const fn = (q * A) / 3
      const zg = f.R[2]
      for (const id of e.nodes) {
        const b = 6 * idx.get(id)!
        F[b + 0] += fn * zg[0]; F[b + 1] += fn * zg[1]; F[b + 2] += fn * zg[2]
      }
    }
  }
  for (const ld of loads) {
    const b = 6 * idx.get(ld.node)!
    F[b + 0] += ld.Fx ?? 0; F[b + 1] += ld.Fy ?? 0; F[b + 2] += ld.Fz ?? 0
    F[b + 3] += ld.Mx ?? 0; F[b + 4] += ld.My ?? 0; F[b + 5] += ld.Mz ?? 0
  }

  // partition free/constrained
  const fixed = new Set<number>()
  for (const s of supports) {
    const b = 6 * idx.get(s.node)!
    const fl = [s.ux, s.uy, s.uz, s.rx, s.ry, s.rz]
    fl.forEach((v, k) => { if (v) fixed.add(b + k) })
  }
  const free: number[] = []
  for (let d = 0; d < ndof; d++) if (!fixed.has(d)) free.push(d)

  const nf = free.length
  const Kff = zeros(nf, nf)
  for (let a = 0; a < nf; a++) for (let b = 0; b < nf; b++) Kff[a][b] = K[free[a]][free[b]]
  const Ff = free.map((d) => F[d])
  const fac = luFactor(Kff)
  if (!fac) return null
  const df = luSolve(fac, Ff)

  const d = new Array(ndof).fill(0)
  free.forEach((dof, k) => { d[dof] = df[k] })

  const disp = new Map<string, V3>(), rot = new Map<string, V3>()
  nodes.forEach((n, i) => {
    disp.set(n.id, [d[6 * i], d[6 * i + 1], d[6 * i + 2]])
    rot.set(n.id, [d[6 * i + 3], d[6 * i + 4], d[6 * i + 5]])
  })
  return { d, disp, rot }
}

// ── Test/utility mesher: rectangular plate in the X-Y plane (normal +z) ─────
// nx×ny cells, each split into two triangles. Returns nodes (id = "r{c}") and
// elements. Useful for benchmarks; real model meshing comes in a later phase.
export function rectPlateMesh(
  Lx: number, Ly: number, nx: number, ny: number, E: number, nu: number, t: number,
): { nodes: ShellNode[]; elems: ShellElem[]; id: (i: number, j: number) => string } {
  const id = (i: number, j: number) => `${i}_${j}`
  const nodes: ShellNode[] = []
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++)
    nodes.push({ id: id(i, j), x: (Lx * i) / nx, y: (Ly * j) / ny, z: 0 })
  const elems: ShellElem[] = []
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = id(i, j), b = id(i + 1, j), c = id(i + 1, j + 1), dd = id(i, j + 1)
    elems.push({ id: `${i}_${j}_0`, nodes: [a, b, c], E, nu, t })
    elems.push({ id: `${i}_${j}_1`, nodes: [a, c, dd], E, nu, t })
  }
  return { nodes, elems, id }
}
