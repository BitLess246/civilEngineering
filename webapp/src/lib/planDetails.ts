// Map a completed structural design onto the plan-renderer / footing-detail
// inputs — so the "Plans" tab (framing + foundation plans, per-footing detail
// sheets) is generated straight from the model + design. Pure & typed; the
// column cross-section is handed to the existing ColumnSchematic report
// component, everything else to the plan-renderer engine.
import type { StructuralModel, RectSection } from '../engine/model'
import type { StructureDesign } from '../engine/pipeline'
import type { PlanFooting } from '../engine/planRenderer'
import type { FootingDetailInput } from '../engine/footingDetail'
import type { ColumnDetailInput } from '../engine/columnDetail'
import type { BeamDetailInput } from '../engine/beamDetail'
import type { SlabOpeningInput } from '../engine/slabOpening'
import type { WallDetailInput } from '../engine/wallDetail'
import type { SlabDirResult } from '../engine/slabDDM'
import type { ColumnSchematicProps } from '../components/ColumnSchematic'

export interface SoilInput { qAllow?: number; gammaSoil?: number; gammaConc?: number; H?: number }


/** Designed footings → the plan renderer's minimal PlanFooting shape. */
export function footingsForPlan(design: StructureDesign): PlanFooting[] {
  return design.footings.map((r) => ({
    node: r.node, B: r.design.B, Dc: r.design.Dc,
    bars: r.design.bars, barSpacing: r.design.barSpacing,
    barDia: r.barDia,
  }))
}

export interface FootingDetailBundle {
  mark: string
  detail: FootingDetailInput
  column: ColumnSchematicProps
}

/** One detail sheet per distinct footing type (grouped by side × thickness, in
 *  the same order the plan marks them WF-1, WF-2…). Each bundle carries the
 *  engine detail input plus the props for the report's column cross-section. */
export function footingDetailBundles(model: StructuralModel, design: StructureDesign, soil: SoilInput = {}): FootingDetailBundle[] {
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
    bundles.push({
      mark,
      detail: {
        mark, B: r.design.B, H: r.design.Dc / 1000, cover: 75,
        barDia: r.barDia,
        bars: r.design.bars, barSpacing: r.design.barSpacing,
        colB, colH, colBars, colBarDia, tieDia, colCover: sec?.cover ?? 40,
        foundingElev: soil.H != null ? -Math.abs(soil.H) : undefined,
        endHook: 'none',
      },
      column: {
        shape: 'tied', b: colB, h: colH,
        cover: sec?.cover ?? 40, barDia: colBarDia, tieDia, bars: colBars, tieSpacing,
      },
    })
  }
  return bundles
}

// ── Typical column details ──────────────────────────────────────────────────

export interface ColumnDetailBundle { mark: string; detail: ColumnDetailInput }

/**
 * One typical column detail per distinct column TYPE, from the design.
 *
 * Grouped by section and tie schedule rather than per member: a 12-storey frame
 * has one detail per column type, not per column. Every figure comes off
 * `ColumnScheduleRow` — the confinement zone and both tie spacings were already
 * being computed by `columnDesign` and shown only as schedule numbers.
 *
 * `lapB`/`lapC` now come off the schedule row — `pipeline` computes them once
 * per column from the adopted section via `calcDevLength` (§425.5), so the
 * sheet prints the real splice length instead of omitting it.
 *
 * A column that CHANGES SECTION between storeys also gets its §410.7.4 offset
 * check, since the crank is part of this detail and nothing checked it before.
 */
export function columnDetailBundles(model: StructuralModel, design: StructureDesign): ColumnDetailBundle[] {
  const secById = new Map(model.sections.map((s) => [s.id, s]))
  const memById = new Map(model.members.map((m) => [m.id, m]))
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]))
  // deepest beam framing in anywhere — the band the column passes through
  const beamDepth = Math.max(
    300,
    ...model.members
      .filter((m) => m.role === 'beam')
      .map((m) => (secById.get(m.section) as RectSection | undefined)?.h ?? 0),
  )

  const seen = new Set<string>()
  const out: ColumnDetailBundle[] = []
  for (const r of design.columns) {
    const mem = memById.get(r.id)
    if (!mem) continue
    const sec = secById.get(mem.section) as RectSection | undefined
    if (!sec) continue
    const key = `${sec.b}x${sec.h ?? sec.b}-${r.bars}-${Math.round(r.tieSpacingFinal)}-${Math.round(r.seismicLoZone ?? 0)}`
    if (seen.has(key)) continue
    seen.add(key)
    const ni = nodeById.get(mem.i), nj = nodeById.get(mem.j)
    const storey = ni && nj ? Math.abs(nj.y - ni.y) : r.L
    out.push({
      mark: `C${seen.size}`,
      detail: {
        mark: `C${seen.size}`,
        b: sec.b, h: sec.h ?? sec.b,
        storey: storey > 0 ? storey : r.L,
        beamDepth,
        bars: Math.max(4, r.bars),
        barDia: sec.barDia ?? 20,
        tieDia: sec.tieDia ?? 10,
        loZone: r.seismicLoZone,
        lapB: r.lapB,
        lapC: r.lapC,
        sConf: r.seismicSConf ?? r.tieSpacingFinal,
        sOut: r.seismicSOut ?? r.tieSpacingFinal,
        cover: sec.cover ?? 40,
      },
    })
  }
  return out
}

