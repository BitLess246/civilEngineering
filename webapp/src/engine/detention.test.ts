import { describe, it, expect } from 'vitest'
import {
  pondGeometry, outletFlow, detentionRoute, triangularInflow,
} from './detention'

// Reference pond: 20 × 20 m bottom, side slopes z = 2, orifice a = 0.2 m²
// with Cd = 0.6 at the invert, no weir. Δt = 1 min. First-step hand check:
// I = [0, 0.16667]; F1 = I0 + I1 = 0.16667; solving 2S/60 + O = 0.16667 with
// S ≈ 400h + z(W+L)h² gives h ≈ 0.0087 m, O = 0.12·√(2·9.81·h) ≈ 0.049 m³/s.

const POND = {
  bottomWidth: 20,
  bottomLength: 20,
  sideZ: 2,
  depthMax: 2,
  orificeArea: 0.2,
  orificeCd: 0.6,
  orificeInvert: 0,
  weirLength: 0,
  weirCrest: 1.2,
  weirC: 1.84,
  dtMin: 1,
}

describe('pond geometry', () => {
  it('flat-bottom area and prism storage', () => {
    expect(pondGeometry(20, 20, 2, 0).area).toBeCloseTo(400, 10)
    expect(pondGeometry(20, 20, 2, 0).storage).toBeCloseTo(0, 10)
    const { area, storage } = pondGeometry(20, 20, 2, 1)
    expect(area).toBeCloseTo(24 * 24, 10)
    // S = 400·1 + 2·40·1 + (4/3)·4·1 = 480 + 16/3
    expect(storage).toBeCloseTo(485.333333, 5)
  })

  it('cubic-in-h storage: doubling the stage more than doubles the volume', () => {
    const s1 = pondGeometry(20, 20, 2, 1).storage
    const s2 = pondGeometry(20, 20, 2, 2).storage
    expect(s2 / s1).toBeGreaterThan(2)
  })
})

describe('outlet works', () => {
  it('orifice only: Q = Cd·a·√(2gh)', () => {
    expect(outletFlow(0, POND)).toBe(0)
    expect(outletFlow(1, POND)).toBeCloseTo(0.6 * 0.2 * Math.sqrt(2 * 9.81 * 1), 10)
  })

  it('orifice below its invert stays shut', () => {
    expect(outletFlow(0.5, { ...POND, orificeInvert: 0.5 })).toBe(0)
  })

  it('weir engages above its crest with Francis flow', () => {
    const q = outletFlow(1.5, { ...POND, orificeArea: 0, weirLength: 4, weirCrest: 1.2 })
    expect(q).toBeCloseTo(1.84 * 4 * Math.pow(0.3, 1.5), 10)
    // combined: orifice + weir at a drowned crest
    const both = outletFlow(1.5, { ...POND, weirLength: 4, weirCrest: 1.2 })
    expect(both).toBeCloseTo(
      0.6 * 0.2 * Math.sqrt(2 * 9.81 * 1.5) + 1.84 * 4 * Math.pow(0.3, 1.5), 10,
    )
  })
})

describe('routing', () => {
  it('first step matches the hand solution: h ≈ 0.0087 m, O ≈ 0.049 m³/s', () => {
    const inflow = triangularInflow(5, 30, 90, 1) // I1 = 5·1/30 = 0.16667 m³/s
    const r = detentionRoute({ ...POND, inflow })
    expect(r.stages[1]).toBeCloseTo(0.0087, 3)
    expect(r.outflows[1]).toBeCloseTo(0.0498, 3)
  })

  it('mass balance closes to interpolation error', () => {
    const inflow = triangularInflow(5, 30, 90, 1)
    const r = detentionRoute({ ...POND, inflow })
    expect(r.massErrorPct).toBeLessThan(0.5)
    expect(r.outflowVolume + r.residualStorage).toBeCloseTo(r.inflowVolume, -2)
  })

  it('attenuates the peak and lags it', () => {
    const inflow = triangularInflow(5, 30, 90, 1)
    const r = detentionRoute({ ...POND, inflow })
    expect(r.peakOut).toBeLessThan(r.peakIn)
    expect(r.tPeakOut).toBeGreaterThan(r.tPeakIn)
    expect(r.attenuationPct).toBeGreaterThan(10)
  })

  it('warns when the routed stage overtops the usable depth', () => {
    const inflow = triangularInflow(30, 30, 200, 2) // storm far too big for the pond
    const r = detentionRoute({ ...POND, inflow })
    expect(r.peakStage).toBeGreaterThan(POND.depthMax)
    expect(r.warnings.some((w) => w.includes('overtops'))).toBe(true)
  })

  it('an empty outlet list is refused', () => {
    expect(() => detentionRoute({ ...POND, orificeArea: 0, weirLength: 0, inflow: [0, 1, 0] })).toThrow(/no outlet/)
  })
})

describe('triangular inflow helper', () => {
  it('rises to Qp at Tp and closes at Tb', () => {
    const q = triangularInflow(6, 40, 120, 10)
    expect(q.length).toBe(13)
    expect(q[0]).toBeCloseTo(0, 10)
    expect(q[4]).toBeCloseTo(6, 6)
    expect(q[12]).toBeCloseTo(0, 10)
    expect(q[8]).toBeCloseTo(6 * (120 - 80) / 80, 6)
  })

  it('rejects an inconsistent triangle', () => {
    expect(() => triangularInflow(5, 90, 60, 10)).toThrow()
    expect(() => triangularInflow(-1, 30, 90, 10)).toThrow()
  })
})
