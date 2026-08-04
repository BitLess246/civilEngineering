// ─────────────────────────────────────────────────────────────────────────
// Activity-on-node (AON) network layout (pure). Places each activity in a
// layered left→right DAG: the column is the longest dependency chain reaching
// it, the row is its position within that column. Edges carry a `critical`
// flag and an explicit route. No React — the page renders nodes/edges and
// lets the user drag nodes (a view concern that does not touch scheduling).
//
// ── WHY THE ROW ORDER IS NOT JUST "INSERTION ORDER" ─────────────────────
//
// A construction programme branches: three trades run off one slab pour and
// converge again at handover. Two things make that unreadable if the layout
// is naive.
//
//   1. ROW ORDER. Numbering rows by topological arrival puts a node's
//      children wherever they happen to fall, so every branch crosses every
//      other. Rows are therefore ordered by BARYCENTRE — repeatedly moving
//      each node to the average position of its neighbours in the adjacent
//      column — which is the standard Sugiyama heuristic and the cheapest
//      thing that actually reduces crossings. Sweeps are kept only when the
//      crossing count improves, so the result is never worse than the
//      topological order it started from.
//
//   2. LONG EDGES. An edge spanning more than one column used to be drawn as
//      a single curve straight through whatever sat in between — it would
//      pass behind unrelated activity boxes and read as a link to them.
//      Every such edge is now broken over VIRTUAL NODES, one per column it
//      crosses. The virtual nodes take part in the ordering, so they reserve
//      a clear lane for themselves, and the edge is returned as a polyline
//      through them.
//
// Virtual nodes never appear in `nodes` — they exist only to shape the
// layout — and the edge list stays one entry per real dependency.
// ─────────────────────────────────────────────────────────────────────────

import type { Dependency } from '../engine/schedule/model'
import type { CpmResult as Cpm } from '../engine/schedule/cpm'

/** Minimal activity shape the layout needs. */
export interface NetActivity {
  id: string
  name: string
  predecessors: Dependency[]
  milestone?: boolean
}

export interface NetNode {
  id: string
  name: string
  milestone: boolean
  col: number
  row: number
  x: number
  y: number
  w: number
  h: number
  critical: boolean
  es: number
  ef: number
  totalFloat: number
}

export interface Pt { x: number; y: number }

export interface NetEdge {
  from: string
  to: string
  type: Dependency['type']
  critical: boolean
  /** Columns spanned. Anything above 1 was routed around intervening nodes. */
  span: number
  /**
   * The route, from the predecessor's right edge to the successor's left
   * edge, including any waypoints. Always at least two points.
   */
  points: Pt[]
}

export interface NetworkLayout {
  nodes: NetNode[]
  edges: NetEdge[]
  cols: number
  width: number
  height: number
  /** Edge crossings remaining after ordering — a layout-quality readout. */
  crossings: number
}

export interface LayoutOpts {
  nodeW?: number
  nodeH?: number
  hGap?: number
  vGap?: number
  pad?: number
  /** Barycentre sweeps. Four is enough for schedule-sized graphs. */
  sweeps?: number
}

/** A position in the layered grid — either a real activity or a routing point. */
interface Slot { id: string; dummy: boolean }

