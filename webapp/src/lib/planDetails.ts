// Map a completed structural design onto the plan-renderer / footing-detail
// inputs — so the "Plans" tab (framing + foundation plans, per-footing detail
// sheets) is generated straight from the model + design. Pure & typed; the
// column cross-section is handed to the existing ColumnSchematic report
// component, everything else to the plan-renderer engine.
import type { StructuralModel, RectSection } from '../engine/model'
import type { StructureDesign } from '../engine/pipeline'
import type { PlanFooting } from '../engine/planRenderer'
import type { FootingDetailInput, FootingBearing } from '../engine/footingDetail'
import type { PedestalScheduleRow } from '../engine/pipeline'
import { shapeByName } from '../engine/aiscSections'
import { pedestalMark } from '../engine/cageBuilder'
import { pedestalBearing } from '../engine/pedestal'
import type { WallDetailInput } from '../engine/wallDetail'
import type { ColumnSchematicProps } from '../components/ColumnSchematic'
import type { FrameElevationInput, ElevationMember } from '../engine/frameElevation'
import { planGridLines } from '../engine/planGrid'
import type { ColumnStackDetailInput, ColumnStackSegment } from '../engine/columnStackDetail'
import { elevationPlane, projectPoint, type RebarCage, type Vec3, type ViewPlane } from '../engine/rebarModel'
import { stationZones } from '../engine/beamSection'

/** Reinforced concrete — the only material these sheets detail. Bars, ties,
 *  laps and dowels mean nothing on a rolled shape or a timber post, and a
 *  W310 drawn as "4-⌀20, TIES ⌀10" is a drawing that must not reach site. */
export const isRcSection = (s: { material?: string } | undefined): boolean =>
  !s?.material || s.material === 'concrete'

export interface SoilInput { qAllow?: number; gammaSoil?: number; gammaConc?: number; H?: number }


/**
 * Designed footings → the plan renderer's minimal PlanFooting shapes.
 *
 * Both kinds. The pipeline designs a combined pad wherever the footing plan
 * pairs two supports, and excludes those nodes from the isolated list, so the
 * two sets here are disjoint by construction. The foundation plan used to take
 * only the isolated ones, which meant a combined footing was designed, checked,
 * scheduled and costed — and then simply not drawn.
 */
export function footingsForPlan(design: StructureDesign): PlanFooting[] {
  const ped = new Map((design.pedestals ?? []).map((p) => [p.node, p.design.side]))
  const isolated: PlanFooting[] = design.footings.map((r) => ({
    kind: 'isolated' as const,
    node: r.node, B: r.design.B, Dc: r.design.Dc,
    bars: r.design.bars, barSpacing: r.design.barSpacing,
    barDia: r.barDia,
    ...(ped.has(r.node) ? { pedestal: ped.get(r.node) } : {}),
  }))
  const combined: PlanFooting[] = design.combined.map((r) => {
    const d = r.design
    // The transverse strips carry the bar spacing; take the tightest, which is
    // the one under the more heavily loaded column.
    const sp = d.transverse.length
      ? Math.min(...d.transverse.map((t) => t.spacing).filter((v) => v > 0))
      : 0
    return {
      kind: 'combined' as const,
      nodes: r.nodes,
      Bx: d.Bx, By1: d.By1, By2: d.By2, x1: d.x1, x2: d.x2,
      Dc: d.Dc,
      barDia: d.barDia,
      barSpacing: Number.isFinite(sp) ? sp : 0,
      bars: d.longSections.reduce((m, sn) => Math.max(m, sn.bars), 0),
    }
  })
  return [...isolated, ...combined]
}

export interface FootingDetailBundle {
  mark: string
  detail: FootingDetailInput
  column: ColumnSchematicProps
}

/** One detail sheet per distinct footing type (grouped by side × thickness, in
 *  the same order the plan marks them WF-1, WF-2…). Each bundle carries the
 *  engine detail input plus the props for the report's column cross-section. */
