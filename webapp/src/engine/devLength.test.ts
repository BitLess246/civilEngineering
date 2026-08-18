import { describe, it, expect } from 'vitest'
import { calcDevLength, hookEmbedmentAvailable, hookFit } from './devLength'

// Reference inputs — Grade 415, fc=28, db=20 (≤20 → ψs=0.8), not top, uncoated, n.w., Ψ=1.5
const BASE = {
  db: 20, fc: 28, fy: 415,
  topBar: false, epoxy: 'none' as const,
  lambda: 1.0, cbKtr_db: 1.5,
}

describe('calcDevLength — modification factors §25.4.2.4', () => {
  it('psi_t = 1.0 for non-top bars', () => {
    expect(calcDevLength(BASE).psi_t).toBe(1.0)
  })

  it('psi_t = 1.3 for top bars (>300 mm concrete below)', () => {
    expect(calcDevLength({ ...BASE, topBar: true }).psi_t).toBe(1.3)
  })

  it('psi_e = 1.0 / 1.2 / 1.5 for none / light / heavy epoxy', () => {
    expect(calcDevLength({ ...BASE, epoxy: 'none' }).psi_e).toBe(1.0)
    expect(calcDevLength({ ...BASE, epoxy: 'coated-light' }).psi_e).toBe(1.2)
    expect(calcDevLength({ ...BASE, epoxy: 'coated-heavy' }).psi_e).toBe(1.5)
  })

  it('psi_s = 0.8 for db ≤ 20 mm', () => {
    expect(calcDevLength(BASE).psi_s).toBe(0.8)           // db=20
    expect(calcDevLength({ ...BASE, db: 12 }).psi_s).toBe(0.8)
  })

  it('psi_s = 1.0 for db > 20 mm', () => {
    expect(calcDevLength({ ...BASE, db: 25 }).psi_s).toBe(1.0)
    expect(calcDevLength({ ...BASE, db: 32 }).psi_s).toBe(1.0)
  })

  it('psi_te = psi_t × psi_e when product ≤ 1.7', () => {
    // top=true (1.3) × coated-light (1.2) = 1.56 < 1.7
    const r = calcDevLength({ ...BASE, topBar: true, epoxy: 'coated-light' })
    expect(r.psi_te).toBeCloseTo(1.3 * 1.2, 9)
  })

  it('psi_te capped at 1.7 when psi_t × psi_e > 1.7', () => {
    // top=true (1.3) × coated-heavy (1.5) = 1.95 > 1.7
    const r = calcDevLength({ ...BASE, topBar: true, epoxy: 'coated-heavy' })
    expect(r.psi_te).toBeCloseTo(1.7, 9)
  })
})

describe('calcDevLength — confinement cap §25.4.2.3', () => {
  it('confine = cbKtr_db when ≤ 2.5', () => {
    expect(calcDevLength({ ...BASE, cbKtr_db: 1.5 }).confine).toBeCloseTo(1.5, 9)
    expect(calcDevLength({ ...BASE, cbKtr_db: 2.0 }).confine).toBeCloseTo(2.0, 9)
  })

  it('confine capped at 2.5', () => {
    expect(calcDevLength({ ...BASE, cbKtr_db: 4.0 }).confine).toBeCloseTo(2.5, 9)
  })
})

