// ─────────────────────────────────────────────────────────────────────────
// BAR CUTTING SHEETS — the fabricator's two drawings.
//
//   1. EXPLODED BEAM LINE. The frame elevation draws every bar where it sits,
//      which is right for the man fixing it and useless for the man cutting
//      it: a dozen bars on top of one another in a 500 mm beam. Here the same
//      bars are pulled OUT of the beam — top steel stacked above it, bottom
//      steel below — each at its true length and true position along the
//      grid, with its mark, count, Ø and cut length, its leg lengths, and
//      where it stops relative to the nearest column line.
//
//   2. BAR BENDING SCHEDULE. One row per bar TYPE (`scheduleTypes`): a sketch
//      of the shape with its legs, Ø, cut length, number, total length, unit
//      weight and total weight — the table a bar bender works from.
//
// Both read the cages, so their bars are the frame elevation's bars and the
// take-off's kilograms. Page units: the elevation draws in metres (y down),
// the schedule in its own table units. Legs and cut lengths are printed mm/m.
// ─────────────────────────────────────────────────────────────────────────
import type { Drawing, PlanPrimitive } from './planRenderer'
import { projectPath, cutLength, type RebarCage, type RebarRun } from './rebarModel'
import type { BbsType } from './barBendingSchedule'
import { titleBlock, notesBlock, sheetBounds, textWidth } from './detailSheet'
import { SHEET_INK, SHEET_NOTE, SHEET_GRID, STEEL, SHEET_CONCRETE } from './sheetInk'
import type { FrameElevationInput } from './frameElevation'

export interface CuttingSheetOptions {
  detailNo?: string
  sheetRef?: string
}

export interface CuttingDrawing extends Drawing { title: string }

const LONGITUDINAL = new Set(['top', 'bottom', 'side'])
const mm = (m: number) => Math.round(m * 1000)
const fmtM = (mmv: number) => (mmv / 1000).toFixed(3)

/** The run's label, as a cutting list writes it. */
export const barLabel = (r: Pick<RebarRun, 'mark' | 'count' | 'dia'>, cutMm: number) =>
  `${r.mark} · ${r.count} pcs ⌀${r.dia} × ${fmtM(cutMm)} m`

interface Placed {
  run: RebarRun
  pts: [number, number][]
  /** Page y of the bar's main (longest) leg in the elevation. */
  yMain: number
  u0: number; u1: number
  /** How far the bar reaches away from its main leg, page units (≥ 0). */
  reach: number
  label: string
  cut: number
}

/**
 * Pack bars into rows so that no two in a row overlap — label included — and
 * report the row of each. Greedy by start, first row that fits: the interval
 * scheduling every cutting list is laid out with.
 */
export function packRows(spans: readonly [number, number][], gap: number): number[] {
  const order = spans.map((_s, i) => i).sort((a, b) => spans[a][0] - spans[b][0])
  const ends: number[] = []
  const row = new Array<number>(spans.length).fill(0)
  for (const i of order) {
    const [a, b] = spans[i]
    let k = ends.findIndex((e) => e + gap <= a)
    if (k < 0) { k = ends.length; ends.push(b) } else ends[k] = b
    row[i] = k
  }
  return row
}

/**
 * The exploded beam line: the subject beams' longitudinal bars pulled out of
 * the beam, top steel above and bottom steel below, each at its true length
 * and position along the grid.
 */
