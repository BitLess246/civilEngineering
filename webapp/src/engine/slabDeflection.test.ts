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

describe('slabPanelDeflection with edge beams (Nilson–Walters)', () => {
  // A square interior panel, uncracked (small moments), so every inertia is
  // gross and the whole calculation can be done by hand.
  const fc = 28, h = 150, wD = 6, wL = 2
  const dir = (beamIg?: number) => ({
    ln: 5.6, csW: 3, msW: 3, h, d: 125, AsCol: 600, AsMid: 600,
    MaCol: 1, MaMid: 1, exterior: false, l1: 6, ...(beamIg === undefined ? {} : { beamIg }),
  })
  const beamIg = (300 * 500 ** 3) / 12

  it('matches the hand calculation: column strip + beam, middle strip alone', () => {
    const r = slabPanelDeflection({ x: dir(beamIg), y: dir(beamIg), wD, wL, fc })
    const E = Ec(fc) * 1000                                   // kPa
    const Is = (3000 * h ** 3) / 12                           // each strip, uncracked
    // α = Ib / Is(ℓ2) = 3.125e9 / 1.6875e9 = 1.85 ⇒ α·ℓ2/ℓ1 ≥ 1 ⇒ LDF = 0.75 at ℓ2/ℓ1 = 1
    const ldf = 0.75
    const Ic = Is + 0.35 * beamIg, Im = Is
    const d = (share: number, I: number, w: number) => (share * w * 6 * 5.6 ** 4) / (384 * E * (I / 1e12)) * 1000
    const immDL = d(ldf, Ic, wD + wL) + d(1 - ldf, Im, wD + wL)
    expect(r.immediate).toBeCloseTo(immDL, 9)
    expect(r.immLive).toBeCloseTo(d(ldf, Ic, wL) + d(1 - ldf, Im, wL), 9)
    expect(r.cracked).toBe(false)
  })
  it('a stiffer beam deflects less, and no beam data leaves the old answer untouched', () => {
    const none = slabPanelDeflection({ x: dir(), y: dir(), wD, wL, fc })
    const weak = slabPanelDeflection({ x: dir(beamIg / 4), y: dir(beamIg / 4), wD, wL, fc })
    const stiff = slabPanelDeflection({ x: dir(beamIg), y: dir(beamIg), wD, wL, fc })
    expect(stiff.immediate).toBeLessThan(weak.immediate)
    // the pre-existing beamless strips: each under its own tributary load
    const E = Ec(fc) * 1000, Is = (3000 * h ** 3) / 12
    const old = 2 * (8 * 3 * 5.6 ** 4) / (384 * E * (Is / 1e12)) * 1000
    expect(none.immediate).toBeCloseTo(old, 9)
  })
  it('a beam too flexible to earn the with-beam split keeps part of the no-beam share', () => {
    // α·ℓ2/ℓ1 = 0.5 ⇒ LDF halfway from the DDM split (0.5 here) to 0.75
    const Is6 = (6000 * h ** 3) / 12
    const r = slabPanelDeflection({ x: dir(0.5 * Is6), y: dir(0.5 * Is6), wD, wL, fc })
    const E = Ec(fc) * 1000, Is = (3000 * h ** 3) / 12
    const ldf = 0.5 + 0.5 * (0.75 - 0.5)
    const d = (share: number, I: number) => (share * 8 * 6 * 5.6 ** 4) / (384 * E * (I / 1e12)) * 1000
    expect(r.immediate).toBeCloseTo(d(ldf, Is + 0.35 * 0.5 * Is6) + d(1 - ldf, Is), 9)
  })
})
