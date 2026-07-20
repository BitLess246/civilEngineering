import { describe, it, expect } from 'vitest'
import type { Activity } from './model'
import { computeCPM } from './cpm'
import {
  activityRemainingDuration, plannedPercentComplete, rollupPercentComplete,
  deriveStatus, projectProgress, baselineVariance,
} from './progress'

/** Minimal Activity factory. */
const act = (id: string, duration: number, over: Partial<Activity> = {}): Activity => ({
  id, name: id, duration, unit: 'days', predecessors: [], ...over,
})

describe('activity-level helpers', () => {
  it('remaining duration = duration·(1 − %/100)', () => {
    expect(activityRemainingDuration(10, 30)).toBeCloseTo(7, 9)
    expect(activityRemainingDuration(10, undefined)).toBe(10)
    expect(activityRemainingDuration(10, 150)).toBe(0)     // clamped
  })
  it('planned % complete from the schedule', () => {
    expect(plannedPercentComplete(0, 10, 5)).toBe(50)
    expect(plannedPercentComplete(0, 10, 0)).toBe(0)
    expect(plannedPercentComplete(0, 10, 10)).toBe(100)
  })
  it('duration-weighted roll-up', () => {
    expect(rollupPercentComplete([{ weight: 10, percentComplete: 100 }, { weight: 10, percentComplete: 0 }])).toBe(50)
    expect(rollupPercentComplete([{ weight: 20, percentComplete: 50 }, { weight: 10, percentComplete: 100 }]))
      .toBeCloseTo(200 / 3, 9)   // (1000+1000)/30
  })
})

describe('deriveStatus', () => {
  const ctx = { dataDate: 5, es: 0, ef: 10 }
  it('completed when %≥100 or an actual finish exists', () => {
    expect(deriveStatus(act('A', 10, { percentComplete: 100 }), ctx)).toBe('completed')
    expect(deriveStatus(act('A', 10, { actualFinish: '2026-01-10' }), ctx)).toBe('completed')
  })
  it('preserves an explicit blocked flag', () => {
    expect(deriveStatus(act('A', 10, { status: 'blocked', percentComplete: 40 }), ctx)).toBe('blocked')
  })
  it('in-progress when on or ahead of the planned curve', () => {
    // planned at dataDate 5 = 50%; actual 50 ⇒ on track
    expect(deriveStatus(act('A', 10, { percentComplete: 50 }), ctx)).toBe('in-progress')
  })
  it('delayed when behind the planned curve', () => {
    expect(deriveStatus(act('A', 10, { percentComplete: 20 }), ctx)).toBe('delayed')
  })
  it('delayed when past its finish but unfinished', () => {
    expect(deriveStatus(act('A', 10, { percentComplete: 50 }), { dataDate: 12, es: 0, ef: 10 })).toBe('delayed')
  })
  it('not-started before its planned start; delayed after it', () => {
    expect(deriveStatus(act('A', 10, { percentComplete: 0 }), { dataDate: 0, es: 0, ef: 10 })).toBe('not-started')
    expect(deriveStatus(act('A', 10, { percentComplete: 0 }), { dataDate: 5, es: 0, ef: 10 })).toBe('delayed')
  })
})

describe('projectProgress roll-up', () => {
  // A(4) → B(6): single critical chain, project duration 10.
  const activities = [
    act('A', 4, { percentComplete: 100 }),
    act('B', 6, { percentComplete: 0, predecessors: [{ predecessor: 'A', type: 'FS', lag: 0 }] }),
  ]
  const cpm = computeCPM(activities)

  it('on-plan at data date 4 (A done, B due to start)', () => {
    const p = projectProgress(activities, cpm, 4)
    expect(p.plannedPercent).toBeCloseTo(40, 6)   // 4 of 10 work-days planned
    expect(p.actualPercent).toBeCloseTo(40, 6)
    expect(p.scheduleVariancePercent).toBeCloseTo(0, 6)
    expect(p.spi!).toBeCloseTo(1, 6)
    expect(p.daysAheadBehind).toBeCloseTo(0, 3)
    expect(p.completed).toBe(1)
    expect(p.notStarted).toBe(1)
    expect(p.critical).toBe(2)
    expect(p.remainingDuration).toBe(6)
    expect(p.plannedDuration).toBe(10)
  })

  it('behind schedule when B is late to start (data date 7)', () => {
    const p = projectProgress(activities, cpm, 7)
    expect(p.plannedPercent).toBeCloseTo(70, 6)   // 4 + 6·0.5
    expect(p.actualPercent).toBeCloseTo(40, 6)
    expect(p.scheduleVariancePercent).toBeCloseTo(-30, 6)
    expect(p.spi!).toBeCloseTo(4 / 7, 6)
    expect(p.daysAheadBehind).toBeCloseTo(-3, 3)  // earned schedule 4, data date 7
    expect(p.delayed).toBe(1)                     // B should have started
    expect(p.forecastDuration).toBeCloseTo(10 / (4 / 7), 4)
  })

  it('skips activities missing from the CPM result', () => {
    const p = projectProgress([...activities, act('ghost', 5)], cpm, 4)
    expect(p.total).toBe(2)
  })
})

describe('baselineVariance', () => {
  it('current − baseline (positive = slip)', () => {
    const v = baselineVariance({ start: 2, finish: 12, duration: 10 }, { start: 0, finish: 10, duration: 10 })
    expect(v).toEqual({ startVariance: 2, finishVariance: 2, durationVariance: 0 })
  })
})