export function buildExplodedBeamLine(i: FrameElevationInput, o: CuttingSheetOptions = {}): CuttingDrawing {
  const P: PlanPrimitive[] = []
  const beams = i.members.filter((m) => m.role === 'beam')
  const cols = i.members.filter((m) => m.role === 'column')
  const uMin = Math.min(...i.members.map((m) => m.u0))
  const uMax = Math.max(...i.members.map((m) => m.u1))
  const u = Math.max(1e-6, (uMax - uMin) / 85)
  const Y = (y: number) => -y
  const beamTop = Math.min(...beams.map((m) => Y(m.yTop)))
  const beamBot = Math.max(...beams.map((m) => Y(m.yBot)))

  // ── the bars, projected, and split into the two stacks ─────────────────
  const runs = i.cages.filter((c) => i.subject.has(c.member)).flatMap((c) => c.runs)
    .filter((r) => LONGITUDINAL.has(r.role) && r.count > 0)
  const place = (r: RebarRun): Placed => {
    const pts = projectPath(r.path, i.plane)
    let best = 0, yMain = pts[0][1]
    for (let k = 1; k < pts.length; k++) {
      const len = Math.abs(pts[k][0] - pts[k - 1][0])
      if (len > best) { best = len; yMain = (pts[k][1] + pts[k - 1][1]) / 2 }
    }
    const us = pts.map((p) => p[0])
    const reach = Math.max(...pts.map((p) => Math.abs(p[1] - yMain)))
    const cut = cutLength(r)
    return { run: r, pts, yMain, u0: Math.min(...us), u1: Math.max(...us), reach, label: barLabel(r, cut), cut }
  }
  const placed = runs.map(place)
  const mid = (beamTop + beamBot) / 2
  const tops = placed.filter((p) => p.yMain < mid)
  const bots = placed.filter((p) => p.yMain >= mid)
  const size = u * 0.82
  const span = (p: Placed): [number, number] => {
    const w = textWidth(p.label, size)
    const c = (p.u0 + p.u1) / 2
    return [Math.min(p.u0, c - w / 2) - u, Math.max(p.u1, c + w / 2) + u]
  }

  const drawStack = (list: Placed[], dir: -1 | 1, base: number): number => {
    if (list.length === 0) return base
    const rows = packRows(list.map(span), u * 2)
    const reach = Math.max(...list.map((p) => p.reach))
    const pitch = reach + u * 5.2
    let far = base
    list.forEach((p, k) => {
      const yRow = base + dir * (pitch * (rows[k] + 1) - (dir < 0 ? reach : 0))
      const dy = yRow - p.yMain
      const pts = p.pts.map(([x, y]) => [x, y + dy] as [number, number])
      P.push({
        kind: 'path', stroke: STEEL, width: 1.8, cap: 'round', join: 'round',
        cmds: pts.map(([x, y], j) => ({ c: j === 0 ? 'M' : 'L', x, y }) as const),
      })
      // label above the bar
      P.push({ kind: 'text', x: (p.u0 + p.u1) / 2, y: yRow - u * 0.9, text: p.label, size, anchor: 'middle', color: SHEET_INK, weight: 600 })
      // the main leg's length under it
      const mainLen = Math.abs(p.u1 - p.u0)
      P.push({ kind: 'text', x: (p.u0 + p.u1) / 2, y: yRow + u * 1.5, text: `${mm(mainLen)}`, size: size * 0.85, anchor: 'middle', color: SHEET_NOTE })
      // each bent leg's length beside it
      for (let j = 1; j < pts.length; j++) {
        const [x0, y0] = pts[j - 1], [x1, y1] = pts[j]
        if (Math.abs(x1 - x0) > 1e-6) continue
        const len = Math.abs(y1 - y0)
        const outward = x0 <= (p.u0 + p.u1) / 2 ? -1 : 1
        P.push({ kind: 'text', x: x0 + outward * u * 0.5, y: (y0 + y1) / 2 + size * 0.35, text: `${mm(len)}`, size: size * 0.8, anchor: outward < 0 ? 'end' : 'start', color: SHEET_NOTE })
      }
      // a curtailed end: where it stops, from the nearest column line
      for (const end of [p.u0, p.u1]) {
        const g = i.grids.reduce((a, b) => (Math.abs(b.u - end) < Math.abs(a.u - end) ? b : a), i.grids[0])
        if (!g || Math.abs(g.u - end) < 0.05) continue
        // the dimension to a column line at the bar's OTHER end is its own
        // length, printed already under the bar
        if (Math.abs(Math.abs(g.u - end) - mainLen) < 0.005) continue
        const yd = yRow + dir * u * 2.6
        P.push({ kind: 'dim', x1: Math.min(g.u, end), y1: yd, x2: Math.max(g.u, end), y2: yd, text: `${mm(Math.abs(g.u - end))}`, off: 0, size: size * 0.75, ext: yRow })
      }
      far = dir < 0 ? Math.min(far, yRow - pitch) : Math.max(far, yRow + reach + u * 3)
    })
    return far
  }
  const topEdge = drawStack(tops, -1, beamTop - u * 2)
  const botEdge = drawStack(bots, 1, beamBot + u * 2)

  // ── the line itself: columns, beams, grids — what the bars came out of ─
  for (const c of cols) {
    const y0 = Math.max(Y(c.yTop), beamTop - u * 3), y1 = Math.min(Y(c.yBot), beamBot + u * 3)
    if (y1 > y0) P.push({ kind: 'rect', x: c.u0, y: y0, w: c.u1 - c.u0, h: y1 - y0, fill: SHEET_CONCRETE, stroke: SHEET_GRID, width: 0.8 })
  }
  for (const b of beams) {
    P.push({ kind: 'rect', x: b.u0, y: Y(b.yTop), w: b.u1 - b.u0, h: Y(b.yBot) - Y(b.yTop), fill: SHEET_CONCRETE, stroke: SHEET_INK, width: 1 })
    P.push({ kind: 'text', x: (b.u0 + b.u1) / 2, y: (Y(b.yTop) + Y(b.yBot)) / 2 + size * 0.35, text: `${b.mark}  ${Math.round(b.bw)}×${Math.round(b.d)}`, size, anchor: 'middle', color: SHEET_NOTE, weight: 600 })
  }
  // stirrups: one line per beam, under it — their shape is on the schedule
  const stirrups = i.cages.filter((c) => i.subject.has(c.member))
    .flatMap((c) => c.runs).filter((r) => r.role === 'stirrup' || r.role === 'hoop')
  const bubbleY = topEdge - u * 3.2
  for (const g of i.grids) {
    P.push({ kind: 'line', x1: g.u, y1: bubbleY + u * 1.6, x2: g.u, y2: botEdge + u, stroke: SHEET_GRID, width: 0.6, dash: [u * 0.45, u * 0.3] })
    P.push({ kind: 'circle', cx: g.u, cy: bubbleY, r: u * 1.6, stroke: SHEET_INK, fill: '#fff', width: 0.8 })
    P.push({ kind: 'text', x: g.u, y: bubbleY + u * 0.6, text: g.label, size: u * 1.6, anchor: 'middle', color: SHEET_INK, weight: 700 })
  }
  for (let k = 1; k < i.grids.length; k++) {
    const a = i.grids[k - 1].u, b = i.grids[k].u
    P.push({ kind: 'dim', x1: a, y1: bubbleY + u * 3.4, x2: b, y2: bubbleY + u * 3.4, text: `${mm(b - a)} mm`, off: 0, size: size * 0.9 })
  }

  const notes = [
    'BARS SHOWN PULLED OUT OF THE BEAM — TOP STEEL ABOVE, BOTTOM STEEL BELOW, EACH AT ITS TRUE LENGTH AND POSITION ALONG THE GRID.',
    'LABEL: MARK · NUMBER ⌀ × CUT LENGTH (BENDS DEDUCTED). FIGURES ON A BAR: LEG LENGTHS, mm, CORNER TO CORNER. DIMENSIONS: BAR END FROM THE NEAREST COLUMN LINE, mm.',
    stirrups.length
      ? `STIRRUPS: ${[...new Set(stirrups.map((s) => `⌀${s.dia}`))].join(', ')}, ${stirrups.reduce((s, r) => s + r.count, 0)} PCS ON THIS LINE — SHAPE AND CUT LENGTH ON THE BAR BENDING SCHEDULE.`
      : 'NO STIRRUPS SCHEDULED ON THIS LINE.',
  ]
  const nb = notesBlock({ lines: notes, x: uMin, top: botEdge + u * 2, w: uMax - uMin, size: u * 0.8, color: SHEET_NOTE })
  P.push(...nb.prims)
  const title = `BAR CUTTING LIST — GRID ${i.line} @ EL ${i.y.toFixed(2)}`
  const tb = titleBlock({ x: uMin, top: nb.bottom + u * 1.2, w: uMax - uMin, u: u * 0.72, title, scale: 'NTS', detailNo: o.detailNo ?? '1', sheetRef: o.sheetRef ?? '' })
  P.push(...tb.prims)
  return { primitives: P, bounds: sheetBounds(P, u * 1.5), title }
}

