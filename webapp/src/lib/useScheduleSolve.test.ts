import { describe, it, expect } from 'vitest'
import { solveSchedule } from './useScheduleSolve'
import { emptyProject } from './useScheduleProject'
import { sampleProject } from '../engine/schedule/sample'

describe('solveSchedule', () => {
  it('solves the sample project and dates every activity', () => {
    const s = solveSchedule(sampleProject())
    expect(s.ok).toBe(true)
    expect(s.errorCount).toBe(0)
    expect(s.duration).toBeGreaterThan(0)
    expect(s.dates.size).toBe(sampleProject().activities.length)
    expect(s.finishDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // finish date must be on/after the project start
    expect(s.finishDate! >= sampleProject().meta.start).toBe(true)
  })

  it('an empty project solves to zero duration with no finish date', () => {
    const s = solveSchedule(emptyProject())
    expect(s.ok).toBe(true)
    expect(s.duration).toBe(0)
    expect(s.finishDate).toBeNull()
    expect(s.dates.size).toBe(0)
  })

  it('does not throw and reports not-ok on a cyclic project', () => {
    const p = sampleProject()
    // MOB → CLR already exists; add CLR as MOB's predecessor to close a loop.
    p.activities.find((a) => a.id === 'MOB')!.predecessors.push({ predecessor: 'CLR', type: 'FS', lag: 0 })
    const s = solveSchedule(p)
    expect(s.ok).toBe(false)
    expect(s.cpm).toBeNull()
    expect(s.errorCount).toBeGreaterThan(0)
    expect(s.issues.some((i) => i.code === 'dependency-cycle')).toBe(true)
  })
})
