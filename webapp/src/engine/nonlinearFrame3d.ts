// ─────────────────────────────────────────────────────────────────────────
// SPACE FRAME WITH BIAXIAL MEMBER-END PLASTIC HINGES. Layer L5.
//
// `nonlinearFrame.ts` does concentrated plasticity for a PLANE frame: 3 DOF per
// node, one hinge rotation per member end, a 1-D moment–rotation law. That
// formulation cannot represent a column bending about both axes at once, which
// is the normal state of a corner column under skew seismic input. This module
// is the 3-D version: 6 DOF per node and a hinge that carries a moment VECTOR
// on the coupled yield surface from `biaxialHinge.ts`.
//
// FORMULATION — the hinge rotations are explicit DOFs, in LOCAL axes.
// As in the plane frame, each hinged member end gets its own rotation DOFs
// rather than being condensed into a modified element stiffness. In 3-D there
// are TWO of them per end (bending about local y′ and z′; torsion stays
// continuous), and — the one genuinely new idea here — they are LOCAL
// quantities, because the yield surface is defined in the section's own axes:
//
//     node θ⃗ ──[ hinge, about y′ and z′ ]── (θy′_b, θz′_b) ═══ elastic beam ═══
//
// The hinge deformation is therefore the node's global rotation vector
// PROJECTED onto the member's local axes, minus the beam-end DOF:
//
//     θ_hy = e⃗y′·θ⃗_node − θy′_b        θ_hz = e⃗z′·θ⃗_node − θz′_b
//
// which is a linear map B (2×5) from {θ⃗_node, θy′_b, θz′_b}. The spring then
// contributes fs = Bᵀ·M⃗ and Kh = Bᵀ·kt·B with M⃗ and kt straight from
// `biaxialProbe`. Handling orientation ONCE in B is what makes the whole thing
// orientation-independent for free — a test rotates an entire model through an
// arbitrary 3-D rotation and requires the collapse load to be unchanged.
//
// The element itself is `frame3d`'s own `kLocal`, wired through a rectangular
// transform A (12 × nElemDof) that takes local DOFs from the node rotations via
// the direction cosines EXCEPT at a hinged end, where the two bending rotations
// come from the dedicated DOFs instead. With no hinges A is exactly frame3d's
// T, so the elastic case reproduces `solveFrame3D` to machine precision — also
// a test, and the reason `kLocal` is imported rather than re-derived.
//
// Like the plane-frame version these hinges unload elastically and re-yield, so
// the frame can be cycled; unlike the event-to-event pushover a hinge is never
// a permanent release.
//
// Units: E, G MPa; A mm²; Iy, Iz, J mm⁴; geometry m; Mp kN·m; forces kN;
// displacement m; rotation rad. (EI/GJ/EA are converted at the boundary.)
// Refs: McGuire/Gallagher/Ziemian §10; Simo & Hughes; Neal, limit analysis.
// ─────────────────────────────────────────────────────────────────────────
import { luFactor, luSolve } from './fem'
import { kLocal, localAxes, defaultAxisRotation, type V3 } from './frame3d'
import {
  biaxialProbe, biaxialCommit, newBiaxialState, biaxialUtilisation,
  reducedBiaxialCapacities,
  type BiaxialState, type BiaxialHingeParams, type BiaxialSurfaceSpec,
} from './biaxialHinge'
import type { PmKind } from './pmInteraction'

export interface NL3Node { id: string; x: number; y: number; z: number }

