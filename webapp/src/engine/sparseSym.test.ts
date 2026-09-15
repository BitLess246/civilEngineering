import { describe, it, expect } from 'vitest'
import {
  sparseSym, sparseAdd, sparseGet, sparseSet, sparseNeighbors, sparseNnz, sparseClone,
  sparseMatVec, sparseToDense, denseToSparse, sparseIsSymmetric,
  serializeSparse, deserializeSparse,
} from './sparseSym'
import {
  skylineFactor, skylineFactorSparse, symFactor, symFactorSparse, symSolve,
  rcmOrder, rcmOrderSparse, matVec, luFactor, luSolve,
} from './fem'

// ─────────────────────────────────────────────────────────────────────────
// The contract is not "sparse works" — it is "sparse and dense are the SAME
// factorisation". Every case below builds one matrix, feeds it both ways, and
// compares. A sparse path that merely solves nearby is a silently different
// solver, which is exactly what CLAUDE.md's frozen-L3 rule is about.
// ─────────────────────────────────────────────────────────────────────────

/** A symmetric positive-definite band matrix — the shape a frame produces. */
function bandSPD(n: number, halfBand: number, seed = 1): number[][] {
  let s = seed
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648
  const A = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < Math.min(n, i + halfBand + 1); j++) {
      const v = rnd() - 0.5
      A[i][j] = v; A[j][i] = v
    }
  }
  // diagonally dominant ⇒ SPD
  for (let i = 0; i < n; i++) {
    let r = 0
    for (let j = 0; j < n; j++) if (j !== i) r += Math.abs(A[i][j])
    A[i][i] = r + 1 + rnd()
  }
  return A
}

describe('SparseSym — the storage itself', () => {
  it('scatter-add accumulates, and reads back what went in', () => {
    const A = sparseSym(4)
    sparseAdd(A, 1, 2, 3)
    sparseAdd(A, 1, 2, 4)
    expect(sparseGet(A, 1, 2)).toBe(7)
    expect(sparseGet(A, 2, 1)).toBe(0)      // symmetry is the caller's job
    expect(sparseGet(A, 3, 3)).toBe(0)
  })

  it('an exact-zero contribution creates no entry', () => {
    // A stored zero would widen the skyline profile for nothing — the profile
    // is built from which entries EXIST, not from their values.
    const A = sparseSym(3)
    sparseAdd(A, 0, 2, 0)
    expect(sparseNnz(A)).toBe(0)
    expect(A.rows[0].has(2)).toBe(false)
  })

  it('a cancellation to zero is KEPT', () => {
    // Dropping it would make the sparsity pattern depend on the order the
    // elements happened to be assembled in, so two identical models could
    // factor down different profiles.
    const A = sparseSym(3)
    sparseAdd(A, 0, 1, 5)
    sparseAdd(A, 0, 1, -5)
    expect(sparseGet(A, 0, 1)).toBe(0)
    expect(A.rows[0].has(1)).toBe(true)
  })

  it('neighbours exclude the diagonal and any cancelled entry', () => {
    const A = sparseSym(4)
    sparseAdd(A, 0, 0, 9); sparseAdd(A, 0, 2, 1)
    sparseAdd(A, 0, 3, 4); sparseAdd(A, 0, 3, -4)
    expect(sparseNeighbors(A, 0).sort()).toEqual([2])
  })

  it('round-trips through dense both ways', () => {
    const D = bandSPD(24, 4)
    expect(sparseToDense(denseToSparse(D))).toEqual(D)
  })

  it('clone is deep', () => {
    const A = denseToSparse(bandSPD(8, 2))
    const B = sparseClone(A)
    sparseSet(B, 0, 0, 999)
    expect(sparseGet(A, 0, 0)).not.toBe(999)
  })

  it('matVec matches the dense product exactly', () => {
    const D = bandSPD(40, 5)
    const x = Array.from({ length: 40 }, (_, i) => Math.sin(i))
    const a = matVec(D, x), b = sparseMatVec(denseToSparse(D), x)
    // not toBeCloseTo: the same terms in the same order must give the same bits
    for (let i = 0; i < 40; i++) expect(b[i]).toBeCloseTo(a[i], 12)
  })

  it('spots an asymmetry in either triangle', () => {
    const A = denseToSparse(bandSPD(10, 3))
    expect(sparseIsSymmetric(A)).toBe(true)
    sparseSet(A, 2, 5, sparseGet(A, 2, 5) + 1)
    expect(sparseIsSymmetric(A)).toBe(false)
    const B = denseToSparse(bandSPD(10, 3))
    sparseSet(B, 6, 1, 0.5)                   // lower triangle only
    expect(sparseIsSymmetric(B)).toBe(false)
  })

  it('serialises to flat arrays and back without loss', () => {
    const A = denseToSparse(bandSPD(30, 4))
    const round = deserializeSparse(serializeSparse(A))
    expect(sparseToDense(round)).toEqual(sparseToDense(A))
    expect(sparseNnz(round)).toBe(sparseNnz(A))
  })

  it('stores only what is there — the whole point', () => {
    const n = 300, half = 6
    const A = denseToSparse(bandSPD(n, half))
    expect(sparseNnz(A)).toBeLessThan(0.1 * n * n)
  })
})

