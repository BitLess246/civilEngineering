import { describe, it, expect } from 'vitest'
import { generateGridModel, buildGravityLoads } from './modelBuilder'
import { designStructure } from './pipeline'
import { estimateTakeoff } from './takeoff'
import { sdlItemKPa, sdlTotal, type SdlItem } from './deadLoads'
import type { RectSection } from './model'

const section: RectSection = { id: 'S1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }

function makeModel() {
  const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section })
  m.loads = buildGravityLoads(m, 4.8, 2.4)
  return m
}

describe('NSCP-204 SDL composition', () => {
  it('204-1 components contribute their kPa directly; 204-2 = γ·t', () => {
    const tile: SdlItem = { id: 'fin-ceramic', kind: '204-1', label: 'tile', kPa: 1.1 }
    const screed: SdlItem = { id: 'mat-mortar', kind: '204-2', label: 'mortar', gamma: 21.2, thicknessMm: 50 }
    expect(sdlItemKPa(tile)).toBeCloseTo(1.1, 9)
    expect(sdlItemKPa(screed)).toBeCloseTo(21.2 * 0.05, 9)        // 1.06 kPa
    expect(sdlTotal([tile, screed])).toBeCloseTo(1.1 + 1.06, 9)
  })

  it('per-slab SDL overrides the global SDL in the area dead load', () => {
    const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3], section })   // 2 panels
    m.plates[0].sdlItems = [{ id: 'x', kind: '204-1', label: 'heavy', kPa: 5 }]
    const loads = buildGravityLoads(m, 4.8, 2.4)
    const qOf = (plate: string) =>
      (loads.find((l) => l.kind === 'area' && l.cat === 'D' && (l as { plate: string }).plate === plate) as { q: number }).q
    // slab self-weight = 0.15·24 = 3.6; panel 0 → +5 SDL, others → +4.8 global
    expect(qOf(m.plates[0].id)).toBeCloseTo(3.6 + 5, 6)
    expect(qOf(m.plates[1]?.id ?? m.plates[0].id)).toBeCloseTo(3.6 + 4.8, 6)
  })
})

describe('structure take-off / BOM-BOQ', () => {
  const m = makeModel()
  const design = designStructure(m, soil)!
  const t = estimateTakeoff(m, design, { concreteClass: 'A' })

  it('total concrete matches the design totals and yields cement/sand/gravel', () => {
    expect(t.totalConcreteM3).toBeGreaterThan(0)
    // members + slabs (footings add a little more) ≥ design member+slab concrete
    expect(t.totalConcreteM3).toBeGreaterThanOrEqual(design.totals.concrete - 1e-6)
    expect(t.concrete.cement).toBe(Math.ceil(t.totalConcreteM3 * 9))      // class A = 9 bags/m³
    expect(t.concrete.gravel).toBeCloseTo(t.totalConcreteM3 * 1.0, 6)
  })

  it('produces a non-empty cut list and steel grouped by bar Ø', () => {
    expect(t.cutList.length).toBeGreaterThan(0)
    expect(t.totalSteelPurchasedKg).toBeGreaterThan(0)
    const sumByDia = t.steelByDia.reduce((s, d) => s + d.weightKg, 0)
    expect(sumByDia).toBeCloseTo(t.totalSteelPurchasedKg, 6)
    expect(t.steelByDia).toEqual([...t.steelByDia].sort((a, b) => a.dia - b.dia))
    expect(t.steelByDia.every((d) => d.pieces6m >= 1)).toBe(true)
  })

  it('6 m commercial bars: splice lap, waste, and purchased ≥ fabricated', () => {
    for (const d of t.steelByDia) {
      expect(d.purchasedM).toBeCloseTo(d.pieces6m * 6, 9)        // bought as whole 6 m bars
      expect(d.purchasedM).toBeGreaterThanOrEqual(d.netLengthM - 1e-6)
      expect(d.wasteM).toBeCloseTo(d.purchasedM - d.netLengthM, 6)
    }
    expect(t.totalSteelPurchasedKg).toBeGreaterThanOrEqual(t.totalSteelNetKg - 1e-6)
  })

  it('formwork in plywood sheets + lumber lm, and tie wire from intersections', () => {
    expect(t.formwork.plywoodSheets).toBe(Math.ceil(t.formwork.areaM2 / (t.formwork.sheetM2 * t.formwork.uses)))
    expect(t.formwork.lumberM).toBeGreaterThan(0)
    expect(t.tieWire.intersections).toBeGreaterThan(0)
    expect(t.tieWire.rolls).toBeGreaterThanOrEqual(1)
  })

  it('combined footings contribute reinforcement (longitudinal + transverse)', () => {
    const cm = makeModel()
    const plan = { 'n0.0.0': { type: 'combined' as const, with: 'n1.0.0' } }
    const cd = designStructure(cm, soil, plan)!
    expect(cd.combined.length).toBe(1)
    const ct = estimateTakeoff(cm, cd, { concreteClass: 'A' })
    const comb = ct.byElement.find((e) => e.kind === 'Combined footing')!
    expect(comb).toBeTruthy()
    expect(comb.steelKg).toBeGreaterThan(0)
    expect(ct.cutList.some((c) => /^Combined/.test(c.element) && c.mark === 'Longitudinal')).toBe(true)
  })

  it('BOQ lists concrete + formwork per element kind; slab steel from DDM strips', () => {
    expect(t.boq.some((r) => /Beam — concrete/.test(r.item) && r.unit === 'm³')).toBe(true)
    expect(t.boq.some((r) => /formwork/.test(r.item) && r.unit === 'm²')).toBe(true)
    expect(t.slabSteelDDM).toBe(true)
    // slab cut list carries +M bottom and −M top marks (real DDM locations)
    expect(t.cutList.some((c) => /^Slab/.test(c.element) && /Bottom \+M/.test(c.mark))).toBe(true)
    for (const e of t.byElement) {
      expect(e.concreteM3).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(e.steelKg)).toBe(true)
    }
  })
})
