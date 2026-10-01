// ─────────────────────────────────────────────────────────────────────────
// THE SHEET SET — every drawing the Plans tab shows, built once.
//
// The tab and the PDF report were about to grow two copies of the same list:
// the tab built its sheets in a handful of `useMemo`s and the report would have
// rebuilt them from the same bundlers with its own options. Two copies of "what
// is on the drawings" drift, and the one nobody looks at drifts first — the
// report.
//
// So the set is assembled HERE, once, as typed `Drawing`s. The tab serialises
// them with `planToSvg`; the report paints the same objects with `paintDrawing`.
// Neither can show a sheet the other does not have.
//
// Pure and synchronous: no jsPDF, no DOM, no React.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel } from '../engine/model'
import type { StructureDesign } from '../engine/pipeline'
import type { Drawing } from '../engine/planRenderer'
import { buildPlan } from '../engine/planRenderer'
import { buildFootingDetail } from '../engine/footingDetail'
import { buildColumnStackDetail } from '../engine/columnStackDetail'
import { buildSlabOpeningDetail } from '../engine/slabOpening'
import { buildWallCornerDetail, buildWallIntersectionDetail, buildWallJointDetail } from '../engine/wallDetail'
import { buildGeneralNotes, GENERAL_NOTES_REF, type GeneralNotesInput, type FrameMaterials } from '../engine/generalNotes'
import { getWoodRef } from '../engine/woodDesign'
import { FOOTING_COVER } from '../engine/cageBuilder'

/** §420.6.1.3.1 — clear cover to slab steel not exposed to earth, mm. This is
 *  what `slabDDM` details to; the model carries no per-slab cover. */
const SLAB_COVER = 20
import {
  footingsForPlan, footingDetailBundles,
  slabOpeningBundles, wallDetailBundles, frameElevationBundles,
  columnStackBundles, isRcSection,
  type SoilInput,
} from './planDetails'
import { buildFrameElevation } from '../engine/frameElevation'
import { buildStructureCages } from '../engine/cageBuilder'
import { buildSteelSectionDetail } from '../engine/steelSection'
import { steelScheduleDrawings, timberScheduleDrawings } from './frameSchedules'

export type SheetGroup =
  | 'General notes'
  | 'Plans' | 'Column details' | 'Footing details'
  | 'Slab opening details' | 'Wall standard details'
  | 'Frame elevations'
  | 'Steel schedules' | 'Steel sections' | 'Timber schedules'

export interface PlanSheet {
  /** Stable identity — also the SVG download file stem. */
  key: string
  group: SheetGroup
  title: string
  /** Sizes and marks, where the sheet has a one-line description. */
  subtitle?: string
  /** Problems the underlying design reported, if any. Empty ⇔ nothing to flag. */
  warnings: string[]
  drawing: Drawing
}

export interface SheetSetOptions {
  /** Draw 90° end hooks on the footing mat bars. */
  hookedMatBars?: boolean
  /** Width the drawings are laid out for, px — only affects nothing here, but
   *  keeps the caller's intent in one place. */
  sheetRefs?: Partial<Record<SheetGroup, string>>
}

