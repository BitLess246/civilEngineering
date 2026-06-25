// ─────────────────────────────────────────────────────────────────────────
// Modal (free-vibration) analysis — CLAUDE.md §6, phase 1 (engine).
//
// Solves the generalised eigenproblem [K]{φ} = ω²[M]{φ} for the lowest modes
// and reports natural periods, circular frequencies and the effective modal
// mass participation per global direction.
//
// Layering (per the guide): the mass matrix is built by its own function; the
// eigen-solver is a pure routine that knows nothing about how K or M were
// assembled; participation is pure post-processing on (period, shape) tuples.
//
// Mass model: LUMPED translational mass. Each member's self-mass and each
// slab's self-mass + superimposed dead load are lumped to nodes; only the
// three translational DOFs carry mass (rotational inertia neglected, the usual
// lumped-mass simplification). Because that leaves the rotational DOFs
// mass-less, we avoid the singular-M generalised eigenproblem by working with
// the flexibility form: the eigenvalues of M^½ F_mm M^½ are 1/ω², where F_mm
// is the flexibility (= K⁻¹) restricted to the massive DOFs. This reduces the
// problem to the number of massive translational DOFs and is unconditionally
// well-posed once K is non-singular (guaranteed by mesh validation).
//
// Units: K in kN/m, mass in tonnes (Mg) → ω in rad/s, T in seconds.
//   mass[t] = weight[kN] / g.   member/slab weights use GAMMA_C/GAMMA_S kN/m³.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel } from './model'
import { precomputeFrame } from './frame3d'
import { modelToFrame3D } from './modelBridge'
import { luSolve } from './fem'
import { GAMMA_C, GAMMA_S } from './modelBuilder'
import { shapeByName } from './aiscSections'
import { sdlItemKPa } from './deadLoads'
import { validateMesh, hasMeshErrors } from './meshValidation'

export const GRAVITY = 9.81  // m/s²

export interface Mode {
  /** Natural period, seconds. */
  period: number
  /** Circular frequency, rad/s. */
  omega: number
  /** Cyclic frequency, Hz. */
  freq: number
  /** Effective modal mass in each global direction [X, Y, Z], tonnes. */
  effMass: [number, number, number]
  /** Effective modal mass as a fraction of the total mass, per direction. */
  effMassRatio: [number, number, number]
  /** Node-displacement mode shape: node id → [ux, uy, uz].
   *  Normalized so max|component| = 1. Only massive free translational DOFs
   *  have non-zero entries. JSON-safe (plain object). */
  shape: Record<string, [number, number, number]>
}

export interface ModalResult {
  modes: Mode[]
  /** Total lumped mass per global direction, tonnes. */
  totalMass: [number, number, number]
  /** Cumulative effective-mass ratio across the returned modes, per direction. */
  cumRatio: [number, number, number]
}

// ── mass assembly ──────────────────────────────────────────────────────────

const triArea = (a: number[], b: number[], c: number[]): number => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  const cx = u[1] * v[2] - u[2] * v[1]
  const cy = u[2] * v[0] - u[0] * v[2]
  const cz = u[0] * v[1] - u[1] * v[0]
  return 0.5 * Math.hypot(cx, cy, cz)
}

/**
 * Lumped seismic mass per node (tonnes), from member self-weight and slab
 * self-weight + superimposed dead load. Each contribution is split equally to
 * the element's nodes. Live load and applied point/area live are excluded
 * (phase-1 dead-load mass source).
 */
