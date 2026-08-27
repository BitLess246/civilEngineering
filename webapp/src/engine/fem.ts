// ─────────────────────────────────────────────────────────────────────────
// Shared FEM core — Phase 2 of the 3D roadmap. One linear-algebra +
// quadrature toolbox consumed by the beam solver (beamAnalysis), the 2D
// frame solver (frame2d), the Winkler footing, and the future 3D frame.
// ─────────────────────────────────────────────────────────────────────────

/** Dense Gaussian elimination with partial pivoting; null when singular. */
export function solveLinear(A: number[][], b: number[]): number[] | null {
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

// ── LU factorisation for multiple-RHS solves ─────────────────────────────
// Stored compact: L below the diagonal (unit diagonal implied), U on and
// above; rows are permuted by `piv` (partial pivoting for stability).
// Use `luFactor` once per stiffness matrix, then `luSolve` for each RHS —
// O(n³) once, O(n²) per load case.

export interface LUFactor { LU: number[][]; piv: number[]; n: number }

/** LU-factor A with partial pivoting. Returns null if A is (near-)singular. */
export function luFactor(A: number[][]): LUFactor | null {
  const n = A.length
  if (n === 0) return { LU: [], piv: [], n: 0 }
  const LU = A.map((row) => [...row])
  const piv = Array.from({ length: n }, (_, i) => i)
  for (let k = 0; k < n; k++) {
    let pivIdx = k
    for (let i = k + 1; i < n; i++) if (Math.abs(LU[i][k]) > Math.abs(LU[pivIdx][k])) pivIdx = i
    if (pivIdx !== k) { [LU[k], LU[pivIdx]] = [LU[pivIdx], LU[k]]; [piv[k], piv[pivIdx]] = [piv[pivIdx], piv[k]] }
    if (Math.abs(LU[k][k]) < 1e-14) return null
    for (let i = k + 1; i < n; i++) {
      LU[i][k] /= LU[k][k]                                    // L factor
      for (let j = k + 1; j < n; j++) LU[i][j] -= LU[i][k] * LU[k][j]  // update U
    }
  }
  return { LU, piv, n }
}

/** Solve LU·x = b using a pre-factored matrix. O(n²). */
export function luSolve({ LU, piv, n }: LUFactor, b: number[]): number[] {
  const x = piv.map((i) => b[i])                              // apply row permutation
  for (let i = 1; i < n; i++) for (let j = 0; j < i; j++) x[i] -= LU[i][j] * x[j]  // forward (L)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = i + 1; j < n; j++) x[i] -= LU[i][j] * x[j]
    x[i] /= LU[i][i]                                          // back-sub (U)
  }
  return x
}

export function matVec(K: number[][], d: number[]): number[] {
  const n = K.length
  const r = new Array(n).fill(0)
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) r[i] += K[i][j] * d[j]
  return r
}

/** Kᵀ·d without materialising Kᵀ. Same terms in the same order as
 *  `matVec(transpose(K), d)`, so the result is bit-identical — it just does
 *  not allocate a second matrix to get there. */
export function matVecT(K: number[][], d: number[]): number[] {
  const n = K.length, m = K[0].length
  const r = new Array(m).fill(0)
  for (let i = 0; i < m; i++) { let s = 0; for (let j = 0; j < n; j++) s += K[j][i] * d[j]; r[i] = s }
  return r
}

/** Hermite cubic shape functions for a beam element of length le at ξ ∈ [0,1]. */
export function hermite(xi: number, le: number): [number, number, number, number] {
  return [
    1 - 3 * xi * xi + 2 * xi * xi * xi,
    le * xi * (1 - xi) * (1 - xi),
    3 * xi * xi - 2 * xi * xi * xi,
    le * xi * xi * (xi - 1),
  ]
}

/** 5-point Gauss quadrature of a vector-valued integrand over [a, b]. */
export function gauss5Vec(f: (x: number) => number[], a: number, b: number, size = 4): number[] {
  const gp = [-0.906179845938664, -0.5384693101056831, 0, 0.5384693101056831, 0.906179845938664]
  const gw = [0.23692688505618908, 0.47862867049936647, 0.5688888888888889, 0.47862867049936647, 0.23692688505618908]
  const mid = (a + b) / 2, half = (b - a) / 2
  const acc = new Array(size).fill(0)
  for (let i = 0; i < 5; i++) {
    const fi = f(mid + half * gp[i])
    for (let j = 0; j < size; j++) acc[j] += gw[i] * fi[j]
  }
  return acc.map((v) => half * v)
}

