// Map a completed structural design onto the plan-renderer / footing-detail
// inputs — so the "Plans" tab (framing + foundation plans, per-footing detail
// sheets) is generated straight from the model + design. Pure & typed; the
// column cross-section is handed to the existing ColumnSchematic report
// component, everything else to the plan-renderer engine.
import type { StructuralModel, RectSection } from '../engine/model'
import type { StructureDesign } from '../engine/pipeline'
import type { PlanFooting } from '../engine/planRenderer'
import type { FootingDetailInput } from '../engine/footingDetail'
import type { SlabOpeningInput } from '../engine/slabOpening'
import type { WallDetailInput } from '../engine/wallDetail'
import type { BeamColumnJointInput, JointConfinement } from '../engine/beamColumnJoint'
import type { SlabDirResult } from '../engine/slabDDM'
import type { ColumnSchematicProps } from '../components/ColumnSchematic'
import type { FrameElevationInput, ElevationMember } from '../engine/frameElevation'
import type { ColumnStackDetailInput, ColumnStackSegment } from '../engine/columnStackDetail'
import { elevationPlane, projectPoint, type RebarCage, type Vec3, type ViewPlane } from '../engine/rebarModel'
import { cutCage, sliceCages, type CageCut } from '../engine/cageSection'
import { tieSetLevels } from '../engine/columnStackDetail'
import { stationZones } from '../engine/beamSection'

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
  const isolated: PlanFooting[] = design.footings.map((r) => ({
    kind: 'isolated' as const,
    node: r.node, B: r.design.B, Dc: r.design.Dc,
    bars: r.design.bars, barSpacing: r.design.barSpacing,
    barDia: r.barDia,
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

  const seen = new Set<string>()
  const bundles: FootingDetailBundle[] = []
  for (const r of design.footings) {
    const key = `${Math.round(r.design.B * 1000)}x${Math.round(r.design.Dc)}`
    if (seen.has(key)) continue
    seen.add(key)
    const mark = `WF-${seen.size}`
    const mem = colAt(r.node)
    const sec: RectSection | undefined = mem ? secById.get(mem.section) : undefined
    const colB = sec?.b ?? 400, colH = sec?.h ?? colB
    const colBarDia = sec?.barDia ?? 16, tieDia = sec?.tieDia ?? 10
    const colRow = mem ? colRowById.get(mem.id) : undefined
    const colBars = Math.max(4, colRow?.bars ?? 8)
    const tieSpacing = colRow?.tieSpacingFinal
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
        column: cages.find((cc) => cc.member === mem.id),
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
        foundingElev: soil.H != null ? -Math.abs(soil.H) : undefined,
        endHook: 'none',
        ...(detailCages?.footing || detailCages?.column ? { cages: detailCages } : {}),
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
  const cols = model.members.filter((m) => m.role === 'column')
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
    const mark = `C-${grid}`
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

export interface SlabOpeningBundle { mark: string; plate: string; opening: string; detail: SlabOpeningInput }

/**
 * The TIGHTEST mat spacing designed anywhere in one direction of a panel, mm.
 *
 * The bars an opening interrupts are the ones at the opening's own location,
 * and the DDM designs a different spacing for every strip and every critical
 * section. Detailing off the densest of them replaces at least as many bars as
 * the hole actually cut, whichever strip it landed in — the opposite choice
 * would leave the panel short wherever the mat is tighter than the average.
 */
function tightestSpacing(d: SlabDirResult): number {
  const all = d.locations.flatMap((l) => [l.column.spacing, l.middle.spacing]).filter((s) => s > 0 && Number.isFinite(s))
  return all.length ? Math.min(...all) : 200
}

/**
 * One trimmer-bar detail per opening, from the designed slab panel it is cast
 * in (`Plate.openings` × `design.slabs`).
 *
 * Openings on a panel the pipeline did not design as a RC slab — a timber deck,
 * a wall, or a panel carrying no area load — are skipped rather than detailed
 * against a guessed mat: the whole rule is "equal in number and size to those
 * interrupted", so without a designed mat there is nothing to be equal to.
 *
 * Panel marks follow the framing plan's own rule (pooled by thickness × span
 * type, S1, S2 …) so the sheet and the plan call the same panel the same thing.
 */
export function slabOpeningBundles(model: StructuralModel, design: StructureDesign): SlabOpeningBundle[] {
  const rowByPlate = new Map(design.slabs.map((s) => [s.plate, s]))
  const secById = new Map(model.sections.map((s) => [s.id, s]))
  // f'c / fy from a column framing into the panel — the same source the
  // pipeline used to design the mat.
  const concreteAt = (node: string): RectSection | undefined => {
    const mem = model.members.find((m) => m.i === node || m.j === node)
    return mem ? (secById.get(mem.section) as RectSection | undefined) : undefined
  }

  // panel marks, pooled exactly as the plan pools them
  const markByKey = new Map<string, string>()
  const markFor = (thk: number, twoWay: boolean): string => {
    const key = `${Math.round(thk)}|${twoWay ? 'Two-way' : 'One-way'}`
    let mk = markByKey.get(key)
    if (!mk) { mk = `S${markByKey.size + 1}`; markByKey.set(key, mk) }
    return mk
  }

  const out: SlabOpeningBundle[] = []
  for (const p of model.plates) {
    if (p.role !== 'slab') continue
    const row = rowByPlate.get(p.id)
    // Marked for EVERY slab panel, not only the ones with openings, so the
    // numbering keeps step with the plan's schedule.
    const long = Math.max(row?.lx ?? 1, row?.ly ?? 1), short = Math.max(Math.min(row?.lx ?? 1, row?.ly ?? 1), 1e-9)
    const mark = markFor(p.thickness, long / short <= 2)
    if (!p.openings?.length || !row) continue
    const sec = concreteAt(p.corners[0])
    for (const o of p.openings) {
      out.push({
        mark: `${mark}/${o.id}`, plate: p.id, opening: o.id,
        detail: {
          lx: row.lx, ly: row.ly, h: row.design.h, opening: o,
          barDia: row.barDia,
          spacingX: tightestSpacing(row.design.x),
          spacingY: tightestSpacing(row.design.y),
          dx: row.design.x.d, dy: row.design.y.d,
          cover: 20,                                   // the pipeline's slab cover
          fc: sec?.fc, fy: sec?.fy,
          colSize: sec ? Math.min(sec.b, sec.h ?? sec.b) : undefined,
          mark: `${mark}/${o.id}`,
        },
      })
    }
  }
  return out
}

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

// ── Beam–column joints ──────────────────────────────────────────────────────

export interface JointDetailBundle {
  mark: string
  node: string
  /** Grid position of THIS joint — 'A1'. */
  grid: string
  /** The floor the joint sits at — 'SECOND FLOOR', or '' if it is off-grid. */
  level: string
  detail: BeamColumnJointInput
}

/**
 * One joint detail PER JOINT.
 *
 * The joint is the one piece of the frame neither member design looks at: the
 * beam sheet designs the beam, the column sheet the column, and §418.8 is about
 * the block they share. Everything here comes off the two schedule rows that
 * meet at the node — this adds no new analysis.
 *
 * `Vcol` is deliberately NOT passed. §418.8.2.1 allows the column shear to be
 * subtracted from the joint demand, but taking a credit the schedule cannot
 * confirm would quietly weaken every joint on the sheet; omitting it is the
 * conservative side and it is stated in the notes.
 */
/**
 * How a model names its own positions — the convention the framing plans'
 * bubbles already use: a LETTERED line for the z ordinate, a NUMBERED one for
 * the x, and floors counted up from the base.
 *
 * Shared, because two sheet sets name the same joint: the column stack detail
 * calls it C-A1 and the joint detail calls it J-A1@3.50, and if those two ever
 * disagreed about which position is A1 the drawing set would be describing two
 * different buildings.
 */
export function modelGrid(model: StructuralModel): {
  floorOf: (y: number) => string
  gridRef: (x: number, z: number) => string
  levels: number[]
} {
  const round6 = (v: number) => Math.round(v * 1e6) / 1e6
  const levels = [...new Set(model.nodes.map((n) => round6(n.y)))].sort((a, b) => a - b)
  const ORD = ['GROUND', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'SIXTH', 'SEVENTH',
    'EIGHTH', 'NINTH', 'TENTH', 'ELEVENTH', 'TWELFTH']
  const xs = [...new Set(model.nodes.map((n) => round6(n.x)))].sort((a, b) => a - b)
  const zs = [...new Set(model.nodes.map((n) => round6(n.z)))].sort((a, b) => a - b)
  return {
    levels,
    floorOf: (y) => {
      const k = levels.indexOf(round6(y))
      return k <= 0 ? 'BASE' : `${ORD[k - 1] ?? `${k}TH`} FLOOR`
    },
    gridRef: (x, z) =>
      `${String.fromCharCode(65 + Math.max(0, zs.indexOf(round6(z))))}${1 + Math.max(0, xs.indexOf(round6(x)))}`,
  }
}

export function jointDetailBundles(
  model: StructuralModel, design: StructureDesign, cages: RebarCage[] = [],
): JointDetailBundle[] {
  const secById = new Map(model.sections.map((s) => [s.id, s]))
  const memById = new Map(model.members.map((m) => [m.id, m]))
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]))
  const beamRowById = new Map(design.beams.map((r) => [r.id, r]))
  const isBeam = (role: string) => role === 'beam' || role === 'girder'

  /** Beams framing into a node, with their plan directions. */
  const beamsAt = (node: string) => model.members
    .filter((m) => isBeam(m.role) && (m.i === node || m.j === node))
    .map((m) => {
      const a = nodeById.get(node), f = nodeById.get(m.i === node ? m.j : m.i)
      const dx = a && f ? f.x - a.x : 0, dz = a && f ? f.z - a.z : 0
      const len = Math.hypot(dx, dz) || 1
      return { m, ux: dx / len, uz: dz / len }
    })

  const { floorOf, gridRef } = modelGrid(model)
  const out: JointDetailBundle[] = []
  for (const colRow of design.columns) {
    const col = memById.get(colRow.id); if (!col) continue
    const colSec = secById.get(col.section) as RectSection | undefined; if (!colSec) continue
    // the joint is at the column's TOP node — where the beams frame in
    const ni = nodeById.get(col.i), nj = nodeById.get(col.j)
    if (!ni || !nj) continue
    const node = ni.y >= nj.y ? col.i : col.j
    const framing = beamsAt(node)
    if (!framing.length) continue

    // the deepest beam decides the detail; its own row carries the bar counts
    const lead = framing.reduce((best, f) => {
      const hb = (secById.get(f.m.section) as RectSection | undefined)?.h ?? 0
      const hbest = (secById.get(best.m.section) as RectSection | undefined)?.h ?? 0
      return hb > hbest ? f : best
    })
    const beamSec = secById.get(lead.m.section) as RectSection | undefined; if (!beamSec) continue
    const beamRow = beamRowById.get(lead.m.id)
    const topBars = Math.max(2, ...(beamRow?.sections ?? []).filter((s) => s.hogging).map((s) => s.design.bars))
    const botBars = Math.max(2, ...(beamRow?.sections ?? []).filter((s) => !s.hogging).map((s) => s.design.bars))

    // Confinement class — Table 418.8.4.3, from how many beams actually arrive.
    const n = framing.length
    const opposite = framing.some((f) => framing.some((g) => f !== g && f.ux * g.ux + f.uz * g.uz < -0.9))
    const confinement: JointConfinement =
      n >= 4 ? 'four-faces' : n === 3 ? 'three-faces' : n === 2 && opposite ? 'two-opposite' : 'other'
    const interior = framing.some((f) => f !== lead && f.ux * lead.ux + f.uz * lead.uz < -0.9)
    // §418.8.2.3 is conditioned on bars EXTENDING THROUGH the joint, so the
    // bundler has to say, per direction, whether they do. A beam continuing
    // past the column runs its bars through; one that stops there hooks them,
    // and the 20db rule is not about those (§418.8.2.2 / §418.8.5 are).
    const perpendicular = framing.filter((f) => Math.abs(f.ux * lead.ux + f.uz * lead.uz) < 0.1)
    const spandrelThrough = perpendicular.some((f) =>
      perpendicular.some((g) => f !== g && f.ux * g.ux + f.uz * g.uz < -0.9))
    const spandrelBarDia = spandrelThrough
      ? Math.max(...perpendicular.map((f) => (secById.get(f.m.section) as RectSection | undefined)?.barDia ?? 0))
      : undefined
    // ORIENTED TO THE BEAM, not to the world axes.
    //
    // `columnCage` lays a column section out with h across x and b across z, so
    // which of the two is the depth PARALLEL to the beam's bars depends on which
    // way the beam runs — and §418.8.2.3 (20db of joint depth parallel to bars
    // passing through) and §418.8.4.3 (Aj = bj·h, bj measured across the beam)
    // both ask for it in the beam's own frame. Taken as h and b regardless, a
    // 300×500 column under a beam running along z was checked on 500 mm of
    // depth it does not have that way, and drawn 500 wide when it is 300.
    const secH = colSec.h ?? colSec.b
    const alongX = Math.abs(lead.ux) >= Math.abs(lead.uz)
    const colDepth = alongX ? secH : colSec.b        // parallel to the beam
    const colWidth = alongX ? colSec.b : secH        // across it
    const wideBeams = framing.every((f) => ((secById.get(f.m.section) as RectSection | undefined)?.b ?? 0) >= 0.75 * colWidth)

    // WHICH FACES ARE FRAMED — the drawing shows this joint's own members, so
    // it needs them per face rather than per type. The section is cut along the
    // lead beam, so the sides of the cut are the sign of the cross product of
    // the lead direction with each perpendicular beam's.
    const side = (f: { ux: number; uz: number }) => lead.ux * f.uz - lead.uz * f.ux
    const framedFaces = {
      far: interior,
      spandrelPos: perpendicular.some((f) => side(f) > 0.1),
      spandrelNeg: perpendicular.some((f) => side(f) < -0.1),
    }
    // A column carries on above only if another column starts at this node.
    const columnAbove = model.members.some((m) =>
      m.role === 'column' && m.id !== col.id
      && [m.i, m.j].includes(node)
      && (nodeById.get(m.i === node ? m.j : m.i)?.y ?? -Infinity) > (nodeById.get(node)?.y ?? 0) + 1e-6)

    // NAMED FOR THE JOINT IT IS, not for a type it belongs to.
    //
    // These used to be deduplicated by a key over the two sections, the bar
    // counts and the confinement class, so a frame emitted two or three sheets
    // called J1, J2 — and none of them was a joint anybody could point at. But
    // what the sheet is ABOUT varies joint by joint: how many beams arrive
    // (Table 418.8.4.3's confinement class), whether the near beam continues
    // past the column so its bars run through (§418.8.2.3) or stops and hooks
    // (§418.8.2.2), and whether a spandrel passes through the other way. A
    // corner joint and an interior joint on the same two sections are different
    // details, and the typical sheet showed one of them.
    const at = nodeById.get(node)
    const grid = at ? gridRef(at.x, at.z) : node

    // ── the joint's steel, cut out of the placed cage ─────────────────────
    //
    // The plan is cut at the beam's TOP STEEL, because that is the level the
    // plan section exists to answer for: whether the beam bars pass INSIDE the
    // column verticals, and how the spandrel crosses them. Cut at mid-depth the
    // plane would meet no longitudinal steel at all — a beam bar runs parallel
    // to it.
    //
    // The frame is the BEAM's: u along the beam (the sheet's +x, towards the
    // near beam) and v across it, chosen so that +v is the side the sheet draws
    // at the bottom — the same sign `side()` gives `spandrelNeg` above, or the
    // spandrel would be drawn on one side and its steel on the other.
    const colCage = cages.find((c) => c.member === col.id)
    const cageCut = at && colCage ? (() => {
      const leadCage = cages.find((c) => c.member === lead.m.id)
      const topSteel = (leadCage?.runs ?? [])
        .filter((rr) => rr.role === 'top')
        .map((rr) => Math.max(...rr.path.map((pt) => pt[1])))
      // failing a cage to read it from, a bar diameter under the beam's top
      const yBars = topSteel.length ? Math.max(...topSteel)
        : at.y - ((colSec.cover ?? 40) + (colSec.tieDia ?? 10) + (beamSec.barDia ?? 16) / 2) / 1000
      // TWO LEVELS, which is what a joint's plan section is.
      //
      // The column is cut at the joint's MID-DEPTH: its verticals and a joint
      // hoop are there at every joint, which is not true higher up — at a ROOF
      // joint the column bars turn in UNDER the beam's top steel and stop
      // (measured: verticals to 2.920, top steel at 2.940), so a cut taken at
      // the bar level passes over the column entirely and the plan came out
      // with a hoop and no bars in it. The beam steel is sliced at its own
      // level. Both share one plane ORIENTATION and plan origin, so the two
      // land in one frame; only the height differs, and for a horizontal plane
      // that does not touch the projected coordinates at all.
      const yMid = at.y - (beamSec.h ?? beamSec.b) / 2000
      const frame = (y: number): CageCut => {
        const origin: Vec3 = [at.x, y, at.z]
        return {
          at: origin, normal: [0, 1, 0],
          plane: { origin, u: [lead.ux, 0, lead.uz], v: [lead.uz, 0, -lead.ux] },
        }
      }
      const cut = frame(yMid), barCut = frame(yBars)
      const beamCages = framing
        .map((f) => cages.find((c) => c.member === f.m.id))
        .filter((c): c is RebarCage => !!c)
      // The beams are SLICED, the column CUT. A beam's top bar runs along the
      // plane and then hooks down out of it, so asking whether it lies in the
      // plane drops exactly the bars entering the joint; a 50 mm slice keeps
      // the straight length and lets the hook stop where it turns. The column
      // is a true cut: its verticals cross the plane, and it wants its NEAREST
      // hoop set and nothing else, which is what `cutCage` gives unasked.
      const beam = beamCages.length
        ? sliceCages(beamCages, barCut, 0.05) : undefined
      const band: [number, number] = [at.y - (beamSec.h ?? beamSec.b) / 1000, at.y]
      // The beam's own bar lines, as depths below the joint top — the section
      // draws its hooked bars on these rather than at nominal cover.
      const barLine = (role: 'top' | 'bottom') => {
        const ys = (leadCage?.runs ?? []).filter((rr) => rr.role === role)
          .map((rr) => role === 'top'
            ? Math.max(...rr.path.map((pt) => pt[1]))
            : Math.min(...rr.path.map((pt) => pt[1])))
        return ys.length ? at.y - (role === 'top' ? Math.max(...ys) : Math.min(...ys)) : undefined
      }
      const top = barLine('top'), bottom = barLine('bottom')
      return {
        column: cutCage(colCage, cut),
        ...(beam?.length ? { beam } : {}),
        hoopDepths: tieSetLevels([colCage], band[0], band[1]).map((y) => at.y - y),
        ...(top != null && bottom != null ? { beamBarDepths: { top, bottom } } : {}),
      }
    })() : undefined
    // Grid line and elevation together — the two things that let a builder
    // stand at the joint the sheet is drawing, and unique across the frame.
    const mark = at ? `J-${grid}@${at.y.toFixed(2)}` : `J-${grid}`
    out.push({
      mark, node, grid,
      level: at ? floorOf(at.y) : '',
      detail: {
        mark,
        colB: colWidth, colH: colDepth,
        colBarDia: colSec.barDia ?? 20, colBars: Math.max(4, colRow.bars),
        hoopDia: colSec.tieDia ?? 10,
        hoopSpacing: colRow.seismicSConf ?? colRow.tieSpacingFinal,
        beamB: beamSec.b, beamH: beamSec.h ?? beamSec.b,
        beamBarDia: beamSec.barDia ?? 16,
        topBars, botBars,
        interior, confinement, wideBeams, framedFaces, columnAbove,
        ...(cageCut ? { cage: cageCut } : {}),
        // the near beam's bars pass through only if the beam itself continues
        barsThrough: interior,
        spandrelBarDia, spandrelThrough,
        fc: colSec.fc, fy: colSec.fy, cover: colSec.cover ?? 40,
      },
    })
  }
  return out
}

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
  input: FrameElevationInput
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

  const uniq = (vs: number[]) => [...new Set(vs.map((v) => Math.round(v * 1e6) / 1e6))].sort((a, b) => a - b)
  const xs = uniq(pts.map((p) => p.x))
  const zs = uniq(pts.map((p) => p.z))
  const out: GridLine[] = []
  // A line in x is labelled by letter and identified by its z; a line in z by
  // number and its x — the same convention the framing plan's bubbles use.
  zs.forEach((z, k) => {
    if (pts.filter((p) => Math.abs(p.z - z) < 1e-6).length < 2) return
    out.push({ label: String.fromCharCode(65 + k), at: z, axis: 'x' })
  })
  xs.forEach((x, k) => {
    if (pts.filter((p) => Math.abs(p.x - x) < 1e-6).length < 2) return
    out.push({ label: String(k + 1), at: x, axis: 'z' })
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
    const members = model.members.filter((m) => onLine(m.i) && onLine(m.j))
    const cols = members.filter((m) => m.role === 'column')

    for (const y of levels) {
      const beams = members.filter((m) => isBeam(m.role)
        && Math.abs(pos(m.i)!.y - y) < 1e-6 && Math.abs(pos(m.j)!.y - y) < 1e-6)
      if (!beams.length) continue

      // The columns meeting this level, split into the one below and the one
      // above at each grid position.
      const touching = cols.filter((c) => {
        const a = pos(c.i)!.y, b = pos(c.j)!.y
        return Math.abs(a - y) < 1e-6 || Math.abs(b - y) < 1e-6
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
        const cu = coord(c.i)
        const lo = Math.min(pos(c.i)!.y, pos(c.j)!.y), hi = Math.max(pos(c.i)!.y, pos(c.j)!.y)
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
        })
      }
      if (!elMembers.length) continue

      const ids = new Set([...beams, ...touching].map((m) => m.id))
      const grids = [...new Set(touching.map((c) => Math.round(coord(c.i) * 1e6) / 1e6))]
        .sort((a, b) => a - b)
        .map((u, k) => ({ u, label: g.axis === 'x' ? String(k + 1) : String.fromCharCode(65 + k) }))

      out.push({
        // The key is also the SVG download stem, so it is slugged here rather
        // than carrying a letter and a decimal point into a filename.
        key: `frame-${g.label}-${y.toFixed(2)}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        line: g.label,
        level: `EL ${y.toFixed(2)}`,
        input: {
          line: g.label, y, yLo, yHi, plane,
          members: elMembers,
          grids,
          cages: cages.filter((c) => ids.has(c.member)),
          subject: new Set(beams.map((m) => m.id)),
        },
      })
    }
  }
  return out
}
