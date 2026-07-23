// ─────────────────────────────────────────────────────────────────────────
// Column cross-section — an ENGINE (SVG-primitive) port of the report's
// <ColumnSchematic> so the exact same tied-column section can be drawn on a
// plan/detail sheet instead of only as a React component.
//
// Reproduces the report drawing: a light-filled rounded square, the perimeter
// tie hugging the bars (drawn as filled geometry so it keeps its real thickness
// at any scale), interior crossties that hook 180° around the interior bars
// (§25.7.2.3), the full ring of vertical bars, and a 135° tie hook at a corner.
//
// Units: sizes mm; the drawing is emitted in metres (side length in world m).
// ─────────────────────────────────────────────────────────────────────────
import type { PlanPrimitive, PathCmd, Drawing } from './planRenderer'

export interface ColumnSectionInput {
  b: number            // column width (x), mm
  h?: number           // column depth (y), mm — defaults to b (square)
  cover: number; barDia: number; tieDia: number
  bars: number
  tieSpacing?: number
}
export interface DetailDrawing extends Drawing { title: string }

const STROKE = '#37526e', FILL = '#eef3f8', BAR = '#37526e'
type Pt = [number, number]

function lineX(p1: Pt, p2: Pt, p3: Pt, p4: Pt): Pt | null {
  const d = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0])
  if (Math.abs(d) < 1e-12) return null
  const t = ((p1[0] - p3[0]) * (p3[1] - p4[1]) - (p1[1] - p3[1]) * (p3[0] - p4[0])) / d
  return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])]
}

/** Clockwise rounded-rectangle path commands. */
function roundRect(x: number, y: number, w: number, h: number, rr: number): PathCmd[] {
  const r = Math.max(0, Math.min(rr, w / 2, h / 2))
  return [
    { c: 'M', x: x + r, y }, { c: 'L', x: x + w - r, y }, { c: 'A', rx: r, ry: r, x: x + w, y: y + r, sweep: 1 },
    { c: 'L', x: x + w, y: y + h - r }, { c: 'A', rx: r, ry: r, x: x + w - r, y: y + h, sweep: 1 },
    { c: 'L', x: x + r, y: y + h }, { c: 'A', rx: r, ry: r, x, y: y + h - r, sweep: 1 },
    { c: 'L', x, y: y + r }, { c: 'A', rx: r, ry: r, x: x + r, y, sweep: 1 },
  ]
}

/** Outline (closed) of a bar of radius `r` about the centreline `pts` — mitred
 *  sides + semicircular end caps. Filled solid it reads as a real rod. */
function tube(pts: Pt[], r: number): PathCmd[] {
  const ns = pts.length - 1
  const nrm: Pt[] = []
  for (let i = 0; i < ns; i++) {
    const dx = pts[i + 1][0] - pts[i][0], dy = pts[i + 1][1] - pts[i][1]
    const l = Math.hypot(dx, dy) || 1
    nrm.push([-dy / l, dx / l])
  }
  const side = (s: number): Pt[] => pts.map((p, i) => {
    if (i === 0) return [p[0] + s * r * nrm[0][0], p[1] + s * r * nrm[0][1]]
    if (i === ns) return [p[0] + s * r * nrm[ns - 1][0], p[1] + s * r * nrm[ns - 1][1]]
    const a0: Pt = [pts[i - 1][0] + s * r * nrm[i - 1][0], pts[i - 1][1] + s * r * nrm[i - 1][1]]
    const a1: Pt = [p[0] + s * r * nrm[i - 1][0], p[1] + s * r * nrm[i - 1][1]]
    const b0: Pt = [p[0] + s * r * nrm[i][0], p[1] + s * r * nrm[i][1]]
    const b1: Pt = [pts[i + 1][0] + s * r * nrm[i][0], pts[i + 1][1] + s * r * nrm[i][1]]
    return lineX(a0, a1, b0, b1) ?? b0
  })
  const L = side(1), R = side(-1)
  const cmds: PathCmd[] = [{ c: 'M', x: L[0][0], y: L[0][1] }]
  for (let i = 1; i < L.length; i++) cmds.push({ c: 'L', x: L[i][0], y: L[i][1] })
  cmds.push({ c: 'A', rx: r, ry: r, x: R[R.length - 1][0], y: R[R.length - 1][1], sweep: 1 })
  for (let i = R.length - 2; i >= 0; i--) cmds.push({ c: 'L', x: R[i][0], y: R[i][1] })
  cmds.push({ c: 'A', rx: r, ry: r, x: L[0][0], y: L[0][1], sweep: 1 })
  return cmds
}

