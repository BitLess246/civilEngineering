// ─────────────────────────────────────────────────────────────────────────
// Nonlinear static (pushover) analysis — Tier 3 #12.
//
// Concentrated-plasticity (lumped plastic hinge) model solved by the classic
// EVENT-TO-EVENT method. A plastic hinge at a member end is a moment release
// (frame3d already condenses released DOFs), so the analysis is a sequence of
// linear solves on a progressively softened structure:
//
//   1. Solve the current structure under the reference lateral pattern (λ = 1).
//   2. Each not-yet-hinged end accrues moment dM per unit λ. Find the smallest
//      load increment Δλ that drives some end to ±Mp — the next "event".
//   3. Advance λ, the cumulative end moments, base shear and roof displacement
//      by Δλ; insert a hinge (release) at that end. Its total moment is frozen
//      at ±Mp — subsequent increments add zero moment there (released DOF), so
//      no external moment injection is needed.
//   4. Repeat until a mechanism forms (singular tangent / no positive event) or
//      a target roof displacement is reached.
//
// The result is the capacity (pushover) curve: base shear V vs. control-node
// displacement Δ, piecewise-linear with a break at each hinge event. With
// geometry linear this matches rigid-plastic limit analysis (collapse load).
//
// Model scope: biaxial moment hinges (independent My/Mz capacity Mp) with
// optional P–M interaction (reduced plastic moment Mpc(P), see `pm`), plus
// AXIAL hinges (capacity Pp) and SHEAR hinges (capacity Vp, per local axis) for
// brace / link-beam pushover models. Each hinge is a release of the matching
// local DOF: axial → Fx, shear → Fy/Fz, moment → My/Mz; once formed the force
// at that DOF is frozen at its capacity. Axial/shear forces are constant along
// a member under nodal pattern loads, so one hinge per member (axis) suffices.
// Units: Mp in kN·m; Pp/Vp/pattern/base shear in kN; displacement m.
// ─────────────────────────────────────────────────────────────────────────
import {
  precomputeFrame, solveWithGeometry,
  type F3Node, type F3Member, type F3Support, type F3Load,
} from './frame3d'
import { reducedPlasticMoment, type PmKind } from './pmInteraction'

export interface PushoverInput {
  nodes: F3Node[]
  members: F3Member[]
  supports: F3Support[]
  /** Plastic moment capacity per member (same for My and Mz), kN·m. Members not
   *  listed stay elastic (never hinge). Use `MpByEnd` for per-end/per-axis control. */
  Mp: Record<string, number>
  /** Axial plastic capacity per member, kN (tension = compression). A member
   *  forms an AXIAL hinge — a release of the local Fx DOF — when |N| reaches Pp,
   *  freezing the axial force at ±Pp. Useful for brace yielding/buckling. */
  Pp?: Record<string, number>
  /** Shear plastic capacity per member, kN. A SHEAR hinge releases the local
   *  Fy (axis 'y') or Fz (axis 'z') DOF when |V| reaches Vp. A single number caps
   *  both shear axes; pass `{ y, z }` for independent per-axis capacities. */
  Vp?: Record<string, number | { y?: number; z?: number }>
  /** Optional P–M interaction data per member. When present, a MOMENT hinge yields
   *  at the reduced plastic moment Mpc(P) instead of the pure-bending Mp, where P is
   *  the member's current axial force. `Pcap` = Py = Fy·A (steel) or Pn0 (concrete);
   *  `kind` selects the interaction surface. Members absent here keep the pure Mp. */
  pm?: Record<string, { Pcap: number; kind: 'steel' | 'concrete' }>
  /** Lateral load pattern: node id → reference force in the push direction, kN. */
  pattern: Record<string, number>
  /** Push / control direction: 0 = X (default), 1 = Y, 2 = Z. */
  dir?: 0 | 1 | 2
  /** Control ("roof") node whose displacement forms the capacity curve. */
  controlNode: string
  /** Stop once the control displacement reaches this value (m). Optional. */
  targetDisp?: number
  /** Maximum number of hinge events before stopping (default 100). */
  maxEvents?: number
}

/** Hinge mode: plastic moment, axial yield, or shear yield. */
export type HingeType = 'moment' | 'axial' | 'shear'

/** A hinge location: member end + mode (+ axis for moment/shear; axial has none). */
export interface HingeId { member: string; end: 'i' | 'j'; type: HingeType; axis?: 'y' | 'z' }

export interface PushoverStep {
  /** Event index (0 = origin). */
  event: number
  /** Cumulative reference-load factor. */
  lambda: number
  /** Base shear in the push direction, kN. */
  baseShear: number
  /** Control-node displacement in the push direction, m. */
  roofDisp: number
  /** Hinge that formed at this step (null at the origin). */
  newHinge: HingeId | null
  /** Total number of hinges after this step. */
  numHinges: number
}

