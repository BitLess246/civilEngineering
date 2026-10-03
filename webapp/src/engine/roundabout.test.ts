import { describe, it, expect } from 'vitest'
import { laneCapacity, analyzeEntry, controlDelay, losFromDelay, circulatingFromLegs } from './roundabout'

describe('HCM 2010 entry capacity', () => {
  it('gives the intercept at zero circulating flow', () => {
    expect(laneCapacity(0, 'single')).toBeCloseTo(1130, 6)
  })

  it('matches the hand evaluations at vc = 500', () => {
    expect(laneCapacity(500, 'single')).toBeCloseTo(685.38, 1)   // HCM 2010: 1130·e^(−0.50)
    expect(laneCapacity(500, 'right')).toBeCloseTo(796.30, 1)    // 1130·e^(−0.35)
    expect(laneCapacity(500, 'left')).toBeCloseTo(776.64, 1)    // 1130·e^(−0.375)
  })

  it('falls as the circulating stream grows', () => {
    expect(laneCapacity(300, 'single')).toBeGreaterThan(laneCapacity(900, 'single'))
  })
})

describe('the screening circulating-flow helper', () => {
  it('bounds each entry by the other three legs (conservative screening, not Exhibit 21-2)', () => {
    expect(circulatingFromLegs([100, 200, 300, 400])).toEqual([900, 800, 700, 600])
  })
})

describe('the single-lane entry analysis', () => {
  // ve = 600, vc = 400, PHF 1, HCM 2010 β = 1.00: cap = 1130·e^(−0.40) = 757.46,
  // x = 0.7921, delay = 4.753 + 225·(−0.2079 + 0.2769) = 20.28 → LOS C (unsignalized bands).
  const r = analyzeEntry({ ve: 600, vc: 400, lanes: 1 })
  it('capacity, v/c and delay match the hand run', () => {
    expect(r.capacity).toBeCloseTo(757.46, 1)
    expect(r.xc).toBeCloseTo(0.7921, 3)
    expect(r.delay).toBeCloseTo(20.28, 1)
    expect(r.los).toBe('C')
  })
  it('the PHF divides the demand into the period', () => {
    const p = analyzeEntry({ ve: 600, vc: 400, lanes: 1, phf: 0.9 })
    expect(p.veAdj).toBeCloseTo(666.67, 2)
    expect(p.xc).toBeGreaterThan(r.xc)
  })
})

describe('the two-lane entry analysis', () => {
  // ve = 1400, vc = 600, PHF 0.95 → ve = 1473.7, vc = 631.6.
  // capR = 1130·e^(−0.4421) = 726.2; the right lane carries 810.5 → xR > 1 → F.
  const r = analyzeEntry({ ve: 1400, vc: 600, lanes: 2, phf: 0.95 })
  it('flags the saturated right lane', () => {
    expect(r.xc).toBeGreaterThan(1)
    expect(r.los).toBe('F')
  })
  it('sizes the entry capacity off the governing lane', () => {
    expect(r.capacity).toBeCloseTo(1320.42, 1)  // capR/0.55, capR = 1130·e^(−0.442105)
  })
  it('a light two-lane entry runs in the green', () => {
    const light = analyzeEntry({ ve: 500, vc: 300, lanes: 2 })
    expect(light.xc).toBeLessThan(0.6)
    expect(['A', 'B']).toContain(light.los)
  })
})

describe('control delay and LOS', () => {
  it('settles to the free-flow base as x → 0', () => {
    // limit: 3600/c (the 900·T·(xc−1+root) term vanishes)
    expect(controlDelay(0.0001, 900)).toBeCloseTo(4.0, 1)
  })
  it('stays finite just below capacity and grows past it', () => {
    const d1 = controlDelay(0.98, 900)
    const d2 = controlDelay(1.02, 900)
    expect(d1).toBeGreaterThan(0)
    expect(d2).toBeGreaterThan(d1)
  })
  it('maps the HCM unsignalized thresholds', () => {
    expect(losFromDelay(10, 0.5)).toBe('A')
    expect(losFromDelay(10.1, 0.5)).toBe('B')
    expect(losFromDelay(15.1, 0.5)).toBe('C')
    expect(losFromDelay(25.1, 0.5)).toBe('D')
    expect(losFromDelay(35.1, 0.5)).toBe('E')
    expect(losFromDelay(50.1, 0.5)).toBe('F')
    expect(losFromDelay(5, 1.5)).toBe('F')
  })
})
