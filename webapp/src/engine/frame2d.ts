// ─────────────────────────────────────────────────────────────────────────
// 2D frame analysis — Phase 2 of the 3D roadmap. 6-DOF (3/node) frame
// element: the beam solver's Hermite bending stiffness ⊕ the axial bar term,
// rotated into global coordinates. Supports pin / roller / fixed nodes;
// loads are nodal (Fx, Fy, Mz) or member gravity loads (global −Y UDL and
// point loads, converted to consistent local fixed-end vectors). Loads carry
// NSCP categories and the analysis runs every NSCP 2015 combination, like
// the beam module.
// Units: coordinates m; E MPa; A mm²; I mm⁴; forces kN, kN·m.
// Sign conventions on diagrams: N > 0 tension; V & M follow the beam pages.
// ─────────────────────────────────────────────────────────────────────────
import { solveLinear, matVec } from './fem'
import { NSCP_COMBOS, type Combo, type LoadCategory } from './beamAnalysis'

export interface FNode { id: string; x: number; y: number }
export interface FMember {
  id: string; i: string; j: string
  E: number   // MPa
  A: number   // mm²
  I: number   // mm⁴
}
export type FSupportType = 'pin' | 'roller' | 'fixed'
export interface FSupport { node: string; type: FSupportType }

export type FLoad =
  | { kind: 'node'; node: string; Fx: number; Fy: number; Mz: number; cat: LoadCategory }
  | { kind: 'member-udl'; member: string; w: number; cat: LoadCategory }      // kN/m, global −Y (gravity +)
  | { kind: 'member-point'; member: string; a: number; P: number; cat: LoadCategory } // kN at a (m) from node i, global −Y

export interface MemberResult {
  id: string
  L: number
  /** Local end forces ON the member [Fxi, Fyi, Mi, Fxj, Fyj, Mj], kN / kN·m. */
  f: number[]
  xs: number[]; N: number[]; V: number[]; M: number[]
  Nmax: number; Vmax: number; Mmax: number
}
export interface FrameReaction { node: string; type: FSupportType; Rx: number; Ry: number; Rm: number }
export interface FrameResult {
  d: number[]                       // global DOF displacements (m, rad)
  reactions: FrameReaction[]
  members: MemberResult[]
  Mmax: number; Vmax: number; Nmax: number
}

function scaleFLoad(ld: FLoad, f: number): FLoad {
  if (ld.kind === 'node') return { ...ld, Fx: ld.Fx * f, Fy: ld.Fy * f, Mz: ld.Mz * f }
  if (ld.kind === 'member-udl') return { ...ld, w: ld.w * f }
  return { ...ld, P: ld.P * f }
}

export function applyFrameCombo(loads: FLoad[], factors: Partial<Record<LoadCategory, number>>): FLoad[] {
  return loads
    .map((ld) => scaleFLoad(ld, factors[ld.cat] ?? 0))
    .filter((ld) => {
      if (ld.kind === 'node') return Math.abs(ld.Fx) + Math.abs(ld.Fy) + Math.abs(ld.Mz) > 1e-9
      if (ld.kind === 'member-udl') return Math.abs(ld.w) > 1e-9
      return Math.abs(ld.P) > 1e-9
    })
}

/** Local 6×6 stiffness for EA (kN), EI (kN·m²), length L (m). */
function kLocal(EA: number, EI: number, L: number): number[][] {
  const a = EA / L
  const b = (12 * EI) / L ** 3, c = (6 * EI) / L ** 2, e = (4 * EI) / L, g = (2 * EI) / L
  return [
    [a, 0, 0, -a, 0, 0],
    [0, b, c, 0, -b, c],
    [0, c, e, 0, -c, g],
    [-a, 0, 0, a, 0, 0],
    [0, -b, -c, 0, b, -c],
    [0, c, g, 0, -c, e],
  ]
}

/** Transformation: local = T · global for the 6 member DOFs. */
function tMatrix(cx: number, cy: number): number[][] {
  return [
    [cx, cy, 0, 0, 0, 0],
    [-cy, cx, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 0],
    [0, 0, 0, cx, cy, 0],
    [0, 0, 0, -cy, cx, 0],
    [0, 0, 0, 0, 0, 1],
  ]
}

