// ─────────────────────────────────────────────────────────────────────────────
// Linearized buckling analysis — Tier 3, item #9 (docs/HANDOFF.md).
//
// Solves the generalised eigenvalue problem  [K]{φ} = λ[Kσ]{φ}, where:
//   K   = first-order elastic stiffness (from precomputeFrame).
//   Kσ  = −Kg = geometric (initial-stress) stiffness; positive entries for
//          compressive members (tension-positive sign convention throughout).
//   λ   = critical load factor: structure buckles at λ × applied loads.
//
// Method: inverse power iteration (Wielandt) with Euclidean Gram-Schmidt
// deflation to find the nModes smallest positive λ values.  For typical
// gravity-loaded building frames (columns dominant, well-separated modes)
// this converges in O(20–50) iterations per mode.
//
// Reference: McGuire, Gallagher & Ziemian "Matrix Structural Analysis" §9.
//
// Units: coordinates m; E MPa; A mm²; I mm⁴; forces kN; λ dimensionless.
// ─────────────────────────────────────────────────────────────────────────────
import type { StructuralModel } from './model'
import { precomputeFrame, kgLocal, solveWithGeometry } from './frame3d'
import type { MemberGeom } from './frame3d'
import { modelToFrame3D } from './modelBridge'
import { luSolve, matVec } from './fem'
import type { LUFactor } from './fem'
import { validateMesh, hasMeshErrors } from './meshValidation'
import { applyF3Combo } from './frame3d'
import type { LoadCategory } from './beamAnalysis'

export interface BucklingMode {
  /** Critical load factor: load × λ = buckling load. */
  lambda: number
  /** Normalised buckling shape: node id → [ux, uy, uz] (max |component| = 1). */
  shape: Record<string, [number, number, number]>
}

export interface BucklingResult {
  modes: BucklingMode[]
  /** Description of the load combination used for the stress state. */
  comboLabel: string
}

// ── local helpers (mirrors frame3d internals) ─────────────────────────────────

const mul = (A: number[][], B: number[][]): number[][] =>
  A.map((row) => B[0].map((_, j) => row.reduce((s, v, k) => s + v * B[k][j], 0)))
const transpose = (A: number[][]): number[][] => A[0].map((_, j) => A.map((row) => row[j]))

// ── geometric stiffness assembly ──────────────────────────────────────────────

/**
 * Assemble the geometric stiffness Kgff restricted to free DOFs.
 * N[i] is the axial force in member i (tension positive).
 */
function assembleKgff(
  geoms: MemberGeom[],
  N: number[],
  freeIdx: Map<number, number>,
  nf: number,
): number[][] {
  const Kgff = Array.from({ length: nf }, () => new Array(nf).fill(0))
  for (let mi = 0; mi < geoms.length; mi++) {
    const g = geoms[mi]
    const Ni = N[mi]
    if (Ni === 0) continue
    const kgg = mul(mul(transpose(g.T), kgLocal(Ni, g.L)), g.T)
    for (let a = 0; a < 12; a++) {
      const ia = freeIdx.get(g.dofs[a])
      if (ia === undefined) continue
      for (let b = 0; b < 12; b++) {
        const ib = freeIdx.get(g.dofs[b])
        if (ib === undefined) continue
        Kgff[ia][ib] += kgg[a][b]
      }
    }
  }
  return Kgff
}

// ── inverse power iteration ───────────────────────────────────────────────────

const _dot = (a: number[], b: number[]): number => a.reduce((s, v, i) => s + v * b[i], 0)
const _norm = (a: number[]): number => Math.sqrt(_dot(a, a))
const _scale = (a: number[], s: number): number[] => a.map((v) => v * s)

/**
 * Find up to nModes smallest positive critical load factors λ of  K x = λ Kσ x
 * by inverse power iteration on K⁻¹Kσ with Gram-Schmidt deflation.
 *
 * Ksff = −Kgff (positive for compressive members).
 */
function inversePowerIter(
  Kff: LUFactor,
  Ksff: number[][],   // −Kgff (positive for compressive loads)
  Kff_raw: number[][],
  nModes: number,
  maxIter = 300,
  tol = 1e-7,
): { lambda: number; phi: number[] }[] {
  const nf = Ksff.length
  if (nf === 0) return []

  const modes: { lambda: number; phi: number[] }[] = []

  // Find a non-zero starting direction for mode m by cycling through unit
  // vectors until one has a non-trivial projection onto Kσ (avoids torsion
  // DOFs which carry no geometric stiffness and give a zero Kσ·x vector).
  function startVec(m: number): number[] | null {
    for (let attempt = 0; attempt < nf; attempt++) {
      let x = new Array(nf).fill(0)
      x[(m + attempt) % nf] = 1.0
      for (const fm of modes) {
        const c = _dot(x, fm.phi)
        x = x.map((v, i) => v - c * fm.phi[i])
      }
      const nx = _norm(x)
      if (nx < 1e-14) continue
      x = _scale(x, 1 / nx)
      const Ksx = matVec(Ksff, x)
      if (_dot(x, Ksx) > 1e-12) return x   // non-trivial compressive projection
    }
    return null
  }

  for (let m = 0; m < nModes; m++) {
    const x0 = startVec(m)
    if (!x0) break   // no compressive DOF left

    let x = x0
    let prevLambda = Infinity

    for (let it = 0; it < maxIter; it++) {
      const Ksx = matVec(Ksff, x)
      const z = luSolve(Kff, Ksx)
      if (!z) break

      // Deflate z against found modes
      for (const fm of modes) {
        const c = _dot(z, fm.phi)
        for (let i = 0; i < nf; i++) z[i] -= c * fm.phi[i]
      }

      const nz = _norm(z)
      if (nz < 1e-14) break
      x = _scale(z, 1 / nz)

      // Rayleigh quotient λ = xᵀKx / xᵀKσx
      const Ksx2 = matVec(Ksff, x)
      const xKsx = _dot(x, Ksx2)
      if (Math.abs(xKsx) < 1e-14) break
      const Kx = matVec(Kff_raw, x)
      const lambda = _dot(x, Kx) / xKsx

      if (lambda <= 0) break  // tension-dominated mode

      if (Math.abs(lambda - prevLambda) / Math.max(Math.abs(prevLambda), 1) < tol && it > 2) {
        modes.push({ lambda, phi: [...x] })
        break
      }
      prevLambda = lambda
    }
  }

  return modes.sort((a, b) => a.lambda - b.lambda)
}

