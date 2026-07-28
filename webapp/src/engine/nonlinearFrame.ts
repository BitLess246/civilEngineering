// ─────────────────────────────────────────────────────────────────────────
// DISTRIBUTED MEMBER-END PLASTIC HINGES — nonlinear analysis of a PLANE frame
// with concentrated plasticity at member ends. Layer L5.
//
// This replaces the storey-spring reduction (`nonlinearModel.ts`) with real
// per-member-end plasticity, and unlike the event-to-event pushover
// (`pushover.ts`) — where a hinge is a PERMANENT release and can never
// re-stiffen — these hinges unload elastically and re-yield, so the frame can
// be cycled.
//
// FORMULATION — the hinge rotation is an explicit DOF.
// A plastic hinge is a rotational spring in series with the elastic element.
// Rather than condensing it into a modified element stiffness (fiddly, and the
// state determination then needs a nested solve), each hinge gets its OWN
// global rotation DOF:
//
//        node θ ──[ hinge spring kθ ]── θb ═══ elastic beam ═══
//
// The beam's flexural end rotation uses θb; the hinge spring carries the moment
// between θ (the node) and θb. The frame is then a LINEAR elastic assembly plus
// a set of 1-D hysteretic springs — structurally identical to the spring
// network already validated in `nonlinearTimeHistory.ts`, and the hinge
// deformation is simply a difference of two DOFs, so state determination is
// exact and trivial.
//
// Hinge law: bilinear kinematic hardening from `hysteresis.ts` in
// (moment, rotation) instead of (force, displacement) — the same algebra.
// The elastic hinge stiffness is set RIGID relative to the member (default
// 1e4·EI/L) so an unyielded hinge does not soften the elastic frame; the tests
// pin that error against closed forms.
//
// Solved by load-incremental Newton-Raphson; returns the capacity curve so a
// monotonic push reproduces the classic rigid-plastic collapse loads.
//
// Units: E MPa, I mm⁴, A mm², L m, Mp kN·m, forces kN, displacement m,
// rotation rad. (EI is converted to kN·m² internally.)
// Refs: Chopra §7; Clough & Penzien; plastic-hinge limit analysis (Neal).
// ─────────────────────────────────────────────────────────────────────────
import { luFactor, luSolve } from './fem'
import { reducedPlasticMoment, type PmKind } from './pmInteraction'
import {
  bilinearProbe, bilinearCommit, newBilinearState,
  type BilinearState,
} from './hysteresis'

export interface NLNode { id: string; x: number; y: number }

export interface NLMember {
  id: string
  i: string; j: string
  /** Young's modulus, MPa. */
  E: number
  /** Second moment of area, mm⁴. */
  I: number
  /** Area, mm². */
  A: number
  /** Plastic moment capacity at each end, kN·m. Infinity (default) = no hinge. */
  Mp?: number
  /** Post-yield stiffness ratio of the hinge (default 0.02). */
  b?: number
  /** Elastic hinge stiffness as a multiple of EI/L (default 1e4 = effectively rigid). */
  rigidity?: number
  /** Axial capacity for P–M interaction: Py = Fy·A (steel) or Pn0 (concrete), kN.
   *  Supply with `pmKind` to reduce the hinge capacity to Mpc(P); omit to keep
   *  the pure-bending Mp (unconservative for columns carrying real axial load). */
  Pcap?: number
  /** Which P–M surface to reduce on. Requires `Pcap`. */
  pmKind?: PmKind
}

export type NLSupportType = 'pin' | 'roller' | 'fixed'
export interface NLSupport { node: string; type: NLSupportType }
/** Nodal load; Fx/Fy kN, M kN·m. */
export interface NLLoad { node: string; Fx?: number; Fy?: number; M?: number }

export interface HingeReport {
  member: string
  end: 'i' | 'j'
  /** Moment carried, kN·m. */
  moment: number
  /** Total rotation across the hinge, rad. */
  rotation: number
  /** Plastic (permanent) rotation, rad. */
  plastic: number
  yielded: boolean
  /** Energy dissipated at this hinge, kN·m. */
  dissipated: number
}

