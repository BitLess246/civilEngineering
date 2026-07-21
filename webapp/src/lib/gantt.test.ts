import { describe, it, expect } from 'vitest'
import { buildScale, buildTicks, barEdgeX, ZOOM, ZOOM_LEVELS } from './gantt'

describe('buildScale', () => {
  const s = buildScale('2026-08-03', '2026-10-19', 4, 2)  // origin 08-01, end 10-21

  it('origin is start − pad; width covers the padded span', () => {
    expect(s.origin.toISOString().slice(0, 10)).toBe('2026-08-01')
    expect(s.totalDays).toBe(82)                 // 08-01 … 10-21 inclusive
    expect(s.totalWidth).toBe(82 * 4)
  })
  it('x is a monotonic day→pixel map', () => {
    expect(s.x('2026-08-01')).toBe(0)
    expect(s.x('2026-08-03')).toBe(2 * 4)        // 2 days in
    expect(s.dayOffset('2026-08-03')).toBe(2)
    expect(s.x('2026-08-03')).toBeLessThan(s.x('2026-08-04'))
  })
  it('bar width is inclusive of the finish day', () => {
    expect(s.barWidth('2026-08-03', '2026-08-07')).toBe(5 * 4)   // 5 days
    expect(s.barWidth('2026-08-03', '2026-08-03')).toBe(4)       // 1 day
  })
  it('a milestone (same start/finish) never collapses below the floor', () => {
    const fine = buildScale('2026-08-03', '2026-10-19', 0.7, 2)  // year zoom
    expect(fine.barWidth('2026-09-01', '2026-09-01')).toBeGreaterThanOrEqual(3)
  })
})

describe('barEdgeX (dependency-connector anchoring)', () => {
  const s = buildScale('2026-08-03', '2026-10-19', 4, 2)  // origin 08-01, 4 px/day

  it('the finish edge is the bar’s rendered right edge = x(start) + barWidth', () => {
    const start = '2026-08-03', finish = '2026-08-07'      // 5-day bar
    expect(barEdgeX(s, start, finish, 'start')).toBe(s.x(start))        // 8
    expect(barEdgeX(s, start, finish, 'finish')).toBe(s.x(start) + s.barWidth(start, finish)) // 28
    expect(barEdgeX(s, start, finish, 'finish')).toBe(28)
  })
  it('does NOT overshoot via x(finish) + barWidth (the fixed bug)', () => {
    const start = '2026-08-03', finish = '2026-08-07'
    const buggy = s.x(finish) + s.barWidth(start, finish)  // 24 + 20 = 44
    expect(barEdgeX(s, start, finish, 'finish')).toBeLessThan(buggy)
    expect(barEdgeX(s, start, finish, 'finish')).toBe(44 - (5 - 1) * s.pxPerDay) // 28
  })
})

describe('buildTicks', () => {
  it('month ticks land on the 1st with month labels', () => {
    const s = buildScale('2026-08-03', '2026-10-19', 4, 2)
    const ticks = buildTicks(s, 'month')
    expect(ticks.map((t) => t.label)).toEqual(['Aug', 'Sep', 'Oct'])
    expect(ticks[0].x).toBe(0)                    // 08-01 == origin
    expect(ticks.every((t) => t.x >= 0 && t.x <= s.totalWidth)).toBe(true)
  })
  it('January is a major tick carrying the year', () => {
    const s = buildScale('2026-12-10', '2027-02-05', 4, 2)
    const ticks = buildTicks(s, 'month')
    const jan = ticks.find((t) => t.label.startsWith('Jan'))!
    expect(jan.label).toBe('Jan 2027')
    expect(jan.major).toBe(true)
  })
  it('labels the leading partial period at the left edge (x=0) for a mid-month origin', () => {
    const s = buildScale('2026-08-15', '2026-09-20', 4, 2)  // origin 08-13 (mid-month)
    const ticks = buildTicks(s, 'month')
    expect(ticks[0].label).toBe('Aug')                       // the month CONTAINING origin
    expect(ticks[0].x).toBe(0)                               // clamped from a negative raw x
  })

  it('day ticks are one per day', () => {
    const s = buildScale('2026-08-03', '2026-08-10', 26, 1)
    const ticks = buildTicks(s, 'day')
    expect(ticks).toHaveLength(s.totalDays)
  })
  it('quarter ticks label the quarter', () => {
    const s = buildScale('2026-02-01', '2026-11-30', 1.5, 2)
    const ticks = buildTicks(s, 'quarter')
    expect(ticks.map((t) => t.label)).toEqual(["Q1 '26", "Q2 '26", "Q3 '26", "Q4 '26"])
  })
})

describe('ZOOM presets', () => {
  it('pixels-per-day shrink from day → year', () => {
    const pk = ZOOM_LEVELS.map((z) => ZOOM[z].pxPerDay)
    for (let i = 1; i < pk.length; i++) expect(pk[i]).toBeLessThan(pk[i - 1])
  })
})
