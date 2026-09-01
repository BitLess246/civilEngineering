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

  it('develops each stirrup on its own centreline, bends deducted, hooks added', () => {
    // 300 × 500 section, 40 cover, ⌀10 tie. Three terms, and the take-off used
    // to get two of them wrong:
    //
    //   perimeter on the BAR CENTRELINE
    //     = 2[(300 − 2·40 − 10) + (500 − 2·40 − 10)] = 2[210 + 410] = 1240 mm
    //     …the old formula measured 2[(b − 2c) + (h − 2c)] = 1280, which is the
    //     cover line: one bar diameter too big the whole way round.
    //   less four 90° bends, R = 4·10/2 + 10/2 = 25 mm centreline radius
    //     = 4 · 25 · (2 − π/2) = 42.92 mm
    //     …never deducted at all, though a bent bar really is shorter than the
    //     sharp-cornered rectangle drawn through its corners.
    //   plus the CLOSURE, which is not a bend: a tie is one bar, so at the
    //     corner it closes at no 90° bend is made and each end instead sweeps
    //     135° around the corner bar at the wrap radius R = (20 + 10)/2 = 15
    //     and runs an extension. R(3π/2 − π/2) + 2·max(6·10, 75) = 197.1 mm
    //     …the old rule of thumb bought 210: a 90° bend nobody makes, plus a
    //     3·dt guess for two sweeps that are 47 mm of arc.
    //   and finally the lean: the bar steps a diameter aside over its run, so
    //     the stock is the hypotenuse — 0.04 mm here.
    const perimeter = 2 * (210 + 410)
    const bends = 4 * 25 * (2 - Math.PI / 2)
    const closure = 15 * ((3 * Math.PI) / 2 - Math.PI / 2) + 2 * Math.max(6 * 10, 75)
    const flat = perimeter - bends + closure
    const stirrup = t.cutList.find((c) => c.mark === 'Stirrup' && c.dia === 10)!
    expect(stirrup).toBeDefined()
    expect(stirrup.cutLengthM).toBeCloseTo(Math.hypot(flat, 10) / 1000, 6)
    expect(stirrup.tie).toBe(true)
  })

  it('bills the bars the DETAIL draws, not every bar at the full span', () => {
    // The old take-off billed every longitudinal bar at L + 2·40db whether the
    // detail ran it through or curtailed it. It now reads the beam cage, so a
    // curtailed bar is billed for the length it is actually cut to.
    const tops = t.cutList.filter((c) => c.mark === 'Top main')
    expect(tops.length).toBeGreaterThan(0)
    const beam = design.beams[0]
    // no bar is longer than the member plus a hook at each end
    for (const c of tops) expect(c.cutLengthM).toBeLessThan(beam.L + 1.0)
    // and the curtailed ones really are shorter than the through bars
    const lens = [...new Set(tops.map((c) => Math.round(c.cutLengthM * 1000)))]
    expect(lens.length).toBeGreaterThan(1)
  })

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
    // Combining is decided by clashing pads now, not by a plan — so the model
    // has to be one where two pads really do collide: interior columns 1.2 m
    // apart each carrying a 6 m bay, on weak soil.
    const cm = generateGridModel({ baysX: [6, 1.2, 6], baysZ: [6], storeyH: [3], section, slabThickness: 200 })
    cm.loads = cm.plates.flatMap((p) => [
      { kind: 'area' as const, plate: p.id, q: 4.8, cat: 'D' as const },
      { kind: 'area' as const, plate: p.id, q: 2.4, cat: 'L' as const },
    ])
    const cd = designStructure(cm, { ...soil, qAllow: 80 })!
    expect(cd.combined.length).toBeGreaterThan(0)
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
    govName: '', system: 'gravity', cases: [], beams: [], prestressed: [], columns: [], steelBeams: [], steelColumns: [],
    woodBeams: [], woodColumns: [],
    basePlates: [], joints: [], beamJoints: [], slabs: [], woodSlabs: [], walls: [], stairs: [], footings: [], combined: [], scwb: [],
    totals: { concreteMembers: 0, concreteSlabs: 0, concrete: 0, steelKg: 0, woodVolume: 0 }, orphanEdges: 0,
    unchecked: [], pDeltaIssues: [],
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

