import { describe, it, expect } from 'vitest'
import { cpWindwardRoof, cpWindwardRoofPos, cpLeewardRoof, cpRoofByDistance, roofWindLoads } from './roofWind'
import { velocityPressure } from './wind'
import { addRoofTrusses, roofingLoads, type RoofTrussSpec } from './roofTruss'
import { generateGridModel, buildGravityLoads } from './modelBuilder'
import { modelToFrame3D } from './modelBridge'
import { solveFrame3D } from './frame3d'
import type { ModelLoad, StructuralModel } from './model'

const section = { id: 's1', name: 'C1', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const spec: RoofTrussSpec = {
  spanAlong: 'x', profile: 'gable', web: 'howe', rise: 1.5, panel: 1.5,
  chordShape: 'HSS89x89x6.4', webShape: 'HSS64x64x4.8', qD: 0.5, qLr: 0.6,
}
// 12 m × 5 m roof on 3.2 m columns; gable trusses span X, ridge runs along Z
const roofed = (s: Partial<RoofTrussSpec> = {}): StructuralModel => {
  const m0 = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.2], section })
  return addRoofTrusses({ ...m0, loads: [] }, { ...spec, ...s }).model
}
const sum = (ls: ModelLoad[], k: 'Fx' | 'Fy' | 'Fz') => ls.reduce((t, l) => t + (l.kind === 'node' ? l[k] ?? 0 : 0), 0)
const wind = { V: 50, exposure: 'C' as const }

describe('Figure 207B.4-1 roof Cp — tabulated values and interpolation', () => {
  it('windward slope, uplift branch, wind normal to the ridge', () => {
    expect(cpWindwardRoof(10, 0.25)).toBe(-0.7)
    expect(cpWindwardRoof(20, 1.0)).toBe(-0.7)
    expect(cpWindwardRoof(30, 0.5)).toBe(-0.2)
    expect(cpWindwardRoof(12.5, 0.25)).toBeCloseTo(-0.6, 12)         // halfway 10 → 15
    expect(cpWindwardRoof(10, 0.75)).toBeCloseTo(-1.1, 12)           // halfway 0.5 → 1.0
    expect(cpWindwardRoof(10, 0.1)).toBe(-0.7)                       // h/L below 0.25 uses the 0.25 column
  })
  it('leeward slope', () => {
    expect(cpLeewardRoof(10, 0.25)).toBe(-0.3)
    expect(cpLeewardRoof(25, 1.0)).toBe(-0.6)
    expect(cpLeewardRoof(12.5, 0.25)).toBeCloseTo(-0.4, 12)
  })
  it('by distance from the windward edge — parallel to the ridge or θ < 10°', () => {
    expect(cpRoofByDistance(1, 4, 0.3)).toBe(-0.9)                    // within h
    expect(cpRoofByDistance(6, 4, 0.3)).toBe(-0.5)                    // h to 2h
    expect(cpRoofByDistance(9, 4, 0.3)).toBe(-0.3)                    // beyond 2h
    expect(cpRoofByDistance(1, 4, 1.2)).toBe(-1.3)                    // h/L ≥ 1, within h/2
    expect(cpRoofByDistance(3, 4, 1.2)).toBe(-0.7)
    expect(cpRoofByDistance(1, 4, 0.75)).toBeCloseTo(-1.1, 12)        // halfway between the two
  })
})

