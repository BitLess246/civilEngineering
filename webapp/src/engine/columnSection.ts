// ─────────────────────────────────────────────────────────────────────────
// Column cross-section (tied) — an ENGINE port of the report's ColumnSchematic,
// drawn with SVG primitives so it can be placed as the COLUMN part of a footing
// PLAN instead of only as a React component.
//
// Reproduces the report drawing: a light-filled rounded square, the perimeter
// tie hugging the bars, interior crossties that hook 180° around the interior
// bars (§25.7.2.3), the full bar ring, and a 135° tie hook that runs TANGENT
// to the corner bar. Ties/crossties are stroked with round joins (matching the
// report; no offset-polygon artefacts). Colours are caller-supplied so the same
// section reads in the report palette or the footing sheet's orange/white.
//
// Units: sizes mm; drawn in metres (b-dimension = `side` metres).
// ─────────────────────────────────────────────────────────────────────────
import type { PlanPrimitive, PathCmd } from './planRenderer'

export interface ColumnSectionInput {
  b: number            // column width (x), mm
  h?: number           // column depth (y), mm — defaults to b (square)
  cover: number; barDia: number; tieDia: number
  bars: number
}
export interface ColumnSectionColors { concrete?: string; outline?: string; rebar?: string }
type Pt = [number, number]

const REPORT: Required<ColumnSectionColors> = { concrete: '#eef3f8', outline: '#37526e', rebar: '#37526e' }

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

/** Draw a tied column cross-section centred at (cx,cy), the column's b-dimension
 *  spanning `side` metres. Ties/bars use `colors.rebar`; `sw` is the rebar
 *  stroke weight in px. Appends primitives to `P`. */
export function columnSectionPrimitives(
  P: PlanPrimitive[], cx: number, cy: number, side: number, p: ColumnSectionInput,
  colors: ColumnSectionColors = {}, sw = 1.4,
): void {
  const { concrete, outline, rebar } = { ...REPORT, ...colors }
  const b = p.b, h = p.h ?? p.b
  const sc = side / b
  const W = b * sc, Hh = h * sc, hw = W / 2, hh = Hh / 2
  const br = Math.max(W * 0.03, (p.barDia / 2) * sc)
  const inset = (p.cover + p.tieDia / 2) * sc
  const barIn = (p.cover + p.tieDia + p.barDia / 2) * sc
  const x1 = cx - hw + barIn, x2 = cx + hw - barIn, yT = cy - hh + barIn, yB = cy + hh - barIn

  // concrete outline (masks the mat bars beneath it in the plan)
  P.push({ kind: 'path', cmds: roundRect(cx - hw, cy - hh, W, Hh, Math.min(W, Hh) * 0.04), fill: concrete, stroke: outline, width: 1.2, closed: true })

  // bar layout — 4 corners + rest split between b/h faces (as ColumnSchematic)
  const N = Math.max(4, 2 * Math.round(p.bars / 2))
  const bwIn = b - 2 * (p.cover + p.tieDia + p.barDia / 2)
  const hIn = h - 2 * (p.cover + p.tieDia + p.barDia / 2)
  const nx = Math.max(2, Math.min(2 + Math.round(((N - 4) / 2) * (bwIn / (bwIn + hIn))), N / 2))
  const ny = N / 2 + 2 - nx
  const rowX = Array.from({ length: nx }, (_, i) => (nx === 1 ? (x1 + x2) / 2 : x1 + ((x2 - x1) * i) / (nx - 1)))
  const sideY = Array.from({ length: Math.max(0, ny - 2) }, (_, i) => yT + ((yB - yT) * (i + 1)) / (ny - 1))
  const midX = (x1 + x2) / 2, midY = (yT + yB) / 2

  const stroke = (pts: Pt[], closed = false) =>
    P.push({ kind: 'path', stroke: rebar, width: sw, fill: 'none', join: 'round', cap: 'round', closed, cmds: pts.map((q, i) => ({ c: i === 0 ? 'M' : 'L', x: q[0], y: q[1] })) })

  // perimeter tie — a rounded rectangle hugging the bars
  const tRr = Math.max(br, 2.5 * p.tieDia * sc)
  P.push({ kind: 'path', cmds: roundRect(cx - hw + inset, cy - hh + inset, W - 2 * inset, Hh - 2 * inset, tRr), stroke: rebar, width: sw, fill: 'none', join: 'round', closed: true })

  // interior crossties — 180° hooks around the interior face bars
  const rw = br + (p.tieDia / 2) * sc, stub = rw * 1.6, NS = 12
  const cTie = (A: Pt, B: Pt, u: Pt, od: Pt): Pt[] => {
    const pts: Pt[] = [[A[0] + od[0] * rw + u[0] * stub, A[1] + od[1] * rw + u[1] * stub]]
    for (let j = 0; j <= NS; j++) { const t = (Math.PI * j) / NS, c = Math.cos(t), sn = Math.sin(t); pts.push([A[0] + (od[0] * c - u[0] * sn) * rw, A[1] + (od[1] * c - u[1] * sn) * rw]) }
    pts.push([B[0] - od[0] * rw, B[1] - od[1] * rw])
    for (let j = 0; j <= NS; j++) { const t = (Math.PI * j) / NS, c = Math.cos(t), sn = Math.sin(t); pts.push([B[0] + (-od[0] * c + u[0] * sn) * rw, B[1] + (-od[1] * c + u[1] * sn) * rw]) }
    pts.push([B[0] + od[0] * rw - u[0] * stub, B[1] + od[1] * rw - u[1] * stub])
    return pts
  }
  for (const bx of rowX.slice(1, -1)) stroke(cTie([bx, yT], [bx, yB], [0, 1], [bx <= midX ? 1 : -1, 0]))
  for (const sy of sideY) stroke(cTie([x1, sy], [x2, sy], [1, 0], [0, sy <= midY ? 1 : -1]))

  // 135° tie hook at the top-left corner bar — runs TANGENT to the bar's side
  const inv = Math.SQRT1_2, d: Pt = [inv, inv], nrm: Pt = [-inv, inv]   // dir into core, tangent offset
  const off = br + (p.tieDia / 2) * sc                                   // tangent to the bar edge
  const hStart: Pt = [x1 + nrm[0] * off, yT + nrm[1] * off]
  const hk = stub * 1.9
  stroke([hStart, [hStart[0] + d[0] * hk, hStart[1] + d[1] * hk]])

  // vertical bars
  const dot = (x: number, y: number) => P.push({ kind: 'circle', cx: x, cy: y, r: br, fill: rebar })
  for (const x of rowX) { dot(x, yT); dot(x, yB) }
  for (const y of sideY) { dot(x1, y); dot(x2, y) }
}