export function layoutNetwork(activities: NetActivity[], cpm: Cpm, opts: LayoutOpts = {}): NetworkLayout {
  const nodeW = opts.nodeW ?? 156
  const nodeH = opts.nodeH ?? 56
  const hGap = opts.hGap ?? 54
  const vGap = opts.vGap ?? 22
  const pad = opts.pad ?? 16
  const sweeps = opts.sweeps ?? 4

  const byId = new Map(activities.map((a) => [a.id, a]))
  const order = cpm.order.filter((id) => byId.has(id))

  // ── 1. Columns: longest predecessor chain, one pass in topological order.
  const col = new Map<string, number>()
  for (const id of order) {
    let c = 0
    for (const dep of byId.get(id)!.predecessors) {
      if (col.has(dep.predecessor)) c = Math.max(c, col.get(dep.predecessor)! + 1)
    }
    col.set(id, c)
  }
  const cols = order.length ? Math.max(...col.values()) + 1 : 0

  // ── 2. Links, and virtual nodes for every link that spans a gap.
  interface Link { from: string; to: string; dep: Dependency; chain: string[] }
  const links: Link[] = []
  const layers: Slot[][] = Array.from({ length: cols }, () => [])
  for (const id of order) layers[col.get(id)!].push({ id, dummy: false })

  for (const a of activities) {
    if (!byId.has(a.id)) continue
    for (const dep of a.predecessors) {
      if (!byId.has(dep.predecessor)) continue
      const c0 = col.get(dep.predecessor)!, c1 = col.get(a.id)!
      const chain: string[] = []
      for (let c = c0 + 1; c < c1; c++) {
        // The key carries both endpoints, so two links between the same pair
        // of columns never share a lane.
        const did = `~${dep.predecessor}→${a.id}@${c}`
        layers[c].push({ id: did, dummy: true })
        chain.push(did)
      }
      links.push({ from: dep.predecessor, to: a.id, dep, chain })
    }
  }

  // Each link, expanded so every segment spans exactly one column.
  const segs: [string, string][] = []
  for (const l of links) {
    const path = [l.from, ...l.chain, l.to]
    for (let k = 0; k < path.length - 1; k++) segs.push([path[k], path[k + 1]])
  }
  const succ = new Map<string, string[]>()
  const pred = new Map<string, string[]>()
  for (const [u, v] of segs) {
    succ.set(u, [...(succ.get(u) ?? []), v])
    pred.set(v, [...(pred.get(v) ?? []), u])
  }

  // ── 3. Barycentre ordering, kept only when it reduces crossings.
  const indexOf = (layer: Slot[]) => new Map(layer.map((s, i) => [s.id, i]))

  /** Crossings between two adjacent layers, counted by inversion. */
  const crossingsBetween = (left: Slot[], right: Slot[]): number => {
    const li = indexOf(left), ri = indexOf(right)
    const pairs: [number, number][] = []
    for (const [u, v] of segs) {
      if (li.has(u) && ri.has(v)) pairs.push([li.get(u)!, ri.get(v)!])
    }
    let n = 0
    for (let i = 0; i < pairs.length; i++) {
      for (let j = i + 1; j < pairs.length; j++) {
        if ((pairs[i][0] - pairs[j][0]) * (pairs[i][1] - pairs[j][1]) < 0) n++
      }
    }
    return n
  }
  const totalCrossings = (ls: Slot[][]) => {
    let n = 0
    for (let c = 0; c + 1 < ls.length; c++) n += crossingsBetween(ls[c], ls[c + 1])
    return n
  }

  /** Reorder one layer by the mean position of its neighbours in `ref`.
   *  A node with no neighbour there keeps its current index — moving it would
   *  be an arbitrary choice that only adds churn. */
  const bary = (layer: Slot[], ref: Slot[], dir: 'pred' | 'succ'): Slot[] => {
    const ri = indexOf(ref)
    const adj = dir === 'pred' ? pred : succ
    const keyed = layer.map((s, i) => {
      const ns = (adj.get(s.id) ?? []).map((n) => ri.get(n)).filter((v): v is number => v !== undefined)
      return { s, i, b: ns.length ? ns.reduce((x, y) => x + y, 0) / ns.length : i }
    })
    // Stable: equal barycentres keep their previous relative order.
    keyed.sort((p, q) => (p.b - q.b) || (p.i - q.i))
    return keyed.map((k) => k.s)
  }

  let best = layers.map((l) => [...l])
  let bestX = totalCrossings(best)
  let cur = layers.map((l) => [...l])
  for (let s = 0; s < sweeps && bestX > 0; s++) {
    for (let c = 1; c < cols; c++) cur[c] = bary(cur[c], cur[c - 1], 'pred')
    for (let c = cols - 2; c >= 0; c--) cur[c] = bary(cur[c], cur[c + 1], 'succ')
    const x = totalCrossings(cur)
    if (x < bestX) { bestX = x; best = cur.map((l) => [...l]) }
    else cur = best.map((l) => [...l])   // reject: continue from the best so far
  }

  // ── 4. Coordinates.
  const rowOf = new Map<string, number>()
  for (const layer of best) layer.forEach((s, r) => rowOf.set(s.id, r))
  const xOfCol = (c: number) => pad + c * (nodeW + hGap)
  const yOfRow = (r: number) => pad + r * (nodeH + vGap)

  const nodes: NetNode[] = order.map((id) => {
    const a = byId.get(id)!
    const c = col.get(id) ?? 0
    const r = rowOf.get(id) ?? 0
    const info = cpm.activities.get(id)
    return {
      id, name: a.name, milestone: !!a.milestone,
      col: c, row: r,
      x: xOfCol(c), y: yOfRow(r),
      w: nodeW, h: nodeH,
      critical: info?.critical ?? false,
      es: info?.es ?? 0, ef: info?.ef ?? 0, totalFloat: info?.totalFloat ?? 0,
    }
  })
  const nodeById = new Map(nodes.map((n) => [n.id, n]))

  // ── 5. Critical links.
  //
  // An edge lies on the critical path only when both endpoints are critical
  // AND the link is *binding* — the predecessor's constraint exactly sets the
  // successor's driving date. (Two critical nodes can be joined by a slack
  // link in a diamond with equal-length paths; that link is not critical.)
  const critical = new Set(nodes.filter((n) => n.critical).map((n) => n.id))
  const EPS = 1e-6
  const isBinding = (dep: Dependency, predId: string, succId: string): boolean => {
    const p = cpm.activities.get(predId), s = cpm.activities.get(succId)
    if (!p || !s) return false
    const lag = dep.lag ?? 0
    switch (dep.type) {
      case 'FS': return Math.abs(p.ef + lag - s.es) < EPS
      case 'SS': return Math.abs(p.es + lag - s.es) < EPS
      case 'FF': return Math.abs(p.ef + lag - s.ef) < EPS
      case 'SF': return Math.abs(p.es + lag - s.ef) < EPS
    }
  }

  const edges: NetEdge[] = links.map((l) => {
    const a = nodeById.get(l.from)!, b = nodeById.get(l.to)!
    const points: Pt[] = [{ x: a.x + a.w, y: a.y + a.h / 2 }]
    for (const d of l.chain) {
      // Each virtual node holds a reserved lane in its column, and the route
      // gets TWO points in it — one at each side. That keeps the diagonal
      // legs inside the gaps BETWEEN columns, where nothing is drawn, and
      // makes the traverse across a column a horizontal run along the lane.
      // With a single mid-column point the leg into it was one long diagonal
      // that sliced across whatever box shared that column.
      const c = Number(d.slice(d.lastIndexOf('@') + 1))
      const laneY = yOfRow(rowOf.get(d) ?? 0) + nodeH / 2
      points.push({ x: xOfCol(c), y: laneY }, { x: xOfCol(c) + nodeW, y: laneY })
    }
    points.push({ x: b.x, y: b.y + b.h / 2 })
    return {
      from: l.from, to: l.to, type: l.dep.type,
      critical: critical.has(l.to) && critical.has(l.from) && isBinding(l.dep, l.from, l.to),
      span: (col.get(l.to) ?? 0) - (col.get(l.from) ?? 0),
      points,
    }
  })

  const maxRow = best.length ? Math.max(0, ...best.map((l) => l.length)) : 0
  return {
    nodes, edges, cols, crossings: bestX,
    width: pad * 2 + cols * nodeW + Math.max(0, cols - 1) * hGap,
    height: pad * 2 + maxRow * nodeH + Math.max(0, maxRow - 1) * vGap,
  }
}