const mul = (A: number[][], B: number[][]): number[][] =>
  A.map((row) => B[0].map((_, j) => row.reduce((s, v, k) => s + v * B[k][j], 0)))
const transpose = (A: number[][]): number[][] => A[0].map((_, j) => A.map((row) => row[j]))

interface Prep {
  L: number; cx: number; cy: number
  kl: number[][]; T: number[][]; kg: number[][]
  dofs: number[]
  /** local consistent load vector from member loads (forces ON nodes) */
  feq: number[]
  /** local load intensities for diagram sampling */
  q: number      // transverse local UDL (+y′)
  p: number      // axial local UDL (+x′)
  pts: { a: number; Pt: number; Pa: number }[]   // local point loads at a
}

function prepMember(m: FMember, nodes: Map<string, FNode>, idx: Map<string, number>, loads: FLoad[]): Prep {
  const ni = nodes.get(m.i)!, nj = nodes.get(m.j)!
  const dx = nj.x - ni.x, dy = nj.y - ni.y
  const L = Math.hypot(dx, dy)
  const cx = dx / L, cy = dy / L
  const EA = (m.E * m.A) / 1000          // kN
  const EI = m.E * m.I * 1e-9            // kN·m²
  const kl = kLocal(EA, EI, L)
  const T = tMatrix(cx, cy)
  const kg = mul(mul(transpose(T), kl), T)
  const ii = idx.get(m.i)!, jj = idx.get(m.j)!
  const dofs = [3 * ii, 3 * ii + 1, 3 * ii + 2, 3 * jj, 3 * jj + 1, 3 * jj + 2]

  // Member loads → local intensities/points. Gravity (global −Y) decomposes
  // into local transverse q = −w·cx and axial p = −w·cy (per metre of member).
  let q = 0, p = 0
  const pts: { a: number; Pt: number; Pa: number }[] = []
  const feq = new Array(6).fill(0)
  for (const ld of loads) {
    if (ld.kind === 'member-udl' && ld.member === m.id) {
      const qi = -ld.w * cx, pi = -ld.w * cy
      q += qi; p += pi
      // consistent: axial pL/2 each end; transverse qL/2, ±qL²/12
      feq[0] += (pi * L) / 2; feq[3] += (pi * L) / 2
      feq[1] += (qi * L) / 2; feq[4] += (qi * L) / 2
      feq[2] += (qi * L * L) / 12; feq[5] -= (qi * L * L) / 12
    } else if (ld.kind === 'member-point' && ld.member === m.id) {
      const a = Math.max(0, Math.min(L, ld.a))
      const Pt = -ld.P * cx, Pa = -ld.P * cy
      pts.push({ a, Pt, Pa })
      const xi = a / L
      // Hermite consistent transverse + linear axial
      const N = [1 - 3 * xi ** 2 + 2 * xi ** 3, L * xi * (1 - xi) ** 2, 3 * xi ** 2 - 2 * xi ** 3, L * xi * xi * (xi - 1)]
      feq[0] += Pa * (1 - xi); feq[3] += Pa * xi
      feq[1] += Pt * N[0]; feq[2] += Pt * N[1]
      feq[4] += Pt * N[2]; feq[5] += Pt * N[3]
    }
  }
  return { L, cx, cy, kl, T, kg, dofs, feq, q, p, pts }
}

