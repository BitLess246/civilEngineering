// ─────────────────────────────────────────────────────────────────────────
// TENSION-ONLY / COMPRESSION-ONLY members — cross-braces, uplift-only ties,
// contact/bearing struts. Solved by an ACTIVE-SET iteration around the linear
// solver: no change to the 12-DOF element formulation (L3 stays frozen), only
// a driver that decides WHICH members participate in each solve.
//
//   1. Solve with the current active set.
//   2. An active limited member whose axial force violates its mode
//      (tension-only in compression, or vice versa) is DEACTIVATED.
//   3. An inactive limited member whose end-node relative displacement implies
//      an allowed force is RE-ACTIVATED — without this the iteration would
//      latch off and under-predict stiffness on load reversal.
//   4. Repeat until the active set is unchanged (converged) or the cap is hit.
//
// Sign convention follows `F3MemberResult.N`: N > 0 is TENSION.
//
// Because the structure changes between iterations this is a genuinely
// nonlinear problem — superposition does NOT hold, so each load combination
// must be solved on its own active set. Callers must not scale or sum results
// from different combos.
//
// Units: forces kN, displacement m, E MPa, A mm², L m.
// ─────────────────────────────────────────────────────────────────────────
import {
  solveFrame3D,
  type F3Node, type F3Member, type F3Support, type F3Load, type F3Result, type F3Shell,
} from './frame3d'

/** How a member may carry axial force. */
export type AxialMode = 'both' | 'tension-only' | 'compression-only'

export interface ActiveSetOpts {
  /** Axial force below which a member is treated as unstressed, kN. */
  tol?: number
  /** Iteration cap on the active-set search (default 20). */
  maxIter?: number
  pDelta?: boolean
}

export interface ActiveSetResult {
  result: F3Result
  /** Ids of the members switched OFF in the converged state. */
  inactive: string[]
  iterations: number
  /** False when the active set was still oscillating at the cap. */
  converged: boolean
}

/** Unit axis i→j of a member, and its length (m). */
function axisOf(a: F3Node, b: F3Node): { ax: number[]; L: number } {
  const d = [b.x - a.x, b.y - a.y, b.z - a.z]
  const L = Math.hypot(d[0], d[1], d[2]) || 1
  return { ax: [d[0] / L, d[1] / L, d[2] / L], L }
}

/**
 * Solve with tension-only / compression-only members handled by an active-set
 * iteration. `modes` maps member id → mode; members absent from it (or 'both')
 * always participate. Returns null when a solve fails (e.g. deactivating
 * members left the structure singular — a real mechanism, not a numerical
 * quirk, so it is surfaced rather than patched).
 */
export function solveActiveSet(
  nodes: F3Node[], members: F3Member[], supports: F3Support[], loads: F3Load[],
  modes: Map<string, AxialMode>, opts: ActiveSetOpts = {}, shells?: F3Shell[],
): ActiveSetResult | null {
  const tol = opts.tol ?? 1e-6
  const maxIter = opts.maxIter ?? 20
  const limited = members.filter((m) => {
    const md = modes.get(m.id)
    return md === 'tension-only' || md === 'compression-only'
  })
  // no limited members ⇒ one ordinary linear solve
  if (limited.length === 0) {
    const r = solveFrame3D(nodes, members, supports, loads, { pDelta: opts.pDelta }, shells)
    return r ? { result: r, inactive: [], iterations: 1, converged: true } : null
  }

  const nm = new Map(nodes.map((n) => [n.id, n]))
  const pos = new Map(nodes.map((n, i) => [n.id, i]))
  const off = new Set<string>()
  let last: F3Result | null = null

  for (let it = 1; it <= maxIter; it++) {
    const active = members.filter((m) => !off.has(m.id))
    const r = solveFrame3D(nodes, active, supports, loads, { pDelta: opts.pDelta }, shells)
    if (!r) return null
    last = r

    const next = new Set<string>()
    for (const m of limited) {
      const mode = modes.get(m.id)!
      if (!off.has(m.id)) {
        // ACTIVE: read the axial force straight off the solved member
        const mr = r.members.find((x) => x.id === m.id)
        const N = mr ? mr.N[0] : 0
        const bad = mode === 'tension-only' ? N < -tol : N > tol
        if (bad) next.add(m.id)
      } else {
        // INACTIVE: would it now be allowed? Use the axial elongation implied
        // by the current displacement field. e > 0 = elongation = tension.
        const a = nm.get(m.i), b = nm.get(m.j)
        const ia = pos.get(m.i), ib = pos.get(m.j)
        if (!a || !b || ia === undefined || ib === undefined) { next.add(m.id); continue }
        const { ax } = axisOf(a, b)
        let e = 0
        for (let k = 0; k < 3; k++) e += (r.d[6 * ib + k] - r.d[6 * ia + k]) * ax[k]
        const allowed = mode === 'tension-only' ? e > 0 : e < 0
        if (!allowed) next.add(m.id)      // stays off
      }
    }

    const same = next.size === off.size && [...next].every((id) => off.has(id))
    if (same) return { result: r, inactive: [...off].sort(), iterations: it, converged: true }
    off.clear()
    for (const id of next) off.add(id)
  }
  return last
    ? { result: last, inactive: [...off].sort(), iterations: maxIter, converged: false }
    : null
}

/** Collect the axial-mode map from a model's members (skips plain 'both'). */
export function axialModes(members: { id: string; axialMode?: AxialMode }[]): Map<string, AxialMode> {
  const m = new Map<string, AxialMode>()
  for (const x of members) if (x.axialMode && x.axialMode !== 'both') m.set(x.id, x.axialMode)
  return m
}
