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
