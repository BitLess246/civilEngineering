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
// Model scope (first cut): biaxial moment hinges (independent My/Mz capacity Mp),
// no axial/shear hinge and no P–M interaction — documented future work.
// Units: Mp in kN·m; pattern forces kN; base shear kN; displacement m.
// ─────────────────────────────────────────────────────────────────────────
import {
  precomputeFrame, solveWithGeometry,
  type F3Node, type F3Member, type F3Support, type F3Load,
} from './frame3d'

export interface PushoverInput {
  nodes: F3Node[]
  members: F3Member[]
  supports: F3Support[]
  /** Plastic moment capacity per member (same for My and Mz), kN·m. Members not
   *  listed stay elastic (never hinge). Use `MpByEnd` for per-end/per-axis control. */
  Mp: Record<string, number>
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
  newHinge: { member: string; end: 'i' | 'j'; axis: 'y' | 'z' } | null
  /** Total number of hinges after this step. */
  numHinges: number
}

export interface PushoverResult {
  curve: PushoverStep[]
  /** True when the analysis stopped because a collapse mechanism formed. */
  mechanism: boolean
  /** Every hinge formed, in order. */
  hinges: { member: string; end: 'i' | 'j'; axis: 'y' | 'z'; event: number }[]
}

interface Slot {
  mi: number            // member index
  member: string
  end: 'i' | 'j'
  axis: 'y' | 'z'
  relEnd: 'I' | 'J'     // which release array
  relDof: 4 | 5         // local DOF: 4 = θy (My), 5 = θz (Mz)
  Mp: number
  Mcur: number          // current total moment, kN·m
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

  // one moment-hinge slot per (member end, bending axis) that has an Mp
  const slots: Slot[] = []
  input.members.forEach((m, mi) => {
    const Mp = input.Mp[m.id]
    if (Mp === undefined || Mp <= 0) return
    for (const end of ['i', 'j'] as const)
      for (const axis of ['y', 'z'] as const)
        slots.push({
          mi, member: m.id, end, axis,
          relEnd: end === 'i' ? 'I' : 'J',
          relDof: axis === 'y' ? 4 : 5,
          Mp, Mcur: 0, hinged: false,
        })
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

    // incremental moment per unit λ at each slot's end/axis
    const momAt = (s: Slot): number => {
      const mr = res.members[s.mi]
      const arr = s.axis === 'y' ? mr.My : mr.Mz
      return s.end === 'i' ? arr[0] : arr[arr.length - 1]
    }
    const dRoof = ctrlIdx >= 0 ? res.d[6 * ctrlIdx + dir] : 0

    // smallest positive Δλ that drives a free end to ±Mp
    let dLam = Infinity
    let crit: Slot | null = null
    for (const s of slots) {
      if (s.hinged) continue
      const dM = momAt(s)
      if (Math.abs(dM) < TOL) continue
      const target = dM > 0 ? s.Mp : -s.Mp
      const dl = (target - s.Mcur) / dM
      if (dl > TOL && dl < dLam) { dLam = dl; crit = s }
    }
    if (!crit || !isFinite(dLam)) { mechanism = true; break }   // no further events → mechanism

    // advance cumulative state by Δλ
    lambda += dLam
    roofDisp += dRoof * dLam
    for (const s of slots) if (!s.hinged) s.Mcur += momAt(s) * dLam
    crit.hinged = true
    crit.Mcur = crit.Mp * Math.sign(crit.Mcur || 1)   // clamp exactly to ±Mp

    const numHinges = slots.filter((s) => s.hinged).length
    hingesOut.push({ member: crit.member, end: crit.end, axis: crit.axis, event })
    curve.push({
      event, lambda, baseShear: lambda * Vref, roofDisp,
      newHinge: { member: crit.member, end: crit.end, axis: crit.axis }, numHinges,
    })

    if (input.targetDisp !== undefined && Math.abs(roofDisp) >= Math.abs(input.targetDisp)) break
  }

  return { curve, mechanism, hinges: hingesOut }
}