/** Draw a tied column cross-section centred at (cx,cy), occupying `side` metres
 *  across the column's b-dimension. Appends primitives to `P`. */
export function columnSectionPrimitives(P: PlanPrimitive[], cx: number, cy: number, side: number, p: ColumnSectionInput): void {
  const b = p.b, h = p.h ?? p.b
  const sc = side / b                      // world m per mm
  const W = b * sc, Hh = h * sc, hw = W / 2, hh = Hh / 2
  const tt = p.tieDia * sc                 // tie thickness (world)
  const br = Math.max(W * 0.02, (p.barDia / 2) * sc)
  const inset = (p.cover + p.tieDia / 2) * sc
  const barIn = (p.cover + p.tieDia + p.barDia / 2) * sc
  const x1 = cx - hw + barIn, x2 = cx + hw - barIn, yT = cy - hh + barIn, yB = cy + hh - barIn

  // concrete outline
  P.push({ kind: 'path', cmds: roundRect(cx - hw, cy - hh, W, Hh, Math.min(W, Hh) * 0.03), fill: FILL, stroke: STROKE, width: 1.4, closed: true })

  // bar layout — 4 corners + rest split between b/h faces (as ColumnSchematic)
  const N = Math.max(4, 2 * Math.round(p.bars / 2))
  const bwIn = b - 2 * (p.cover + p.tieDia + p.barDia / 2)
  const hIn = h - 2 * (p.cover + p.tieDia + p.barDia / 2)
  const nx = Math.max(2, Math.min(2 + Math.round(((N - 4) / 2) * (bwIn / (bwIn + hIn))), N / 2))
  const ny = N / 2 + 2 - nx
  const rowX = Array.from({ length: nx }, (_, i) => (nx === 1 ? (x1 + x2) / 2 : x1 + ((x2 - x1) * i) / (nx - 1)))
  const sideY = Array.from({ length: Math.max(0, ny - 2) }, (_, i) => yT + ((yB - yT) * (i + 1)) / (ny - 1))
  const midX = (x1 + x2) / 2, midY = (yT + yB) / 2

  // perimeter tie — a filled rounded-rectangle RING hugging the bars
  const tRr = Math.max(W * 0.03, 2.5 * p.tieDia * sc)
  const ox = cx - hw + inset, oy = cy - hh + inset, ow = W - 2 * inset, oh = Hh - 2 * inset
  P.push({ kind: 'path', closed: true, fill: BAR, opacity: 0.85, fillRule: 'evenodd',
    cmds: [...roundRect(ox, oy, ow, oh, tRr), ...roundRect(ox + tt, oy + tt, ow - 2 * tt, oh - 2 * tt, Math.max(0, tRr - tt))] })

  // interior crossties — 180° hooks around the interior face bars
  const rw = br + (p.tieDia / 2) * sc, stub = rw * 1.6, NS = 10
  const cTie = (A: Pt, B: Pt, u: Pt, od: Pt): Pt[] => {
    const pts: Pt[] = [[A[0] + od[0] * rw + u[0] * stub, A[1] + od[1] * rw + u[1] * stub]]
    for (let j = 0; j <= NS; j++) { const t = (Math.PI * j) / NS, c = Math.cos(t), sn = Math.sin(t); pts.push([A[0] + (od[0] * c - u[0] * sn) * rw, A[1] + (od[1] * c - u[1] * sn) * rw]) }
    pts.push([B[0] - od[0] * rw, B[1] - od[1] * rw])
    for (let j = 0; j <= NS; j++) { const t = (Math.PI * j) / NS, c = Math.cos(t), sn = Math.sin(t); pts.push([B[0] + (-od[0] * c + u[0] * sn) * rw, B[1] + (-od[1] * c + u[1] * sn) * rw]) }
    pts.push([B[0] + od[0] * rw - u[0] * stub, B[1] + od[1] * rw - u[1] * stub])
    return pts
  }
  const ctPts: Pt[][] = [
    ...rowX.slice(1, -1).map((bx): Pt[] => cTie([bx, yT], [bx, yB], [0, 1], [bx <= midX ? 1 : -1, 0])),
    ...sideY.map((sy): Pt[] => cTie([x1, sy], [x2, sy], [1, 0], [0, sy <= midY ? 1 : -1])),
  ]
  for (const pts of ctPts) P.push({ kind: 'path', cmds: tube(pts, tt / 2), closed: true, fill: BAR, opacity: 0.85 })

  // 135° tie hook at the top-left corner bar (standard anchor)
  const hk = stub * 1.4
  P.push({ kind: 'path', cmds: tube([[x1, yT], [x1 + hk, yT + hk]], tt / 2), closed: true, fill: BAR, opacity: 0.85 })

  // vertical bars
  const dot = (x: number, y: number) => P.push({ kind: 'circle', cx: x, cy: y, r: br, fill: BAR })
  for (const x of rowX) { dot(x, yT); dot(x, yB) }
  for (const y of sideY) { dot(x1, y); dot(x2, y) }
}