export function solveFrame2D(
  nodes: FNode[], members: FMember[], supports: FSupport[], loads: FLoad[],
): FrameResult | null {
  const nm = new Map(nodes.map((n) => [n.id, n]))
  const idx = new Map(nodes.map((n, i) => [n.id, i]))
  const ndof = 3 * nodes.length

  const preps = members.map((m) => prepMember(m, nm, idx, loads))

  const K: number[][] = Array.from({ length: ndof }, () => new Array(ndof).fill(0))
  const F = new Array(ndof).fill(0)
  preps.forEach((pr) => {
    const fg = matVec(transpose(pr.T), pr.feq)
    for (let a = 0; a < 6; a++) {
      F[pr.dofs[a]] += fg[a]
      for (let b = 0; b < 6; b++) K[pr.dofs[a]][pr.dofs[b]] += pr.kg[a][b]
    }
  })
  for (const ld of loads) {
    if (ld.kind !== 'node') continue
    const i = idx.get(ld.node)
    if (i === undefined) continue
    F[3 * i] += ld.Fx; F[3 * i + 1] += ld.Fy; F[3 * i + 2] += ld.Mz
  }

  const constrained = new Set<number>()
  for (const s of supports) {
    const i = idx.get(s.node)
    if (i === undefined) continue
    if (s.type === 'roller') constrained.add(3 * i + 1)
    else {
      constrained.add(3 * i); constrained.add(3 * i + 1)
      if (s.type === 'fixed') constrained.add(3 * i + 2)
    }
  }
  const free: number[] = []
  for (let d = 0; d < ndof; d++) if (!constrained.has(d)) free.push(d)
  const d = new Array(ndof).fill(0)
  if (free.length > 0) {
    const Kff = free.map((i) => free.map((j) => K[i][j]))
    const dF = solveLinear(Kff, free.map((i) => F[i]))
    if (dF === null) return null
    free.forEach((dof, k) => (d[dof] = dF[k]))
  }

  // Reactions = K·d − F at the supported nodes.
  const R = matVec(K, d).map((v, i) => v - F[i])
  const reactions: FrameReaction[] = supports
    .filter((s) => idx.has(s.node))
    .map((s) => {
      const i = idx.get(s.node)!
      return {
        node: s.node, type: s.type,
        Rx: s.type === 'roller' ? 0 : R[3 * i],
        Ry: R[3 * i + 1],
        Rm: s.type === 'fixed' ? R[3 * i + 2] : 0,
      }
    })

  // Member end forces + sampled diagrams.
  const results: MemberResult[] = members.map((m, mi) => {
    const pr = preps[mi]
    const de = pr.dofs.map((dof) => d[dof])
    const dl = matVec(pr.T, de)
    const f = matVec(pr.kl, dl).map((v, k) => v - pr.feq[k])

    const xsSet = new Set<number>()
    const NS = 40
    for (let k = 0; k <= NS; k++) xsSet.add((pr.L * k) / NS)
    pr.pts.forEach((pt) => { xsSet.add(Math.max(0, pt.a - 1e-6)); xsSet.add(pt.a); xsSet.add(Math.min(pr.L, pt.a + 1e-6)) })
    const xs = [...xsSet].sort((a, b) => a - b)

    // Segment statics from end i: f = forces ON the member at its ends (local).
    const N: number[] = [], V: number[] = [], M: number[] = []
    for (const x of xs) {
      let n = -(f[0] + pr.p * x)
      let v = f[1] + pr.q * x
      let mm = -f[2] + f[1] * x + (pr.q * x * x) / 2
      for (const pt of pr.pts) {
        if (pt.a <= x) {
          n -= pt.Pa
          v += pt.Pt
          mm += pt.Pt * (x - pt.a)
        }
      }
      N.push(n); V.push(v); M.push(mm)
    }
    return {
      id: m.id, L: pr.L, f, xs, N, V, M,
      Nmax: Math.max(...N.map(Math.abs)),
      Vmax: Math.max(...V.map(Math.abs)),
      Mmax: Math.max(...M.map(Math.abs)),
    }
  })

  return {
    d, reactions, members: results,
    Mmax: Math.max(...results.map((r) => r.Mmax), 0),
    Vmax: Math.max(...results.map((r) => r.Vmax), 0),
    Nmax: Math.max(...results.map((r) => r.Nmax), 0),
  }
}

// ── NSCP combination orchestration (mirrors analyzeBeam) ─────────────────
export interface FrameComboRun { combo: Combo; result: FrameResult | null; factored: FLoad[]; skipped: boolean }
export interface FrameAnalysis { perCombo: FrameComboRun[]; govIdx: number }

export function analyzeFrame2D(
  nodes: FNode[], members: FMember[], supports: FSupport[], loads: FLoad[],
): FrameAnalysis | null {
  const perCombo: FrameComboRun[] = []
  let govIdx = -1, govM = -1
  for (const combo of NSCP_COMBOS) {
    const factored = applyFrameCombo(loads, combo.f)
    if (factored.length === 0) { perCombo.push({ combo, result: null, factored, skipped: true }); continue }
    const r = solveFrame2D(nodes, members, supports, factored)
    perCombo.push({ combo, result: r, factored, skipped: false })
    if (r && r.Mmax > govM) { govM = r.Mmax; govIdx = perCombo.length - 1 }
  }
  return govIdx < 0 ? null : { perCombo, govIdx }
}