describe('calcDevLength — tension development §25.4.2.3', () => {
  it('ld_raw = fy·ψte·ψs·db / (1.1·λ·√f\'c·Ψ)', () => {
    const r = calcDevLength(BASE)
    const sqrtFc = Math.sqrt(28)
    const expected = (415 * 1.0 * 0.8 * 20) / (1.1 * 1.0 * sqrtFc * 1.5)
    expect(r.ld_raw).toBeCloseTo(expected, 6)
  })

  it('ld = max(ld_raw, 300)', () => {
    const r = calcDevLength(BASE)
    expect(r.ld).toBeCloseTo(Math.max(r.ld_raw, 300), 9)
    expect(r.ld).toBeGreaterThanOrEqual(300)
  })

  it('ld floor: 300 mm minimum applies for very small db or high confinement', () => {
    // db=10, cbKtr_db=2.5 (max confinement) → very short raw length → floor kicks in
    const r = calcDevLength({ ...BASE, db: 10, cbKtr_db: 2.5 })
    expect(r.ld).toBeGreaterThanOrEqual(300)
  })

  it('larger confinement (Ψ=2.5) → shorter ld than Ψ=1.5', () => {
    const r15 = calcDevLength({ ...BASE, cbKtr_db: 1.5 })
    const r25 = calcDevLength({ ...BASE, cbKtr_db: 2.5 })
    expect(r25.ld_raw).toBeLessThan(r15.ld_raw)
  })

  it('top bar increases ld (ψt=1.3)', () => {
    const r_other = calcDevLength(BASE)
    const r_top   = calcDevLength({ ...BASE, topBar: true })
    expect(r_top.ld).toBeGreaterThan(r_other.ld)
  })
})

describe('calcDevLength — compression development §25.4.9.2', () => {
  it('ldc_1 = 0.24·fy·db / (λ·√f\'c)', () => {
    const r = calcDevLength(BASE)
    const sqrtFc = Math.sqrt(28)
    const expected = (0.24 * 415 * 20) / (1.0 * sqrtFc)
    // ldc = max(ldc_1, ldc_2, 200), so just verify ldc_1 is the leading term here
    expect(r.ldc).toBeCloseTo(Math.max(expected, 0.043 * 415 * 20, 200), 6)
  })

  it('ldc ≥ 200 mm always', () => {
    expect(calcDevLength(BASE).ldc).toBeGreaterThanOrEqual(200)
  })

  it('ldc = max of both formula terms and 200 mm floor', () => {
    const r = calcDevLength(BASE)
    const sqrtFc = Math.sqrt(28)
    const ldc_1 = (0.24 * 415 * 20) / (1.0 * sqrtFc)
    const ldc_2 = 0.043 * 415 * 20
    expect(r.ldc).toBeCloseTo(Math.max(ldc_1, ldc_2, 200), 6)
  })
})

describe('calcDevLength — tension splices §25.5.2', () => {
  it('ls_A = 1.0 × ld (Class A)', () => {
    const r = calcDevLength(BASE)
    expect(r.ls_A).toBeCloseTo(r.ld, 9)
  })

  it('ls_B = 1.3 × ld (Class B)', () => {
    const r = calcDevLength(BASE)
    expect(r.ls_B).toBeCloseTo(1.3 * r.ld, 9)
  })

  it('ls_A ≥ 300 mm', () => {
    expect(calcDevLength(BASE).ls_A).toBeGreaterThanOrEqual(300)
  })
})

