import { describe, it, expect } from 'vitest'
import type { Dependency } from './model'
import {
  computeCPM, topoOrder, findCycle, wouldCreateCycle, ScheduleCycleError,
  type CpmActivityInput,
} from './cpm'

const dep = (predecessor: string, type: Dependency['type'] = 'FS', lag = 0): Dependency =>
  ({ predecessor, type, lag })

// Classic AON network (all FS, lag 0). Hand-computed answers below.
//   A(3) → B(4) → D(5) → F(4)          critical chain
//   A(3) → C(2) → {D, E(6)} → F(4)
const NETWORK: CpmActivityInput[] = [
  { id: 'A', duration: 3, predecessors: [] },
  { id: 'B', duration: 4, predecessors: [dep('A')] },
  { id: 'C', duration: 2, predecessors: [dep('A')] },
  { id: 'D', duration: 5, predecessors: [dep('B'), dep('C')] },
  { id: 'E', duration: 6, predecessors: [dep('C')] },
  { id: 'F', duration: 4, predecessors: [dep('D'), dep('E')] },
]

describe('topological order', () => {
  it('places every predecessor before its successors', () => {
    const order = topoOrder(NETWORK)
    const pos = new Map(order.map((id, i) => [id, i]))
    for (const a of NETWORK)
      for (const d of a.predecessors ?? [])
        expect(pos.get(d.predecessor)!).toBeLessThan(pos.get(a.id)!)
  })
})

describe('CPM forward / backward pass (textbook AON)', () => {
  const r = computeCPM(NETWORK)
  const get = (id: string) => r.activities.get(id)!

  it('project duration is the longest path (A→B→D→F = 16)', () => {
    expect(r.duration).toBe(16)
    expect(r.finish).toBe(16)
  })
  it('early start / finish match the hand calc', () => {
    expect([get('A').es, get('A').ef]).toEqual([0, 3])
    expect([get('B').es, get('B').ef]).toEqual([3, 7])
    expect([get('C').es, get('C').ef]).toEqual([3, 5])
    expect([get('D').es, get('D').ef]).toEqual([7, 12])
    expect([get('E').es, get('E').ef]).toEqual([5, 11])
    expect([get('F').es, get('F').ef]).toEqual([12, 16])
  })
  it('late start / finish match the hand calc', () => {
    expect([get('A').ls, get('A').lf]).toEqual([0, 3])
    expect([get('B').ls, get('B').lf]).toEqual([3, 7])
    expect([get('C').ls, get('C').lf]).toEqual([4, 6])
    expect([get('D').ls, get('D').lf]).toEqual([7, 12])
    expect([get('E').ls, get('E').lf]).toEqual([6, 12])
    expect([get('F').ls, get('F').lf]).toEqual([12, 16])
  })
  it('total float and critical flags', () => {
    expect(get('A').totalFloat).toBe(0)
    expect(get('B').totalFloat).toBe(0)
    expect(get('C').totalFloat).toBe(1)
    expect(get('D').totalFloat).toBe(0)
    expect(get('E').totalFloat).toBe(1)
    expect(get('F').totalFloat).toBe(0)
    expect(r.criticalPath).toEqual(['A', 'B', 'D', 'F'])
  })
  it('free float (E can slip 1 without moving F)', () => {
    expect(get('A').freeFloat).toBe(0)
    expect(get('C').freeFloat).toBe(0)   // limited by E starting at 5
    expect(get('E').freeFloat).toBe(1)
    expect(get('F').freeFloat).toBe(0)
  })
  it('the critical path length equals the project duration', () => {
    const len = r.criticalPath.reduce((s, id) => s + get(id).duration, 0)
    expect(len).toBe(r.duration)
  })
})

describe('lead / lag and relation types', () => {
  it('FS with a positive lag delays the successor', () => {
    const r = computeCPM([
      { id: 'A', duration: 5, predecessors: [] },
      { id: 'B', duration: 3, predecessors: [dep('A', 'FS', 2)] },
    ])
    expect([r.activities.get('B')!.es, r.activities.get('B')!.ef]).toEqual([7, 10])
    expect(r.duration).toBe(10)
  })
  it('SS: successor starts lag units after the predecessor starts', () => {
    const r = computeCPM([
      { id: 'A', duration: 5, predecessors: [] },
      { id: 'B', duration: 3, predecessors: [dep('A', 'SS', 1)] },
    ])
    expect([r.activities.get('B')!.es, r.activities.get('B')!.ef]).toEqual([1, 4])
  })
  it('FF: successor finishes lag units after the predecessor finishes', () => {
    const r = computeCPM([
      { id: 'A', duration: 5, predecessors: [] },
      { id: 'B', duration: 3, predecessors: [dep('A', 'FF', 1)] },
    ])
    // EF(B) = EF(A) + 1 = 6 → ES(B) = 3
    expect([r.activities.get('B')!.es, r.activities.get('B')!.ef]).toEqual([3, 6])
  })
  it('a negative lag (lead) is clamped at the project start', () => {
    const r = computeCPM([
      { id: 'A', duration: 5, predecessors: [] },
      { id: 'B', duration: 3, predecessors: [dep('A', 'SS', -10)] },
    ])
    expect(r.activities.get('B')!.es).toBe(0)
  })
})

describe('milestones', () => {
  it('a zero-duration activity has EF = ES', () => {
    const r = computeCPM([
      { id: 'A', duration: 3, predecessors: [] },
      { id: 'M', duration: 0, predecessors: [dep('A')] },
    ])
    const m = r.activities.get('M')!
    expect(m.es).toBe(3)
    expect(m.ef).toBe(3)
  })
})

describe('imposed finish (accelerated target)', () => {
  it('drives total float negative on the critical path', () => {
    const r = computeCPM(NETWORK, { imposedFinish: 14 })   // 2 units early
    expect(r.activities.get('A')!.totalFloat).toBe(-2)
    expect(r.activities.get('F')!.totalFloat).toBe(-2)
    // free float is derived from early dates only → unaffected by the target
    expect(r.activities.get('E')!.freeFloat).toBe(1)
  })
})

describe('circular-dependency detection', () => {
  const cyclic: CpmActivityInput[] = [
    { id: 'A', duration: 1, predecessors: [dep('B')] },
    { id: 'B', duration: 1, predecessors: [dep('A')] },
  ]
  it('findCycle returns the offending loop', () => {
    const cycle = findCycle(cyclic)
    expect(cycle).not.toBeNull()
    expect(cycle).toContain('A')
    expect(cycle).toContain('B')
  })
  it('computeCPM throws ScheduleCycleError', () => {
    expect(() => computeCPM(cyclic)).toThrow(ScheduleCycleError)
  })
  it('an acyclic network yields no cycle', () => {
    expect(findCycle(NETWORK)).toBeNull()
  })
  it('wouldCreateCycle flags a link that closes a loop', () => {
    // A→B exists; adding B as a predecessor of A (i.e. A→B→A) closes a loop.
    expect(wouldCreateCycle(NETWORK, 'A', 'B')).toBe(true)
    expect(wouldCreateCycle(NETWORK, 'X', 'X')).toBe(true)     // self-loop
    expect(wouldCreateCycle(NETWORK, 'F', 'A')).toBe(false)    // A already upstream of F
  })
})

describe('data-integrity guards', () => {
  it('throws on an unknown predecessor id', () => {
    expect(() => computeCPM([
      { id: 'A', duration: 1, predecessors: [dep('ghost')] },
    ])).toThrow(/unknown predecessor/i)
  })
})
