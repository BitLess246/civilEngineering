import { describe, it, expect } from 'vitest'
import { designRetainingWall, barSpacing, LF } from './retainingWall'

// Reference: 3 m stem, 500 mm base, 300 mm stem, 500 toe, 1500 heel
// Soil γ=18 kN/m³, φ=30°, q_sur=0, μ=0.5, qa=200 kPa
// Concrete fc=28, fy=415, cover=75, db=16
const BASE = {
  Hs: 3000, tb: 500, ts: 300, bt: 500, bh: 1500,
  gamma_s: 18, phi_deg: 30, q_sur: 0, mu: 0.5, qa: 200,
  fc: 28, fy: 415, cover: 75, barDia: 16,
}

describe('designRetainingWall — geometry', () => {
  const r = designRetainingWall(BASE)

  it('B = (bt + ts + bh) / 1000 in metres', () => {
    expect(r.B).toBeCloseTo((500 + 300 + 1500) / 1000, 9)  // 2.3 m
  })

  it('H = (Hs + tb) / 1000 in metres', () => {
    expect(r.H).toBeCloseTo((3000 + 500) / 1000, 9)  // 3.5 m
  })

  it('Ka = tan²(45 − φ/2) for φ=30° → 1/3', () => {
    expect(r.Ka).toBeCloseTo(1 / 3, 9)
  })
})

describe('designRetainingWall — earth pressure', () => {
  const r = designRetainingWall(BASE)

  it('Pa = ½·Ka·γs·H²', () => {
    const expected = 0.5 * (1 / 3) * 18 * 3.5 ** 2
    expect(r.Pa).toBeCloseTo(expected, 6)  // ≈ 36.75 kN/m
  })

  it('Pq = 0 when surcharge = 0', () => {
    expect(r.Pq).toBeCloseTo(0, 9)
  })

  it('Pq = Ka·q·H when surcharge > 0', () => {
    const r2 = designRetainingWall({ ...BASE, q_sur: 10 })
    expect(r2.Pq).toBeCloseTo((1 / 3) * 10 * 3.5, 6)
  })

  it('Fh = Pa + Pq', () => {
    expect(r.Fh).toBeCloseTo(r.Pa + r.Pq, 9)
  })

  it('MO = Pa·H/3 + Pq·H/2', () => {
    const expected = r.Pa * (3.5 / 3) + r.Pq * (3.5 / 2)
    expect(r.MO).toBeCloseTo(expected, 6)
  })
})

describe('designRetainingWall — vertical loads', () => {
  const r = designRetainingWall(BASE)
  const gc = 23.6

  it('W_stem = γc·ts·Hs (per m)', () => {
    expect(r.W_stem).toBeCloseTo(gc * 0.3 * 3.0, 6)
  })

  it('arm_stem = bt + ts/2', () => {
    expect(r.arm_stem).toBeCloseTo(0.5 + 0.15, 9)
  })

  it('W_base = γc·B·tb', () => {
    expect(r.W_base).toBeCloseTo(gc * 2.3 * 0.5, 6)
  })

  it('arm_base = B/2', () => {
    expect(r.arm_base).toBeCloseTo(2.3 / 2, 9)
  })

  it('W_soil = γs·bh·hs', () => {
    expect(r.W_soil).toBeCloseTo(18 * 1.5 * 3.0, 6)
  })

  it('arm_soil = bt + ts + bh/2', () => {
    expect(r.arm_soil).toBeCloseTo(0.5 + 0.3 + 0.75, 9)
  })

  it('W_sur = q_sur·bh  (= 0 here)', () => {
    expect(r.W_sur).toBeCloseTo(0, 9)
  })

  it('sumV = sum of all vertical loads', () => {
    expect(r.sumV).toBeCloseTo(r.W_stem + r.W_base + r.W_soil + r.W_sur, 9)
  })

  it('MR = sum of W·arm', () => {
    const expected =
      r.W_stem * r.arm_stem + r.W_base * r.arm_base +
      r.W_soil * r.arm_soil + r.W_sur * r.arm_sur
    expect(r.MR).toBeCloseTo(expected, 9)
  })
})

