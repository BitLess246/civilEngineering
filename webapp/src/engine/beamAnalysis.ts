// ─────────────────────────────────────────────────────────────────────────
// Beam analysis — Euler-Bernoulli FEM (Hermite cubic elements, Gauss-5
// consistent load vectors) with modular supports (pin / roller / fixed /
// spring at any position) and categorised loads (point / UDL / VDL / applied
// moment) run through the NSCP 2015 load combinations. Includes the
// three-moment (Clapeyron) cross-check for continuous pin/roller beams.
// Faithful port of the legacy beamDesign.html analysis module.
// Units: m, kN, kN·m; E in MPa; I in mm⁴; deflection returned in mm.
// ─────────────────────────────────────────────────────────────────────────

export type SupportType = 'pin' | 'roller' | 'fixed' | 'spring'
export interface Support { type: SupportType; x: number; k?: number /* kN/m, spring */ }

export type LoadCategory = 'D' | 'L' | 'Lr' | 'S' | 'R' | 'W' | 'E'
export type BeamLoad =
  | { type: 'point'; x: number; P: number; cat: LoadCategory }
  | { type: 'udl'; x1: number; x2: number; w: number; cat: LoadCategory }
  | { type: 'vdl'; x1: number; x2: number; w1: number; w2: number; cat: LoadCategory }
  | { type: 'moment'; x: number; M: number; cat: LoadCategory }

export interface Reaction { type: SupportType; x: number; Rv: number; Rm: number; k?: number }
export interface FemResult {
  xs: number[]; V: number[]; M: number[]; D: number[]   // D in mm
  reactions: Reaction[]
  Vmax: number; Mmax: number; Dmax: number
}

export interface Combo { name: string; f: Partial<Record<LoadCategory, number>> }
export const NSCP_COMBOS: Combo[] = [
  { name: '1.4D', f: { D: 1.4 } },
  { name: '1.2D + 1.6L + 0.5(Lr|S|R)', f: { D: 1.2, L: 1.6, Lr: 0.5, S: 0.5, R: 0.5 } },
  { name: '1.2D + 1.6(Lr|S|R) + (L|0.5W)', f: { D: 1.2, Lr: 1.6, S: 1.6, R: 1.6, L: 1.0, W: 0.5 } },
  { name: '1.2D + 1.0W + L + 0.5(Lr|S|R)', f: { D: 1.2, W: 1.0, L: 1.0, Lr: 0.5, S: 0.5, R: 0.5 } },
  { name: '0.9D + 1.0W', f: { D: 0.9, W: 1.0 } },
  { name: '1.2D + 1.0E + L + 0.2S', f: { D: 1.2, E: 1.0, L: 1.0, S: 0.2 } },
  { name: '0.9D + 1.0E', f: { D: 0.9, E: 1.0 } },
]

const roundX = (x: number, dec = 8) => Math.round(x * 10 ** dec) / 10 ** dec
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

// ── Linear algebra ────────────────────────────────────────────────────────
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let k = 0; k < n; k++) {
    let piv = k
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[piv][k])) piv = i
    if (piv !== k) [M[k], M[piv]] = [M[piv], M[k]]
    if (Math.abs(M[k][k]) < 1e-14) return null
    for (let i = k + 1; i < n; i++) {
      const f = M[i][k] / M[k][k]
      for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j]
    }
  }
  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n]
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]
    x[i] = s / M[i][i]
  }
  return x
}

// ── Load helpers ──────────────────────────────────────────────────────────
export function loadResultant(ld: BeamLoad): { W: number; xc: number } {
  if (ld.type === 'point') return { W: ld.P, xc: ld.x }
  if (ld.type === 'udl') return { W: ld.w * (ld.x2 - ld.x1), xc: (ld.x1 + ld.x2) / 2 }
  if (ld.type === 'vdl') {
    const t = ld.x2 - ld.x1
    const W = ld.w1 * t + ((ld.w2 - ld.w1) * t) / 2
    if (Math.abs(W) < 1e-12) return { W: 0, xc: ld.x1 }
    const num = (ld.w1 * t * t) / 2 + ((ld.w2 - ld.w1) * t * t) / 3
    return { W, xc: ld.x1 + num / W }
  }
  return { W: 0, xc: 0 }
}

