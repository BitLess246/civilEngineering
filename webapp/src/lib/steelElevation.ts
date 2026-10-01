// ─────────────────────────────────────────────────────────────────────────
// One steel framing elevation per grid line that carries steel — the model and
// the design reduced to `engine/steelElevation`'s input. Grid lines and their
// labels are the framing plans' own (`gridLines`), and the end marks are
// `steelMarks`', so the elevation names what the plans and the S-11 sheets name.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, RectSection } from '../engine/model'
import type { StructureDesign } from '../engine/pipeline'
import { shapeByName } from '../engine/aiscSections'
import { columnSplices, type SteelElevationInput, type SteelElevationColumn, type SteelElevationBeam, type ColumnSplice } from '../engine/steelElevation'
import { gridLines } from './planDetails'
import { connectionMarks, markAt } from './steelMarks'

export interface SteelElevationBundle { key: string; line: string; input: SteelElevationInput }

export function steelElevationBundles(model: StructuralModel, design: StructureDesign): SteelElevationBundle[] {
  if (!design.steelBeams.length && !design.steelColumns.length) return []
  const node = new Map(model.nodes.map((n) => [n.id, n]))
  const sec = new Map(model.sections.map((s) => [s.id, s as RectSection]))
  const colRow = new Map(design.steelColumns.map((c) => [c.id, c]))
  const beamRow = new Map(design.steelBeams.map((b) => [b.id, b]))
  const plateAt = new Set(design.basePlates.map((b) => b.node))
  const strongAt = new Map(design.joints.map((j) => [j.nodeId, j.strongAxisDir]))
  const marks = connectionMarks(design)
  const out: SteelElevationBundle[] = []

  for (const g of gridLines(model)) {
    const onLine = (id: string) => {
      const n = node.get(id)
      return !!n && Math.abs((g.axis === 'x' ? n.z : n.x) - g.at) < 1e-6
    }
    const uOf = (id: string) => { const n = node.get(id)!; return g.axis === 'x' ? n.x : n.z }
    const members = model.members.filter((m) => onLine(m.i) && onLine(m.j))
    const cols = members.filter((m) => m.role === 'column' && colRow.has(m.id))
    const beams = members.filter((m) => (m.role === 'beam' || m.role === 'girder') && beamRow.has(m.id))
    if (!cols.length && !beams.length) continue

    const columns: SteelElevationColumn[] = cols.map((m) => {
      const a = node.get(m.i)!, b = node.get(m.j)!
      const shape = shapeByName(colRow.get(m.id)!.shape)
      // which dimension this plane sees: d when the strong axis runs along the line
      const top = a.y > b.y ? m.i : m.j, foot = a.y > b.y ? m.j : m.i
      const dir = strongAt.get(top) ?? strongAt.get(foot) ?? g.axis
      const face = dir === g.axis ? (shape?.d ?? 300) : (shape?.bf ?? 300)
      return { id: m.id, u: uOf(m.i), yBot: Math.min(a.y, b.y), yTop: Math.max(a.y, b.y), shape: colRow.get(m.id)!.shape, face, basePlate: plateAt.has(foot) }
    })
    const elBeams: SteelElevationBeam[] = beams.map((m) => {
      const r = beamRow.get(m.id)!
      const ui = uOf(m.i), uj = uOf(m.j)
      const [nI, nJ] = ui <= uj ? [m.i, m.j] : [m.j, m.i]
      return {
        id: m.id, u0: Math.min(ui, uj), u1: Math.max(ui, uj), y: node.get(m.i)!.y,
        shape: r.shape, d: shapeByName(r.shape)?.d ?? sec.get(m.section)?.h ?? 300,
        markI: markAt(marks, m.id, nI), markJ: markAt(marks, m.id, nJ), camber: r.camber,
      }
    })
    // splices, stack by stack (one stack per column position on the line)
    const splices: ColumnSplice[] = []
    for (const u of [...new Set(columns.map((c) => Math.round(c.u * 1e6) / 1e6))]) {
      const stack = columns.filter((c) => Math.abs(c.u - u) < 1e-6)
        .map((c) => ({ id: c.id, yBot: c.yBot, yTop: c.yTop, shape: c.shape, Tu: colRow.get(c.id)!.Tu }))
      splices.push(...columnSplices(stack))
    }
    const grids = gridLines(model).filter((o) => o.axis !== g.axis).map((o) => ({ label: o.label, u: o.at }))
      .filter((o) => columns.some((c) => Math.abs(c.u - o.u) < 1e-6) || elBeams.some((b) => o.u >= b.u0 - 1e-6 && o.u <= b.u1 + 1e-6))
    const levels = [...new Set(elBeams.map((b) => b.y))].sort((a, b) => a - b)
    out.push({ key: `steel-elevation-${g.label.toLowerCase()}`, line: g.label, input: { line: g.label, grids, levels, columns, beams: elBeams, splices } })
  }
  return out
}
