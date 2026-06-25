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
    expect(r.source).toBe('synthetic')
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

  it('csv: accepts a two-column accelerogram and returns source=csv', () => {
    // Build a simple triangular pulse as a CSV (time, ag in m/s²)
    const dt = 0.02, n = 201
    const w = 2 * Math.PI * 2, pga = 3
    const lines = Array.from({ length: n }, (_, i) => {
      const t = i * dt
      const ramp = Math.min(1, t / 0.5)
      const decay = Math.exp(-t / 1.5)
      return `${t.toFixed(4)}, ${(pga * Math.sin(w * t) * ramp * decay).toFixed(8)}`
    })
    const text = ['# test accelerogram', 'time(s), ag(m/s2)', ...lines].join('\n')
    const r = runTimeHistoryModel(model, { csv: { text, dir: 0 }, zeta: 0.05, nModes: 8 })!
    expect(r).toBeTruthy()
    expect(r.source).toBe('csv')
    expect(r.pga).toBeGreaterThan(0)   // envelope attenuates peak below nominal pga; just verify positive
    expect(r.result.peakBaseShear).toBeGreaterThan(0)
  })

  it('csv: returns null when CSV cannot be parsed (one-column without dt)', () => {
    const text = '0.001\n0.002\n0.003'
    expect(runTimeHistoryModel(model, { csv: { text, dir: 0 } })).toBeNull()
  })

  it('returns null without spec or csv', () => {
    expect(runTimeHistoryModel(model, {})).toBeNull()
  })

  it('returns null for an empty model', () => {
    expect(runTimeHistoryModel({ ...model, nodes: [], members: [] }, {
      spec: { kind: 'harmonic', dt: 0.02, duration: 2, pga: 1, freq: 1, dir: 0 },
    })).toBeNull()
  })
})
