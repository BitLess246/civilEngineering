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
import { buildColumnDetail } from '../engine/columnDetail'
import { buildBeamDetail } from '../engine/beamDetail'
import { buildSlabOpeningDetail } from '../engine/slabOpening'
import { buildWallCornerDetail, buildWallIntersectionDetail, buildWallJointDetail } from '../engine/wallDetail'
import { buildBeamColumnJointDetail } from '../engine/beamColumnJoint'
import { buildGeneralNotes, GENERAL_NOTES_REF, type GeneralNotesInput } from '../engine/generalNotes'
import { FOOTING_COVER } from '../engine/cageBuilder'

/** §420.6.1.3.1 — clear cover to slab steel not exposed to earth, mm. This is
 *  what `slabDDM` details to; the model carries no per-slab cover. */
const SLAB_COVER = 20
import {
  footingsForPlan, footingDetailBundles, columnDetailBundles, beamDetailBundles,
  slabOpeningBundles, wallDetailBundles, jointDetailBundles, type SoilInput,
} from './planDetails'

export type SheetGroup =
  | 'General notes'
  | 'Plans' | 'Beam details' | 'Column details' | 'Footing details'
  | 'Slab opening details' | 'Wall standard details' | 'Beam–column joint details'

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
  'Beam details': 'S-07',
  'Slab opening details': 'S-08',
  'Wall standard details': 'S-09',
  'Beam–column joint details': 'S-10',
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
    if (d) out.push({ key: 'foundation-plan', group: 'Plans', title: 'Foundation plan', warnings: [], drawing: d })
  }
  return out
}

/** Every detail sheet, in the order the tab lists them. */
export function detailSheets(model: StructuralModel, design: StructureDesign, soil: SoilInput = {}, opts: SheetSetOptions = {}): PlanSheet[] {
  const out: PlanSheet[] = []
  const ref = (g: SheetGroup) => opts.sheetRefs?.[g] ?? REF[g]

  beamDetailBundles(model, design).forEach((b, i) => {
    const drawing = buildBeamDetail(b.detail, { detailNo: String(i + 1), sheetRef: ref('Beam details') })
    out.push({
      key: `beam-detail-${slug(b.mark)}`, group: 'Beam details',
      title: `${b.mark} — ${b.detail.b}×${b.detail.h}`,
      subtitle: `span ${b.detail.L.toFixed(2)} m`,
      // What the design flagged travels BESIDE the drawing, not on it: a bar
      // that does not develop is a question for the engineer, and set in a
      // paragraph under the elevation it is neither answered nor actionable.
      warnings: drawing.designNotes,
      drawing,
    })
  })

  columnDetailBundles(model, design).forEach((b, i) => {
    out.push({
      key: `column-detail-${slug(b.mark)}`, group: 'Column details',
      title: `${b.mark} — ${b.detail.b}×${b.detail.h ?? b.detail.b}`,
      subtitle: `${b.detail.bars}-⌀${b.detail.barDia}`,
      warnings: [],
      drawing: buildColumnDetail(b.detail, { detailNo: String(i + 1), sheetRef: ref('Column details') }),
    })
  })

  footingDetailBundles(model, design, soil).forEach((b, i) => {
    out.push({
      key: `footing-detail-${slug(b.mark)}`, group: 'Footing details',
      title: `${b.mark} — ${Math.round(b.detail.B * 1000)}×${Math.round(b.detail.B * 1000)}`,
      subtitle: `${Math.round(b.detail.H * 1000)} thk`,
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
      warnings: d.result.notes,
      drawing: d,
    })
  })

  // The joint comes after the members that meet in it — the sheet only makes
  // sense once the beam and column details have said what they are.
  jointDetailBundles(model, design).forEach((b, i) => {
    const d = buildBeamColumnJointDetail(b.detail, { detailNo: String(i + 1), sheetRef: ref('Beam–column joint details') })
    out.push({
      key: `beam-column-joint-${slug(b.mark)}`, group: 'Beam–column joint details',
      title: d.title,
      subtitle: `col ${b.detail.colB}×${b.detail.colH} · beam ${b.detail.beamB}×${b.detail.beamH} ⌀${b.detail.beamBarDia}`,
      warnings: d.result.notes,
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
export function generalNotesSheet(model: StructuralModel): PlanSheet {
  const secs = model.sections as Partial<Record<keyof GeneralNotesInput, never>> &
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
  const i: GeneralNotesInput = {
    fc: num((s) => s.fc), fy: num((s) => s.fy),
    barDias: num((s) => s.barDia), tieDias: num((s) => s.tieDia),
    cover, seismic: true,
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
    generalNotesSheet(model),
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