export function scaleLoad(ld: BeamLoad, f: number): BeamLoad {
  if (ld.type === 'point') return { ...ld, P: ld.P * f }
  if (ld.type === 'udl') return { ...ld, w: ld.w * f }
  if (ld.type === 'vdl') return { ...ld, w1: ld.w1 * f, w2: ld.w2 * f }
  return { ...ld, M: ld.M * f }
}

export function applyCombo(loads: BeamLoad[], factors: Partial<Record<LoadCategory, number>>): BeamLoad[] {
  return loads
    .map((ld) => scaleLoad(ld, factors[ld.cat] ?? 0))
    .filter((ld) => {
      if (ld.type === 'point') return Math.abs(ld.P) > 1e-9
      if (ld.type === 'udl') return Math.abs(ld.w) > 1e-9
      if (ld.type === 'vdl') return Math.abs(ld.w1) + Math.abs(ld.w2) > 1e-9
      return Math.abs(ld.M) > 1e-9
    })
}

function loadIntensity(ld: BeamLoad, x: number): number {
  if (ld.type === 'udl') return ld.x1 <= x && x <= ld.x2 ? ld.w : 0
  if (ld.type === 'vdl') {
    if (!(ld.x1 <= x && x <= ld.x2)) return 0
    const span = Math.max(ld.x2 - ld.x1, 1e-9)
    return ld.w1 + ((ld.w2 - ld.w1) * (x - ld.x1)) / span
  }
  return 0
}

function hermite(xi: number, le: number): [number, number, number, number] {
  return [
    1 - 3 * xi * xi + 2 * xi * xi * xi,
    le * xi * (1 - xi) * (1 - xi),
    3 * xi * xi - 2 * xi * xi * xi,
    le * xi * xi * (xi - 1),
  ]
}

function gauss5Vec(f: (x: number) => number[], a: number, b: number): number[] {
  const gp = [-0.90618, -0.53847, 0, 0.53847, 0.90618]
  const gw = [0.23693, 0.47863, 0.56889, 0.47863, 0.23693]
  const mid = (a + b) / 2, half = (b - a) / 2
  const acc = [0, 0, 0, 0]
  for (let i = 0; i < 5; i++) {
    const fi = f(mid + half * gp[i])
    for (let j = 0; j < 4; j++) acc[j] += gw[i] * fi[j]
  }
  return acc.map((v) => half * v)
}