export interface NL3Member {
  id: string
  i: string; j: string
  /** Young's and shear modulus, MPa. */
  E: number; G: number
  /** Area, mm². */
  A: number
  /** Second moments about local y′ and z′, mm⁴. */
  Iy: number; Iz: number
  /** Torsion constant, mm⁴. */
  J: number
  /** Local-axis rotation about x′, degrees. Defaults as in `frame3d` (verticals 90°). */
  rot?: number
  /** Plastic moment capacity about local y′ / z′, kN·m. Both Infinity (default)
   *  = no hinge on this member, and it contributes no extra DOFs at all. */
  Mpy?: number; Mpz?: number
  /** Post-yield stiffness ratios as a fraction of the MEMBER stiffness (default 0.02). */
  by?: number; bz?: number
  /** Elastic hinge stiffness as a multiple of EI/L (default 1e4 = effectively rigid). */
  rigidity?: number
  /** Axial capacity for P–M interaction: Py = Fy·A (steel) or Pn0 (concrete), kN.
   *  With `surface: 'orbison'` it is the p = P/Py the surface reads directly;
   *  with the power surface it drives the uniaxial `reducedPlasticMoment` chords.
   *  Omit to keep the pure-bending capacities. */
  Pcap?: number
  /** Yield surface for this member's hinges. Default: elliptical power surface. */
  surface?: BiaxialSurfaceSpec
  /** Which uniaxial P–M chord reduces each axis (power surface only). */
  pmKindY?: PmKind; pmKindZ?: PmKind
}

export type NL3Fixity = 'pin' | 'fixed'
export interface NL3Support { node: string; fixity: NL3Fixity }
/** Nodal load; forces kN, moments kN·m. */
export interface NL3Load {
  node: string
  Fx?: number; Fy?: number; Fz?: number
  Mx?: number; My?: number; Mz?: number
}

export interface Hinge3Report {
  member: string
  end: 'i' | 'j'
  /** Moment carried about local y′ and z′, kN·m. */
  My: number; Mz: number
  /** Total hinge rotation about local y′ and z′, rad. */
  rotY: number; rotZ: number
  /** Plastic (permanent) rotation about each axis, rad. */
  plasticY: number; plasticZ: number
  /** Demand/capacity on the yield surface at the current state. */
  utilisation: number
  yielded: boolean
  /** Energy dissipated at this hinge, kN·m. */
  dissipated: number
  /** Axial force in the member at the final state, kN (+tension). */
  axial: number
}

export interface NL3Step {
  /** Load factor λ applied to the reference load set. */
  lambda: number
  /** Control-node displacement in the control direction, m. */
  disp: number
  /** Total applied load in the control direction, kN. */
  load: number
  /** Number of hinges yielding at this step. */
  hinges: number
  converged: boolean
  iterations: number
  /** Relative out-of-balance ‖R‖/scale left at the end of the step. Reported per
   *  the L5 convention that iterative routines hand back their residual so the
   *  caller — not the engine — decides how to present a step that fell short. */
  residual: number
}

export interface NL3Result {
  steps: NL3Step[]
  hinges: Hinge3Report[]
  /** Displacement vector at the final step (free-DOF order). */
  d: number[]
  totalDissipated: number
  converged: boolean
  /** True when the tangent went singular — a collapse mechanism formed. */
  mechanism: boolean
}

export interface NL3Input {
  nodes: NL3Node[]
  members: NL3Member[]
  supports: NL3Support[]
  /** Reference load set; scaled by the load factor λ. */
  loads: NL3Load[]
  /** Node whose displacement is reported on the capacity curve. */
  controlNode: string
  /** Control direction (global). */
  controlDir?: 'x' | 'y' | 'z'
  /** λ values to march through — monotonic OR cyclic (may decrease / reverse). */
  schedule?: number[]
  /** Number of equal increments when `schedule`/`dispSchedule` is omitted (default 60). */
  steps?: number
  /** Maximum λ for the default monotonic schedule (default 3). */
  lambdaMax?: number
  /**
   * 'load' (default) prescribes λ and solves for displacement — it cannot pass
   * the peak. 'displacement' prescribes the control displacement and solves for
   * λ, so a softening branch can be traced.
   */
  control?: 'load' | 'displacement'
  dispSchedule?: number[]
  dispMax?: number
  /**
   * Relative RESIDUAL tolerance for the Newton solve (default 1e-10).
   *
   * Deliberately not an increment tolerance. ‖Δd‖/‖d‖ cannot tell convergence
   * from divergence: once a bad step has made ‖d‖ astronomical the relative
   * increment is trivially small, so a diverged state reports itself converged.
   * That is not hypothetical here — a fully plastic BIAXIAL hinge leaves a
   * genuine zero-stiffness direction, and if the control DOF does not restrain
   * it the load factor runs away while the step still looks converged. The
   * residual has no such blind spot.
   */
  tol?: number
  maxIter?: number
  /**
   * Backtracking halvings allowed per Newton iteration (default 25). 0 disables
   * the line search and gives plain full Newton.
   *
   * The default is deliberately deep. A hinge's tangent falls by k0/(b·k0) at
   * yield — 5e5 at the default rigidity and hardening — so when a step yields
   * twenty hinges at once the full Newton direction can be wildly wrong and a
   * handful of halvings is not enough to recover. Measured on a two-storey
   * frame: with 6 halvings only 1 of 12 steps converged and the reported peak
   * base shear was 287 kN; with 25, all 12 converged and the peak was 405 kN
   * **at every penalty rigidity from 1e2 to 1e4**. That invariance is the real
   * check — a converged answer must not depend on the penalty constant.
   */
  maxBacktrack?: number
}