export function buildSeismicMass(model: StructuralModel): Map<string, number> {
  const mass = new Map<string, number>()
  const pos = new Map(model.nodes.map((n) => [n.id, [n.x, n.y, n.z]]))
  const add = (id: string, m: number) => mass.set(id, (mass.get(id) ?? 0) + m)
  const secById = new Map(model.sections.map((s) => [s.id, s]))

  // members: self-weight → mass, half to each end node
  for (const mem of model.members) {
    const a = pos.get(mem.i), b = pos.get(mem.j)
    if (!a || !b) continue
    const L = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])  // m
    const sec = secById.get(mem.section)
    if (!sec || L === 0) continue
    let wPerL: number  // kN/m
    if (sec.material === 'steel') {
      const shape = sec.shape ? shapeByName(sec.shape) : undefined
      wPerL = (shape ? shape.A / 1e6 : (sec.b / 1000) * (sec.h / 1000)) * GAMMA_S
    } else {
      wPerL = (sec.b / 1000) * (sec.h / 1000) * GAMMA_C
    }
    const halfMass = (wPerL * L) / GRAVITY / 2   // tonnes per end
    add(mem.i, halfMass)
    add(mem.j, halfMass)
  }

  // slabs: self-weight (γc·t) + superimposed dead, split to the 4 corners
  for (const p of model.plates) {
    if (p.role !== 'slab') continue
    const c = p.corners.map((id) => pos.get(id)).filter(Boolean) as number[][]
    if (c.length !== 4) continue
    const area = triArea(c[0], c[1], c[2]) + triArea(c[0], c[2], c[3])  // m²
    const selfKPa = (p.thickness / 1000) * GAMMA_C                       // kN/m²
    const sdlKPa = (p.sdlItems ?? []).reduce((s, it) => s + sdlItemKPa(it), 0)
    const weight = (selfKPa + sdlKPa) * area                            // kN
    const quarter = weight / GRAVITY / 4
    for (const id of p.corners) add(id, quarter)
  }

  return mass
}

// ── symmetric eigen-solver (cyclic Jacobi) ──────────────────────────────────

/**
 * Eigen-decomposition of a symmetric n×n matrix by cyclic Jacobi rotations.
 * Returns eigenvalues and eigenvectors (vectors[k] is the k-th column / mode).
 */
export function jacobiEigen(Ain: number[][], maxSweeps = 100): { values: number[]; vectors: number[][] } {
  const n = Ain.length
  const A = Ain.map((r) => [...r])
  const V: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)))
  if (n === 0) return { values: [], vectors: [] }

  const offNorm = () => {
    let s = 0
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) s += A[i][j] * A[i][j]
    return Math.sqrt(s)
  }

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    if (offNorm() < 1e-14) break
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue
        const app = A[p][p], aqq = A[q][q], apq = A[p][q]
        const phi = 0.5 * Math.atan2(2 * apq, aqq - app)
        const c = Math.cos(phi), s = Math.sin(phi)
        for (let k = 0; k < n; k++) {
          const akp = A[k][p], akq = A[k][q]
          A[k][p] = c * akp - s * akq
          A[k][q] = s * akp + c * akq
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k], aqk = A[q][k]
          A[p][k] = c * apk - s * aqk
          A[q][k] = s * apk + c * aqk
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p], vkq = V[k][q]
          V[k][p] = c * vkp - s * vkq
          V[k][q] = s * vkp + c * vkq
        }
      }
    }
  }

  const values = A.map((_, i) => A[i][i])
  const vectors = Array.from({ length: n }, (_, k) => V.map((row) => row[k]))  // columns
  return { values, vectors }
}

// ── orchestration ───────────────────────────────────────────────────────────

interface MassDof { fpos: number; dir: 0 | 1 | 2; mass: number; nodeId: string }

/**
 * Modal analysis of a structural model. Returns the lowest `nModes` modes with
 * natural periods and effective mass participation, or null if the stiffness
 * matrix is singular (run mesh validation first) or there is no mass.
 */
