// ─────────────────────────────────────────────────────────────────────────
// COLUMN BASE PLATE DETAIL — one designed base plate, as a sheet.
//
//   PLAN      the plate N × B, the column's W outline on it (depth along N),
//             the four rods at their designed ±rodX / ±rodY, dimensioned;
//   SECTION   along N: the column stub, its fillets to the plate, the plate,
//             the grout bed, the concrete, and the rods down to their heads
//             at hef, with nut and washer above the plate.
// Every number is the schedule row's (`BasePlateScheduleRow`): plate size and
// thickness, rods, embedment and the column weld. Units mm, sheet y DOWN.
// ─────────────────────────────────────────────────────────────────────────
import type { BasePlateScheduleRow } from './pipeline'
import type { PlanPrimitive, Drawing, PathCmd } from './planRenderer'
import { SHEET_INK, SHEET_NOTE, STEEL, STEEL_CONTEXT, SHEET_STEELWORK, SHEET_GRID } from './sheetInk'
import { leader, titleBlock, sheetBounds } from './detailSheet'

export interface BasePlateDetailInput {
  row: BasePlateScheduleRow
  col: { d: number; bf: number; tf: number; tw: number }
  /** Grout bed under the plate, mm. */
  grout?: number
  mark?: string
}
export interface BasePlateDetailDrawing extends Drawing { title: string }

const GROUT = 25

