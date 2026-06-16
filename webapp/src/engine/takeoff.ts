// ─────────────────────────────────────────────────────────────────────────
// Quantity take-off / BOM-BOQ for a designed 3D structure. Consumes the model
// geometry + the StructureDesign schedules and produces, per element:
//   · concrete volume (m³) and formwork (m²)
//   · a reinforcement CUT LIST (per-piece cut length, count, weight) built with
//     standard detailing allowances, and
//   · aggregates: steel by bar Ø, total concrete materials (cement/sand/gravel
//     by NSCP mix class) → a Bill of Materials, plus a Bill of Quantities table.
// Reuses the material-estimation solvers in quantities.ts (concreteMaterials).
//
// Detailing assumptions (documented, editable): straight-bar end allowance =
// Ld = 40·db (tension lap/anchorage); stirrup/tie hook allowance = 2·max(6·dt,
// 75 mm); footing bars straight (cover only); slab steel from a bottom+top mat
// at the positive-moment spacing (APPROXIMATE — flagged in the result).
// Units: lengths m, Ø mm, steel kg (ρ = 7850 kg/m³).
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, RectSection } from './model'
import type { StructureDesign } from './pipeline'
import { concreteMaterials, type ConcreteClass, type ConcreteMaterials } from './quantities'

const STEEL_DENSITY = 7850            // kg/m³
const BAR_LENGTH = 6                  // m, commercial length
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
  weightKg: number
}
export interface ElementQty {
  kind: 'Beam' | 'Girder' | 'Column' | 'Footing' | 'Combined footing' | 'Slab' | 'Wall'
  id: string
  concreteM3: number
  formworkM2: number
  steelKg: number
}
export interface SteelByDia { dia: number; lengthM: number; weightKg: number; pieces6m: number }
export interface BoqRow { item: string; unit: string; qty: number }

export interface TakeoffResult {
  byElement: ElementQty[]
  cutList: CutItem[]
  steelByDia: SteelByDia[]
  concrete: ConcreteMaterials             // totals for the whole structure
  formworkM2: number
  totalSteelKg: number
  totalConcreteM3: number
  boq: BoqRow[]
  slabSteelApprox: boolean                // true when any slab steel was estimated
}

export interface TakeoffOptions { concreteClass?: ConcreteClass; customFactor?: number }

