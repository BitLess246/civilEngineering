import { describe, it, expect } from 'vitest'
import type { WorkingCalendar } from '../engine/schedule/model'
import { MON_FRI, durationEndDate, parseISO, toISO } from '../engine/schedule/calendar'
import { dataDateOffset, forecastFinishISO } from './scheduleDates'

// 2026-01-05 is a Monday; the working week is Mon–Fri.
const cal: WorkingCalendar = { id: 'c', name: 'Std', workweek: [...MON_FRI], holidays: [] }
const START = '2026-01-05'
// A 5-working-day schedule (Mon 01-05 … Fri 01-09); finish = inclusive last day.
const FINISH = toISO(durationEndDate(cal, parseISO(START), 5)) // 2026-01-09

describe('dataDateOffset (inclusive through the data date)', () => {
  it('the last working day equals the project duration', () => {
    expect(FINISH).toBe('2026-01-09')
    expect(dataDateOffset(cal, START, FINISH)).toBe(5)   // NOT 4 — a complete project is 100% planned
  })
  it('the start date counts as one elapsed working day', () => {
    expect(dataDateOffset(cal, START, START)).toBe(1)
  })
  it('skips the weekend', () => {
    expect(dataDateOffset(cal, START, '2026-01-07')).toBe(3)   // Mon,Tue,Wed
  })
  it('clamps dates before the project start to 0', () => {
    expect(dataDateOffset(cal, START, '2026-01-01')).toBe(0)
  })
})

describe('forecastFinishISO (inclusive last day, mirrors finishDate)', () => {
  it('an on-schedule forecast (duration = D) lands on the planned finish', () => {
    expect(forecastFinishISO(cal, START, 5)).toBe(FINISH)   // NOT one day late
  })
  it('a longer forecast pushes the finish later; shorter, earlier', () => {
    expect(forecastFinishISO(cal, START, 7) > FINISH).toBe(true)
    expect(forecastFinishISO(cal, START, 3) < FINISH).toBe(true)
  })
  it('round-trips with dataDateOffset', () => {
    // finish date of a D-day schedule → back to offset D
    expect(dataDateOffset(cal, START, forecastFinishISO(cal, START, 5))).toBe(5)
  })
  it('degenerate durations stay finite and clamped', () => {
    expect(forecastFinishISO(cal, START, 0)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(forecastFinishISO(cal, START, 1e9)).toMatch(/^\d{4}-\d{2}-\d{2}$/)  // guarded, no freeze
  })
})
