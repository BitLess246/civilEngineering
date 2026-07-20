import { describe, it, expect } from 'vitest'
import type { WorkingCalendar } from './model'
import {
  MON_FRI, MON_SAT, parseISO, toISO, addDays, calendarDaysBetween,
  isWorkingDay, nextWorkingDay, prevWorkingDay, addWorkingDays,
  workingDaysBetween, offsetToDate, durationEndDate, defaultCalendar,
} from './calendar'

// 2026-01-01 is a Thursday; 01-03 Sat, 01-04 Sun, 01-05 Mon, 01-06 Tue.
const cal: WorkingCalendar = { id: 'c', name: 'Std', workweek: [...MON_FRI], holidays: [] }

describe('date primitives', () => {
  it('parses / formats ISO at UTC midnight (round-trip)', () => {
    const d = parseISO('2026-01-01')
    expect(d.getUTCFullYear()).toBe(2026)
    expect(d.getUTCDay()).toBe(4)                 // Thursday
    expect(toISO(d)).toBe('2026-01-01')
  })
  it('addDays and calendarDaysBetween are inverse', () => {
    const a = parseISO('2026-01-01')
    expect(toISO(addDays(a, 7))).toBe('2026-01-08')
    expect(calendarDaysBetween(a, parseISO('2026-01-08'))).toBe(7)
    expect(calendarDaysBetween(parseISO('2026-01-08'), a)).toBe(-7)
  })
})

describe('isWorkingDay', () => {
  it('honours the Mon–Fri workweek', () => {
    expect(isWorkingDay(cal, parseISO('2026-01-02'))).toBe(true)   // Fri
    expect(isWorkingDay(cal, parseISO('2026-01-03'))).toBe(false)  // Sat
    expect(isWorkingDay(cal, parseISO('2026-01-04'))).toBe(false)  // Sun
  })
  it('excludes holidays', () => {
    const h: WorkingCalendar = { ...cal, holidays: ['2026-01-05'] }
    expect(isWorkingDay(h, parseISO('2026-01-05'))).toBe(false)    // Mon holiday
  })
})

describe('next / prev working day', () => {
  it('nextWorkingDay skips the weekend', () => {
    expect(toISO(nextWorkingDay(cal, parseISO('2026-01-03')))).toBe('2026-01-05') // Sat→Mon
    expect(toISO(nextWorkingDay(cal, parseISO('2026-01-02')))).toBe('2026-01-02') // Fri→Fri
  })
  it('nextWorkingDay skips a holiday too', () => {
    const h: WorkingCalendar = { ...cal, holidays: ['2026-01-05'] }
    expect(toISO(nextWorkingDay(h, parseISO('2026-01-03')))).toBe('2026-01-06') // Sat/Sun/Mon-holiday → Tue
  })
  it('prevWorkingDay walks backward past the weekend', () => {
    expect(toISO(prevWorkingDay(cal, parseISO('2026-01-04')))).toBe('2026-01-02') // Sun→Fri
  })
})

describe('addWorkingDays', () => {
  it('day-0 is the (snapped) start day itself', () => {
    expect(toISO(addWorkingDays(cal, parseISO('2026-01-02'), 0))).toBe('2026-01-02') // Fri
    expect(toISO(addWorkingDays(cal, parseISO('2026-01-03'), 0))).toBe('2026-01-05') // Sat snaps to Mon
  })
  it('steps across the weekend', () => {
    // Thu(01) +3 working days → Fri(02), Mon(05), Tue(06)
    expect(toISO(addWorkingDays(cal, parseISO('2026-01-01'), 3))).toBe('2026-01-06')
    // Fri(02) +1 → Mon(05)
    expect(toISO(addWorkingDays(cal, parseISO('2026-01-02'), 1))).toBe('2026-01-05')
  })
  it('a Mon–Sat calendar counts Saturday', () => {
    const six: WorkingCalendar = { ...cal, workweek: [...MON_SAT] }
    // Fri(02) +1 → Sat(03) because Saturday is worked
    expect(toISO(addWorkingDays(six, parseISO('2026-01-02'), 1))).toBe('2026-01-03')
  })
  it('rejects a negative count', () => {
    expect(() => addWorkingDays(cal, parseISO('2026-01-01'), -1)).toThrow()
  })
})

describe('workingDaysBetween', () => {
  it('counts working days in [from, to)', () => {
    // 01Thu,02Fri,(03,04 weekend),05Mon,06Tue,07Wed → 5 working days before the 8th
    expect(workingDaysBetween(cal, parseISO('2026-01-01'), parseISO('2026-01-08'))).toBe(5)
  })
  it('is zero for an empty / reversed interval', () => {
    expect(workingDaysBetween(cal, parseISO('2026-01-08'), parseISO('2026-01-01'))).toBe(0)
    expect(workingDaysBetween(cal, parseISO('2026-01-01'), parseISO('2026-01-01'))).toBe(0)
  })
})

describe('offset → date projection', () => {
  it('offset 0 is the first working day on/after project start', () => {
    expect(toISO(offsetToDate(cal, parseISO('2026-01-03'), 0))).toBe('2026-01-05') // Sat start → Mon
    expect(toISO(offsetToDate(cal, parseISO('2026-01-01'), 2))).toBe('2026-01-05') // Thu +2 → Mon
  })
  it('durationEndDate is the inclusive last working day', () => {
    // start Thu(01), 3 working days → Thu, Fri, Mon → ends 01-05
    expect(toISO(durationEndDate(cal, parseISO('2026-01-01'), 3))).toBe('2026-01-05')
  })
  it('a milestone (duration 0) resolves to its snapped day', () => {
    expect(toISO(durationEndDate(cal, parseISO('2026-01-03'), 0))).toBe('2026-01-05')
  })
})

describe('guards', () => {
  it('defaultCalendar is Mon–Fri with 8h days', () => {
    const d = defaultCalendar()
    expect(d.workweek).toEqual(MON_FRI)
    expect(d.hoursPerDay).toBe(8)
  })
  it('throws on a calendar with no working weekdays', () => {
    const dead: WorkingCalendar = { id: 'x', name: 'None', workweek: [false, false, false, false, false, false, false], holidays: [] }
    expect(() => nextWorkingDay(dead, parseISO('2026-01-01'))).toThrow()
  })
})