/** Standalone tied-column section drawing (bounds + "SECTION" label + b/h dims),
 *  the engine equivalent of the report's <ColumnSchematic shape="tied" …>. */
export function buildColumnSection(p: ColumnSectionInput): DetailDrawing {
  const P: PlanPrimitive[] = []
  const b = p.b, h = p.h ?? p.b
  const side = 1                            // column b-dimension = 1 world unit
  const W = side, Hh = (h / b) * side, hw = W / 2, hh = Hh / 2
  const ts = W * 0.09
  columnSectionPrimitives(P, 0, 0, side, p)
  // label + note + dimensions
  P.push({ kind: 'text', x: -hw, y: -hh - ts * 1.2, text: 'SECTION', size: ts * 0.9, anchor: 'start', color: '#0056b3', weight: 700 })
  P.push({ kind: 'text', x: 0, y: hh + ts * 1.0, text: `${p.bars} ⌀${p.barDia} · ties ⌀${p.tieDia}${p.tieSpacing ? ` @ ${Math.round(p.tieSpacing)} mm` : ''}`, size: ts * 0.55, anchor: 'middle', color: BAR, weight: 600 })
  P.push({ kind: 'dim', x1: -hw, y1: hh + ts * 2.5, x2: hw, y2: hh + ts * 2.5, text: `b = ${Math.round(b)} mm`, off: 0, size: ts * 0.7 })
  P.push({ kind: 'dim', x1: hw + ts * 1.2, y1: -hh, x2: hw + ts * 1.2, y2: hh, text: `h = ${Math.round(h)} mm`, off: 0, size: ts * 0.7 })

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const acc = (x: number, y: number) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y) }
  for (const pr of P) {
    if (pr.kind === 'line' || pr.kind === 'dim') { acc(pr.x1, pr.y1); acc(pr.x2, pr.y2) }
    else if (pr.kind === 'rect') { acc(pr.x, pr.y); acc(pr.x + pr.w, pr.y + pr.h) }
    else if (pr.kind === 'circle') { acc(pr.cx - pr.r, pr.cy - pr.r); acc(pr.cx + pr.r, pr.cy + pr.r) }
    else if (pr.kind === 'path') { for (const cmd of pr.cmds) acc(cmd.x, cmd.y) }
    else { const w = pr.text.length * pr.size * 0.58, a = pr.anchor ?? 'start'; acc(a === 'start' ? pr.x : a === 'end' ? pr.x - w : pr.x - w / 2, pr.y - pr.size); acc(a === 'start' ? pr.x + w : a === 'end' ? pr.x : pr.x + w / 2, pr.y + pr.size) }
  }
  return { primitives: P, bounds: { minX, minY, maxX, maxY }, title: 'SECTION' }
}