const FLOOR_ORD = ['Ground', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth']
/** Framed-level ordinal (1 = first floor above the base) → floor name. */
export function floorName(k: number): string { return `${FLOOR_ORD[k - 1] ?? `${k}th`} Floor` }

const REF: Record<SheetGroup, string> = {
  'General notes': GENERAL_NOTES_REF,
  'Plans': 'S-03',
  'Footing details': 'S-05',
  'Column details': 'S-06',
  'Frame elevations': 'S-04',
  'Slab opening details': 'S-08',
  'Wall standard details': 'S-09',
  'Steel schedules': 'S-07',
  'Steel sections': 'S-10',
  'Timber schedules': 'S-07',
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/**
 * Every framing plan, one per framed floor, named by floor.
 *
 * Kept separate from the details because it needs only the model — a model that
 * has not been designed yet still has plans, and the tab shows them.
 */
export function planSheets(model: StructuralModel, design: StructureDesign | null, soil: SoilInput = {}): PlanSheet[] {
  const out: PlanSheet[] = []
  const ys = [...new Set(model.nodes.map((n) => Math.round(n.y * 100) / 100))].sort((a, b) => a - b)
  const floors = ys.slice(1)                       // skip the base (foundation)
  const idxs = floors.length ? floors.map((_, i) => i + 1) : [1]
  idxs.forEach((level, i) => {
    const name = floorName(level)
    const d = buildPlan(model, {
      kind: 'framing', level, detailNo: '1', sheetRef: `S-${3 + i}`,
      title: `${name} FRAMING PLAN`.toUpperCase(),
    })
    if (!d) return
    out.push({ key: `framing-${slug(name)}`, group: 'Plans', title: `${name} framing plan`, warnings: [], drawing: d })
  })

  if (design) {
    const d = buildPlan(model, {
      kind: 'foundation', detailNo: '1', sheetRef: 'S-02',
      footings: footingsForPlan(design),
      foundingElev: soil.H != null ? -Math.abs(soil.H) : undefined,
    })
    // A steel or timber column's footing sheet draws its RC pedestal and the
    // plate on it (planDetails). One with no pedestal designed under it has no
    // true sheet to draw; say so rather than let the gap pass for an oversight.
    const secById = new Map(model.sections.map((sc) => [sc.id, sc]))
    const peds = new Set((design.pedestals ?? []).map((p) => p.node))
    const bare = design.footings.filter((f) => {
      const col = model.members.find((m) => m.role === 'column' && (m.i === f.node || m.j === f.node))
      return col && !isRcSection(secById.get(col.section)) && !peds.has(f.node)
    })
    const warnings = bare.length
      ? [`No pedestal was designed under the steel/timber column at ${bare.map((f) => f.node).join(', ')}, so its footing detail is not drawn. The footing schedule on this plan still applies.`]
      : []
    if (d) out.push({
      key: 'foundation-plan', group: 'Plans', title: 'Foundation plan', warnings, drawing: d,
      ...(bare.length ? { subtitle: `${bare.length} footing detail${bare.length > 1 ? 's' : ''} not drawn` } : {}),
    })
  }
  return out
}

/** Every detail sheet, in the order the tab lists them. */
export function detailSheets(model: StructuralModel, design: StructureDesign, soil: SoilInput = {}, opts: SheetSetOptions = {}): PlanSheet[] {
  const out: PlanSheet[] = []
  const ref = (g: SheetGroup) => opts.sheetRefs?.[g] ?? REF[g]

  // FRAME ELEVATIONS come before the per-member details: they are the sheets
  // that show a member in its frame, and the typical details that follow are
  // read against them. Every bar on them is the cage's own — the same objects
  // the 3D scene paints and the bar schedule counts.
  // Built with the sheet set's own detailing options, so the mat bars the
  // footing sheet draws are the mat bars its cage has.
  const { cages } = buildStructureCages(model, design, { hookedMatBars: opts.hookedMatBars })
  frameElevationBundles(model, design, cages).forEach((b, i) => {
    const drawing = buildFrameElevation(b.input, {
      detailNo: String(i + 1), sheetRef: ref('Frame elevations'), project: model.name,
    })
    out.push({
      key: b.key, group: 'Frame elevations',
      title: `Grid ${b.line} — ${b.level}`,
      subtitle: `${b.input.members.filter((m) => m.role === 'beam').length} beams, ${b.input.grids.length} columns`,
      warnings: drawing.designNotes,
      drawing,
    })
  })


  // ONE SHEET PER COLUMN, footing to top — not one per column TYPE.
  //
  // What was here deduplicated by section and tie schedule and drew a single
  // storey of it, so a twelve-storey building printed three sheets and none of
  // them was a column anybody could point at. A column starts on a footing and
  // ends at a roof; its section steps, its bars crank where it does, and its
  // splices and confinement change at every floor. That is all about the whole
  // stack, and a one-storey typical detail is the drawing that cannot show it.
  columnStackBundles(model, design, cages).forEach((b, i) => {
    const drawing = buildColumnStackDetail(b.input, {
      detailNo: String(i + 1), sheetRef: ref('Column details'), project: model.name,
    })
    const top = b.input.segments[b.input.segments.length - 1]!
    out.push({
      key: b.key, group: 'Column details',
      title: `${b.mark} — grid ${b.grid}`,
      subtitle: `${b.input.segments.length} storey${b.input.segments.length === 1 ? '' : 's'} · ${Math.round(top.face)}×${Math.round(top.depth)} · ${top.bars}-⌀${top.barDia}`,
      warnings: drawing.designNotes,
      drawing,
    })
  })

  // Steel and timber members are built from schedules, not bar details.
  for (const s of steelScheduleDrawings(design, model))
    out.push({ key: s.key, group: 'Steel schedules', title: s.title, warnings: [], drawing: s.drawing })
  // One section sheet per shape the frame uses — a rolled shape IS its type,
  // so the shape name is the mark the schedules already print.
  const shapesUsed = [...new Set([...design.steelBeams, ...design.steelColumns].map((r) => r.shape))].sort()
  shapesUsed.forEach((name, i) => {
    const d = buildSteelSectionDetail(name, { detailNo: String(i + 1), sheetRef: ref('Steel sections') })
    if (d) out.push({ key: `steel-section-${slug(name)}`, group: 'Steel sections', title: name, subtitle: `${d.shape.family} · A ${Math.round(d.shape.A)} mm²`, warnings: [], drawing: d })
  })
  for (const s of timberScheduleDrawings(model, design))
    out.push({ key: s.key, group: 'Timber schedules', title: s.title, warnings: [], drawing: s.drawing })

  footingDetailBundles(model, design, soil, cages).forEach((b, i) => {
    out.push({
      key: `footing-detail-${slug(b.mark)}${b.detail.bearing?.mark ? `-${slug(b.detail.bearing.mark)}` : ''}`, group: 'Footing details',
      title: `${b.mark}${b.detail.bearing?.mark ? ` / ${b.detail.bearing.mark}` : ''} — ${Math.round(b.detail.B * 1000)}×${Math.round(b.detail.B * 1000)}`,
      subtitle: `${Math.round(b.detail.H * 1000)} thk${b.detail.bearing ? ` · ${b.detail.colB} sq. pedestal` : ''}`,
      warnings: [],
      drawing: buildFootingDetail(
        { ...b.detail, endHook: opts.hookedMatBars ? '90' : 'none' },
        { detailNo: String(i + 1), sheetRef: ref('Footing details') },
      ),
    })
  })

  slabOpeningBundles(model, design).forEach((b, i) => {
    const d = buildSlabOpeningDetail(b.detail, { detailNo: String(i + 1), sheetRef: ref('Slab opening details') })
    const w = Math.round((d.result.box.x1 - d.result.box.x0) * 1000)
    const h = Math.round((d.result.box.y1 - d.result.box.y0) * 1000)
    out.push({
      key: `slab-opening-${slug(b.mark)}`, group: 'Slab opening details',
      title: `${b.mark} — ${w}×${h} opening`,
      subtitle: `${d.result.x.eachSide}-⌀${b.detail.barDia} + ${d.result.y.eachSide}-⌀${b.detail.barDia} ea. side`,
      warnings: d.designNotes,
      drawing: d,
    })
  })

  wallDetailBundles(design).forEach((b, i) => {
    const sheets = [
      buildWallCornerDetail(b.detail, { detailNo: String(3 * i + 1), sheetRef: ref('Wall standard details') }),
      buildWallIntersectionDetail(b.detail, { detailNo: String(3 * i + 2), sheetRef: ref('Wall standard details') }),
      buildWallJointDetail(b.detail, { detailNo: String(3 * i + 3), sheetRef: ref('Wall standard details') }),
    ]
    const sub = `${Math.round(b.detail.t)} thk · ⌀${b.detail.barDia} @ ${Math.round(b.detail.spacing)} horiz / ${Math.round(b.detail.vertSpacing ?? b.detail.spacing)} vert`
    for (const d of sheets) {
      out.push({
        key: slug(d.title), group: 'Wall standard details',
        title: d.title, subtitle: sub,
        // Only the sheet that owns a problem carries it: the corner sheet is not
        // the place to raise a construction-joint shortfall.
        warnings: d.result.notes,
        drawing: d,
      })
    }
  })

  return out
}

/**
 * The GENERAL NOTES sheet — the rules, once, on the first sheet.
 *
 * Its inputs are read off the model rather than typed: the cover, bar sizes and
 * material strengths the schedule of measures quotes are the ones the job
 * actually uses, so a table row can never describe a bar nobody detailed.
 */
/** What the model's members and floors are made of, as the notes need it. */
export function frameMaterials(model: StructuralModel): FrameMaterials {
  const secById = new Map(model.sections.map((sc) => [sc.id, sc]))
  const used = [...new Set(model.members.map((m) => m.section))].map((id) => secById.get(id)).filter((sc) => sc != null)
  const steel = used.filter((sc) => sc.material === 'steel')
  const wood = used.filter((sc) => sc.material === 'wood')
  const decks = model.plates.filter((p) => p.role !== 'wall' && p.deck)
  const uniq = <T,>(xs: T[]) => [...new Set(xs)]
  const gradeLabel = (id: string | undefined) => (id ? getWoodRef(id)?.label ?? id : 'custom material')
  const grades = uniq([...wood.map((sc) => gradeLabel(sc.woodSpecies)), ...decks.map((p) => gradeLabel(p.deck!.joistSpecies))])
  return {
    rc: used.some(isRcSection),
    rcSlabs: model.plates.some((p) => p.role !== 'wall' && !p.deck),
    ...(steel.length ? { steel: { Fy: uniq(steel.map((sc) => sc.steelFy ?? 345)), Fu: uniq(steel.map((sc) => sc.steelFu ?? 448)) } } : {}),
    ...(grades.length ? { timber: { grades, wet: wood.some((sc) => sc.woodWet) || decks.some((p) => p.deck!.wet) } } : {}),
  }
}

export function generalNotesSheet(model: StructuralModel, design?: StructureDesign | null): PlanSheet {
  const frame = frameMaterials(model)
  // Only REINFORCED CONCRETE sections carry bars. A steel or timber section
  // still holds the concrete defaults it was generated with, and quoting them
  // would put a ⌀20 in the schedule of measures that nothing on the job uses.
  const rcSecs = model.sections.filter((sc) => isRcSection(sc))
  const secs = rcSecs as Partial<Record<keyof GeneralNotesInput, never>> &
    { fc?: number; fy?: number; barDia?: number; tieDia?: number; cover?: number; role?: string }[]
  const num = (pick: (s: typeof secs[number]) => number | undefined) =>
    [...new Set(secs.map(pick).filter((v): v is number => typeof v === 'number' && v > 0))]
  const covers = num((s) => s.cover)
  // One cover per member kind. The model carries a cover per SECTION, not per
  // role, so the beam/column figure is what the sections say and the slab and
  // footing figures are the code minima this app details to.
  const cover = {
    beam: Math.min(...covers, 40), column: Math.max(...covers, 40),
    slab: SLAB_COVER, footing: FOOTING_COVER,
  }
  // The footing mat is RC whatever the frame is, so its bars are always quoted.
  const footBars = (design?.footings ?? []).map((f) => f.barDia).filter((d) => d > 0)
  const concrete = model.sections.map((sc) => sc.fc).filter((v) => v > 0)
  const rebarFy = model.sections.map((sc) => sc.fy).filter((v) => v > 0)
  const i: GeneralNotesInput = {
    fc: frame.rc ? num((s) => s.fc) : [...new Set(concrete)],
    fy: frame.rc ? num((s) => s.fy) : [...new Set(rebarFy)],
    barDias: [...new Set([...num((s) => s.barDia), ...footBars])], tieDias: num((s) => s.tieDia),
    cover, seismic: true, frame,
  }
  return {
    key: 'general-notes', group: 'General notes', title: 'General structural notes',
    subtitle: 'materials, cover, bends, laps, and the construction hold points',
    warnings: [],
    // The ref is NOT overridable: every detail sheet carries a line pointing
    // at it by name, and a set where the pointer and the sheet disagree is
    // worse than one with no pointer at all.
    drawing: buildGeneralNotes(i, { detailNo: '1', sheetRef: GENERAL_NOTES_REF, project: model.name }),
  }
}

/** Notes, then plans, then details — the whole set, in sheet order. */
export function buildSheetSet(model: StructuralModel, design: StructureDesign | null, soil: SoilInput = {}, opts: SheetSetOptions = {}): PlanSheet[] {
  return [
    generalNotesSheet(model, design),
    ...planSheets(model, design, soil),
    ...(design ? detailSheets(model, design, soil, opts) : []),
  ]
}

/** The set grouped for display, preserving sheet order within each group. */
export function groupSheets(sheets: PlanSheet[]): { group: SheetGroup; sheets: PlanSheet[] }[] {
  const out: { group: SheetGroup; sheets: PlanSheet[] }[] = []
  for (const s of sheets) {
    let g = out.find((x) => x.group === s.group)
    if (!g) { g = { group: s.group, sheets: [] }; out.push(g) }
    g.sheets.push(s)
  }
  return out
}

/** One step through the set, clamped to it. The ends are walls, not a
 *  carousel: wrapping from the last wall detail back to General notes would
 *  put a sheet nobody asked for on the screen. Lives here with the set itself,
 *  so the fullscreen viewer and any future caller step the same way. */
export function stepIndex(index: number, count: number, delta: -1 | 1): number {
  return Math.min(count - 1, Math.max(0, index + delta))
}