export function footingDetailBundles(
  model: StructuralModel, design: StructureDesign, soil: SoilInput = {}, cages: RebarCage[] = [],
): FootingDetailBundle[] {
  const secById = new Map(model.sections.map((s) => [s.id, s]))
  const colRowById = new Map(design.columns.map((c) => [c.id, c]))
  // the base column member sitting at a footing node (lowest y among its ends)
  const colAt = (node: string) => model.members.find((m) => m.role === 'column' && (m.i === node || m.j === node))

  // WF-n is the PAD's mark — the foundation plan's, by side × thickness in
  // design order. A sheet is drawn per distinct pad AND pedestal, because two
  // pads of one size can carry different pedestals and plates.
  const padMark = new Map<string, string>()
  const drawn = new Set<string>()
  const pdMarks = pedestalMarks(design)
  const pedAt = new Map((design.pedestals ?? []).map((p) => [p.node, p]))
  const bundles: FootingDetailBundle[] = []
  for (const r of design.footings) {
    const key = `${Math.round(r.design.B * 1000)}x${Math.round(r.design.Dc)}`
    if (!padMark.has(key)) padMark.set(key, `WF-${padMark.size + 1}`)
    const mark = padMark.get(key)!
    const mem = colAt(r.node)
    const colSec: RectSection | undefined = mem ? secById.get(mem.section) : undefined
    const ped = pedAt.get(r.node)
    const sheetKey = ped ? `${key}|${pdMarks.get(r.node)}` : key
    if (drawn.has(sheetKey)) continue
    // Under a steel or timber column the RC stub the sheet draws is the
    // PEDESTAL, with the plate and the column stood on top. Without a designed
    // pedestal there is nothing true to draw — no sheet rather than a wrong one.
    if (mem && !isRcSection(colSec) && !ped) continue
    drawn.add(sheetKey)
    const bearing = ped && mem && colSec ? footingBearing(design, ped, colSec, pdMarks.get(r.node)) : undefined
    const sec: RectSection | undefined = ped && colSec
      ? { ...colSec, b: ped.design.side, h: ped.design.side, barDia: ped.design.barDia, tieDia: ped.design.tieDia }
      : colSec
    // THE SHEET'S AXES, NOT THE SECTION'S NAMES. `FootingDetailInput.colB` is
    // the column's width along the sheet's x and `colH` its depth along the
    // sheet's y; a `RectSection` names them the other way round, because a
    // modelled column carries `h` across WORLD X and `b` across world z (the
    // convention `columnCage` and `modelBridge` both place bars to). Handed
    // over unswapped, the footing sheet drew a 300×500 column as 500 deep by
    // 300 wide while cutting its cage at the true orientation, so the bars
    // stood 55 mm outside the concrete in plan and in section A–A.
    const colB = sec?.h ?? 400, colH = sec?.b ?? colB
    const colBarDia = sec?.barDia ?? 16, tieDia = sec?.tieDia ?? 10
    const colRow = mem ? colRowById.get(mem.id) : undefined
    const colBars = ped ? ped.design.bars : Math.max(4, colRow?.bars ?? 8)
    const tieSpacing = ped ? ped.design.tieSpacing : colRow?.tieSpacingFinal
    // The PLACED steel for this footing and the column on it. The sheet draws
    // from these when they are there; a caller with a design but no model
    // (the standalone foundation calculator) passes none and gets the numeric
    // drawing. `yTop` is the pad's top — the base node less the pedestal, the
    // same level `cageBuilder` placed the cage at, because the sheet's own zero
    // is that face.
    const at = model.nodes.find((nd) => nd.id === r.node)
    const detailCages = at && mem
      ? {
        footing: cages.find((cc) => cc.member === `F-${r.node}`),
        column: cages.find((cc) => cc.member === (ped ? pedestalMark(r.node) : mem.id)),
        centre: [at.x, at.z] as [number, number],
        yTop: at.y - r.pedestal,
      }
      : undefined
    bundles.push({
      mark,
      detail: {
        mark, B: r.design.B, H: r.design.Dc / 1000, cover: 75,
        barDia: r.barDia,
        bars: r.design.bars, barSpacing: r.design.barSpacing,
        colB, colH, colBars, colBarDia, tieDia, colCover: sec?.cover ?? 40,
        // TOP of footing, which is what the sheet's T.O.F. label and its
        // embedment dimension read this as. `soil.H` is the founding depth —
        // natural grade to the UNDERSIDE of the pad (`pipeline`, "Depth of
        // footing is a GEOTECHNICAL number") — so the top is one pad
        // thickness above it: the pedestal the design already computed. Handed
        // −H, every pad was drawn a pad-thickness deeper than it was designed.
        foundingElev: soil.H != null ? -r.pedestal : undefined,
        endHook: 'none',
        ...(detailCages?.footing || detailCages?.column ? { cages: detailCages } : {}),
        ...(bearing ? { bearing } : {}),
      },
      column: {
        shape: 'tied', b: colB, h: colH,
        cover: sec?.cover ?? 40, barDia: colBarDia, tieDia, bars: colBars, tieSpacing,
      },
    })
  }
  return bundles
}

/**
 * PD-n for every designed pedestal, by base node — one mark per distinct
 * pedestal (side, bars, ties, height) in design order, the way WF-n marks
 * pads. Shared by the footing sheets and the pedestal schedule so the two
 * agree about which pedestal is PD-2.
 */