export interface NLFrameStep {
  /** Load factor λ applied to the reference load set. */
  lambda: number
  /** Control-node displacement in the control direction, m. */
  disp: number
  /** Total applied load in the control direction, kN. */
  load: number
  /** Number of hinges yielded at this step. */
  hinges: number
  converged: boolean
  iterations: number
}

export interface NLFrameResult {
  steps: NLFrameStep[]
  hinges: HingeReport[]
  /** Displacement vector at the final step (global DOF order). */
  d: number[]
  totalDissipated: number
  converged: boolean
  /** True when the tangent went singular — a collapse mechanism formed. */
  mechanism: boolean
}

export interface NLFrameInput {
  nodes: NLNode[]
  members: NLMember[]
  supports: NLSupport[]
  /** Reference load set; scaled by the load factor λ. */
  loads: NLLoad[]
  /** Node whose displacement is reported on the capacity curve. */
  controlNode: string
  /** Control direction: 'x' or 'y'. */
  controlDir?: 'x' | 'y'
  /** λ values to march through — monotonic OR cyclic (may decrease / reverse). */
  schedule?: number[]
  /** Number of equal increments to λmax when `schedule` is omitted (default 60). */
  steps?: number
  /** Maximum λ for the default monotonic schedule (default 3). */
  lambdaMax?: number
  tol?: number
  maxIter?: number
}

const DOF_PER_NODE = 3   // u, v, θ

/** Flexural + axial stiffness of a plane-frame element, local 6×6. */
function localK(EA: number, EI: number, L: number): number[][] {
  const k: number[][] = Array.from({ length: 6 }, () => new Array(6).fill(0))
  const a = EA / L
  k[0][0] = a; k[0][3] = -a; k[3][0] = -a; k[3][3] = a
  const c1 = 12 * EI / L ** 3, c2 = 6 * EI / L ** 2, c3 = 4 * EI / L, c4 = 2 * EI / L
  const idx = [1, 2, 4, 5]
  const kf = [
    [c1, c2, -c1, c2],
    [c2, c3, -c2, c4],
    [-c1, -c2, c1, -c2],
    [c2, c4, -c2, c3],
  ]
  for (let r = 0; r < 4; r++) for (let s = 0; s < 4; s++) k[idx[r]][idx[s]] = kf[r][s]
  return k
}

/**
 * Nonlinear plane-frame analysis with concentrated member-end plastic hinges.
 * Marches the load factor through `schedule` (or a monotonic ramp), running
 * Newton-Raphson at each step, and reports the capacity curve plus per-hinge
 * state. Returns null for a degenerate model.
 */
/** Per-hinge state carried between solves. */
export interface FrameHinge {
  member: string; end: 'i' | 'j'
  /** The node's own θ DOF. */
  nodeRotDof: number
  /** The extra beam-end rotation DOF introduced for this hinge. */
  beamRotDof: number
  /** Elastic (penalty) hinge stiffness, kN·m/rad. */
  k0: number
  Mp: number
  /** Post-yield ratio already scaled onto k0. */
  b: number
  state: BilinearState
}

export interface FrameAssembly {
  nodeIdx: Map<string, number>
  hinges: FrameHinge[]
  fpos: Map<number, number>
  nf: number
  /** Constant elastic beam stiffness on the free DOFs. */
  Kbeam: number[][]
  /** Reference load vector on the free DOFs. */
  Pref: number[]
  hingeDeform: (d: number[], h: FrameHinge) => number
  hingeContrib: (d: number[]) => { fs: number[]; Kh: number[][] }
  /** Axial force in a P–M-tracked member at the current state, kN (+tension). */
  axialForce: (d: number[], memberId: string) => number
  /** Hinge yield moment at the current state — Mpc(P) when P–M is supplied. */
  hingeCapacity: (d: number[], h: FrameHinge) => number
}

