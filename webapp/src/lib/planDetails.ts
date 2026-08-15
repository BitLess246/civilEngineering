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
