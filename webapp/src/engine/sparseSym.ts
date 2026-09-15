// ─────────────────────────────────────────────────────────────────────────
// THE FREE BLOCK, STORED AS THE FEW ENTRIES THAT ARE ACTUALLY THERE.
//
// `precomputeFrame` built the free stiffness block as a DENSE nf×nf array,
// kept it on the precomp and structured-cloned it into every pool worker. That
// is 8·nf² bytes PER COPY — 128 MB at 4 000 free DOF, 512 MB at 8 000 — and it
// is what `MESH_DOF_BUDGET` exists to stop a browser tab dying on. The matrix
// itself is nothing like that full: a DOF couples only to the DOFs of the
// elements it belongs to, so a frame has on the order of 100 nonzeros per row
// however large it gets, and the dense array is >99% zeros at the sizes that
// hurt.
//
// WHY A MAP PER ROW rather than CSR. The assembly is scatter-add — every
// element throws a 12×12 or 18×18 block at arbitrary (i,j) pairs — and CSR
// needs its pattern known before any value is written. A row of Maps takes the
// adds in any order, and the two things the factor needs afterwards are exactly
// what a Map gives: O(1) `get(i,j)` and a ready list of the nonzero columns.
//
// BOTH TRIANGLES ARE STORED. Half would halve the memory, but `skylineFactor`
// reads A[p[i]][p[j]] under a permutation, so either triangle can be asked for
// and every read would need a compare-and-swap. At ~100 nonzeros per row the
// saving is not worth making every access conditional.
//
// Units: whatever the caller assembles (kN/m for the frame's free block).
// ─────────────────────────────────────────────────────────────────────────

/**
 * Symmetric sparse matrix, row-major, both triangles stored.
 *
 * Mutable by design: it is an assembly buffer first and a read-only operand
 * afterwards, and copying it to freeze it would defeat the point.
 */
export interface SparseSym {
  n: number
  /** `rows[i]` maps column j → A(i,j). Absent key = structural zero. */
  rows: Map<number, number>[]
}

export function sparseSym(n: number): SparseSym {
  return { n, rows: Array.from({ length: n }, () => new Map<number, number>()) }
}

/** Scatter-add, the one operation assembly needs. Exact zeros are not stored:
 *  an element that contributes nothing must not create a nonzero, or the
 *  skyline profile grows for no reason. */
export function sparseAdd(A: SparseSym, i: number, j: number, v: number): void {
  if (v === 0) return
  const row = A.rows[i]
  const cur = row.get(j)
  if (cur === undefined) row.set(j, v)
  else {
    const sum = cur + v
    // Cancellation to exactly zero is left in place: dropping it would make the
    // pattern depend on the order the elements happened to be assembled in.
    row.set(j, sum)
  }
}

export function sparseGet(A: SparseSym, i: number, j: number): number {
  return A.rows[i].get(j) ?? 0
}

export function sparseSet(A: SparseSym, i: number, j: number, v: number): void {
  A.rows[i].set(j, v)
}

/** Columns with a stored entry in row i, EXCLUDING the diagonal — the
 *  adjacency the reordering walks. */
export function sparseNeighbors(A: SparseSym, i: number): number[] {
  const out: number[] = []
  for (const [j, v] of A.rows[i]) if (j !== i && v !== 0) out.push(j)
  return out
}

export function sparseNnz(A: SparseSym): number {
  let k = 0
  for (const r of A.rows) k += r.size
  return k
}

export function sparseClone(A: SparseSym): SparseSym {
  return { n: A.n, rows: A.rows.map((r) => new Map(r)) }
}

/** y = A·x. */
export function sparseMatVec(A: SparseSym, x: number[]): number[] {
  const y = new Array<number>(A.n).fill(0)
  for (let i = 0; i < A.n; i++) {
    let s = 0
    for (const [j, v] of A.rows[i]) s += v * x[j]
    y[i] = s
  }
  return y
}

/** Materialise the dense form. Only for callers that genuinely need a dense
 *  matrix — it costs the nf² this module exists to avoid. */
export function sparseToDense(A: SparseSym): number[][] {
  const D = Array.from({ length: A.n }, () => new Array<number>(A.n).fill(0))
  for (let i = 0; i < A.n; i++) for (const [j, v] of A.rows[i]) D[i][j] = v
  return D
}

export function denseToSparse(D: number[][]): SparseSym {
  const A = sparseSym(D.length)
  for (let i = 0; i < D.length; i++) {
    const row = D[i]
    for (let j = 0; j < row.length; j++) if (row[j] !== 0) A.rows[i].set(j, row[j])
  }
  return A
}

/** Is A symmetric to within a relative tolerance? The frame assembles
 *  symmetric element blocks, so this is a check on the caller, not a
 *  conversion — the skyline factor's correctness rests on it. */
export function sparseIsSymmetric(A: SparseSym, tol = 1e-9): boolean {
  for (let i = 0; i < A.n; i++) {
    for (const [j, a] of A.rows[i]) {
      if (j <= i) continue
      const b = A.rows[j].get(i) ?? 0
      if (Math.abs(a - b) > tol * (1 + Math.abs(a) + Math.abs(b))) return false
    }
    // an entry present only in the lower triangle is just as much an asymmetry
    for (const [j] of A.rows[i]) {
      if (j >= i) continue
      if (!A.rows[j].has(i) && (A.rows[i].get(j) ?? 0) !== 0) return false
    }
  }
  return true
}

/** Structured-clone-friendly form: Maps survive the worker boundary, but the
 *  array-of-Maps is serialised entry by entry, so pack it once into flat
 *  arrays instead. */
export interface SparseSymSerial { n: number; ptr: number[]; col: number[]; val: number[] }

export function serializeSparse(A: SparseSym): SparseSymSerial {
  const ptr: number[] = [0]
  const col: number[] = []
  const val: number[] = []
  for (let i = 0; i < A.n; i++) {
    for (const [j, v] of A.rows[i]) { col.push(j); val.push(v) }
    ptr.push(col.length)
  }
  return { n: A.n, ptr, col, val }
}

export function deserializeSparse(s: SparseSymSerial): SparseSym {
  const A = sparseSym(s.n)
  for (let i = 0; i < s.n; i++) {
    for (let k = s.ptr[i]; k < s.ptr[i + 1]; k++) A.rows[i].set(s.col[k], s.val[k])
  }
  return A
}
