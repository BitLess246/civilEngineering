// ─────────────────────────────────────────────────────────────────────────
// THE PLAN GRID — which lines get a bubble.
//
// A structural grid is set out on the COLUMNS. Taking every distinct node
// coordinate instead was right only while every node sat on a column line; a
// meshed slab, a split beam or an imported STAAD model puts a node every 0.6 m
// and the floor filled with bubbles A…Z and beyond. So: column positions, and
// failing any column (a truss on bearings, a slab on walls) the supports, and
// failing those the nodes — the old behaviour, for a model with nothing else.
//
// THE BASES OF THE LOWEST COLUMNS, not every column end. A grid is set out
// where columns are founded; a column leaning to its top (or every column of
// a storey stacked on one) would otherwise draw a line through each top.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel } from './model'

/** Distinct values, sorted, merged within `tol` (m). */
export function uniqueCoords(vals: number[], tol = 0.05): number[] {
  const out: number[] = []
  for (const v of [...vals].sort((a, b) => a - b))
    if (!out.length || Math.abs(v - out[out.length - 1]) > tol) out.push(v)
  return out
}

/** Grid line positions: x of the lettered lines (‖ Z), z of the numbered rows (‖ X), m. */
export function planGridLines(model: Pick<StructuralModel, 'nodes' | 'members' | 'supports'>): { xs: number[]; zs: number[] } {
  const byId = new Map(model.nodes.map((n) => [n.id, n]))
  const vertical = (i: string, j: string) => {
    const a = byId.get(i), b = byId.get(j)
    if (!a || !b) return false
    const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    return L > 1e-9 && Math.abs(b.y - a.y) / L > 0.999
  }
  const bases = model.members
    .filter((m) => m.role === 'column' || vertical(m.i, m.j))
    .map((m) => { const a = byId.get(m.i), b = byId.get(m.j); return a && b ? (a.y <= b.y ? a : b) : undefined })
    .filter((p): p is NonNullable<typeof p> => !!p)
  const yBase = bases.length ? Math.min(...bases.map((p) => p.y)) : 0
  let pts: (typeof model.nodes[number] | undefined)[] = bases.filter((p) => p.y <= yBase + 0.05)
  if (!pts.some(Boolean)) pts = model.supports.map((s) => byId.get(s.node))
  if (!pts.some(Boolean)) pts = model.nodes
  const ok = pts.filter((p): p is NonNullable<typeof p> => !!p)
  return { xs: uniqueCoords(ok.map((p) => p.x)), zs: uniqueCoords(ok.map((p) => p.z)) }
}
