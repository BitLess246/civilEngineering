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

export type PlanPrimitive =
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: string; width?: number; dash?: number[] }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; stroke?: string; fill?: string; width?: number; dash?: number[] }
  | { kind: 'circle'; cx: number; cy: number; r: number; stroke?: string; fill?: string; width?: number }
  | { kind: 'text'; x: number; y: number; text: string; size: number; anchor?: 'start' | 'middle' | 'end'; rotate?: number; color?: string; weight?: number }
  | { kind: 'dim'; x1: number; y1: number; x2: number; y2: number; text: string; off: number }

export interface BeamScheduleRow { mark: string; size: string }

export interface PlanDrawing {
  primitives: PlanPrimitive[]
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
  title: string
  beamSchedule: BeamScheduleRow[]
}

export interface PlanOptions {
  kind?: 'framing' | 'foundation'
  /** Storey level index (1 = first floor above base). Default: first framed level. */
  level?: number
  /** Title-block detail number, sheet reference and scale note. */
  detailNo?: string
  sheetRef?: string
  scale?: string
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
  const levelY = foundation ? ys[0] : (opts.level != null ? ys[opts.level] : (ys[1] ?? ys[0]))

  const P: PlanPrimitive[] = []
  const ext = Math.max(0.6, Math.max(x1 - x0, z1 - z0, 1) * 0.04)   // grid-line overrun / bubble radius
  const r = ext