describe('designRetainingWall — stability', () => {
  const r = designRetainingWall(BASE)

  it('FS_OT = MR / MO', () => {
    expect(r.FS_OT).toBeCloseTo(r.MR / r.MO, 9)
  })

  it('FS_SL = μ·ΣV / Fh', () => {
    expect(r.FS_SL).toBeCloseTo(0.5 * r.sumV / r.Fh, 9)
  })

  it('reference wall is stable (FS_OT > 2 and FS_SL > 1.5)', () => {
    expect(r.stableOT).toBe(true)
    expect(r.stableSL).toBe(true)
  })

  it('stableOT = false when FS_OT < 2 (narrow heel)', () => {
    const r2 = designRetainingWall({ ...BASE, bh: 200 })
    expect(r2.stableOT).toBe(false)
  })

  it('stableSL = false when μ is very small', () => {
    const r2 = designRetainingWall({ ...BASE, mu: 0.1 })
    expect(r2.stableSL).toBe(false)
  })
})

describe('designRetainingWall — bearing pressure', () => {
  const r = designRetainingWall(BASE)

  it('xbar = (MR − MO) / ΣV', () => {
    expect(r.xbar).toBeCloseTo((r.MR - r.MO) / r.sumV, 9)
  })

  it('e = B/2 − xbar', () => {
    expect(r.e).toBeCloseTo(r.B / 2 - r.xbar, 9)
  })

  it('q_max = (ΣV/B)·(1 + 6e/B)', () => {
    const q_avg = r.sumV / r.B
    expect(r.q_max).toBeCloseTo(q_avg * (1 + 6 * r.e / r.B), 6)
  })

  it('q_min = (ΣV/B)·(1 − 6e/B)', () => {
    const q_avg = r.sumV / r.B
    expect(r.q_min).toBeCloseTo(q_avg * (1 - 6 * r.e / r.B), 6)
  })

  it('reference wall: bearingOK and tensionOK', () => {
    expect(r.bearingOK).toBe(true)
    expect(r.tensionOK).toBe(true)
  })

  it('bearingOK = false when qa is too small', () => {
    const r2 = designRetainingWall({ ...BASE, qa: 10 })
    expect(r2.bearingOK).toBe(false)
  })
})

