import { describe, it, expect } from 'vitest'
import {
  frictionSlope, gvfSlope, gvfProfile, standardStep, energyAt,
  type GvfStation,
} from './gvf'
import { normalDepth, criticalDepth } from './openChannel'

// Hand-verified reference reach: rectangular b = 2 m, Q = 3 m³/s, n = 0.014,
// S0 = 0.001 (mild). yn = 1.0406 m (manningQ = 3), yc = 0.6120 m (q²/g)^⅓.

const rect = { kind: 'rect' as const, b: 2 }
const Q = 3
const n = 0.014
const S0 = 0.001

describe('reference depths on the mild reach', () => {
  it('yn = 1.040452 m and yc = 0.612122 m', () => {
    expect(normalDepth(rect, Q, n, S0)).toBeCloseTo(1.040452, 5)
    expect(criticalDepth(rect, Q)).toBeCloseTo(0.612122, 5)
  })

  it('friction slope at the control y = 1.5 → 3.873e−4', () => {
    expect(frictionSlope(rect, 1.5, Q, n)).toBeCloseTo(3.873062e-4, 8)
  })

  it('GVF slope dy/dx at the control → 6.574e−4 (hand value)', () => {
    expect(gvfSlope(rect, 1.5, Q, n, S0)).toBeCloseTo(6.573671e-4, 7)
  })

  it('specific energy at the control', () => {
    // E = 1.5 + 9/(2·9.81·9) = 1.550968
    expect(energyAt(rect, 1.5, Q)).toBeCloseTo(1.550968, 5)
  })
})

describe('profile classification', () => {
  it('M1 — dam backwater above yn on a mild bed', () => {
    const r = gvfProfile({ shape: rect, Q, n, S0, L: 200, yControl: 1.5, controlAt: 'auto' })
    expect(r.slopeClass).toBe('mild')
    expect(r.profile).toBe('M1')
    expect(r.controlAt).toBe('downstream')
    expect(r.march).toBe('upstream')
    expect(r.FrControl).toBeLessThan(1)
  })

  it('M2 — drawn-down flow between yc and yn', () => {
    const r = gvfProfile({ shape: rect, Q, n, S0, L: 200, yControl: 0.8, controlAt: 'downstream' })
    expect(r.profile).toBe('M2')
    expect(r.march).toBe('upstream')
  })

  it('M3 — jet under a gate, rises toward the jump', () => {
    const r = gvfProfile({ shape: rect, Q, n, S0, L: 60, yControl: 0.3, controlAt: 'auto' })
    expect(r.profile).toBe('M3')
    expect(r.controlAt).toBe('upstream')
    expect(r.march).toBe('downstream')
  })

  it('S2 — drawdown on a steep bed toward yn', () => {
    const steep = 0.01
    const r = gvfProfile({ shape: rect, Q, n, S0: steep, L: 100, yControl: 0.6, controlAt: 'auto' })
    // yn ≈ 0.455 < yc ≈ 0.612, control just below yc
    expect(r.slopeClass).toBe('steep')
    expect(r.profile).toBe('S2')
    expect(r.yn).not.toBeNull()
    expect(r.yn!).toBeLessThan(r.yc)
  })

  it('H3 — supercritical jet on a horizontal bed rises toward yc', () => {
    const r = gvfProfile({ shape: rect, Q, n, S0: 0, L: 80, yControl: 0.3, controlAt: 'upstream' })
    expect(r.slopeClass).toBe('horizontal')
    expect(r.profile).toBe('H3')
    expect(r.yn).toBeNull()
  })

  it('A2 — subcritical flow on an adverse slope', () => {
    const r = gvfProfile({ shape: rect, Q, n, S0: -0.002, L: 80, yControl: 1.2, controlAt: 'downstream' })
    expect(r.slopeClass).toBe('adverse')
    expect(r.profile).toBe('A2')
  })
})

describe('M1 march physics', () => {
  it('depth decreases upstream from the dam and stays above yn', () => {
    const r = gvfProfile({ shape: rect, Q, n, S0, L: 200, yControl: 1.5, controlAt: 'downstream', dx: 1 })
    const ys = r.stations.map((s: GvfStation) => s.y)
    // march runs from x = 200 back to x = 0 — stations are in march order
    expect(ys[0]).toBeCloseTo(1.5, 10)
    expect(ys[ys.length - 1]).toBeLessThan(1.5)
    expect(ys[ys.length - 1]).toBeGreaterThan(1.04) // still above yn
    // strictly monotone decay upstream
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeLessThan(ys[i - 1])
    // Froude everywhere subcritical
    for (const s of r.stations) expect(s.Fr).toBeLessThan(1)
  })

  it('RK4 march agrees with the independent standard-step to a millimetre', () => {
    const r = gvfProfile({ shape: rect, Q, n, S0, L: 200, yControl: 1.5, controlAt: 'downstream', dx: 1 })
    const ss = standardStep(rect, Q, n, S0, 1.5, 1, 200)
    // both lists start at the control; compare the shared depths
    expect(ss.length).toBe(r.stations.length)
    for (let i = 0; i < r.stations.length; i++) {
      expect(Math.abs(ss[i] - r.stations[i].y)).toBeLessThan(1e-3)
    }
  })

  it('long reach converges on the uniform-flow asymptote', () => {
    const r = gvfProfile({ shape: rect, Q, n, S0, L: 4000, yControl: 1.5, controlAt: 'downstream', dx: 2 })
    expect(r.terminus).toBe('uniform-flow asymptote')
    expect(Math.abs(r.yEnd - 1.0406) / 1.0406).toBeLessThan(0.01)
  })

  it('M3 closes on critical depth and flags the jump ahead', () => {
    const r = gvfProfile({ shape: rect, Q, n, S0, L: 400, yControl: 0.3, controlAt: 'upstream', dx: 0.5 })
    expect(r.terminus).toBe('critical-depth asymptote — jump ahead')
    expect(r.yEnd).toBeGreaterThan(0.6) // climbed from 0.3 to near yc
  })
})

describe('guards', () => {
  it('rejects non-positive discharge, depth and length', () => {
    expect(() => gvfProfile({ shape: rect, Q: 0, n, S0, L: 100, yControl: 1, controlAt: 'auto' })).toThrow()
    expect(() => gvfProfile({ shape: rect, Q, n, S0, L: 100, yControl: 0, controlAt: 'auto' })).toThrow()
    expect(() => gvfProfile({ shape: rect, Q, n, S0, L: 0, yControl: 1, controlAt: 'auto' })).toThrow()
  })

  it('circular control above the crown is refused', () => {
    expect(() => gvfProfile({ shape: { kind: 'circle', D: 1.5 }, Q, n, S0, L: 100, yControl: 1.5, controlAt: 'auto' })).toThrow()
  })
})
