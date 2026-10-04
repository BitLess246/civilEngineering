import { describe, it, expect } from 'vitest'
import { trafficVolumes } from './trafficVolume'

// Hand case: hourly 2000 with a 550-veh peak quarter → PHF 0.9091,
// flow 2200 (= 4 × 550, the peak-15 rate); ADT 20 000, K 0.10, D 0.60 →
// DHV 2000, DDHV 1200; 10 000 growing 3 % for 10 yr → 13 439.2 veh/day.
const RES = trafficVolumes(
  { hourly: 2000, peak15: 550 },
  { adt: 20000, k: 0.1, d: 0.6 },
  { aadt0: 10000, growthPct: 3, years: 10 },
)

describe('traffic volume studies', () => {
  it('PHF and the peak-15 flow rate close the loop', () => {
    expect(RES.phf).toBeCloseTo(2000 / 2200, 9)
    expect(RES.flowRate).toBeCloseTo(2200, 6)
  })
  it('design-hour volumes follow AADT·K·D', () => {
    expect(RES.dhv).toBeCloseTo(2000, 9)
    expect(RES.ddhv).toBeCloseTo(1200, 9)
  })
  it('growth compounds to the design year', () => {
    expect(RES.aadtDesign).toBeCloseTo(10000 * 1.03 ** 10, 6)
  })
  it('warns on an impossible PHF instead of throwing', () => {
    const r = trafficVolumes(
      { hourly: 2400, peak15: 550 },
      { adt: 20000, k: 0.1, d: 0.6 },
      { aadt0: 10000, growthPct: 3, years: 10 },
    )
    expect(r.warnings.some((w) => w.includes('PHF > 1'))).toBe(true)
  })
  it('rejects non-positive counts and out-of-range factors', () => {
    const bad = { adt: 20000, k: 0.1, d: 0.6 }
    const gro = { aadt0: 10000, growthPct: 3, years: 10 }
    expect(() => trafficVolumes({ hourly: 0, peak15: 100 }, bad, gro)).toThrow()
    expect(() => trafficVolumes({ hourly: 2000, peak15: 550 }, { ...bad, k: 1.5 }, gro)).toThrow()
    expect(() => trafficVolumes({ hourly: 2000, peak15: 550 }, { ...bad, d: 0.4 }, gro)).toThrow()
  })
})
