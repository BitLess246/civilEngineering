import { describe, it, expect } from 'vitest'
import { captureBaseline, baselineDateVariance } from './baseline'
import { sampleProject } from './sample'

describe('captureBaseline', () => {
  const bl = captureBaseline(sampleProject(), 'b1', 'Original plan', '2026-08-01T00:00:00.000Z')

  it('records ISO start/finish/duration for every activity', () => {
    const p = sampleProject()
    expect(Object.keys(bl.activities)).toHaveLength(p.activities.length)
    for (const a of p.activities) {
      const e = bl.activities[a.id]
      expect(e.start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(e.finish).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(e.duration).toBe(a.duration)
    }
  })

  it('a milestone starts and finishes on the same date', () => {
    expect(bl.activities['HAND'].start).toBe(bl.activities['HAND'].finish)
  })

  it('finish dates never precede start dates', () => {
    for (const e of Object.values(bl.activities)) expect(e.finish >= e.start).toBe(true)
  })
})

describe('baselineDateVariance', () => {
  it('is zero against an unchanged schedule', () => {
    const project = sampleProject()
    const bl = captureBaseline(project, 'b1', 'Plan')
    const v = baselineDateVariance(project, bl)
    for (const dv of v.values()) {
      expect(dv.startVarianceDays).toBe(0)
      expect(dv.finishVarianceDays).toBe(0)
      expect(dv.durationVariance).toBe(0)
    }
  })

  it('captures downstream slip when an early activity grows', () => {
    const project = sampleProject()
    const bl = captureBaseline(project, 'b1', 'Plan')
    // Mobilization slips from 5 to 10 working days → everything downstream shifts.
    project.activities.find((a) => a.id === 'MOB')!.duration = 10
    const v = baselineDateVariance(project, bl)

    expect(v.get('MOB')!.durationVariance).toBe(5)
    expect(v.get('MOB')!.startVarianceDays).toBe(0)          // still starts on day 0
    expect(v.get('MOB')!.finishVarianceDays).toBeGreaterThan(0)
    expect(v.get('CLR')!.startVarianceDays).toBeGreaterThan(0) // successor pushed later
    expect(v.get('HAND')!.finishVarianceDays).toBeGreaterThan(0)
  })
})
