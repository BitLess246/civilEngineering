import { describe, it, expect } from 'vitest'
import { designWoodSlab, woodSlabTimberSizes, BAMBOO_SLAT_REF, type WoodSlabInput } from './woodSlab'
import { getWoodRef, woodSectionProps, woodAdjusted } from './woodDesign'
import { BDFT_PER_M3, costTimberRows } from './takeoff'

const DFL2 = getWoodRef('DFL-2')!.ref

const base: WoodSlabInput = {
  Lx: 3.0, Ly: 3.6,
  joistRef: DFL2, joistB: 50, joistD: 200, joistSpacing: 400, joistSupport: 'simple',
  deckMaterial: 'plank', deckThickness: 25, deckWidth: 140, deckSupport: 'continuous',
  deadKpa: 0.5, liveKpa: 1.9,
}

describe('designWoodSlab — flexural demands (NSCP/ACI UDL coefficients)', () => {
  it('joist moment & shear follow the simple-span coefficients wL²/8, wL/2', () => {
    const r = designWoodSlab(base)
    const L = base.Lx
    expect(r.joist.M).toBeCloseTo((r.joist.w * L * L) / 8, 6)
    expect(r.joist.V).toBeCloseTo((r.joist.w * L) / 2, 6)
    // fb = M / S  (S = b·d²/6)
    const { S } = woodSectionProps(base.joistB, base.joistD)
    expect(r.joist.fb).toBeCloseTo((r.joist.M * 1e6) / S, 4)
  })

  it('deck moment follows the continuous coefficient wL²/10 over the joist spacing', () => {
    const r = designWoodSlab(base)
    const s = base.joistSpacing / 1000
    expect(r.deck.span).toBeCloseTo(s, 9)
    expect(r.deck.M).toBeCloseTo((r.deck.w * s * s) / 10, 6)
  })

  it('joist total deflection = 5wL⁴/384EI on the service modulus', () => {
    const r = designWoodSlab(base)
    const { I } = woodSectionProps(base.joistB, base.joistD)
    const E = woodAdjusted(DFL2, 'sawn', base.joistD, {}).E    // service, no CD
    const Lmm = base.Lx * 1000
    const hand = (5 / 384) * r.joist.w * Math.pow(Lmm, 4) / (E * I)
    expect(r.joist.deflTotal).toBeCloseTo(hand, 4)
    expect(r.joist.deflTotalAllow).toBeCloseTo(Lmm / 240, 9)
    expect(r.joist.deflLiveAllow).toBeCloseTo(Lmm / 360, 9)
  })
})

describe('designWoodSlab — pass/fail & sensitivity', () => {
  it('an adequately-sized residential slab passes every limit', () => {
    const r = designWoodSlab(base)
    expect(r.ok).toBe(true)
    expect(r.joist.ok && r.deck.ok).toBe(true)
    expect(r.ratio).toBeLessThan(1)
  })

  it('a flimsy joist fails (governing ratio > 1)', () => {
    const r = designWoodSlab({ ...base, joistD: 90, joistSpacing: 600, Lx: 5.0 })
    expect(r.ok).toBe(false)
    expect(r.joist.ratio).toBeGreaterThan(1)
  })

  it('thicker decking lowers the deck deflection ratio (monotonic)', () => {
    const thin = designWoodSlab({ ...base, deckThickness: 20 })
    const thick = designWoodSlab({ ...base, deckThickness: 40 })
    expect(thick.deck.deflTotalRatio).toBeLessThan(thin.deck.deflTotalRatio)
  })
})

describe('designWoodSlab — take-off / bill of materials', () => {
  it('counts joists across Ly and reports board feet = m³ × 423.776', () => {
    const r = designWoodSlab(base)
    // floor(3600/400)+1 = 10 joists, each 3.0 m
    expect(r.takeoff.joistCount).toBe(10)
    expect(r.takeoff.joistLengthM).toBeCloseTo(10 * 3.0, 9)
    const volPerM = (base.joistB * base.joistD) / 1e6
    expect(r.takeoff.joistM3).toBeCloseTo(10 * 3.0 * volPerM, 9)
    expect(r.takeoff.joistBoardFeet).toBeCloseTo(r.takeoff.joistM3 * BDFT_PER_M3, 6)
    expect(r.takeoff.deckM3).toBeCloseTo(3.0 * 3.6 * 0.025, 9)
    expect(r.takeoff.bambooSlatCount).toBeUndefined()
  })

  it('bamboo-slat deck reports a slat count and uses the bamboo reference', () => {
    const r = designWoodSlab({ ...base, deckMaterial: 'bamboo-slat', deckThickness: 30, deckWidth: 50 })
    expect(r.takeoff.bambooSlatCount).toBeGreaterThan(0)
    // 50 mm slats: ceil(3.0/0.05)=60 courses × ceil(3.6/2.4)=2 → 120
    expect(r.takeoff.bambooSlatCount).toBe(60 * 2)
  })

  it('bamboo reference values are the conservative preliminary set', () => {
    expect(BAMBOO_SLAT_REF.Fb).toBe(12)
    expect(BAMBOO_SLAT_REF.Emin).toBeLessThan(BAMBOO_SLAT_REF.E)
  })
})

describe('woodSlabTimberSizes — wood-frame BOM connection', () => {
  it('emits joist + deck rows in the TimberSizeQty vocabulary with matching board feet', () => {
    const r = designWoodSlab(base)
    const sizes = woodSlabTimberSizes(base, r, { joist: 'DFL No.2', deck: 'DFL No.2' })
    expect(sizes).toHaveLength(2)
    const [joist, deck] = sizes
    expect(joist.name).toBe('50×200')
    expect(joist.boardFeet).toBeCloseTo(r.takeoff.joistBoardFeet, 6)
    expect(joist.count).toBe(r.takeoff.joistCount)
    expect(deck.boardFeet).toBeCloseTo(r.takeoff.deckBoardFeet, 6)
    // deck linear metres × width × thickness = deck volume
    expect(deck.L * (140 / 1000) * (25 / 1000)).toBeCloseTo(r.takeoff.deckM3, 9)
  })

  it('costs through the shared costTimberRows at ₱/board-foot', () => {
    const r = designWoodSlab(base)
    const sizes = woodSlabTimberSizes(base, r)
    const rows = costTimberRows(sizes, 55)
    expect(rows).toHaveLength(2)
    expect(rows.every((x) => x.unit === 'bd·ft' && x.priceKey === 'timberBdFt')).toBe(true)
    const total = rows.reduce((s, x) => s + x.amount, 0)
    expect(total).toBeCloseTo((r.takeoff.joistBoardFeet + r.takeoff.deckBoardFeet) * 55, 4)
  })

  it('labels a bamboo deck as bamboo', () => {
    const r = designWoodSlab({ ...base, deckMaterial: 'bamboo-slat', deckWidth: 50 })
    const [, deck] = woodSlabTimberSizes({ ...base, deckMaterial: 'bamboo-slat', deckWidth: 50 }, r)
    expect(deck.species).toBe('bamboo')
  })
})
