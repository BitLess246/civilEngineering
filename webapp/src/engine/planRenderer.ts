// ─────────────────────────────────────────────────────────────────────────
// Plan renderer engine — derive a CAD-style structural PLAN drawing (top view)
// from the 3D model: column grid + bubbles, column sections, framing beams with
// size labels, slab panels, and chained grid dimensions.  Pure geometry: it emits
// a list of typed primitives in WORLD metres plus the drawing bounds, so the
// renderer (planToSvg / a React <PlanView>) only has to scale and paint.
//
// Phase 1: framing / foundation plan (grid, bubbles, columns, beams, panels,
// grid dimensions).  Footing details & schedules follow in later phases.
//
// World axes: X = model x, Y = model z (plan runs in the x–z ground plane); the
// serializer maps world → pixels (Y increases downward, drafting convention).
// Units: coordinates m; section sizes mm.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, RectSection } from './model'

export type PathCmd =
  | { c: 'M' | 'L'; x: number; y: number }
  | { c: 'A'; rx: number; ry: number; x: number; y: number; large?: 0 | 1; sweep?: 0 | 1 }

export type PlanPrimitive =
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; width?: number; dash?: number[] }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; stroke?: string; fill?: string; width?: number; dash?: number[] }
  | { kind: 'circle'; cx: number; cy: number; r: number; stroke?: string; fill?: string; width?: number }
  | { kind: 'text'; x: number; y: number; text: string; size: number; anchor?: 'start' | 'middle' | 'end'; rotate?: number; color?: string; weight?: number }
  | { kind: 'dim'; x1: number; y1: number; x2: number; y2: number; text: string; off: number; size: number }
  // world-space path (coords in m, arc radii in m) — used for outlined rebar tubes
  | { kind: 'path'; cmds: PathCmd[]; stroke?: string; fill?: string; width?: number; dash?: number[]; closed?: boolean; fillRule?: 'evenodd' | 'nonzero'; opacity?: number; join?: 'round' | 'miter' | 'bevel'; cap?: 'round' | 'butt' | 'square' }

export interface BeamScheduleRow { mark: string; size: string }
export interface FootingScheduleRow { mark: string; size: string; thk: string; reinf: string }
export interface ColumnScheduleRow { mark: string; size: string; notes: string }

/** Minimal per-footing shape the foundation plan needs — mapped from the
 *  pipeline's `design.footings` by the caller, so this module stays decoupled
 *  from the design pipeline. Geometry in m; thickness/spacing in mm. */
export interface PlanFooting { node: string; B: number; Dc: number; bars: number; barSpacing: number; barDia?: number }

/** Anything the serializer can paint: typed primitives + their world bounds.
 *  Both plan drawings and standalone details satisfy this. */
export interface Drawing {
  primitives: PlanPrimitive[]
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}

export interface PlanDrawing extends Drawing {
  title: string
  beamSchedule: BeamScheduleRow[]
  footingSchedule: FootingScheduleRow[]
  columnSchedule: ColumnScheduleRow[]
}

export interface PlanOptions {
  kind?: 'framing' | 'foundation'
  /** Framing sub-sheet: 'beam' (beams + slab, columns as reference) or 'column'
   *  (columns + schedule only). Omit for the combined framing plan. */
  layer?: 'beam' | 'column'
  /** Storey level index (1 = first floor above base). Default: first framed level. */
  level?: number
  /** Title-block detail number, sheet reference and scale note. */
  detailNo?: string
  sheetRef?: string
  scale?: string
  /** Foundation plan: designed footings (from `design.footings`) to draw + schedule. */
  footings?: PlanFooting[]
  /** Foundation plan: top-of-footing elevation (m, −down) for per-footing ELEV tags. */
  foundingElev?: number
  /** Extra title suffix, e.g. a floor label — 'FRAMING PLAN — L2 (EL +6.00 m)'. */
  label?: string
}

const INK = '#1e293b', GRID = '#94a3b8', BEAM = '#0f4c92', COL = '#1e293b', PANEL = '#0f766e'

