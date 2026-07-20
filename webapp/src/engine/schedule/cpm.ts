// ─────────────────────────────────────────────────────────────────────────
// Critical Path Method (CPM) engine.
//
// Solves an activity-on-node (AON) precedence network on the abstract
// working-day axis (offset 0 = project start). Supports all four precedence
// relations (FS/FF/SS/SF) with lead/lag, multiple predecessors/successors and
// milestones (zero-duration activities). Detects circular dependencies.
//
// Algorithm (standard CPM, exact — no heuristics):
//   1. Topological order via Kahn's algorithm (cycle ⇒ ScheduleCycleError).
//   2. Forward pass  → Early Start (ES), Early Finish (EF = ES + d).
//   3. Backward pass → Late Finish (LF), Late Start (LS = LF − d).
//   4. Total Float TF = LS − ES = LF − EF;  Free Float FF from successor gaps.
//   5. Critical activities: TF ≤ ε.
//
// Relation lower bounds used in the forward pass (Q successor of P, lag L):
//   FS: ES(Q) ≥ EF(P) + L        FF: EF(Q) ≥ EF(P) + L
//   SS: ES(Q) ≥ ES(P) + L        SF: EF(Q) ≥ ES(P) + L
// and their duals in the backward pass. See the per-branch comments below.
// ─────────────────────────────────────────────────────────────────────────

import type { Dependency, RelationType } from './model'

/** Minimal activity shape the CPM engine needs; the full `Activity` satisfies it. */
export interface CpmActivityInput {
  id: string
  /** Duration in working units (0 = milestone). */
  duration: number
  predecessors?: Dependency[]
}

/** Per-activity CPM result on the working-day axis. */
export interface CpmActivity {
  id: string
  duration: number
  es: number
  ef: number
  ls: number
  lf: number
  totalFloat: number
  freeFloat: number
  critical: boolean
}

export interface CpmResult {
  activities: Map<string, CpmActivity>
  /** Topological order used for the passes. */
  order: string[]
  /** Project duration = max EF (working units). */
  duration: number
  /** Imposed or computed project finish used for the backward pass. */
  finish: number
  /** Critical activities ordered by early start. */
  criticalPath: string[]
}

export interface CpmOptions {
  /**
   * Imposed project finish (working units) for the backward pass. Defaults to
   * the computed project duration (max EF). A value tighter than the computed
   * duration drives total floats negative (an infeasible / accelerated target).
   */
  imposedFinish?: number
  /** Float tolerance for the critical test (default 1e-6). */
  epsilon?: number
}

/** Thrown by `computeCPM`/`topoOrder` when the network contains a cycle. */
export class ScheduleCycleError extends Error {
  cycle: string[]
  constructor(cycle: string[]) {
    super(`Circular dependency detected: ${cycle.join(' → ')}`)
    this.name = 'ScheduleCycleError'
    this.cycle = cycle
  }
}

type Edge = { from: string; to: string; type: RelationType; lag: number }

/** Collect precedence edges (predecessor → successor) from the activities. */
function buildEdges(activities: CpmActivityInput[], ids: Set<string>): Edge[] {
  const edges: Edge[] = []
  for (const a of activities) {
    for (const dep of a.predecessors ?? []) {
      if (!ids.has(dep.predecessor)) {
        throw new Error(`Activity "${a.id}" references unknown predecessor "${dep.predecessor}".`)
      }
      edges.push({ from: dep.predecessor, to: a.id, type: dep.type ?? 'FS', lag: dep.lag ?? 0 })
    }
  }
  return edges
}

/**
 * Return a cycle as an ordered id list if the precedence graph has one, else
 * null. Uses DFS colouring and reconstructs the offending loop.
 */
export function findCycle(activities: CpmActivityInput[]): string[] | null {
  const ids = new Set(activities.map((a) => a.id))
  const succ = new Map<string, string[]>()
  for (const a of activities) succ.set(a.id, [])
  for (const e of buildEdges(activities, ids)) succ.get(e.from)!.push(e.to)

  const WHITE = 0, GREY = 1, BLACK = 2
  const color = new Map<string, number>()
  const parent = new Map<string, string | null>()
  for (const id of ids) { color.set(id, WHITE); parent.set(id, null) }

  let cycle: string[] | null = null
  const visit = (u: string): boolean => {
    color.set(u, GREY)
    for (const v of succ.get(u) ?? []) {
      if (cycle) return true
      if (color.get(v) === GREY) {
        // Reconstruct u → … → v back-edge into an ordered loop.
        const path = [v, u]
        let p = parent.get(u)
        while (p && p !== v) { path.push(p); p = parent.get(p) ?? null }
        if (p === v) path.push(v)
        cycle = path.reverse()
        return true
      }
      if (color.get(v) === WHITE) {
        parent.set(v, u)
        if (visit(v)) return true
      }
    }
    color.set(u, BLACK)
    return false
  }
  for (const id of ids) {
    if (color.get(id) === WHITE && visit(id)) break
  }
  return cycle
}

/**
 * Would adding a `predecessor → successor` link close a cycle? Lets the UI
 * reject an illegal dependency before it is committed.
 */
export function wouldCreateCycle(
  activities: CpmActivityInput[],
  successor: string,
  predecessor: string,
): boolean {
  if (successor === predecessor) return true
  const probe: CpmActivityInput[] = activities.map((a) =>
    a.id === successor
      ? { ...a, predecessors: [...(a.predecessors ?? []), { predecessor, type: 'FS', lag: 0 }] }
      : a,
  )
  return findCycle(probe) !== null
}

