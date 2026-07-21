// ─────────────────────────────────────────────────────────────────────────
// Quantity take-off / BOM-BOQ for a designed 3D structure. Consumes the model
// geometry + the StructureDesign schedules and produces, per element:
//   · concrete volume (m³) and FORMWORK contact area (m²)
//   · a reinforcement CUT LIST (per-piece cut length, count, weight) with
//     standard detailing allowances and tie-wire intersection counts,
// then aggregates into commercial quantities:
//   · steel by bar Ø bought as 6 m bars — CONTINUOUS bars spliced (usable =
//     6 − lap), STIRRUPS/TIES nested (cuts-per-6 m), with the resulting waste,
//   · concrete materials (cement/sand/gravel) by NSCP mix class (quantities.ts),
//   · FORMWORK as plywood sheets (with re-uses) + lumber linear-metres,
//   · TIE WIRE (G.I.) from the bar-intersection count → rolls + weight,
//   · a Bill of Quantities (per element kind) + a Bill of Materials summary.
//
// Detailing assumptions (documented, all editable via options): straight-bar
// end allowance Ld = 40·db (lap/anchorage); stirrup/tie hook = 2·max(6·dt, 75
// mm); commercial bar length 6 m; lap (splice) length 0.30 m; tie wire 0.30 m
// per intersection; plywood sheet 1.2×2.4 m at 3 re-uses; lumber 4 lm per m² of
// formwork. Slab steel follows the DDM column/middle-strip layout (per location).
// Units: lengths m, Ø mm, steel kg (ρ = 7850 kg/m³).
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, RectSection } from './model'
import type { StructureDesign } from './pipeline'
import { concreteMaterials, type ConcreteClass, type ConcreteMaterials } from './quantities'
import { shapeByName } from './aiscSections'

const STEEL_DENSITY = 7850            // kg/m³
const BAR_LENGTH = 6                  // m, commercial length
const TIE_WIRE_ROLL = 2385            // m per roll (#16 G.I.)
const GI_WIRE_KG_PER_M = 0.0189       // #16 G.I. tie wire, ~1.6 mmØ
const SLAB_BAR = 12                   // slab mat bar Ø, mm (matches designSlabDDM)

const barAreaM2 = (dia: number) => (Math.PI / 4) * (dia / 1000) ** 2
const kgPerM = (dia: number) => barAreaM2(dia) * STEEL_DENSITY
const Ld = (dia: number) => (40 * dia) / 1000                       // tension lap/anchorage, m
/** Closed stirrup/tie cut length for a b×h section, m. */
const tiePerimeter = (b: number, h: number, cover: number, tieDia: number) =>
  (2 * ((b - 2 * cover) + (h - 2 * cover))) / 1000 + (2 * Math.max(6 * tieDia, 75)) / 1000

export interface CutItem {
  element: string          // e.g. 'Beam bx0.0.1'
  mark: string             // 'Bottom main', 'Stirrup', 'Vertical', 'Tie', 'Bottom (each way)'
  dia: number              // mm
  count: number
  cutLengthM: number       // per piece
  totalM: number
  weightKg: number         // fabricated (net) weight
  tie: boolean             // true → closed stirrup/tie cut nested from 6 m bars
}
export interface ElementQty {
  kind: 'Beam' | 'Girder' | 'Column' | 'Footing' | 'Combined footing' | 'Slab' | 'Wall'
  id: string
  concreteM3: number
  formworkM2: number
  steelKg: number
  intersections: number    // bar crossings to be tied (tie-wire driver)
}
export interface SteelByDia {
  dia: number
  netLengthM: number       // fabricated total
  pieces6m: number         // commercial 6 m bars (continuous spliced + ties nested)
  purchasedM: number
  wasteM: number
  weightKg: number         // purchased weight (what you buy)
}
export interface FormworkResult { areaM2: number; plywoodSheets: number; lumberM: number; uses: number; sheetM2: number }
export interface TieWireResult { intersections: number; netM: number; rolls: number; weightKg: number }
export interface BoqRow { item: string; unit: string; qty: number }