describe('calcDevLength — compression splices §25.5.5', () => {
  it('lsc = 0.0725·fy·db for fy ≤ 420 MPa', () => {
    const r = calcDevLength(BASE)  // fy=415 ≤ 420
    const expected = Math.max(0.0725 * 415 * 20, 300)
    expect(r.lsc).toBeCloseTo(expected, 6)
  })

  it('lsc = (0.13·fy − 24)·db for fy > 420 MPa', () => {
    const r = calcDevLength({ ...BASE, fy: 520 })
    const expected = Math.max((0.13 * 520 - 24) * 20, 300)
    expect(r.lsc).toBeCloseTo(expected, 6)
  })

  it('lsc × 4/3 when f\'c < 21 MPa', () => {
    const r_hi = calcDevLength({ ...BASE, fc: 28 })
    const r_lo = calcDevLength({ ...BASE, fc: 17 })
    expect(r_lo.lsc).toBeCloseTo(r_hi.lsc * (4 / 3), 6)
  })

  it('lsc ≥ 300 mm always', () => {
    // Tiny bar, fy at limit
    const r = calcDevLength({ ...BASE, db: 10, fy: 280 })
    expect(r.lsc).toBeGreaterThanOrEqual(300)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// §25.4.1.4 — the √f'c cap, and the standard hook of §25.4.3.
// ─────────────────────────────────────────────────────────────────────────
describe("§25.4.1.4 — √f'c is capped at 8.3 MPa", () => {
  const at = (fc: number) => calcDevLength({
    db: 20, fc, fy: 415, topBar: false, epoxy: 'none', lambda: 1, cbKtr_db: 1.5,
  })

  it('leaves ordinary strengths alone', () => {
    expect(at(28).sqrtFc).toBeCloseTo(Math.sqrt(28), 9)
    expect(at(28).sqrtFcCapped).toBe(false)
  })

  it('caps at 8.3 and says so', () => {
    // √69 = 8.307 — just over the cap; √100 = 10 is well over.
    expect(at(100).sqrtFc).toBe(8.3)
    expect(at(100).sqrtFcCapped).toBe(true)
  })

  it('stops ld shrinking with strength once the cap bites', () => {
    // Without the cap, ld ∝ 1/√f'c would keep falling. It must not.
    expect(at(100).ld).toBeCloseTo(at(200).ld, 9)
    expect(at(100).ld).toBeGreaterThan(0)
  })

  it('applies the cap to EVERY §25.4 length, not just ld', () => {
    expect(at(100).ldc).toBeCloseTo(at(200).ldc, 9)
    expect(at(100).ldh).toBeCloseTo(at(200).ldh, 9)
  })

  it('the cap is conservative — capped ld is LONGER than uncapped would be', () => {
    const capped = at(100).ld
    const uncapped = (415 * at(100).psi_te * at(100).psi_s * 20) / (1.1 * 1 * Math.sqrt(100) * 1.5)
    expect(capped).toBeGreaterThan(uncapped)
  })
})

describe('standard hook in tension — §25.4.3', () => {
  const base = {
    db: 20, fc: 28, fy: 415, topBar: false, epoxy: 'none' as const,
    lambda: 1, cbKtr_db: 1.5,
  }
  const r = calcDevLength(base)

  it('matches the hand calculation for the reference bar', () => {
    // ldh = 0.24(1.0)(1.0)(1.0)(415)/(1.0·√28) · 20
    //     = 99.6/5.2915 · 20 = 376.5 mm
    expect(r.ldh_raw).toBeCloseTo((0.24 * 415 * 20) / Math.sqrt(28), 3)
    expect(r.ldh_raw).toBeCloseTo(376.5, 0)
    expect(r.ldh).toBeCloseTo(r.ldh_raw, 6)
  })

  it('is much shorter than the straight ld — the whole reason hooks exist', () => {
    expect(r.ldh).toBeLessThan(r.ld)
  })

  it('applies the max(8db, 150) floor', () => {
    // A small bar in strong concrete drives the formula below 8db.
    const small = calcDevLength({ ...base, db: 10, fy: 275, fc: 55 })
    expect(small.ldh).toBe(Math.max(8 * 10, 150))
    expect(small.ldh).toBeGreaterThan(small.ldh_raw)
  })

  it('ψc = 0.7 for adequate cover, ψr = 0.8 for confining ties', () => {
    expect(calcDevLength({ ...base, hookCover: true }).psi_c).toBe(0.7)
    expect(calcDevLength({ ...base, hookTies: true }).psi_r).toBe(0.8)
    const both = calcDevLength({ ...base, hookCover: true, hookTies: true })
    expect(both.ldh_raw).toBeCloseTo(r.ldh_raw * 0.7 * 0.8, 6)
  })

  it('withholds ψc and ψr from bars larger than ⌀36 — §25.4.3.2', () => {
    const big = calcDevLength({ ...base, db: 40, hookCover: true, hookTies: true })
    expect(big.psi_c).toBe(1.0)
    expect(big.psi_r).toBe(1.0)
  })

  it('uses ψe = 1.2 for a coated hook, never the straight-bar 1.5', () => {
    const heavy = calcDevLength({ ...base, epoxy: 'coated-heavy' })
    expect(heavy.psi_e).toBe(1.5)                       // straight bar
    expect(heavy.ldh_raw).toBeCloseTo(r.ldh_raw * 1.2, 6)  // hook
  })

  it('ignores the casting-position penalty — ψt does not apply to hooks', () => {
    const top = calcDevLength({ ...base, topBar: true })
    expect(top.psi_t).toBe(1.3)                 // still reported for ld
    expect(top.ldh).toBeCloseTo(r.ldh, 9)       // but the hook is unchanged
    expect(top.ld).toBeGreaterThan(r.ld)        // while ld does grow
  })

  it('gives the §25.3.1 hook geometry', () => {
    expect(r.hookTail).toBe(12 * 20)
    expect(r.hookBendDia).toBe(6 * 20)                        // ⌀25 and smaller
    expect(calcDevLength({ ...base, db: 32 }).hookBendDia).toBe(8 * 32)  // ⌀28+
  })
})

// ─────────────────────────────────────────────────────────────────────────
// HOOK FIT — the question the four lengths cannot answer on their own:
// is there room in the member for the hook the bar needs?
//
// The video-worked case detailers use here: a 250 × 250 column, 40 cover,
// ⌀10 lateral ties, ⌀16 verticals. The hook turns down BEHIND the far-face
// vertical, so it has
//
//   250 − 40 − 10 − 16 = 184 mm
//
// and NOT the 250 mm of column, nor the 200 mm that stopping at the tie gives.
// ─────────────────────────────────────────────────────────────────────────
describe('hookFit — room for the hook, not just the length of it', () => {
  const col = { memberDepth: 250, cover: 40, tieDia: 10, farBarDia: 16 }

  it('stops at the far-face bar, not at the face or the tie', () => {
    expect(hookEmbedmentAvailable(250, 40, 10, 16)).toBe(184)
    expect(hookFit({ ldh: 150, ...col }).avail).toBe(184)
  })

  it('passes a hook that fits and reports what is spare', () => {
    const r = hookFit({ ldh: 150, ...col })
    expect(r.fits).toBe(true)
    expect(r.shortfall).toBe(0)
    expect(r.depthNeeded).toBe(150 + 40 + 10 + 16)      // 216 ≤ 250 provided
  })

  it('fails one that does not, and says how deep the member would have to be', () => {
    // ⌀16 grade-414 bar in 20.7 MPa concrete: ℓdh ≈ 245 mm (§25.4.3 with ψc)
    const need = calcDevLength({
      db: 16, fc: 20.7, fy: 414, topBar: false, epoxy: 'none', lambda: 1,
      cbKtr_db: 1.5, hookCover: true,
    }).ldh
    const r = hookFit({ ldh: need, ...col })
    expect(r.fits).toBe(false)
    expect(r.shortfall).toBeCloseTo(need - 184, 6)
    expect(r.depthNeeded).toBeCloseTo(need + 66, 6)     // 66 = 40 + 10 + 16
    // and the remedy is depth, not tail: a member deep enough by that margin
    // is the thing that turns the check
    expect(hookFit({ ldh: need, ...col, memberDepth: r.depthNeeded }).fits).toBe(true)
  })

  it('is exact at the boundary rather than off by a rounding', () => {
    expect(hookFit({ ldh: 184, ...col }).fits).toBe(true)
    expect(hookFit({ ldh: 184.001, ...col }).fits).toBe(false)
  })

  it('never reports negative room in a member thinner than its own cover', () => {
    const r = hookFit({ ldh: 200, memberDepth: 50, cover: 40, tieDia: 10, farBarDia: 16 })
    expect(r.avail).toBe(0)
    expect(r.shortfall).toBe(200)
  })
})
