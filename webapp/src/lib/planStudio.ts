// ─────────────────────────────────────────────────────────────────────────
// PLAN STUDIO — structural sheets drawn to the user's own numbers.
//
// The Plans tab draws what the DESIGN chose. Plan Studio draws what the user
// says: the frame's bays, storeys and member sizes, and the steel in it — how
// many bars top and bottom, the stirrup and tie spacing, the footing's size
// and mat, the slab's bar spacing. It reuses the whole Plans pipeline rather
// than redrawing anything:
//
//   1. a grid frame is generated from the geometry (`generateGridModel`), the
//      member sizes, bar diameters, cover and materials going straight into
//      its sections;
//   2. the frame is designed once (`designStructure`), which supplies the
//      pieces the sheets need and the user did not specify — load paths,
//      continuity, the pedestal under each column;
//   3. the design's REINFORCEMENT is then overwritten with the user's, field by
//      field, in exactly the places `cageBuilder` reads it;
//   4. `buildSheetSet` draws the set — plans, frame elevations, column and
//      footing details, cutting lists, bar bending schedules — from the cages
//      those numbers make, so every sheet agrees with every other.
//
// What it is NOT: a design check. The steel drawn is the steel entered; a
// number the design would have rejected is drawn anyway. The fit of the bars
// across a section IS checked (§425.2.1 clear spacing) because a row that
// cannot physically fit is split into layers rather than drawn overlapping,
// and the sheets say so.
//
// Units: geometry m; sections, bars, spacings mm; f′c, fy MPa.
// ─────────────────────────────────────────────────────────────────────────
import type { RectSection, StructuralModel } from '../engine/model'
import { generateGridModel, buildGravityLoads } from '../engine/modelBuilder'
import { designStructure, type StructureDesign } from '../engine/pipeline'
import { FOOTING_COVER } from '../engine/cageBuilder'
import { buildSheetSet, type PlanSheet } from './planSheets'

/** The sheet families the studio offers — `PlanSheet.group`s of the set. */
export type StudioSheetKind =
  | 'notes' | 'plans' | 'elevations' | 'columns' | 'footings' | 'cutting' | 'bbs'

export const STUDIO_KINDS: { kind: StudioSheetKind; label: string; group: string; hint: string }[] = [
  { kind: 'plans', label: 'Foundation & framing plans', group: 'Plans', hint: 'grids, footings, beams and slabs with their schedules' },
  { kind: 'elevations', label: 'Frame elevations', group: 'Frame elevations', hint: 'each grid line: beams with their bars and stirrups, cut sections' },
  { kind: 'columns', label: 'Column details', group: 'Column details', hint: 'each column, footing to roof, with ties and splices' },
  { kind: 'footings', label: 'Footing details', group: 'Footing details', hint: 'plan and section of each pad, mat and dowels' },
  { kind: 'cutting', label: 'Bar cutting lists', group: 'Bar cutting lists', hint: 'every bar pulled out of each beam line at its true length' },
  { kind: 'bbs', label: 'Bar bending schedules', group: 'Bar bending schedules', hint: 'shapes, cut lengths and weights by element' },
  { kind: 'notes', label: 'General notes', group: 'General notes', hint: 'materials, cover, laps and standard hooks' },
]

export interface StudioInput {
  /** Bay widths along x and z, storey heights bottom-up, m. */
  baysX: number[]
  baysZ: number[]
  storeyH: number[]
  /** Slab thickness, mm. */
  slab: number
  /** Concrete and steel, MPa; clear cover to the stirrup/tie, mm. */
  fc: number
  fy: number
  cover: number
  /** Beams (both directions) — size, bars per face, stirrups. */
  beam: {
    b: number; h: number
    barDia: number
    /** Bars across the top face and the bottom face, through the span. */
    top: number
    bottom: number
    stirrupDia: number
    /** Stirrup spacing near the supports and through the middle, mm. */
    sEnd: number
    sMid: number
  }
  /** Columns — size, vertical bars, ties. */
  column: {
    b: number; h: number
    barDia: number
    bars: number
    tieDia: number
    tieSpacing: number
  }
  /** Isolated footings — every pad the same. */
  footing: {
    /** Side, m; thickness, mm. */
    B: number
    Dc: number
    barDia: number
    /** Bars each way. */
    bars: number
    /** Founding depth — top of footing below the column base node … plus Dc, m. */
    depth: number
  }
  /** Slab mats — bar diameter, bottom and top spacing, mm. */
  slabBars: { barDia: number; bottom: number; top: number }
}