/**
 * Assemble the frame once — DOF map (3 per node plus one extra rotation per
 * HINGED member end), the constant elastic beam stiffness, the reference load
 * vector and the hinge closures. Shared by the static (load-control) and the
 * dynamic (Newmark) drivers so both see identical geometry and hinge state.
 */
export function assembleFrame(inp: NLFrameInput): FrameAssembly | null {
  const { nodes, members, supports, loads } = inp
  if (nodes.length === 0 || members.length === 0) return null
  const nodeIdx = new Map(nodes.map((n, i) => [n.id, i]))
  const nm = new Map(nodes.map((n) => [n.id, n]))

  // ── DOF map: 3 per node, then one extra rotation per HINGED member end ──
  let ndof = nodes.length * DOF_PER_NODE
  type Hinge = FrameHinge
  const hinges: Hinge[] = []
  /** member id → [rot DOF used at end i, at end j] */
  const beamRot = new Map<string, [number, number]>()

  const geom = members.map((m) => {
    const a = nm.get(m.i), b = nm.get(m.j)
    if (!a || !b) return null
    const dx = b.x - a.x, dy = b.y - a.y
    const L = Math.hypot(dx, dy)
    if (!(L > 0)) return null
    const EI = (m.E * m.I) / 1e9    // MPa·mm⁴ → kN·m²
    const EA = (m.E * m.A) / 1e3    // MPa·mm² → kN
    return { m, a, b, L, c: dx / L, s: dy / L, EI, EA }
  })
  if (geom.some((g) => g === null)) return null

  for (const g of geom) {
    const { m, L, EI } = g!
    const Mp = m.Mp ?? Infinity
    const ia = nodeIdx.get(m.i)!, ib = nodeIdx.get(m.j)!
    const rot: [number, number] = [ia * 3 + 2, ib * 3 + 2]
    if (Number.isFinite(Mp)) {
      const kH = (m.rigidity ?? 1e4) * (EI / L)
      // `b` is the post-yield stiffness the user wants AS A FRACTION OF THE
      // MEMBER (EI/L). The hinge's own k0 is an artificial penalty stiffness, so
      // scale b onto it: b_eff·kH = b·(EI/L). Using b directly would leave a
      // "2% hardening" hinge at 200·EI/L — i.e. barely yielding at all.
      const bEff = ((m.b ?? 0.02) * (EI / L)) / kH
      for (const [k, end] of [[0, 'i'], [1, 'j']] as const) {
        const beamDof = ndof++
        hinges.push({
          member: m.id, end, nodeRotDof: rot[k], beamRotDof: beamDof,
          k0: kH, Mp, b: bEff, state: newBilinearState(),
        })
        rot[k] = beamDof
      }
    }
    beamRot.set(m.id, rot)
  }

  // ── restrained DOFs ──
  const fixed = new Set<number>()
  for (const s of supports) {
    const i = nodeIdx.get(s.node)
    if (i === undefined) continue
    if (s.type !== 'roller') fixed.add(i * 3)   // u  (a vertical roller slides in x)
    fixed.add(i * 3 + 1)                        // v  (all three restrain vertical)
    if (s.type === 'fixed') fixed.add(i * 3 + 2)
  }

  const free = Array.from({ length: ndof }, (_, i) => i).filter((i) => !fixed.has(i))
  const fpos = new Map(free.map((g, i) => [g, i]))
  const nf = free.length
  if (nf === 0) return null

  /** Elastic (constant) part of the tangent: the beam elements. */
  const Kbeam: number[][] = Array.from({ length: nf }, () => new Array(nf).fill(0))
  const memberDofs = new Map<string, number[]>()
  /** member id → data to recover its axial force (only for P–M members) */
  const axialOf = new Map<string, { dofs: number[]; EA: number; L: number; c: number; s: number }>()
  const pmOf = new Map(members.filter((m) => m.Pcap != null && m.pmKind)
    .map((m) => [m.id, { Pcap: m.Pcap!, kind: m.pmKind! }]))
  for (const g of geom) {
    const { m, L, c, s, EI, EA } = g!
    const ia = nodeIdx.get(m.i)!, ib = nodeIdx.get(m.j)!
    const rot = beamRot.get(m.id)!
    const dofs = [ia * 3, ia * 3 + 1, rot[0], ib * 3, ib * 3 + 1, rot[1]]
    memberDofs.set(m.id, dofs)
    // axial-force recovery data: N = EA/L · (Δu · axis), used for P–M interaction
    if (m.Pcap != null && m.pmKind) axialOf.set(m.id, { dofs, EA, L, c, s })
    const kl = localK(EA, EI, L)
    // rotation matrix (rotations are invariant in-plane)
    const T = [
      [c, s, 0, 0, 0, 0], [-s, c, 0, 0, 0, 0], [0, 0, 1, 0, 0, 0],
      [0, 0, 0, c, s, 0], [0, 0, 0, -s, c, 0], [0, 0, 0, 0, 0, 1],
    ]
    // kg = Tᵀ kl T
    const kT: number[][] = Array.from({ length: 6 }, () => new Array(6).fill(0))
    for (let r = 0; r < 6; r++) for (let q = 0; q < 6; q++) {
      let v = 0
      for (let t = 0; t < 6; t++) v += kl[r][t] * T[t][q]
      kT[r][q] = v
    }
    for (let r = 0; r < 6; r++) for (let q = 0; q < 6; q++) {
      let v = 0
      for (let t = 0; t < 6; t++) v += T[t][r] * kT[t][q]
      const A = fpos.get(dofs[r]), B = fpos.get(dofs[q])
      if (A !== undefined && B !== undefined) Kbeam[A][B] += v
    }
  }

  /** Reference load vector (free DOFs). */
  const Pref = new Array(nf).fill(0)
  for (const l of loads) {
    const i = nodeIdx.get(l.node)
    if (i === undefined) continue
    const put = (g: number, val: number) => {
      const p = fpos.get(g)
      if (p !== undefined) Pref[p] += val
    }
    if (l.Fx) put(i * 3, l.Fx)
    if (l.Fy) put(i * 3 + 1, l.Fy)
    if (l.M) put(i * 3 + 2, l.M)
  }

  const hingeDeform = (d: number[], h: Hinge): number => {
    const a = fpos.get(h.nodeRotDof), b = fpos.get(h.beamRotDof)
    return (a !== undefined ? d[a] : 0) - (b !== undefined ? d[b] : 0)
  }

  /** Internal force + tangent contribution of the hinge springs. */
  /** Current axial force in a member, kN (+tension). 0 when not tracked. */
  const axialForce = (d: number[], memberId: string): number => {
    const g = axialOf.get(memberId)
    if (!g) return 0
    const get = (dof: number) => { const p = fpos.get(dof); return p !== undefined ? d[p] : 0 }
    // relative displacement of the two ends, projected on the member axis
    const du = get(g.dofs[3]) - get(g.dofs[0])
    const dv = get(g.dofs[4]) - get(g.dofs[1])
    return (g.EA / g.L) * (du * g.c + dv * g.s)
  }

  /** Hinge yield moment, reduced by P–M interaction when the member supplies it. */
  const hingeCapacity = (d: number[], h: Hinge): number => {
    const pm = pmOf.get(h.member)
    if (!pm) return h.Mp
    return reducedPlasticMoment(h.Mp, axialForce(d, h.member), pm.Pcap, pm.kind)
  }

  const hingeContrib = (d: number[]) => {
    const fs = new Array(nf).fill(0)
    const Kh: number[][] = Array.from({ length: nf }, () => new Array(nf).fill(0))
    for (const h of hinges) {
      const θ = hingeDeform(d, h)
      const { f: M, kt } = bilinearProbe(θ, h.state, { k0: h.k0, Fy: hingeCapacity(d, h), b: h.b })
      const a = fpos.get(h.nodeRotDof), b = fpos.get(h.beamRotDof)
      if (a !== undefined) { fs[a] += M; Kh[a][a] += kt }
      if (b !== undefined) { fs[b] -= M; Kh[b][b] += kt }
      if (a !== undefined && b !== undefined) { Kh[a][b] -= kt; Kh[b][a] -= kt }
    }
    return { fs, Kh }
  }

  return { nodeIdx, hinges, fpos, nf, Kbeam, Pref, hingeDeform, hingeContrib, axialForce, hingeCapacity }
}