describe('roof wind on the trusses — closed form', () => {
  const m = roofed()
  const theta = (Math.atan(1.5 / 6) * 180) / Math.PI                 // 14.04°
  const h = (3.2 + 4.7) / 2                                           // mean roof height, θ > 10°
  const qh = velocityPressure(h, 50, 'C')
  const G = 0.85, GCpi = 0.18, A = 6 * 5                             // each slope's plan area

  it('wind along the span meets the slopes: windward + leeward, uplift and horizontal by hand', () => {
    const r = roofWindLoads(m, { ...wind, dir: '+X' })!
    expect(r.normalToRidge).toBe(true)
    expect(r.theta).toBeCloseTo(theta, 9)
    expect(r.h).toBeCloseTo(h, 12)
    const hL = h / 12
    const pw = qh * G * cpWindwardRoof(theta, hL) - qh * GCpi
    const pl = qh * G * cpLeewardRoof(theta, hL) - qh * GCpi
    // vertical: −p·A_plan on each slope
    expect(sum(r.loads, 'Fy')).toBeCloseTo(-(pw + pl) * A, 9)
    expect(r.uplift).toBeCloseTo(-(pw + pl) * A, 9)
    expect(r.uplift).toBeGreaterThan(0)
    // horizontal: −p·A·n_x/n_y, n_x/n_y = −tanθ windward, +tanθ leeward
    expect(sum(r.loads, 'Fx')).toBeCloseTo((pw - pl) * A * 0.25, 9)
    expect(Math.abs(sum(r.loads, 'Fz'))).toBeLessThan(1e-9)
  })

  it('−X mirrors +X: the same uplift, the horizontal reversed', () => {
    const a = roofWindLoads(m, { ...wind, dir: '+X' })!, b = roofWindLoads(m, { ...wind, dir: '-X' })!
    expect(b.uplift).toBeCloseTo(a.uplift, 9)
    expect(sum(b.loads, 'Fx')).toBeCloseTo(-sum(a.loads, 'Fx'), 9)
  })

  it('wind along the ridge: zones by distance, and the two slopes cancel horizontally', () => {
    const r = roofWindLoads(m, { ...wind, dir: '+Z' })!
    expect(r.normalToRidge).toBe(false)
    expect(Math.abs(sum(r.loads, 'Fx'))).toBeLessThan(1e-9)
    expect(Math.abs(sum(r.loads, 'Fz'))).toBeLessThan(1e-9)
    // L = 5 m along the wind, h ≈ 3.95 m: 0–h at −0.9, h–2h at −0.5 (h/L ≈ 0.79 interpolates)
    expect(r.uplift).toBeGreaterThan(0)
  })

  it('a flat roof (θ < 10°) takes the distance zones in both directions, h at the eave', () => {
    const f = roofed({ profile: 'flat', web: 'pratt', rise: 1.2 })
    const r = roofWindLoads(f, { ...wind, dir: '+X' })!
    expect(r.theta).toBeLessThan(1e-9)
    expect(r.normalToRidge).toBe(false)
    expect(r.h).toBeCloseTo(4.4, 12)                                 // the flat top chord is the roof
    expect(Math.abs(sum(r.loads, 'Fx'))).toBeLessThan(1e-9)
    // uniform h/L = 4.4/12 ≤ 0.5: −0.9 to h, −0.5 to 2h, −0.3 beyond — Σ over 12 m × 5 m
    const q = velocityPressure(4.4, 50, 'C'), hh = 4.4
    const strip = (cp: number, len: number) => -(q * 0.85 * cp - q * 0.18) * len * 5
    const expectUp = strip(-0.9, hh) + strip(-0.5, hh) + strip(-0.3, 12 - 2 * hh)
    // panel pieces straddle the zone boundaries, so the discrete sum is close, not exact
    expect(r.uplift).toBeGreaterThan(0.93 * expectUp)
    expect(r.uplift).toBeLessThan(1.07 * expectUp)
  })

  it('more internal pressure, more uplift; an open roof none from inside', () => {
    const enc = roofWindLoads(m, { ...wind, dir: '+X' })!.uplift
    const part = roofWindLoads(m, { ...wind, dir: '+X', enclosure: 'partially' })!.uplift
    const open = roofWindLoads(m, { ...wind, dir: '+X', enclosure: 'open' })!.uplift
    expect(part - enc).toBeCloseTo(qh * (0.55 - 0.18) * 2 * A, 9)
    expect(enc - open).toBeCloseTo(qh * 0.18 * 2 * A, 9)
  })

  it('no trussed roofing, no roof wind', () => {
    const m0 = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3.2], section })
    expect(roofWindLoads(m0, { ...wind, dir: '+X' })).toBeNull()
  })
})