export function modalAnalysis(model: StructuralModel, nModes = 12): ModalResult | null {
  // A mesh with errors (e.g. no supports → rigid-body modes) makes K singular
  // in ways luFactor's pivot tolerance may not catch; gate on validation.
  if (hasMeshErrors(validateMesh(model))) return null
  const br = modelToFrame3D(model, { useShells: false })
  const precomp = precomputeFrame(br.nodes, br.members, br.supports)
  if (!precomp.Kff || precomp.Kff.n === 0) return null

  const massByNode = buildSeismicMass(model)

  // collect the massive, free translational DOFs
  const massDofs: MassDof[] = []
  const totalMass: [number, number, number] = [0, 0, 0]
  for (const [nodeId, m] of massByNode) {
    if (m <= 0) continue
    const ni = precomp.idx.get(nodeId)
    if (ni === undefined) continue
    for (let dir = 0 as 0 | 1 | 2; dir < 3; dir = (dir + 1) as 0 | 1 | 2) {
      const gdof = 6 * ni + dir
      const fpos = precomp.freeIdx.get(gdof)
      if (fpos === undefined) continue  // restrained DOF → mass cannot vibrate
      totalMass[dir] += m              // participation is measured against free mass
      massDofs.push({ fpos, dir, mass: m, nodeId })
    }
  }
  const p = massDofs.length
  if (p === 0) return null

  // flexibility restricted to the massive DOFs: F_mm[a][b] = (K⁻¹ e_b)[a]
  const Fmm: number[][] = Array.from({ length: p }, () => new Array(p).fill(0))
  const e = new Array(precomp.Kff.n).fill(0)
  for (let b = 0; b < p; b++) {
    e.fill(0)
    e[massDofs[b].fpos] = 1
    const x = luSolve(precomp.Kff, e)
    for (let a = 0; a < p; a++) Fmm[a][b] = x[massDofs[a].fpos]
  }

  // symmetrise: Ã = M^½ F_mm M^½ (SPD); eigenvalues are 1/ω²
  const sm = massDofs.map((d) => Math.sqrt(d.mass))
  const A: number[][] = Array.from({ length: p }, (_, a) =>
    Array.from({ length: p }, (_, b) => 0.5 * (Fmm[a][b] + Fmm[b][a]) * sm[a] * sm[b]))
  const { values, vectors } = jacobiEigen(A)

  // lowest modes = largest eigenvalues (μ = 1/ω²)
  const order = values.map((_, i) => i).filter((i) => values[i] > 1e-300)
    .sort((i, j) => values[j] - values[i])
    .slice(0, Math.min(nModes, p))

  const modes: Mode[] = order.map((i) => {
    const mu = values[i]
    const omega = 1 / Math.sqrt(mu)
    const psi = vectors[i]
    // mode shape on massive DOFs: φ = M^-½ ψ
    const phi = psi.map((v, a) => v / sm[a])
    // generalised modal mass M* = φᵀ M φ ; participation Lr = φᵀ M ιr
    let Mstar = 0
    const L: [number, number, number] = [0, 0, 0]
    for (let a = 0; a < p; a++) {
      const mp = massDofs[a].mass * phi[a]
      Mstar += mp * phi[a]
      L[massDofs[a].dir] += mp
    }
    const effMass: [number, number, number] = [L[0] * L[0] / Mstar, L[1] * L[1] / Mstar, L[2] * L[2] / Mstar]
    const effMassRatio: [number, number, number] = [0, 1, 2].map((r) =>
      totalMass[r] > 0 ? effMass[r] / totalMass[r] : 0) as [number, number, number]

    // build per-node shape (node id → [ux, uy, uz]) from massive DOFs only
    const rawShape: Record<string, [number, number, number]> = {}
    for (let a = 0; a < p; a++) {
      const { nodeId, dir } = massDofs[a]
      if (!rawShape[nodeId]) rawShape[nodeId] = [0, 0, 0]
      rawShape[nodeId][dir] = phi[a]
    }
    // normalize to max|component| = 1
    let maxPhi = 0
    for (const v of Object.values(rawShape)) maxPhi = Math.max(maxPhi, Math.abs(v[0]), Math.abs(v[1]), Math.abs(v[2]))
    const shape: Record<string, [number, number, number]> = {}
    for (const [id, v] of Object.entries(rawShape)) {
      shape[id] = maxPhi > 0 ? [v[0] / maxPhi, v[1] / maxPhi, v[2] / maxPhi] : v
    }

    return { period: 2 * Math.PI / omega, omega, freq: omega / (2 * Math.PI), effMass, effMassRatio, shape }
  })

  const cum: [number, number, number] = [0, 1, 2].map((r) =>
    modes.reduce((s, m) => s + m.effMassRatio[r], 0)) as [number, number, number]

  return { modes, totalMass, cumRatio: cum }
}
