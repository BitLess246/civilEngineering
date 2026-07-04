import { describe, it, expect } from 'vitest'
import { generateGridModel, buildGravityLoads } from './modelBuilder'
import { designStructure } from './pipeline'
import { estimateTakeoff, costBill, type PriceList } from './takeoff'
import { sdlItemKPa, sdlTotal, type SdlItem } from './deadLoads'
import type { RectSection, StructuralModel } from './model'
import type { StructureDesign } from './pipeline'
import { shapeByName } from './aiscSections'

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

  it('costBill prices the aggregates into line amounts + a grand total', () => {
    const prices: PriceList = { cementBag: 260, sandM3: 1500, gravelM3: 1600, steelKg: 65, tieWireRoll: 2500, plywoodSheet: 700, lumberM: 25 }
    const bill = costBill(t, prices)
    const cement = bill.rows.find((r) => r.item === 'Cement')!
    expect(cement.amount).toBeCloseTo(t.concrete.cement * 260, 6)
    const steel = bill.rows.find((r) => r.item === 'Reinforcing steel')!
    expect(steel.amount).toBeCloseTo(t.totalSteelPurchasedKg * 65, 6)
    expect(bill.total).toBeCloseTo(bill.rows.reduce((s, r) => s + r.amount, 0), 6)
    expect(bill.total).toBeGreaterThan(0)
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

describe('structural steel — per-shape unit weight + costed BOM line items (A2)', () => {
  const STEEL_DENSITY = 7850
  const emptyDesign: StructureDesign = {
    govName: '', cases: [], beams: [], columns: [], steelBeams: [], steelColumns: [],
    basePlates: [], joints: [], beamJoints: [], slabs: [], walls: [], footings: [], combined: [], scwb: [],
    totals: { concreteMembers: 0, concreteSlabs: 0, concrete: 0, steelKg: 0 }, orphanEdges: 0,
    unchecked: [],
  }
  // Two steel members: one 6 m W200x46.1 beam, two 4 m W250x49.1 columns.
  const steelBeam: RectSection = {
    id: 'SB', name: 'W200x46.1', b: 203, h: 203, fc: 0, fy: 0, barDia: 0, tieDia: 0, cover: 0,
    material: 'steel', shape: 'W200x46.1',
  }
  const steelCol: RectSection = {
    id: 'SC', name: 'W250x49.1', b: 203, h: 254, fc: 0, fy: 0, barDia: 0, tieDia: 0, cover: 0,
    material: 'steel', shape: 'W250x49.1',
  }
  const model: StructuralModel = {
    version: 1, name: 'steel-frame',
    nodes: [
      { id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 0, y: 4, z: 0 },
      { id: 'c', x: 6, y: 4, z: 0 }, { id: 'd', x: 6, y: 0, z: 0 },
    ],
    members: [
      { id: 'col1', i: 'a', j: 'b', role: 'column', section: 'SC' },
      { id: 'col2', i: 'd', j: 'c', role: 'column', section: 'SC' },
      { id: 'gird', i: 'b', j: 'c', role: 'girder', section: 'SB' },
    ],
    sections: [steelBeam, steelCol], plates: [], supports: [], loads: [], storeys: [],
  }
  const t = estimateTakeoff(model, emptyDesign)

  it('steelByShape carries unit weight kg/m = ρ·A and consolidated mass per shape', () => {
    const beam = t.steelByShape.find((s) => s.shape === 'W200x46.1')!
    const col = t.steelByShape.find((s) => s.shape === 'W250x49.1')!
    expect(beam.kgPerM).toBeCloseTo((shapeByName('W200x46.1')!.A / 1e6) * STEEL_DENSITY, 6)
    expect(col.kgPerM).toBeCloseTo((shapeByName('W250x49.1')!.A / 1e6) * STEEL_DENSITY, 6)
    expect(beam.L).toBeCloseTo(6, 9)           // one 6 m girder
    expect(col.L).toBeCloseTo(8, 9)            // two 4 m columns
    expect(beam.kg).toBeCloseTo(beam.kgPerM * 6, 6)
    expect(col.kg).toBeCloseTo(col.kgPerM * 8, 6)
    expect(t.structuralSteelKg).toBeCloseTo(beam.kg + col.kg, 6)
  })

  it('costBill emits one priced line per shape (kg × ₱/kg), no aggregate W-shapes line', () => {
    const prices: PriceList = {
      cementBag: 260, sandM3: 1500, gravelM3: 1600, steelKg: 65, tieWireRoll: 2500,
      plywoodSheet: 700, lumberM: 25, structuralSteelKg: 130,
    }
    const bill = costBill(t, prices)
    expect(bill.rows.some((r) => r.item === 'Structural steel (W-shapes)')).toBe(false)
    const beamRow = bill.rows.find((r) => r.item === 'Structural steel — W200x46.1')!
    const colRow = bill.rows.find((r) => r.item === 'Structural steel — W250x49.1')!
    expect(beamRow.unit).toBe('kg')
    expect(beamRow.priceKey).toBe('structuralSteelKg')      // shares the editable rate
    expect(beamRow.amount).toBeCloseTo(beamRow.qty * 130, 6)
    expect(colRow.amount).toBeCloseTo(colRow.qty * 130, 6)
    // per-shape steel sub-total equals the total tonnage × rate
    const steelSubtotal = bill.rows.filter((r) => r.item.startsWith('Structural steel — '))
      .reduce((s, r) => s + r.amount, 0)
    expect(steelSubtotal).toBeCloseTo(t.structuralSteelKg * 130, 4)
  })

  it('default structural steel rate is ₱120/kg when none supplied', () => {
    const prices: PriceList = {
      cementBag: 260, sandM3: 1500, gravelM3: 1600, steelKg: 65, tieWireRoll: 2500,
      plywoodSheet: 700, lumberM: 25,
    }
    const bill = costBill(t, prices)
    const beamRow = bill.rows.find((r) => r.item === 'Structural steel — W200x46.1')!
    expect(beamRow.unitPrice).toBe(120)
    expect(beamRow.amount).toBeCloseTo(beamRow.qty * 120, 6)
  })
})
