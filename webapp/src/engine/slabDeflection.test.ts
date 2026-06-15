import { describe, it, expect } from 'vitest'
import { Ec, crackedInertia, effectiveInertia, stripDeflection, slabPanelDeflection } from './slabDeflection'

describe('Ec', () => {
  it('Ec = 4700√fc (MPa)', () => {
    expect(Ec(28)).toBeCloseTo(4700 * Math.sqrt(28), 6)
  })
})

describe('crackedInertia', () => {
  it('is smaller than the gross inertia for a normal slab strip', () => {
    const b = 1000, h = 200, d = 165, As = 800, fc = 28
    const Icr = crackedInertia({ b, d, As, fc })
    const Ig = (b * h ** 3) / 12
    expect(Icr).toBeGreaterThan(0)
    expect(Icr).toBeLessThan(Ig)
  })

  it('more steel → larger cracked inertia', () => {
    const lo = crackedInertia({ b: 1000, d: 165, As: 600, fc: 28 })
    const hi = crackedInertia({ b: 1000, d: 165, As: 1200, fc: 28 })
    expect(hi).toBeGreaterThan(lo)
  })
})

describe('effectiveInertia (Branson)', () => {
  it('returns Ig when uncracked (Ma ≤ Mcr)', () => {
    const r = effectiveInertia({ Ma: 1, b: 1000, h: 200, d: 165, As: 800, fc: 28 })
    expect(r.Ie).toBeCloseTo(r.Ig, 6)
  })

  it('Icr ≤ Ie ≤ Ig once cracked', () => {
    const r = effectiveInertia({ Ma: 60, b: 1000, h: 200, d: 165, As: 800, fc: 28 })
    expect(r.Ie).toBeGreaterThanOrEqual(r.Icr - 1e-3)
    expect(r.Ie).toBeLessThanOrEqual(r.Ig + 1e-3)
  })

  it('Ie decreases as the service moment grows', () => {
    const a = effectiveInertia({ Ma: 30, b: 1000, h: 200, d: 165, As: 800, fc: 28 })
    const b = effectiveInertia({ Ma: 90, b: 1000, h: 200, d: 165, As: 800, fc: 28 })
    expect(b.Ie).toBeLessThanOrEqual(a.Ie)
  })
})

describe('stripDeflection', () => {
  const base = {
    ln: 6, bStrip: 3000, h: 200, d: 165, As: 1500,
    wD: 15, wL: 8, Ma: 40, fc: 28, exterior: false,
  }
  it('immediate D+L = immediate D + immediate L', () => {
    const r = stripDeflection(base)
    expect(r.immDL).toBeCloseTo(r.immD + r.immL, 6)
  })
  it('end span deflects more than an interior span', () => {
    const interior = stripDeflection({ ...base, exterior: false })
    const end = stripDeflection({ ...base, exterior: true })
    expect(end.immDL).toBeGreaterThan(interior.immDL)
  })
  it('longer span deflects much more (≈ ℓ⁴)', () => {
    const s6 = stripDeflection({ ...base, ln: 6 })
    const s8 = stripDeflection({ ...base, ln: 8 })
    expect(s8.immDL).toBeGreaterThan(s6.immDL * 2)
  })
})

describe('slabPanelDeflection', () => {
  const sq = {
    ln: 6, csW: 3, msW: 3, h: 200, d: 165,
    AsCol: 1500, AsMid: 1000, MaCol: 45, MaMid: 30, exterior: false,
  }
  const params = { x: { ...sq }, y: { ...sq }, wD: 5, wL: 3, fc: 28 }

  it('computes a positive mid-panel deflection', () => {
    const r = slabPanelDeflection(params)
    expect(r.immediate).toBeGreaterThan(0)
    expect(r.total).toBeGreaterThan(0)
  })

  it('long-term uses λΔ = 2.0 (ρ′ = 0)', () => {
    const r = slabPanelDeflection(params)
    expect(r.lambdaDelta).toBeCloseTo(2.0, 6)
  })

  it('total = λΔ·immD + immediate live', () => {
    const r = slabPanelDeflection(params)
    expect(r.total).toBeGreaterThan(r.longTerm)        // includes the live part
    expect(r.total).toBeGreaterThanOrEqual(r.immLive)
  })

  it('limits are ℓn/360 (live) and ℓn/240 (total)', () => {
    const r = slabPanelDeflection(params)
    expect(r.limitLive).toBeCloseTo((6 * 1000) / 360, 6)
    expect(r.limitTotal).toBeCloseTo((6 * 1000) / 240, 6)
  })

  it('a stiff (thick) panel passes both checks', () => {
    const thick = {
      x: { ...sq, h: 300, d: 260 }, y: { ...sq, h: 300, d: 260 },
      wD: 5, wL: 3, fc: 28,
    }
    const r = slabPanelDeflection(thick)
    expect(r.liveOK).toBe(true)
    expect(r.totalOK).toBe(true)
  })

  it('a slender, heavily loaded long-span panel fails the total limit', () => {
    const weak = {
      x: { ln: 9, csW: 3, msW: 3, h: 150, d: 120, AsCol: 800, AsMid: 600, MaCol: 70, MaMid: 45, exterior: true },
      y: { ln: 9, csW: 3, msW: 3, h: 150, d: 120, AsCol: 800, AsMid: 600, MaCol: 70, MaMid: 45, exterior: true },
      wD: 8, wL: 6, fc: 28,
    }
    const r = slabPanelDeflection(weak)
    expect(r.totalOK).toBe(false)
  })
})
