import { describe, it, expect } from 'vitest'
import type { Dependency } from './model'
import {
  pertExpected, pertVariance, pertStdDev, computePert,
  erf, normalCdf, invNormalCdf, completionProbability, durationForProbability,
  type PertActivityInput,
} from './pert'

const dep = (predecessor: string): Dependency => ({ predecessor, type: 'FS', lag: 0 })

describe('three-point estimate', () => {
  it('TE = (O + 4M + P)/6', () => {
    expect(pertExpected(2, 4, 6)).toBeCloseTo(4, 12)
    expect(pertExpected(3, 3, 9)).toBeCloseTo(4, 12)          // skew toward P
  })
  it('variance = ((P − O)/6)² and σ = (P − O)/6', () => {
    expect(pertVariance(2, 6)).toBeCloseTo((4 / 6) ** 2, 12)  // 0.4444
    expect(pertStdDev(2, 6)).toBeCloseTo(4 / 6, 12)
    expect(pertVariance(5, 5)).toBe(0)                        // certain activity
  })
})

// Three activities in series → all critical.
const SERIES: PertActivityInput[] = [
  { id: 'A', optimistic: 1, mostLikely: 2, pessimistic: 3, predecessors: [] },
  { id: 'B', optimistic: 2, mostLikely: 4, pessimistic: 6, predecessors: [dep('A')] },
  { id: 'C', optimistic: 3, mostLikely: 3, pessimistic: 9, predecessors: [dep('B')] },
]

describe('computePert on a series network', () => {
  const pert = computePert(SERIES)
  it('per-activity TE and variance', () => {
    expect(pert.activities.get('A')!.te).toBeCloseTo(2, 9)
    expect(pert.activities.get('B')!.te).toBeCloseTo(4, 9)
    expect(pert.activities.get('C')!.te).toBeCloseTo(4, 9)
    expect(pert.activities.get('C')!.variance).toBeCloseTo(1, 9)
  })
  it('project TE is the critical-path length', () => {
    expect(pert.projectTe).toBeCloseTo(10, 9)
  })
  it('project variance is the sum along the critical path', () => {
    expect(pert.projectVariance).toBeCloseTo(1 / 9 + 4 / 9 + 1, 9)   // ≈1.5556
    expect(pert.projectSd).toBeCloseTo(Math.sqrt(1 / 9 + 4 / 9 + 1), 9)
  })
  it('completion probability at TE is 50%', () => {
    expect(completionProbability(pert, 10)).toBeCloseTo(0.5, 6)
  })
  it('completion probability rises above TE', () => {
    expect(completionProbability(pert, 12)).toBeCloseTo(0.9456, 3)
  })
  it('durationForProbability inverts completionProbability', () => {
    expect(durationForProbability(pert, 0.5)).toBeCloseTo(10, 6)
    const t90 = durationForProbability(pert, 0.9)
    expect(completionProbability(pert, t90)).toBeCloseTo(0.9, 6)
  })
})

describe('project variance uses only the critical path', () => {
  // A→B→D critical; A→C→D with C off the critical path (and zero-variance).
  const net: PertActivityInput[] = [
    { id: 'A', optimistic: 1, mostLikely: 2, pessimistic: 3, predecessors: [] },
    { id: 'B', optimistic: 3, mostLikely: 4, pessimistic: 5, predecessors: [dep('A')] },
    { id: 'C', optimistic: 1, mostLikely: 1, pessimistic: 1, predecessors: [dep('A')] },
    { id: 'D', optimistic: 2, mostLikely: 3, pessimistic: 4, predecessors: [dep('B'), dep('C')] },
  ]
  const pert = computePert(net)
  it('critical path is A→B→D, duration 9', () => {
    expect(pert.projectTe).toBeCloseTo(9, 9)
    expect(pert.cpm.criticalPath).toEqual(['A', 'B', 'D'])
  })
  it('variance sums A, B, D only (C excluded)', () => {
    expect(pert.projectVariance).toBeCloseTo(3 * (2 / 6) ** 2, 9)     // 3 × 0.1111
  })
})

describe('deterministic fallback', () => {
  it('uses `duration` and zero variance when O/M/P are absent', () => {
    const pert = computePert([
      { id: 'A', duration: 5, predecessors: [] },
    ])
    expect(pert.projectTe).toBe(5)
    expect(pert.projectVariance).toBe(0)
    expect(completionProbability(pert, 5)).toBe(1)     // zero-variance meets target
    expect(completionProbability(pert, 4)).toBe(0)
  })
})

describe('normal-distribution helpers', () => {
  it('erf endpoints', () => {
    expect(erf(0)).toBeCloseTo(0, 8)          // A&S 7.1.26 residual ≈1e-9 at 0
    expect(erf(3)).toBeCloseTo(1, 3)
    expect(erf(-1)).toBeCloseTo(-erf(1), 12)            // odd function
  })
  it('normalCdf at standard points', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 8)
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3)
    expect(normalCdf(-1)).toBeCloseTo(0.158655, 4)
  })
  it('invNormalCdf inverts normalCdf', () => {
    expect(invNormalCdf(0.5)).toBeCloseTo(0, 9)
    expect(invNormalCdf(0.975)).toBeCloseTo(1.959964, 4)
    expect(normalCdf(invNormalCdf(0.9))).toBeCloseTo(0.9, 6)
    expect(invNormalCdf(0)).toBe(-Infinity)
    expect(invNormalCdf(1)).toBe(Infinity)
  })
})