export function estimateTakeoff(
  model: StructuralModel, design: StructureDesign, opts: TakeoffOptions = {},
): TakeoffResult {
  const klass = opts.concreteClass ?? 'A'
  const secById = new Map(model.sections.map((s) => [s.id, s]))
  const memSecId = new Map(model.members.map((m) => [m.id, m.section]))
  const fallback: RectSection = model.sections[0] ?? { id: '', name: '', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
  const secOf = (memberId: string) => secById.get(memSecId.get(memberId) ?? '') ?? fallback
  const colAtNode = (node: string) => model.members.find((m) => m.role === 'column' && (m.i === node || m.j === node))

  const byElement: ElementQty[] = []
  const cutList: CutItem[] = []
  const add = (element: string, mark: string, dia: number, count: number, cut: number): number => {
    if (count <= 0 || cut <= 0 || dia <= 0) return 0
    const totalM = count * cut
    const weightKg = totalM * kgPerM(dia)
    cutList.push({ element, mark, dia, count, cutLengthM: cut, totalM, weightKg })
    return weightKg
  }

  // ── Beams & girders ──
  for (const b of design.beams) {
    const sec = secOf(b.id)
    const L = b.L
    const db = sec.barDia
    const tag = `${b.role === 'girder' ? 'Girder' : 'Beam'} ${b.id}`
    const concreteM3 = (sec.b / 1000) * (sec.h / 1000) * L
    const formworkM2 = (sec.b / 1000 + 2 * (sec.h / 1000)) * L          // soffit + 2 sides (top with slab)
    const sag = b.sections.filter((s) => !s.hogging)
    const hog = b.sections.filter((s) => s.hogging)
    const nBottom = Math.max(0, ...sag.map((s) => s.design.bars))
    const nTop = Math.max(0, ...hog.map((s) => s.design.bars))
    let steelKg = 0
    steelKg += add(tag, 'Bottom main', db, nBottom, L + 2 * Ld(db))
    steelKg += add(tag, 'Top main', db, nTop, L + 2 * Ld(db))
    // stirrups: governing (closest) adopted spacing across the member
    const spac = b.sections.map((s) => s.design.sAdopt).filter((s) => s > 0)
    if (spac.length) {
      const s = Math.min(...spac) / 1000
      const count = Math.ceil(L / s) + 1
      steelKg += add(tag, 'Stirrup', sec.tieDia, count, tiePerimeter(sec.b, sec.h, sec.cover, sec.tieDia))
    }
    byElement.push({ kind: b.role === 'girder' ? 'Girder' : 'Beam', id: b.id, concreteM3, formworkM2, steelKg })
  }

  // ── Columns ──
  for (const c of design.columns) {
    const sec = secOf(c.id)
    const H = c.L
    const tag = `Column ${c.id}`
    const concreteM3 = (sec.b / 1000) * (sec.h / 1000) * H
    const formworkM2 = (2 * (sec.b / 1000 + sec.h / 1000)) * H
    let steelKg = 0
    steelKg += add(tag, 'Vertical', sec.barDia, c.bars, H + Ld(sec.barDia))     // + splice lap at floor
    if (c.tieSpacing > 0) {
      const count = Math.ceil(H / (c.tieSpacing / 1000)) + 1
      steelKg += add(tag, 'Tie', sec.tieDia, count, tiePerimeter(sec.b, sec.h, sec.cover, sec.tieDia))
    }
    byElement.push({ kind: 'Column', id: c.id, concreteM3, formworkM2, steelKg })
  }

  // ── Isolated footings ──
  for (const f of design.footings) {
    const cs = (() => { const col = colAtNode(f.node); return col ? secOf(col.id) : fallback })()
    const B = f.design.B, Dc = f.design.Dc / 1000
    const tag = `Footing ${f.node}`
    const concreteM3 = B * B * Dc
    const formworkM2 = 4 * B * Dc
    // bars each way, straight, cover 75 mm
    const steelKg = add(tag, 'Bottom (each way)', cs.barDia, 2 * f.design.bars, Math.max(0.1, B - 0.15))
    byElement.push({ kind: 'Footing', id: f.node, concreteM3, formworkM2, steelKg })
  }

  // ── Combined footings (concrete + formwork; reinforcement in the schedule) ──
  for (const cf of design.combined) {
    const d = cf.design
    const Dc = d.Dc / 1000
    byElement.push({
      kind: 'Combined footing', id: cf.nodes.join('+'),
      concreteM3: d.Bx * d.By * Dc, formworkM2: 2 * (d.Bx + d.By) * Dc, steelKg: 0,
    })
  }

  // ── Slabs (steel APPROXIMATE: bottom + top mats at the +M spacing) ──
  let slabSteelApprox = false
  for (const sl of design.slabs) {
    const dd = sl.design
    const lx = sl.lx, ly = sl.ly
    const concreteM3 = lx * ly * (dd.h / 1000)
    const formworkM2 = lx * ly                                   // soffit
    const posSpacing = (dir: typeof dd.x) => {
      const pos = dir.locations.find((l) => l.name === '+M') ?? dir.locations[dir.locations.length - 1]
      return Math.max(50, pos.column.spacing)                    // mm
    }
    const sX = posSpacing(dd.x), sY = posSpacing(dd.y)
    // bars in X run the lx span, distributed along ly at spacing sY (and vice-versa)
    const nX = Math.ceil((ly * 1000) / sY) + 1
    const nY = Math.ceil((lx * 1000) / sX) + 1
    const tag = `Slab ${sl.plate}`
    let steelKg = 0
    // bottom mat (full) + top mat over continuity (~half) → 1.5× the bottom mat
    steelKg += add(tag, 'Bottom mat — X', 12, nX, lx)
    steelKg += add(tag, 'Bottom mat — Y', 12, nY, ly)
    steelKg += add(tag, 'Top mat — X (approx)', 12, Math.ceil(nX / 2), lx)
    steelKg += add(tag, 'Top mat — Y (approx)', 12, Math.ceil(nY / 2), ly)
    slabSteelApprox = true
    byElement.push({ kind: 'Slab', id: sl.plate, concreteM3, formworkM2, steelKg })
  }

  // ── Walls (concrete + formwork from the panel; reinforcement via design ρ) ──
  for (const w of design.walls) {
    const t = w.thickness / 1000
    const concreteM3 = w.lw * w.hw * t
    const formworkM2 = 2 * w.lw * w.hw
    byElement.push({ kind: 'Wall', id: w.id, concreteM3, formworkM2, steelKg: 0 })
  }

  // ── Aggregates ──
  const totalConcreteM3 = byElement.reduce((s, e) => s + e.concreteM3, 0)
  const formworkM2 = byElement.reduce((s, e) => s + e.formworkM2, 0)
  const totalSteelKg = cutList.reduce((s, c) => s + c.weightKg, 0)
  const concrete = concreteMaterials(totalConcreteM3, klass, opts.customFactor)

  const diaMap = new Map<number, { lengthM: number; weightKg: number }>()
  for (const c of cutList) {
    const e = diaMap.get(c.dia) ?? { lengthM: 0, weightKg: 0 }
    e.lengthM += c.totalM; e.weightKg += c.weightKg
    diaMap.set(c.dia, e)
  }
  const steelByDia: SteelByDia[] = [...diaMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dia, v]) => ({ dia, lengthM: v.lengthM, weightKg: v.weightKg, pieces6m: Math.ceil(v.lengthM / BAR_LENGTH) }))

  // BOQ — work items with quantities (concrete/formwork/steel per element kind)
  const kinds = [...new Set(byElement.map((e) => e.kind))]
  const boq: BoqRow[] = []
  for (const k of kinds) {
    const es = byElement.filter((e) => e.kind === k)
    boq.push({ item: `${k} — concrete`, unit: 'm³', qty: es.reduce((s, e) => s + e.concreteM3, 0) })
    boq.push({ item: `${k} — formwork`, unit: 'm²', qty: es.reduce((s, e) => s + e.formworkM2, 0) })
    const sk = es.reduce((s, e) => s + e.steelKg, 0)
    if (sk > 0) boq.push({ item: `${k} — reinforcing steel`, unit: 'kg', qty: sk })
  }

  return {
    byElement, cutList, steelByDia, concrete, formworkM2,
    totalSteelKg, totalConcreteM3, boq, slabSteelApprox,
  }
}
