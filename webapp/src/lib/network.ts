// ─────────────────────────────────────────────────────────────────────────
// Activity-on-node (AON) network layout (pure). Places each activity in a
// layered left→right DAG: the column is the longest dependency chain reaching
// it, the row is its order within that column. Edges carry a `critical` flag.
// No React — the page renders nodes/edges and lets the user drag nodes (a view
// concern that does not touch scheduling).
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

export interface NetEdge {
  from: string
  to: string
  type: Dependency['type']
  critical: boolean
}

export interface NetworkLayout {
  nodes: NetNode[]
  edges: NetEdge[]
  cols: number
  width: number
  height: number
}

export interface LayoutOpts {
  nodeW?: number
  nodeH?: number
  hGap?: number
  vGap?: number
  pad?: number
}

/**
 * Layer the network. Column = longest predecessor chain (0 for start nodes);
 * row = insertion order within the column, following the CPM topological order
 * so critical activities line up. An edge is critical when both endpoints are.
 */
export function layoutNetwork(activities: NetActivity[], cpm: Cpm, opts: LayoutOpts = {}): NetworkLayout {
  const nodeW = opts.nodeW ?? 156
  const nodeH = opts.nodeH ?? 56
  const hGap = opts.hGap ?? 54
  const vGap = opts.vGap ?? 22
  const pad = opts.pad ?? 16

  const byId = new Map(activities.map((a) => [a.id, a]))
  const order = cpm.order.filter((id) => byId.has(id))

  // Longest-path column via one pass in topological order.
  const col = new Map<string, number>()
  for (const id of order) {
    let c = 0
    for (const dep of byId.get(id)!.predecessors) {
      if (col.has(dep.predecessor)) c = Math.max(c, col.get(dep.predecessor)! + 1)
    }
    col.set(id, c)
  }

  // Row = running count within each column, in topological order.
  const rowOf = new Map<string, number>()
  const rowCount = new Map<number, number>()
  for (const id of order) {
    const c = col.get(id) ?? 0
    const r = rowCount.get(c) ?? 0
    rowOf.set(id, r)
    rowCount.set(c, r + 1)
  }

  const nodes: NetNode[] = order.map((id) => {
    const a = byId.get(id)!
    const c = col.get(id) ?? 0
    const r = rowOf.get(id) ?? 0
    const info = cpm.activities.get(id)
    return {
      id, name: a.name, milestone: !!a.milestone,
      col: c, row: r,
      x: pad + c * (nodeW + hGap),
      y: pad + r * (nodeH + vGap),
      w: nodeW, h: nodeH,
      critical: info?.critical ?? false,
      es: info?.es ?? 0, ef: info?.ef ?? 0, totalFloat: info?.totalFloat ?? 0,
    }
  })

  const critical = new Set(nodes.filter((n) => n.critical).map((n) => n.id))
  const edges: NetEdge[] = []
  for (const a of activities) {
    if (!byId.has(a.id)) continue
    for (const dep of a.predecessors) {
      if (!byId.has(dep.predecessor)) continue
      edges.push({ from: dep.predecessor, to: a.id, type: dep.type, critical: critical.has(a.id) && critical.has(dep.predecessor) })
    }
  }

  const cols = (rowCount.size ? Math.max(...col.values()) + 1 : 0)
  const maxRow = rowCount.size ? Math.max(...rowCount.values()) : 0
  return {
    nodes, edges, cols,
    width: pad * 2 + cols * nodeW + Math.max(0, cols - 1) * hGap,
    height: pad * 2 + maxRow * nodeH + Math.max(0, maxRow - 1) * vGap,
  }
}
