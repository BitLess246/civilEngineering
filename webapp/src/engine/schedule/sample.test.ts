import { describe, it, expect } from 'vitest'
import { sampleProject } from './sample'
import { validateProject } from './validate'
import { computeCPM } from './cpm'
import { computePert } from './pert'
import { layoutNetwork } from '../../lib/network'

describe('sampleProject fixture', () => {
  it('is structurally valid', () => {
    expect(validateProject(sampleProject())).toEqual([])
  })

  it('returns an independent copy each call', () => {
    const p1 = sampleProject()
    const p2 = sampleProject()
    p1.activities[0].duration = 999
    expect(p2.activities[0].duration).not.toBe(999)
  })

  it('solves through CPM with a non-trivial critical path', () => {
    const cpm = computeCPM(sampleProject().activities)
    expect(cpm.duration).toBeGreaterThan(0)
    expect(cpm.criticalPath.length).toBeGreaterThan(1)
    expect(cpm.criticalPath).toContain('HAND')          // handover milestone ends the job
    // every activity got scheduled
    expect(cpm.activities.size).toBe(sampleProject().activities.length)
  })

  // ── The fixture has to BRANCH ───────────────────────────────────────
  // It used to be one chain of thirteen activities: valid, solvable, and a
  // completely misleading picture of a construction programme. The network
  // diagram drew it as a single straight line because that is what it was.
  it('is not a single chain — activities run in parallel', () => {
    const p = sampleProject()
    const cpm = computeCPM(p.activities)
    const L = layoutNetwork(
      p.activities.map((a) => ({ id: a.id, name: a.name, predecessors: a.predecessors, milestone: a.milestone })),
      cpm,
    )
    // Strictly fewer columns than activities means at least one column holds
    // more than one activity — i.e. work happening at the same time.
    expect(L.cols).toBeLessThan(p.activities.length)
    const perCol = new Map<number, number>()
    for (const n of L.nodes) perCol.set(n.col, (perCol.get(n.col) ?? 0) + 1)
    expect(Math.max(...perCol.values())).toBeGreaterThan(1)
  })

  it('fans out and converges — some activity has 3+ predecessors', () => {
    const p = sampleProject()
    expect(Math.max(...p.activities.map((a) => a.predecessors.length))).toBeGreaterThanOrEqual(3)
    // and some activity drives more than one successor
    const succ = new Map<string, number>()
    for (const a of p.activities) {
      for (const d of a.predecessors) succ.set(d.predecessor, (succ.get(d.predecessor) ?? 0) + 1)
    }
    expect(Math.max(...succ.values())).toBeGreaterThanOrEqual(2)
  })

  it('has genuine float — a chain makes everything critical', () => {
    const cpm = computeCPM(sampleProject().activities)
    const slack = [...cpm.activities.values()].filter((a) => a.totalFloat > 0)
    expect(slack.length).toBeGreaterThanOrEqual(3)
  })

  it('uses all four relation types', () => {
    const kinds = new Set(sampleProject().activities.flatMap((a) => a.predecessors.map((d) => d.type)))
    expect(kinds.has('FS')).toBe(true)
    expect(kinds.has('SS')).toBe(true)
    expect(kinds.has('FF')).toBe(true)
  })

  it('solves through PERT (project TE ≥ 0, variance ≥ 0)', () => {
    const pert = computePert(sampleProject().activities.map((a) => ({
      id: a.id, optimistic: a.optimistic, mostLikely: a.mostLikely,
      pessimistic: a.pessimistic, duration: a.duration, predecessors: a.predecessors,
    })))
    expect(pert.projectTe).toBeGreaterThan(0)
    expect(pert.projectVariance).toBeGreaterThanOrEqual(0)
  })
})