// ── Typical beam details ────────────────────────────────────────────────────

export interface BeamDetailBundle { mark: string; detail: BeamDetailInput }

/**
 * One typical beam detail per distinct beam TYPE.
 *
 * Grouped on section + the critical-section bar counts, so a floor of identical
 * beams yields one sheet. The adjacent-span top steel is resolved across the
 * whole schedule: the greatest hogging count found at any support of the same
 * section is carried in, which is the continuity rule §409.7.7 states and the
 * reason a support cannot be detailed from one span alone.
 */
export function beamDetailBundles(model: StructuralModel, design: StructureDesign): BeamDetailBundle[] {
  const secById = new Map(model.sections.map((s) => [s.id, s]))
  const memById = new Map(model.members.map((m) => [m.id, m]))
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]))

  /** Supporting column width at a node, mm — how much joint the sheet draws. */
  const colWidthAt = (node: string): number | undefined => {
    const col = model.members.find((m) => m.role === 'column' && (m.i === node || m.j === node))
    const sec = col ? (secById.get(col.section) as RectSection | undefined) : undefined
    return sec ? Math.min(sec.b, sec.h ?? sec.b) : undefined
  }

  /**
   * Does the beam CONTINUE past this end?
   *
   * The sheet detail turns on it: a beam that stops at a support has to hook
   * its bars down into the column (§425.4.3), and one that runs through does
   * not. "Another beam touches this node" is not enough — a beam framing in at
   * right angles is a different member. Continuity means another beam leaves
   * the node along the SAME line.
   */
  const continuesPast = (memberId: string, node: string, other: string): boolean => {
    const a = nodeById.get(node), o = nodeById.get(other)
    if (!a || !o) return false
    const dx = a.x - o.x, dz = a.z - o.z
    const len = Math.hypot(dx, dz)
    if (len < 1e-9) return false
    return model.members.some((m) => {
      if (m.id === memberId || (m.role !== 'beam' && m.role !== 'girder')) return false
      const far = m.i === node ? m.j : m.j === node ? m.i : null
      if (!far) return false
      const f = nodeById.get(far); if (!f) return false
      const ex = f.x - a.x, ez = f.z - a.z
      const el = Math.hypot(ex, ez)
      if (el < 1e-9) return false
      // collinear and pointing AWAY — the span carries on past the support
      return (dx * ex + dz * ez) / (len * el) > 0.9
    })
  }

  // greatest hogging bar count anywhere on each section — the continuity feed
  const worstTop = new Map<string, number>()
  for (const r of design.beams) {
    const secId = memById.get(r.id)?.section
    if (!secId) continue
    for (const s of r.sections) {
      if (!s.hogging) continue
      worstTop.set(secId, Math.max(worstTop.get(secId) ?? 0, s.design.bars))
    }
  }

  const seen = new Set<string>()
  const out: BeamDetailBundle[] = []
  for (const r of design.beams) {
    const mem = memById.get(r.id)
    if (!mem) continue
    const sec = secById.get(mem.section) as RectSection | undefined
    if (!sec) continue
    const key = `${sec.b}x${sec.h}-${r.sections.map((s) => `${s.hogging ? 'H' : 'S'}${s.design.bars}`).join('.')}`
    if (seen.has(key)) continue
    seen.add(key)
    const mark = `${r.role === 'girder' ? 'G' : 'B'}${seen.size}`
    out.push({
      mark,
      detail: {
        mark, L: r.L, b: sec.b, h: sec.h ?? sec.b,
        barDia: sec.barDia ?? 16,
        stirrupDia: sec.tieDia ?? 10,
        legs: 2,
        sections: r.sections.map((s) => ({
          label: s.label, x: s.x, hogging: s.hogging,
          bars: s.design.bars, stirrupSpacing: s.design.sAdopt,
        })),
        adjacentTopLeft: worstTop.get(mem.section),
        adjacentTopRight: worstTop.get(mem.section),
        colB: colWidthAt(mem.i) ?? colWidthAt(mem.j),
        continuousLeft: continuesPast(mem.id, mem.i, mem.j),
        continuousRight: continuesPast(mem.id, mem.j, mem.i),
        cover: sec.cover,
      },
    })
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
