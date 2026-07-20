import { describe, it, expect } from 'vitest'
import { sampleProject } from './sample'
import { validateProject } from './validate'
import { computeCPM } from './cpm'
import { computePert } from './pert'

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

  it('solves through PERT (project TE ≥ 0, variance ≥ 0)', () => {
    const pert = computePert(sampleProject().activities.map((a) => ({
      id: a.id, optimistic: a.optimistic, mostLikely: a.mostLikely,
      pessimistic: a.pessimistic, duration: a.duration, predecessors: a.predecessors,
    })))
    expect(pert.projectTe).toBeGreaterThan(0)
    expect(pert.projectVariance).toBeGreaterThanOrEqual(0)
  })
})
