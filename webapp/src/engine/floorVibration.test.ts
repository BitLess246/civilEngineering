import { describe, it, expect } from 'vitest'
import { freqFromDeflection, dg11Walking, DG11_OCCUPANCY } from './floorVibration'
import { GRAVITY } from './modal'

describe('freqFromDeflection — DG11 Eq. 3.3', () => {
  it('fn = 0.18·√(g/Δ)', () => {
    const defl = 0.005   // 5 mm
    expect(freqFromDeflection(defl)).toBeCloseTo(0.18 * Math.sqrt(GRAVITY / defl), 9)
    expect(freqFromDeflection(0.005)).toBeCloseTo(7.97, 1)   // ~8 Hz
  })

  it('stiffer floor (smaller Δ) ⇒ higher frequency', () => {
    expect(freqFromDeflection(0.002)).toBeGreaterThan(freqFromDeflection(0.010))
  })

  it('zero/negative deflection ⇒ infinite frequency (degenerate)', () => {
    expect(freqFromDeflection(0)).toBe(Infinity)
    expect(freqFromDeflection(-1)).toBe(Infinity)
  })
})

describe('dg11Walking — peak acceleration vs tolerance (Eq. 4.1)', () => {
  it('ap/g = Po·exp(−0.35·fn)/(β·W)', () => {
    const r = dg11Walking({ fn: 5, W: 500, beta: 0.03, Po: 0.29, aoLimit: 0.005 })
    const expected = (0.29 * Math.exp(-0.35 * 5)) / (0.03 * 500)
    expect(r.apOverG).toBeCloseTo(expected, 12)
    expect(r.apOverG).toBeCloseTo(0.00336, 4)
    expect(r.ok).toBe(true)            // 0.336% < 0.5%
    expect(r.ratio).toBeCloseTo(r.apOverG / 0.005, 9)
  })

  it('flags a lively floor that exceeds the office limit', () => {
    // light, lightly-damped floor → large ap/g
    const r = dg11Walking({ fn: 4, W: 150, beta: 0.02, Po: 0.29, aoLimit: 0.005 })
    expect(r.apOverG).toBeGreaterThan(0.005)
    expect(r.ok).toBe(false)
    expect(r.ratio).toBeGreaterThan(1)
  })

  it('higher frequency and more damping both reduce ap/g', () => {
    const base = dg11Walking({ fn: 4, W: 300, beta: 0.03, Po: 0.29, aoLimit: 0.005 })
    const stiffer = dg11Walking({ fn: 7, W: 300, beta: 0.03, Po: 0.29, aoLimit: 0.005 })
    const damped = dg11Walking({ fn: 4, W: 300, beta: 0.05, Po: 0.29, aoLimit: 0.005 })
    expect(stiffer.apOverG).toBeLessThan(base.apOverG)
    expect(damped.apOverG).toBeLessThan(base.apOverG)
  })

  it('degenerate W or β ⇒ infinite acceleration (fails)', () => {
    expect(dg11Walking({ fn: 5, W: 0, beta: 0.03, Po: 0.29, aoLimit: 0.005 }).ok).toBe(false)
    expect(dg11Walking({ fn: 5, W: 500, beta: 0, Po: 0.29, aoLimit: 0.005 }).ok).toBe(false)
  })
})

describe('DG11_OCCUPANCY presets', () => {
  it('offices use 0.5%g, malls 1.5%g, outdoor footbridges 5%g', () => {
    const by = (id: string) => DG11_OCCUPANCY.find((o) => o.id === id)!
    expect(by('office').aoLimit).toBeCloseTo(0.005, 9)
    expect(by('mall').aoLimit).toBeCloseTo(0.015, 9)
    expect(by('footbridge-out').aoLimit).toBeCloseTo(0.050, 9)
    expect(by('footbridge-in').Po).toBeCloseTo(0.41, 9)
    expect(by('office').Po).toBeCloseTo(0.29, 9)
  })
})
