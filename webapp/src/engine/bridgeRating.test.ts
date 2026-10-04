import { describe, it, expect } from 'vitest'
import {
  GAMMA_DC, GAMMA_DW, GAMMA_LL_INVENTORY, GAMMA_LL_OPERATING,
  bridgeRating,
} from './bridgeRating'

const deck = { S: 2.4, girder: 'interior' as const }

describe('MBE rating factors — the load-side constants', () => {
  it('carries the MBE tables', () => {
    expect(GAMMA_DC).toBe(1.25)
    expect(GAMMA_DW).toBe(1.5)
    expect(GAMMA_LL_INVENTORY).toBe(1.75)
    expect(GAMMA_LL_OPERATING).toBe(1.35)
  })
})

describe('rating algebra with user-supplied live load (fully hand-checked)', () => {
  const base = {
    L: 30, deck, DC: 12, DW: 2, Mn: 6000, Vn: 1400,
    LLm: 1500, LLv: 220, // static, per girder, no IM
    IM: 0.33,
  }

  it('RF = (φ·Mn − γDC·MDC − γDW·MDW)/(γLL·(1+IM)·LLm)', () => {
    const r = bridgeRating(base)
    // Mdc = 1350, Mdw = 225 → numerator = 6000 − 1687.5 − 337.5 = 3975
    expect(r.Mdc).toBeCloseTo(1350, 9)
    expect(r.Mdw).toBeCloseTo(225, 9)
    expect(r.flexure.numerator).toBeCloseTo(3975, 9)
    // RF_inv = 3975/(1.75·1.33·1500) = 3975/3491.25 = 1.1385606
    expect(r.flexure.RF_inventory).toBeCloseTo(1.1385606, 5)
    // RF_op = 3975/(1.35·1.33·1500) = 3975/2693.25 = 1.4759119
    expect(r.flexure.RF_operating).toBeCloseTo(1.4759119, 5)
  })

  it('shear numerator = Vn − 1.25·VDC − 1.5·VDW', () => {
    const r = bridgeRating(base)
    expect(r.Vdc).toBeCloseTo(180, 9)
    expect(r.Vdw).toBeCloseTo(30, 9)
    expect(r.shear.numerator).toBeCloseTo(1130, 9)
    expect(r.shear.RF_inventory).toBeCloseTo(1130 / (1.75 * 1.33 * 220), 9)
    expect(r.shear.RF_inventory).toBeCloseTo(2.2068146, 5)
  })

  it('flexure governs when its RF is smaller', () => {
    const r = bridgeRating(base)
    expect(r.governing).toBe('flexure')
    expect(r.RFmin).toBeCloseTo(1.1385606, 5)
  })

  it('passes at inventory when the resistances are generous', () => {
    const r = bridgeRating({ ...base, Mn: 12000, Vn: 3000 })
    expect(r.RFmin).toBeGreaterThan(1)
    expect(r.verdict).toContain('Passes at inventory')
    expect(r.notes.some((n) => n.includes('Both effects pass'))).toBe(true)
  })

  it('restricts the bridge when both levels fail', () => {
    const r = bridgeRating({ ...base, Mn: 2000, Vn: 400 })
    expect(r.RFmin).toBeLessThan(1)
    expect(r.verdict).toContain('Restricted')
    expect(r.notes.some((n) => n.includes('strengthening'))).toBe(true)
  })

  it('reports operating-only when inventory fails but operating passes', () => {
    // numerator = 5000 − 2025 = 2975; inventory RF = 2975/3491.25 = 0.8521,
    // operating RF = 2975/2693.25 = 1.1046
    const r = bridgeRating({ ...base, Mn: 5000, Vn: 5000 })
    expect(r.flexure.numerator).toBeCloseTo(2975, 9)
    expect(r.flexure.RF_inventory).toBeCloseTo(0.8521303, 5)
    expect(r.flexure.RF_operating).toBeCloseTo(1.1046180, 5)
    expect(r.verdict).toContain('Operating only')
  })

  it('validates the inputs', () => {
    expect(() => bridgeRating({ ...base, L: 0 })).toThrow()
    expect(() => bridgeRating({ ...base, DC: -1 })).toThrow()
    expect(() => bridgeRating({ ...base, Mn: 0 })).toThrow()
  })
})

describe('live load from the HL-93 machinery', () => {
  it('inherits the lever-rule DF and wires the envelope through', () => {
    const r = bridgeRating({ L: 30, deck, DC: 12, DW: 2, Mn: 6000, Vn: 1400 })
    expect(r.DF).toBeCloseTo(1.25, 6) // interior girders at 2.4 m: two lanes govern
    expect(r.hl.envelope.length).toBe(101)
    // the static LL strips IM off the vehicle part only — the lane slice is
    // already static (dividing the combined value would deflate the lane)
    expect(r.flexure.LLstatic).toBeCloseTo(r.hl.moment.vehPart / 1.33 + r.hl.moment.lanePart, 9)
    // MBE denominator puts IM back on the vehicle part only:
    // γLL·(vehPart + 1.33·lanePart) ≈ 1.75·5160.6 → RF 0.440 (inventory),
    // 1.35·5160.6 → RF 0.570 (operating). The old value/1.33 form understated
    // the denominator by the lane's missing IM — unconservative.
    expect(r.flexure.LLwithIM).toBeCloseTo(
      r.hl.moment.vehPart + 1.33 * r.hl.moment.lanePart, 9)
    expect(r.flexure.LLwithIM).toBeCloseTo(5160.6, 0)
    expect(r.flexure.RF_inventory).toBeCloseTo(3975 / (1.75 * r.flexure.LLwithIM), 9)
    expect(r.flexure.RF_operating).toBeCloseTo(3975 / (1.35 * r.flexure.LLwithIM), 9)
  })

  it('a DF override rescales the HL-93 live load', () => {
    const r = bridgeRating({ L: 30, deck, DC: 12, DW: 2, Mn: 6000, Vn: 1400, DF: 0.9 })
    expect(r.DF).toBe(0.9)
    expect(r.flexure.LLstatic).toBeCloseTo((r.hl.moment.vehPart / 1.33 + r.hl.moment.lanePart) * (0.9 / 1.25), 9)
    expect(r.notes.some((n) => n.includes('lever rule was skipped'))).toBe(true)
  })

  it('rating factors fall when the span grows (LL grows faster than DC)', () => {
    const short = bridgeRating({ L: 20, deck, DC: 8, DW: 1.5, Mn: 3000, Vn: 900 })
    const long = bridgeRating({ L: 40, deck, DC: 16, DW: 3, Mn: 9000, Vn: 1800 })
    expect(long.RFmin).toBeLessThan(short.RFmin)
  })
})