export interface PushoverResult {
  curve: PushoverStep[]
  /** True when the analysis stopped because a collapse mechanism formed. */
  mechanism: boolean
  /** Every hinge formed, in order. `axial`/`Mpc` are populated for moment hinges
   *  with P–M interaction (the axial force and reduced moment capacity at yield). */
  hinges: (HingeId & { event: number; axial?: number; Mpc?: number })[]
}

interface Slot {
  mi: number            // member index
  member: string
  end: 'i' | 'j'
  type: HingeType
  axis?: 'y' | 'z'      // moment/shear axis; undefined for axial
  relEnd: 'I' | 'J'     // which release array
  relDof: 0 | 1 | 2 | 4 | 5  // local DOF: 0 Fx, 1 Fy, 2 Fz, 4 My, 5 Mz
  cap: number           // capacity: Mp (kN·m) / Pp / Vp (kN)
  Fcur: number          // current force in the controlled DOF (moment/axial/shear)
  Ncur: number          // current axial force, kN (moment P–M only)
  pmKind?: PmKind       // interaction surface (moment only; undefined → none)
  Pcap: number          // axial capacity Py/Pn0, kN (0 → no interaction)
  hinged: boolean
}

/** Nonlinear static pushover by the event-to-event plastic-hinge method. */
export function pushoverAnalysis(input: PushoverInput): PushoverResult {
  const dir = input.dir ?? 0
  const maxEvents = input.maxEvents ?? 100
  const TOL = 1e-9

  // reference base shear = Σ pattern (equilibrium: applied lateral = base shear)
  const Vref = Object.values(input.pattern).reduce((s, v) => s + v, 0)

  const curve: PushoverStep[] = [
    { event: 0, lambda: 0, baseShear: 0, roofDisp: 0, newHinge: null, numHinges: 0 },
  ]
  const hingesOut: PushoverResult['hinges'] = []
  if (Vref === 0 || input.members.length === 0) return { curve, mechanism: false, hinges: hingesOut }

  // Build the hinge slots: moment hinges per (end, bending axis) with an Mp,
  // plus optional axial / shear hinges (constant force ⇒ one slot per axis, end i).
  const slots: Slot[] = []
  input.members.forEach((m, mi) => {
    const Mp = input.Mp[m.id]
    const pmInfo = input.pm?.[m.id]
    if (Mp !== undefined && Mp > 0)
      for (const end of ['i', 'j'] as const)
        for (const axis of ['y', 'z'] as const) {
          // axis 'z' = Mz (major/strong axis), axis 'y' = My (minor/weak axis)
          const pmKind: PmKind | undefined = pmInfo
            ? (pmInfo.kind === 'steel' ? (axis === 'z' ? 'steel-strong' : 'steel-weak') : 'concrete')
            : undefined
          slots.push({
            mi, member: m.id, end, type: 'moment', axis,
            relEnd: end === 'i' ? 'I' : 'J', relDof: axis === 'y' ? 4 : 5,
            cap: Mp, Fcur: 0, Ncur: 0, pmKind, Pcap: pmInfo?.Pcap ?? 0, hinged: false,
          })
        }

    // Axial hinge — release local Fx (DOF 0) at end i when |N| reaches Pp.
    const Pp = input.Pp?.[m.id]
    if (Pp !== undefined && Pp > 0)
      slots.push({
        mi, member: m.id, end: 'i', type: 'axial',
        relEnd: 'I', relDof: 0, cap: Pp, Fcur: 0, Ncur: 0, Pcap: 0, hinged: false,
      })

    // Shear hinges — release local Fy/Fz (DOF 1/2) at end i when |V| reaches Vp.
    const Vraw = input.Vp?.[m.id]
    if (Vraw !== undefined)
      for (const axis of ['y', 'z'] as const) {
        const Vp = typeof Vraw === 'number' ? Vraw : Vraw[axis]
        if (Vp === undefined || Vp <= 0) continue
        slots.push({
          mi, member: m.id, end: 'i', type: 'shear', axis,
          relEnd: 'I', relDof: axis === 'y' ? 1 : 2, cap: Vp, Fcur: 0, Ncur: 0, Pcap: 0, hinged: false,
        })
      }
  })
  // No hinge capacity defined → the structure stays elastic (never yields).
  if (slots.length === 0) return { curve, mechanism: false, hinges: hingesOut }

  const loadFor = (node: string, f: number): F3Load => ({
    kind: 'node', node,
    Fx: dir === 0 ? f : 0, Fy: dir === 1 ? f : 0, Fz: dir === 2 ? f : 0,
    cat: 'E',
  })
  const refLoads: F3Load[] = Object.entries(input.pattern)
    .filter(([, f]) => Math.abs(f) > TOL)
    .map(([node, f]) => loadFor(node, f))

  const ctrlIdx = input.nodes.findIndex((n) => n.id === input.controlNode)

  let lambda = 0, roofDisp = 0
  let mechanism = false
  let dmax0 = 0   // elastic peak |displacement| baseline, for mechanism detection

  for (let event = 1; event <= maxEvents; event++) {
    // build members carrying the current releases (formed hinges)
    const members: F3Member[] = input.members.map((m) => {
      const relI = (m.relI ? [...m.relI] : [false, false, false, false, false, false]) as F3Member['relI']
      const relJ = (m.relJ ? [...m.relJ] : [false, false, false, false, false, false]) as F3Member['relJ']
      return { ...m, relI, relJ }
    })
    for (const s of slots) {
      if (!s.hinged) continue
      const rel = s.relEnd === 'I' ? members[s.mi].relI! : members[s.mi].relJ!
      rel[s.relDof] = true
    }

    const precomp = precomputeFrame(input.nodes, members, input.supports)
    const res = solveWithGeometry(precomp, refLoads)
    if (!res) { mechanism = true; break }   // singular tangent → mechanism

    // Mechanism guard: luFactor's pivot tolerance can let a near-singular
    // (mechanism) matrix through, returning astronomically large displacements.
    // The elastic solve sets the baseline; a blow-up of >1e8× means a mechanism.
    const curMax = res.d.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    if (event === 1) dmax0 = curMax
    else if (dmax0 > 0 && curMax > dmax0 * 1e8) { mechanism = true; break }

    // incremental force per unit λ in the slot's controlled DOF (moment kN·m,
    // axial kN, or shear kN, read at the slot's member end).
    const forceAt = (s: Slot): number => {
      const mr = res.members[s.mi]
      const arr = s.type === 'axial' ? mr.N
        : s.type === 'shear' ? (s.axis === 'y' ? mr.Vy : mr.Vz)
          : (s.axis === 'y' ? mr.My : mr.Mz)
      return s.end === 'i' ? arr[0] : arr[arr.length - 1]
    }
    // incremental axial per unit λ (compression negative, per frame3d sign);
    // drives the moment P–M capacity reduction. Axial ~constant along a member.
    const axialAt = (s: Slot): number => {
      const arr = res.members[s.mi].N
      return s.end === 'i' ? arr[0] : arr[arr.length - 1]
    }
    // capacity at a given axial force: reduced plastic moment for P–M moment
    // hinges, otherwise the constant cap (pure Mp, or Pp / Vp for axial/shear).
    const capAt = (s: Slot, N: number): number =>
      s.type === 'moment' && s.pmKind ? reducedPlasticMoment(s.cap, N, s.Pcap, s.pmKind) : s.cap
    const dRoof = ctrlIdx >= 0 ? res.d[6 * ctrlIdx + dir] : 0

    // smallest positive Δλ that drives a free slot to ±cap. With P–M active the
    // moment capacity moves as axial grows, so estimate Δλ at the current axial,
    // then refine once at the projected axial (one fixed-point pass — exact for
    // the linear steel/concrete chords, close for the quadratic weak-axis surface).
    let dLam = Infinity
    let crit: Slot | null = null
    for (const s of slots) {
      if (s.hinged) continue
      const dF = forceAt(s)
      if (Math.abs(dF) < TOL) continue
      let cap = capAt(s, s.Ncur)
      let dl = ((dF > 0 ? cap : -cap) - s.Fcur) / dF
      if (s.type === 'moment' && s.pmKind && dl > TOL && isFinite(dl)) {
        cap = capAt(s, s.Ncur + axialAt(s) * dl)
        dl = ((dF > 0 ? cap : -cap) - s.Fcur) / dF
      }
      if (dl > TOL && dl < dLam) { dLam = dl; crit = s }
    }
    if (!crit || !isFinite(dLam)) { mechanism = true; break }   // no further events → mechanism

    // advance cumulative state by Δλ
    lambda += dLam
    roofDisp += dRoof * dLam
    for (const s of slots) if (!s.hinged) { s.Fcur += forceAt(s) * dLam; s.Ncur += axialAt(s) * dLam }
    crit.hinged = true
    const critCap = capAt(crit, crit.Ncur)
    crit.Fcur = critCap * Math.sign(crit.Fcur || 1)   // clamp exactly to ±cap

    const numHinges = slots.filter((s) => s.hinged).length
    const hingeId: HingeId = { member: crit.member, end: crit.end, type: crit.type, ...(crit.axis ? { axis: crit.axis } : {}) }
    hingesOut.push({
      ...hingeId, event,
      ...(crit.type === 'moment' && crit.pmKind ? { axial: crit.Ncur, Mpc: critCap } : {}),
    })
    curve.push({
      event, lambda, baseShear: lambda * Vref, roofDisp,
      newHinge: hingeId, numHinges,
    })

    if (input.targetDisp !== undefined && Math.abs(roofDisp) >= Math.abs(input.targetDisp)) break
  }

  return { curve, mechanism, hinges: hingesOut }
}
