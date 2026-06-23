import { describe, it, expect } from 'vitest'
import { solveLinear, luFactor, luSolve, matVec, hermite, gauss5Vec } from './fem'

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