/** Corner radius used when rounding a routed edge. */
const CORNER = 14

/**
 * A smooth SVG path through a route.
 *
 * A straight one-column link gets a single horizontal S-curve, which stays
 * inside the gap between the two columns and so cannot touch anything.
 *
 * A routed link is drawn as a ROUNDED POLYLINE: straight segments with a
 * quadratic fillet at each waypoint. The first version smoothed it with
 * `Q`/`T` instead, and the `T` reflection overshot far enough to swing the
 * curve back through an activity box — the exact fault the routing exists to
 * prevent. A fillet is bounded by its corner, so the path can never leave the
 * corridor the waypoints define.
 */
export function edgePath(points: Pt[]): string {
  if (points.length < 2) return ''
  if (points.length === 2) {
    const [a, b] = points
    const c = Math.max(18, Math.abs(b.x - a.x) * 0.42)
    return `M ${a.x} ${a.y} C ${a.x + c} ${a.y}, ${b.x - c} ${b.y}, ${b.x} ${b.y}`
  }

  const lerp = (from: Pt, to: Pt, dist: number): Pt => {
    const dx = to.x - from.x, dy = to.y - from.y
    const len = Math.hypot(dx, dy) || 1
    const t = Math.min(dist, len / 2) / len
    return { x: from.x + dx * t, y: from.y + dy * t }
  }

  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1], p = points[i], next = points[i + 1]
    const inPt = lerp(p, prev, CORNER)     // back off along the incoming leg
    const outPt = lerp(p, next, CORNER)    // and forward along the outgoing one
    d += ` L ${inPt.x} ${inPt.y} Q ${p.x} ${p.y}, ${outPt.x} ${outPt.y}`
  }
  const last = points[points.length - 1]
  return `${d} L ${last.x} ${last.y}`
}