export interface SteelShapeQty { shape: string; kg: number; L: number; kgPerM: number }

/** Timber members aggregated by section size × species (solid-rectangle b×h). */
export interface TimberSizeQty {
  name: string             // section name, e.g. '400×400'
  species: string          // woodSpecies id/label
  kind: string             // 'sawn' | 'glulam'
  count: number            // number of members of this size
  L: number                // total length, m
  m3: number               // volume, m³
  boardFeet: number        // 1 m³ = 423.776 bd·ft
}

export interface TakeoffResult {
  byElement: ElementQty[]
  cutList: CutItem[]
  steelByDia: SteelByDia[]
  concrete: ConcreteMaterials
  formwork: FormworkResult
  tieWire: TieWireResult
  totalSteelNetKg: number                 // fabricated reinforcing steel
  totalSteelPurchasedKg: number           // bought reinforcing (incl. lap/waste)
  totalConcreteM3: number
  boq: BoqRow[]
  slabSteelDDM: boolean                   // slab steel from the DDM strip layout
  structuralSteelKg: number               // W-shape structural steel, net kg
  steelByShape: SteelShapeQty[]           // per W-shape breakdown
  timberM3: number                        // timber (wood-frame) volume, m³
  timberBoardFeet: number                 // = timberM3 × 423.776
  timberBySize: TimberSizeQty[]           // per section-size × species breakdown
}

/** Board feet per cubic metre (1 bd·ft = 1/12 ft³). */
export const BDFT_PER_M3 = 423.776

// ── Pricing — turn the take-off into a costed Bill of Materials ──
export interface PriceList {
  cementBag: number; sandM3: number; gravelM3: number; steelKg: number
  tieWireRoll: number; plywoodSheet: number; lumberM: number
  structuralSteelKg?: number              // W-shape sections, default ₱120/kg
  timberBdFt?: number                     // structural timber, default ₱55 / board foot
}
export interface BillRow {
  item: string; qty: number; unit: string; unitPrice: number; amount: number
  priceKey?: keyof PriceList              // which PriceList key drives the unit price (for editable input)
}
export interface CostedBill { rows: BillRow[]; total: number }

/** Price the take-off aggregates against a unit-price list → line amounts + total. */
export function costBill(t: TakeoffResult, p: PriceList): CostedBill {
  const row = (item: string, qty: number, unit: string, unitPrice: number, priceKey?: keyof PriceList): BillRow =>
    ({ item, qty, unit, unitPrice, amount: qty * unitPrice, priceKey })
  const rows: BillRow[] = [
    row('Cement', t.concrete.cement, 'bag', p.cementBag, 'cementBag'),
    row('Sand', t.concrete.sand, 'm³', p.sandM3, 'sandM3'),
    row('Gravel', t.concrete.gravel, 'm³', p.gravelM3, 'gravelM3'),
    row('Reinforcing steel', t.totalSteelPurchasedKg, 'kg', p.steelKg, 'steelKg'),
    row('Tie wire (#16 G.I.)', t.tieWire.rolls, 'roll', p.tieWireRoll, 'tieWireRoll'),
    row('Formwork — plywood', t.formwork.plywoodSheets, 'sheet', p.plywoodSheet, 'plywoodSheet'),
    row('Formwork — lumber', t.formwork.lumberM, 'lin·m', p.lumberM, 'lumberM'),
  ]
  // Structural steel — one costed line per shape (kg × ₱/kg), so the BOM shows
  // the priced steel sub-total alongside the concrete/rebar items. All shapes
  // share the single editable structuralSteelKg rate (₱/kg).
  const steelRate = p.structuralSteelKg ?? 120
  for (const s of [...t.steelByShape].sort((a, b) => a.shape.localeCompare(b.shape)))
    rows.push(row(`Structural steel — ${s.shape}`, s.kg, 'kg', steelRate, 'structuralSteelKg'))
  // Timber — one costed line per section size, priced per board foot (PH commercial unit).
  rows.push(...costTimberRows(t.timberBySize, p.timberBdFt ?? 55))
  return { rows, total: rows.reduce((s, r) => s + r.amount, 0) }
}