// ─────────────────────────────────────────────────────────────────────────
// SYMMETRIC SKYLINE (PROFILE) FACTORISATION
//
// A frame's free-block stiffness is symmetric and, for a properly supported
// structure, positive definite — and it is SPARSE in a very particular way:
// a DOF couples only to the DOFs of the members that touch its node, so the
// non-zeros hug the diagonal. Dense LU ignores that and pays n³/3 regardless.
//
// The skyline scheme stores, for each column, only the run of entries from
// its topmost non-zero down to the diagonal, and factors LDLᵀ within that
// envelope. The cost falls to Σⱼ mⱼ²/2 over the column heights mⱼ. Measured
// on the grid frames this engine actually solves:
//
//     members   nf     dense n³/3   skyline    +RCM      speed-up
//        204   480          37 M     2.8 M     1.6 M        23×
//        395   900         243 M    12.2 M     6.3 M        39×
//        678  1512        1152 M    41.2 M    19.5 M        59×
//
// The envelope depends on the ORDER the DOFs sit in, so the factorisation is
// preceded by reverse Cuthill–McKee, which renumbers to pull the non-zeros
// tighter to the diagonal. That is the 1.7–2.1× second column above.
//
// There is no pivoting: LDLᵀ on an SPD matrix does not need it, and the
// row swaps would destroy the envelope that makes this cheap. The price is
// that a matrix which is NOT positive definite must be refused rather than
// mis-factored — `skylineFactor` returns null on a non-positive pivot and
// `symFactor` falls back to the dense pivoting LU, which is slower but safe.
// ─────────────────────────────────────────────────────────────────────────

export interface SkylineFactor {
  kind: 'skyline'
  n: number
  /** `height[j]` = j − (topmost row stored in column j); 0 = diagonal only. */
  height: number[]
  /** `diag[j]` = index of a(j,j) within `v`. */
  diag: number[]
  /** Upper triangle packed by column: L above the diagonal, D on it. */
  v: number[]
  /** `perm[k]` = which original index now sits at position k. */
  perm: number[]
}

/** A factored symmetric system: the skyline when it took, dense LU when it did not. */
export type SymFactor = SkylineFactor | (LUFactor & { kind: 'lu' })

/** Is A symmetric to within a relative tolerance? Skyline storage assumes it. */
export function isSymmetric(A: number[][], tol = 1e-9): boolean {
  const n = A.length
  for (let i = 0; i < n; i++) {
    if (A[i].length !== n) return false
    for (let j = i + 1; j < n; j++) {
      const a = A[i][j], b = A[j][i]
      if (Math.abs(a - b) > tol * (1 + Math.abs(a) + Math.abs(b))) return false
    }
  }
  return true
}

/**
 * Reverse Cuthill–McKee ordering of A's non-zero pattern.
 *
 * Breadth-first from the lowest-degree node of each component, visiting
 * neighbours in increasing degree, then reversed — the reversal is what turns
 * Cuthill–McKee's bandwidth ordering into a good PROFILE ordering, which is
 * what a skyline actually pays for.
 *
 * `perm[k]` is the original index that should sit at position k.
 */
export function rcmOrder(A: number[][]): number[] {
  const n = A.length
  const adj: number[][] = Array.from({ length: n }, () => [])
  for (let i = 0; i < n; i++) {
    const row = A[i]
    for (let j = 0; j < n; j++) if (i !== j && row[j] !== 0) adj[i].push(j)
  }
  const deg = adj.map((a) => a.length)
  const seen = new Array<boolean>(n).fill(false)
  const order: number[] = []
  while (order.length < n) {
    // a fresh component: start from its least-connected node
    let start = -1
    for (let i = 0; i < n; i++) if (!seen[i] && (start < 0 || deg[i] < deg[start])) start = i
    if (start < 0) break
    seen[start] = true
    const q = [start]
    for (let h = 0; h < q.length; h++) {
      const v = q[h]
      order.push(v)
      const nb = adj[v].filter((w) => !seen[w]).sort((a, b) => deg[a] - deg[b])
      for (const w of nb) { seen[w] = true; q.push(w) }
    }
  }
  return order.reverse()
}