// ── the bar bending schedule ─────────────────────────────────────────────

/**
 * A shape sketch in a cell: legs drawn schematically (√ of their length, so a
 * 300 hook stays visible beside a 6 m leg — BBS sketches are never to scale),
 * fitted into the box, each leg labelled with its true length.
 */
export function shapeSketch(
  t: Pick<BbsType, 'shape'>, x: number, y: number, w: number, h: number, size: number,
): PlanPrimitive[] {
  const s = t.shape
  const P: PlanPrimitive[] = []
  // rebuild the polyline leg by leg with each leg's direction and √length
  const dirs: [number, number][] = []
  const n = s.pts.length
  const segs = s.closed ? n : n - 1
  for (let k = 0; k < segs; k++) {
    const a = s.pts[k], b = s.pts[(k + 1) % n]
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1
    dirs.push([dx / l, dy / l])
  }
  const pts: [number, number][] = [[0, 0]]
  for (let k = 0; k < segs; k++) {
    const l = Math.sqrt(Math.max(s.legs[k], 1))
    const [px, py] = pts[pts.length - 1]
    pts.push([px + dirs[k][0] * l, py - dirs[k][1] * l])
  }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys)
  // room for a leg label beside an end hook, and above/below a level leg
  const padX = size * 3.6, padY = size * 1.6
  const k = Math.min((w - 2 * padX) / Math.max(bw, 1e-9), (h - 2 * padY) / Math.max(bh, 1e-9))
  const ox = x + w / 2 - ((Math.max(...xs) + Math.min(...xs)) / 2) * k
  const oy = y + h / 2 - ((Math.max(...ys) + Math.min(...ys)) / 2) * k
  const T = ([px, py]: [number, number]): [number, number] => [ox + px * k, oy + py * k]
  const tp = pts.map(T)
  P.push({
    kind: 'path', stroke: STEEL, width: 1.6, cap: 'round', join: 'round', closed: s.closed,
    cmds: tp.slice(0, s.closed ? n : tp.length).map(([px, py], j) => ({ c: j === 0 ? 'M' : 'L', x: px, y: py }) as const),
  })
  const cx = tp.reduce((a, p) => a + p[0], 0) / tp.length, cy = tp.reduce((a, p) => a + p[1], 0) / tp.length
  const labelled = s.closed ? Math.min(2, segs) : segs
  for (let j = 0; j < labelled; j++) {
    const [ax, ay] = tp[j], [bx, by] = tp[j + 1]
    const mx = (ax + bx) / 2, my = (ay + by) / 2
    // outward from the sketch's centre
    let nx = -(by - ay), ny = bx - ax
    const nl = Math.hypot(nx, ny) || 1
    nx /= nl; ny /= nl
    if ((mx - cx) * nx + (my - cy) * ny < 0) { nx = -nx; ny = -ny }
    const tx = mx + nx * size * 0.9, ty = my + ny * size * 0.9 + size * 0.35
    P.push({ kind: 'text', x: tx, y: ty, text: `${Math.round(s.legs[j])}`, size: size * 0.85, anchor: Math.abs(nx) < 0.5 ? 'middle' : nx > 0 ? 'start' : 'end', color: SHEET_NOTE })
  }
  return P
}