// ── FEM solver ────────────────────────────────────────────────────────────
export function solveFEM(supports: Support[], loads: BeamLoad[], L: number, E_MPa: number, I_mm4: number): FemResult | null {
  const EI = E_MPa * I_mm4 * 1e-9 // kN·m²

  // Node set: ends, supports, load anchors, then N_INT subdivisions per span.
  const nodeSet = new Set<number>([roundX(0), roundX(L)])
  supports.forEach((s) => nodeSet.add(roundX(clamp(s.x, 0, L))))
  loads.forEach((ld) => {
    if (ld.type === 'point' || ld.type === 'moment') nodeSet.add(roundX(clamp(ld.x, 0, L)))
    else { nodeSet.add(roundX(clamp(ld.x1, 0, L))); nodeSet.add(roundX(clamp(ld.x2, 0, L))) }
  })
  const anchor = [...nodeSet].sort((a, b) => a - b)
  const N_INT = 25
  for (let i = 0; i < anchor.length - 1; i++) {
    const xa = anchor[i], xb = anchor[i + 1]
    for (let j = 1; j < N_INT; j++) nodeSet.add(roundX(xa + ((xb - xa) * j) / N_INT))
  }
  const nodes = [...nodeSet].sort((a, b) => a - b)
  const n = nodes.length
  const ndof = 2 * n
  const nm = new Map<number, number>()
  nodes.forEach((x, i) => nm.set(x, i))

  // Assemble K, F.
  const K: number[][] = Array.from({ length: ndof }, () => new Array(ndof).fill(0))
  const F = new Array(ndof).fill(0)
  for (let e = 0; e < n - 1; e++) {
    const x1n = nodes[e], x2n = nodes[e + 1]
    const le = x2n - x1n
    if (le < 1e-10) continue
    const c = EI / (le * le * le)
    const ke = [
      [12 * c, 6 * le * c, -12 * c, 6 * le * c],
      [6 * le * c, 4 * le * le * c, -6 * le * c, 2 * le * le * c],
      [-12 * c, -6 * le * c, 12 * c, -6 * le * c],
      [6 * le * c, 2 * le * le * c, -6 * le * c, 4 * le * le * c],
    ]
    const i1 = nm.get(x1n)!, i2 = nm.get(x2n)!
    const dofs = [2 * i1, 2 * i1 + 1, 2 * i2, 2 * i2 + 1]
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) K[dofs[a]][dofs[b]] += ke[a][b]

    for (const ld of loads) {
      if (ld.type !== 'udl' && ld.type !== 'vdl') continue
      const la = Math.max(x1n, roundX(ld.x1))
      const lb = Math.min(x2n, roundX(ld.x2))
      if (lb <= la) continue
      const fe = gauss5Vec((xg) => {
        const w = loadIntensity(ld, xg)
        return hermite((xg - x1n) / le, le).map((v) => -w * v)
      }, la, lb)
      for (let j = 0; j < 4; j++) F[dofs[j]] += fe[j]
    }
  }
  for (const ld of loads) {
    if (ld.type === 'point') {
      const i = nm.get(roundX(clamp(ld.x, 0, L)))
      if (i !== undefined) F[2 * i] -= ld.P
    } else if (ld.type === 'moment') {
      const i = nm.get(roundX(clamp(ld.x, 0, L)))
      if (i !== undefined) F[2 * i + 1] += ld.M
    }
  }

  // Boundary conditions (springs add stiffness; pins/rollers fix v; fixed also θ).
  const constrained = new Set<number>()
  for (const s of supports) {
    const i = nm.get(roundX(clamp(s.x, 0, L)))
    if (i === undefined) continue
    if (s.type === 'spring') K[2 * i][2 * i] += Math.max(s.k ?? 1000, 1e-3)
    else {
      constrained.add(2 * i)
      if (s.type === 'fixed') constrained.add(2 * i + 1)
    }
  }
  const free: number[] = []
  for (let dof = 0; dof < ndof; dof++) if (!constrained.has(dof)) free.push(dof)

  const d = new Array(ndof).fill(0)
  if (free.length > 0) {
    const Kff = free.map((i) => free.map((j) => K[i][j]))
    const dFree = solveLinear(Kff, free.map((i) => F[i]))
    if (dFree === null) return null
    free.forEach((dof, idx) => (d[dof] = dFree[idx]))
  }

  // Reactions.
  const Kd = new Array(ndof).fill(0)
  for (let i = 0; i < ndof; i++) for (let j = 0; j < ndof; j++) Kd[i] += K[i][j] * d[j]
  const Rfull = Kd.map((v, i) => v - F[i])
  const react: Reaction[] = []
  for (const s of supports) {
    const sx = roundX(clamp(s.x, 0, L))
    const i = nm.get(sx)
    if (i === undefined) continue
    if (s.type === 'spring') react.push({ ...s, x: sx, Rv: Math.max(s.k ?? 1000, 1e-3) * d[2 * i], Rm: 0 })
    else react.push({ ...s, x: sx, Rv: Rfull[2 * i], Rm: s.type === 'fixed' ? -Rfull[2 * i + 1] : 0 })
  }

  // Equilibrium correction — distribute the tiny cubic-FEM residual to the
  // two outermost supports so statics-based V/M close exactly.
  let Wtot = 0, Mw = 0
  for (const ld of loads) {
    if (ld.type === 'moment') Mw -= ld.M
    else { const { W, xc } = loadResultant(ld); Wtot += W; Mw += W * xc }
  }
  const Rvsum = react.reduce((a, r) => a + r.Rv, 0)
  const RMsum = react.reduce((a, r) => a + r.Rv * r.x - r.Rm, 0)
  const resV = Wtot - Rvsum, resM = Mw - RMsum
  if (react.length >= 2) {
    const x0 = react[0].x, xN = react[react.length - 1].x
    const dx = xN - x0
    if (Math.abs(dx) > 1e-6) {
      const dN = (resM - resV * x0) / dx
      react[0].Rv += resV - dN
      react[react.length - 1].Rv += dN
    }
  }

  // Diagram sampling (extra points hugging supports & point loads).
  const xsSet = new Set<number>()
  const Nsample = 500
  for (let i = 0; i <= Nsample; i++) xsSet.add(roundX((i * L) / Nsample))
  const eps = Math.max(L / 120, 0.02)
  for (const s of supports) {
    const sx = roundX(clamp(s.x, 0, L))
    xsSet.add(Math.max(0, sx - eps)); xsSet.add(sx); xsSet.add(Math.min(L, sx + eps))
  }
  for (const ld of loads) {
    if (ld.type === 'point' || ld.type === 'moment') {
      const px = roundX(clamp(ld.x, 0, L))
      xsSet.add(Math.max(0, px - 1e-4)); xsSet.add(px); xsSet.add(Math.min(L, px + 1e-4))
    } else { xsSet.add(roundX(clamp(ld.x1, 0, L))); xsSet.add(roundX(clamp(ld.x2, 0, L))) }
  }
  const xs = [...xsSet].filter((x) => x >= 0 && x <= L).sort((a, b) => a - b)

  // V, M by statics from the (corrected) reactions.
  const V = new Array(xs.length).fill(0)
  const M = new Array(xs.length).fill(0)
  for (let k = 0; k < xs.length; k++) {
    const x = xs[k]
    let v = 0, m = 0
    for (const r of react) {
      if (r.x <= x) v += r.Rv
      if (r.x < x) m += r.Rv * (x - r.x) + r.Rm
      else if (r.x <= x && Math.abs(r.x) < 1e-9) m += r.Rm
    }
    for (const ld of loads) {
      if (ld.type === 'point') {
        if (ld.x <= x) { v -= ld.P; m -= ld.P * (x - ld.x) }
      } else if (ld.type === 'udl') {
        if (ld.x1 < x) {
          const seg = Math.min(x, ld.x2) - ld.x1
          const W = ld.w * seg
          v -= W; m -= W * (x - (ld.x1 + seg / 2))
        }
      } else if (ld.type === 'vdl') {
        if (ld.x1 < x) {
          const span = Math.max(ld.x2 - ld.x1, 1e-9)
          const t = Math.min(x, ld.x2) - ld.x1
          const W = ld.w1 * t + ((ld.w2 - ld.w1) * t * t) / (2 * span)
          const num = (ld.w1 * t * t) / 2 + ((ld.w2 - ld.w1) * t * t * t) / (3 * span)
          const xc = ld.x1 + (W > 1e-9 ? num / W : t / 2)
          v -= W; m -= W * (x - xc)
        }
      } else if (ld.type === 'moment') {
        if (ld.x <= x) m += ld.M
      }
    }
    V[k] = v; M[k] = m
  }

  // Deflection via Hermite interpolation of the FEM solution.
  const interpDelta = (x: number): number => {
    x = clamp(x, 0, L)
    for (let e = 0; e < n - 1; e++) {
      const x1n = nodes[e], x2n = nodes[e + 1]
      if (x1n - 1e-9 <= x && x <= x2n + 1e-9) {
        const le = x2n - x1n
        if (le < 1e-10) return d[2 * nm.get(x1n)!]
        const N = hermite((x - x1n) / le, le)
        const i1 = nm.get(x1n)!, i2 = nm.get(x2n)!
        return N[0] * d[2 * i1] + N[1] * d[2 * i1 + 1] + N[2] * d[2 * i2] + N[3] * d[2 * i2 + 1]
      }
    }
    return 0
  }
  const D = xs.map((x) => interpDelta(x) * 1000)

  return {
    xs, V, M, D, reactions: react,
    Vmax: Math.max(...V.map(Math.abs)),
    Mmax: Math.max(...M.map(Math.abs)),
    Dmax: Math.max(...D.map(Math.abs)),
  }
}

