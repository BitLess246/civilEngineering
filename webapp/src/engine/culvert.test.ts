import { describe, it, expect } from 'vitest'
import {
  CULVERT_INLETS, inletDef, fullArea, fullPerimeter,
  inletControlHW, outletControlHW, culvertCheck, minDiameter, STANDARD_DIAMETERS,
  type CulvertSection,
} from './culvert'



describe('culvert geometry', () => {
  it('full areas and perimeters', () => {
    const circ: CulvertSection = { kind: 'circular', D: 0.9 }
    expect(fullArea(circ)).toBeCloseTo(Math.PI * 0.81 / 4, 12)
    expect(fullPerimeter(circ)).toBeCloseTo(Math.PI * 0.9, 12)
    const box: CulvertSection = { kind: 'box', B: 1.8, D: 1.2 }
    expect(fullArea(box)).toBeCloseTo(2.16, 12)
    expect(fullPerimeter(box)).toBeCloseTo(6.0, 12)
  })

  it('every inlet definition carries the HDS-5 constants', () => {
    expect(CULVERT_INLETS).toHaveLength(7)
    const sq = inletDef('concrete-square-headwall')
    expect(sq.K).toBe(0.0098)
    expect(sq.M).toBe(2.0)
    expect(sq.c).toBe(0.0398)
    expect(sq.Y).toBe(0.67)
    expect(sq.Ke).toBe(0.5)
    const mit = inletDef('cmp-mitered')
    expect(mit.slopeCoef).toBe(0.7) // mitered adds the slope
    expect(inletDef('box-flared-wingwalls').kind).toBe('box')
    expect(() => inletDef('nope')).toThrow()
  })
})

describe('inlet control — hand-checked against the HDS-5 equations', () => {
  // Reference: python hand calc — D=0.9 m concrete square edge, Q=1.0 m³/s
  // q = 35.3146667 cfs, A = 6.8477039 ft², D = 2.9527559 ft, x = 3.0012099
  const sec: CulvertSection = { kind: 'circular', D: 0.9 }
  const sq = inletDef('concrete-square-headwall')

  it('transitions between form 1 at 1.0·D and form 2 at 1.2·D (Q = 1.0 m³/s)', () => {
    const r = inletControlHW(1.0, sec, sq, 0.005)
    expect(r.form).toBe('transition')
    expect(r.x).toBeCloseTo(3.0012099, 4)
    // Qa = 33.8563 cfs (form 1 at the crown), Qb = 42.9393 cfs (form 2 at 1.2·D)
    // HW = D(1 + 0.2·(Q−Qa)/(Qb−Qa)) = 0.92890 m
    expect(r.hw).toBeCloseTo(0.9289006, 3)
  })

  it('goes fully submerged at high flows (Q = 2.0 m³/s)', () => {
    const r = inletControlHW(2.0, sec, sq, 0.005)
    expect(r.form).toBe('submerged')
    // HW/D = 0.0398·6.00242² + 0.67 − 0.5·S = 2.10146 → 1.89131 m
    expect(r.hw).toBeCloseTo(1.8913103, 3)
  })

  it('stays unsubmerged at low flows (Q = 0.3 m³/s)', () => {
    const r = inletControlHW(0.3, sec, sq, 0.005)
    expect(r.form).toBe('unsubmerged')
    // Ec/D + K·x² − 0.5·S at x = 0.9003630 (Q=0.3 → 10.5944 cfs)
    expect(r.hw).toBeLessThan(0.9)
    expect(r.EcFt).toBeGreaterThan(0)
  })

  it('a groove end lowers the headwater below the square edge at the same flow', () => {
    const gr = inletDef('concrete-groove-headwall')
    const a = inletControlHW(1.0, sec, sq, 0.005)
    const b = inletControlHW(1.0, sec, gr, 0.005)
    expect(b.form).toBe('unsubmerged')
    // form1: Ec/D + 0.0018·x² − 0.0025 = 0.95892 → 0.86308 m
    expect(b.hw).toBeCloseTo(0.8630765, 3)
    expect(b.hw).toBeLessThan(a.hw)
  })

  it('mitered entrances carry the +0.7·S slope term', () => {
    const mit = inletDef('cmp-mitered')
    const r = inletControlHW(1.0, sec, mit, 0.005)
    const flat = inletControlHW(1.0, sec, mit, 0)
    expect(r.hw).toBeGreaterThan(flat.hw) // added slope raises the headwater
  })

  it('rejects non-positive discharge', () => {
    expect(() => inletControlHW(0, sec, sq, 0.005)).toThrow()
    expect(() => inletControlHW(-1, sec, sq, 0.005)).toThrow()
  })
})