  // ── grid lines (column lines ‖ Y at each x, rows ‖ X at each z) ──
  for (const x of xs) P.push({ kind: 'line', x1: x, y1: z0 - ext, x2: x, y2: z1 + ext, stroke: GRID, width: 0.6, dash: [0.25, 0.18] })
  for (const z of zs) P.push({ kind: 'line', x1: x0 - ext, y1: z, x2: x1 + ext, y2: z, stroke: GRID, width: 0.6, dash: [0.25, 0.18] })
  // bubbles: letters across the top, numbers down the left
  xs.forEach((x, i) => {
    const cy = z0 - ext - r
    P.push({ kind: 'circle', cx: x, cy, r, stroke: INK, fill: '#fff', width: 0.6 })
    P.push({ kind: 'text', x, y: cy, text: gridLabel(i), size: r * 1.1, anchor: 'middle', color: INK, weight: 700 })
  })
  zs.forEach((z, i) => {
    const cx = x0 - ext - r
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
  for (const mem of model.members) {
    if (mem.role === 'column') continue
    const a = nm.get(mem.i), b = nm.get(mem.j); if (!a || !b) continue
    if (!(near(a.y, levelY) && near(b.y, levelY))) continue   // only members on this level
    const sec = secOf(mem.id)
    P.push({ kind: 'line', x1: a.x, y1: a.z, x2: b.x, y2: b.z, stroke: BEAM, width: 1.6 })
    if (sec) {
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2
      const vertical = Math.abs(b.z - a.z) > Math.abs(b.x - a.x)
      // horizontal marks sit just BELOW their beam (toward the interior) so the
      // perimeter row never clashes with the grid-dimension chain above it
      P.push({ kind: 'text', x: mx + (vertical ? r * 0.45 : 0), y: mz + (vertical ? 0 : r * 0.55), text: markFor(sec), size: r * 0.55, anchor: 'middle', rotate: vertical ? -90 : 0, color: BEAM, weight: 700 })
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
    P.push({ kind: 'rect', x: node.x - cw / 2, y: node.z - ch / 2, w: cw, h: ch, stroke: COL, fill: foundation ? 'none' : COL, width: 1.2, dash: foundation ? [0.2, 0.15] : undefined })
  }

  // ── slab panels at the level (outline + thickness label) ──
  for (const p of model.plates) {
    if (p.role === 'wall') continue
    const c = p.corners.map((id) => nm.get(id)); if (c.some((q) => !q)) continue
    const cc = c as { x: number; y: number; z: number }[]
    if (!cc.every((q) => near(q.y, levelY))) continue
    for (let i = 0; i < 4; i++) {
      const u = cc[i], v = cc[(i + 1) % 4]
      P.push({ kind: 'line', x1: u.x, y1: u.z, x2: v.x, y2: v.z, stroke: PANEL, width: 0.5, dash: [0.15, 0.12] })
    }
    const mx = (cc[0].x + cc[2].x) / 2, mz = (cc[0].z + cc[2].z) / 2
    P.push({ kind: 'text', x: mx, y: mz, text: `h=${Math.round(p.thickness)}`, size: r * 0.5, anchor: 'middle', color: PANEL, weight: 600 })
  }

  // ── chained grid dimensions — placed INSIDE the bubbles (between the bubble
  // ring and the framing), not beyond them ──
  const dimOffTop = z0 - ext * 0.75
  for (let i = 0; i < xs.length - 1; i++)
    P.push({ kind: 'dim', x1: xs[i], y1: dimOffTop, x2: xs[i + 1], y2: dimOffTop, text: `${Math.round((xs[i + 1] - xs[i]) * 1000)}`, off: 0 })
  const dimOffLeft = x0 - ext * 0.75
  for (let i = 0; i < zs.length - 1; i++)
    P.push({ kind: 'dim', x1: dimOffLeft, y1: zs[i], x2: dimOffLeft, y2: zs[i + 1], text: `${Math.round((zs[i + 1] - zs[i]) * 1000)}`, off: 0 })

  // ── title block (detail tag) + beam schedule, below the plan ──
  const detailNo = opts.detailNo ?? '1', sheetRef = opts.sheetRef ?? 'S-1', scale = opts.scale ?? 'NTS'
  const title = foundation ? 'FOUNDATION PLAN' : 'FRAMING PLAN'
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

  // beam schedule table (only marks used on this level)
  if (schedule.length) {
    const rowH = r * 0.85, cMark = r * 1.6, cSize = r * 3.2
    const tX = tbX, tY = tbY + tbR + r * 1.2
    P.push({ kind: 'text', x: tX, y: tY - r * 0.35, text: 'BEAM SCHEDULE', size: r * 0.5, anchor: 'start', color: BEAM, weight: 700 })
    const rows: [string, string][] = [['MARK', 'SIZE (mm)'], ...schedule.map((s): [string, string] => [s.mark, s.size])]
    rows.forEach((row, i) => {
      const y = tY + i * rowH, head = i === 0
      P.push({ kind: 'rect', x: tX, y, w: cMark, h: rowH, stroke: INK, width: 0.6, fill: head ? '#eef2f7' : '#fff' })
      P.push({ kind: 'rect', x: tX + cMark, y, w: cSize, h: rowH, stroke: INK, width: 0.6, fill: head ? '#eef2f7' : '#fff' })
      P.push({ kind: 'text', x: tX + cMark / 2, y: y + rowH / 2, text: row[0], size: r * 0.42, anchor: 'middle', color: INK, weight: head ? 700 : 500 })
      P.push({ kind: 'text', x: tX + cMark + r * 0.2, y: y + rowH / 2, text: row[1], size: r * 0.42, anchor: 'start', color: INK, weight: head ? 700 : 500 })
    })
  }

  // ── bounds = span of every primitive coordinate ──
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const acc = (x: number, y: number) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y) }
  for (const pr of P) {
    if (pr.kind === 'line' || pr.kind === 'dim') { acc(pr.x1, pr.y1); acc(pr.x2, pr.y2) }
    else if (pr.kind === 'rect') { acc(pr.x, pr.y); acc(pr.x + pr.w, pr.y + pr.h) }
    else if (pr.kind === 'circle') { acc(pr.cx - pr.r, pr.cy - pr.r); acc(pr.cx + pr.r, pr.cy + pr.r) }
    else acc(pr.x, pr.y)
  }
  return {
    primitives: P,
    bounds: { minX, minY, maxX, maxY },
    title,
    beamSchedule: schedule,
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Serialise a plan drawing to an SVG string (world metres → px, Y downward). */
export function planToSvg(d: PlanDrawing, pxWidth = 1100): string {
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
      const tick = 4
      out.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${INK}" stroke-width="0.8"/>`)
      // 45° ticks at both ends
      for (const [tx, ty] of [[x1, y1], [x2, y2]] as const)
        out.push(`<line x1="${(tx - tick).toFixed(1)}" y1="${(ty - tick).toFixed(1)}" x2="${(tx + tick).toFixed(1)}" y2="${(ty + tick).toFixed(1)}" stroke="${INK}" stroke-width="0.8"/>`)
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
      const vertical = Math.abs(y2 - y1) > Math.abs(x2 - x1)
      const rot = vertical ? ` transform="rotate(-90 ${mx.toFixed(1)} ${my.toFixed(1)})"` : ''
      out.push(`<text x="${mx.toFixed(1)}" y="${(my - 3).toFixed(1)}" font-size="11" text-anchor="middle" fill="${INK}"${rot}>${esc(p.text)}</text>`)
    }
  }
  out.push('</svg>')
  return out.join('\n')
}