// ── Three-moment theorem (Clapeyron) cross-check ─────────────────────────
function reactionsSS(L: number, loads: BeamLoad[]): { Ra: number; Rb: number } {
  let sumW = 0, sumMx = 0, sumMc = 0
  for (const ld of loads) {
    if (ld.type === 'moment') sumMc += ld.M
    else { const { W, xc } = loadResultant(ld); sumW += W; sumMx += W * xc }
  }
  const Rb = (sumMx - sumMc) / L
  return { Ra: sumW - Rb, Rb }
}

function shearMomentAtSS(x: number, Ra: number, loads: BeamLoad[]): { V: number; M: number } {
  let v = Ra, m = Ra * x
  for (const ld of loads) {
    if (ld.type === 'point') {
      if (ld.x <= x) { v -= ld.P; m -= ld.P * (x - ld.x) }
    } else if (ld.type === 'udl' || ld.type === 'vdl') {
      if (ld.x1 < x) {
        const seg = Math.min(x, ld.x2) - ld.x1
        let W: number, xc: number
        if (ld.type === 'udl') { W = ld.w * seg; xc = ld.x1 + seg / 2 }
        else {
          W = ld.w1 * seg + ((ld.w2 - ld.w1) * seg) / 2
          const num = (ld.w1 * seg * seg) / 2 + ((ld.w2 - ld.w1) * seg * seg) / 3
          xc = ld.x1 + (Math.abs(W) > 1e-12 ? num / W : seg / 2)
        }
        v -= W; m -= W * (x - xc)
      }
    } else if (ld.type === 'moment') { if (ld.x <= x) m += ld.M }
  }
  return { V: v, M: m }
}