const DOF = 6
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Per-hinge data carried between solves. */
export interface Frame3Hinge {
  member: string
  end: 'i' | 'j'
  /** The node's three global rotation DOFs. */
  nodeRot: [number, number, number]
  /** The extra beam-end rotation DOFs about local y′ and z′. */
  beamY: number
  beamZ: number
  /** Member local y′ and z′ axes, global components — the projection in B. */
  ey: V3
  ez: V3
  /** Elastic (penalty) hinge stiffness about each axis, kN·m/rad. */
  k0y: number; k0z: number
  /** Pure-bending plastic capacities, kN·m. */
  Mpy: number; Mpz: number
  /** Post-yield ratios already scaled onto k0. */
  by: number; bz: number
  surface: BiaxialSurfaceSpec
  pm?: { Pcap: number; kindY: PmKind; kindZ: PmKind }
  state: BiaxialState
}

export interface Frame3Assembly {
  nodeIdx: Map<string, number>
  hinges: Frame3Hinge[]
  fpos: Map<number, number>
  nf: number
  /** Constant elastic beam stiffness on the free DOFs. */
  Kbeam: number[][]
  /** Reference load vector on the free DOFs. */
  Pref: number[]
  /** Hinge rotations (θ about local y′, z′) at the current state. */
  hingeDeform: (d: number[], h: Frame3Hinge) => [number, number]
  /** Internal force + tangent contribution of every hinge. */
  hingeContrib: (d: number[]) => { fs: number[]; Kh: number[][] }
  /** Internal hinge force ALONE. The line search evaluates the residual several
   *  times per iteration and never needs the tangent; skipping it avoids
   *  allocating an nf×nf matrix per trial step. */
  hingeForce: (d: number[]) => number[]
  /** Axial force in a member at the current state, kN (+tension). */
  axialForce: (d: number[], memberId: string) => number
  /** Constitutive parameters of a hinge, with P–M applied at the current state. */
  hingeParams: (d: number[], h: Frame3Hinge) => BiaxialHingeParams
}

/**
 * Assemble the frame once — DOF map (6 per node plus TWO extra rotations per
 * hinged member end), the constant elastic beam stiffness, the reference load
 * vector and the hinge closures. Returns null for a degenerate model.
 */
