import { describe, it, expect } from 'vitest'
import { makeGroundMotion, runTimeHistoryModel } from './timeHistoryModel'
import { generateGridModel } from './modelBuilder'
import type { RectSection } from './model'

describe('makeGroundMotion', () => {
  it('harmonic: a_g = PGA·sin(2πf t), correct length and peak', () => {
    const gm = makeGroundMotion({ kind: 'harmonic', dt: 0.01, duration: 2, pga: 3, freq: 1, dir: 0 })
    expect(gm.ag.length).toBe(201)
    expect(gm.dt).toBe(0.01)
    expect(Math.max(...gm.ag.map(Math.abs))).toBeCloseTo(3, 3)
    expect(gm.ag[0]).toBeCloseTo(0, 9)
    expect(gm.ag[25]).toBeCloseTo(3 * Math.sin(2 * Math.PI * 1 * 0.25), 6)  // quarter period → peak
  })

  it('pulse: zero after one period', () => {
    const f = 2
    const gm = makeGroundMotion({ kind: 'pulse', dt: 0.01, duration: 2, pga: 5, freq: f, dir: 0 })
    const tQuiet = Math.round((1 / f + 0.2) / 0.01)
    expect(gm.ag[tQuiet]).toBe(0)
    expect(Math.max(...gm.ag.map(Math.abs))).toBeGreaterThan(0)
  })

  it('rampedSine: starts near zero and decays toward the end', () => {
    const gm = makeGroundMotion({ kind: 'rampedSine', dt: 0.01, duration: 6, pga: 4, freq: 1.5, dir: 0 })
    const earlyPeak = Math.max(...gm.ag.slice(0, 100).map(Math.abs))
    const latePeak = Math.max(...gm.ag.slice(-100).map(Math.abs))
    expect(latePeak).toBeLessThan(earlyPeak)   // envelope decays
  })
})

describe('runTimeHistoryModel', () => {
  const section: RectSection = {
    id: 'S1', name: '400×400', b: 400, h: 400, fc: 28, fy: 415,
    barDia: 20, tieDia: 10, cover: 40, material: 'concrete',
  }
  const model = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3.5, 3], section })

  it('runs and returns base-shear + roof histories at the roof control node', () => {
    const r = runTimeHistoryModel(model, {
      spec: { kind: 'rampedSine', dt: 0.02, duration: 6, pga: 3, freq: 2, dir: 0 },
      zeta: 0.05, nModes: 8,
    })!
    expect(r).toBeTruthy()
    // control node is a roof node
    const yMax = Math.max(...model.nodes.map((nd) => nd.y))
    expect(model.nodes.find((nd) => nd.id === r.controlNode)!.y).toBeCloseTo(yMax, 6)
    // histories present and consistent in length
    expect(r.result.baseShear.length).toBe(r.result.t.length)
    expect(r.result.nodeHistory!.node).toBe(r.controlNode)
    expect(r.result.nodeHistory!.u.length).toBe(r.result.t.length)
    expect(r.result.peakBaseShear).toBeGreaterThan(0)
    expect(Math.abs(r.peakRoof)).toBeGreaterThan(0)
  })

  it('returns null for an empty model', () => {
    expect(runTimeHistoryModel({ ...model, nodes: [], members: [] }, {
      spec: { kind: 'harmonic', dt: 0.02, duration: 2, pga: 1, freq: 1, dir: 0 },
    })).toBeNull()
  })
})