function trapz(y: number[], x: number[]): number {
  let s = 0
  for (let i = 1; i < x.length; i++) s += 0.5 * (y[i] + y[i - 1]) * (x[i] - x[i - 1])
  return s
}

export interface ThreeMomentResult { supportMoments: number[]; reactions: number[] }

export function threeMoment(spans: number[], loadsPerSpan: BeamLoad[][]): ThreeMomentResult | null {
  const n = spans.length
  if (n === 1) {
    const { Ra, Rb } = reactionsSS(spans[0], loadsPerSpan[0])
    return { supportMoments: [0, 0], reactions: [Ra, Rb] }
  }
  const sixQm = (L: number, lds: BeamLoad[], fromRight: boolean): number => {
    const { Ra } = reactionsSS(L, lds)
    const N = 200
    const xs: number[] = []
    for (let i = 0; i <= N; i++) xs.push((i * L) / N)
    const Mss = xs.map((x) => shearMomentAtSS(x, Ra, lds).M)
    const integrand = Mss.map((m, i) => m * (fromRight ? L - xs[i] : xs[i]))
    return (6 / L) * trapz(integrand, xs)
  }
  const sixL = spans.map((L, i) => sixQm(L, loadsPerSpan[i], false))
  const sixR = spans.map((L, i) => sixQm(L, loadsPerSpan[i], true))
  const size = n - 1
  const A = Array.from({ length: size }, () => new Array(size).fill(0))
  const b = new Array(size).fill(0)
  for (let k = 0; k < size; k++) {
    A[k][k] = 2 * (spans[k] + spans[k + 1])
    if (k > 0) A[k][k - 1] = spans[k]
    if (k < size - 1) A[k][k + 1] = spans[k + 1]
    b[k] = -(sixL[k] + sixR[k + 1])
  }
  const Mint = solveLinear(A, b)
  if (!Mint) return null
  const supportMoments = [0, ...Mint, 0]
  const reactions = new Array(n + 1).fill(0)
  for (let i = 0; i < n; i++) {
    const L = spans[i]
    const Mi = supportMoments[i], Mj = supportMoments[i + 1]
    const { Ra, Rb } = reactionsSS(L, loadsPerSpan[i])
    reactions[i] += Ra + (Mj - Mi) / L
    reactions[i + 1] += Rb + (Mi - Mj) / L
  }
  return { supportMoments, reactions }
}

