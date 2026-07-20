import { describe, it, expect } from 'vitest'
import { designDrainage, sewerSlope, DRAIN_TABLE, MIN_SOIL_MM } from './drainage'
import type { FixtureCount } from './plumbingFixtures'

describe('designDrainage — Module 3 worked examples', () => {
  it('ex.1: 2WC(priv)+2LAV+2FD = 14 DFU → drain 76 mm, vent 51 mm, 65/37 m', () => {
    const items: FixtureCount[] = [{ id: 'water-closet', count: 2 }, { id: 'lavatory', count: 2 }, { id: 'floor-drain', count: 2 }]
    const r = designDrainage({ items, occupancy: 'private' })
    expect(r.dfu).toBe(14)
    expect(r.drainMm).toBe(76)
    expect(r.ventMm).toBe(51)
    expect(r.maxDrainM).toBe(65)
    expect(r.maxVentM).toBe(37)
    expect(r.ok).toBe(true)
  })
  it('ex.2: 5WC(public)+3LAV+3FD = 39 DFU → drain 102 mm, vent 65 mm, 91/55 m', () => {
    const items: FixtureCount[] = [{ id: 'water-closet', count: 5 }, { id: 'lavatory', count: 3 }, { id: 'floor-drain', count: 3 }]
    const r = designDrainage({ items, occupancy: 'public' })
    expect(r.dfu).toBe(39)
    expect(r.drainMm).toBe(102)
    expect(r.ventMm).toBe(65)
    expect(r.maxDrainM).toBe(91)
    expect(r.maxVentM).toBe(55)
    expect(r.wcStackWarn).toBe(true)          // 5 WC > 4 on a stack
  })
})

describe('code rules', () => {
  it('a vent is always ≥ 32 mm and ≥ ½ the drain', () => {
    for (const row of DRAIN_TABLE) expect(row.ventMm).toBeGreaterThanOrEqual(Math.max(32, row.drainMm / 2))
  })
  it('a water closet forces a soil drain ≥ 75 mm even at a low DFU count', () => {
    const r = designDrainage({ items: [{ id: 'water-closet', count: 1 }], occupancy: 'private' })  // 4 DFU
    expect(r.drainMm).toBeGreaterThanOrEqual(MIN_SOIL_MM)
  })
  it('a light no-WC branch can use a small drain', () => {
    const r = designDrainage({ items: [{ id: 'lavatory', count: 2 }], occupancy: 'private' })  // 2 DFU
    expect(r.drainMm).toBeLessThan(MIN_SOIL_MM)
    expect(r.ok).toBe(true)
  })
  it('a 1% slope inflates the design DFU (×1/0.8) and can bump the size', () => {
    const items: FixtureCount[] = [{ id: 'water-closet', count: 2 }, { id: 'lavatory', count: 2 }, { id: 'floor-drain', count: 2 }] // 14 DFU
    const flat = designDrainage({ items, occupancy: 'private', slopePct: 1.0 })
    expect(flat.effectiveDfu).toBeCloseTo(14 / 0.8, 6)   // 17.5
  })
})

describe('sewerSlope — §1206', () => {
  it('2% for ≤76 mm, 1% allowed for 102/152 mm, 0.5% for ≥203 mm', () => {
    expect(sewerSlope(76).minPct).toBe(2.0)
    expect(sewerSlope(102).minPct).toBe(1.0)
    expect(sewerSlope(152).minPct).toBe(1.0)
    expect(sewerSlope(203).minPct).toBe(0.5)
  })
  it('reports slope in mm per metre (2% = 20 mm/m)', () => {
    expect(sewerSlope(76).mmPerM).toBeCloseTo(20, 6)
  })
})
