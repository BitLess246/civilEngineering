import { describe, it, expect } from 'vitest'
import { PLUMBING_FIXTURES, totalWSFU, totalDFU, largestTrap, type FixtureCount } from './plumbingFixtures'

describe('WSFU totals — RNPCP Table 6-5 (Module 2 worked examples)', () => {
  it('residential 2WC+2SH+2L+4HB+1KS = 26 WSFU (private)', () => {
    const items: FixtureCount[] = [
      { id: 'water-closet', count: 2 }, { id: 'shower', count: 2 }, { id: 'lavatory', count: 2 },
      { id: 'hose-bibb', count: 4 }, { id: 'kitchen-sink', count: 1 },
    ]
    expect(totalWSFU(items, 'private')).toBe(26)
  })
  it('design ex.1: 2WC+2L+1KS+1BT = 12 WSFU (private)', () => {
    const items: FixtureCount[] = [
      { id: 'water-closet', count: 2 }, { id: 'lavatory', count: 2 }, { id: 'kitchen-sink', count: 1 }, { id: 'bathtub', count: 1 },
    ]
    expect(totalWSFU(items, 'private')).toBe(12)
  })
  it('design ex.2 (commercial): 5WC+5L+2BT+3KS+10U = 85 WSFU (public)', () => {
    const items: FixtureCount[] = [
      { id: 'water-closet', count: 5 }, { id: 'lavatory', count: 5 }, { id: 'bathtub', count: 2 },
      { id: 'kitchen-sink', count: 3 }, { id: 'urinal', count: 10 },
    ]
    expect(totalWSFU(items, 'public')).toBe(85)
  })
})

describe('DFU totals — RNPCP Table 7-2 (Module 3/4 worked examples)', () => {
  it('2WC(priv)+2LAV+2FD = 14 DFU', () => {
    const items: FixtureCount[] = [{ id: 'water-closet', count: 2 }, { id: 'lavatory', count: 2 }, { id: 'floor-drain', count: 2 }]
    expect(totalDFU(items, 'private')).toBe(14)
  })
  it('5WC(public)+3LAV+3FD = 39 DFU', () => {
    const items: FixtureCount[] = [{ id: 'water-closet', count: 5 }, { id: 'lavatory', count: 3 }, { id: 'floor-drain', count: 3 }]
    expect(totalDFU(items, 'public')).toBe(39)
  })
  it('septic ex: 3WC+3LAV+3SHO+5FD+1DISH = 33 DFU (private)', () => {
    const items: FixtureCount[] = [
      { id: 'water-closet', count: 3 }, { id: 'lavatory', count: 3 }, { id: 'shower', count: 3 },
      { id: 'floor-drain', count: 5 }, { id: 'dishwasher', count: 1 },
    ]
    expect(totalDFU(items, 'private')).toBe(33)
  })
})

describe('fixture catalog integrity', () => {
  it('a water closet needs the largest trap (75 mm) and a lavatory the smallest (32 mm)', () => {
    expect(PLUMBING_FIXTURES['water-closet'].minTrapMm).toBe(75)
    expect(largestTrap([{ id: 'lavatory', count: 1 }, { id: 'water-closet', count: 1 }])).toBe(75)
  })
  it('public WSFU ≥ private for every fixture; hose bibbs have no DFU', () => {
    for (const f of Object.values(PLUMBING_FIXTURES)) expect(f.wsfu.public).toBeGreaterThanOrEqual(f.wsfu.private)
    expect(PLUMBING_FIXTURES['hose-bibb'].dfu.private).toBe(0)
  })
})