export const DEFAULT_STUDIO: StudioInput = {
  baysX: [6, 6], baysZ: [5], storeyH: [3.5, 3],
  slab: 150, fc: 28, fy: 415, cover: 40,
  beam: { b: 300, h: 500, barDia: 20, top: 3, bottom: 3, stirrupDia: 10, sEnd: 100, sMid: 200 },
  column: { b: 400, h: 400, barDia: 20, bars: 8, tieDia: 10, tieSpacing: 200 },
  footing: { B: 1.5, Dc: 350, barDia: 16, bars: 9, depth: 1.5 },
  slabBars: { barDia: 12, bottom: 200, top: 200 },
}

export interface StudioResult {
  sheets: PlanSheet[]
  /** What the drawing had to do with the numbers — rows split into layers,
   *  values clamped — said once, not discovered on the sheet. */
  notes: string[]
}

/** §425.2.1 — clear spacing between parallel bars: the larger of 25 mm and db. */
export const minClearSpacing = (db: number): number => Math.max(25, db)

/**
 * How many bars of `db` fit in ONE row across a face `width` mm wide, inside
 * `cover` and a stirrup of `ds` on each side, at §425.2.1 clear spacing.
 */
export function barsPerRow(width: number, cover: number, ds: number, db: number): number {
  const clear = width - 2 * cover - 2 * ds
  const s = minClearSpacing(db)
  return Math.max(1, Math.floor((clear + s) / (db + s)))
}

/** `n` bars split into rows of at most `perRow` — the layers a cage stacks. */
export function layersFor(n: number, perRow: number): number[] {
  const out: number[] = []
  let left = Math.max(0, Math.round(n))
  while (left > 0) { const k = Math.min(perRow, left); out.push(k); left -= k }
  return out
}

/** Mat spacing for `bars` across a pad `B` m wide at the footing cover, mm. */
export function matSpacing(B: number, bars: number, db: number): number {
  const run = B * 1000 - 2 * FOOTING_COVER - db
  return bars > 1 ? run / (bars - 1) : run
}

const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)))

/** The input made safe to draw: positive, whole bar counts, nothing degenerate. */
export function sanitizeStudio(i: StudioInput): StudioInput {
  const pos = (v: number, d: number) => (Number.isFinite(v) && v > 0 ? v : d)
  const bays = (a: number[], d: number[]) => {
    const ok = a.filter((v) => Number.isFinite(v) && v > 0.5).slice(0, 6)
    return ok.length ? ok : d
  }
  const D = DEFAULT_STUDIO
  return {
    baysX: bays(i.baysX, D.baysX), baysZ: bays(i.baysZ, D.baysZ), storeyH: bays(i.storeyH, D.storeyH).slice(0, 4),
    slab: pos(i.slab, D.slab), fc: pos(i.fc, D.fc), fy: pos(i.fy, D.fy), cover: pos(i.cover, D.cover),
    beam: {
      b: pos(i.beam.b, D.beam.b), h: pos(i.beam.h, D.beam.h), barDia: pos(i.beam.barDia, D.beam.barDia),
      top: clampInt(i.beam.top, 2, 16), bottom: clampInt(i.beam.bottom, 2, 16),
      stirrupDia: pos(i.beam.stirrupDia, D.beam.stirrupDia),
      sEnd: Math.max(50, pos(i.beam.sEnd, D.beam.sEnd)), sMid: Math.max(50, pos(i.beam.sMid, D.beam.sMid)),
    },
    column: {
      b: pos(i.column.b, D.column.b), h: pos(i.column.h, D.column.h), barDia: pos(i.column.barDia, D.column.barDia),
      bars: clampInt(i.column.bars, 4, 32), tieDia: pos(i.column.tieDia, D.column.tieDia),
      tieSpacing: Math.max(50, pos(i.column.tieSpacing, D.column.tieSpacing)),
    },
    footing: {
      B: pos(i.footing.B, D.footing.B), Dc: pos(i.footing.Dc, D.footing.Dc), barDia: pos(i.footing.barDia, D.footing.barDia),
      bars: clampInt(i.footing.bars, 2, 60), depth: Math.max(pos(i.footing.depth, D.footing.depth), pos(i.footing.Dc, D.footing.Dc) / 1000 + 0.1),
    },
    slabBars: {
      barDia: pos(i.slabBars.barDia, D.slabBars.barDia),
      bottom: Math.max(75, pos(i.slabBars.bottom, D.slabBars.bottom)), top: Math.max(75, pos(i.slabBars.top, D.slabBars.top)),
    },
  }
}