export function pedestalMarks(design: StructureDesign): Map<string, string> {
  const byType = new Map<string, string>()
  const out = new Map<string, string>()
  for (const p of design.pedestals ?? []) {
    const d = p.design
    const key = `${d.side}|${d.bars}x${d.barDia}|${d.tieDia}@${d.tieSpacing}|${Math.round(d.height * 1000)}`
    if (!byType.has(key)) byType.set(key, `PD-${byType.size + 1}`)
    out.set(p.node, byType.get(key)!)
  }
  return out
}

/** What stands on a pedestal, for the footing sheet: the designed base plate
 *  under a steel column, a nominal post base under a timber one. */
function footingBearing(
  design: StructureDesign, ped: PedestalScheduleRow, colSec: RectSection, mark?: string,
): FootingBearing | undefined {
  // the sheet's x is world X, which a modelled column's `h` runs across
  const colD = colSec.h, colB = colSec.b
  if (ped.material === 'steel') {
    const bp = design.basePlates.find((b) => b.node === ped.node)
    const shape = colSec.shape ? shapeByName(colSec.shape) : undefined
    if (!bp) return undefined
    const hw = pedestalBearing('steel', colD, colB, ped.design.height,
      { N: Math.round(bp.design.N), B: Math.round(bp.design.B), t: bp.tAdopt },
      bp.anchors ? { da: bp.anchors.da, hef: bp.anchors.hef, x: bp.design.rodX, y: bp.design.rodY } : undefined)
    const ac = bp.anchors?.check
    return {
      kind: 'steel', mark, column: bp.shape,
      colD: shape?.d ?? colD, colB: shape?.bf ?? colB, tf: shape?.tf,
      ...hw,
      notes: [
        'PLATE: AISC 360 §J8 BEARING, DG1 THICKNESS',
        ac ? `ANCHORS: ACI 318-14 CH. 17 — ${Math.round(ac.util * 100)}% (${ac.governs.toUpperCase()})`
          : 'ANCHORS: ACI 318-14 CH. 17 NOT CHECKED (NO REACTION)',
      ],
    }
  }
  const w = design.woodColumns.find((c) => c.id === ped.column)
  const d = w?.d ?? colD, b = w?.b ?? colB
  const pb = design.postBases?.find((x) => x.node === ped.node)?.design
  if (!pb) return {
    kind: 'wood', mark, column: `${b}×${d}`,
    colD: d, colB: b,
    ...pedestalBearing('wood', d, b, ped.design.height),
    notes: ['POST BASE IS NOMINAL — NOT DESIGNED;', 'SIZE TO NDS §12 / SUPPLIER BEFORE ISSUE'],
  }
  return {
    kind: 'wood', mark, column: `${b}×${d}`,
    colD: d, colB: b,
    ...pedestalBearing('wood', d, b, ped.design.height, pb.plate, { da: pb.rods.da, hef: pb.rods.hef, x: pb.rods.x, y: 0 }),
    straps: { t: pb.straps.t, h: pb.straps.h }, bolts: pb.bolts,
    notes: [
      `POST BASE: NDS §12.3 BOLTS, AISC §J4 STRAPS, ACI 318-14 CH. 17 RODS`,
      `${Math.round(pb.util * 100)}% — ${pb.governs.toUpperCase()}`,
    ],
  }
}

/**
 * How a model names its own positions — the convention the plans' bubbles
 * use (`buildPlan`, on `planGridLines`): a LETTERED line at each x, a NUMBERED
 * row at each z, and floors counted up from the base.
 *
 * Shared, because two sheet sets name the same joint: the plan's bubbles and
 * the column stack detail must agree about which position is A1, or the
 * drawing set is describing two different buildings. It used to letter the z
 * ordinate and number the x — the other way round from the bubbles — and to
 * take its lines from every node, so on a 2×1-bay frame the details named
 * columns A3 and B3 on a plan whose grid has no line 3.
 */
const ORD_WORD = ['Ground', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh',
  'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth']
const suffix = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')

/**
 * The name of a level, counted from the model's base (k = 0) up to its top
 * (k = top). Philippine (and US) practice: the base is the GROUND floor, at
 * grade — the plans put ±0.00 there — so the first framed level is the SECOND
 * floor, and the topmost framed level is the ROOF. They used to be named one
 * floor low and without a roof: on a two-storey frame the slab at EL 3.50 was
 * the "Ground Floor framing plan" and the roof at 6.50 the "Second Floor".
 */