const COLS: { key: string; label: string; w: number; align: 'start' | 'middle' | 'end' }[] = [
  { key: 'type', label: 'TYPE', w: 150, align: 'start' },
  { key: 'shape', label: 'SHAPE — legs, mm', w: 360, align: 'middle' },
  { key: 'len', label: 'CUT LENGTH (m)', w: 120, align: 'end' },
  { key: 'no', label: 'No.', w: 70, align: 'end' },
  { key: 'tot', label: 'TOTAL LENGTH (m)', w: 140, align: 'end' },
  { key: 'unit', label: 'UNIT WT (kg/m)', w: 125, align: 'end' },
  { key: 'kg', label: 'TOTAL WT (kg)', w: 125, align: 'end' },
]

/** The schedule as a sheet: one row per bar type, a weight per Ø, a total. */
export function buildBbsSheet(types: readonly BbsType[], heading: string, o: CuttingSheetOptions = {}): CuttingDrawing {
  const P: PlanPrimitive[] = []
  const size = 13, rowH = 74, headH = 34
  const W = COLS.reduce((s, c) => s + c.w, 0)
  const colX: number[] = []
  COLS.reduce((x, c) => { colX.push(x); return x + c.w }, 0)
  const cellX = (k: number) => COLS[k].align === 'start' ? colX[k] + 10 : COLS[k].align === 'end' ? colX[k] + COLS[k].w - 12 : colX[k] + COLS[k].w / 2

  P.push({ kind: 'rect', x: 0, y: 0, w: W, h: headH, fill: '#eef2f7', stroke: SHEET_INK, width: 1 })
  COLS.forEach((c, k) => P.push({ kind: 'text', x: cellX(k), y: headH / 2 + size * 0.38, text: c.label, size: size * 0.85, anchor: c.align, color: SHEET_INK, weight: 700 }))
  let y = headH
  for (const t of types) {
    P.push({ kind: 'rect', x: 0, y, w: W, h: rowH, stroke: SHEET_GRID, width: 0.6 })
    const by = y + rowH / 2 + size * 0.38
    P.push({ kind: 'text', x: cellX(0), y: by - size * 0.7, text: `${t.type} (⌀${t.dia})`, size, anchor: 'start', color: SHEET_INK, weight: 700 })
    const where = t.members.length <= 2 ? t.members.join(', ') : `${t.members.slice(0, 2).join(', ')} +${t.members.length - 2} more`
    P.push({ kind: 'text', x: cellX(0), y: by + size * 0.75, text: where, size: size * 0.75, anchor: 'start', color: SHEET_NOTE })
    P.push(...shapeSketch(t, colX[1], y, COLS[1].w, rowH, size * 0.85))
    const cells = [(t.cutMm / 1000).toFixed(3), `${t.count}`, t.totalM.toFixed(2), t.kgPerM.toFixed(3), t.kg.toFixed(2)]
    cells.forEach((v, j) => P.push({ kind: 'text', x: cellX(j + 2), y: by, text: v, size, anchor: 'end', color: SHEET_INK }))
    y += rowH
  }
  // per-Ø subtotals and the grand total
  const byDia = new Map<number, number>()
  for (const t of types) byDia.set(t.dia, (byDia.get(t.dia) ?? 0) + t.kg)
  const total = types.reduce((s, t) => s + t.kg, 0)
  const sumH = 30
  for (const [dia, kg] of [...byDia.entries()].sort((a, b) => b[0] - a[0])) {
    P.push({ kind: 'rect', x: 0, y, w: W, h: sumH, stroke: SHEET_GRID, width: 0.6 })
    P.push({ kind: 'text', x: colX[6] - 12, y: y + sumH / 2 + size * 0.38, text: `⌀${dia}`, size, anchor: 'end', color: SHEET_NOTE })
    P.push({ kind: 'text', x: cellX(6), y: y + sumH / 2 + size * 0.38, text: kg.toFixed(2), size, anchor: 'end', color: SHEET_NOTE })
    y += sumH
  }
  P.push({ kind: 'rect', x: 0, y, w: W, h: sumH + 4, fill: '#eef2f7', stroke: SHEET_INK, width: 1 })
  P.push({ kind: 'text', x: colX[6] - 12, y: y + (sumH + 4) / 2 + size * 0.38, text: 'TOTAL', size, anchor: 'end', color: SHEET_INK, weight: 700 })
  P.push({ kind: 'text', x: cellX(6), y: y + (sumH + 4) / 2 + size * 0.38, text: total.toFixed(2), size, anchor: 'end', color: SHEET_INK, weight: 700 })
  y += sumH + 4
  // column rules
  for (let k = 1; k < COLS.length; k++) P.push({ kind: 'line', x1: colX[k], y1: 0, x2: colX[k], y2: headH + rowH * types.length, stroke: SHEET_GRID, width: 0.6 })
  P.push({ kind: 'rect', x: 0, y: 0, w: W, h: y, stroke: SHEET_INK, width: 1.2 })

  const nb = notesBlock({
    lines: [
      'CUT LENGTH = DEVELOPED LENGTH: CENTRELINE LEGS LESS THE BEND DEDUCTIONS, PLUS HOOK ALLOWANCES ON CLOSED TIES. LEGS ARE CORNER TO CORNER, mm. SKETCHES ARE NOT TO SCALE.',
      'UNIT WEIGHT = π/4 · ⌀² · 7850 kg/m³. IDENTICAL BARS IN DIFFERENT MEMBERS ARE ONE TYPE; THE MEMBERS THAT USE A TYPE ARE LISTED UNDER IT.',
    ],
    x: 0, top: y + 18, w: W, size: size * 0.85, color: SHEET_NOTE,
  })
  P.push(...nb.prims)
  const title = `BAR BENDING SCHEDULE — ${heading.toUpperCase()}`
  const tb = titleBlock({ x: 0, top: nb.bottom + 14, w: W, u: 9, title, scale: 'NTS', detailNo: o.detailNo ?? '1', sheetRef: o.sheetRef ?? '' })
  P.push(...tb.prims)
  return { primitives: P, bounds: sheetBounds(P, 16), title }
}

/** Every cage's runs, as schedule rows grouped by the kind of member. */
export function cagesByKind(cages: readonly RebarCage[]): Map<string, RebarCage[]> {
  const out = new Map<string, RebarCage[]>()
  for (const c of cages) {
    const k = c.kind ?? 'beam'
    const list = out.get(k) ?? []
    list.push(c); out.set(k, list)
  }
  return out
}
