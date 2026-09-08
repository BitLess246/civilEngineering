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
// TWO MASS MODELS, and the choice is reported on the result.
//
// `lumped` (default, and what every result before this was built on): each
// member's self-mass and each slab's self-mass + superimposed dead load are
// lumped to nodes, and only the three TRANSLATIONAL DOFs carry mass. The
// rotational DOFs carry none at all — which is the usual simplification, and
// also a statement the periods inherit.
//
// `consistent`: each frame member contributes its own 12×12 consistent mass
// matrix, ∫ρ NᵀN dx over the SAME cubic shape functions the stiffness matrix
// was integrated from and through the SAME element transform — so rotational
// inertia and the mass coupling between a member's two ends are both present.
// Slab and superimposed dead mass has no element to belong to and stays
// lumped translational at the corners, which is what a tributary idealisation
// means. Consistent mass is an UPPER bound on the frequencies and lumped mass
// a lower one, and the gap between them is the honest measure of how much the
// mass idealisation is worth on a given model.
//
// ONE SOLVER FOR BOTH. The generalised problem K φ = ω² M φ is turned into a
// standard symmetric one through the Cholesky factor M = L Lᵀ: the eigenvalues
// of Ã = Lᵀ K⁻¹ L are 1/ω², and φ = L⁻ᵀ ψ. Working in the FLEXIBILITY form
// (K⁻¹, not K) puts the lowest modes at the LARGEST eigenvalues, where Jacobi
// resolves them best. The lumped path is the diagonal special case — L is then
// the elementwise √m and the algebra reduces term for term to M^½ F M^½, which
// is what the previous implementation computed; `modal.test.ts` pins the two
// to 1e-12 so the refactor cannot have moved a published period.
//
// COST. Both models solve K once per column of L and then run Jacobi on a
// dense p×p, so the work is O(p³). Lumped puts p at the number of massive
// TRANSLATIONAL DOFs; consistent puts it at every free DOF, roughly double.
// That is the price of the rotational inertia, and it is why lumped stays the
// default rather than the better model winning by decree.
//
// Units: K in kN/m, mass in tonnes (Mg) → ω in rad/s, T in seconds.
//   mass[t] = weight[kN] / g.   member/slab weights use GAMMA_C/GAMMA_S kN/m³.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel } from './model'
import { precomputeFrame } from './frame3d'
import { modelToFrame3D } from './modelBridge'
import { symSolve } from './fem'
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

/**
 * Which mass matrix the periods were solved on. Reported rather than assumed,
 * because it is a modelling choice a reader has to be able to see: two runs of
 * the same frame under the two models give different periods, and every
 * dynamic result downstream inherits whichever was used.
 */
export type MassModel = 'lumped' | 'consistent'

export interface ModalOptions {
  /** Default 'lumped' — what every result before this option existed used. */
  massModel?: MassModel
}

export interface ModalResult {
  modes: Mode[]
  /** Total mass per global direction, tonnes — measured on the mass matrix
   *  actually used (ι_rᵀ M ι_r), so participation sums against the same M the
   *  modes came from. */
  totalMass: [number, number, number]
  /** Cumulative effective-mass ratio across the returned modes, per direction. */
  cumRatio: [number, number, number]
  /** The mass model these modes were solved on. */
  massModel: MassModel
  /** Free DOFs carrying inertia — the dimension of the eigenproblem. Lumped
   *  counts massive translational DOFs; consistent counts every free DOF. */
  activeDofs: number
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
 * A member's own mass per unit length, tonnes/m — the single expression both
 * mass models are built from.
 *
 * Extracted so the lumped and the consistent model cannot disagree about how
 * heavy a member is. A difference there would show up as a frequency shift and
 * be read as a property of the mass MODEL, which is exactly the conclusion the
 * comparison exists to support and exactly the one it must not fake.
 */
export function memberMassPerLength(sec: { b: number; h: number; material?: string; shape?: string }): number {
  const areaM2 = sec.material === 'steel'
    ? ((sec.shape ? shapeByName(sec.shape) : undefined)?.A ?? sec.b * sec.h) / 1e6
    : (sec.b / 1000) * (sec.h / 1000)
  const gamma = sec.material === 'steel' ? GAMMA_S : GAMMA_C
  return (areaM2 * gamma) / GRAVITY
}

/** Member self-mass lumped half to each end node, tonnes. Split out from
 *  `buildSeismicMass` because the consistent model takes this mass from the
 *  element matrices instead — adding it here as well would double it. */
export function memberNodalMass(model: StructuralModel): Map<string, number> {
  const mass = new Map<string, number>()
  const pos = new Map(model.nodes.map((n) => [n.id, [n.x, n.y, n.z]]))
  const secById = new Map(model.sections.map((s) => [s.id, s]))
  const add = (id: string, m: number) => mass.set(id, (mass.get(id) ?? 0) + m)
  for (const mem of model.members) {
    const a = pos.get(mem.i), b = pos.get(mem.j)
    if (!a || !b) continue
    const L = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])  // m
    const sec = secById.get(mem.section)
    if (!sec || L === 0) continue
    const half = (memberMassPerLength(sec) * L) / 2   // tonnes per end
    add(mem.i, half)
    add(mem.j, half)
  }
  return mass
}