export function levelName(k: number, top: number): string {
  if (k <= 0) return 'Ground Floor'
  if (k >= top) return 'Roof'
  const n = k + 1
  return `${ORD_WORD[n - 1] ?? `${n}${suffix(n)}`} Floor`
}

export function modelGrid(model: StructuralModel): {
  floorOf: (y: number) => string
  gridRef: (x: number, z: number) => string
  levels: number[]
} {
  const round6 = (v: number) => Math.round(v * 1e6) / 1e6
  const levels = [...new Set(model.nodes.map((n) => round6(n.y)))].sort((a, b) => a - b)
  const { xs, zs } = planGridLines(model)
  // The nearest line: a column off the grid takes the line it is closest to.
  const nearest = (v: number, at: number[]) => at.reduce((k, x, i) => (Math.abs(x - v) < Math.abs(at[k] - v) ? i : k), 0)
  return {
    levels,
    floorOf: (y) => levelName(Math.max(0, levels.indexOf(round6(y))), levels.length - 1).toUpperCase(),
    gridRef: (x, z) => `${String.fromCharCode(65 + nearest(x, xs))}${1 + nearest(z, zs)}`,
  }
}


/**
 * One detail PER COLUMN LINE — the whole stack, footing to top.
 *
 * The typical-detail bundles above group by section and tie schedule, so a
 * twelve-storey building emits three sheets and none of them is a column you
 * can point at on site. These are keyed by the BASE NODE instead: every column
 * member standing over one plan position, in order, with the footing under it
 * and the cages that belong to all of them.
 *
 * The stack is walked node by node rather than by plan coordinate, because a
 * column that steps has different section widths at each storey and only the
 * node chain says which member sits on which.
 */
export interface ColumnStackBundle {
  key: string
  mark: string
  grid: string
  input: ColumnStackDetailInput
}

export function columnStackBundles(
  model: StructuralModel, design: StructureDesign, cages: RebarCage[],
): ColumnStackBundle[] {
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]))
  const secById = new Map(model.sections.map((s) => [s.id, s]))
  const rowById = new Map(design.columns.map((c) => [c.id, c]))
  const cols = model.members.filter((m) => m.role === 'column' && isRcSection(secById.get(m.section)))
  const lower = (m: (typeof cols)[number]) =>
    (nodeById.get(m.i)!.y <= nodeById.get(m.j)!.y ? m.i : m.j)
  const upper = (m: (typeof cols)[number]) =>
    (nodeById.get(m.i)!.y <= nodeById.get(m.j)!.y ? m.j : m.i)

  const startingAt = new Map<string, (typeof cols)[number]>()
  const tops = new Set<string>()
  for (const m of cols) { startingAt.set(lower(m), m); tops.add(upper(m)) }
  // A stack starts where a column has nothing under it.
  const bases = [...startingAt.keys()].filter((id) => !tops.has(id))

  const { floorOf, gridRef, levels } = modelGrid(model)

  const out: ColumnStackBundle[] = []
  for (const base of bases) {
    const chain: (typeof cols)[number][] = []
    let at: string | undefined = base
    while (at) {
      const m: (typeof cols)[number] | undefined = startingAt.get(at)
      if (!m || chain.includes(m)) break
      chain.push(m)
      at = upper(m)
    }
    if (!chain.length) continue
    const n0 = nodeById.get(base)!
    // The sheet is read looking along z, so the face in view is the section's
    // h — `columnCage` lays its bars out as [along h, across b] and puts the
    // first on global X. Drawn as b, a 300×500 column would come out 300 wide
    // with its bars spread 410: the steel outside its own concrete.
    const plane: ViewPlane = { origin: [0, 0, n0.z], u: [1, 0, 0], v: [0, -1, 0] }

    const segments: ColumnStackSegment[] = []
    for (const m of chain) {
      const sec = secById.get(m.section) as RectSection | undefined
      if (!sec) continue
      const row = rowById.get(m.id)
      const a = nodeById.get(lower(m))!, b = nodeById.get(upper(m))!
      segments.push({
        mark: m.id, yBot: a.y, yTop: b.y,
        face: sec.h ?? sec.b, depth: sec.b,
        bars: Math.max(4, row?.bars ?? 4),
        barDia: sec.barDia ?? 20, tieDia: sec.tieDia ?? 10,
        loZone: row?.seismicLoZone,
      })
    }
    if (!segments.length) continue

    const foot = design.footings.find((f) => f.node === base)
    const stackCages = cages.filter((c) => chain.some((m) => m.id === c.member)
      || c.member === `F-${base}`)
    const grid = gridRef(n0.x, n0.z)
    // Two stacks off the grid can round to one position; number the repeat
    // rather than give two sheets one name.
    const seen = out.filter((o) => o.grid === grid).length
    const mark = seen ? `C-${grid}-${seen + 1}` : `C-${grid}`
    out.push({
      key: `column-detail-${mark.toLowerCase()}`,
      mark, grid,
      input: {
        mark, grid, u: n0.x, plane, segments,
        levels: levels
          .filter((y) => y >= segments[0]!.yBot - 1e-6)
          .map((y) => ({ y, label: floorOf(y) })),
        ...(foot
          ? { footing: { B: foot.design.B, Dc: foot.design.Dc / 1000, yTop: n0.y - foot.pedestal } }
          : {}),
        cages: stackCages,
      },
    })
  }
  return out.sort((a, b) => a.mark.localeCompare(b.mark))
}