// ── mode shape extraction ─────────────────────────────────────────────────────

function buildShape(
  phi: number[],
  nodes: { id: string; x: number; y: number; z: number }[],
  idx: Map<string, number>,
  freeIdx: Map<number, number>,
): Record<string, [number, number, number]> {
  // Pick max absolute translational value for normalisation
  let maxAbs = 0
  for (const n of nodes) {
    const ni = idx.get(n.id)!
    for (let d = 0; d < 3; d++) {
      const fp = freeIdx.get(6 * ni + d)
      if (fp !== undefined) maxAbs = Math.max(maxAbs, Math.abs(phi[fp]))
    }
  }
  const scale = maxAbs > 1e-14 ? 1 / maxAbs : 1
  const shape: Record<string, [number, number, number]> = {}
  for (const n of nodes) {
    const ni = idx.get(n.id)!
    const u: [number, number, number] = [0, 0, 0]
    for (let d = 0; d < 3; d++) {
      const fp = freeIdx.get(6 * ni + d)
      if (fp !== undefined) u[d] = phi[fp] * scale
    }
    shape[n.id] = u
  }
  return shape
}

// ── low-level API (frame3d inputs) ───────────────────────────────────────────

/**
 * Linearized buckling from raw frame3d inputs.
 * N[i] = representative axial force in member i (tension positive).
 * Returns the raw (lambda, phi) pairs sorted by lambda, or null on failure.
 * Exposed for direct unit tests without a full StructuralModel.
 */
export function bucklingFromFrame(
  nodes: Parameters<typeof precomputeFrame>[0],
  members: Parameters<typeof precomputeFrame>[1],
  supports: Parameters<typeof precomputeFrame>[2],
  N: number[],
  nModes = 3,
): { lambda: number; shape: Record<string, [number, number, number]> }[] | null {
  const precomp = precomputeFrame(nodes, members, supports)
  if (!precomp.Kff || precomp.Kff.n === 0) return null

  const { geoms, freeIdx, free, Kff_raw } = precomp
  const nf = free.length
  const Kgff = assembleKgff(geoms, N, freeIdx, nf)
  const Ksff = Kgff.map((row) => row.map((v) => -v))

  if (!Ksff.some((row) => row.some((v) => v > 1e-9))) return null

  const rawModes = inversePowerIter(precomp.Kff, Ksff, Kff_raw, nModes)
  if (rawModes.length === 0) return null

  return rawModes.map(({ lambda, phi }) => ({
    lambda,
    shape: buildShape(phi, precomp.nodes, precomp.idx, freeIdx),
  }))
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Linearized buckling analysis for a structural model.
 *
 * @param model   Validated StructuralModel (run meshValidation first).
 * @param factors Load combination factors, e.g. `{ D:1.2, L:1.6 }`.
 *                Defaults to service loads { D:1, L:1 }.
 * @param nModes  Number of buckling modes to compute (default 3).
 * @returns Sorted list of (λ, shape) pairs, or null if the structure is
 *          singular or has no compressive members under the given loads.
 */
export function bucklingAnalysis(
  model: StructuralModel,
  factors: Partial<Record<LoadCategory, number>> = { D: 1, L: 1 },
  nModes = 3,
): BucklingResult | null {
  if (hasMeshErrors(validateMesh(model))) return null

  const br = modelToFrame3D(model)
  const precomp = precomputeFrame(br.nodes, br.members, br.supports)
  if (!precomp.Kff || precomp.Kff.n === 0) return null

  const loads = applyF3Combo(br.loads, factors)
  if (loads.length === 0) return null

  // First-order linear analysis for the given load combination.
  const result = solveWithGeometry(precomp, loads)
  if (!result) return null

  // Per-member representative axial force (tension positive).
  // For a prismatic member, N is constant; N[0] is the i-end value.
  const N = result.members.map((mr) => mr.N[0] ?? 0)

  // Build geometric stiffness restricted to free DOFs.
  const { geoms, freeIdx, free, Kff_raw } = precomp
  const nf = free.length
  const Kgff = assembleKgff(geoms, N, freeIdx, nf)

  // Kσ = −Kg (positive for compressive members).
  const Ksff = Kgff.map((row) => row.map((v) => -v))

  // Check that any compressive stiffness exists.
  const hasCompression = Ksff.some((row) => row.some((v) => v > 1e-9))
  if (!hasCompression) return null

  const rawModes = inversePowerIter(precomp.Kff, Ksff, Kff_raw, nModes)
  if (rawModes.length === 0) return null

  // Build combo label string like "1D+1L"
  const comboLabel = Object.entries(factors)
    .filter(([, f]) => f !== 0)
    .map(([cat, f]) => `${f}${cat}`)
    .join('+')

  const modes: BucklingMode[] = rawModes.map(({ lambda, phi }) => ({
    lambda,
    shape: buildShape(phi, precomp.nodes, precomp.idx, freeIdx),
  }))

  return { modes, comboLabel }
}
