// ─────────────────────────────────────────────────────────────────────────
// THE SCHEDULE SHEETS of a steel or timber frame — what the RC set says with
// bar details, these say with shapes, plates, bolts, sizes and decks.
//
// Every number is read off the design the Design tab shows (pipeline rows,
// connection and base-plate designs) — nothing is re-derived here, so a sheet
// cannot disagree with the schedule it was printed from.
// Units: lengths m (members) / mm (plates, sections), forces kN, moments kN·m.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel } from '../engine/model'
import type { StructureDesign } from '../engine/pipeline'
import type { BeamConnection } from '../engine/steelConnections'
import { shapeByName } from '../engine/aiscSections'
import { buildScheduleSheet, type ScheduleTable } from '../engine/scheduleSheet'
import type { Drawing } from '../engine/planRenderer'
import { pedestalMarks } from './planDetails'

const STEEL_DENSITY = 7850   // kg/m³
const f0 = (v: number) => v.toFixed(0), f1 = (v: number) => v.toFixed(1), f2 = (v: number) => v.toFixed(2)
const pct = (v: number) => `${Math.round(v * 100)}%`
const status = (ok: boolean) => (ok ? 'OK' : 'CHECK')

/** Rows that share a key are one schedule line: count, length and the worst utilisation. */
function group<T>(items: T[], key: (t: T) => string) {
  const m = new Map<string, T[]>()
  for (const t of items) { const k = key(t); const g = m.get(k); if (g) g.push(t); else m.set(k, [t]) }
  return [...m.values()]
}

const connType = (c: BeamConnection, beamToBeam = false): string =>
  beamToBeam ? 'Fin plate (coped)'
    : c.connType === 'moment-flange-weld' ? 'Moment — CJP flanges'
      : c.connType === 'moment-web-plate' ? 'Moment — web ext. plates'
        : 'Shear tab (pin)'

const weldOf = (c: BeamConnection): string =>
  `${c.tab.weldSizeMm} E70XX${c.connType === 'moment-flange-weld' ? ' + CJP flg' : c.connType === 'moment-web-plate' ? ' + ext. plates' : ''}`

/** The RC pedestals under one material's columns, one line per PD mark —
 *  the marks the footing sheets carry. Null where there are none. */
function pedestalTable(design: StructureDesign, material: 'steel' | 'wood'): ScheduleTable | null {
  const marks = pedestalMarks(design)
  const rows = (design.pedestals ?? []).filter((p) => p.material === material)
  if (!rows.length) return null
  const lines = group(rows, (p) => marks.get(p.node) ?? p.node).map((g) => {
    const d = g[0].design
    return {
      row: [marks.get(g[0].node) ?? '—', g.map((p) => p.node).join(', '), `${d.side}×${d.side}`, f2(d.height),
        `${d.bars}-⌀${d.barDia}`, `⌀${d.tieDia} @ ${d.tieSpacing}`, pct(Math.max(...g.map((p) => p.design.util)))],
      ok: g.every((p) => p.ok),
    }
  })
  return {
    heading: 'RC PEDESTAL SCHEDULE',
    columns: [{ head: 'MARK', w: 7 }, { head: 'NODES', w: 24 }, { head: 'SIZE mm', w: 10 }, { head: 'HEIGHT m', w: 9, align: 'end' }, { head: 'VERT.', w: 9 }, { head: 'TIES', w: 11 }, { head: 'MAX UTIL', w: 9, align: 'end' }],
    rows: lines.map((l) => l.row),
    failRows: lines.flatMap((l, i) => (l.ok ? [] : [i])),
    note: 'Top of footing to grade. NSCP §410 strain compatibility, biaxial by the linear load contour; plus 2 tie sets within the top 125 mm around the anchor rods (§410.7.6.1.6).',
  }
}