/**
 * Every column stack sheet, indexed by each MEMBER drawn on it.
 *
 * A stack sheet is per column LINE; a schedule row is one member — one storey
 * of that line. Unlike the beam elevations, indexing by member is unambiguous
 * here: a column member belongs to exactly one stack, the one standing over its
 * own base node.
 *
 * Built once and looked up, because assembling the bundles walks every column
 * chain in the model and a schedule expands a row on every click.
 */
export function columnStackByMember(
  model: StructuralModel, design: StructureDesign, cages: RebarCage[],
): Map<string, ColumnStackBundle> {
  const out = new Map<string, ColumnStackBundle>()
  for (const b of columnStackBundles(model, design, cages)) {
    for (const s of b.input.segments) out.set(s.mark, b)
  }
  return out
}

// ── Slab opening details ────────────────────────────────────────────────────

// `SlabOpeningBundle` and `slabOpeningBundles` moved to engine/slabOpening.ts
// so the TAKE-OFF can read the same derivation the sheets do — an estimator
// re-deriving which openings exist is how the BOM and the drawings drift
// apart, which is the whole reason buildSheetSet exists (#600). Re-exported
// here because this is where every caller already looks for it.
export { slabOpeningBundles, type SlabOpeningBundle } from '../engine/slabOpening'

// ── Wall standard details ───────────────────────────────────────────────────

export interface WallDetailBundle { mark: string; wall: string; detail: WallDetailInput }

/**
 * One set of wall details (corner, intersection, construction joint) per
 * distinct wall TYPE, from the designed shear walls.
 *
 * Grouped on thickness and the two curtain spacings, so a core of identical
 * walls yields one set of sheets rather than one per wall. Every figure comes
 * off `WallScheduleRow`: `designShearWall` already chose the spacings and the
 * row now carries the bar diameter and the grades it was designed with.
 *
 * The in-plane shear is passed through as the CONSTRUCTION JOINT's demand —
 * the joint is a horizontal cut through the web, so the shear that crosses it
 * is the same Vu the web was designed for.
 *
 * Takes the design alone: unlike the beam and column bundlers, every figure a
 * wall detail needs is already on the schedule row, so reaching back into the
 * model would only add a way to disagree with it.
 */
export function wallDetailBundles(design: StructureDesign): WallDetailBundle[] {
  const seen = new Set<string>()
  const out: WallDetailBundle[] = []
  for (const r of design.walls) {
    const sH = Math.round(r.design.horiz.spacing), sV = Math.round(r.design.vert.spacing)
    const key = `${Math.round(r.thickness)}-${sH}-${sV}-${Math.round(r.barDia)}`
    if (seen.has(key)) continue
    seen.add(key)
    const mark = `W${seen.size}`
    out.push({
      mark, wall: r.id,
      detail: {
        mark, t: r.thickness,
        barDia: r.barDia, spacing: sH,
        vertDia: r.barDia, vertSpacing: sV,
        cover: 20, fc: r.fc, fy: r.fy,
        Vu: r.Vu, lw: r.lw, surface: 'roughened',
      },
    })
  }
  return out
}

// Beam–column joints had a bundler and a two-view sheet here. Both are gone:
// the sheet drew a schematic of a joint rather than the joint the model has,
// and the frame elevations and the 3D cage already show that steel from the
// placed bars. `designBeamColumnJoint` keeps the §418.8 checks themselves.

// ── Frame elevations ──────────────────────────────────────────────────────
// One sheet per grid line per level: the whole line captured at that floor,
// with the columns carried half a storey below the beams and half a storey
// above, and every bar taken from the cages `buildStructureCages` built.

/** A grid line: the members on it, and the axis they run along. */
interface GridLine {
  label: string
  /** Constant plan coordinate the line sits at, m. */
  at: number
  /** The line runs in x (a lettered line) or in z (a numbered one). */
  axis: 'x' | 'z'
}