export function buildBasePlateDetail(i: BasePlateDetailInput, opts: { detailNo?: string; sheetRef?: string } = {}): BasePlateDetailDrawing {
  const { row, col } = i
  const p = row.design
  const N = p.N, B = p.B, t = row.tAdopt
  const grout = i.grout ?? GROUT
  const da = row.anchors?.da ?? 25, hef = row.anchors?.hef ?? 200
  const u = Math.max(N, 300) * 0.035
  const P: PlanPrimitive[] = []
  const txt = (x: number, y: number, text: string, size = u, anchor: 'start' | 'middle' | 'end' = 'start', color = SHEET_NOTE, weight = 500) =>
    P.push({ kind: 'text', x, y, text, size, anchor, color, weight })

  // ── PLAN: plate centre at (cx, cy), N along x ────────────────────────────
  const cx = N / 2 + u * 3, cy = B / 2 + u * 4
  txt(cx, u * 1.2, 'PLAN', u * 1.3, 'middle', SHEET_INK, 700)
  P.push({ kind: 'rect', x: cx - N / 2, y: cy - B / 2, w: N, h: B, fill: SHEET_STEELWORK, stroke: SHEET_INK, width: 1.4 })
  // the column's W, depth along N
  const I: [number, number][] = [
    [-col.d / 2, -col.bf / 2], [-col.d / 2 + col.tf, -col.bf / 2], [-col.d / 2 + col.tf, -col.tw / 2], [col.d / 2 - col.tf, -col.tw / 2],
    [col.d / 2 - col.tf, -col.bf / 2], [col.d / 2, -col.bf / 2], [col.d / 2, col.bf / 2], [col.d / 2 - col.tf, col.bf / 2],
    [col.d / 2 - col.tf, col.tw / 2], [-col.d / 2 + col.tf, col.tw / 2], [-col.d / 2 + col.tf, col.bf / 2], [-col.d / 2, col.bf / 2],
  ]
  P.push({ kind: 'path', cmds: I.map(([x, y], k) => ({ c: k === 0 ? 'M' : 'L', x: cx + x, y: cy + y }) as PathCmd), closed: true, fill: STEEL_CONTEXT, stroke: SHEET_INK, width: 0.9 })
  // rods
  const rods = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => [cx + sx! * p.rodX, cy + sy! * p.rodY] as const)
  for (const [x, y] of rods) {
    P.push({ kind: 'circle', cx: x, cy: y, r: da / 2 + 4, stroke: SHEET_INK, fill: 'none', width: 0.8 })   // the oversize hole's washer
    P.push({ kind: 'circle', cx: x, cy: y, r: da / 2, stroke: STEEL, fill: 'none', width: 1.4 })
  }
  // dimensions: plate, rod spacing
  P.push({ kind: 'dim', x1: cx - N / 2, y1: cy + B / 2 + u * 2.2, x2: cx + N / 2, y2: cy + B / 2 + u * 2.2, text: `N = ${Math.round(N)}`, off: 0, size: u * 0.85, ext: cy + B / 2 })
  P.push({ kind: 'dim', x1: cx - N / 2 - u * 2.2, y1: cy - B / 2, x2: cx - N / 2 - u * 2.2, y2: cy + B / 2, text: `B = ${Math.round(B)}`, off: 0, size: u * 0.85, ext: cx - N / 2 })
  P.push({ kind: 'dim', x1: cx - p.rodX, y1: cy - B / 2 - u * 1.6, x2: cx + p.rodX, y2: cy - B / 2 - u * 1.6, text: `${Math.round(2 * p.rodX)}`, off: 0, size: u * 0.8, ext: cy - p.rodY })
  P.push({ kind: 'dim', x1: cx + N / 2 + u * 1.6, y1: cy - p.rodY, x2: cx + N / 2 + u * 1.6, y2: cy + p.rodY, text: `${Math.round(2 * p.rodY)}`, off: 0, size: u * 0.8, ext: cx + p.rodX })
  txt(cx, cy + B / 2 + u * 4.4, `PL ${Math.round(N)}×${Math.round(B)}×${t} (A36)`, u * 0.9, 'middle', SHEET_INK, 700)
  txt(cx, cy + B / 2 + u * 5.6, `${row.shape} — d ALONG N`, u * 0.8, 'middle')

  // ── SECTION along N, to the right ────────────────────────────────────────
  const sx = cx + N / 2 + u * 7 + N / 2          // section centreline
  const top = u * 4                               // top of the column stub
  const stub = Math.max(140, col.d * 0.5)
  const plTop = top + stub, plBot = plTop + t, grBot = plBot + grout
  const concBot = grBot + hef + u * 3
  txt(sx, u * 1.2, 'SECTION', u * 1.3, 'middle', SHEET_INK, 700)
  // concrete and grout
  P.push({ kind: 'rect', x: sx - N / 2 - u * 2.5, y: grBot, w: N + u * 5, h: concBot - grBot, fill: 'none', stroke: STEEL_CONTEXT, width: 0.8, dash: [u * 0.7, u * 0.4] })
  P.push({ kind: 'rect', x: sx - N / 2 - u * 0.6, y: plBot, w: N + u * 1.2, h: grout, fill: SHEET_GRID, stroke: STEEL_CONTEXT, width: 0.6 })
  // plate
  P.push({ kind: 'rect', x: sx - N / 2, y: plTop, w: N, h: t, fill: SHEET_INK })
  // column stub, broken at the top: flanges edge-on at ±d/2
  P.push({ kind: 'rect', x: sx - col.d / 2, y: top, w: col.d, h: stub, fill: SHEET_STEELWORK, stroke: 'none' })
  P.push({ kind: 'rect', x: sx - col.d / 2, y: top, w: col.tf, h: stub, fill: STEEL_CONTEXT })
  P.push({ kind: 'rect', x: sx + col.d / 2 - col.tf, y: top, w: col.tf, h: stub, fill: STEEL_CONTEXT })
  P.push({ kind: 'line', x1: sx - col.d / 2 - u, y1: top, x2: sx + col.d / 2 + u, y2: top, stroke: SHEET_GRID, width: 0.6, dash: [u, u * 0.4, u * 0.2, u * 0.4] })
  // fillets at the foot of each flange, both faces
  const w = row.weld.w
  // each face of each flange, the fillet on the side away from the steel
  const faces: [number, 1 | -1][] = [
    [sx - col.d / 2, -1], [sx - col.d / 2 + col.tf, 1], [sx + col.d / 2 - col.tf, -1], [sx + col.d / 2, 1],
  ]
  for (const [x, s] of faces) {
    P.push({ kind: 'path', closed: true, fill: SHEET_INK, stroke: SHEET_INK, width: 0.4,
      cmds: [{ c: 'M', x, y: plTop }, { c: 'L', x: x + s * w, y: plTop }, { c: 'L', x, y: plTop - w }] })
  }
  // rods: shank to the head at hef below the grout, nut and washer above
  for (const sgn of [-1, 1]) {
    const x = sx + sgn * p.rodX
    P.push({ kind: 'rect', x: x - da / 2, y: plTop - u * 1.4, w: da, h: grBot + hef - (plTop - u * 1.4), fill: STEEL })
    P.push({ kind: 'rect', x: x - da, y: plTop - u * 0.5, w: 2 * da, h: u * 0.5, fill: SHEET_INK })        // plate washer
    P.push({ kind: 'rect', x: x - da * 0.8, y: plTop - u * 1.3, w: 1.6 * da, h: u * 0.8, fill: STEEL })     // nut
    P.push({ kind: 'rect', x: x - da * 0.9, y: grBot + hef - u * 0.4, w: 1.8 * da, h: u * 0.8, fill: STEEL }) // head
  }
  P.push({ kind: 'dim', x1: sx + N / 2 + u * 3, y1: grBot, x2: sx + N / 2 + u * 3, y2: grBot + hef, text: `hef ${hef}`, off: 0, size: u * 0.8, ext: sx + p.rodX })
  P.push(...leader({ x: sx + N / 2 - u, y: plTop + t / 2, tx: sx + N / 2 + u * 3.5, ty: plTop - u * 2.4, text: `PL t = ${t}`, size: u * 0.8 }))
  P.push(...leader({ x: sx + N / 2, y: plBot + grout / 2, tx: sx + N / 2 + u * 3.5, ty: plBot + u * 2.2, text: `NON-SHRINK GROUT ${grout}`, size: u * 0.8 }))
  P.push(...leader({ x: sx + col.d / 2 + w / 2, y: plTop - w / 3, tx: sx + col.d / 2 + u * 6, ty: top + u * 2, text: `${w} E70XX FILLET ALL ROUND`, size: u * 0.8 }))
  P.push(...leader({ x: sx - p.rodX, y: grBot + hef * 0.6, tx: sx - N / 2 - u * 3.2, ty: grBot + hef * 0.6 + u * 2.4,
    text: `${row.anchors?.n ?? 4}-⌀${da} A307 HEADED`, text2: 'NUT + PLATE WASHER', size: u * 0.8 }))
  txt(sx, top - u * 0.6, row.shape, u * 0.9, 'middle', SHEET_INK, 600)

  // ── notes and title ───────────────────────────────────────────────────────
  const bodyBottom = Math.max(cy + B / 2 + u * 6.5, concBot + u)
  const mo = row.moment
  const notes = [
    `DESIGNED FOR Pu = ${row.Pu.toFixed(1)} kN${row.Tu > 0 ? `, UPLIFT ${row.Tu.toFixed(1)} kN` : ''}${mo ? `; BASE MOMENT ${mo.strong.name} / ${mo.weak.name} (DG1 UNIFORM BEARING, BOTH AXES)` : ''}. AISC 360-16 §J8, DESIGN GUIDE 1.`,
    `ANCHORS: ACI 318-14 CH. 17${row.anchors ? ` — ${Math.round(row.anchors.check.util * 100)}% (${row.anchors.check.governs.toUpperCase()})` : ''}. HOLES OVERSIZE FOR SETTING; PLATE WASHERS WELDED AFTER ERECTION.`,
  ]
  const x0 = u * 0.5
  notes.forEach((s, k) => txt(x0, bodyBottom + u * (1.5 + k * 1.3), s, u * 0.8))
  const title = `${i.mark ? `${i.mark} — ` : ''}COLUMN BASE PLATE @ ${row.node}`
  const right = sx + N / 2 + u * 14
  P.push(...titleBlock({ x: x0, w: right - x0, top: bodyBottom + u * (2.2 + notes.length * 1.3), u: u * 0.82, title, detailNo: opts.detailNo, sheetRef: opts.sheetRef, scale: 'NTS' }).prims)
  return { primitives: P, bounds: sheetBounds(P, u), title }
}