/** Kahn topological order. Throws `ScheduleCycleError` on a cycle. */
export function topoOrder(activities: CpmActivityInput[]): string[] {
  const ids = new Set(activities.map((a) => a.id))
  const edges = buildEdges(activities, ids)
  const indeg = new Map<string, number>()
  const succ = new Map<string, string[]>()
  for (const a of activities) { indeg.set(a.id, 0); succ.set(a.id, []) }
  for (const e of edges) {
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1)
    succ.get(e.from)!.push(e.to)
  }
  // Seed with zero-in-degree nodes in input order for a stable result.
  const queue = activities.filter((a) => (indeg.get(a.id) ?? 0) === 0).map((a) => a.id)
  const order: string[] = []
  while (queue.length) {
    const u = queue.shift()!
    order.push(u)
    for (const v of succ.get(u) ?? []) {
      const d = (indeg.get(v) ?? 0) - 1
      indeg.set(v, d)
      if (d === 0) queue.push(v)
    }
  }
  if (order.length !== ids.size) {
    const cycle = findCycle(activities) ?? [...ids].filter((id) => (indeg.get(id) ?? 0) > 0)
    throw new ScheduleCycleError(cycle)
  }
  return order
}

/**
 * Run the full CPM solve. Throws `ScheduleCycleError` if the network is cyclic
 * and `Error` if an activity references an unknown predecessor.
 */
export function computeCPM(activities: CpmActivityInput[], opts: CpmOptions = {}): CpmResult {
  const eps = opts.epsilon ?? 1e-6
  const order = topoOrder(activities)
  const byId = new Map(activities.map((a) => [a.id, a]))
  const edges = buildEdges(activities, new Set(byId.keys()))

  // Predecessor and successor incidence, keyed by activity id.
  const preds = new Map<string, Edge[]>()
  const succs = new Map<string, Edge[]>()
  for (const id of byId.keys()) { preds.set(id, []); succs.set(id, []) }
  for (const e of edges) { preds.get(e.to)!.push(e); succs.get(e.from)!.push(e) }

  const es = new Map<string, number>()
  const ef = new Map<string, number>()
  const dur = (id: string) => byId.get(id)!.duration

  // ── Forward pass: ES/EF in topological order ──
  for (const id of order) {
    const d = dur(id)
    let start = 0
    for (const e of preds.get(id)!) {
      const pEs = es.get(e.from)!
      const pEf = ef.get(e.from)!
      let bound = 0
      switch (e.type) {
        case 'FS': bound = pEf + e.lag; break            // ES(Q) ≥ EF(P) + L
        case 'SS': bound = pEs + e.lag; break            // ES(Q) ≥ ES(P) + L
        case 'FF': bound = pEf + e.lag - d; break        // EF(Q) ≥ EF(P) + L
        case 'SF': bound = pEs + e.lag - d; break        // EF(Q) ≥ ES(P) + L
      }
      if (bound > start) start = bound
    }
    if (start < 0) start = 0                             // cannot precede project start
    es.set(id, start)
    ef.set(id, start + d)
  }

  const computedFinish = order.reduce((m, id) => Math.max(m, ef.get(id) ?? 0), 0)
  const finish = opts.imposedFinish ?? computedFinish

  // ── Backward pass: LF/LS in reverse topological order ──
  const lf = new Map<string, number>()
  const ls = new Map<string, number>()
  for (const id of byId.keys()) { lf.set(id, finish); ls.set(id, finish - dur(id)) }

  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i]
    const d = dur(id)
    let latestFinish = finish
    for (const e of succs.get(id)!) {
      const qLs = ls.get(e.to)!
      const qLf = lf.get(e.to)!
      let bound = 0
      switch (e.type) {
        case 'FS': bound = qLs - e.lag; break            // LF(P) ≤ LS(Q) − L
        case 'FF': bound = qLf - e.lag; break            // LF(P) ≤ LF(Q) − L
        case 'SS': bound = qLs - e.lag + d; break        // LS(P) ≤ LS(Q) − L
        case 'SF': bound = qLf - e.lag + d; break        // LS(P) ≤ LF(Q) − L
      }
      if (bound < latestFinish) latestFinish = bound
    }
    lf.set(id, latestFinish)
    ls.set(id, latestFinish - d)
  }

  // ── Floats + critical flag ──
  const result = new Map<string, CpmActivity>()
  for (const id of byId.keys()) {
    const d = dur(id)
    const aEs = es.get(id)!, aEf = ef.get(id)!, aLs = ls.get(id)!, aLf = lf.get(id)!
    const totalFloat = aLs - aEs

    // Free float = the slip absorbed before any successor's early start moves;
    // computed from early dates only (independent of the imposed finish).
    let freeFloat: number
    const outEdges = succs.get(id)!
    if (outEdges.length === 0) {
      freeFloat = computedFinish - aEf                   // terminal: slack to project end
    } else {
      freeFloat = Infinity
      for (const e of outEdges) {
        const qEs = es.get(e.to)!, qEf = ef.get(e.to)!
        let gap = 0
        switch (e.type) {
          case 'FS': gap = qEs - (aEf + e.lag); break
          case 'SS': gap = qEs - (aEs + e.lag); break
          case 'FF': gap = qEf - (aEf + e.lag); break
          case 'SF': gap = qEf - (aEs + e.lag); break
        }
        if (gap < freeFloat) freeFloat = gap
      }
    }
    if (freeFloat < 0) freeFloat = 0

    result.set(id, {
      id, duration: d,
      es: aEs, ef: aEf, ls: aLs, lf: aLf,
      totalFloat, freeFloat,
      critical: totalFloat <= eps,
    })
  }

  const criticalPath = order.filter((id) => result.get(id)!.critical)

  return { activities: result, order, duration: computedFinish, finish, criticalPath }
}