// ── Orchestrator: run every NSCP combination, pick the governing one ─────
export interface ComboRun { combo: Combo; result: FemResult | null; factored: BeamLoad[]; skipped: boolean }
export interface TmtCheck { positions: number[]; supportMoments: number[]; reactions: number[] }
export interface BeamAnalysisResult {
  perCombo: ComboRun[]
  govIdx: number
  /** Three-moment cross-check on the governing combo (continuous pin/roller beams only). */
  tmt: TmtCheck | null
}

export function analyzeBeam(supports: Support[], loads: BeamLoad[], L: number, E: number, I: number): BeamAnalysisResult | null {
  const perCombo: ComboRun[] = []
  let govIdx = -1, govM = -1
  for (const combo of NSCP_COMBOS) {
    const factored = applyCombo(loads, combo.f)
    if (factored.length === 0) { perCombo.push({ combo, result: null, factored, skipped: true }); continue }
    const r = solveFEM(supports, factored, L, E, I)
    perCombo.push({ combo, result: r, factored, skipped: false })
    if (r && r.Mmax > govM) { govM = r.Mmax; govIdx = perCombo.length - 1 }
  }
  if (govIdx < 0) return null

  // TMT applies to continuous beams on ≥3 distinct pin/roller supports only.
  let tmt: TmtCheck | null = null
  const simple = supports
    .filter((s) => s.type === 'pin' || s.type === 'roller')
    .map((s) => clamp(s.x, 0, L))
    .sort((a, b) => a - b)
  const distinct: number[] = []
  for (const x of simple) if (!distinct.length || Math.abs(distinct[distinct.length - 1] - x) > 1e-6) distinct.push(x)
  const hasOther = supports.some((s) => s.type === 'fixed' || s.type === 'spring')
  if (distinct.length >= 3 && !hasOther) {
    const gov = perCombo[govIdx]
    const spans: number[] = []
    const loadsPer: BeamLoad[][] = []
    for (let i = 0; i < distinct.length - 1; i++) {
      const xL = distinct[i], xR = distinct[i + 1]
      spans.push(xR - xL)
      const spanLoads: BeamLoad[] = []
      for (const ld of gov.factored) {
        if (ld.type === 'point' || ld.type === 'moment') {
          if (ld.x >= xL - 1e-6 && ld.x <= xR + 1e-6) spanLoads.push({ ...ld, x: ld.x - xL })
        } else {
          const a = Math.max(ld.x1, xL), b = Math.min(ld.x2, xR)
          if (b > a + 1e-9) {
            if (ld.type === 'udl') spanLoads.push({ ...ld, x1: a - xL, x2: b - xL })
            else {
              const span = Math.max(ld.x2 - ld.x1, 1e-9)
              const wAt = (xq: number) => ld.w1 + ((ld.w2 - ld.w1) * (xq - ld.x1)) / span
              spanLoads.push({ ...ld, w1: wAt(a), w2: wAt(b), x1: a - xL, x2: b - xL })
            }
          }
        }
      }
      loadsPer.push(spanLoads)
    }
    const res = threeMoment(spans, loadsPer)
    if (res) tmt = { positions: distinct, supportMoments: res.supportMoments, reactions: res.reactions }
  }

  return { perCombo, govIdx, tmt }
}