export interface FrameElevationBundle {
  key: string
  line: string
  level: string
  /** The grids a part of a long line runs between ("A–D"); absent when the
   *  line is on one sheet. `input.line` carries it into the drawing title. */
  part?: string
  input: FrameElevationInput
}

/**
 * The most bays one frame elevation carries.
 *
 * The sheet is scaled to its line, and its text with it — so what a bay has
 * room for is a SHARE of the sheet, not of the line's length. Each bay puts
 * its mark and three leadered callouts over the beam and three cut sections
 * under it. Measured on the studio's frames: at two bays every beam's callouts
 * lay out with nothing touching; at three, none do — the top-bar label runs
 * onto the column — and at six the labels, sections and stop dimensions all
 * print through each other. A longer line is drawn in parts, broken at a
 * column, which appears on both.
 */
export const MAX_BAYS_PER_ELEVATION = 2

/** `n` beams in order, split into the fewest runs of at most `max`, as even
 *  as they go — 6 → 2 + 2 + 2, 5 → 2 + 2 + 1. */
export function elevationRuns(n: number, max = MAX_BAYS_PER_ELEVATION): number[] {
  const parts = Math.max(1, Math.ceil(n / max))
  return Array.from({ length: parts }, (_, k) => Math.floor(n / parts) + (k < n % parts ? 1 : 0))
}

/**
 * The grid lines of the model, from where its columns actually stand.
 *
 * Read off the COLUMNS rather than from a stored grid, because the model has no
 * stored grid: a frame imported or edited node by node still has lines, and
 * they are wherever two or more columns share a plan coordinate.
 */
export function gridLines(model: StructuralModel): GridLine[] {
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]))
  const cols = model.members.filter((m) => m.role === 'column')
  const feet = new Set<string>()
  for (const c of cols) for (const id of [c.i, c.j]) feet.add(id)
  const pts = [...feet].map((id) => nodeById.get(id)!).filter(Boolean)

  // The lines themselves are the plan's (`planGridLines`: the bases of the
  // lowest columns), so a sheet called "B" is the line the plan calls B. Taken
  // from every column END, a raking column's top made a line of its own and
  // shifted every letter after it.
  const { xs, zs } = planGridLines(model)
  const out: GridLine[] = []
  // The PLAN's labels: lines at constant x (running along z) are lettered by
  // their x, rows at constant z (running along x) numbered by their z —
  // `buildPlan`'s bubbles. This used to be the other way round, so the sheet
  // titled "GRID A" was the line the plan calls 1, and its bubbles 1, 2, 3 were
  // the plan's A, B, C.
  zs.forEach((z, k) => {
    if (pts.filter((p) => Math.abs(p.z - z) < 1e-6).length < 2) return
    out.push({ label: String(k + 1), at: z, axis: 'x' })
  })
  xs.forEach((x, k) => {
    if (pts.filter((p) => Math.abs(p.x - x) < 1e-6).length < 2) return
    out.push({ label: String.fromCharCode(65 + k), at: x, axis: 'z' })
  })
  return out
}

/**
 * Where each of a beam's design sections sits ON ITS ELEVATION, m along the
 * sheet's u.
 *
 * Two changes of coordinate, and both are easy to skip. A design station is
 * measured from the beam's i-node in metres along the beam; the sheet's u runs
 * along the GRID LINE, whose direction is the plane's, not the member's — so a
 * beam modelled j→i has its "End i" at the RIGHT of the sheet, and reading the
 * station as a distance from the left edge would wash the wrong support.
 * Projecting both nodes and interpolating between them keeps the two ends
 * attached to the right ends.
 */
export function beamSectionZones(
  model: StructuralModel, bundle: FrameElevationBundle, beamId: string, stations: number[],
): [number, number][] | null {
  const m = model.members.find((x) => x.id === beamId)
  if (!m) return null
  const ni = model.nodes.find((n) => n.id === m.i)
  const nj = model.nodes.find((n) => n.id === m.j)
  if (!ni || !nj) return null
  const L = Math.hypot(nj.x - ni.x, nj.y - ni.y, nj.z - ni.z)
  if (L <= 1e-9) return null
  const uI = projectPoint([ni.x, ni.y, ni.z], bundle.input.plane)[0]
  const uJ = projectPoint([nj.x, nj.y, nj.z], bundle.input.plane)[0]
  const us = stations.map((x) => uI + (uJ - uI) * (x / L))
  return stationZones(us, Math.min(uI, uJ), Math.max(uI, uJ))
}