describe('timber (wood-frame) take-off', () => {
  const woodSec = (id: string, name: string, b: number, h: number): RectSection =>
    ({ id, name, b, h, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40, material: 'wood', woodSpecies: 'DFL-2', woodKind: 'sawn' })
  const woodModel = (): StructuralModel => {
    const m = generateGridModel({
      baysX: [6], baysZ: [5], storeyH: [3],
      column: woodSec('C', '400×400', 400, 400), girder: woodSec('G', '300×500', 300, 500),
      beam: woodSec('B', '250×450', 250, 450), slabThickness: 200,
    })
    m.loads = buildGravityLoads(m, 4.8, 2.4)
    return m
  }
  const design = designStructure(woodModel(), soil)!
  const t = estimateTakeoff(woodModel(), design)

  it('reports timber volume + board feet by section size, excluded from concrete', () => {
    expect(t.timberM3).toBeGreaterThan(0)
    expect(t.timberBoardFeet).toBeCloseTo(t.timberM3 * 423.776, 4)
    expect(t.timberBySize.reduce((s, x) => s + x.m3, 0)).toBeCloseTo(t.timberM3, 6)
    expect(t.timberBySize.every((x) => x.species === 'DFL-2' && x.kind === 'sawn' && x.count > 0)).toBe(true)
    // the three role sizes appear
    expect(t.timberBySize.map((x) => x.name).sort()).toEqual(['250×450', '300×500', '400×400'])
    // wood not double-counted as concrete members (only the concrete slabs remain)
    expect(t.byElement.filter((e) => e.kind === 'Beam' || e.kind === 'Column')).toHaveLength(0)
  })

  it('adds timber lines to the BOQ and prices them per board foot', () => {
    expect(t.boq.some((r) => r.item.startsWith('Timber — ') && r.unit === 'm³')).toBe(true)
    const bill = costBill(t, {
      cementBag: 260, sandM3: 1500, gravelM3: 1600, steelKg: 65, tieWireRoll: 2500, plywoodSheet: 700, lumberM: 25, timberBdFt: 60,
    })
    const timberRows = bill.rows.filter((r) => r.item.startsWith('Timber — '))
    expect(timberRows.length).toBe(t.timberBySize.length)
    expect(timberRows.every((r) => r.unit === 'bd·ft' && r.unitPrice === 60 && r.priceKey === 'timberBdFt')).toBe(true)
    const timberSubtotal = timberRows.reduce((s, r) => s + r.amount, 0)
    expect(timberSubtotal).toBeCloseTo(t.timberBoardFeet * 60, 2)
  })

  it('defaults the timber rate to ₱55 / board foot', () => {
    const bill = costBill(t, { cementBag: 260, sandM3: 1500, gravelM3: 1600, steelKg: 65, tieWireRoll: 2500, plywoodSheet: 700, lumberM: 25 })
    expect(bill.rows.find((r) => r.item.startsWith('Timber — '))!.unitPrice).toBe(55)
  })
})


describe('the pedestal is bought — once', () => {
  it('a bottom column is costed to the TOP OF ITS FOOTING, and not twice', () => {
    // The design supports the column base at the pad, so the schedule length
    // already runs through the pedestal. Adding it again here bought it twice.
    const model = makeModel()
    const design = designStructure(model, soil as never)!
    const t = estimateTakeoff(model, design)
    const cols = t.byElement.filter((e) => e.kind === 'Column')
    expect(cols.length).toBeGreaterThan(0)
    expect(design.footings.some((f) => f.pedestal > 0)).toBe(true)
    for (const c of cols) {
      const m = model.members.find((x) => x.id === c.id)!
      const sec = model.sections.find((x) => x.id === m.section)!
      const row = design.columns.find((x) => x.id === c.id)!
      expect(c.concreteM3).toBeCloseTo((sec.b / 1000) * (sec.h / 1000) * row.L, 6)
    }
  })

  it('and that length really does include the pedestal', () => {
    // The storey is 3 m; a bottom column supported at the pad is longer than
    // that by H − Dc, which is the whole point of moving the support down.
    const model = makeModel()
    const design = designStructure(model, soil as never)!
    const yOf = (n: string) => model.nodes.find((q) => q.id === n)!.y
    const bases = new Set(design.footings.map((f) => f.node))
    const bottom = design.columns.filter((c) => {
      const m = model.members.find((x) => x.id === c.id)!
      return bases.has(yOf(m.i) <= yOf(m.j) ? m.i : m.j)
    })
    expect(bottom.length).toBeGreaterThan(0)
    for (const c of bottom) expect(c.L).toBeGreaterThan(3 + 1e-6)
  })
})
