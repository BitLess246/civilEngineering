// ─────────────────────────────────────────────────────────────────────────
// SCENE TOKENS — the colours, sets and small geometric helpers the 3D scene is
// drawn from.
//
// Separate from `scene.tsx` because a file that exports components must export
// only components: mixing a constant in breaks Fast Refresh, which is what
// `react-refresh/only-export-components` is telling you. Splitting them is the
// better shape anyway — this is the vocabulary, that is the drawing.
// ─────────────────────────────────────────────────────────────────────────
import * as THREE from 'three'
import { type DiagramComp } from '../../engine/memberDiagram3d'

export const ROLE_COLOR: Record<string, string> = {
  column: '#475569', beam: '#0f4c92', girder: '#0e7490',
}

export const SEL = '#f59e0b'

/**
 * What colour one member is drawn in — role, then material, then how hard it is
 * working, then whether it is the selected one.
 *
 * Shared rather than repeated because the SKELETON has to agree with the solid:
 * a member that is red-tinted as a box has to be red-tinted as a line, or
 * switching to wireframe quietly loses the utilisation reading.
 */
export function memberColor(
  role: string, selected: boolean, tint = 0, material?: string,
): string {
  if (selected) return SEL
  const base = new THREE.Color(ROLE_COLOR[role] ?? '#64748b')
  if (material === 'wood') base.lerp(new THREE.Color('#a86b34'), 0.6)   // timber brown tint
  if (tint > 0) base.lerp(new THREE.Color('#dc2626'), tint)
  return `#${base.getHexString()}`
}

// Load-diagram colours by NSCP category (dead, live, wind, seismic, …).

// Load-diagram colours by NSCP category (dead, live, wind, seismic, …).

// Load-diagram colours by NSCP category (dead, live, wind, seismic, …).
export const LOAD_COLOR: Record<string, string> = {
  D: '#64748b', L: '#15803d', Lr: '#15803d', S: '#0891b2', R: '#0891b2', W: '#0ea5e9', E: '#7c3aed',
}

// ── 3D primitives ─────────────────────────────────────────────────────────
/**
 * How far below the node line a member's concrete (or steel section) hangs, m.
 *
 * A floor level is the TOP of the beams framing into it: the column below stops
 * there, the column above starts there, and the beam hangs under the joint.
 * Drawn centred on the node the beam straddled that interface — half of every
 * beam ran up through the column starting at the same node — and the cages,
 * which are built off the soffit, no longer sat inside their own concrete.
 *
 * Horizontal members only: a column's node line IS its axis, and a sloping
 * member has no single level to hang from.
 */

// ── 3D primitives ─────────────────────────────────────────────────────────
/**
 * How far below the node line a member's concrete (or steel section) hangs, m.
 *
 * A floor level is the TOP of the beams framing into it: the column below stops
 * there, the column above starts there, and the beam hangs under the joint.
 * Drawn centred on the node the beam straddled that interface — half of every
 * beam ran up through the column starting at the same node — and the cages,
 * which are built off the soffit, no longer sat inside their own concrete.
 *
 * Horizontal members only: a column's node line IS its axis, and a sloping
 * member has no single level to hang from.
 */
export const HANGS_BELOW_NODE = new Set(['beam', 'girder'])

export function levelDrop(role: string, depth: number, a: THREE.Vector3, b: THREE.Vector3): number {
  if (!HANGS_BELOW_NODE.has(role) || Math.abs(a.y - b.y) > 1e-6) return 0
  return depth / 2
}

// ── Member force diagrams (BMD / SFD / axial / torsion) ─────────────────────
export const DIAG_COLOR: Record<DiagramComp, string> = {
  Mz: '#d62728', My: '#ea580c', Vy: '#1f77b4', Vz: '#0e7490', N: '#7c3aed', T: '#b45309',
}

export const DIAG_LABEL: Record<DiagramComp, string> = {
  Mz: 'Mz', My: 'My', Vy: 'Vy', Vz: 'Vz', N: 'N', T: 'T',
}

/** Inline 3D internal-force diagram drawn directly on one member. */

/** Inline 3D internal-force diagram drawn directly on one member. */

// ── Load glyphs ─────────────────────────────────────────────────────────────
export const UP = new THREE.Vector3(0, 1, 0)
/** A single force arrow with its head at `tip`, drawn back along −`dir`. */

/** A single force arrow with its head at `tip`, drawn back along −`dir`. */

// Colours for the tributary footprint by shape (= which beam carries it).
export const TRIB_COLOR = { triangle: '#0e7490', trapezoid: '#0f4c92', rect: '#15803d' } as const

export type TribKind = keyof typeof TRIB_COLOR

/** Tributary footprint of a slab on its edge beams: 45° triangles (short
 *  edges) + trapezoids (long edges) for two-way panels, or two rectangles for
 *  one-way (long/short ≥ 2). Returned as filled polygons just above the slab. */

/** Tributary footprint of a slab on its edge beams: 45° triangles (short
 *  edges) + trapezoids (long edges) for two-way panels, or two rectangles for
 *  one-way (long/short ≥ 2). Returned as filled polygons just above the slab. */

/** Tributary footprint of a slab on its edge beams: 45° triangles (short
 *  edges) + trapezoids (long edges) for two-way panels, or two rectangles for
 *  one-way (long/short ≥ 2). Returned as filled polygons just above the slab. */
export function slabTributaryPolys(c: THREE.Vector3[]): { pts: THREE.Vector3[]; kind: TribKind }[] {
  const O = c[0]
  const e1 = c[1].clone().sub(c[0]), e3 = c[3].clone().sub(c[0])
  const d1 = e1.length(), d3 = e3.length()
  const longAlong1 = d1 >= d3
  const U = (longAlong1 ? e1 : e3).clone().normalize()
  const V = (longAlong1 ? e3 : e1).clone().normalize()
  const L = Math.max(d1, d3), S = Math.min(d1, d3)
  const lift = new THREE.Vector3(0, 0.13, 0)
  const P = (u: number, v: number) => O.clone().addScaledVector(U, u).addScaledVector(V, v).add(lift)
  if (L / Math.max(S, 1e-9) >= 2) {
    const h = S / 2   // one-way: split between the two long edges
    return [
      { kind: 'rect', pts: [P(0, 0), P(L, 0), P(L, h), P(0, h)] },
      { kind: 'rect', pts: [P(0, h), P(L, h), P(L, S), P(0, S)] },
    ]
  }
  const m = S / 2     // two-way: 45° tributary
  return [
    { kind: 'triangle', pts: [P(0, 0), P(0, S), P(m, m)] },
    { kind: 'triangle', pts: [P(L, 0), P(L - m, m), P(L, S)] },
    { kind: 'trapezoid', pts: [P(0, 0), P(L, 0), P(L - m, m), P(m, m)] },
    { kind: 'trapezoid', pts: [P(0, S), P(m, m), P(L - m, m), P(L, S)] },
  ]
}