describe('outlet control — hand-checked', () => {
  const sec: CulvertSection = { kind: 'circular', D: 0.9 }
  const sq = inletDef('concrete-square-headwall')

  it('H, ho and HW for the reference case', () => {
    const r = outletControlHW(1.0, sec, sq, 30, 0.013, 0.5)
    expect(r.V).toBeCloseTo(1.5719007, 5)
    expect(r.hf).toBeCloseTo(0.0915683, 4)
    expect(r.vh).toBeCloseTo(0.1888974, 4)
    expect(r.H).toBeCloseTo(0.2804454, 4)
    expect(r.dc).toBeCloseTo(0.5914498, 3)
    expect(r.ho).toBeCloseTo(0.7457249, 4) // (dc+D)/2 > TW
    expect(r.hw).toBeCloseTo(1.0261703, 3)
    expect(r.submergedOutlet).toBe(false)
  })

  it('a tailwater at the crown hoists the headwater', () => {
    const a = outletControlHW(1.0, sec, sq, 30, 0.013, 0.5)
    const b = outletControlHW(1.0, sec, sq, 30, 0.013, 0.9)
    expect(b.submergedOutlet).toBe(true)
    expect(b.ho).toBeCloseTo(0.9, 12)
    expect(b.hw).toBeCloseTo(0.9 + 0.2804454, 3)
    expect(b.hw).toBeGreaterThan(a.hw)
  })
})

describe('culvertCheck — the full assembly', () => {
  const base = {
    Q: 1.0, section: { kind: 'circular', D: 0.9 } as CulvertSection,
    inlet: 'concrete-square-headwall', L: 30, S: 0.005, TW: 0.5,
  }

  it('outlet control governs the reference case', () => {
    const r = culvertCheck(base)
    expect(r.controlling).toBe('outlet')
    expect(r.hw).toBeCloseTo(1.0261703, 3)
    expect(r.hwOverD).toBeCloseTo(1.1401892, 3)
    expect(r.n).toBe(0.013)
    expect(r.inletHW.hw).toBeCloseTo(0.9289006, 3)
  })

  it('outlet velocity follows the HDS-5 velocity depth (dc when TW ≤ dc)', () => {
    const r = culvertCheck(base)
    // TW = 0.5 ≤ dc = 0.5914 → velocity depth = dc, V = Q/A(dc) ≈ 2.258 m/s
    expect(r.velocityDepth).toBeCloseTo(0.5914498, 3)
    expect(r.outletVelocity).toBeCloseTo(2.258, 2)
    expect(r.notes.some((n) => n.includes('erosion'))).toBe(false) // 2.26 m/s < 3 m/s
  })

  it('flags the part-full screening caveat when outlet HW sits below the crown', () => {
    // Long gentle barrel with a deep tailwater removal: inlet HW low, outlet HW < D
    const r = culvertCheck({ ...base, L: 200, S: 0.0005, TW: 0.1 })
    if (r.hw < 0.9) {
      expect(r.notes.some((n) => n.includes('full-barrel'))).toBe(true)
    }
  })

  it('splits the flow across barrels', () => {
    const one = culvertCheck(base)
    const two = culvertCheck({ ...base, barrels: 2 })
    expect(two.barrels).toBe(2)
    // half the flow in each barrel → lower headwater than the single barrel
    expect(two.hw).toBeLessThan(one.hw)
  })

  it('validates the inputs', () => {
    expect(() => culvertCheck({ ...base, Q: 0 })).toThrow()
    expect(() => culvertCheck({ ...base, L: 0 })).toThrow()
    expect(() => culvertCheck({ ...base, TW: -1 })).toThrow()
    expect(() => culvertCheck({ ...base, section: { kind: 'circular', D: 0 } })).toThrow()
  })
})

describe('minDiameter sweep', () => {
  it('finds the smallest standard size holding the headwater', () => {
    const { D, result } = minDiameter({
      Q: 1.0, inlet: 'concrete-square-headwall', L: 30, S: 0.005, TW: 0.5,
      allowableHW: 1.0,
    })
    expect(STANDARD_DIAMETERS).toContain(D)
    expect(D).toBe(1.05) // 0.9 m gives HW 1.026 m > 1.0 m
    expect(result.hw).toBeLessThanOrEqual(1.0)
  })

  it('throws when nothing fits', () => {
    expect(() => minDiameter({
      Q: 30, inlet: 'concrete-square-headwall', L: 30, S: 0.005, TW: 2.5,
      allowableHW: 0.5,
    })).toThrow()
  })
})
