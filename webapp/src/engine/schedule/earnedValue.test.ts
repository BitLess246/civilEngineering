import { describe, it, expect } from 'vitest'
import {
  plannedFraction, earnedValue, pvAtOffset, earnedScheduleOffset,
  scheduleVarianceTime, type EvmActivityInput, type PvActivity,
} from './earnedValue'

describe('plannedFraction', () => {
  it('linear ramp between early start and finish', () => {
    expect(plannedFraction(0, 10, 0)).toBe(0)
    expect(plannedFraction(0, 10, 5)).toBe(0.5)
    expect(plannedFraction(0, 10, 10)).toBe(1)
    expect(plannedFraction(0, 10, 12)).toBe(1)     // clamped
    expect(plannedFraction(0, 10, -3)).toBe(0)
  })
  it('a milestone steps at its date', () => {
    expect(plannedFraction(5, 5, 4)).toBe(0)
    expect(plannedFraction(5, 5, 5)).toBe(1)
  })
})

describe('earnedValue roll-up', () => {
  const acts: EvmActivityInput[] = [
    { id: 'A', bac: 100, percentComplete: 100, actualCost: 90, plannedFraction: 1 },
    { id: 'B', bac: 100, percentComplete: 50, actualCost: 60, plannedFraction: 0.75 },
  ]
  const r = earnedValue(acts)
  it('PV / EV / AC / BAC', () => {
    expect(r.pv).toBe(175)   // 100·1 + 100·0.75
    expect(r.ev).toBe(150)   // 100·1 + 100·0.5
    expect(r.ac).toBe(150)
    expect(r.bac).toBe(200)
  })
  it('variances and indices', () => {
    expect(r.sv).toBe(-25)
    expect(r.cv).toBe(0)
    expect(r.spi!).toBeCloseTo(150 / 175, 9)
    expect(r.cpi!).toBe(1)
  })
  it('forecasts (EAC / VAC / ETC / TCPI)', () => {
    expect(r.eac!).toBe(200)   // BAC / CPI
    expect(r.vac!).toBe(0)
    expect(r.etc!).toBe(50)    // EAC − AC
    expect(r.tcpi!).toBe(1)    // (200−150)/(200−150)
  })
  it('clamps percent complete to 100', () => {
    const over = earnedValue([{ id: 'X', bac: 50, percentComplete: 150, actualCost: 40, plannedFraction: 1 }])
    expect(over.ev).toBe(50)
  })
  it('returns null indices when a denominator is zero', () => {
    const empty = earnedValue([])
    expect(empty.spi).toBeNull()
    expect(empty.cpi).toBeNull()
    expect(empty.eac).toBeNull()
    expect(empty.tcpi).toBeNull()
  })
})

describe('earned schedule (time-based)', () => {
  // Series A[0,10] then B[10,20], each budget 50 → total PV 100.
  const pv: PvActivity[] = [
    { es: 0, ef: 10, bac: 50 },
    { es: 10, ef: 20, bac: 50 },
  ]
  it('pv curve is the sum of ramps', () => {
    expect(pvAtOffset(pv, 5)).toBe(25)
    expect(pvAtOffset(pv, 10)).toBe(50)
    expect(pvAtOffset(pv, 15)).toBe(75)
    expect(pvAtOffset(pv, 20)).toBe(100)
  })
  it('earnedScheduleOffset inverts the pv curve', () => {
    expect(earnedScheduleOffset(pv, 25, 20)).toBeCloseTo(5, 4)
    expect(earnedScheduleOffset(pv, 75, 20)).toBeCloseTo(15, 4)
    expect(earnedScheduleOffset(pv, 0, 20)).toBe(0)
    expect(earnedScheduleOffset(pv, 100, 20)).toBe(20)   // ev ≥ max pv → tMax
    expect(earnedScheduleOffset(pv, 130, 20)).toBe(20)
  })
  it('scheduleVarianceTime: earned 25 at data date 8 is 3 days behind', () => {
    expect(scheduleVarianceTime(pv, 25, 8, 20)).toBeCloseTo(-3, 3)
  })
  it('scheduleVarianceTime: earned 75 at data date 12 is 3 days ahead', () => {
    expect(scheduleVarianceTime(pv, 75, 12, 20)).toBeCloseTo(3, 3)
  })
})