export function assembleFrame3D(inp: NL3Input): Frame3Assembly | null {
  const { nodes, members, supports, loads } = inp
  if (nodes.length === 0 || members.length === 0) return null
  const nodeIdx = new Map(nodes.map((n, i) => [n.id, i]))
  const nm = new Map(nodes.map((n) => [n.id, n]))

  const geom = members.map((m) => {
    const a = nm.get(m.i), b = nm.get(m.j)
    if (!a || !b) return null
    const dir: V3 = [b.x - a.x, b.y - a.y, b.z - a.z]
    const L = Math.hypot(...dir)
    if (!(L > 0)) return null
    const R = localAxes(dir, defaultAxisRotation(dir, m.rot))
    return {
      m, L, R,
      EA: (m.E * m.A) / 1e3,          // MPa·mm² → kN
      GJ: (m.G * m.J) / 1e9,          // MPa·mm⁴ → kN·m²
      EIy: (m.E * m.Iy) / 1e9,
      EIz: (m.E * m.Iz) / 1e9,
      ia: nodeIdx.get(m.i)!, ib: nodeIdx.get(m.j)!,
    }
  })
  if (geom.some((g) => g === null || g.ia === undefined || g.ib === undefined)) return null

  // ── DOF map: 6 per node, then two extra rotations per HINGED member end ──
  let ndof = nodes.length * DOF
  const hinges: Frame3Hinge[] = []
  /** member id → [beamY, beamZ] per end, or null where the end is not hinged. */
  const beamDofs = new Map<string, [[number, number] | null, [number, number] | null]>()

  for (const g of geom) {
    const { m, L, R, EIy, EIz, ia, ib } = g!
    const Mpy = m.Mpy ?? Infinity, Mpz = m.Mpz ?? Infinity
    const hinged = Number.isFinite(Mpy) || Number.isFinite(Mpz)
    if (!hinged) { beamDofs.set(m.id, [null, null]); continue }

    const rigidity = m.rigidity ?? 1e4
    const k0y = rigidity * (EIy / L), k0z = rigidity * (EIz / L)
    // `by`/`bz` are the post-yield stiffness the user wants AS A FRACTION OF THE
    // MEMBER. The hinge's own k0 is an artificial penalty stiffness, so scale
    // them onto it — the same correction the plane-frame version makes, and for
    // the same reason: using b directly would leave a "2% hardening" hinge at
    // 200·EI/L, i.e. barely yielding at all.
    const by = (m.by ?? 0.02) / rigidity, bz = (m.bz ?? 0.02) / rigidity
    const pm = m.Pcap != null && m.Pcap > 0
      ? { Pcap: m.Pcap, kindY: m.pmKindY ?? 'steel-weak' as PmKind, kindZ: m.pmKindZ ?? 'steel-strong' as PmKind }
      : undefined

    const ends: [[number, number] | null, [number, number] | null] = [null, null]
    for (const [k, end, ni] of [[0, 'i', ia], [1, 'j', ib]] as const) {
      const beamY = ndof++, beamZ = ndof++
      ends[k] = [beamY, beamZ]
      hinges.push({
        member: m.id, end,
        nodeRot: [ni * DOF + 3, ni * DOF + 4, ni * DOF + 5],
        beamY, beamZ, ey: R[1], ez: R[2],
        k0y, k0z, Mpy, Mpz, by, bz,
        surface: m.surface ?? { kind: 'power' },
        pm, state: newBiaxialState(),
      })
    }
    beamDofs.set(m.id, ends)
  }

  // ── restrained DOFs ──
  const fixed = new Set<number>()
  for (const s of supports) {
    const i = nodeIdx.get(s.node)
    if (i === undefined) continue
    for (let k = 0; k < (s.fixity === 'fixed' ? 6 : 3); k++) fixed.add(i * DOF + k)
  }
  const free = Array.from({ length: ndof }, (_, i) => i).filter((i) => !fixed.has(i))
  const fpos = new Map(free.map((g, i) => [g, i]))
  const nf = free.length
  if (nf === 0) return null

  // ── constant elastic beam stiffness ──
  const Kbeam: number[][] = Array.from({ length: nf }, () => new Array(nf).fill(0))
  /** member id → axial-recovery data */
  const axialOf = new Map<string, { dofs: number[]; EA: number; L: number; ex: V3 }>()

  for (const g of geom) {
    const { m, L, R, EA, GJ, EIy, EIz, ia, ib } = g!
    const ends = beamDofs.get(m.id)!
    // Participating global DOFs: node i's 6, node j's 6, then any beam-end DOFs.
    const gdofs = [
      ...Array.from({ length: 6 }, (_, k) => ia * DOF + k),
      ...Array.from({ length: 6 }, (_, k) => ib * DOF + k),
    ]
    const colOf = new Map<number, number>()
    for (const e of ends) if (e) for (const dofId of e) { colOf.set(dofId, gdofs.length); gdofs.push(dofId) }
    const ne = gdofs.length
    axialOf.set(m.id, { dofs: gdofs.slice(0, 12), EA, L, ex: R[0] })

    // A: 12 local element DOFs ← ne participating DOFs.
    const A: number[][] = Array.from({ length: 12 }, () => new Array(ne).fill(0))
    for (const [blk, base] of [[0, 0], [2, 6]] as const) {
      // translations of this end: local row = direction cosines on the node's u
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) A[blk * 3 + r][base + c] = R[r][c]
    }
    for (const [k, rowBase, nodeBase] of [[0, 3, 3], [1, 9, 9]] as const) {
      // torsion always comes from the node rotations
      for (let c = 0; c < 3; c++) A[rowBase][nodeBase + c] = R[0][c]
      const e = ends[k]
      if (e) {
        // hinged: the two bending rotations are dedicated DOFs, in local axes
        A[rowBase + 1][colOf.get(e[0])!] = 1
        A[rowBase + 2][colOf.get(e[1])!] = 1
      } else {
        for (let c = 0; c < 3; c++) {
          A[rowBase + 1][nodeBase + c] = R[1][c]
          A[rowBase + 2][nodeBase + c] = R[2][c]
        }
      }
    }

    // Kg = Aᵀ · kLocal · A, assembled on the free DOFs
    const kl = kLocal(EA, GJ, EIy, EIz, L)
    const kA: number[][] = Array.from({ length: 12 }, () => new Array(ne).fill(0))
    for (let r = 0; r < 12; r++) for (let c = 0; c < ne; c++) {
      let v = 0
      for (let t = 0; t < 12; t++) v += kl[r][t] * A[t][c]
      kA[r][c] = v
    }
    for (let r = 0; r < ne; r++) {
      const P = fpos.get(gdofs[r])
      if (P === undefined) continue
      for (let c = 0; c < ne; c++) {
        const Q = fpos.get(gdofs[c])
        if (Q === undefined) continue
        let v = 0
        for (let t = 0; t < 12; t++) v += A[t][r] * kA[t][c]
        Kbeam[P][Q] += v
      }
    }
  }

  // ── reference load vector ──
  const Pref = new Array(nf).fill(0)
  for (const l of loads) {
    const i = nodeIdx.get(l.node)
    if (i === undefined) continue
    const put = (k: number, val: number | undefined) => {
      if (!val) return
      const p = fpos.get(i * DOF + k)
      if (p !== undefined) Pref[p] += val
    }
    put(0, l.Fx); put(1, l.Fy); put(2, l.Fz)
    put(3, l.Mx); put(4, l.My); put(5, l.Mz)
  }

  const at = (d: number[], g: number) => { const p = fpos.get(g); return p !== undefined ? d[p] : 0 }

  const axialForce = (d: number[], memberId: string): number => {
    const g = axialOf.get(memberId)
    if (!g) return 0
    const du: V3 = [
      at(d, g.dofs[6]) - at(d, g.dofs[0]),
      at(d, g.dofs[7]) - at(d, g.dofs[1]),
      at(d, g.dofs[8]) - at(d, g.dofs[2]),
    ]
    return (g.EA / g.L) * dot3(du, g.ex)
  }

  /** θ about local y′ and z′ across the hinge — the B·d of the header. */
  const hingeDeform = (d: number[], h: Frame3Hinge): [number, number] => {
    const th: V3 = [at(d, h.nodeRot[0]), at(d, h.nodeRot[1]), at(d, h.nodeRot[2])]
    return [dot3(h.ey, th) - at(d, h.beamY), dot3(h.ez, th) - at(d, h.beamZ)]
  }

  const hingeParams = (d: number[], h: Frame3Hinge): BiaxialHingeParams => {
    const base = { k0y: h.k0y, k0z: h.k0z, by: h.by, bz: h.bz, surface: h.surface }
    if (!h.pm) return { ...base, Mpy: h.Mpy, Mpz: h.Mpz }
    const N = axialForce(d, h.member)
    // Orbison carries the axial term inside the surface, so the capacities stay
    // pure-bending; the power surface has no P, so reduce them on the chords.
    if (h.surface.kind === 'orbison') {
      return { ...base, Mpy: h.Mpy, Mpz: h.Mpz, p: N / h.pm.Pcap }
    }
    const red = reducedBiaxialCapacities(h.Mpy, h.Mpz, N, h.pm.Pcap, h.pm.kindY, h.pm.kindZ)
    return { ...base, Mpy: red.Mpy, Mpz: red.Mpz }
  }

  const hingeForce = (d: number[]): number[] => {
    const fs = new Array(nf).fill(0)
    for (const h of hinges) {
      const [thY, thZ] = hingeDeform(d, h)
      const { My, Mz } = biaxialProbe(thY, thZ, h.state, hingeParams(d, h))
      const cols = [h.nodeRot[0], h.nodeRot[1], h.nodeRot[2], h.beamY, h.beamZ]
      const B = [
        [h.ey[0], h.ey[1], h.ey[2], -1, 0],
        [h.ez[0], h.ez[1], h.ez[2], 0, -1],
      ]
      for (let r = 0; r < 5; r++) {
        const P = fpos.get(cols[r])
        if (P !== undefined) fs[P] += B[0][r] * My + B[1][r] * Mz
      }
    }
    return fs
  }

  const hingeContrib = (d: number[]) => {
    const fs = new Array(nf).fill(0)
    const Kh: number[][] = Array.from({ length: nf }, () => new Array(nf).fill(0))
    for (const h of hinges) {
      const [thY, thZ] = hingeDeform(d, h)
      const { My, Mz, kt } = biaxialProbe(thY, thZ, h.state, hingeParams(d, h))
      // B (2×5) over {θ_node(3), θy′_b, θz′_b}; fs += Bᵀ·M, Kh += Bᵀ·kt·B
      const cols = [h.nodeRot[0], h.nodeRot[1], h.nodeRot[2], h.beamY, h.beamZ]
      const B = [
        [h.ey[0], h.ey[1], h.ey[2], -1, 0],
        [h.ez[0], h.ez[1], h.ez[2], 0, -1],
      ]
      const M = [My, Mz]
      for (let r = 0; r < 5; r++) {
        const P = fpos.get(cols[r])
        if (P === undefined) continue
        fs[P] += B[0][r] * M[0] + B[1][r] * M[1]
        for (let c = 0; c < 5; c++) {
          const Q = fpos.get(cols[c])
          if (Q === undefined) continue
          let v = 0
          for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) v += B[a][r] * kt[a][b] * B[b][c]
          Kh[P][Q] += v
        }
      }
    }
    return { fs, Kh }
  }

  return {
    nodeIdx, hinges, fpos, nf, Kbeam, Pref,
    hingeDeform, hingeContrib, hingeForce, axialForce, hingeParams,
  }
}