/** The frame the sheets are drawn on — the user's geometry and sections. */
export function studioModel(i: StudioInput): StructuralModel {
  const base = { fc: i.fc, fy: i.fy, cover: i.cover }
  const column: RectSection = { id: 'col', name: '', b: i.column.b, h: i.column.h, barDia: i.column.barDia, tieDia: i.column.tieDia, ...base }
  const beam: RectSection = { id: 'beam', name: '', b: i.beam.b, h: i.beam.h, barDia: i.beam.barDia, tieDia: i.beam.stirrupDia, ...base }
  const m = generateGridModel({
    baysX: i.baysX, baysZ: i.baysZ, storeyH: i.storeyH,
    column, beam, girder: beam, slabThickness: i.slab,
  }, 'Plan Studio frame')
  // ordinary gravity loads, only so the design has something to carry — the
  // studio overwrites every bar it chose
  m.loads = buildGravityLoads(m, 2.4, 2.4)
  return m
}

/**
 * The design with its reinforcement replaced by the user's — a NEW object;
 * the design passed in is not touched. Exactly the fields `cageBuilder` and
 * the plan schedules read: beam bar counts, layers and stirrup spacings;
 * column bars and tie spacing; footing size, thickness, mat and pedestal;
 * slab strip spacings and bar size.
 */
