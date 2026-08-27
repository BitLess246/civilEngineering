import { describe, it, expect } from 'vitest'
import {
  solveLinear, luFactor, luSolve, matVec, hermite, gauss5Vec,
  isSymmetric, rcmOrder, skylineFactor, skylineSolve, symFactor, symSolve,
} from './fem'

describe('solveLinear — Gaussian elimination with partial pivoting', () => {
  it('solves a 1×1 system', () => {
    const x = solveLinear([[3]], [9])
    expect(x).not.toBeNull()
    expect(x![0]).toBeCloseTo(3, 10)
  })

  it('solves a 2×2 diagonal system', () => {
    const x = solveLinear([[2, 0], [0, 5]], [6, 15])
    expect(x).not.toBeNull()
    expect(x![0]).toBeCloseTo(3, 10)
    expect(x![1]).toBeCloseTo(3, 10)
  })

  it('solves a 3×3 system', () => {
    // 2x + y = 5; 4x + 3y + 2z = 14; x + y + 3z = 12  →  x=4.25, y=−3.5, z=3.75
    const x = solveLinear(
      [[2, 1, 0], [4, 3, 2], [1, 1, 3]],
      [5, 14, 12],
    )
    expect(x).not.toBeNull()
    expect(x![0]).toBeCloseTo(4.25, 9)
    expect(x![1]).toBeCloseTo(-3.5, 9)
    expect(x![2]).toBeCloseTo(3.75, 9)
  })

  it('returns null for a singular matrix', () => {
    // Rows 0 and 1 are proportional → no unique solution.
    expect(solveLinear([[1, 2], [2, 4]], [3, 6])).toBeNull()
  })

  it('A·x = b round-trip', () => {
    const A = [[4, 1], [2, 3]]
    const b = [9, 8]
    const x = solveLinear(A, b)!
    const Ax = matVec(A, x)
    expect(Ax[0]).toBeCloseTo(b[0], 9)
    expect(Ax[1]).toBeCloseTo(b[1], 9)
  })
})

describe('luFactor / luSolve — LU factorisation with multiple-RHS solves', () => {
  it('returns {n:0} for an empty matrix', () => {
    const f = luFactor([])
    expect(f).not.toBeNull()
    expect(f!.n).toBe(0)
  })

  it('factors and solves a 1×1 system', () => {
    const f = luFactor([[5]])!
    expect(f).not.toBeNull()
    const x = luSolve(f, [10])
    expect(x[0]).toBeCloseTo(2, 10)
  })

  it('factors and solves a 2×2 system', () => {
    const A = [[2, 1], [5, 7]]
    const b = [11, 13]
    const f = luFactor(A)!
    expect(f).not.toBeNull()
    const x = luSolve(f, b)
    // Ax should equal b
    expect(2 * x[0] + x[1]).toBeCloseTo(11, 9)
    expect(5 * x[0] + 7 * x[1]).toBeCloseTo(13, 9)
  })

  it('solves the same 3×3 system as solveLinear', () => {
    const A = [[2, 1, 0], [4, 3, 2], [1, 1, 3]]
    const b = [5, 14, 12]
    const f = luFactor(A)!
    const x = luSolve(f, b)
    expect(x[0]).toBeCloseTo(4.25, 9)
    expect(x[1]).toBeCloseTo(-3.5, 9)
    expect(x[2]).toBeCloseTo(3.75, 9)
  })

  it('returns null for a singular matrix', () => {
    expect(luFactor([[1, 2], [2, 4]])).toBeNull()
  })

  it('reuses one factorisation for two different RHS', () => {
    const A = [[4, 1], [2, 3]]
    const f = luFactor(A)!
    const x1 = luSolve(f, [9, 8])
    const x2 = luSolve(f, [1, 0])
    // first RHS: verify A·x1 = [9, 8]
    expect(4 * x1[0] + x1[1]).toBeCloseTo(9, 9)
    expect(2 * x1[0] + 3 * x1[1]).toBeCloseTo(8, 9)
    // second RHS: verify A·x2 = [1, 0]
    expect(4 * x2[0] + x2[1]).toBeCloseTo(1, 9)
    expect(2 * x2[0] + 3 * x2[1]).toBeCloseTo(0, 9)
  })

  it('matches solveLinear on a 4×4 symmetric positive-definite system', () => {
    const A = [
      [10, 2, 1, 0],
      [2, 8, 3, 1],
      [1, 3, 12, 2],
      [0, 1, 2, 6],
    ]
    const b = [13, 14, 18, 9]
    const ref = solveLinear(A, b)!
    const f = luFactor(A)!
    const x = luSolve(f, b)
    for (let i = 0; i < 4; i++) expect(x[i]).toBeCloseTo(ref[i], 9)
  })
})