describe('the reason it matters — a light truss works in reverse under 0.9D + W', () => {
  // one 9 m bay, so the bottom chord is a simple tie under gravity
  const m0 = generateGridModel({ baysX: [9], baysZ: [5], storeyH: [3.2], section })
  const m = addRoofTrusses({ ...m0, loads: [] }, { ...spec, purlinShape: undefined }).model
  const dead = buildGravityLoads(m, 0, 0).filter((l) => l.cat === 'D')
  const w = roofWindLoads(m, { V: 55, exposure: 'C', dir: '+Z' })!.loads
  const N = (loads: ModelLoad[], id: string) => {
    const b = modelToFrame3D({ ...m, loads })
    const res = solveFrame3D(b.nodes, b.members, b.supports, b.loads)!
    const mr = res.members.find((x) => x.id === id)!
    return mr.N[Math.floor(mr.N.length / 2)]
  }
  const scale = (ls: ModelLoad[], f: number): ModelLoad[] => ls.map((l) => (l.kind === 'node'
    ? { ...l, Fx: (l.Fx ?? 0) * f, Fy: (l.Fy ?? 0) * f, Fz: (l.Fz ?? 0) * f }
    : l.kind === 'member-udl' ? { ...l, w: l.w * f } : l))

  it('gravity pulls the bottom chord; 0.9D + 1.0W pushes it', () => {
    expect(roofingLoads(m).length).toBeGreaterThan(0)
    expect(N(dead, 'rt2.bc2')).toBeGreaterThan(0)
    expect(N([...scale(dead, 0.9), ...w], 'rt2.bc2')).toBeLessThan(0)
  })
})

describe('the DOWNWARD branch — a steep roof pushed down on its windward slope', () => {
  it('the positive windward row of Fig. 207B.4-1', () => {
    expect(cpWindwardRoofPos(10, 0.25)).toBe(-0.18)
    expect(cpWindwardRoofPos(20, 0.25)).toBe(0.2)
    expect(cpWindwardRoofPos(30, 0.5)).toBe(0.2)
    expect(cpWindwardRoofPos(45, 1.0)).toBe(0.3)
    expect(cpWindwardRoofPos(17.5, 0.25)).toBeCloseTo(0.1, 12)         // halfway 15 → 20
  })

  // 30° gable on the same 12 m × 5 m frame: rise = 6·tan30°
  const rise = 6 * Math.tan(Math.PI / 6)
  const steep = roofed({ rise })
  const h = (3.2 + 3.2 + rise) / 2, qh = velocityPressure(h, 50, 'C'), A = 30
  const r = roofWindLoads(steep, { ...wind, dir: '+X', branch: 'downward' })!

  it('closed form: windward pushed down, internal SUCTION with it', () => {
    expect(r.theta).toBeCloseTo(30, 9)
    expect(r.GCpi).toBe(-0.18)
    const hL = h / 12
    const pw = qh * 0.85 * cpWindwardRoofPos(30, hL) + qh * 0.18
    const pl = qh * 0.85 * cpLeewardRoof(30, hL) + qh * 0.18
    expect(r.windwardCp).toBeCloseTo(cpWindwardRoofPos(30, hL), 12)
    expect(r.windwardCp).toBeGreaterThan(0)
    expect(sum(r.loads, 'Fy')).toBeCloseTo(-(pw + pl) * A, 9)
    expect(sum(r.loads, 'Fx')).toBeCloseTo((pw - pl) * A * Math.tan(Math.PI / 6), 9)
  })

  it('a shallow roof has no positive windward Cp — the case would govern nothing', () => {
    const shallow = roofWindLoads(roofed(), { ...wind, dir: '+X', branch: 'downward' })!
    expect(shallow.windwardCp).toBeLessThanOrEqual(0)
  })

  it('there is no downward branch for wind along the ridge', () => {
    expect(roofWindLoads(steep, { ...wind, dir: '+Z', branch: 'downward' })).toBeNull()
  })

  it('it is the case that loads the windward top chord harder than gravity alone', () => {
    const m0 = generateGridModel({ baysX: [9], baysZ: [5], storeyH: [3.2], section })
    const m = addRoofTrusses({ ...m0, loads: [] }, { ...spec, rise: 4.5 * Math.tan(Math.PI / 6), purlinShape: undefined }).model
    const dead = buildGravityLoads(m, 0, 0).filter((l) => l.cat === 'D')
    const wd = roofWindLoads(m, { V: 55, exposure: 'C', dir: '+X', branch: 'downward' })!.loads
    const N = (loads: ModelLoad[], id: string) => {
      const b = modelToFrame3D({ ...m, loads })
      const res = solveFrame3D(b.nodes, b.members, b.supports, b.loads)!
      const mr = res.members.find((x) => x.id === id)!
      return mr.N[Math.floor(mr.N.length / 2)]
    }
    // the windward (left, wind +X) top chord beside the apex
    expect(N([...dead, ...wd], 'rt2.tc2')).toBeLessThan(N(dead, 'rt2.tc2'))
    expect(N(dead, 'rt2.tc2')).toBeLessThan(0)
  })
})