/** The steel member, base-plate and connection schedules. Empty for a frame with no steel. */
export function steelScheduleDrawings(design: StructureDesign): { key: string; title: string; drawing: Drawing }[] {
  if (!design.steelBeams.length && !design.steelColumns.length) return []
  const members = [
    ...design.steelColumns.map((c) => ({ shape: c.shape, role: 'column', L: c.L, util: c.ratio, ok: c.ok })),
    ...design.steelBeams.map((b) => ({ shape: b.shape, role: b.role, L: b.L, util: Math.max(b.utilM, b.utilV), ok: b.ok })),
  ]
  const memberRows = group(members, (m) => `${m.role}|${m.shape}`).map((g) => {
    const A = shapeByName(g[0].shape)?.A ?? 0
    const L = g.reduce((s, m) => s + m.L, 0)
    return { row: [g[0].shape, g[0].role, `${g.length}`, f1(L), f0((A / 1e6) * L * STEEL_DENSITY), pct(Math.max(...g.map((m) => m.util)))], ok: g.every((m) => m.ok) }
  })
  const kgTotal = members.reduce((s, m) => s + ((shapeByName(m.shape)?.A ?? 0) / 1e6) * m.L * STEEL_DENSITY, 0)

  const tables: ScheduleTable[] = [{
    heading: 'STEEL MEMBER SCHEDULE',
    columns: [{ head: 'SHAPE', w: 14 }, { head: 'ROLE', w: 10 }, { head: 'PCS', w: 6, align: 'end' }, { head: 'LENGTH m', w: 10, align: 'end' }, { head: 'MASS kg', w: 10, align: 'end' }, { head: 'MAX UTIL', w: 10, align: 'end' }],
    rows: [...memberRows.map((r) => r.row), ['TOTAL', '', `${members.length}`, f1(members.reduce((s, m) => s + m.L, 0)), f0(kgTotal), '']],
    failRows: memberRows.flatMap((r, i) => (r.ok ? [] : [i])),
    note: 'Net mass ρA·L at 7 850 kg/m³, node to node. Connections, base plates and splices not included. AISC 360-16 LRFD.',
  }]
  if (design.basePlates.length) tables.push({
    heading: 'BASE-PLATE SCHEDULE',
    columns: [{ head: 'NODE', w: 10 }, { head: 'COLUMN', w: 12 }, { head: 'PLATE N×B×t mm', w: 18 }, { head: 'Pu kN', w: 9, align: 'end' }, { head: 'Tu kN', w: 9, align: 'end' }, { head: 'BEARING', w: 10, align: 'end' }, { head: 'STATUS', w: 9 }],
    rows: design.basePlates.map((b) => [b.node, b.shape, `${f0(b.design.N)}×${f0(b.design.B)}×${b.tAdopt}`, f1(b.Pu), b.Tu > 0 ? f1(b.Tu) : '—', pct(b.design.bearingUtil), status(b.ok)]),
    failRows: design.basePlates.flatMap((b, i) => (b.ok ? [] : [i])),
    note: 'AISC 360-16 §J8 / Design Guide 1. N along the column depth d, B along bf. Non-shrink grout under every plate.',
  })
  const ped = pedestalTable(design, 'steel')
  if (ped) tables.push(ped)
  const conns = [
    ...design.joints.flatMap((j) => j.connections.map((c) => ({ node: j.nodeId, c, bb: false }))),
    ...design.beamJoints.flatMap((j) => j.connections.map((c) => ({ node: j.nodeId, c, bb: true }))),
  ]
  const connTable: ScheduleTable | null = conns.length ? {
    heading: 'STEEL CONNECTION SCHEDULE',
    columns: [{ head: 'NODE', w: 9 }, { head: 'BEAM', w: 10 }, { head: 'TYPE', w: 22 }, { head: 'BOLTS', w: 14 }, { head: 'PLATE t×h', w: 11 }, { head: 'WELD mm', w: 18 }, { head: 'Vu kN', w: 8, align: 'end' }, { head: 'Mu kN·m', w: 9, align: 'end' }, { head: 'STATUS', w: 9 }],
    rows: conns.map(({ node, c, bb }) => [node, c.beamId, connType(c, bb), `${c.bolts.n}×M${c.bolts.dia} A325`, `${c.tab.t}×${f0(c.tab.hMm)}`, weldOf(c), f1(c.Vu), c.pinned ? '—' : f1(c.Mu), status(c.ok)]),
    failRows: conns.flatMap((x, i) => (x.c.ok ? [] : [i])),
    note: 'Each end is built as analysed: a moment connection unless the end is Simple (a pin, released in the analysis). Plates Fy 248 MPa; bolts single shear.',
  } : null

  const out = [{ key: 'steel-schedules', title: 'Steel member, base-plate and pedestal schedules', drawing: buildScheduleSheet(tables, { title: 'STEEL MEMBER, BASE-PLATE & PEDESTAL SCHEDULES', sheetRef: 'S-07' }) }]
  if (connTable) out.push({ key: 'steel-connection-schedule', title: 'Steel connection schedule', drawing: buildScheduleSheet([connTable], { title: 'STEEL CONNECTION SCHEDULE', detailNo: '2', sheetRef: 'S-07' }) })
  return out
}