/**
 * Nonlinear space-frame analysis with biaxial member-end plastic hinges.
 * Marches the load factor (or the control displacement) through the schedule,
 * running Newton-Raphson at each step, and reports the capacity curve plus
 * per-hinge state. Returns null for a degenerate model.
 */
export function nonlinearFrame3D(inp: NL3Input): NL3Result | null {
  const asm = assembleFrame3D(inp)
  if (!asm) return null
  const {
    nodeIdx, hinges, fpos, nf, Kbeam, Pref,
    hingeDeform, hingeContrib, hingeForce, hingeParams, axialForce,
  } = asm
  const tol = inp.tol ?? 1e-9
  const maxIter = inp.maxIter ?? 60
  const maxBacktrack = inp.maxBacktrack ?? 25

  /** Out-of-balance force at a trial state, with the scale its norm is judged
   *  against. No tangent — the line search calls this repeatedly. */
  const residual = (dv: number[], lam: number) => {
    const fs = hingeForce(dv)
    const R = new Array(nf)
    let rn = 0, intN = 0, extN = 0
    for (let r = 0; r < nf; r++) {
      let kd = 0
      for (let q = 0; q < nf; q++) kd += Kbeam[r][q] * dv[q]
      const internal = kd + fs[r], ext = lam * Pref[r]
      R[r] = ext - internal
      rn += R[r] * R[r]; intN += internal * internal; extN += ext * ext
    }
    // Scale on the INTERNAL force as well as the applied load: a diverged state
    // has enormous internal forces, so its residual can never look small
    // relative to them.
    return { R, rn: Math.sqrt(rn), scale: Math.max(Math.sqrt(intN), Math.sqrt(extN), 1e-12) }
  }
  const dirIdx = { x: 0, y: 1, z: 2 }[inp.controlDir ?? 'x']
  const dispControl = inp.control === 'displacement'
  const nSteps = inp.steps ?? 60
  const schedule = dispControl
    ? (inp.dispSchedule
      ?? Array.from({ length: nSteps }, (_, i) => ((i + 1) * (inp.dispMax ?? 0.1)) / nSteps))
    : (inp.schedule
      ?? Array.from({ length: nSteps }, (_, i) => ((i + 1) * (inp.lambdaMax ?? 3)) / nSteps))

  const d = new Array(nf).fill(0)
  let dPrev = new Array(nf).fill(0)
  const steps: NL3Step[] = []
  let mechanism = false, allConverged = true

  const ctrlIdx = (() => {
    const i = nodeIdx.get(inp.controlNode)
    return i === undefined ? undefined : fpos.get(i * DOF + dirIdx)
  })()

  let lambda = 0
  for (const target of schedule) {
    if (!dispControl) lambda = target
    let it = 0, ok = false
    for (; it < maxIter; it++) {
      const cur = residual(d, lambda)
      const ctrlErr = dispControl && ctrlIdx !== undefined ? Math.abs(d[ctrlIdx] - target) : 0
      if (cur.rn <= tol * cur.scale && ctrlErr <= 1e-10 * Math.max(1, Math.abs(target))) {
        ok = true
        break
      }
      const R = cur.R
      const { Kh } = hingeContrib(d)
      const Kt: number[][] = Array.from({ length: nf }, (_, r) => {
        const row = new Array<number>(nf)
        for (let q = 0; q < nf; q++) row[q] = Kbeam[r][q] + Kh[r][q]
        return row
      })
      /**
       * Symmetric diagonal equilibration before factorising.
       *
       * The hinge penalty stiffness is `rigidity`·EI/L, so the tangent's
       * diagonal spans four orders of magnitude between beam DOFs and hinge
       * DOFs. `luFactor`'s singularity test is an ABSOLUTE 1e-14, which entries
       * of order 1e10 can never trip — so an actually singular tangent would be
       * factored anyway and return nonsense instead of being reported as a
       * mechanism. Scaling the diagonal to ~1 makes that test mean something,
       * and costs the factorisation nothing.
       *
       * To be clear about what this does NOT do: it is not what fixed the
       * multi-hinge convergence failure. Measured on a two-storey frame it
       * changed the outcome not at all; the backtracking depth did. It is kept
       * for the singularity test and for factorisation accuracy.
       *
       * Solving (S·K·S)·y = S·b with S = diag(1/√|Kii|) and recovering x = S·y
       * is exact in real arithmetic — this buys conditioning, not a shortcut.
       */
      const S = new Array(nf)
      for (let r = 0; r < nf; r++) {
        const v = Math.abs(Kt[r][r])
        S[r] = v > 0 ? 1 / Math.sqrt(v) : 1
      }
      for (let r = 0; r < nf; r++) {
        const row = Kt[r], sr = S[r]
        for (let q = 0; q < nf; q++) row[q] *= sr * S[q]
      }
      const lu = luFactor(Kt)
      if (!lu) { mechanism = true; break }
      const solveScaled = (b: number[]): number[] => {
        const bs = new Array(nf)
        for (let r = 0; r < nf; r++) bs[r] = b[r] * S[r]
        const y = luSolve(lu, bs)
        for (let r = 0; r < nf; r++) y[r] *= S[r]
        return y
      }
      const du = solveScaled(R)

      /**
       * Backtracking line search on the residual.
       *
       * Full Newton cycles badly here: the bilinear hinge tangent jumps by a
       * factor of ~1/b as a hinge crosses yield, so with dozens of hinges near
       * the surface at once, successive iterates flip hinges in and out and the
       * residual never settles — the iteration cap is hit at ANY tolerance,
       * which is how this was found. Halving the step until the residual
       * actually decreases restores convergence.
       */
      const step = (inc: number[], dl: number): boolean => {
        // Iteration 0 is the PREDICTOR: under displacement control it raises λ
        // to meet the new target, which legitimately raises the residual before
        // the displacement catches up. Line-searching it would reject the very
        // step the constraint prescribes, so damping starts with the corrections.
        let s = 1
        for (let k = 0; k <= (it > 0 ? maxBacktrack : 0); k++) {
          const trial = new Array(nf)
          for (let r = 0; r < nf; r++) trial[r] = d[r] + s * inc[r]
          const tl = lambda + s * dl
          const tr = residual(trial, tl)
          if (tr.rn < cur.rn || k === (it > 0 ? maxBacktrack : 0)) {
            for (let r = 0; r < nf; r++) d[r] = trial[r]
            lambda = tl
            return true
          }
          s *= 0.5
        }
        return true
      }

      if (dispControl) {
        // δd = δd_R + δλ·δd_P with Kt·δd_P = Pref; the constraint d[ctrl] =
        // target fixes δλ, making the load factor an OUTPUT — which is what
        // lets the curve descend past its peak.
        if (ctrlIdx === undefined) { mechanism = true; break }
        const dP = solveScaled(Pref)
        // The control DOF has to actually participate in the load-response mode.
        // Measured RELATIVE to ‖dP‖: an absolute floor passes a denominator that
        // is negligible next to the rest of the vector, and dividing by it throws
        // λ across the map — which is exactly how the run-away above began.
        let dPmax = 0
        for (const v of dP) dPmax = Math.max(dPmax, Math.abs(v))
        const denom = dP[ctrlIdx]
        if (!(Math.abs(denom) > 1e-10 * Math.max(dPmax, 1e-30))) { mechanism = true; break }
        const dl = (target - d[ctrlIdx] - du[ctrlIdx]) / denom
        const inc = new Array(nf)
        for (let r = 0; r < nf; r++) inc[r] = du[r] + dl * dP[r]
        step(inc, dl)
      } else {
        step(du, 0)
      }
    }
    if (mechanism) break
    if (!ok) allConverged = false

    // commit hinge plastic state
    let yielded = 0
    for (const h of hinges) {
      const [thY, thZ] = hingeDeform(d, h)
      const [pY, pZ] = hingeDeform(dPrev, h)
      const { resp, state } = biaxialCommit(thY, thZ, pY, pZ, h.state, hingeParams(d, h))
      h.state = state
      if (resp.yielding) yielded++
    }
    dPrev = [...d]

    steps.push({
      lambda,
      disp: ctrlIdx !== undefined ? d[ctrlIdx] : 0,
      load: lambda * (ctrlIdx !== undefined ? Pref[ctrlIdx] : 0),
      hinges: yielded, converged: ok, iterations: it,
      residual: (() => { const f = residual(d, lambda); return f.rn / f.scale })(),
    })
  }

  const report: Hinge3Report[] = hinges.map((h) => {
    const [thY, thZ] = hingeDeform(d, h)
    const prm = hingeParams(d, h)
    const r = biaxialProbe(thY, thZ, h.state, prm)
    return {
      member: h.member, end: h.end,
      My: r.My, Mz: r.Mz, rotY: thY, rotZ: thZ,
      plasticY: h.state.thpY, plasticZ: h.state.thpZ,
      utilisation: biaxialUtilisation(r.My, r.Mz, prm.Mpy, prm.Mpz, prm.p ?? 0, h.surface),
      yielded: r.yielding || h.state.cumPlastic > 0,
      dissipated: h.state.dissipated,
      axial: axialForce(d, h.member),
    }
  })

  return {
    steps, hinges: report, d,
    totalDissipated: report.reduce((s, h) => s + h.dissipated, 0),
    converged: allConverged, mechanism,
  }
}
