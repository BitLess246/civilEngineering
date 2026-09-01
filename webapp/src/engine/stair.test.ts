import { describe, it, expect } from 'vitest'
import { stairGeometry, stairLoads, landingLoads, designStair } from './stair'
import { flexuralSteel, rhoMin } from './flexure'

describe('stairGeometry', () => {
  it('θ = atan(R/G); cosθ = G/√(G²+R²)', () => {
    const g = stairGeometry(150, 300)
    expect(g.thetaDeg).toBeCloseTo((Math.atan2(150, 300) * 180) / Math.PI, 6)
    expect(g.cosTheta).toBeCloseTo(300 / Math.hypot(150, 300), 9)
    expect(g.slopeFactor).toBeCloseTo(1 / g.cosTheta, 9)
  })
  it('a steeper flight has a smaller cosθ (more incline)', () => {
    expect(stairGeometry(200, 250).cosTheta).toBeLessThan(stairGeometry(150, 300).cosTheta)
  })
})

describe('stairLoads', () => {
  const base = { t: 150, R: 150, G: 300, finishes: 1.5, live: 4.8 }
  it('dead = waist/cosθ + steps(R/2) + finishes; wu = 1.2D + 1.6L', () => {
    const L = stairLoads(base)
    const cos = 300 / Math.hypot(150, 300)
    expect(L.waist).toBeCloseTo((24 * 0.15) / cos, 6)
    expect(L.steps).toBeCloseTo((24 * 0.15) / 2, 6)
    expect(L.dead).toBeCloseTo(L.waist + L.steps + 1.5, 9)
    expect(L.wu).toBeCloseTo(1.2 * L.dead + 1.6 * 4.8, 9)
  })
  it('a thicker waist and bigger riser increase the dead load', () => {
    expect(stairLoads({ ...base, t: 200 }).dead).toBeGreaterThan(stairLoads(base).dead)
    expect(stairLoads({ ...base, R: 200 }).steps).toBeGreaterThan(stairLoads(base).steps)
  })
})

describe('designStair', () => {
  const base = {
    span: 3.5, t: 150, R: 150, G: 300, fc: 28, fy: 415,
    barDia: 12, cover: 20, finishes: 1.5, live: 4.8,
  }
  it('Mu = wu·L²/8 (simple) and As matches flexuralSteel per metre', () => {
    const r = designStair(base)
    expect(r.Mu).toBeCloseTo((r.loads.wu * 3.5 ** 2) / 8, 6)
    const d = 150 - 20 - 6
    const flex = flexuralSteel({ Mu: r.Mu, b: 1000, d, fc: 28, fy: 415 })
    expect(r.AsMain).toBeCloseTo(Math.max(flex.As, rhoMin(28, 415) * 1000 * d), 4)
  })
  it('distribution steel = 0.0018·b·t (§424.4.3.2)', () => {
    const r = designStair(base)
    expect(r.AsDist).toBeCloseTo(0.0018 * 1000 * 150, 6)
  })
  it('support condition changes the moment coefficient', () => {
    const simple = designStair(base)
    const cont = designStair({ ...base, support: 'both-ends' })
    expect(cont.Mu).toBeLessThan(simple.Mu)       // wu·L²/11 < wu·L²/8
  })
  it('flags an under-thick waist (Table 409.3.1.1, ℓ/20 simple)', () => {
    expect(designStair({ ...base, t: 150 }).tMin).toBeCloseTo(3500 / 20, 6)   // 175 mm
    expect(designStair({ ...base, t: 150 }).tMinOK).toBe(false)               // 150 < 175
    expect(designStair({ ...base, t: 200 }).tMinOK).toBe(true)
  })
  it('main bar spacing is capped at min(3t, 450) and positive', () => {
    const r = designStair(base)
    expect(r.mainSpacing).toBeGreaterThan(0)
    expect(r.mainSpacing).toBeLessThanOrEqual(Math.min(3 * 150, 450))
  })
})

describe('the verdict includes the span/depth minimum', () => {
  const base = {
    span: 4, R: 165, G: 280, fc: 28, fy: 415, barDia: 12, cover: 20,
    finishes: 1.5, live: 4.8,
  }

  it('a waist under Table 407.3.1.1 ℓ/20 is NOT ok, however the steel came out', () => {
    // `ok` used to mean only "a design came out", so this returned true with
    // `tMinOK: false` printed beside it — a contradiction a reader could see
    // and a caller could not.
    const thin = designStair({ ...base, t: 150, support: 'simple' })
    expect(thin.tMin).toBeCloseTo(200, 9)          // 4000 / 20
    expect(thin.tMinOK).toBe(false)
    expect(thin.ok).toBe(false)
    expect(thin.AsMain).toBeGreaterThan(0)         // …and it is not for want of steel
  })

  it('the same flight passes once the waist reaches the minimum', () => {
    const thick = designStair({ ...base, t: 200, support: 'simple' })
    expect(thick.tMinOK).toBe(true)
    expect(thick.ok).toBe(true)
  })

  it('continuity lowers the minimum, so a thinner waist can pass', () => {
    // ℓ/20 simple, ℓ/24 one end, ℓ/28 both — the one-way slab ratios.
    const t = 150
    expect(designStair({ ...base, t, support: 'simple' }).tMin).toBeCloseTo(200, 9)
    expect(designStair({ ...base, t, support: 'one-end' }).tMin).toBeCloseTo(4000 / 24, 9)
    expect(designStair({ ...base, t, support: 'both-ends' }).tMin).toBeCloseTo(4000 / 28, 9)
    expect(designStair({ ...base, t, support: 'both-ends' }).ok).toBe(true)
  })
})

describe('landingLoads — a landing is a flat slab, not a flat flight', () => {
  it('drops the two things that make a flight heavy per plan metre', () => {
    const l = landingLoads({ t: 150, finishes: 1.5, live: 4.8 })
    expect(l.waist).toBeCloseTo(24 * 0.15, 12)     // vertical thickness, no 1/cosθ
    expect(l.steps).toBe(0)                        // nothing triangular on top
    expect(l.dead).toBeCloseTo(24 * 0.15 + 1.5, 12)
    expect(l.wu).toBeCloseTo(1.2 * l.dead + 1.6 * 4.8, 12)
  })

  it('is lighter than the flight it continues, at every slope', () => {
    // Which is what makes designing a stair-with-landing on the flight's own
    // load over the whole span conservative rather than an error to correct.
    for (const [R, G] of [[150, 300], [175, 275], [190, 250]]) {
      const flight = stairLoads({ t: 150, R, G, finishes: 1.5, live: 4.8 })
      const land = landingLoads({ t: 150, finishes: 1.5, live: 4.8 })
      expect(land.dead).toBeLessThan(flight.dead)
    }
  })

  it('at zero slope and no treads the two agree — the slab is the same slab', () => {
    // A degenerate flight (R = 0) is a flat slab, and the two formulae must
    // meet there or one of them has a term the other is missing.
    const flat = stairLoads({ t: 150, R: 0, G: 300, finishes: 1.5, live: 4.8 })
    expect(flat.dead).toBeCloseTo(landingLoads({ t: 150, finishes: 1.5, live: 4.8 }).dead, 12)
  })
})
