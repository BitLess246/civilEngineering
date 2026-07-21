import { describe, it, expect } from 'vitest'
import type { CpmActivity, CpmResult } from '../engine/schedule/cpm'
import type { Resource } from '../engine/schedule/model'
import { resourceLoad, hasOverAllocation, type LoadActivity } from './resourceLoad'

/** Build a minimal CpmResult from explicit es/ef rows (isolates the loader). */
const mkCpm = (rows: { id: string; es: number; ef: number; duration: number }[]): CpmResult => ({
  activities: new Map(rows.map((r) => [r.id, {
    id: r.id, duration: r.duration, es: r.es, ef: r.ef, ls: r.es, lf: r.ef,
    totalFloat: 0, freeFloat: 0, critical: false,
  } as CpmActivity])),
  order: rows.map((r) => r.id),
  duration: Math.max(...rows.map((r) => r.ef)),
  finish: Math.max(...rows.map((r) => r.ef)),
  criticalPath: [],
})

const R: Resource = { id: 'R', name: 'Crew', type: 'labor', unit: 'man-day', availablePerDay: 8 }

// A (5 d, days 0–4, 30 units → 6/day) overlaps B (4 d, days 3–6, 20 units → 5/day).
const activities: LoadActivity[] = [
  { id: 'A', duration: 5, resources: [{ resourceId: 'R', quantity: 30 }] },
  { id: 'B', duration: 4, resources: [{ resourceId: 'R', quantity: 20 }] },
]
const cpm = mkCpm([{ id: 'A', es: 0, ef: 5, duration: 5 }, { id: 'B', es: 3, ef: 7, duration: 4 }])

describe('resourceLoad', () => {
  const [load] = resourceLoad(activities, cpm, [R], 7)

  it('spreads each assignment over its span and sums overlaps', () => {
    expect(load.perDay).toEqual([6, 6, 6, 11, 11, 5, 5])   // 6/day A, +5/day B on days 3–4
  })
  it('reports the peak, its day and the total units', () => {
    expect(load.peak).toBe(11)
    expect(load.peakDay).toBe(3)
    expect(load.total).toBe(50)
  })
  it('flags days over availablePerDay', () => {
    expect(load.available).toBe(8)
    expect(load.overDays).toBe(2)                          // days 3 and 4 (11 > 8)
    expect(hasOverAllocation([load])).toBe(true)
  })
})

describe('edge cases', () => {
  it('no limit ⇒ zero over-days regardless of demand', () => {
    const [load] = resourceLoad(activities, cpm, [{ ...R, availablePerDay: undefined }], 7)
    expect(load.available).toBeNull()
    expect(load.overDays).toBe(0)
    expect(load.peak).toBe(11)
  })
  it('a milestone (duration 0) and an unused resource contribute nothing', () => {
    const acts: LoadActivity[] = [{ id: 'M', duration: 0, resources: [{ resourceId: 'R', quantity: 5 }] }]
    const [load] = resourceLoad(acts, mkCpm([{ id: 'M', es: 3, ef: 3, duration: 0 }]), [R], 7)
    expect(load.perDay.every((v) => v === 0)).toBe(true)
    expect(load.total).toBe(0)
    expect(hasOverAllocation([load])).toBe(false)
  })
  it('sums multiple assignments of the same resource on one activity', () => {
    const [load] = resourceLoad(
      [{ id: 'A', duration: 3, resources: [{ resourceId: 'R', quantity: 10 }, { resourceId: 'R', quantity: 5 }] }],
      mkCpm([{ id: 'A', es: 0, ef: 3, duration: 3 }]), [R], 3,
    )
    expect(load.total).toBe(15)               // 10 + 5
    expect(load.perDay).toEqual([5, 5, 5])    // 15 / 3 days
  })
  it('an empty project yields an empty load with no peak', () => {
    const emptyCpm = { activities: new Map(), order: [], duration: 0, finish: 0, criticalPath: [] } as CpmResult
    const [load] = resourceLoad([], emptyCpm, [R], 0)
    expect(load.perDay).toEqual([])
    expect(load.total).toBe(0)
    expect(load.peak).toBe(0)
    expect(hasOverAllocation([load])).toBe(false)
  })
  it('clamps activity spans to the timeline window', () => {
    const [load] = resourceLoad(
      [{ id: 'A', duration: 5, resources: [{ resourceId: 'R', quantity: 10 }] }],
      mkCpm([{ id: 'A', es: 0, ef: 5, duration: 5 }]), [R], 3,   // window shorter than the activity
    )
    expect(load.perDay).toHaveLength(3)
    expect(load.perDay).toEqual([2, 2, 2])
  })
})
