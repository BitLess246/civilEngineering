import { describe, it, expect } from 'vitest'
import type { ScheduleProject } from '../engine/schedule/model'
import { sampleProject } from '../engine/schedule/sample'
import { captureBaseline } from '../engine/schedule/baseline'
import { defaultCalendar } from '../engine/schedule/calendar'
import { solveSchedule } from './useScheduleSolve'
import { analyzeDelays } from './delayAnalysis'

/** Run analyzeDelays on `project` against `baseline`, deriving the live finish. */
function analyze(project: ScheduleProject, baseline: Parameters<typeof analyzeDelays>[2]) {
  const s = solveSchedule(project)
  return analyzeDelays(project, s.cpm!, baseline, s.finishDate!)
}

const baseline = captureBaseline(sampleProject(), 'b1', 'Original plan', '2026-08-01T00:00:00.000Z')

describe('analyzeDelays — sample project', () => {
  it('an unchanged schedule shows no delays', () => {
    const d = analyze(sampleProject(), baseline)
    expect(d.delayedCount).toBe(0)
    expect(d.criticalDelayedCount).toBe(0)
    expect(d.projectSlipDays).toBe(0)
    expect(d.worst).toBeNull()
  })

  it('slipping a critical activity delays it and the project', () => {
    const project = sampleProject()
    project.activities.find((a) => a.id === 'MOB')!.duration = 15   // +10 working days
    const d = analyze(project, baseline)
    const mob = d.activities.find((a) => a.id === 'MOB')!
    expect(mob.criticalDelay).toBe(true)
    expect(mob.finishVarianceDays).toBeGreaterThan(0)
    expect(d.projectSlipDays).toBeGreaterThan(0)
    expect(d.criticalDelayedCount).toBeGreaterThan(0)
    expect(d.activities[0].finishVarianceDays).toBeGreaterThanOrEqual(d.activities[1].finishVarianceDays)  // worst-first
  })

  it('shrinking an activity pulls the project in (negative slip, not a delay)', () => {
    const project = sampleProject()
    project.activities.find((a) => a.id === 'MOB')!.duration = 2    // −3
    const d = analyze(project, baseline)
    expect(d.projectSlipDays).toBeLessThan(0)
    expect(d.delayedCount).toBe(0)
  })

  it('a new tail activity added after the baseline still registers project slip', () => {
    // Old bug: the end activity was absent from the baseline → slip reported 0.
    const project = sampleProject()
    project.activities.push({ id: 'PUNCH', name: 'Punch list', duration: 5, unit: 'days', predecessors: [{ predecessor: 'HAND', type: 'FS', lag: 0 }] })
    const d = analyze(project, baseline)   // baseline has no PUNCH
    expect(d.projectSlipDays).toBeGreaterThan(0)   // finishes later than the baseline end
  })
})

describe('analyzeDelays — project slip vs a re-routed critical path', () => {
  // Two independent chains X and Y. Baseline: X=10 (tail), Y=8.
  // Re-plan: X=5, Y=9 → Y is now the tail, but the project finishes EARLIER
  // (day 9 < baseline day 10). The old max-EF-activity-variance would have
  // wrongly reported a +1-day delay (Y vs its own baseline of 8).
  const proj = (xDur: number, yDur: number): ScheduleProject => {
    const cal = defaultCalendar()
    return {
      meta: { name: 'reroute', start: '2026-01-05' },   // Monday
      calendars: [cal], defaultCalendarId: cal.id, wbs: [], resources: [], baselines: [],
      activities: [
        { id: 'X', name: 'X', duration: xDur, unit: 'days', predecessors: [] },
        { id: 'Y', name: 'Y', duration: yDur, unit: 'days', predecessors: [] },
      ],
    }
  }
  const bl = captureBaseline(proj(10, 8), 'b', 'base', '2026-01-01T00:00:00.000Z')

  it('reports the project finishing earlier despite a locally-slipped critical activity', () => {
    const d = analyze(proj(5, 9), bl)
    expect(d.projectSlipDays).toBeLessThan(0)              // project ends before baseline
    const y = d.activities.find((a) => a.id === 'Y')!
    expect(y.criticalDelay).toBe(true)                     // Y slipped vs its own baseline AND is critical…
    expect(d.criticalDelayedCount).toBeGreaterThan(0)      // …so a critical delay exists, but it doesn't push the finish
  })
})
