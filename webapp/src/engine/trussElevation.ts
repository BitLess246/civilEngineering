// ─────────────────────────────────────────────────────────────────────────
// ROOF TRUSS ELEVATION — one truss, in its own plane.
//
// The sheet a fabricator sets a truss out from and an erector checks it
// against, drawn from the members the model actually holds (engine/roofTruss)
// and the forces the design actually found:
//   · every member TO SCALE at its rolled width, chords and webs alike, on the
//     node geometry the solver used — no idealised outline drawn separately;
//   · the design's envelope axial force on each member, T (tension) or C
//     (compression), kN — the brace schedule's Pu / Tu, so the sheet and the
//     S-07 schedule quote one number;
//   · the panel-point chain and the overall span, the rise at the apex, the
//     pitch; the bearing and apex levels;
//   · the purlins in end view at the panel points they sit on, the column
//     grid bubbles over the bearings, the seat at each bearing;
//   · a member schedule by part (top chord, bottom chord, webs): shape, count,
//     worst C and T, worst utilisation — a member that fails is drawn and
//     scheduled in the warning ink and raised as a design note.
//
// Units: input geometry m; the sheet is drawn in mm with y DOWN.
// ─────────────────────────────────────────────────────────────────────────
import type { Drawing, PlanPrimitive } from './planRenderer'
import { titleBlock, sheetBounds, leader, notesBlock, textWidth } from './detailSheet'
import { SHEET_INK, SHEET_NOTE, SHEET_GRID, STEEL_CONTEXT, SHEET_STEELWORK, SHEET_WARN } from './sheetInk'
import { shapeByName, sectionBoundingBox } from './aiscSections'

export type TrussPartKind = 'top' | 'bottom' | 'web'

export interface TrussElevationNode { id: string; u: number; y: number }
export interface TrussElevationMember {
  id: string; i: string; j: string
  part: TrussPartKind
  shape: string
  /** Design envelope, kN — compression Pu, tension Tu; absent before a design. */
  Pu?: number; Tu?: number
  /** Worst demand / capacity; absent before a design. */
  util?: number
  ok?: boolean
}
export interface TrussElevationInput {
  /** The grid line the truss stands on. */
  line: string
  /** Bearing level (top of the column seats), m. */
  bearingY: number
  nodes: TrussElevationNode[]
  members: TrussElevationMember[]
  /** The column grid lines the truss bears on, along u. */
  grids: { label: string; u: number }[]
  /** Nodes carrying a purlin, and its shape. */
  purlinAt: string[]
  purlinShape?: string
  /** Roofing the truss carries, kPa on plan. */
  roofing?: { qD: number; qLr: number }
  /** The §K3 joint results at the panel points (absent before a design). */
  joints?: { node: string; covered: boolean; ok: boolean; util: number }[]
  /** Tributary width of this truss, m (half the spacing either side). */
  spacing?: number
}
export interface TrussElevationOptions { detailNo?: string; sheetRef?: string }
export interface TrussElevationDrawing extends Drawing { title: string; designNotes: string[] }

const fmtLevel = (y: number) => `${y >= 0 ? '+' : '−'}${Math.abs(y).toFixed(3)}`
const PART_LABEL: Record<TrussPartKind, string> = { top: 'TOP CHORD', bottom: 'BOTTOM CHORD', web: 'WEBS' }

/** The force a member is labelled with: the larger of its envelope C and T. */
export function governingForce(m: Pick<TrussElevationMember, 'Pu' | 'Tu'>): { sense: 'T' | 'C'; kN: number } | null {
  if (m.Pu === undefined && m.Tu === undefined) return null
  const c = m.Pu ?? 0, t = m.Tu ?? 0
  return t >= c ? { sense: 'T', kN: t } : { sense: 'C', kN: c }
}

/** Width a shape shows in the truss's plane, mm (HSS b, angle leg, …). */
const planeWidth = (shape: string): number => {
  const s = shapeByName(shape)
  return s ? sectionBoundingBox(s).h : 100
}