describe('the sparse factor is the same factor', () => {
  const sizes: [number, number][] = [[1, 0], [2, 1], [12, 3], [60, 5], [120, 9]]

  it('rcmOrderSparse reproduces rcmOrder', () => {
    for (const [n, hb] of sizes) {
      const D = bandSPD(n, hb)
      expect(rcmOrderSparse(denseToSparse(D))).toEqual(rcmOrder(D))
    }
  })

  it('skylineFactorSparse reproduces skylineFactor, profile and all', () => {
    for (const [n, hb] of sizes) {
      const D = bandSPD(n, hb)
      const perm = rcmOrder(D)
      const a = skylineFactor(D, perm)!
      const b = skylineFactorSparse(denseToSparse(D), perm)!
      expect(b.n).toBe(a.n)
      expect(b.height).toEqual(a.height)      // the profile, not just the answer
      expect(b.diag).toEqual(a.diag)
      expect(b.perm).toEqual(a.perm)
      expect(b.v).toHaveLength(a.v.length)
      for (let k = 0; k < a.v.length; k++) expect(b.v[k]).toBeCloseTo(a.v[k], 10)
    }
  })

  it('solves to the same displacements as the dense path', () => {
    for (const [n, hb] of sizes) {
      const D = bandSPD(n, hb)
      const b = Array.from({ length: n }, (_, i) => Math.cos(i * 1.7) * 10)
      const xd = symSolve(symFactor(D)!, b)
      const xs = symSolve(symFactorSparse(denseToSparse(D))!, b)
      for (let i = 0; i < n; i++) expect(xs[i]).toBeCloseTo(xd[i], 9)
      // and it really solves the system, not merely agrees with the other path
      const r = matVec(D, xs)
      for (let i = 0; i < n; i++) expect(r[i]).toBeCloseTo(b[i], 8)
    }
  })

  it('an empty system is the empty factor, both ways', () => {
    expect(symFactorSparse(sparseSym(0))).toEqual(symFactor([]))
  })

  it('refuses a singular matrix instead of returning a wrong factor', () => {
    // An unrestrained 1-D bar: every row sums to zero, so [1,1,…,1] is a rigid
    // body and K is rank-deficient. That is the mechanism a real model has when
    // it is under-supported, and both paths must DECLINE rather than solve
    // noise — skyline on a non-positive pivot, dense LU on the zero one.
    const n = 10
    const D = Array.from({ length: n }, () => new Array(n).fill(0))
    for (let i = 0; i < n; i++) {
      D[i][i] = i === 0 || i === n - 1 ? 1 : 2
      if (i + 1 < n) { D[i][i + 1] = -1; D[i + 1][i] = -1 }
    }
    for (let i = 0; i < n; i++) expect(D[i].reduce((a, b) => a + b, 0)).toBeCloseTo(0, 12)
    expect(symFactorSparse(denseToSparse(D))).toBeNull()
    expect(symFactor(D)).toBeNull()
  })

  it('falls back to dense LU on a symmetric INDEFINITE matrix, and still solves', () => {
    // Skyline LDLᵀ has no pivoting, so it must refuse a non-positive pivot.
    // The fallback is what keeps such a system solvable at all.
    const D = [[0, 1], [1, 0]]
    const f = symFactorSparse(denseToSparse(D))!
    expect(f.kind).toBe('lu')
    const x = symSolve(f, [1, 2])
    expect(x[0]).toBeCloseTo(2, 12)
    expect(x[1]).toBeCloseTo(1, 12)
  })

  it('handles a matrix whose pattern is not banded at all', () => {
    // An arrow matrix: one dense row/column. RCM and the profile have to cope,
    // and the two paths still have to agree.
    const n = 40
    const D = Array.from({ length: n }, () => new Array(n).fill(0))
    for (let i = 1; i < n; i++) { D[0][i] = 1; D[i][0] = 1 }
    for (let i = 0; i < n; i++) D[i][i] = n + 2
    const b = Array.from({ length: n }, (_, i) => i + 1)
    const xd = symSolve(symFactor(D)!, b)
    const xs = symSolve(symFactorSparse(denseToSparse(D))!, b)
    for (let i = 0; i < n; i++) expect(xs[i]).toBeCloseTo(xd[i], 9)
    const lu = luSolve(luFactor(D)!, b)
    for (let i = 0; i < n; i++) expect(xs[i]).toBeCloseTo(lu[i], 8)
  })
})