export function applyStudioRebar(design: StructureDesign, i: StudioInput, notes: string[] = []): StructureDesign {
  const perRow = barsPerRow(i.beam.b, i.cover, i.beam.stirrupDia, i.beam.barDia)
  const topLayers = layersFor(i.beam.top, perRow)
  const botLayers = layersFor(i.beam.bottom, perRow)
  for (const [face, n, ls] of [['top', i.beam.top, topLayers], ['bottom', i.beam.bottom, botLayers]] as const) {
    if (ls.length > 1) notes.push(`${n} bars do not fit in one row across a ${i.beam.b} mm beam at the §425.2.1 clear spacing (max ${perRow} per row) — the ${face} steel is drawn in ${ls.length} layers (${ls.join(' + ')}).`)
  }
  const beams = design.beams.map((b) => ({
    ...b,
    sections: b.sections.map((s) => ({
      ...s,
      design: {
        ...s.design,
        bars: s.hogging ? i.beam.top : i.beam.bottom,
        layers: s.hogging ? topLayers : botLayers,
        sAdopt: s.hogging ? i.beam.sEnd : i.beam.sMid,
        sHinge: s.hogging ? i.beam.sEnd : 0,
      },
    })),
  }))

  const tieLabel = `⌀${i.column.tieDia} @ ${Math.round(i.column.tieSpacing)}`
  const columns = design.columns.map((c) => ({
    ...c,
    bars: i.column.bars,
    tieSpacing: i.column.tieSpacing,
    tieSpacingFinal: i.column.tieSpacing,
    tieSpacingLabel: tieLabel,
    // one spacing the whole height: no confinement zone the user did not draw
    seismicLoZone: undefined, seismicSConf: undefined, seismicSOut: undefined,
  }))

  const spacing = matSpacing(i.footing.B, i.footing.bars, i.footing.barDia)
  if (spacing - i.footing.barDia < minClearSpacing(i.footing.barDia)) {
    notes.push(`${i.footing.bars} ⌀${i.footing.barDia} bars across a ${i.footing.B} m pad are ${Math.round(spacing)} mm apart — less than the §425.2.1 clear spacing.`)
  }
  const pedestal = Math.max(0, i.footing.depth - i.footing.Dc / 1000)
  const footings = design.footings.map((f) => ({
    ...f,
    barDia: i.footing.barDia,
    pedestal,
    design: { ...f.design, B: i.footing.B, Dc: i.footing.Dc, bars: i.footing.bars, barSpacing: spacing },
  }))

  const slabs = design.slabs.map((sl) => {
    const dir = (d: typeof sl.design.x) => ({
      ...d,
      locations: d.locations.map((l) => {
        const sp = l.name === '+M' ? i.slabBars.bottom : i.slabBars.top
        return { ...l, column: { ...l.column, spacing: sp }, middle: { ...l.middle, spacing: sp } }
      }),
    })
    return { ...sl, barDia: i.slabBars.barDia, design: { ...sl.design, x: dir(sl.design.x), y: dir(sl.design.y) } }
  })

  if (design.combined.length) notes.push(`${design.combined.length} pair${design.combined.length > 1 ? 's' : ''} of columns stand too close for separate pads; ${design.combined.length > 1 ? 'they keep' : 'it keeps'} the combined footing the design gave ${design.combined.length > 1 ? 'them' : 'it'}.`)
  return { ...design, system: 'gravity', beams, columns, footings, slabs }
}

/**
 * The whole set, drawn to the input. `null` sheets with a reason when the
 * frame cannot be built or designed at all.
 */
/**
 * The last frame designed, by everything that shapes it — geometry, sections,
 * bar diameters, materials, founding depth — and nothing the override
 * replaces. A bar count or a spacing changed in the studio re-draws the
 * sheets without designing the frame again: the design is about half the
 * rebuild (measured: 116 of 383 ms on the sample frame, 620 of 1 367 ms on a
 * 4 × 3-bay, 4-storey one).
 */
let lastDesign: { key: string; model: StructuralModel; designed: StructureDesign | null } | null = null
const designKey = (i: StudioInput) => JSON.stringify([
  i.baysX, i.baysZ, i.storeyH, i.slab, i.fc, i.fy, i.cover,
  i.beam.b, i.beam.h, i.beam.barDia, i.beam.stirrupDia,
  i.column.b, i.column.h, i.column.barDia, i.column.tieDia, i.footing.depth,
])

export function buildStudio(raw: StudioInput): StudioResult & { error?: string } {
  const i = sanitizeStudio(raw)
  const notes: string[] = []
  const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: i.footing.depth }
  const key = designKey(i)
  if (lastDesign?.key !== key) {
    const m = studioModel(i)
    lastDesign = { key, model: m, designed: designStructure(m, soil) }
  }
  const { model, designed } = lastDesign
  if (!designed) return { sheets: [], notes, error: 'The frame could not be built from these dimensions.' }
  const design = applyStudioRebar(designed, i, notes)
  const sheets = buildSheetSet(model, design, soil)
  return { sheets, notes }
}

/** The sheets of one family, in set order. */
export function sheetsOf(sheets: readonly PlanSheet[], kind: StudioSheetKind): PlanSheet[] {
  const group = STUDIO_KINDS.find((k) => k.kind === kind)!.group
  return sheets.filter((s) => s.group === group)
}
