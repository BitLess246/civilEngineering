import { describe, it, expect } from 'vitest'
import { reducedPlasticMoment } from './pmInteraction'

describe('reducedPlasticMoment — P–M interaction surfaces', () => {
  const Mp = 100, Pcap = 1000

  it('returns Mp unchanged when there is no axial force', () => {
    expect(reducedPlasticMoment(Mp, 0, Pcap, 'steel-strong')).toBeCloseTo(Mp, 9)
    expect(reducedPlasticMoment(Mp, 0, Pcap, 'steel-weak')).toBeCloseTo(Mp, 9)
    expect(reducedPlasticMoment(Mp, 0, Pcap, 'concrete')).toBeCloseTo(Mp, 9)
  })

  it('returns Mp when no axial capacity is provided (Pcap ≤ 0)', () => {
    expect(reducedPlasticMoment(Mp, 500, 0, 'concrete')).toBe(Mp)
    expect(reducedPlasticMoment(Mp, 500, -1, 'steel-strong')).toBe(Mp)
  })

  it('steel strong axis: 1.18·Mp·(1 − P/Py), clamped to Mp', () => {
    // at P/Py = 0.5 → 1.18·0.5 = 0.59
    expect(reducedPlasticMoment(Mp, 500, 1000, 'steel-strong')).toBeCloseTo(59, 6)
    // low axial (P/Py = 0.10) → 1.18·0.9 = 1.062 → clamped to Mp
    expect(reducedPlasticMoment(Mp, 100, 1000, 'steel-strong')).toBeCloseTo(Mp, 6)
    // full squash → zero moment
    expect(reducedPlasticMoment(Mp, 1000, 1000, 'steel-strong')).toBeCloseTo(0, 6)
  })

  it('steel weak axis: 1.19·Mp·(1 − (P/Py)²), clamped to Mp', () => {
    // P/Py = 0.5 → 1.19·(1−0.25) = 0.8925
    expect(reducedPlasticMoment(Mp, 500, 1000, 'steel-weak')).toBeCloseTo(89.25, 6)
    // weak axis retains more capacity than strong at the same axial
    expect(reducedPlasticMoment(Mp, 500, 1000, 'steel-weak'))
      .toBeGreaterThan(reducedPlasticMoment(Mp, 500, 1000, 'steel-strong'))
  })

  it('concrete: linear ACI chord Mp·(1 − P/Pn0)', () => {
    expect(reducedPlasticMoment(Mp, 250, 1000, 'concrete')).toBeCloseTo(75, 6)
    expect(reducedPlasticMoment(Mp, 1000, 1000, 'concrete')).toBeCloseTo(0, 6)
  })

  it('uses |P| — tension reduces capacity symmetrically', () => {
    expect(reducedPlasticMoment(Mp, -500, 1000, 'steel-strong'))
      .toBeCloseTo(reducedPlasticMoment(Mp, 500, 1000, 'steel-strong'), 9)
  })

  it('never returns more than Mp or less than 0', () => {
    for (const p of [-2000, -500, 0, 300, 1500]) {
      for (const k of ['steel-strong', 'steel-weak', 'concrete'] as const) {
        const m = reducedPlasticMoment(Mp, p, 1000, k)
        expect(m).toBeGreaterThanOrEqual(0)
        expect(m).toBeLessThanOrEqual(Mp + 1e-9)
      }
    }
  })

  it('is monotonically non-increasing in axial magnitude', () => {
    for (const k of ['steel-strong', 'steel-weak', 'concrete'] as const) {
      let prev = Infinity
      for (const p of [0, 200, 400, 600, 800, 1000]) {
        const m = reducedPlasticMoment(Mp, p, 1000, k)
        expect(m).toBeLessThanOrEqual(prev + 1e-9)
        prev = m
      }
    }
  })
})
