import { describe, it, expect } from 'vitest'
import type { Dependency } from '../engine/schedule/model'
import { computeCPM } from '../engine/schedule/cpm'
import { layoutNetwork, edgePath, type NetActivity } from './network'

const dep = (predecessor: string, type: Dependency['type'] = 'FS', lag = 0): Dependency => ({ predecessor, type, lag })

// A(3)→B(4)→D(5)→F(4) critical; A→C(2)→{D,E(6)}→F.
const acts: NetActivity[] = [
  { id: 'A', name: 'A', predecessors: [] },
  { id: 'B', name: 'B', predecessors: [dep('A')] },
  { id: 'C', name: 'C', predecessors: [dep('A')] },
  { id: 'D', name: 'D', predecessors: [dep('B'), dep('C')] },
  { id: 'E', name: 'E', predecessors: [dep('C')] },
  { id: 'F', name: 'F', predecessors: [dep('D'), dep('E')] },
]
const cpmInput = [
  { id: 'A', duration: 3, predecessors: [] },
  { id: 'B', duration: 4, predecessors: [dep('A')] },
  { id: 'C', duration: 2, predecessors: [dep('A')] },
  { id: 'D', duration: 5, predecessors: [dep('B'), dep('C')] },
  { id: 'E', duration: 6, predecessors: [dep('C')] },
  { id: 'F', duration: 4, predecessors: [dep('D'), dep('E')] },
]

describe('layoutNetwork', () => {
  const cpm = computeCPM(cpmInput)
  const L = layoutNetwork(acts, cpm)
  const node = (id: string) => L.nodes.find((n) => n.id === id)!

  it('columns follow the longest predecessor chain', () => {
    expect(node('A').col).toBe(0)              // start
    expect(node('B').col).toBe(1)              // after A
    expect(node('C').col).toBe(1)              // after A
    expect(node('D').col).toBe(2)              // after B and C
    expect(node('E').col).toBe(2)              // after C
    expect(node('F').col).toBe(3)              // after D and E
    expect(L.cols).toBe(4)
  })
  it('nodes in a column get distinct rows and non-overlapping y', () => {
    expect(node('B').row).not.toBe(node('C').row)
    expect(node('B').y).not.toBe(node('C').y)
  })
  it('x increases with column', () => {
    expect(node('A').x).toBeLessThan(node('B').x)
    expect(node('B').x).toBeLessThan(node('D').x)
  })
  it('carries the CPM critical flag onto nodes and edges', () => {
    expect(node('A').critical && node('B').critical && node('D').critical && node('F').critical).toBe(true)
    expect(node('C').critical || node('E').critical).toBe(false)
    const ab = L.edges.find((e) => e.from === 'A' && e.to === 'B')!
    const ac = L.edges.find((e) => e.from === 'A' && e.to === 'C')!
    expect(ab.critical).toBe(true)             // both endpoints critical
    expect(ac.critical).toBe(false)            // C is not critical
  })
  it('emits one edge per dependency link', () => {
    // A→B, A→C, B→D, C→D, C→E, D→F, E→F
    expect(L.edges).toHaveLength(7)
  })
  it('node ES/EF/float come from the CPM result', () => {
    expect([node('A').es, node('A').ef]).toEqual([0, 3])
    expect(node('C').totalFloat).toBe(1)
  })
  it('has positive overall dimensions', () => {
    expect(L.width).toBeGreaterThan(0)
    expect(L.height).toBeGreaterThan(0)
  })
})

describe('critical edges require a binding link (diamond of equal-length paths)', () => {
  // A(5)→P(5)→S(10); A→R(10); Q(5) after P and R. Two equal 20-day paths
  // A-P-S and A-R-Q ⇒ A,P,R,S,Q all critical, but P→Q is slack (R drives Q).
  const acts: NetActivity[] = [
    { id: 'A', name: 'A', predecessors: [] },
    { id: 'P', name: 'P', predecessors: [dep('A')] },
    { id: 'R', name: 'R', predecessors: [dep('A')] },
    { id: 'S', name: 'S', predecessors: [dep('P')] },
    { id: 'Q', name: 'Q', predecessors: [dep('P'), dep('R')] },
  ]
  const cpm = computeCPM([
    { id: 'A', duration: 5, predecessors: [] },
    { id: 'P', duration: 5, predecessors: [dep('A')] },
    { id: 'R', duration: 10, predecessors: [dep('A')] },
    { id: 'S', duration: 10, predecessors: [dep('P')] },
    { id: 'Q', duration: 5, predecessors: [dep('P'), dep('R')] },
  ])
  const L = layoutNetwork(acts, cpm)
  const edge = (from: string, to: string) => L.edges.find((e) => e.from === from && e.to === to)!
  const node = (id: string) => L.nodes.find((n) => n.id === id)!

  it('all five activities are critical (zero float)', () => {
    for (const id of ['A', 'P', 'R', 'S', 'Q']) expect(node(id).critical).toBe(true)
  })
  it('binding critical links are red; the slack P→Q link is not', () => {
    expect(edge('A', 'P').critical).toBe(true)
    expect(edge('A', 'R').critical).toBe(true)
    expect(edge('P', 'S').critical).toBe(true)
    expect(edge('R', 'Q').critical).toBe(true)   // R drives Q (EF 15 = ES(Q) 15)
    expect(edge('P', 'Q').critical).toBe(false)  // both critical, but P (EF 10) does not drive Q
  })
})