describe('matVec — matrix-vector product', () => {
  it('identity matrix returns the same vector', () => {
    const r = matVec([[1, 0, 0], [0, 1, 0], [0, 0, 1]], [3, -1, 7])
    expect(r).toEqual([3, -1, 7])
  })

  it('2×2 product', () => {
    const r = matVec([[2, 1], [1, 3]], [1, 2])
    expect(r[0]).toBeCloseTo(4, 10)
    expect(r[1]).toBeCloseTo(7, 10)
  })
})

describe('hermite — Hermite cubic shape functions', () => {
  const le = 2.0

  it('partition of unity at ξ=0: N1=1, N2=N3=N4=0', () => {
    const [N1, N2, N3, N4] = hermite(0, le)
    expect(N1).toBeCloseTo(1, 12)
    expect(N2).toBeCloseTo(0, 12)
    expect(N3).toBeCloseTo(0, 12)
    expect(N4).toBeCloseTo(0, 12)
  })

  it('partition at ξ=1: N3=1, N1=N2=N4=0', () => {
    const [N1, N2, N3, N4] = hermite(1, le)
    expect(N1).toBeCloseTo(0, 12)
    expect(N2).toBeCloseTo(0, 12)
    expect(N3).toBeCloseTo(1, 12)
    expect(N4).toBeCloseTo(0, 12)
  })

  it('midpoint ξ=0.5: N1=N3=0.5, N2=le/8, N4=−le/8', () => {
    const [N1, N2, N3, N4] = hermite(0.5, le)
    expect(N1).toBeCloseTo(0.5, 12)
    expect(N2).toBeCloseTo(le / 8, 12)
    expect(N3).toBeCloseTo(0.5, 12)
    expect(N4).toBeCloseTo(-le / 8, 12)
  })

  it('N1 + N3 = 1 everywhere (displacement completeness)', () => {
    for (const xi of [0, 0.25, 0.5, 0.75, 1]) {
      const [N1, , N3] = hermite(xi, le)
      expect(N1 + N3).toBeCloseTo(1, 10)
    }
  })
})

describe('gauss5Vec — 5-point Gauss quadrature', () => {
  it('integrates a constant exactly', () => {
    // ∫₀¹ 7 dx = 7
    const r = gauss5Vec(() => [7], 0, 1, 1)
    expect(r[0]).toBeCloseTo(7, 10)
  })

  it('integrates a linear function exactly', () => {
    // ∫₀¹ x dx = 0.5
    const r = gauss5Vec((x) => [x], 0, 1, 1)
    expect(r[0]).toBeCloseTo(0.5, 10)
  })

  it('integrates a cubic polynomial exactly', () => {
    // ∫₀² x³ dx = [x⁴/4]₀² = 4
    const r = gauss5Vec((x) => [x ** 3], 0, 2, 1)
    expect(r[0]).toBeCloseTo(4, 9)
  })

  it('handles a vector-valued integrand', () => {
    // ∫₀¹ [1, x, x²] dx = [1, 0.5, 1/3]
    const r = gauss5Vec((x) => [1, x, x * x], 0, 1, 3)
    expect(r[0]).toBeCloseTo(1, 10)
    expect(r[1]).toBeCloseTo(0.5, 10)
    expect(r[2]).toBeCloseTo(1 / 3, 9)
  })
})

// ── Symmetric skyline factorisation ──────────────────────────────────────

/** A random SPD matrix with a chosen sparsity pattern: B·Bᵀ masked, plus a
 *  dominant diagonal so the masking cannot cost positive-definiteness. */
function spd(n: number, couple: (i: number, j: number) => boolean, seed = 1): number[][] {
  let s = seed
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 }
  const A: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!couple(i, j)) continue
      const v = rnd() - 0.5
      A[i][j] = v; A[j][i] = v
    }
  }
  for (let i = 0; i < n; i++) A[i][i] = n + 1 + rnd()      // diagonally dominant ⇒ SPD
  return A
}

const band = (w: number) => (i: number, j: number) => Math.abs(i - j) <= w

describe('isSymmetric', () => {
  it('accepts a symmetric matrix and rejects a nudged one', () => {
    const A = spd(8, band(2))
    expect(isSymmetric(A)).toBe(true)
    A[3][5] += 1
    expect(isSymmetric(A)).toBe(false)
  })

  it('rejects a non-square matrix rather than reading past a row', () => {
    expect(isSymmetric([[1, 2], [2]])).toBe(false)
  })
})