/**
 * Everything that is NOT a frame member: slab self-weight (γc·t) and
 * superimposed dead load, split to the four corners.
 *
 * This stays lumped and TRANSLATIONAL under both mass models. A slab modelled
 * as a tributary load has no element to carry a consistent matrix, and the
 * rotational inertia of the panel about its corner node is not something the
 * idealisation knows — inventing one would be a number with no derivation
 * behind it.
 */
export function nonMemberNodalMass(model: StructuralModel): Map<string, number> {
  const mass = new Map<string, number>()
  const pos = new Map(model.nodes.map((n) => [n.id, [n.x, n.y, n.z]]))
  const add = (id: string, m: number) => mass.set(id, (mass.get(id) ?? 0) + m)
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

/**
 * Lumped seismic mass per node (tonnes), from member self-weight and slab
 * self-weight + superimposed dead load. Each contribution is split equally to
 * the element's nodes. Live load and applied point/area live are excluded
 * (phase-1 dead-load mass source).
 */
export function buildSeismicMass(model: StructuralModel): Map<string, number> {
  const mass = new Map(memberNodalMass(model))
  for (const [id, m] of nonMemberNodalMass(model)) mass.set(id, (mass.get(id) ?? 0) + m)
  return mass
}

/**
 * The 12×12 CONSISTENT mass matrix of a 3-D frame element, in local axes.
 *
 * ∫ρ NᵀN dx over the same Hermitian cubics the stiffness matrix was integrated
 * from (Przemieniecki §11); local DOF order is the element's own,
 * [u, v, w, θx, θy, θz] at end i then end j. `rSq` is the polar radius of
 * gyration squared, (Iy + Iz)/A in m², which carries the torsional inertia —
 * the one term with no bending analogue and the one a lumped model has no way
 * to represent at all.
 *
 * SIGNS. The x–z bending plane pairs w with θy and carries the opposite sign
 * to the x–y plane's v–θz pairing, because a positive θy moves the section in
 * −z′. Getting that wrong leaves a matrix that is still symmetric, still
 * positive definite, and quietly wrong about coupled modes — which is why the
 * tests check rigid-body work in every direction rather than eyeballing terms.
 *
 * @param mPerL mass per unit length, tonnes/m
 * @param L     element length, m
 * @param rSq   (Iy + Iz)/A, m²
 */
export function consistentMassLocal(mPerL: number, L: number, rSq: number): number[][] {
  const m = mPerL * L                       // total element mass, tonnes
  const M: number[][] = Array.from({ length: 12 }, () => new Array(12).fill(0))
  const set = (a: number, b: number, v: number) => { M[a][b] += v; if (a !== b) M[b][a] += v }
  // axial: u1, u2
  set(0, 0, m / 3); set(6, 6, m / 3); set(0, 6, m / 6)
  // torsion: θx1, θx2 — the polar term
  set(3, 3, (m * rSq) / 3); set(9, 9, (m * rSq) / 3); set(3, 9, (m * rSq) / 6)
  // bending in x–y (v with θz): v1 = 1, θz1 = 5, v2 = 7, θz2 = 11
  set(1, 1, (13 * m) / 35); set(7, 7, (13 * m) / 35); set(1, 7, (9 * m) / 70)
  set(5, 5, (m * L * L) / 105); set(11, 11, (m * L * L) / 105); set(5, 11, -(m * L * L) / 140)
  set(1, 5, (11 * m * L) / 210); set(7, 11, -(11 * m * L) / 210)
  set(1, 11, -(13 * m * L) / 420); set(5, 7, (13 * m * L) / 420)
  // bending in x–z (w with θy): w1 = 2, θy1 = 4, w2 = 8, θy2 = 10 — signs flipped
  set(2, 2, (13 * m) / 35); set(8, 8, (13 * m) / 35); set(2, 8, (9 * m) / 70)
  set(4, 4, (m * L * L) / 105); set(10, 10, (m * L * L) / 105); set(4, 10, -(m * L * L) / 140)
  set(2, 4, -(11 * m * L) / 210); set(8, 10, (11 * m * L) / 210)
  set(2, 10, (13 * m * L) / 420); set(4, 8, -(13 * m * L) / 420)
  return M
}

/**
 * Cholesky factor M = L Lᵀ, lower triangular, or null when M is not positive
 * definite.
 *
 * Null is a real answer and not a failure to paper over: a mass matrix that is
 * not positive definite means some DOF carries no inertia at all, and the
 * generalised eigenproblem has no finite frequency for it. The caller reports
 * that rather than adding a ridge to make the arithmetic go through.
 */
export function cholesky(M: number[][]): number[][] | null {
  const n = M.length
  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = M[i][j]
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k]
      if (i === j) {
        if (!(s > 0) || !Number.isFinite(s)) return null
        L[i][i] = Math.sqrt(s)
      } else {
        L[i][j] = s / L[j][j]
      }
    }
  }
  return L
}