describe('empty project', () => {
  it('lays out with no nodes/edges and positive dimensions (no Math.max(-Infinity))', () => {
    const L = layoutNetwork([], computeCPM([]))
    expect(L.nodes).toHaveLength(0)
    expect(L.edges).toHaveLength(0)
    expect(L.cols).toBe(0)
    expect(L.width).toBeGreaterThan(0)
    expect(L.height).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Branching: row ordering and long-edge routing.
// ─────────────────────────────────────────────────────────────────────────

describe('long edges are routed around the nodes they span', () => {
  // A→B→C→D is a chain, and A→D jumps two columns. Drawn as one curve, that
  // jump passes straight through B and C and reads as a link to them.
  const acts: NetActivity[] = [
    { id: 'A', name: 'A', predecessors: [] },
    { id: 'B', name: 'B', predecessors: [dep('A')] },
    { id: 'C', name: 'C', predecessors: [dep('B')] },
    { id: 'D', name: 'D', predecessors: [dep('C'), dep('A')] },
  ]
  const cpm = computeCPM([
    { id: 'A', duration: 1, predecessors: [] },
    { id: 'B', duration: 1, predecessors: [dep('A')] },
    { id: 'C', duration: 1, predecessors: [dep('B')] },
    { id: 'D', duration: 1, predecessors: [dep('C'), dep('A')] },
  ])
  const L = layoutNetwork(acts, cpm)
  const node = (id: string) => L.nodes.find((n) => n.id === id)!
  const edge = (from: string, to: string) => L.edges.find((e) => e.from === from && e.to === to)!

  it('reports how many columns each edge spans', () => {
    expect(edge('A', 'B').span).toBe(1)
    expect(edge('A', 'D').span).toBe(3)
  })

  it('a one-column edge is a straight two-point route', () => {
    expect(edge('A', 'B').points).toHaveLength(2)
  })

  it('a spanning edge gains an entry and exit point per column it crosses', () => {
    // A(0) → D(3) crosses columns 1 and 2: two points each, plus the two
    // endpoints. Two points per column, not one, so the leg INTO a lane is a
    // short diagonal in the gap and the traverse across the column is level.
    expect(edge('A', 'D').points).toHaveLength(6)
  })

  it('every route starts at the predecessor and ends at the successor', () => {
    for (const e of L.edges) {
      const a = node(e.from), b = node(e.to)
      const first = e.points[0], last = e.points[e.points.length - 1]
      expect(first).toEqual({ x: a.x + a.w, y: a.y + a.h / 2 })
      expect(last).toEqual({ x: b.x, y: b.y + b.h / 2 })
    }
  })

  it('the waypoints clear the boxes in the columns they pass', () => {
    // Each waypoint sits in a lane of its own, so it must not fall inside any
    // real node's rectangle. That is the whole point of the routing.
    const way = L.edges.flatMap((e) => e.points.slice(1, -1))
    expect(way.length).toBeGreaterThan(0)
    for (const p of way) {
      for (const n of L.nodes) {
        const inside = p.x > n.x && p.x < n.x + n.w && p.y > n.y && p.y < n.y + n.h
        expect(inside, `waypoint (${p.x},${p.y}) sits inside ${n.id}`).toBe(false)
      }
    }
  })

  it('no part of any route passes through an activity box', () => {
    // The stronger version of the waypoint check: sample along every segment,
    // because a leg BETWEEN two waypoints can cut a corner that neither
    // waypoint touches. That is exactly the fault a browser render caught
    // when each column held a single mid-column waypoint.
    for (const e of L.edges) {
      for (let i = 0; i + 1 < e.points.length; i++) {
        const p0 = e.points[i], p1 = e.points[i + 1]
        for (let t = 0; t <= 1; t += 0.02) {
          const x = p0.x + (p1.x - p0.x) * t, y = p0.y + (p1.y - p0.y) * t
          for (const n of L.nodes) {
            if (n.id === e.from || n.id === e.to) continue   // its own endpoints
            const inside = x > n.x + 1 && x < n.x + n.w - 1 && y > n.y + 1 && y < n.y + n.h - 1
            expect(inside, `${e.from}→${e.to} crosses ${n.id} at (${x.toFixed(0)},${y.toFixed(0)})`).toBe(false)
          }
        }
      }
    }
  })

  it('does not add phantom edges for the virtual routing nodes', () => {
    expect(L.edges).toHaveLength(4)                    // A→B, B→C, C→D, A→D
    expect(L.nodes.map((n) => n.id).sort()).toEqual(['A', 'B', 'C', 'D'])
  })
})

describe('row ordering reduces crossings', () => {
  // Two independent chains that swap rows if rows are numbered by arrival
  // order: X1→X2 and Y1→Y2, with the topological order interleaving them.
  const acts: NetActivity[] = [
    { id: 'X1', name: 'X1', predecessors: [] },
    { id: 'Y1', name: 'Y1', predecessors: [] },
    { id: 'Y2', name: 'Y2', predecessors: [dep('Y1')] },
    { id: 'X2', name: 'X2', predecessors: [dep('X1')] },
  ]
  const cpm = computeCPM([
    { id: 'X1', duration: 1, predecessors: [] },
    { id: 'Y1', duration: 1, predecessors: [] },
    { id: 'Y2', duration: 1, predecessors: [dep('Y1')] },
    { id: 'X2', duration: 1, predecessors: [dep('X1')] },
  ])
  const L = layoutNetwork(acts, cpm)
  const node = (id: string) => L.nodes.find((n) => n.id === id)!

  it('two parallel chains cross zero times', () => {
    expect(L.crossings).toBe(0)
  })

  it('keeps each chain on its own row', () => {
    expect(node('X1').row).toBe(node('X2').row)
    expect(node('Y1').row).toBe(node('Y2').row)
    expect(node('X1').row).not.toBe(node('Y1').row)
  })
})

describe('a branching programme lays out as branches', () => {
  // One predecessor fanning out to three streams that converge again — the
  // shape of any real construction programme.
  const mk = (id: string, preds: string[]) => ({ id, name: id, predecessors: preds.map((p) => dep(p)) })
  const acts: NetActivity[] = [
    mk('S', []), mk('P1', ['S']), mk('P2', ['S']), mk('P3', ['S']),
    mk('Q1', ['P1']), mk('Q2', ['P2']), mk('Q3', ['P3']),
    mk('E', ['Q1', 'Q2', 'Q3']),
  ]
  const cpm = computeCPM(acts.map((a) => ({ id: a.id, duration: 2, predecessors: a.predecessors })))
  const L = layoutNetwork(acts, cpm)
  const node = (id: string) => L.nodes.find((n) => n.id === id)!

  it('puts the three streams in the same column on different rows', () => {
    const rows = ['P1', 'P2', 'P3'].map((id) => node(id).row)
    expect(['P1', 'P2', 'P3'].map((id) => node(id).col)).toEqual([1, 1, 1])
    expect(new Set(rows).size).toBe(3)
  })

  it('keeps each stream on one row through to the merge', () => {
    for (const [p, q] of [['P1', 'Q1'], ['P2', 'Q2'], ['P3', 'Q3']] as const) {
      expect(node(p).row, `${p}/${q}`).toBe(node(q).row)
    }
  })

  it('crosses nowhere — a fan-out/fan-in is planar', () => {
    expect(L.crossings).toBe(0)
  })

  it('is taller than one row, which a chain never is', () => {
    expect(L.height).toBeGreaterThan(2 * 56)
  })
})

describe('edgePath', () => {
  it('is empty for a degenerate route', () => {
    expect(edgePath([])).toBe('')
    expect(edgePath([{ x: 0, y: 0 }])).toBe('')
  })

  it('draws a single cubic for a two-point route', () => {
    const d = edgePath([{ x: 0, y: 0 }, { x: 100, y: 20 }])
    expect(d.startsWith('M 0 0')).toBe(true)
    expect(d).toContain('C')
    expect(d.match(/C/g)).toHaveLength(1)
  })

  it('threads every waypoint of a routed edge', () => {
    const d = edgePath([{ x: 0, y: 0 }, { x: 50, y: 40 }, { x: 100, y: 40 }, { x: 150, y: 0 }])
    expect(d.startsWith('M 0 0')).toBe(true)
    expect(d).toContain('Q')
    expect(d.endsWith('L 150 0')).toBe(true)   // reaches the successor exactly
  })

  it('a rounded corner stays inside the corridor its waypoints define', () => {
    // The earlier Q/T smoothing reflected its control point and overshot far
    // enough to swing back through an activity box. A fillet cannot: every
    // control point IS a waypoint, so the curve is bounded by the polyline's
    // own corners.
    const pts = [{ x: 0, y: 0 }, { x: 50, y: 40 }, { x: 100, y: 40 }, { x: 150, y: 0 }]
    const d = edgePath(pts)
    const nums = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
    const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(Math.min(...pts.map((p) => p.x)))
    expect(Math.max(...xs)).toBeLessThanOrEqual(Math.max(...pts.map((p) => p.x)))
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(Math.min(...pts.map((p) => p.y)))
    expect(Math.max(...ys)).toBeLessThanOrEqual(Math.max(...pts.map((p) => p.y)))
  })
})
