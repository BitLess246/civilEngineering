import { describe, it, expect } from 'vitest'
import { laneCapacity, analyzeEntry, controlDelay, losFromDelay, circulatingFromLegs } from './roundabout'

describe('HCM 2010 entry capacity', () => {
  it('gives the intercept at zero circulating flow', () => {
    expect(laneCapacity(0, 'single')).toBeCloseTo(1130, 6)
  })

  it('matches the hand evaluations at vc = 500', () => {
    expect(laneCapacity(500, 'single')).toBeCloseTo(678.56, 1)   // 1130·e^(−0.51)
    expect(laneCapacity(500, 'right')).toBeCloseTo(796.30, 1)    // 1130·e^(−0.35)
    expect(laneCapacity(500, 'left')).toBeCloseTo(776.64, 1)     // 1130·e^(−0.375)
  })

  it('falls as the circulating stream grows', () => {
    expect(laneCapacity(300, 'single')).toBeGreaterThan(laneCapacity(900, 'single'))
  })
})

describe('the conflict-diagram helper', () => {
  it('assembles each entry from the other three legs', () => {
    expect(circulatingFromLegs([100, 200, 300, 400])).toEqual([900, 800, 700, 600])
  })
})

describe('the single-lane entry analysis', () => {
  // ve = 600, vc = 400, PHF 1: cap = 1130·e^(−0.408) = 751.41, x = 0.7985,
  // delay = 4.791 + 225·(−0.2015 + 0.27314)/0.7985 = 24.98 → LOS C.
  const r = analyzeEntry({ ve: 600, vc: 400, lanes: 1 })
  it('capacity, v/c and delay match the hand run', () => {
    expect(r.capacity).toBeCloseTo(751.41, 1)
    expect(r.xc).toBeCloseTo(0.7985, 3)
    expect(r.delay).toBeCloseTo(24.98, 1)
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
  it('settles to twice the free-flow base as x → 0', () => {
    // limit: 3600/c + 3600/c = 7200/c
    expect(controlDelay(0.0001, 900)).toBeCloseTo(8.0, 1)
  })
  it('stays finite just below capacity and grows past it', () => {
    const d1 = controlDelay(0.98, 900)
    const d2 = controlDelay(1.02, 900)
    expect(d1).toBeGreaterThan(0)
    expect(d2).toBeGreaterThan(d1)
  })
  it('maps the HCM thresholds', () => {
    expect(losFromDelay(10, 0.5)).toBe('A')
    expect(losFromDelay(10.1, 0.5)).toBe('B')
    expect(losFromDelay(20.1, 0.5)).toBe('C')
    expect(losFromDelay(35.1, 0.5)).toBe('D')
    expect(losFromDelay(55.1, 0.5)).toBe('E')
    expect(losFromDelay(80.1, 0.5)).toBe('F')
    expect(losFromDelay(5, 1.5)).toBe('F')
  })
})
