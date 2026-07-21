import { describe, it, expect } from 'vitest'
import type { Dependency } from '../engine/schedule/model'
import { computeCPM } from '../engine/schedule/cpm'
import { layoutNetwork, type NetActivity } from './network'

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