describe('rcmOrder', () => {
  it('is a permutation of every index', () => {
    const p = rcmOrder(spd(30, band(3)))
    expect([...p].sort((a, b) => a - b)).toEqual(Array.from({ length: 30 }, (_, i) => i))
  })

  it('tightens the profile of a deliberately scrambled band matrix', () => {
    // A banded matrix whose rows have been shuffled has a terrible envelope;
    // RCM is what recovers it. Profile = Σ (j − topmost non-zero of column j).
    const n = 60
    const A0 = spd(n, band(2))
    const shuffle = Array.from({ length: n }, (_, i) => (i * 37) % n)
    const A: number[][] = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) => A0[shuffle[i]][shuffle[j]]))
    const profile = (M: number[][], p: number[]) => {
      let t = 0
      for (let j = 0; j < n; j++) {
        let top = 0
        while (top < j && M[p[top]][p[j]] === 0) top++
        t += j - top
      }
      return t
    }
    const natural = profile(A, Array.from({ length: n }, (_, i) => i))
    const reordered = profile(A, rcmOrder(A))
    expect(reordered).toBeLessThan(natural / 2)
  })

  it('handles a disconnected pattern — every component gets ordered', () => {
    const A = spd(20, (i, j) => Math.floor(i / 10) === Math.floor(j / 10) && band(2)(i, j))
    expect([...rcmOrder(A)].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i))
  })
})

describe('skylineFactor / skylineSolve', () => {
  it('reproduces the dense LU answer to near machine precision', () => {
    for (const [n, w] of [[1, 0], [2, 1], [9, 2], [40, 3], [80, 5]] as const) {
      const A = spd(n, band(w))
      const b = Array.from({ length: n }, (_, i) => Math.sin(i + 1) * 10)
      const dense = luSolve(luFactor(A)!, b)
      const sky = skylineSolve(skylineFactor(A, rcmOrder(A))!, b)
      for (let i = 0; i < n; i++) expect(sky[i]).toBeCloseTo(dense[i], 8)
    }
  })

  it('actually satisfies A·x = b, reordered or not', () => {
    const A = spd(50, band(4))
    const b = Array.from({ length: 50 }, (_, i) => (i % 7) - 3)
    for (const perm of [undefined, rcmOrder(A)]) {
      const x = skylineSolve(skylineFactor(A, perm)!, b)
      const r = matVec(A, x)
      for (let i = 0; i < 50; i++) expect(r[i]).toBeCloseTo(b[i], 8)
    }
  })

  it('stores only the envelope, not the square', () => {
    // The whole point: a banded 200×200 must not cost 200² of storage.
    const n = 200
    const f = skylineFactor(spd(n, band(3)))!
    expect(f.v.length).toBeLessThan(n * n / 10)
    expect(f.diag[n - 1]).toBe(f.v.length - 1)
  })

  it('refuses a matrix that is not positive definite instead of mis-factoring it', () => {
    // Symmetric but indefinite: LDLᵀ without pivoting has no business here.
    expect(skylineFactor([[0, 1], [1, 0]])).toBeNull()
    expect(skylineFactor([[-2, 0], [0, -3]])).toBeNull()
  })

  it('handles the empty system the same way luFactor does', () => {
    const f = skylineFactor([])!
    expect(f.n).toBe(0)
    expect(skylineSolve(f, [])).toEqual([])
  })
})

describe('symFactor / symSolve — cheap when sound, safe when not', () => {
  it('takes the skyline path on a symmetric positive-definite matrix', () => {
    const f = symFactor(spd(30, band(3)))!
    expect(f.kind).toBe('skyline')
  })

  it('falls back to dense LU when the matrix is asymmetric, and still solves it', () => {
    const A = [[4, 1, 0], [3, 5, 1], [0, 2, 6]]
    const f = symFactor(A)!
    expect(f.kind).toBe('lu')
    const b = [7, 8, 9]
    const x = symSolve(f, b)
    const r = matVec(A, x)
    for (let i = 0; i < 3; i++) expect(r[i]).toBeCloseTo(b[i], 8)
  })

  it('falls back to dense LU when symmetric but indefinite, and still solves it', () => {
    const A = [[0, 1, 0], [1, 0, 0], [0, 0, 2]]
    const f = symFactor(A)!
    expect(f.kind).toBe('lu')
    const b = [3, 4, 5]
    const x = symSolve(f, b)
    const r = matVec(A, x)
    for (let i = 0; i < 3; i++) expect(r[i]).toBeCloseTo(b[i], 8)
  })

  it('returns null on a genuinely singular matrix, like luFactor', () => {
    expect(symFactor([[1, 1], [1, 1]])).toBeNull()
    expect(luFactor([[1, 1], [1, 1]])).toBeNull()
  })

  it('survives a JSON round-trip — the factor crosses to a worker', () => {
    const A = spd(25, band(3))
    const b = Array.from({ length: 25 }, (_, i) => i - 12)
    const f = symFactor(A)!
    const back = JSON.parse(JSON.stringify(f)) as typeof f
    const x = symSolve(back, b)
    const r = matVec(A, x)
    for (let i = 0; i < 25; i++) expect(r[i]).toBeCloseTo(b[i], 8)
  })
})