// ── symmetric eigen-solver (cyclic Jacobi) ──────────────────────────────────

/**
 * Eigen-decomposition of a symmetric n×n matrix by cyclic Jacobi rotations.
 * Returns eigenvalues and eigenvectors, where `vectors[k]` is the k-th mode as
 * a ROW (i.e. `vectors[k][c]` is component c of mode k), paired with `values[k]`.
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

/** One DOF that carries inertia: where it sits in the free vector, which node
 *  it belongs to, and which global direction it points along (−1 = rotational,
 *  which only the consistent model ever produces). */
interface MassDof { fpos: number; dir: 0 | 1 | 2 | -1; nodeId: string }

/**
 * Modal analysis of a structural model. Returns the lowest `nModes` modes with
 * natural periods and effective mass participation, or null if the stiffness
 * matrix is singular (run mesh validation first), there is no mass, or the
 * chosen mass matrix is not positive definite.
 */
export function modalAnalysis(model: StructuralModel, nModes = 12, opts: ModalOptions = {}): ModalResult | null {
  // A mesh with errors (e.g. no supports → rigid-body modes) makes K singular
  // in ways the factorisation's pivot tolerance may not catch; gate on validation.
  if (hasMeshErrors(validateMesh(model))) return null
  const br = modelToFrame3D(model, { useShells: false })
  const precomp = precomputeFrame(br.nodes, br.members, br.supports)
  if (!precomp.Kff || precomp.Kff.n === 0) return null
  const massModel: MassModel = opts.massModel ?? 'lumped'

  const built = massModel === 'consistent'
    ? consistentMassSystem(model, precomp)
    : lumpedMassSystem(model, precomp)
  if (!built) return null
  const { dofs: massDofs, M } = built
  const p = massDofs.length
  if (p === 0) return null

  // M = L Lᵀ. For the lumped model M is diagonal and L is the elementwise √m,
  // which reduces every line below to the M^½ F M^½ form this file used before
  // the consistent option existed.
  const Lc = cholesky(M)
  if (!Lc) return null

  // Ã = Lᵀ K⁻¹ L, one K-solve per column of L. Eigenvalues are μ = 1/ω².
  const A: number[][] = Array.from({ length: p }, () => new Array(p).fill(0))
  const rhs = new Array(precomp.Kff.n).fill(0)
  for (let b = 0; b < p; b++) {
    rhs.fill(0)
    for (let c = b; c < p; c++) if (Lc[c][b] !== 0) rhs[massDofs[c].fpos] = Lc[c][b]
    const x = symSolve(precomp.Kff, rhs)
    for (let a = 0; a < p; a++) {
      let sum = 0
      for (let c = a; c < p; c++) if (Lc[c][a] !== 0) sum += Lc[c][a] * x[massDofs[c].fpos]
      A[a][b] = sum
    }
  }
  for (let a = 0; a < p; a++) for (let b = a + 1; b < p; b++) {
    const v = 0.5 * (A[a][b] + A[b][a])
    A[a][b] = v; A[b][a] = v
  }
  const { values, vectors } = jacobiEigen(A)

  // M ι_r once per direction: the participation numerator and the total mass
  // both come from it, so they cannot be measured against different matrices.
  const iota: [number[], number[], number[]] = [new Array(p).fill(0), new Array(p).fill(0), new Array(p).fill(0)]
  for (let a = 0; a < p; a++) {
    const dir = massDofs[a].dir
    if (dir !== -1) iota[dir][a] = 1
  }
  const Miota = iota.map((v) => {
    const out = new Array(p).fill(0)
    for (let a = 0; a < p; a++) { let s = 0; for (let b = 0; b < p; b++) s += M[a][b] * v[b]; out[a] = s }
    return out
  })
  const totalMass = [0, 1, 2].map((r) => {
    let s = 0
    for (let a = 0; a < p; a++) s += iota[r][a] * Miota[r][a]
    return s
  }) as [number, number, number]

  // lowest modes = largest eigenvalues (μ = 1/ω²)
  const order = values.map((_, i) => i).filter((i) => values[i] > 1e-300)
    .sort((i, j) => values[j] - values[i])
    .slice(0, Math.min(nModes, p))

  const modes: Mode[] = order.map((i) => {
    const omega = 1 / Math.sqrt(values[i])
    // φ = L⁻ᵀ ψ, by back-substitution on Lᵀ φ = ψ.
    const psi = vectors[i]
    const phi = new Array(p).fill(0)
    for (let a = p - 1; a >= 0; a--) {
      let s = psi[a]
      for (let c = a + 1; c < p; c++) s -= Lc[c][a] * phi[c]
      phi[a] = s / Lc[a][a]
    }
    // generalised modal mass M* = φᵀ M φ; participation Lr = φᵀ M ιr
    let Mstar = 0
    for (let a = 0; a < p; a++) { let s = 0; for (let b = 0; b < p; b++) s += M[a][b] * phi[b]; Mstar += phi[a] * s }
    const L: [number, number, number] = [0, 1, 2].map((r) => {
      let s = 0
      for (let a = 0; a < p; a++) s += phi[a] * Miota[r][a]
      return s
    }) as [number, number, number]
    const effMass: [number, number, number] = [L[0] * L[0] / Mstar, L[1] * L[1] / Mstar, L[2] * L[2] / Mstar]
    const effMassRatio: [number, number, number] = [0, 1, 2].map((r) =>
      totalMass[r] > 0 ? effMass[r] / totalMass[r] : 0) as [number, number, number]

    // Per-node shape from the TRANSLATIONAL DOFs only. The consistent model
    // also solves rotations, but a mode shape is drawn and tabulated as node
    // displacements, and a rotation is not one.
    const rawShape: Record<string, [number, number, number]> = {}
    for (let a = 0; a < p; a++) {
      const { nodeId, dir } = massDofs[a]
      if (dir === -1) continue
      if (!rawShape[nodeId]) rawShape[nodeId] = [0, 0, 0]
      rawShape[nodeId][dir] = phi[a]
    }
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

  return { modes, totalMass, cumRatio: cum, massModel, activeDofs: p }
}

// ── the two mass systems ────────────────────────────────────────────────────
type MassSystem = { dofs: MassDof[]; M: number[][] }

/** LUMPED: a diagonal M over the massive, free, TRANSLATIONAL DOFs. */
function lumpedMassSystem(model: StructuralModel, precomp: ReturnType<typeof precomputeFrame>): MassSystem | null {
  const massByNode = buildSeismicMass(model)
  const dofs: MassDof[] = []
  const diag: number[] = []
  for (const [nodeId, m] of massByNode) {
    if (m <= 0) continue
    const ni = precomp.idx.get(nodeId)
    if (ni === undefined) continue
    for (let dir = 0 as 0 | 1 | 2; dir < 3; dir = (dir + 1) as 0 | 1 | 2) {
      const fpos = precomp.freeIdx.get(6 * ni + dir)
      if (fpos === undefined) continue  // restrained DOF → mass cannot vibrate
      dofs.push({ fpos, dir, nodeId })
      diag.push(m)
    }
  }
  const p = dofs.length
  const M: number[][] = Array.from({ length: p }, (_, a) =>
    Array.from({ length: p }, (_, b) => (a === b ? diag[a] : 0)))
  return { dofs, M }
}

/**
 * CONSISTENT: every free DOF, carrying the assembled element mass matrices
 * plus the lumped non-member (slab / superimposed dead) mass at the
 * translational DOFs.
 *
 * The element mass is assembled through `geom.T` — the SAME transform the
 * stiffness used, rigid end offsets and all — so K and M are expressed in one
 * set of axes. Releases are deliberately NOT condensed out of M: a released
 * end still has rotational inertia, and condensing it would be applying a
 * static operation to a dynamic quantity. Where that leaves a DOF with mass
 * and no stiffness at all, K is singular and the caller has already bailed.
 */
function consistentMassSystem(model: StructuralModel, precomp: ReturnType<typeof precomputeFrame>): MassSystem | null {
  const nf = precomp.free.length
  if (nf === 0) return null
  const dofs: MassDof[] = precomp.free.map((gdof, k) => {
    const k6 = gdof % 6
    return {
      fpos: k,
      dir: (k6 < 3 ? k6 : -1) as 0 | 1 | 2 | -1,
      nodeId: precomp.nodes[Math.floor(gdof / 6)]?.id ?? '',
    }
  })
  const M: number[][] = Array.from({ length: nf }, () => new Array(nf).fill(0))

  const secById = new Map(model.sections.map((s) => [s.id, s]))
  const secOfMember = new Map(model.members.map((m) => [m.id, secById.get(m.section)]))
  precomp.geoms.forEach((g, k) => {
    const fm = precomp.members[k]
    const sec = secOfMember.get(fm.id)
    if (!sec || g.L <= 0) return
    const mPerL = memberMassPerLength(sec)
    if (mPerL <= 0) return
    // Polar radius of gyration squared, m² — from the SAME Iy/Iz/A the
    // stiffness element carries, so section and inertia cannot disagree.
    const rSq = fm.A > 0 ? ((fm.Iy + fm.Iz) / fm.A) * 1e-6 : 0
    const ml = consistentMassLocal(mPerL, g.L, rSq)
    // mg = Tᵀ ml T, scattered into the free block.
    const T = g.T
    const tmp: number[][] = Array.from({ length: 12 }, () => new Array(12).fill(0))
    for (let a = 0; a < 12; a++) for (let b = 0; b < 12; b++) {
      let s = 0
      for (let c = 0; c < 12; c++) s += ml[a][c] * T[c][b]
      tmp[a][b] = s
    }
    for (let a = 0; a < 12; a++) {
      const ia = precomp.freeIdx.get(g.dofs[a])
      if (ia === undefined) continue
      for (let b = 0; b < 12; b++) {
        const ib = precomp.freeIdx.get(g.dofs[b])
        if (ib === undefined) continue
        let s = 0
        for (let c = 0; c < 12; c++) s += T[c][a] * tmp[c][b]
        M[ia][ib] += s
      }
    }
  })

  // Slab self-weight and superimposed dead: lumped, translational, unchanged.
  for (const [nodeId, m] of nonMemberNodalMass(model)) {
    if (m <= 0) continue
    const ni = precomp.idx.get(nodeId)
    if (ni === undefined) continue
    for (let dir = 0; dir < 3; dir++) {
      const fpos = precomp.freeIdx.get(6 * ni + dir)
      if (fpos !== undefined) M[fpos][fpos] += m
    }
  }
  return { dofs, M }
}