/**
 * Every frame elevation, indexed by the members drawn on it as the SUBJECT.
 *
 * The drawing set groups these by grid line and level; a schedule row is about
 * one member and needs the sheet that member is on. Built once and looked up,
 * because assembling the bundles walks every member of every line at every
 * level and a schedule expands a row on every click.
 *
 * Context members — the columns carried half a storey above and below — are
 * NOT indexed: a column appears on the sheets of both the level under it and
 * the level over it, and answering "which sheet is this column's" with either
 * would be a coin toss. Beams have one level and one line, so they are
 * unambiguous.
 */
export function elevationBundleByMember(
  model: StructuralModel, design: StructureDesign, cages: RebarCage[],
): Map<string, FrameElevationBundle> {
  const out = new Map<string, FrameElevationBundle>()
  for (const b of frameElevationBundles(model, design, cages)) {
    for (const m of b.input.members) {
      if (m.role === 'beam' && !out.has(m.mark)) out.set(m.mark, b)
    }
  }
  return out
}

/**
 * Every frame elevation the model has — one per grid line per framed level.
 *
 * The band is half the storey below the beams and half the storey above, so
 * the joint sits in the middle of the sheet with its neighbours' detailing
 * either side. Where there is no storey one way (a base, a roof) the band is
 * half the storey that does exist, which keeps the sheet the same shape.
 */
