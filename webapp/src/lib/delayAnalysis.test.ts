import { describe, it, expect } from 'vitest'
import { sampleProject } from '../engine/schedule/sample'
import { computeCPM } from '../engine/schedule/cpm'
import { captureBaseline } from '../engine/schedule/baseline'
import { analyzeDelays } from './delayAnalysis'

// Baseline captured from the unmodified sample.
const baseline = captureBaseline(sampleProject(), 'b1', 'Original plan', '2026-08-01T00:00:00.000Z')

describe('analyzeDelays', () => {
  it('an unchanged schedule shows no delays', () => {
    const project = sampleProject()
    const d = analyzeDelays(project, computeCPM(project.activities), baseline)
    expect(d.delayedCount).toBe(0)
    expect(d.criticalDelayedCount).toBe(0)
    expect(d.projectSlipDays).toBe(0)
    expect(d.worst).toBeNull()
    expect(d.activities.every((a) => !a.delayed)).toBe(true)
  })

  it('slipping a critical activity delays it and the project', () => {
    const project = sampleProject()
    project.activities.find((a) => a.id === 'MOB')!.duration = 15   // +10 working days
    const d = analyzeDelays(project, computeCPM(project.activities), baseline)

    const mob = d.activities.find((a) => a.id === 'MOB')!
    expect(mob.delayed).toBe(true)
    expect(mob.critical).toBe(true)
    expect(mob.criticalDelay).toBe(true)
    expect(mob.finishVarianceDays).toBeGreaterThan(0)

    expect(d.projectSlipDays).toBeGreaterThan(0)   // MOB is on the critical chain
    expect(d.delayedCount).toBeGreaterThan(0)
    expect(d.criticalDelayedCount).toBeGreaterThan(0)
    expect(d.worst).not.toBeNull()
    // activities are sorted worst-first
    expect(d.activities[0].finishVarianceDays).toBeGreaterThanOrEqual(d.activities[1].finishVarianceDays)
  })

  it('shrinking an activity pulls the project in (negative slip is not a delay)', () => {
    const project = sampleProject()
    project.activities.find((a) => a.id === 'MOB')!.duration = 2    // −3
    const d = analyzeDelays(project, computeCPM(project.activities), baseline)
    expect(d.projectSlipDays).toBeLessThan(0)
    expect(d.delayedCount).toBe(0)                 // finishing early is not "delayed"
  })
})
