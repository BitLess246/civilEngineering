import { describe, it, expect } from 'vitest'
import type { ScheduleProject } from './model'
import { validateProject, isProjectValid } from './validate'
import { sampleProject } from './sample'

/** Clone the sample so each test mutates in isolation. */
const base = (): ScheduleProject => JSON.parse(JSON.stringify(sampleProject()))
const codes = (p: ScheduleProject) => validateProject(p).map((i) => i.code)

describe('validateProject', () => {
  it('the sample project is clean', () => {
    expect(validateProject(sampleProject())).toEqual([])
    expect(isProjectValid(sampleProject())).toBe(true)
  })

  it('flags a duplicate activity id', () => {
    const p = base()
    p.activities.push({ ...p.activities[0] })
    expect(codes(p)).toContain('duplicate-activity-id')
    expect(isProjectValid(p)).toBe(false)
  })

  it('flags an unknown predecessor', () => {
    const p = base()
    p.activities[2].predecessors.push({ predecessor: 'NOPE', type: 'FS', lag: 0 })
    expect(codes(p)).toContain('unknown-predecessor')
  })

  it('flags a self-dependency', () => {
    const p = base()
    p.activities[1].predecessors.push({ predecessor: p.activities[1].id, type: 'FS', lag: 0 })
    expect(codes(p)).toContain('self-dependency')
  })

  it('flags an unknown calendar / WBS / resource reference', () => {
    const p = base()
    p.activities[0].calendarId = 'ghost'
    p.activities[0].wbsId = 'ghostWbs'
    p.activities[0].resources = [{ resourceId: 'ghostRes', quantity: 1 }]
    const c = codes(p)
    expect(c).toContain('unknown-calendar')
    expect(c).toContain('unknown-wbs')
    expect(c).toContain('unknown-resource')
  })

  it('flags an unknown default calendar', () => {
    const p = base()
    p.defaultCalendarId = 'missing'
    expect(codes(p)).toContain('unknown-default-calendar')
  })

  it('flags a dependency cycle', () => {
    const p = base()
    // MOB → CLR already exists; make MOB depend on CLR to close a loop.
    p.activities[0].predecessors.push({ predecessor: 'CLR', type: 'FS', lag: 0 })
    expect(codes(p)).toContain('dependency-cycle')
  })

  it('flags a WBS parent cycle', () => {
    const p = base()
    const w1 = p.wbs.find((w) => w.id === 'w1')!
    w1.parentId = 'w1.1'   // w1 → w1.1 → w1
    expect(codes(p)).toContain('wbs-cycle')
  })

  it('errors on negative duration; warns on milestone-with-duration and bad percent', () => {
    const p = base()
    p.activities[3].duration = -2
    p.activities.find((x) => x.id === 'HAND')!.duration = 4      // milestone but non-zero
    p.activities[2].percentComplete = 140
    const c = codes(p)
    expect(c).toContain('negative-duration')
    expect(c).toContain('milestone-duration')
    expect(c).toContain('percent-out-of-range')
  })
})