export function nonlinearFrame(inp: NLFrameInput): NLFrameResult | null {
  const asm = assembleFrame(inp)
  if (!asm) return null
  const { nodeIdx, hinges, fpos, nf, Kbeam, Pref, hingeDeform, hingeContrib, hingeCapacity } = asm
  const tol = inp.tol ?? 1e-9
  const maxIter = inp.maxIter ?? 40
  const ctrlDir = inp.controlDir ?? 'x'
  const schedule = inp.schedule
    ?? Array.from({ length: inp.steps ?? 60 }, (_, i) => ((i + 1) * (inp.lambdaMax ?? 3)) / (inp.steps ?? 60))

  let d = new Array(nf).fill(0)
  let dPrev = new Array(nf).fill(0)
  const steps: NLFrameStep[] = []
  let mechanism = false, allConverged = true

  const ctrlIdx = (() => {
    const i = nodeIdx.get(inp.controlNode)
    if (i === undefined) return undefined
    return fpos.get(i * 3 + (ctrlDir === 'x' ? 0 : 1))
  })()

  for (const lambda of schedule) {
    let it = 0, ok = false
    for (; it < maxIter; it++) {
      const { fs, Kh } = hingeContrib(d)
      // residual R = λ·Pref − (Kbeam·d + f_hinge)
      const R = new Array(nf).fill(0)
      for (let r = 0; r < nf; r++) {
        let kd = 0
        for (let q = 0; q < nf; q++) kd += Kbeam[r][q] * d[q]
        R[r] = lambda * Pref[r] - kd - fs[r]
      }
      const Kt: number[][] = Array.from({ length: nf }, (_, r) => {
        const row = new Array<number>(nf)
        for (let q = 0; q < nf; q++) row[q] = Kbeam[r][q] + Kh[r][q]
        return row
      })
      const lu = luFactor(Kt)
      if (!lu) { mechanism = true; break }
      const du = luSolve(lu, R)
      let dn = 0, dnorm = 0
      for (let r = 0; r < nf; r++) { d[r] += du[r]; dn += du[r] * du[r]; dnorm += d[r] * d[r] }
      if (Math.sqrt(dn) / Math.max(1, Math.sqrt(dnorm)) <= tol) { it++; ok = true; break }
    }
    if (mechanism) break
    if (!ok) allConverged = false

    // commit hinge plastic state
    let yielded = 0
    for (const h of hinges) {
      const θ = hingeDeform(d, h), θp = hingeDeform(dPrev, h)
      const { resp, state } = bilinearCommit(θ, θp, h.state, { k0: h.k0, Fy: hingeCapacity(d, h), b: h.b })
      h.state = state
      if (resp.yielding) yielded++
    }
    dPrev = [...d]

    steps.push({
      lambda,
      disp: ctrlIdx !== undefined ? d[ctrlIdx] : 0,
      load: lambda * (ctrlIdx !== undefined ? Pref[ctrlIdx] : 0),
      hinges: yielded, converged: ok, iterations: it,
    })
  }

  const report: HingeReport[] = hinges.map((h) => {
    const θ = hingeDeform(d, h)
    const { f: M, yielding } = bilinearProbe(θ, h.state, { k0: h.k0, Fy: hingeCapacity(d, h), b: h.b })
    return {
      member: h.member, end: h.end, moment: M, rotation: θ,
      plastic: h.state.up, yielded: yielding || h.state.cumPlastic > 0,
      dissipated: h.state.dissipated,
    }
  })

  return {
    steps, hinges: report, d,
    totalDissipated: report.reduce((s, h) => s + h.dissipated, 0),
    converged: allConverged, mechanism,
  }
}