export function frameElevationBundles(
  model: StructuralModel, design: StructureDesign, cages: RebarCage[],
): FrameElevationBundle[] {
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]))
  const secById = new Map(model.sections.map((s) => [s.id, s]))
  const sec = (m: { section: string }) => secById.get(m.section) as RectSection | undefined
  const pos = (id: string) => nodeById.get(id)
  const isBeam = (r: string) => r === 'beam' || r === 'girder'

  const levels = [...new Set(model.nodes.map((n) => Math.round(n.y * 1e6) / 1e6))].sort((a, b) => a - b)
  const out: FrameElevationBundle[] = []

  const { xs: planXs, zs: planZs } = planGridLines(model)
  for (const g of gridLines(model)) {
    const onLine = (id: string) => {
      const n = pos(id)
      return !!n && Math.abs((g.axis === 'x' ? n.z : n.x) - g.at) < 1e-6
    }
    const along: Vec3 = g.axis === 'x' ? [1, 0, 0] : [0, 0, 1]
    const coord = (id: string) => {
      const n = pos(id)!
      return g.axis === 'x' ? n.x : n.z
    }
    const members = model.members.filter((m) => onLine(m.i) && onLine(m.j) && isRcSection(sec(m)))
    // A column belongs to this line if EITHER end is on it: one raking out of
    // the plane (toward the viewer) has the other end off the line, and is
    // still the column this frame stands on.
    const cols = model.members.filter((m) => m.role === 'column' && (onLine(m.i) || onLine(m.j)) && isRcSection(sec(m)))

    for (const y of levels) {
      const level = members.filter((m) => isBeam(m.role)
        && Math.abs(pos(m.i)!.y - y) < 1e-6 && Math.abs(pos(m.j)!.y - y) < 1e-6)
      if (!level.length) continue
      const lo = (m: (typeof level)[number]) => Math.min(coord(m.i), coord(m.j))
      const hi = (m: (typeof level)[number]) => Math.max(coord(m.i), coord(m.j))
      level.sort((a, b) => lo(a) - lo(b))
      const runs = elevationRuns(level.length)
      let next = 0
      for (const count of runs) {
        const beams = level.slice(next, next + count)
        next += count
        // The run's own stretch of the line; a column standing at either end of
        // it is the joint the part breaks at, drawn on both sheets.
        const uFrom = Math.min(...beams.map(lo)), uTo = Math.max(...beams.map(hi))
        const inRun = (c: (typeof cols)[number]) => {
          const u = (coord(c.i) + coord(c.j)) / 2
          return u > uFrom - 0.05 && u < uTo + 0.05
        }

        // The columns meeting this level, split into the one below and the one
        // above at each grid position.
        const touching = cols.filter((c) => {
          const a = pos(c.i)!.y, b = pos(c.j)!.y
          return (Math.abs(a - y) < 1e-6 || Math.abs(b - y) < 1e-6) && inRun(c)
        })
        const hOf = (c: (typeof cols)[number]) => Math.abs(pos(c.j)!.y - pos(c.i)!.y)
        const below = touching.filter((c) => Math.max(pos(c.i)!.y, pos(c.j)!.y) <= y + 1e-6)
        const above = touching.filter((c) => Math.min(pos(c.i)!.y, pos(c.j)!.y) >= y - 1e-6)
        const halfDown = below.length ? Math.max(...below.map(hOf)) / 2 : 0
        const halfUp = above.length ? Math.max(...above.map(hOf)) / 2 : 0
        const yLo = y - (halfDown || halfUp)
        const yHi = y + (halfUp || halfDown)

        const origin: Vec3 = g.axis === 'x' ? [0, 0, g.at] : [g.at, 0, 0]
        const plane = elevationPlane(along, origin)

        const bars = (id: string) => {
          const b = design.beams.find((x) => x.id === id)
          if (b) {
            const top = Math.max(0, ...b.sections.filter((s) => s.hogging).map((s) => s.design.bars))
            const bot = Math.max(0, ...b.sections.filter((s) => !s.hogging).map((s) => s.design.bars))
            return `${top}-TOP / ${bot}-BOT`
          }
          const c = design.columns.find((x) => x.id === id)
          return c ? `${c.bars}-⌀${sec(model.members.find((m) => m.id === id)!)?.barDia ?? 0}` : undefined
        }

        const elMembers: ElevationMember[] = []
        for (const m of beams) {
          const s = sec(m)
          if (!s) continue
          const u0 = Math.min(coord(m.i), coord(m.j)), u1 = Math.max(coord(m.i), coord(m.j))
          // The node is the TOP of the beam, so it hangs below the level.
          elMembers.push({
            mark: m.id, role: 'beam', u0, u1, yBot: y - s.h / 1000, yTop: y,
            bw: s.b, d: s.h, note: bars(m.id),
          })
        }
        for (const c of touching) {
          const s = sec(c)
          if (!s) continue
          const lo = Math.min(pos(c.i)!.y, pos(c.j)!.y), hi = Math.max(pos(c.i)!.y, pos(c.j)!.y)
          // The centreline where it crosses THIS level, and how it rakes in the
          // plane of the sheet (du per metre up). Plumb columns: slope 0.
          const [bot, top] = pos(c.i)!.y <= pos(c.j)!.y ? [c.i, c.j] : [c.j, c.i]
          const slope = hi - lo > 1e-9 ? (coord(top) - coord(bot)) / (hi - lo) : 0
          const cu = coord(bot) + slope * (y - lo)
          // WHICH SECTION DIMENSION IS IN VIEW.
          //
          // `columnCage` lays its bars out as [along h, across b] and puts the
          // first on global X, so a column's h runs east–west and its b
          // north–south. An elevation along x therefore sees h and one along z
          // sees b. Drawn as b either way, a 300×500 column on a lettered line
          // came out 300 wide with its bars spread 410 — the steel outside its
          // own concrete, which is what the sheet was showing.
          const face = g.axis === 'x' ? (s.h ?? s.b) : s.b
          elMembers.push({
            mark: c.id, role: 'column',
            u0: cu - face / 2000, u1: cu + face / 2000,
            yBot: Math.max(lo, yLo), yTop: Math.min(hi, yHi),
            bw: s.b, d: s.h ?? s.b, note: bars(c.id),
            ...(Math.abs(slope) > 1e-9 ? { lean: { yRef: y, slope } } : {}),
          })
        }
        if (!elMembers.length) continue

        const ids = new Set([...beams, ...touching].map((m) => m.id))
        // Bubbles at the plan's grid lines crossing this one, labelled by their
        // index on the PLAN — not by their order among this sheet's columns,
        // which renumbered a line that has columns on only some of the grids.
        const crossing = g.axis === 'x' ? planXs : planZs
        const grids = [...new Set(touching.map((c) => {
          const [bot] = pos(c.i)!.y <= pos(c.j)!.y ? [c.i] : [c.j]
          return Math.round(coord(bot) * 1e6) / 1e6
        }))]
          .sort((a, b) => a - b)
          .map((u) => {
            const k = crossing.findIndex((v) => Math.abs(v - u) < 0.05)
            const label = k < 0 ? '' : g.axis === 'x' ? String.fromCharCode(65 + k) : String(k + 1)
            return { u, label }
          })

        const part = runs.length > 1 && grids.length
          ? `${grids[0].label}–${grids[grids.length - 1].label}` : undefined
        out.push({
          // The key is also the SVG download stem, so it is slugged here rather
          // than carrying a letter and a decimal point into a filename.
          key: `frame-${g.label}-${y.toFixed(2)}${part ? `-${part}` : ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          line: g.label,
          level: `EL ${y.toFixed(2)}`,
          ...(part ? { part } : {}),
          input: {
            line: part ? `${g.label} (${part})` : g.label, y, yLo, yHi, plane,
            members: elMembers,
            grids,
            cages: cages.filter((c) => ids.has(c.member)),
            subject: new Set(beams.map((m) => m.id)),
          },
        })
      }
    }
  }
  return out
}
