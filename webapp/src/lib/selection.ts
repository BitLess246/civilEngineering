// ─────────────────────────────────────────────────────────────────────────
// MULTI-SELECTION — the set of picked elements, and the box that picks them.
//
// STAAD.Pro's grammar, which an engineer arriving from it already has in their
// hands: a plain click selects one thing and drops the rest; Ctrl (or Shift,
// or ⌘) + click adds an element, or takes it back out if it was already in;
// a box dragged LEFT → RIGHT is a WINDOW and takes what lies wholly inside it,
// dragged RIGHT → LEFT it is a CROSSING and takes anything it touches.
//
// The selection carries a PRIMARY — the element picked last — because the
// single-element panels (releases, offsets, force diagrams) still speak about
// one member, and that member should be the one the user just touched.
//
// Pure: ids and screen-space numbers, no React, no three.js.
// ─────────────────────────────────────────────────────────────────────────

export interface Selection {
  /** The element picked last; null when nothing is selected. */
  primary: string | null
  ids: ReadonlySet<string>
}

export const EMPTY_SELECTION: Selection = { primary: null, ids: new Set() }

/** A click on `id`. `additive` (Ctrl/Shift/⌘ held) toggles it in or out of
 *  the set; a plain click selects it alone. */
export function clickSelect(cur: Selection, id: string, additive: boolean): Selection {
  if (!additive) return { primary: id, ids: new Set([id]) }
  const ids = new Set(cur.ids)
  if (ids.has(id)) {
    ids.delete(id)
    // the primary falls back to the most recently added that is still in
    const rest = [...ids]
    return { primary: cur.primary !== id && cur.primary !== null && ids.has(cur.primary) ? cur.primary : rest[rest.length - 1] ?? null, ids }
  }
  ids.add(id)
  return { primary: id, ids }
}

/** Many at once — a box, or "all columns". `add` keeps what was selected. */
export function selectMany(cur: Selection, picked: readonly string[], add: boolean): Selection {
  const ids = new Set(add ? cur.ids : [])
  for (const id of picked) ids.add(id)
  if (ids.size === 0) return EMPTY_SELECTION
  const primary = picked.length ? picked[picked.length - 1] : cur.primary
  return { primary: primary !== null && ids.has(primary) ? primary : [...ids][ids.size - 1], ids }
}

/** Drop ids that no longer exist (after a delete, an undo, a regenerate). */
export function pruneSelection(cur: Selection, exists: (id: string) => boolean): Selection {
  if ([...cur.ids].every(exists)) return cur
  const ids = new Set([...cur.ids].filter(exists))
  if (ids.size === 0) return EMPTY_SELECTION
  return { primary: cur.primary !== null && ids.has(cur.primary) ? cur.primary : [...ids][ids.size - 1], ids }
}

// ── the box ──────────────────────────────────────────────────────────────

/** Screen px, y down. */
export type P2 = readonly [number, number]
export interface Rect { x0: number; y0: number; x1: number; y1: number }
export interface ScreenSegment { id: string; a: P2; b: P2 }

/** WINDOW when dragged left → right, CROSSING when dragged right → left. */
export const boxMode = (startX: number, endX: number): 'window' | 'crossing' => (endX >= startX ? 'window' : 'crossing')

/** The rectangle with x0 ≤ x1, y0 ≤ y1, from two drag corners. */
export const normRect = (a: P2, b: P2): Rect => ({
  x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]),
})

const inside = (p: P2, r: Rect) => p[0] >= r.x0 && p[0] <= r.x1 && p[1] >= r.y0 && p[1] <= r.y1

/** Proper or touching intersection of segments pq and rs. */
function segsMeet(p: P2, q: P2, r: P2, s: P2): boolean {
  const o = (a: P2, b: P2, c: P2) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]))
  const on = (a: P2, b: P2, c: P2) =>
    Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1])
  const o1 = o(p, q, r), o2 = o(p, q, s), o3 = o(r, s, p), o4 = o(r, s, q)
  if (o1 !== o2 && o3 !== o4) return true
  return (o1 === 0 && on(p, q, r)) || (o2 === 0 && on(p, q, s)) || (o3 === 0 && on(r, s, p)) || (o4 === 0 && on(r, s, q))
}

/** Does segment ab touch rectangle r at all — an end inside, or crossing an edge? */
export function segmentTouchesRect(a: P2, b: P2, r: Rect): boolean {
  if (inside(a, r) || inside(b, r)) return true
  const c: P2[] = [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]]
  return c.some((p, k) => segsMeet(a, b, p, c[(k + 1) % 4]))
}

/** The ids a box takes: a window wants both ends inside, a crossing any touch. */
export function boxSelect(segs: readonly ScreenSegment[], r: Rect, mode: 'window' | 'crossing'): string[] {
  return segs
    .filter((s) => (mode === 'window' ? inside(s.a, r) && inside(s.b, r) : segmentTouchesRect(s.a, s.b, r)))
    .map((s) => s.id)
}

/** Distance from p to segment ab, px. */
export function distToSegment(p: P2, a: P2, b: P2): number {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const L2 = dx * dx + dy * dy
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** The segment nearest a click, if one lies within `tol` px — what a click
 *  in box mode picks, since the box overlay sits over the 3D view. */
export function nearestSegment(segs: readonly ScreenSegment[], p: P2, tol = 6): string | null {
  let best: string | null = null, bestD = tol
  for (const s of segs) {
    const d = distToSegment(p, s.a, s.b)
    if (d <= bestD) { bestD = d; best = s.id }
  }
  return best
}
