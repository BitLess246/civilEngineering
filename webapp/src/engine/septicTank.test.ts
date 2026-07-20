import { describe, it, expect } from 'vitest'
import {
  septicCapacity, designSepticTank, designSepticFromSchedule, SEPTIC_TABLE_B2,
  L_PER_DFU_OVER_100, FREEBOARD_M,
} from './septicTank'
import type { FixtureCount } from './plumbingFixtures'

describe('septicCapacity — Table B-2', () => {
  it('steps to the row whose max DFU ≥ the load (80 DFU → 11,355 L)', () => {
    expect(septicCapacity(78)).toBe(11355.0)   // 78 falls in the 80-DFU row
    expect(septicCapacity(20)).toBe(3785.0)
    expect(septicCapacity(45)).toBe(7570.0)
  })
  it('adds 94.6 L per fixture unit beyond 100 DFU', () => {
    expect(septicCapacity(120)).toBeCloseTo(13247.5 + 20 * L_PER_DFU_OVER_100, 4)
  })
  it('floors at the smallest table capacity for a light load', () => {
    expect(septicCapacity(5)).toBe(SEPTIC_TABLE_B2[0].liters)
  })
})

describe('designSepticTank — Module 4 worked example (78 DFU apartment)', () => {
  const r = designSepticTank({ dfu: 78, width: 2.0, liquidDepth: 1.2 })
  it('capacity 11,355 L → length 4.8 m, height 1.5 m', () => {
    expect(r.capacityL).toBe(11355.0)
    expect(r.length).toBeCloseTo(4.8, 6)                 // ceil(4.73) to 0.1 m
    expect(r.totalHeight).toBeCloseTo(1.5, 6)            // ceil(1.2 + 0.2286)
  })
  it('chambers split 2/3 · 1/3 → 3.2 m digestive, 1.6 m leaching', () => {
    expect(r.inletLength).toBeCloseTo(3.2, 6)
    expect(r.outletLength).toBeCloseTo(1.6, 6)
    expect(r.inletVol).toBeCloseTo(2.0 * 3.2 * 1.2, 6)   // 7.68 m³
    expect(r.outletVol).toBeCloseTo(2.0 * 1.6 * 1.2, 6)  // 3.84 m³
  })
  it('passes every Appendix B check', () => {
    expect(r.capacityOK).toBe(true)
    expect(r.inletVolOK).toBe(true)      // 7.68 ≥ 2 m³
    expect(r.outletVolOK).toBe(true)     // 3.84 ≥ 1 m³
    expect(r.inletDimOK).toBe(true)      // 2.0 ≥ 0.9, 3.2 ≥ 1.5
    expect(r.depthOK).toBe(true)         // 1.2 within 0.6–1.8
    expect(r.ok).toBe(true)
  })
})

describe('code limits', () => {
  it('freeboard is 228.6 mm above the liquid', () => {
    expect(FREEBOARD_M).toBeCloseTo(0.2286, 6)
  })
  it('rejects a liquid depth outside 0.6–1.8 m', () => {
    expect(designSepticTank({ dfu: 20, width: 2, liquidDepth: 2.0 }).depthOK).toBe(false)
    expect(designSepticTank({ dfu: 20, width: 2, liquidDepth: 0.5 }).depthOK).toBe(false)
  })
  it('drives from a fixture schedule (33 DFU residence → 1,500-gal row = 5,677.5 L)', () => {
    const items: FixtureCount[] = [
      { id: 'water-closet', count: 3 }, { id: 'lavatory', count: 3 }, { id: 'shower', count: 3 },
      { id: 'floor-drain', count: 5 }, { id: 'dishwasher', count: 1 },
    ]
    const r = designSepticFromSchedule({ items, occupancy: 'private', width: 1.5, liquidDepth: 1.2 })
    expect(r.dfu).toBe(33)
    expect(r.capacityL).toBe(5677.5)
  })
})
