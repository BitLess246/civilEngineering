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
import type { BeamColumnJointInput, JointConfinement } from '../engine/beamColumnJoint'
import type { SlabDirResult } from '../engine/slabDDM'
import type { ColumnSchematicProps } from '../components/ColumnSchematic'

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
 * What a hooked beam bar anchors into, from the supporting column's section.
 *
 * The beam's direction relative to the column is not resolved here, so the
 * SMALLER column dimension is what the hook is checked against — the sheet
 * would rather warn about a bar that in fact develops than pass one that does
 * not. Without f'c and fy there is no ℓdh to dimension, so the sheet falls
 * back to drawing the hook undimensioned.
 */
function hookAnchorageAt(sec: RectSection | undefined): BeamDetailInput['hookAnchorage'] {
  if (!sec || !Number.isFinite(sec.fc) || !Number.isFinite(sec.fy)) return undefined
  return {
    colH: Math.min(sec.b, sec.h ?? sec.b),
    colBarDia: sec.barDia ?? 20,
    colTieDia: sec.tieDia ?? 10,
    colCover: sec.cover ?? 40,
    fc: sec.fc, fy: sec.fy,
  }
}

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

  /** The supporting column's section at a node — the cage a hook anchors into. */
  const colSectionAt = (node: string): RectSection | undefined => {
    const col = model.members.find((m) => m.role === 'column' && (m.i === node || m.j === node))
    return col ? (secById.get(col.section) as RectSection | undefined) : undefined
  }

  /** Supporting column width at a node, mm — how much joint the sheet draws. */
  const colWidthAt = (node: string): number | undefined => {
    const sec = colSectionAt(node)
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
        hookAnchorage: hookAnchorageAt(colSectionAt(mem.i) ?? colSectionAt(mem.j)),
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

// ── Beam–column joints ──────────────────────────────────────────────────────

export interface JointDetailBundle { mark: string; node: string; detail: BeamColumnJointInput }

/**
 * One joint detail per distinct beam-into-column TYPE.
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
export function jointDetailBundles(model: StructuralModel, design: StructureDesign): JointDetailBundle[] {
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

  const seen = new Set<string>()
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
    const wideBeams = framing.every((f) => ((secById.get(f.m.section) as RectSection | undefined)?.b ?? 0) >= 0.75 * colSec.b)

    const key = `${colSec.b}x${colSec.h ?? colSec.b}-${beamSec.b}x${beamSec.h}-${beamSec.barDia ?? 16}-${topBars}.${botBars}-${confinement}-${interior ? 'through' : 'hooked'}-${spandrelThrough ? spandrelBarDia : 0}`
    if (seen.has(key)) continue
    seen.add(key)
    const mark = `J${seen.size}`
    out.push({
      mark, node,
      detail: {
        mark,
        colB: colSec.b, colH: colSec.h ?? colSec.b,
        colBarDia: colSec.barDia ?? 20, colBars: Math.max(4, colRow.bars),
        hoopDia: colSec.tieDia ?? 10,
        hoopSpacing: colRow.seismicSConf ?? colRow.tieSpacingFinal,
        beamB: beamSec.b, beamH: beamSec.h ?? beamSec.b,
        beamBarDia: beamSec.barDia ?? 16,
        topBars, botBars,
        interior, confinement, wideBeams,
        // the near beam's bars pass through only if the beam itself continues
        barsThrough: interior,
        spandrelBarDia, spandrelThrough,
        fc: colSec.fc, fy: colSec.fy, cover: colSec.cover ?? 40,
      },
    })
  }
  return out
}