/**
 * LDLᵀ-factor a symmetric matrix in skyline storage, under an optional
 * reordering. Returns null when a pivot is not positive — the caller should
 * fall back to a pivoting solver rather than trust the result.
 */
export function skylineFactor(A: number[][], perm?: number[]): SkylineFactor | null {
  const n = A.length
  const p = perm ?? Array.from({ length: n }, (_, i) => i)
  if (n === 0) return { kind: 'skyline', n: 0, height: [], diag: [], v: [], perm: [] }

  // Column heights of the reordered matrix, and the packed offsets.
  const height = new Array<number>(n).fill(0)
  const diag = new Array<number>(n).fill(0)
  let size = 0
  for (let j = 0; j < n; j++) {
    let top = 0
    while (top < j && A[p[top]][p[j]] === 0) top++
    height[j] = j - top
    size += height[j] + 1
    diag[j] = size - 1
  }

  const v = new Array<number>(size).fill(0)
  for (let j = 0; j < n; j++) {
    const base = diag[j] - j          // v[base + i] is a(i,j)
    for (let i = j - height[j]; i <= j; i++) v[base + i] = A[p[i]][p[j]]
  }

  // Bathe's column-wise LDLᵀ. For each column j the entries above the
  // diagonal first become g(i,j) = a(i,j) − Σ L(k,i)·g(k,j), then are divided
  // by their own pivots to become L(i,j); the diagonal takes what is left.
  for (let j = 0; j < n; j++) {
    const mj = j - height[j]
    const bj = diag[j] - j
    for (let i = mj + 1; i < j; i++) {
      const mi = i - height[i]
      const bi = diag[i] - i
      let s = v[bj + i]
      for (let k = Math.max(mi, mj); k < i; k++) s -= v[bi + k] * v[bj + k]
      v[bj + i] = s
    }
    let d = v[diag[j]]
    const d0 = Math.abs(d)
    for (let k = mj; k < j; k++) {
      const g = v[bj + k]
      const l = g / v[diag[k]]
      d -= l * g
      v[bj + k] = l
    }
    // Not positive definite (or numerically singular): refuse, do not guess.
    if (!(d > 0) || d < 1e-12 * (d0 || 1)) return null
    v[diag[j]] = d
  }
  return { kind: 'skyline', n, height, diag, v, perm: p }
}

/** Solve a skyline-factored system for one right-hand side. O(Σ mⱼ). */
export function skylineSolve(f: SkylineFactor, b: number[]): number[] {
  const { n, height, diag, v, perm } = f
  const y = new Array<number>(n)
  for (let k = 0; k < n; k++) y[k] = b[perm[k]]
  for (let j = 0; j < n; j++) {                       // forward: L·y = Pb
    const bj = diag[j] - j
    let s = y[j]
    for (let k = j - height[j]; k < j; k++) s -= v[bj + k] * y[k]
    y[j] = s
  }
  for (let j = 0; j < n; j++) y[j] /= v[diag[j]]      // diagonal: D
  for (let j = n - 1; j >= 0; j--) {                  // backward: Lᵀ·x = y
    const bj = diag[j] - j
    const xj = y[j]
    for (let k = j - height[j]; k < j; k++) y[k] -= v[bj + k] * xj
  }
  const x = new Array<number>(n)
  for (let k = 0; k < n; k++) x[perm[k]] = y[k]
  return x
}

/**
 * Factor a symmetric system the cheap way when that is sound, the safe way
 * when it is not. Symmetry and positive-definiteness are both CHECKED, never
 * assumed: an asymmetric matrix, or one with a non-positive pivot, goes to the
 * dense pivoting LU and returns the same answer it always did.
 */
export function symFactor(A: number[][]): SymFactor | null {
  if (A.length === 0) return { kind: 'skyline', n: 0, height: [], diag: [], v: [], perm: [] }
  if (isSymmetric(A)) {
    const sky = skylineFactor(A, rcmOrder(A))
    if (sky) return sky
  }
  const lu = luFactor(A)
  return lu ? { ...lu, kind: 'lu' } : null
}

/** Solve a system factored by `symFactor`, whichever way it went. */
export function symSolve(f: SymFactor, b: number[]): number[] {
  return f.kind === 'skyline' ? skylineSolve(f, b) : luSolve(f, b)
}