describe('designRetainingWall — stem design', () => {
  const r = designRetainingWall(BASE)
  const hs = 3.0, Ka = 1 / 3

  it('d_stem = ts − cover − barDia/2', () => {
    expect(r.d_stem).toBeCloseTo(300 - 75 - 8, 9)
  })

  it('Pa_stem = ½·Ka·γs·Hs²', () => {
    expect(r.Pa_stem).toBeCloseTo(0.5 * Ka * 18 * hs ** 2, 6)
  })

  it('Mu_stem is the FACTORED moment — 1.6·(Pa·Hs/3 + Pq·Hs/2)', () => {
    // Pa_stem and Pq_stem are service thrusts; Mu is a strength-design action,
    // so §5.3.1(e) applies 1.6 to both the earth pressure and the surcharge.
    // This module previously returned the service moment here and compared it
    // straight against φMn, under-designing the stem by the full 1.6.
    const service = r.Pa_stem * (hs / 3) + r.Pq_stem * (hs / 2)
    expect(r.Mu_stem).toBeCloseTo(1.6 * service, 6)
  })

  it('Vu_stem is the FACTORED shear — 1.6·(Pa + Pq)', () => {
    expect(r.Vu_stem).toBeCloseTo(1.6 * (r.Pa_stem + r.Pq_stem), 6)
  })

  it('surcharge and earth pressure carry their own factors', () => {
    const r2 = designRetainingWall({ ...BASE, q_sur: 12 })
    expect(r2.Mu_stem).toBeCloseTo(
      LF.H * r2.Pa_stem * (hs / 3) + LF.L * r2.Pq_stem * (hs / 2), 6)
  })

  it('Vc_stem = φ·(√f\'c/6)·b·d / 1000  (kN/m, b=1000 mm)', () => {
    const expected = 0.75 * (Math.sqrt(28) / 6) * 1000 * r.d_stem / 1000
    expect(r.Vc_stem).toBeCloseTo(expected, 6)
  })

  it('As_design ≥ As_min', () => {
    expect(r.As_design).toBeGreaterThanOrEqual(r.As_min - 1e-9)
  })

  it('As_design ≥ As_stem (formula value)', () => {
    expect(r.As_design).toBeGreaterThanOrEqual(r.As_stem - 1e-9)
  })

  it('higher surcharge → larger Mu_stem', () => {
    const r2 = designRetainingWall({ ...BASE, q_sur: 20 })
    expect(r2.Mu_stem).toBeGreaterThan(r.Mu_stem)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Base-slab design. Hand calculation for BASE, worked through below so the
// expected numbers are traceable rather than recorded from the code.
//
//   Service:  Pa = ½(⅓)(18)(3.5²) = 36.75 kN/m,  MO = 36.75(3.5/3) = 42.875
//             W_stem 21.24 @ 0.65 · W_base 27.14 @ 1.15 · W_soil 81.0 @ 1.55
//             ΣV = 129.38,  MR = 170.567
//   Factored: ΣVu = 1.2(129.38) = 155.256,  MRu = 1.2(170.567) = 204.680
//             MOu = 1.6(42.875) = 68.600
//             x̄u = (204.680 − 68.600)/155.256 = 0.87651 m
//             eu = 1.15 − 0.87651 = 0.27349 < B/6 = 0.38333  → trapezoid
//             qu,toe  = (155.256/2.3)(1 + 6(0.27349)/2.3) = 115.66 kPa
//             qu,heel = (155.256/2.3)(1 − 6(0.27349)/2.3) =  19.34 kPa
// ─────────────────────────────────────────────────────────────────────────
describe('designRetainingWall — factored base pressure', () => {
  const r = designRetainingWall(BASE)

  it('ΣVu applies 1.2 to the dead weights', () => {
    expect(r.sumVu).toBeCloseTo(1.2 * r.sumV, 6)
  })

  it('MOu applies 1.6 to the lateral thrust', () => {
    expect(r.MOu).toBeCloseTo(1.6 * r.MO, 6)
  })

  it('qu at the toe and heel match the hand calculation', () => {
    expect(r.xbar_u).toBeCloseTo(0.87651, 4)
    expect(r.qu_toe).toBeCloseTo(115.66, 1)
    expect(r.qu_heel).toBeCloseTo(19.34, 1)
    expect(r.uplift_u).toBe(false)
  })

  it('factored pressure is in equilibrium with ΣVu', () => {
    // ∫q dx over the base must return the vertical load it carries.
    expect((r.qu_toe + r.qu_heel) / 2 * r.B).toBeCloseTo(r.sumVu, 5)
  })

  it('switches to a TRIANGULAR block when eu > B/6', () => {
    // A short heel throws the factored resultant outside the middle third.
    // Soil cannot pull down, so the trapezoid formula's negative corner is
    // wrong; the block must shorten to 3x̄ and rise instead.
    const r2 = designRetainingWall({ ...BASE, bh: 600 })
    expect(r2.uplift_u).toBe(true)
    expect(r2.qu_heel).toBe(0)
    expect(r2.qu_toe).toBeCloseTo((2 * r2.sumVu) / (3 * r2.xbar_u), 6)
    // Still in equilibrium: ½·q·(3x̄) = ΣVu.
    expect(0.5 * r2.qu_toe * 3 * r2.xbar_u).toBeCloseTo(r2.sumVu, 5)
  })
})

describe('designRetainingWall — toe and heel', () => {
  const r = designRetainingWall(BASE)

  it('d is measured from the base thickness and its own cover', () => {
    expect(r.toe.d).toBeCloseTo(500 - 75 - 8, 9)
    expect(r.heel.d).toBeCloseTo(r.toe.d, 9)
  })

  it('toe Mu matches the hand calculation', () => {
    // w(u) = qu(0.5 − u) = 94.72 + 41.878u kPa, u from the stem face.
    // Mu = ∫₀^0.5 w·u du = 94.72(0.125) + 41.878(0.125/3) = 13.59 kN·m/m
    expect(r.toe.Mu).toBeCloseTo(13.59, 1)
  })

  it('heel Mu matches the hand calculation', () => {
    // Down: 1.2(23.6)(0.5) + 1.2(18)(3.0) = 78.96 kPa
    // Up:   qu(0.8 + u) = 82.158 − 41.878u
    // net = −3.198 + 41.878u → Mu = 1.125(41.878 − 3.198) = 43.52 kN·m/m
    expect(r.heel.Mu).toBeCloseTo(43.52, 1)
  })

  it('the heel governs the base slab — it carries the backfill', () => {
    expect(r.heel.Mu).toBeGreaterThan(r.toe.Mu)
  })

  it('takes toe shear at d from the face but heel shear AT the face', () => {
    // §22.5.1.1 relief needs the reaction to compress the region. The toe is
    // pushed up by bearing (it does); the heel is pushed down by the
    // backfill, away from the support (it does not).
    expect(r.toe.xv).toBeCloseTo(r.toe.d / 1000, 9)
    expect(r.heel.xv).toBe(0)
  })

  it('heel Vu is the whole net load on the heel', () => {
    // ∫₀^1.5 (−3.198 + 41.878u) du = −4.797 + 47.113 = 42.32 kN/m
    expect(r.heel.Vu).toBeCloseTo(42.32, 1)
  })

  it('both cantilevers pass shear on a 500 mm base', () => {
    // φVc = 0.75(√28/6)(1000)(417)/1000 = 275.8 kN/m
    expect(r.toe.phiVc).toBeCloseTo(275.8, 0)
    expect(r.toe.shearOK).toBe(true)
    expect(r.heel.shearOK).toBe(true)
  })

  it('fails shear when the base is far too thin for the heel load', () => {
    const r2 = designRetainingWall({ ...BASE, tb: 150, Hs: 6000, bh: 3000 })
    expect(r2.heel.shearOK).toBe(false)
  })

  it('uses the ONE-WAY SLAB minimum, ρ·Ag — not the beam formula', () => {
    // §7.6.1.1 → §24.4.3.2. fy = 415 MPa is BELOW Grade 420, so the table's
    // 0.0020 row applies: 0.0020(1000)(500) = 1000 mm²/m. The beam formula of
    // §9.6.1.2 would give 1.4/415·1000·417 = 1407 mm²/m — 41% more steel from
    // a clause that does not apply to a slab.
    expect(r.heel.As_min).toBeCloseTo(0.0020 * 1000 * 500, 6)
    expect(r.toe.As_min).toBeCloseTo(0.0020 * 1000 * 500, 6)
  })

  it('drops to ρ = 0.0018 once fy reaches Grade 420', () => {
    const r2 = designRetainingWall({ ...BASE, fy: 420 })
    expect(r2.heel.As_min).toBeCloseTo(0.0018 * 1000 * 500, 6)
  })

  it('minimum steel governs both cantilevers here', () => {
    expect(r.heel.As).toBeLessThan(r.heel.As_min)
    expect(r.heel.As_design).toBeCloseTo(r.heel.As_min, 6)
  })

  it('provides at least the steel it designed for', () => {
    for (const c of [r.toe, r.heel]) {
      expect(c.As_prov).toBeGreaterThanOrEqual(c.As_design - 1e-6)
      expect(c.spacing).toBeLessThanOrEqual(c.spacingMax)
    }
  })

  it('a deeper wall drives more heel moment', () => {
    const r2 = designRetainingWall({ ...BASE, Hs: 4500 })
    expect(r2.heel.Mu).toBeGreaterThan(r.heel.Mu)
  })
})

describe('designRetainingWall — detailing steel', () => {
  const r = designRetainingWall(BASE)

  it('stem spacing provides As_design and respects min(3h, 450)', () => {
    expect(r.s_stem_max).toBe(Math.min(3 * 300, 450))
    expect(r.As_stem_prov).toBeGreaterThanOrEqual(r.As_design - 1e-6)
    expect(r.s_stem).toBeLessThanOrEqual(r.s_stem_max)
  })

  it('stem horizontal steel is §11.6.1 ρt = 0.0020 on the gross section', () => {
    expect(r.As_horiz).toBeCloseTo(0.0020 * 1000 * 300, 9)
  })

  it('stem front-face vertical steel is §11.6.1 ρl = 0.0012', () => {
    expect(r.As_stem_front).toBeCloseTo(0.0012 * 1000 * 300, 9)
  })

  it('base temperature steel is §24.4.3.2 ρ = 0.0018 at Grade 420', () => {
    const r2 = designRetainingWall({ ...BASE, fy: 420 })
    expect(r2.As_temp_base).toBeCloseTo(0.0018 * 1000 * 500, 9)
  })

  it('uses ρ = 0.0020 below Grade 420 — including fy = 415', () => {
    // The table's rows are Grade 275/350 → 0.0020 and Grade 420 or greater →
    // 0.0018. PNS Grade 415 sits under the threshold, so it takes 0.0020.
    expect(r.As_temp_base).toBeCloseTo(0.0020 * 1000 * 500, 9)
    expect(designRetainingWall({ ...BASE, fy: 280 }).As_temp_base)
      .toBeCloseTo(0.0020 * 1000 * 500, 9)
  })
})

describe('barSpacing', () => {
  it('rounds DOWN to a 25 mm module, so As provided never falls short', () => {
    // ⌀16 (201.06 mm²) for 900 mm²/m: 223.4 mm exact → 200 mm adopted.
    const { spacing, As_prov } = barSpacing(900, 16, 450)
    expect(spacing).toBe(200)
    expect(As_prov).toBeGreaterThan(900)
  })

  it('never exceeds the code maximum, however light the demand', () => {
    expect(barSpacing(1, 16, 450).spacing).toBe(450)
    expect(barSpacing(1, 16, 300).spacing).toBe(300)
  })

  it('never drops below 75 mm — concrete has to get between the bars', () => {
    expect(barSpacing(1e6, 12, 450).spacing).toBe(75)
  })

  it('a bigger bar buys a wider spacing for the same area', () => {
    expect(barSpacing(900, 20, 450).spacing)
      .toBeGreaterThan(barSpacing(900, 12, 450).spacing)
  })
})

describe('the two load levels stay separate', () => {
  const r = designRetainingWall(BASE)

  it('stability uses SERVICE loads — factoring would double-count the FS', () => {
    expect(r.FS_OT).toBeCloseTo(r.MR / r.MO, 9)
    expect(r.sumV).toBeCloseTo(r.W_stem + r.W_base + r.W_soil + r.W_sur, 9)
  })

  it('the service bearing pressure is what qa is compared against', () => {
    expect(r.q_max).toBeLessThan(r.qu_toe)   // service < factored
    expect(r.bearingOK).toBe(r.q_max <= BASE.qa + 1e-9)
  })

  it('LF exposes the clause factors so they can be cited, not guessed', () => {
    expect(LF).toEqual({ H: 1.6, D: 1.2, L: 1.6 })
  })
})