export function buildTrussElevation(i: TrussElevationInput, opts: TrussElevationOptions = {}): TrussElevationDrawing {
  const P: PlanPrimitive[] = []
  const notesOut: string[] = []
  const node = new Map(i.nodes.map((n) => [n.id, n]))
  const X = (u: number) => u * 1000, Y = (y: number) => -y * 1000
  const us = i.nodes.map((n) => n.u), ys = i.nodes.map((n) => n.y)
  const uMin = Math.min(...us), uMax = Math.max(...us)
  const yTop = Math.max(...ys)
  const spanMm = X(uMax) - X(uMin)
  const u = Math.max(spanMm, 3000) * 0.016                     // type unit
  const txt = (x: number, y: number, text: string, size = u, anchor: 'start' | 'middle' | 'end' = 'start', color = SHEET_NOTE, weight = 500, rotate?: number) =>
    P.push({ kind: 'text', x, y, text, size, anchor, color, weight, ...(rotate != null ? { rotate } : {}) })

  const yb = Y(i.bearingY)
  const purlin = i.purlinShape ? shapeByName(i.purlinShape) : undefined
  const pD = purlin?.d ?? 0, pB = purlin?.bf ?? 0
  const chordW = Math.max(0, ...i.members.filter((m) => m.part === 'top').map((m) => planeWidth(m.shape)))

  // grid lines over the bearings, and the column below each, as context
  const gTop = Y(yTop) - chordW - pD - u * 4.5
  const colH = u * 6
  for (const g of i.grids) {
    const x = X(g.u)
    P.push({ kind: 'line', x1: x, y1: gTop + u * 1.2, x2: x, y2: yb + colH + u, stroke: SHEET_GRID, width: 0.5, dash: [u * 1.2, u * 0.4, u * 0.2, u * 0.4] })
    P.push({ kind: 'circle', cx: x, cy: gTop, r: u * 1.2, stroke: SHEET_INK, fill: 'none', width: 0.9 })
    txt(x, gTop + u * 0.05, g.label, u * 1.1, 'middle', SHEET_INK, 700)
    const cw = u * 2.2
    P.push({ kind: 'rect', x: x - cw / 2, y: yb + chordW / 2 + u * 0.35, w: cw, h: colH, stroke: STEEL_CONTEXT, fill: 'none', width: 0.6, dash: [u * 0.5, u * 0.3] })
    // the seat: a cap plate the truss bears on — a pin
    P.push({ kind: 'rect', x: x - cw / 2 - u * 0.4, y: yb + chordW / 2, w: cw + u * 0.8, h: u * 0.35, fill: SHEET_INK })
  }

  // members to scale, chords first so the webs draw over their joints
  const order: TrussPartKind[] = ['bottom', 'top', 'web']
  const failed = i.members.filter((m) => m.ok === false)
  for (const part of order) {
    for (const m of i.members.filter((x) => x.part === part)) {
      const a = node.get(m.i), b = node.get(m.j)
      if (!a || !b) continue
      const ax = X(a.u), ay = Y(a.y), bx = X(b.u), by = Y(b.y)
      const L = Math.hypot(bx - ax, by - ay) || 1
      const w = planeWidth(m.shape) / 2
      const nx = (-(by - ay) / L) * w, ny = ((bx - ax) / L) * w
      P.push({
        kind: 'path', closed: true, fill: SHEET_STEELWORK, stroke: m.ok === false ? SHEET_WARN : SHEET_INK, width: part === 'web' ? 0.7 : 0.9,
        cmds: [{ c: 'M', x: ax + nx, y: ay + ny }, { c: 'L', x: bx + nx, y: by + ny }, { c: 'L', x: bx - nx, y: by - ny }, { c: 'L', x: ax - nx, y: ay - ny }],
      })
    }
  }
  for (const n of i.nodes) P.push({ kind: 'circle', cx: X(n.u), cy: Y(n.y), r: u * 0.16, fill: SHEET_INK })
  // §K3 joints: a failing one ringed in the warning ink; one outside the
  // Table K3.2A limits tagged GP — a gusset plate detail, not a §K3 joint
  for (const jt of i.joints ?? []) {
    const n = node.get(jt.node)
    if (!n) continue
    if (!jt.covered) {
      P.push({ kind: 'circle', cx: X(n.u), cy: Y(n.y), r: u * 0.55, stroke: SHEET_NOTE, fill: 'none', width: 0.7 })
      txt(X(n.u), Y(n.y) + chordW / 2 + u * 1.05, 'GP', u * 0.55, 'middle', SHEET_NOTE, 700)
    } else if (!jt.ok) P.push({ kind: 'circle', cx: X(n.u), cy: Y(n.y), r: u * 0.55, stroke: SHEET_WARN, fill: 'none', width: 1.4 })
  }
  for (const jt of i.joints ?? []) if (jt.covered && !jt.ok)
    notesOut.push(`joint ${jt.node} fails its AISC 360-16 §K3 check — utilisation ${jt.util.toFixed(2)}`)

  // purlins in end view, standing on the top chord at their panel points
  for (const id of i.purlinAt) {
    const n = node.get(id)
    if (!n || !purlin) continue
    P.push({ kind: 'rect', x: X(n.u) - pB / 2, y: Y(n.y) - chordW / 2 - pD, w: pB, h: pD, fill: SHEET_STEELWORK, stroke: SHEET_INK, width: 0.7 })
  }

  // forces: on each member, the governing envelope force
  const fsz = u * 0.62
  for (const m of i.members) {
    const f = governingForce(m)
    const a = node.get(m.i), b = node.get(m.j)
    if (!f || !a || !b) continue
    const ax = X(a.u), ay = Y(a.y), bx = X(b.u), by = Y(b.y)
    const mx = (ax + bx) / 2, my = (ay + by) / 2
    const color = m.ok === false ? SHEET_WARN : SHEET_INK
    // a zero-force member (a flat truss's end top chord) reads 0, not "T 0.0"
    const label = f.kN < 0.05 ? '0' : `${f.sense} ${f.kN.toFixed(1)}`
    let ang = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI
    if (ang > 90) ang -= 180
    if (ang < -90) ang += 180                                    // kept readable, left to right
    const L = Math.hypot(bx - ax, by - ay) || 1
    const off = planeWidth(m.shape) / 2 + u * 0.5
    const nx = (-(by - ay) / L) * off, ny = ((bx - ax) / L) * off
    const vertical = Math.abs(bx - ax) < 1e-6
    if (vertical) {
      // a vertical web: beside it, read horizontally
      txt(mx + planeWidth(m.shape) / 2 + u * 0.25, my, label, fsz, 'start', color, 600)
      continue
    }
    // along the member: a top chord's ABOVE it (outside the truss, between
    // the purlins, which stand at the panel points), a bottom chord's BELOW
    // it, a diagonal's on its upper side
    const above = m.part !== 'bottom'
    const [px, py] = (ny < 0) === above ? [mx + nx, my + ny] : [mx - nx, my - ny]
    txt(px, py, label, fsz, 'middle', color, 600, Math.abs(ang) > 0.5 ? ang : undefined)
  }

  // dimensions: the panel chain on the bottom chord, the overall span, the rise
  const bottomNodes = [...new Set(i.members.filter((m) => m.part === 'bottom').flatMap((m) => [m.i, m.j]))]
    .map((id) => node.get(id)!).filter(Boolean).sort((p, q) => p.u - q.u)
  const dChain = yb + chordW / 2 + colH + u * 2.4
  for (let k = 0; k + 1 < bottomNodes.length; k++) {
    const a = bottomNodes[k], b = bottomNodes[k + 1]
    P.push({ kind: 'dim', x1: X(a.u), y1: dChain, x2: X(b.u), y2: dChain, text: `${Math.round(X(b.u) - X(a.u))}`, off: 0, size: u * 0.7, ext: Y(a.y) + chordW / 2 })
  }
  const dSpan = dChain + u * 2.4
  P.push({ kind: 'dim', x1: X(uMin), y1: dSpan, x2: X(uMax), y2: dSpan, text: `SPAN ${Math.round(spanMm)}`, off: 0, size: u * 0.85, ext: dChain })
  // the highest node — on a flat truss, the RIGHTMOST of its top chord, so the
  // level line to the rise dimension does not run back along the whole chord
  const apex = i.nodes.reduce((p, q) => (q.y > p.y + 1e-9 || (Math.abs(q.y - p.y) <= 1e-9 && q.u > p.u) ? q : p))
  const gableApex = apex.u > uMin + 1e-6 && apex.u < uMax - 1e-6
  const riseMm = (apex.y - i.bearingY) * 1000
  // the rise, at the right of the truss, apex level to bearing level
  const xr = X(uMax) + u * 3
  P.push({ kind: 'line', x1: X(apex.u) + u * 0.6, y1: Y(apex.y), x2: xr + u * 0.6, y2: Y(apex.y), stroke: SHEET_GRID, width: 0.4, dash: [u * 0.5, u * 0.3] })
  P.push({ kind: 'dim', x1: xr, y1: Y(apex.y), x2: xr, y2: yb, text: `${Math.round(riseMm)}`, off: 0, size: u * 0.75 })
  txt(xr + u * 1.0, Y(apex.y), `${gableApex ? 'APEX' : 'TOP CHORD'} ${fmtLevel(apex.y)}`, u * 0.8, 'start', SHEET_INK, 600)
  txt(xr + u * 1.0, yb, `BEARING ${fmtLevel(i.bearingY)}`, u * 0.8, 'start', SHEET_INK, 600)

  // a leader to one purlin, naming them
  const pFirst = i.purlinAt.map((id) => node.get(id)).filter(Boolean).sort((a, b) => a!.u - b!.u)[0]
  if (pFirst && purlin) {
    const px = X(pFirst.u), py = Y(pFirst.y) - chordW / 2 - pD
    P.push(...leader({ x: px, y: py, tx: px - u * 3, ty: gTop + u * 1.6, text: `PURLIN ${purlin.name} AT EACH PANEL POINT`, size: u * 0.75 }))
  }

  // the member schedule, by part
  const parts = order.map((part) => {
    const ms = i.members.filter((m) => m.part === part)
    if (!ms.length) return null
    const shapes = [...new Set(ms.map((m) => m.shape))]
    const C = Math.max(0, ...ms.map((m) => m.Pu ?? 0)), T = Math.max(0, ...ms.map((m) => m.Tu ?? 0))
    const designed = ms.some((m) => m.util !== undefined)
    const util = Math.max(0, ...ms.map((m) => m.util ?? 0))
    const ok = ms.every((m) => m.ok !== false)
    return { part, n: ms.length, shapes, C, T, util, designed, ok }
  }).filter((r): r is NonNullable<typeof r> => !!r)
  const tSize = u * 0.78, rowH = u * 1.5
  const cols: { head: string; w: number }[] = [
    { head: 'PART', w: 9 }, { head: 'SHAPE', w: 10 }, { head: 'No.', w: 3.5 },
    { head: 'C max kN', w: 6 }, { head: 'T max kN', w: 6 }, { head: 'UTIL', w: 4.5 }, { head: '', w: 4 },
  ]
  const x0 = X(uMin) - u * 2
  let ty = dSpan + u * 3.2
  txt(x0, ty, 'TRUSS MEMBER SCHEDULE', u * 0.95, 'start', SHEET_INK, 700)
  ty += rowH
  let cx = x0
  for (const c of cols) { txt(cx, ty, c.head, tSize, 'start', SHEET_INK, 700); cx += c.w * u }
  const tW = cols.reduce((s, c) => s + c.w, 0) * u
  P.push({ kind: 'line', x1: x0, y1: ty + rowH * 0.45, x2: x0 + tW, y2: ty + rowH * 0.45, stroke: SHEET_INK, width: 0.6 })
  for (const r of parts) {
    ty += rowH
    const cells = [PART_LABEL[r.part], r.shapes.join(', '), String(r.n),
      r.designed ? r.C.toFixed(1) : '—', r.designed ? r.T.toFixed(1) : '—', r.designed ? r.util.toFixed(2) : '—',
      !r.designed ? '' : r.ok ? 'OK' : 'FAIL']
    cx = x0
    cells.forEach((v, k) => { txt(cx, ty, v, tSize, 'start', r.ok ? SHEET_NOTE : SHEET_WARN, k === 0 || k === 6 ? 700 : 500); cx += cols[k].w * u })
  }
  if (i.joints?.length) {
    ty += rowH
    cx = x0
    const cov = i.joints.filter((jt) => jt.covered)
    const jOk = cov.every((jt) => jt.ok)
    const gp = i.joints.length - cov.length
    ;['JOINTS §K3', gp ? `${gp} GP (gusset plate)` : 'HSS-to-HSS', String(cov.length), '', '',
      cov.length ? Math.max(...cov.map((jt) => jt.util)).toFixed(2) : '—', cov.length ? (jOk ? 'OK' : 'FAIL') : '']
      .forEach((v, k) => { txt(cx, ty, v, tSize, 'start', jOk ? SHEET_NOTE : SHEET_WARN, k === 0 || k === 6 ? 700 : 500); cx += cols[k].w * u })
  }
  if (purlin) {
    ty += rowH
    cx = x0
    ;['PURLINS', purlin.name, String(i.purlinAt.length), '', '', '', ''].forEach((v, k) => { txt(cx, ty, v, tSize, 'start', SHEET_NOTE, k === 0 ? 700 : 500); cx += cols[k].w * u })
  }
  for (const m of failed)
    notesOut.push(`${m.id} (${m.shape}) fails its axial check — utilisation ${(m.util ?? 0).toFixed(2)}; choose a heavier shape`)

  // notes and title
  const pitch = gableApex && riseMm > 0
    ? `PITCH 1 : ${((X(apex.u) - X(uMin)) / riseMm).toFixed(2)} (${((Math.atan2(riseMm, X(apex.u) - X(uMin)) * 180) / Math.PI).toFixed(1)}°). ` : ''
  const notes = [
    `FORCES = DESIGN ENVELOPE AXIAL, kN: T TENSION, C COMPRESSION (THE S-07 BRACE SCHEDULE'S Tu / Pu). MEMBERS DRAWN TO SCALE ON THEIR CENTRELINES; DIMENSIONS mm, LEVELS m.`,
    `${pitch}CHORDS CONTINUOUS THROUGH THE PANEL POINTS; WEBS PINNED; TRUSS SEATED ON A PIN AT EACH BEARING. MEMBERS DESIGNED AS AXIAL STEEL (AISC 360-16 §D2, §E3).`,
    ...(i.joints?.length ? ['PANEL-POINT JOINTS CHECKED TO AISC 360-16 §K3 (HSS-TO-HSS) IN EVERY COMBINATION; GP = OUTSIDE TABLE K3.2A (E.G. A DIAGONAL FLATTER THAN 30°) — DETAIL WITH A GUSSET PLATE.'] : []),
    ...(i.roofing ? [`CARRIES ROOFING ${i.roofing.qD.toFixed(2)} kPa DEAD + ${i.roofing.qLr.toFixed(2)} kPa ROOF LIVE ON PLAN${i.spacing ? `, OVER A ${i.spacing.toFixed(2)} m STRIP` : ''}, AT THE TOP-CHORD PANEL POINTS.`] : []),
  ]
  const lvlX0 = x0
  const sheetW = Math.max(xr + u * 9, x0 + tW) - lvlX0
  const nb = notesBlock({ x: lvlX0, w: sheetW, top: ty + u * 2, size: u * 0.75, lines: notes, color: SHEET_NOTE })
  P.push(...nb.prims)
  const title = `ROOF TRUSS ELEVATION — GRID ${i.line}`
  const tu = u * 0.8, r = tu * 2.6
  const tbW = Math.max(sheetW, 2 * r + tu * 0.8 + textWidth(title, r * 0.95) + tu)
  P.push(...titleBlock({ x: lvlX0, w: tbW, top: nb.bottom + u, u: tu, title, detailNo: opts.detailNo, sheetRef: opts.sheetRef, scale: 'NTS' }).prims)
  return { primitives: P, bounds: sheetBounds(P, u), title, designNotes: notesOut }
}