/** Cost a set of timber sizes at ₱/board-foot — shared by the model wood-frame
 *  BOM (costBill) and any standalone timber bill (e.g. the wood slab), so both
 *  price timber identically. */
export function costTimberRows(sizes: TimberSizeQty[], ratePerBdFt = 55): BillRow[] {
  return [...sizes].sort((a, b) => a.name.localeCompare(b.name)).map((t) => ({
    item: `Timber — ${t.name} (${t.species})`, qty: t.boardFeet, unit: 'bd·ft',
    unitPrice: ratePerBdFt, amount: t.boardFeet * ratePerBdFt, priceKey: 'timberBdFt' as const,
  }))
}

export interface TakeoffOptions {
  concreteClass?: ConcreteClass; customFactor?: number
  lapLengthM?: number                     // splice lap deducted from each 6 m bar (default 0.30)
  plywoodSheetM2?: number                 // default 1.2×2.4 = 2.88
  formworkUses?: number                   // plywood re-uses (default 3)
  lumberPerM2?: number                    // lumber lin-m per m² formwork (default 4)
  tieWirePerNodeM?: number                // wire per intersection (default 0.30)
}

export function estimateTakeoff(
  model: StructuralModel, design: StructureDesign, opts: TakeoffOptions = {},
): TakeoffResult {
  const klass = opts.concreteClass ?? 'A'
  const lap = opts.lapLengthM ?? 0.30
  const sheetM2 = opts.plywoodSheetM2 ?? 1.2 * 2.4
  const uses = Math.max(1, opts.formworkUses ?? 3)
  const lumberPerM2 = opts.lumberPerM2 ?? 4
  const wirePerNode = opts.tieWirePerNodeM ?? 0.30

  const secById = new Map(model.sections.map((s) => [s.id, s]))
  const memSecId = new Map(model.members.map((m) => [m.id, m.section]))
  const fallback: RectSection = model.sections[0] ?? { id: '', name: '', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
  const secOf = (memberId: string) => secById.get(memSecId.get(memberId) ?? '') ?? fallback
  const colAtNode = (node: string) => model.members.find((m) => m.role === 'column' && (m.i === node || m.j === node))

  const byElement: ElementQty[] = []
  const cutList: CutItem[] = []
  const add = (element: string, mark: string, dia: number, count: number, cut: number, tie = false): number => {
    if (count <= 0 || cut <= 0 || dia <= 0) return 0
    const totalM = count * cut
    const weightKg = totalM * kgPerM(dia)
    cutList.push({ element, mark, dia, count, cutLengthM: cut, totalM, weightKg, tie })
    return weightKg
  }

  // ── Beams & girders ──
  for (const b of design.beams) {
    const sec = secOf(b.id)
    const L = b.L, db = sec.barDia
    const tag = `${b.role === 'girder' ? 'Girder' : 'Beam'} ${b.id}`
    const concreteM3 = (sec.b / 1000) * (sec.h / 1000) * L
    const formworkM2 = (sec.b / 1000 + 2 * (sec.h / 1000)) * L          // soffit + 2 sides
    const sag = b.sections.filter((s) => !s.hogging)
    const hog = b.sections.filter((s) => s.hogging)
    const nBottom = Math.max(0, ...sag.map((s) => s.design.bars))
    const nTop = Math.max(0, ...hog.map((s) => s.design.bars))
    let steelKg = 0, intersections = 0
    steelKg += add(tag, 'Bottom main', db, nBottom, L + 2 * Ld(db))
    steelKg += add(tag, 'Top main', db, nTop, L + 2 * Ld(db))
    const spac = b.sections.map((s) => s.design.sAdopt).filter((s) => s > 0)
    if (spac.length) {
      const count = Math.ceil(L / (Math.min(...spac) / 1000)) + 1
      steelKg += add(tag, 'Stirrup', sec.tieDia, count, tiePerimeter(sec.b, sec.h, sec.cover, sec.tieDia), true)
      intersections = count * (nTop + nBottom)                          // each stirrup ties the long. bars
    }
    byElement.push({ kind: b.role === 'girder' ? 'Girder' : 'Beam', id: b.id, concreteM3, formworkM2, steelKg, intersections })
  }

  // ── Columns ──
  for (const c of design.columns) {
    const sec = secOf(c.id)
    const H = c.L
    const tag = `Column ${c.id}`
    const concreteM3 = (sec.b / 1000) * (sec.h / 1000) * H
    const formworkM2 = (2 * (sec.b / 1000 + sec.h / 1000)) * H
    let steelKg = 0, intersections = 0
    steelKg += add(tag, 'Vertical', sec.barDia, c.bars, H + Ld(sec.barDia))
    if (c.tieSpacing > 0) {
      const count = Math.ceil(H / (c.tieSpacing / 1000)) + 1
      steelKg += add(tag, 'Tie', sec.tieDia, count, tiePerimeter(sec.b, sec.h, sec.cover, sec.tieDia), true)
      intersections = count * c.bars
    }
    byElement.push({ kind: 'Column', id: c.id, concreteM3, formworkM2, steelKg, intersections })
  }

  // ── Isolated footings ──
  for (const f of design.footings) {
    const cs = (() => { const col = colAtNode(f.node); return col ? secOf(col.id) : fallback })()
    const B = f.design.B, Dc = f.design.Dc / 1000
    const tag = `Footing ${f.node}`
    const steelKg = add(tag, 'Bottom (each way)', cs.barDia, 2 * f.design.bars, Math.max(0.1, B - 0.15))
    byElement.push({
      kind: 'Footing', id: f.node, concreteM3: B * B * Dc, formworkM2: 4 * B * Dc, steelKg,
      intersections: f.design.bars * f.design.bars,
    })
  }

  // ── Combined footings — longitudinal (longSections) + transverse mats ──
  for (const cf of design.combined) {
    const d = cf.design
    const Dc = d.Dc / 1000
    const cs = (() => { const col = colAtNode(cf.nodes[0]); return col ? secOf(col.id) : fallback })()
    const tag = `Combined ftg ${cf.nodes.join('+')}`
    let steelKg = 0
    const nLong = Math.max(0, ...d.longSections.map((s) => s.bars))
    steelKg += add(tag, 'Longitudinal', cs.barDia, nLong, Math.max(0.1, d.Bx - 0.15))
    const tspac = d.transverse[0]?.spacing ?? 0
    const nTrans = tspac > 0 ? Math.ceil(d.Bx / tspac) + 1 : 0
    steelKg += add(tag, 'Transverse', cs.barDia, nTrans, Math.max(0.1, d.By - 0.15))
    byElement.push({
      kind: 'Combined footing', id: cf.nodes.join('+'),
      concreteM3: d.Bx * d.By * Dc, formworkM2: 2 * (d.Bx + d.By) * Dc, steelKg,
      intersections: nLong * nTrans,
    })
  }

  // ── Slabs — DDM column/middle-strip layout (per location, both directions) ──
  let slabSteelDDM = false
  for (const sl of design.slabs) {
    const dd = sl.design
    const tag = `Slab ${sl.plate}`
    const concreteM3 = sl.lx * sl.ly * (dd.h / 1000)
    let steelKg = 0
    const bottomBarsOf: number[] = []
    for (const dir of [dd.x, dd.y]) {
      const span = dir.l1, label = dir.dir.toUpperCase()
      for (const loc of dir.locations) {
        const bars = loc.column.bars + loc.middle.bars
        if (bars <= 0) continue
        if (loc.name === '+M') {
          bottomBarsOf.push(bars)
          steelKg += add(tag, `Bottom +M (${label})`, SLAB_BAR, bars, span)        // full-span bottom mat
        } else {
          steelKg += add(tag, `Top ${loc.name} (${label})`, SLAB_BAR, bars, 0.3 * dir.ln) // cutoff over support
        }
      }
    }
    slabSteelDDM = true
    byElement.push({
      kind: 'Slab', id: sl.plate, concreteM3, formworkM2: sl.lx * sl.ly, steelKg,
      intersections: (bottomBarsOf[0] ?? 0) * (bottomBarsOf[1] ?? 0),
    })
  }

  // ── Walls (concrete + formwork; in-plane reinforcement in the schedule) ──
  for (const w of design.walls) {
    const t = w.thickness / 1000
    byElement.push({
      kind: 'Wall', id: w.id, concreteM3: w.lw * w.hw * t, formworkM2: 2 * w.lw * w.hw, steelKg: 0, intersections: 0,
    })
  }

  // ── Commercial steel by Ø: continuous bars spliced, ties nested ──
  const usable = Math.max(0.5, BAR_LENGTH - lap)
  const cont = new Map<number, number>()                 // dia → net continuous length
  const tiePieces = new Map<number, number>()            // dia → nested 6 m pieces
  const tieNet = new Map<number, number>()
  for (const c of cutList) {
    if (c.tie) {
      const cutsPer6m = Math.max(1, Math.floor(BAR_LENGTH / c.cutLengthM))
      tiePieces.set(c.dia, (tiePieces.get(c.dia) ?? 0) + Math.ceil(c.count / cutsPer6m))
      tieNet.set(c.dia, (tieNet.get(c.dia) ?? 0) + c.totalM)
    } else {
      cont.set(c.dia, (cont.get(c.dia) ?? 0) + c.totalM)
    }
  }
  const dias = [...new Set([...cont.keys(), ...tiePieces.keys()])].sort((a, b) => a - b)
  const steelByDia: SteelByDia[] = dias.map((dia) => {
    const netCont = cont.get(dia) ?? 0
    const netTie = tieNet.get(dia) ?? 0
    const piecesCont = netCont > 0 ? Math.ceil(netCont / usable) : 0
    const pieces6m = piecesCont + (tiePieces.get(dia) ?? 0)
    const purchasedM = pieces6m * BAR_LENGTH
    const netLengthM = netCont + netTie
    return { dia, netLengthM, pieces6m, purchasedM, wasteM: purchasedM - netLengthM, weightKg: purchasedM * kgPerM(dia) }
  })

  // ── Aggregates ──
  const totalConcreteM3 = byElement.reduce((s, e) => s + e.concreteM3, 0)
  const formworkArea = byElement.reduce((s, e) => s + e.formworkM2, 0)
  const totalSteelNetKg = cutList.reduce((s, c) => s + c.weightKg, 0)
  const totalSteelPurchasedKg = steelByDia.reduce((s, d) => s + d.weightKg, 0)
  const concrete = concreteMaterials(totalConcreteM3, klass, opts.customFactor)

  const formwork: FormworkResult = {
    areaM2: formworkArea,
    plywoodSheets: Math.ceil(formworkArea / (sheetM2 * uses)),
    lumberM: formworkArea * lumberPerM2,
    uses, sheetM2,
  }

  const totalIntersections = byElement.reduce((s, e) => s + e.intersections, 0)
  const wireNet = totalIntersections * wirePerNode
  const tieWire: TieWireResult = {
    intersections: totalIntersections, netM: wireNet,
    rolls: Math.ceil(wireNet / TIE_WIRE_ROLL), weightKg: wireNet * GI_WIRE_KG_PER_M,
  }

  // BOQ — work items per element kind
  const kinds = [...new Set(byElement.map((e) => e.kind))]
  const boq: BoqRow[] = []
  for (const k of kinds) {
    const es = byElement.filter((e) => e.kind === k)
    boq.push({ item: `${k} — concrete`, unit: 'm³', qty: es.reduce((s, e) => s + e.concreteM3, 0) })
    boq.push({ item: `${k} — formwork`, unit: 'm²', qty: es.reduce((s, e) => s + e.formworkM2, 0) })
    const sk = es.reduce((s, e) => s + e.steelKg, 0)
    if (sk > 0) boq.push({ item: `${k} — reinforcing steel`, unit: 'kg', qty: sk })
  }

  // ── Structural steel members (W-shapes) ──
  const nodeXYZ = new Map(model.nodes.map((n) => [n.id, n]))
  const shapeMap = new Map<string, { kg: number; L: number; kgPerM: number }>()
  let structuralSteelKg = 0
  for (const mem of model.members) {
    const sec = secById.get(memSecId.get(mem.id) ?? '')
    if (sec?.material !== 'steel' || !sec.shape) continue
    const shape = shapeByName(sec.shape); if (!shape) continue
    const ni = nodeXYZ.get(mem.i), nj = nodeXYZ.get(mem.j); if (!ni || !nj) continue
    const L = Math.hypot(nj.x - ni.x, nj.y - ni.y, nj.z - ni.z)
    const wKgM = (shape.A / 1e6) * STEEL_DENSITY        // unit weight, kg/m (ρ·A)
    const kg = wKgM * L
    structuralSteelKg += kg
    const prev = shapeMap.get(sec.shape) ?? { kg: 0, L: 0, kgPerM: wKgM }
    shapeMap.set(sec.shape, { kg: prev.kg + kg, L: prev.L + L, kgPerM: wKgM })
    boq.push({ item: `Structural steel — ${sec.shape}`, unit: 'm', qty: L })
  }

  // ── Timber members (wood frame): volume + board feet by section size × species ──
  const timberMap = new Map<string, TimberSizeQty>()
  let timberM3 = 0
  for (const mem of model.members) {
    const sec = secById.get(memSecId.get(mem.id) ?? '')
    if (sec?.material !== 'wood') continue
    const ni = nodeXYZ.get(mem.i), nj = nodeXYZ.get(mem.j); if (!ni || !nj) continue
    const L = Math.hypot(nj.x - ni.x, nj.y - ni.y, nj.z - ni.z)
    const vol = (sec.b / 1000) * (sec.h / 1000) * L
    timberM3 += vol
    const species = sec.woodSpecies ?? '—', kind = sec.woodKind ?? 'sawn'
    const key = `${sec.name}|${species}|${kind}`
    const prev = timberMap.get(key) ?? { name: sec.name, species, kind, count: 0, L: 0, m3: 0, boardFeet: 0 }
    timberMap.set(key, { ...prev, count: prev.count + 1, L: prev.L + L, m3: prev.m3 + vol, boardFeet: prev.boardFeet + vol * BDFT_PER_M3 })
  }
  const timberBySize = [...timberMap.values()]
  const timberBoardFeet = timberM3 * BDFT_PER_M3
  for (const t of timberBySize) boq.push({ item: `Timber — ${t.name} (${t.species})`, unit: 'm³', qty: t.m3 })
  // consolidate duplicate BOQ shape entries
  const shapeBoq = new Map<string, number>()
  for (const r of boq.filter((r) => r.item.startsWith('Structural steel — '))) {
    shapeBoq.set(r.item, (shapeBoq.get(r.item) ?? 0) + r.qty)
  }
  const boqFinal = [
    ...boq.filter((r) => !r.item.startsWith('Structural steel — ')),
    ...[...shapeBoq.entries()].map(([item, qty]) => ({ item, unit: 'm', qty })),
  ]

  return {
    byElement, cutList, steelByDia, concrete, formwork, tieWire,
    totalSteelNetKg, totalSteelPurchasedKg, totalConcreteM3, boq: boqFinal, slabSteelDDM,
    structuralSteelKg,
    steelByShape: [...shapeMap.entries()].map(([shape, v]) => ({ shape, ...v })),
    timberM3, timberBoardFeet, timberBySize,
  }
}