/** The timber member and deck schedules. Empty for a frame with no timber. */
export function timberScheduleDrawings(model: StructuralModel, design: StructureDesign): { key: string; title: string; drawing: Drawing }[] {
  if (!design.woodBeams.length && !design.woodColumns.length && !design.woodSlabs.length) return []
  const members = [
    ...design.woodColumns.map((c) => ({ ...c, role: 'column', util: c.ratio })),
    ...design.woodBeams.map((b) => ({ ...b, util: Math.max(b.utilM, b.utilV) })),
  ]
  const memberRows = group(members, (m) => `${m.role}|${m.b}×${m.d}|${m.species}|${m.kind}`).map((g) => {
    const L = g.reduce((s, m) => s + m.L, 0)
    return { row: [`${g[0].b}×${g[0].d}`, g[0].species, g[0].kind, g[0].role, `${g.length}`, f1(L), f2((g[0].b / 1000) * (g[0].d / 1000) * L), pct(Math.max(...g.map((m) => m.util)))], ok: g.every((m) => m.ok) }
  })
  const tables: ScheduleTable[] = []
  if (memberRows.length) tables.push({
    heading: 'TIMBER MEMBER SCHEDULE',
    columns: [{ head: 'SIZE b×d mm', w: 12 }, { head: 'SPECIES', w: 10 }, { head: 'KIND', w: 8 }, { head: 'ROLE', w: 9 }, { head: 'PCS', w: 6, align: 'end' }, { head: 'LENGTH m', w: 10, align: 'end' }, { head: 'VOL m³', w: 9, align: 'end' }, { head: 'MAX UTIL', w: 10, align: 'end' }],
    rows: memberRows.map((r) => r.row),
    failRows: memberRows.flatMap((r, i) => (r.ok ? [] : [i])),
    note: 'Actual dimensions, not nominal. NDS §3 / NSCP 2015 Chapter 6, LRFD (Appendix N). Connections are not designed on this set.',
  })
  const plateById = new Map(model.plates.map((p) => [p.id, p]))
  if (design.woodSlabs.length) tables.push({
    heading: 'TIMBER DECK SCHEDULE',
    columns: [{ head: 'PANEL', w: 10 }, { head: 'SPAN m', w: 8, align: 'end' }, { head: 'JOISTS', w: 20 }, { head: 'DECK mm', w: 9, align: 'end' }, { head: 'SPECIES', w: 10 }, { head: 'DECK UTIL', w: 10, align: 'end' }, { head: 'JOIST UTIL', w: 10, align: 'end' }, { head: 'STATUS', w: 9 }],
    rows: design.woodSlabs.map((s) => {
      const dk = plateById.get(s.plate)?.deck
      return [s.plate, f2(s.lx), dk ? `${s.design.takeoff.joistCount} · ${dk.joistB}×${dk.joistD} @ ${dk.joistSpacing}` : `${s.design.takeoff.joistCount} joists`,
        dk ? `${dk.deckThickness}` : '—', s.species, pct(s.design.deck.ratio), pct(s.design.joist.ratio), status(s.ok)]
    }),
    failRows: design.woodSlabs.flatMap((s, i) => (s.ok ? [] : [i])),
    note: 'Joists span the short side of the panel; deck boards run continuous over at least three joists. Service deflection L/360 live, L/240 total.',
  })
  const ped = pedestalTable(design, 'wood')
  if (ped) tables.push(ped)
  return tables.length ? [{ key: 'timber-schedules', title: 'Timber member and deck schedules', drawing: buildScheduleSheet(tables, { title: 'TIMBER MEMBER AND DECK SCHEDULES', sheetRef: 'S-07' }) }] : []
}
