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
  const gp = [-0.90618, -0.53847, 0, 0.53847, 0.90618]
  const gw = [0.23693, 0.47863, 0.56889, 0.47863, 0.23693]
  const mid = (a + b) / 2, half = (b - a) / 2
  const acc = new Array(size).fill(0)
  for (let i = 0; i < 5; i++) {
    const fi = f(mid + half * gp[i])
    for (let j = 0; j < size; j++) acc[j] += gw[i] * fi[j]
  }
  return acc.map((v) => half * v)
}
