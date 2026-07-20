import { describe, it, expect } from 'vitest'
import {
  waterDemand, hunterFlowGpm, hunterFlowLps, staticHead, velocity, hazenWilliamsHead, frictionDrop,
  sizeSupplyPipe, designWaterSupply, gpmToLps, GPM_PER_FU,
} from './waterSupply'
import type { FixtureCount } from './plumbingFixtures'

describe('maximum demand', () => {
  it('Σ FU × 8 gpm (Module 2: 20 FU → 160 gpm)', () => {
    const items: FixtureCount[] = [{ id: 'water-closet', count: 3 }, { id: 'lavatory', count: 3 }, { id: 'kitchen-sink', count: 1 }, { id: 'shower', count: 3 }]
    const d = waterDemand(items, 'private')    // 9+3+2+6 = 20 FU
    expect(d.wsfu).toBe(20)
    expect(d.maxGpm).toBe(20 * GPM_PER_FU)     // 160 gpm
  })
})

describe("Hunter's curve — probable design flow", () => {
  it('interpolates the flush-tank table (10 FU → 14.6 gpm exactly)', () => {
    expect(hunterFlowGpm(10, 'tank')).toBeCloseTo(14.6, 6)
    expect(hunterFlowGpm(25, 'tank')).toBeCloseTo(25.4, 6)
  })
  it('interpolates linearly between tabulated points (12.5 FU between 12 and 15)', () => {
    expect(hunterFlowGpm(12.5, 'tank')).toBeCloseTo(16.3 + (18.7 - 16.3) * (0.5 / 3), 6)
  })
  it('is far below the linear Σ FU × 8 max (diversity of use)', () => {
    expect(hunterFlowGpm(50, 'tank')).toBeLessThan(50 * GPM_PER_FU)   // 38.3 ≪ 400
  })
  it('flush-valve systems draw more than flush-tank at the same load', () => {
    expect(hunterFlowGpm(20, 'valve')).toBeGreaterThan(hunterFlowGpm(20, 'tank'))
  })
  it('grows monotonically with fixture units', () => {
    expect(hunterFlowLps(30, 'tank')).toBeGreaterThan(hunterFlowLps(10, 'tank'))
  })
})

describe('static head', () => {
  it('γw·Z = 9.81·Z kPa (Z = 5 m → 49.05 kPa)', () => {
    expect(staticHead(5)).toBeCloseTo(49.05, 2)
  })
})

describe('velocity (continuity)', () => {
  it('¾" Type L (19.94 mm ID) at 10 gpm ≈ 6.6 ft/s (2.02 m/s) — Module 2 example', () => {
    const v = velocity(gpmToLps(10), 19.94)
    expect(v).toBeCloseTo(2.02, 2)              // m/s
    expect(v / 0.3048).toBeCloseTo(6.62, 1)     // ft/s ≈ module's 6.6
  })
  it('velocity scales with 1/D²', () => {
    expect(velocity(gpmToLps(10), 26.04)).toBeLessThan(velocity(gpmToLps(10), 19.94))
  })
})

describe('friction — Hazen-Williams', () => {
  it('matches the closed form and stays within chart tolerance of Module 2 (20 gpm, 1" copper ≈ 227 kPa/100 m)', () => {
    const Q = gpmToLps(20), D = 26.04, C = 140, L = 100
    const expected = (10.67 * L * (Q / 1000) ** 1.852) / (C ** 1.852 * (D / 1000) ** 4.87)
    expect(hazenWilliamsHead(Q, D, C, L)).toBeCloseTo(expected, 9)
    const kpaPer100 = frictionDrop(Q, D, C, L)
    expect(kpaPer100).toBeGreaterThan(200)
    expect(kpaPer100).toBeLessThan(275)          // module chart read ~227 kPa/100 m
  })
  it('a larger diameter has far less friction (D^-4.87)', () => {
    expect(frictionDrop(gpmToLps(20), 38.24, 140, 100)).toBeLessThan(frictionDrop(gpmToLps(20), 26.04, 140, 100))
  })
})

describe('pipe sizing', () => {
  it('never returns below the 19 mm minimum service size', () => {
    const r = sizeSupplyPipe({ lps: 0.05, Lm: 5, allowableDropKPa: 500 })
    expect(r.size!.idMm).toBeGreaterThanOrEqual(19)
  })
  it('picks a larger pipe when the allowable friction drop is tight', () => {
    const tight = sizeSupplyPipe({ lps: 1.5, Lm: 30, allowableDropKPa: 20 })
    const loose = sizeSupplyPipe({ lps: 1.5, Lm: 30, allowableDropKPa: 400 })
    expect(tight.size!.idMm).toBeGreaterThanOrEqual(loose.size!.idMm)
  })
})

describe('designWaterSupply — integration', () => {
  const houseItems: FixtureCount[] = [
    { id: 'water-closet', count: 2 }, { id: 'shower', count: 2 }, { id: 'lavatory', count: 2 },
    { id: 'hose-bibb', count: 4 }, { id: 'kitchen-sink', count: 1 },
  ]
  it("uses Hunter's design flow (not Σ FU × 8) and reproduces the module's available head", () => {
    const r = designWaterSupply({
      items: houseItems, occupancy: 'private',
      Lpipe: 21, fittingLength: 0, riseZ: 5,
      pMainKPa: 206.85, pMeterKPa: 6.9, pFixtureKPa: 103.43, material: 'copper',
    })
    expect(r.demand.wsfu).toBe(26)
    expect(r.flowSource).toBe('hunter')
    expect(r.designFlowLps).toBeCloseTo(hunterFlowLps(26, 'tank'), 6)
    expect(r.designFlowLps).toBeLessThan(r.demand.maxLps)         // ≪ the linear max
    expect(r.staticKPa).toBeCloseTo(49.05, 1)
    expect(r.availableForFriction).toBeCloseTo(206.85 - (49.05 + 6.9 + 103.43), 2)  // ≈ 47.5 kPa
    expect(r.pipe.size).toBeTruthy()
    expect(r.ok).toBe(true)
  })
  it('honours a chart-specific design-flow override', () => {
    const r = designWaterSupply({
      items: houseItems, occupancy: 'private', designFlowLps: 0.44,   // module's chart flow
      Lpipe: 21, fittingLength: 0, riseZ: 5,
      pMainKPa: 206.85, pMeterKPa: 6.9, pFixtureKPa: 103.43,
    })
    expect(r.flowSource).toBe('override')
    expect(r.designFlowLps).toBe(0.44)
    expect(r.pipe.size!.idMm).toBeGreaterThanOrEqual(19)
  })
  it('flags an inadequate system when the main pressure cannot cover static + residual', () => {
    const r = designWaterSupply({
      items: [{ id: 'water-closet', count: 2 }], occupancy: 'private',
      Lpipe: 20, fittingLength: 5, riseZ: 30, pMainKPa: 200, pMeterKPa: 80, pFixtureKPa: 100,
    })
    expect(r.availableForFriction).toBeLessThan(0)
    expect(r.ok).toBe(false)
  })
})