const uniq = (vals: number[]): number[] => {
  const out: number[] = []
  for (const v of [...vals].sort((a, b) => a - b)) if (!out.length || Math.abs(v - out[out.length - 1]) > 0.05) out.push(v)
  return out
}
const near = (a: number, b: number) => Math.abs(a - b) < 0.05
const gridLabel = (i: number) => String.fromCharCode(65 + i)   // A, B, C …

/** Build a plan drawing (framing or foundation) from the model. */
export function buildPlan(model: StructuralModel, opts: PlanOptions = {}): PlanDrawing | null {
  if (!model.nodes.length) return null
  const nm = new Map(model.nodes.map((n) => [n.id, n]))
  const secOf = (memberId: string): RectSection | undefined => {
    const mem = model.members.find((x) => x.id === memberId)
    return mem ? model.sections.find((s) => s.id === mem.section) : undefined
  }
  const xs = uniq(model.nodes.map((n) => n.x))
  const zs = uniq(model.nodes.map((n) => n.z))
  const ys = uniq(model.nodes.map((n) => n.y))
  if (xs.length < 1 || zs.length < 1) return null
  const x0 = xs[0], x1 = xs[xs.length - 1], z0 = zs[0], z1 = zs[zs.length - 1]

  // level to draw: default the first framed level above the base (or the base for foundation)
  const foundation = opts.kind === 'foundation'
  const layer = foundation ? undefined : opts.layer   // 'beam' | 'column' | undefined (both)
  const levelY = foundation ? ys[0] : (opts.level != null ? ys[opts.level] : (ys[1] ?? ys[0]))

  const P: PlanPrimitive[] = []
  const ext = Math.max(0.6, Math.max(x1 - x0, z1 - z0, 1) * 0.04)   // grid-line overrun / bubble radius
  const r = ext
  const dimTextH = r * 0.8   // dimension text height (world m)
  // stand the bubbles off from the plan by three dimension-text-heights so the
  // (enlarged) chained dimensions clear the bubble ring
  const bubbleShift = 3 * dimTextH

  // ── grid lines (column lines ‖ Y at each x, rows ‖ X at each z) ──
  // top/left ends run out to meet the shifted bubbles
  for (const x of xs) P.push({ kind: 'line', x1: x, y1: z0 - ext - bubbleShift, x2: x, y2: z1 + ext, stroke: GRID, width: 0.6, dash: [0.25, 0.18] })
  for (const z of zs) P.push({ kind: 'line', x1: x0 - ext - bubbleShift, y1: z, x2: x1 + ext, y2: z, stroke: GRID, width: 0.6, dash: [0.25, 0.18] })
  // bubbles: letters across the top, numbers down the left
  xs.forEach((x, i) => {
    const cy = z0 - ext - r - bubbleShift
    P.push({ kind: 'circle', cx: x, cy, r, stroke: INK, fill: '#fff', width: 0.6 })
    P.push({ kind: 'text', x, y: cy, text: gridLabel(i), size: r * 1.1, anchor: 'middle', color: INK, weight: 700 })
  })
  zs.forEach((z, i) => {
    const cx = x0 - ext - r - bubbleShift
    P.push({ kind: 'circle', cx, cy: z, r, stroke: INK, fill: '#fff', width: 0.6 })
    P.push({ kind: 'text', x: cx, y: z, text: String(i + 1), size: r * 1.1, anchor: 'middle', color: INK, weight: 700 })
  })

  // ── framing beams/girders at the level: centreline + BEAM MARK (FB1, FB2…) ──
  // marks group by section size; each first-seen size gets the next FB number and
  // a schedule row.
  const markBySize = new Map<string, string>()
  const schedule: BeamScheduleRow[] = []
  const markFor = (sec: RectSection): string => {
    const key = `${sec.b}×${sec.h}`
    let mk = markBySize.get(key)
    if (!mk) { mk = `FB${markBySize.size + 1}`; markBySize.set(key, mk); schedule.push({ mark: mk, size: key }) }
    return mk
  }
  // column marks (C1, C2…) group by section id
  const colMarkBySec = new Map<string, string>()
  const columnSchedule: ColumnScheduleRow[] = []
  const colMarkFor = (sec: RectSection): string => {
    const key = `${sec.b}×${sec.h}|${sec.fc}|${sec.fy}`   // identical columns share a mark
    let mk = colMarkBySec.get(key)
    if (!mk) { mk = `C${colMarkBySec.size + 1}`; colMarkBySec.set(key, mk); columnSchedule.push({ mark: mk, size: `${sec.b}×${sec.h}`, notes: `f'c=${sec.fc} MPa` }) }
    return mk
  }
  // footing marks (WF-1, WF-2…) group by side × thickness
  const footMarkBySize = new Map<string, string>()
  const footingSchedule: FootingScheduleRow[] = []
  const footMarkFor = (f: PlanFooting): string => {
    const Bmm = Math.round(f.B * 1000)
    const key = `${Bmm}x${Math.round(f.Dc)}`
    let mk = footMarkBySize.get(key)
    if (!mk) {
      mk = `WF-${footMarkBySize.size + 1}`; footMarkBySize.set(key, mk)
      const sp = Math.round(f.barSpacing)
      const reinf = f.barDia ? `${f.bars}-⌀${f.barDia}@${sp} mm E.W.` : `${f.bars}@${sp} mm E.W.`
      footingSchedule.push({ mark: mk, size: `${Bmm}×${Bmm}`, thk: `${Math.round(f.Dc)}`, reinf })
    }
    return mk
  }
  for (const mem of model.members) {
    if (layer === 'column') break   // column layout sheet — no beams
    if (mem.role === 'column') continue
    const a = nm.get(mem.i), b = nm.get(mem.j); if (!a || !b) continue
    if (!(near(a.y, levelY) && near(b.y, levelY))) continue   // only members on this level
    const sec = secOf(mem.id)
    // draw the beam/girder to its real WIDTH b — two edge lines offset ±b/2
    // perpendicular to the member axis (not a single centreline)
    const bw = (sec?.b ?? 300) / 1000
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1
    const ox = (-dz / len) * (bw / 2), oz = (dx / len) * (bw / 2)
    for (const s of [1, -1])
      P.push({ kind: 'line', x1: a.x + s * ox, y1: a.z + s * oz, x2: b.x + s * ox, y2: b.z + s * oz, stroke: BEAM, width: 1.0 })
    if (sec) {
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2
      const vertical = Math.abs(b.z - a.z) > Math.abs(b.x - a.x)
      // horizontal marks sit just BELOW their beam (toward the interior) so the
      // perimeter row never clashes with the grid-dimension chain above it
      P.push({ kind: 'text', x: mx + (vertical ? r * 0.45 : 0), y: mz + (vertical ? 0 : r * 0.55), text: markFor(sec), size: r * 0.55, anchor: 'middle', rotate: vertical ? -90 : 0, color: BEAM, weight: 700 })
    }
  }

  // ── foundation: designed footing pads + tie beams (drawn under the column
  // stubs so the stub reads on top) ──
  if (foundation && opts.footings?.length) {
    const foots = opts.footings
      .map((f) => ({ f, n: nm.get(f.node) }))
      .filter((x): x is { f: PlanFooting; n: NonNullable<typeof x.n> } => !!x.n && near(x.n.y, levelY))
    // tie beams: connect footing centres that are adjacent along a grid line
    const tieDrawn = new Set<string>()
    const drawTies = (groups: Map<number, { x: number; z: number }[]>, axis: 'x' | 'z') => {
      for (const pts of groups.values()) {
        pts.sort((p, q) => (axis === 'x' ? p.z - q.z : p.x - q.x))
        for (let i = 0; i < pts.length - 1; i++) {
          const u = pts[i], v = pts[i + 1]
          const kk = `${u.x.toFixed(2)},${u.z.toFixed(2)}-${v.x.toFixed(2)},${v.z.toFixed(2)}`
          if (tieDrawn.has(kk)) continue; tieDrawn.add(kk)
          P.push({ kind: 'line', x1: u.x, y1: u.z, x2: v.x, y2: v.z, stroke: BEAM, width: 1.2, dash: [0.35, 0.18] })
          const mx = (u.x + v.x) / 2, mz = (u.z + v.z) / 2, vertical = axis === 'x'
          P.push({ kind: 'text', x: mx + (vertical ? r * 0.4 : 0), y: mz + (vertical ? 0 : r * 0.45), text: 'FTB1', size: r * 0.42, anchor: 'middle', rotate: vertical ? -90 : 0, color: BEAM, weight: 600 })
        }
      }
    }
    const byX = new Map<number, { x: number; z: number }[]>()
    const byZ = new Map<number, { x: number; z: number }[]>()
    for (const { n } of foots) {
      const kx = Math.round(n.x * 20) / 20, kz = Math.round(n.z * 20) / 20
      ;(byX.get(kx) ?? byX.set(kx, []).get(kx)!).push({ x: n.x, z: n.z })
      ;(byZ.get(kz) ?? byZ.set(kz, []).get(kz)!).push({ x: n.x, z: n.z })
    }
    drawTies(byX, 'x'); drawTies(byZ, 'z')
    // footing pads + marks + ELEV tags
    for (const { f, n } of foots) {
      const B = f.B, mk = footMarkFor(f)
      P.push({ kind: 'rect', x: n.x - B / 2, y: n.z - B / 2, w: B, h: B, stroke: COL, fill: 'none', width: 1.1, dash: [0.3, 0.18] })
      // mark centred above the pad, elevation tag below — clear of the stub
      P.push({ kind: 'text', x: n.x, y: n.z - B / 2 - r * 0.32, text: mk, size: r * 0.46, anchor: 'middle', color: COL, weight: 700 })
      if (opts.foundingElev != null)
        P.push({ kind: 'text', x: n.x, y: n.z + B / 2 + r * 0.34, text: `EL ${opts.foundingElev.toFixed(2)} m`, size: r * 0.34, anchor: 'middle', color: PANEL, weight: 500 })
    }
  }

  // ── columns at the level (section square) ──
  const drawn = new Set<string>()
  for (const mem of model.members) {
    if (mem.role !== 'column') continue
    const a = nm.get(mem.i), b = nm.get(mem.j); if (!a || !b) continue
    // a column crosses the level if the level sits within its vertical extent
    const lo = Math.min(a.y, b.y), hi = Math.max(a.y, b.y)
    if (!(levelY >= lo - 0.05 && levelY <= hi + 0.05)) continue
    const node = near(a.y, levelY) ? a : near(b.y, levelY) ? b : a
    const key = `${node.x.toFixed(2)},${node.z.toFixed(2)}`
    if (drawn.has(key)) continue
    drawn.add(key)
    const sec = secOf(mem.id)
    const cw = (sec?.b ?? 400) / 1000, ch = (sec?.h ?? 400) / 1000
    const mk = sec ? colMarkFor(sec) : ''   // collect the column schedule (marks shown in the table)
    // on the foundation plan a designed footing sits under the stub → draw the
    // stub solid so it reads inside the dashed pad; on the BEAM sheet columns are
    // drawn as a light reference outline; on the COLUMN sheet they are solid + marked
    const footed = foundation && !!opts.footings?.length
    const outline = (foundation && !footed) || layer === 'beam'
    P.push({ kind: 'rect', x: node.x - cw / 2, y: node.z - ch / 2, w: cw, h: ch, stroke: layer === 'beam' ? GRID : COL, fill: outline ? 'none' : COL, width: layer === 'beam' ? 0.8 : 1.2, dash: outline ? [0.2, 0.15] : undefined })
    if (layer === 'column' && sec)
      P.push({ kind: 'text', x: node.x + cw / 2 + r * 0.25, y: node.z - ch / 2 - r * 0.25, text: mk, size: r * 0.55, anchor: 'start', color: COL, weight: 700 })
  }

  // ── slab panels at the level (outline + thickness label) ──
  for (const p of model.plates) {
    if (layer === 'column') break   // column layout sheet — no slab panels
    if (p.role === 'wall') continue
    const c = p.corners.map((id) => nm.get(id)); if (c.some((q) => !q)) continue
    const cc = c as { x: number; y: number; z: number }[]
    if (!cc.every((q) => near(q.y, levelY))) continue
    for (let i = 0; i < 4; i++) {
      const u = cc[i], v = cc[(i + 1) % 4]
      P.push({ kind: 'line', x1: u.x, y1: u.z, x2: v.x, y2: v.z, stroke: PANEL, width: 0.5, dash: [0.15, 0.12] })
    }
    const mx = (cc[0].x + cc[2].x) / 2, mz = (cc[0].z + cc[2].z) / 2
    P.push({ kind: 'text', x: mx, y: mz, text: `h=${Math.round(p.thickness)} mm`, size: r * 0.5, anchor: 'middle', color: PANEL, weight: 600 })
  }

  // ── chained grid dimensions — placed INSIDE the bubbles (between the bubble
  // ring and the framing), not beyond them ──
  const dimOffTop = z0 - ext * 0.75 - dimTextH * 1.5
  for (let i = 0; i < xs.length - 1; i++)
    P.push({ kind: 'dim', x1: xs[i], y1: dimOffTop, x2: xs[i + 1], y2: dimOffTop, text: `${Math.round((xs[i + 1] - xs[i]) * 1000)} mm`, off: 0, size: dimTextH })
  const dimOffLeft = x0 - ext * 0.75 - dimTextH * 1.5
  for (let i = 0; i < zs.length - 1; i++)
    P.push({ kind: 'dim', x1: dimOffLeft, y1: zs[i], x2: dimOffLeft, y2: zs[i + 1], text: `${Math.round((zs[i + 1] - zs[i]) * 1000)} mm`, off: 0, size: dimTextH })

  // ── title block (detail tag) + beam schedule, below the plan ──
  const detailNo = opts.detailNo ?? '1', sheetRef = opts.sheetRef ?? 'S-1', scale = opts.scale ?? 'NTS'
  const baseTitle = foundation ? 'FOUNDATION PLAN' : layer === 'beam' ? 'BEAM FRAMING PLAN' : layer === 'column' ? 'COLUMN FRAMING PLAN' : 'FRAMING PLAN'
  const title = `${baseTitle}${opts.label ? ` — ${opts.label}` : ''}`
  const tbR = r * 1.15, tbY = z1 + ext + r * 2, tbX = x0 - ext
  P.push({ kind: 'circle', cx: tbX + tbR, cy: tbY, r: tbR, stroke: INK, fill: '#fff', width: 1 })
  P.push({ kind: 'line', x1: tbX, y1: tbY, x2: tbX + 2 * tbR, y2: tbY, stroke: INK, width: 1 })
  P.push({ kind: 'text', x: tbX + tbR, y: tbY - tbR * 0.5, text: detailNo, size: tbR * 0.75, anchor: 'middle', color: INK, weight: 700 })
  P.push({ kind: 'text', x: tbX + tbR, y: tbY + tbR * 0.5, text: sheetRef, size: tbR * 0.6, anchor: 'middle', color: INK, weight: 700 })
  const lnX0 = tbX + 2 * tbR + r * 0.3, lnX1 = x1 + ext
  P.push({ kind: 'line', x1: lnX0, y1: tbY, x2: lnX1, y2: tbY, stroke: INK, width: 1.4 })
  P.push({ kind: 'text', x: lnX0 + r * 0.15, y: tbY - tbR * 0.55, text: title, size: tbR * 0.95, anchor: 'start', color: INK, weight: 700 })
  P.push({ kind: 'text', x: lnX0 + r * 0.15, y: tbY + tbR * 0.55, text: 'SCALE', size: tbR * 0.4, anchor: 'start', color: INK, weight: 600 })
  P.push({ kind: 'text', x: lnX1 - r * 0.3, y: tbY + tbR * 0.55, text: scale, size: tbR * 0.4, anchor: 'end', color: INK, weight: 600 })

  // schedule tables below the title block — beam (framing) or footing + column
  // (foundation).  Returns the Y just past the drawn table so tables can stack.
  const rowH = r * 0.85
  const drawTable = (tX: number, tY: number, heading: string, hColor: string, colW: number[], rows: string[][]): number => {
    P.push({ kind: 'text', x: tX, y: tY - r * 0.35, text: heading, size: r * 0.5, anchor: 'start', color: hColor, weight: 700 })
    rows.forEach((row, ri) => {
      const y = tY + ri * rowH, head = ri === 0
      let cx = tX
      row.forEach((cell, ci) => {
        P.push({ kind: 'rect', x: cx, y, w: colW[ci], h: rowH, stroke: INK, width: 0.6, fill: head ? '#eef2f7' : '#fff' })
        P.push({ kind: 'text', x: ci === 0 ? cx + colW[ci] / 2 : cx + r * 0.2, y: y + rowH / 2, text: cell, size: r * 0.42, anchor: ci === 0 ? 'middle' : 'start', color: INK, weight: head ? 700 : 500 })
        cx += colW[ci]
      })
    })
    return tY + rows.length * rowH
  }
  const withUnit = (v: string, u = 'mm') => `${v} ${u}`   // units on every schedule value
  const colRows = () => [['MARK', 'SIZE', 'REMARKS'], ...columnSchedule.map((c) => [c.mark, withUnit(c.size), c.notes])]
  const tblY0 = tbY + tbR + r * 1.2
  if (foundation) {
    let y = tblY0
    if (footingSchedule.length) {
      const rows = [['MARK', 'SIZE', 'THK', 'REINF.'], ...footingSchedule.map((f) => [f.mark, withUnit(f.size), withUnit(f.thk), f.reinf])]
      y = drawTable(tbX, y, 'FOOTING SCHEDULE', BEAM, [r * 1.9, r * 3.4, r * 2.0, r * 5.4], rows) + r * 1.4
    }
    if (columnSchedule.length) drawTable(tbX, y, 'COLUMN SCHEDULE', COL, [r * 1.6, r * 3.4, r * 4.4], colRows())
  } else if (layer === 'column') {
    if (columnSchedule.length) drawTable(tbX, tblY0, 'COLUMN SCHEDULE', COL, [r * 1.6, r * 3.4, r * 4.4], colRows())
  } else if (schedule.length) {
    const rows = [['MARK', 'SIZE'], ...schedule.map((s) => [s.mark, withUnit(s.size)])]
    drawTable(tbX, tblY0, 'BEAM SCHEDULE', BEAM, [r * 1.6, r * 3.6], rows)
  }

  // ── bounds = span of every primitive coordinate ──
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const acc = (x: number, y: number) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y) }
  for (const pr of P) {
    if (pr.kind === 'line' || pr.kind === 'dim') { acc(pr.x1, pr.y1); acc(pr.x2, pr.y2) }
    else if (pr.kind === 'rect') { acc(pr.x, pr.y); acc(pr.x + pr.w, pr.y + pr.h) }
    else if (pr.kind === 'circle') { acc(pr.cx - pr.r, pr.cy - pr.r); acc(pr.cx + pr.r, pr.cy + pr.r) }
    else if (pr.kind === 'path') { for (const cmd of pr.cmds) acc(cmd.x, cmd.y) }
    else acc(pr.x, pr.y)
  }
  return {
    primitives: P,
    bounds: { minX, minY, maxX, maxY },
    title,
    beamSchedule: schedule,
    footingSchedule,
    columnSchedule,
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Serialise a drawing (plan or detail) to an SVG string (world metres → px,
 *  Y downward). Only `primitives` + `bounds` are read. */
export function planToSvg(d: Drawing, pxWidth = 1100): string {
  const wW = Math.max(0.001, d.bounds.maxX - d.bounds.minX)
  const wH = Math.max(0.001, d.bounds.maxY - d.bounds.minY)
  const pad = 24
  const s = (pxWidth - 2 * pad) / wW
  const pxHeight = wH * s + 2 * pad
  const X = (x: number) => pad + (x - d.bounds.minX) * s
  const Y = (y: number) => pad + (y - d.bounds.minY) * s
  const L = (v: number) => v * s   // world length → px

  const out: string[] = []
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${(pxWidth).toFixed(0)} ${pxHeight.toFixed(0)}" font-family="Arial, sans-serif">`)
  out.push(`<rect x="0" y="0" width="${pxWidth}" height="${pxHeight.toFixed(0)}" fill="#ffffff"/>`)
  for (const p of d.primitives) {
    if (p.kind === 'line') {
      out.push(`<line x1="${X(p.x1).toFixed(1)}" y1="${Y(p.y1).toFixed(1)}" x2="${X(p.x2).toFixed(1)}" y2="${Y(p.y2).toFixed(1)}" stroke="${p.stroke}" stroke-width="${p.width ?? 1}"${p.dash ? ` stroke-dasharray="${p.dash.map((v) => L(v).toFixed(1)).join(',')}"` : ''}/>`)
    } else if (p.kind === 'rect') {
      out.push(`<rect x="${X(p.x).toFixed(1)}" y="${Y(p.y).toFixed(1)}" width="${L(p.w).toFixed(1)}" height="${L(p.h).toFixed(1)}" fill="${p.fill ?? 'none'}" stroke="${p.stroke ?? 'none'}" stroke-width="${p.width ?? 1}"${p.dash ? ` stroke-dasharray="${p.dash.map((v) => L(v).toFixed(1)).join(',')}"` : ''}/>`)
    } else if (p.kind === 'circle') {
      out.push(`<circle cx="${X(p.cx).toFixed(1)}" cy="${Y(p.cy).toFixed(1)}" r="${L(p.r).toFixed(1)}" fill="${p.fill ?? 'none'}" stroke="${p.stroke ?? 'none'}" stroke-width="${p.width ?? 1}"/>`)
    } else if (p.kind === 'text') {
      const px = X(p.x), py = Y(p.y)
      const rot = p.rotate ? ` transform="rotate(${p.rotate} ${px.toFixed(1)} ${py.toFixed(1)})"` : ''
      out.push(`<text x="${px.toFixed(1)}" y="${py.toFixed(1)}" font-size="${L(p.size).toFixed(1)}" text-anchor="${p.anchor ?? 'start'}" dominant-baseline="middle" fill="${p.color ?? INK}" font-weight="${p.weight ?? 400}"${rot}>${esc(p.text)}</text>`)
    } else if (p.kind === 'dim') {
      const x1 = X(p.x1), y1 = Y(p.y1), x2 = X(p.x2), y2 = Y(p.y2)
      const fs = L(p.size)
      const tick = fs * 0.45
      out.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${INK}" stroke-width="0.8"/>`)
      // 45° ticks at both ends
      for (const [tx, ty] of [[x1, y1], [x2, y2]] as const)
        out.push(`<line x1="${(tx - tick).toFixed(1)}" y1="${(ty - tick).toFixed(1)}" x2="${(tx + tick).toFixed(1)}" y2="${(ty + tick).toFixed(1)}" stroke="${INK}" stroke-width="0.8"/>`)
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
      const vertical = Math.abs(y2 - y1) > Math.abs(x2 - x1)
      const rot = vertical ? ` transform="rotate(-90 ${mx.toFixed(1)} ${my.toFixed(1)})"` : ''
      out.push(`<text x="${mx.toFixed(1)}" y="${(my - fs * 0.35).toFixed(1)}" font-size="${fs.toFixed(1)}" text-anchor="middle" fill="${INK}"${rot}>${esc(p.text)}</text>`)
    } else if (p.kind === 'path') {
      const d = p.cmds.map((cmd) => cmd.c === 'A'
        ? `A ${L(cmd.rx).toFixed(1)} ${L(cmd.ry).toFixed(1)} 0 ${cmd.large ?? 0} ${cmd.sweep ?? 0} ${X(cmd.x).toFixed(1)} ${Y(cmd.y).toFixed(1)}`
        : `${cmd.c} ${X(cmd.x).toFixed(1)} ${Y(cmd.y).toFixed(1)}`).join(' ') + (p.closed ? ' Z' : '')
      out.push(`<path d="${d}" fill="${p.fill ?? 'none'}" stroke="${p.stroke ?? 'none'}" stroke-width="${p.width ?? 1}"${p.join ? ` stroke-linejoin="${p.join}"` : ''}${p.cap ? ` stroke-linecap="${p.cap}"` : ''}${p.fillRule ? ` fill-rule="${p.fillRule}"` : ''}${p.opacity != null ? ` opacity="${p.opacity}"` : ''}${p.dash ? ` stroke-dasharray="${p.dash.map((v) => L(v).toFixed(1)).join(',')}"` : ''}/>`)
    }
  }
  out.push('</svg>')
  return out.join('\n')
}
