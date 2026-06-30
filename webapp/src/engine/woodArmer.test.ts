import { describe, it, expect } from 'vitest'
import { woodArmer, designSlabStrip, designSlabFE, maxSlabSpacing, type ShellMomentSample } from './woodArmer'
import { flexuralSteel, rhoMin } from './flexure'

describe('woodArmer — design moments from (Mx, My, Mxy)', () => {
  it('no twist: bottom = sagging moments, top = hogging magnitudes', () => {
    const wa = woodArmer(40, 20, 0)
    expect(wa.mxBottom).toBeCloseTo(40, 9)
    expect(wa.myBottom).toBeCloseTo(20, 9)
    expect(wa.mxTop).toBe(0)        // both positive ⇒ no hogging steel
    expect(wa.myTop).toBe(0)
  })

  it('pure twist Mxy adds |Mxy| to both bottom and top faces', () => {
    const wa = woodArmer(0, 0, 15)
    expect(wa.mxBottom).toBeCloseTo(15, 9)
    expect(wa.myBottom).toBeCloseTo(15, 9)
    expect(wa.mxTop).toBeCloseTo(15, 9)
    expect(wa.myTop).toBeCloseTo(15, 9)
  })

  it('default rule M*x = Mx + |Mxy| when it stays positive', () => {
    const wa = woodArmer(30, 10, 8)
    expect(wa.mxBottom).toBeCloseTo(38, 9)
    expect(wa.myBottom).toBeCloseTo(18, 9)
  })

  it('sign of Mxy is immaterial (uses magnitude)', () => {
    const a = woodArmer(30, 10, 8)
    const b = woodArmer(30, 10, -8)
    expect(b.mxBottom).toBeCloseTo(a.mxBottom, 12)
    expect(b.myBottom).toBeCloseTo(a.myBottom, 12)
  })

  it('correction A: when Mx + |Mxy| < 0, M*x = 0 and M*y picks up |Mxy²/Mx|', () => {
    // Mx = −5, Mxy = 3 → Mx + |Mxy| = −2 < 0
    const wa = woodArmer(-5, 12, 3)
    expect(wa.mxBottom).toBe(0)
    expect(wa.myBottom).toBeCloseTo(12 + (3 * 3) / 5, 9)   // My + |Mxy²/Mx| = 12 + 1.8
  })

  it('top face: a hogging panel needs top steel, no bottom steel', () => {
    const wa = woodArmer(-40, -25, 0)
    expect(wa.mxBottom).toBe(0)
    expect(wa.myBottom).toBe(0)
    expect(wa.mxTop).toBeCloseTo(40, 9)
    expect(wa.myTop).toBeCloseTo(25, 9)
  })

  it('top correction: Mx − |Mxy| > 0 ⇒ M*x_top = 0, M*y_top from |Mxy²/Mx|', () => {
    // Mx = 5, My = −20, Mxy = 3 → top default M*x = 5 − 3 = 2 > 0
    const wa = woodArmer(5, -20, 3)
    expect(wa.mxTop).toBe(0)
    expect(wa.myTop).toBeCloseTo(Math.abs(-20 - (3 * 3) / 5), 9)   // |−20 − 1.8| = 21.8
  })

  it('always returns non-negative magnitudes', () => {
    for (const [mx, my, mxy] of [[-50, -50, 40], [12, -7, 20], [-3, 9, -11]] as const) {
      const wa = woodArmer(mx, my, mxy)
      for (const v of [wa.mxBottom, wa.myBottom, wa.mxTop, wa.myTop]) expect(v).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('designSlabStrip — per-metre flexural reinforcement', () => {
  const sec = { t: 150, cover: 20, barDia: 12, fc: 28, fy: 415 }

  it('As matches flexuralSteel at d = t − cover − 1.5·db over a 1 m strip', () => {
    const d = 150 - 20 - 1.5 * 12               // 112 mm
    const flex = flexuralSteel({ Mu: 25, b: 1000, d, fc: 28, fy: 415 })
    const AsMin = rhoMin(28, 415) * 1000 * d
    const r = designSlabStrip({ Mu: 25, ...sec })
    expect(r.As).toBeCloseTo(Math.max(flex.As, AsMin), 6)
  })

  it('zero moment still provides the shrinkage/temperature minimum', () => {
    const d = 150 - 20 - 1.5 * 12
    const r = designSlabStrip({ Mu: 0, ...sec })
    expect(r.usedMin).toBe(true)
    expect(r.As).toBeCloseTo(rhoMin(28, 415) * 1000 * d, 6)
    expect(r.As).toBeGreaterThan(0)
  })

  it('spacing never exceeds the ACI maximum min(3h, 450)', () => {
    const r = designSlabStrip({ Mu: 0.1, ...sec })
    expect(r.spacing).toBeLessThanOrEqual(maxSlabSpacing(150))
    expect(maxSlabSpacing(150)).toBe(450)
  })

  it('provided steel at the adopted spacing covers the requirement', () => {
    const r = designSlabStrip({ Mu: 40, ...sec })
    expect(r.AsProvided).toBeGreaterThanOrEqual(r.As * 0.999)   // spacing rounded down ⇒ ≥ required
  })

  it('a heavier moment needs more steel (tighter spacing)', () => {
    const light = designSlabStrip({ Mu: 10, ...sec })
    const heavy = designSlabStrip({ Mu: 45, ...sec })
    expect(heavy.As).toBeGreaterThan(light.As)
    expect(heavy.spacing).toBeLessThanOrEqual(light.spacing)
  })
})

describe('designSlabFE — envelope over a panel', () => {
  const sec = { t: 150, cover: 20, barDia: 12, fc: 28, fy: 415 }
  const samples: ShellMomentSample[] = [
    { id: 'p_0_0_0', Mx: 30, My: 10, Mxy: 5 },     // sagging mid-panel
    { id: 'p_1_0_0', Mx: 12, My: 6, Mxy: 2 },
    { id: 'p_0_1_0', Mx: -28, My: -18, Mxy: 4 },   // hogging near support
  ]

  it('returns null for an empty field', () => {
    expect(designSlabFE([], sec)).toBeNull()
  })

  it('envelopes the worst Wood-Armer moment per direction/face', () => {
    const r = designSlabFE(samples, sec)!
    // bottom envelope = max sagging design moment across the elements
    const each = samples.map((s) => woodArmer(s.Mx, s.My, s.Mxy))
    expect(r.moments.mxBottom).toBeCloseTo(Math.max(...each.map((w) => w.mxBottom)), 9)
    expect(r.moments.myTop).toBeCloseTo(Math.max(...each.map((w) => w.myTop)), 9)
  })

  it('attributes the governing sagging/hogging elements', () => {
    const r = designSlabFE(samples, sec)!
    expect(r.govBottom).toBe('p_0_0_0')   // largest +M element
    expect(r.govTop).toBe('p_0_1_0')      // largest −M element
  })

  it('designs all four strips with positive steel', () => {
    const r = designSlabFE(samples, sec)!
    for (const strip of [r.bottomX, r.bottomY, r.topX, r.topY]) {
      expect(strip.As).toBeGreaterThan(0)
      expect(strip.spacing).toBeGreaterThan(0)
    }
  })
})
