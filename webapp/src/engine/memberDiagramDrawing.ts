// One member's internal-force diagram (V or M along x) as a vector Drawing for
// the PDF report — the per-member counterpart of the on-screen <Diagram>.
//
// GUARDED SO NOTHING CLIPS. The plot is fitted to the data with headroom on
// both sides of the zero line, so the peak diamond and its label sit INSIDE
// the frame instead of on its edge; every label is clamped to the drawing's
// bounds; and the drawing's `bounds` are the frame itself, so `paintDrawing`
// never crops ink it did not expect.
//
// Coordinates are paper-ish units (1 unit ≈ 1 mm at the intended 85 × 38 mm
// size); `paintDrawing` scales the whole thing to the box it is given.
// Units of the data: x in m, ordinates in whatever `unit` says (kN, kN·m).
import type { Drawing, PlanPrimitive, PathCmd } from './planRenderer'

export interface MemberDiagramOpts {
  title: string
  unit: string
  /** Curve colour (hex). The fill is the same hue blended toward white. */
  color: string
  decimals?: number
  /** Drawing height in the same units as its 85-wide frame — taller to fill a
   *  squarer slot (the report's row beside the section cut). Default 38. */
  height?: number
}

const W = 85
const PAD = { l: 9, r: 3, t: 7, b: 6 }
/** Fraction of the data range kept clear above the top peak and below the bottom one. */
export const HEADROOM = 0.14

const tint = (hex: string, k: number): string => {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * k).toString(16).padStart(2, '0')
  return `#${mix(n >> 16)}${mix((n >> 8) & 255)}${mix(n & 255)}`
}

/** The y-range the plot shows: the data and zero, widened by HEADROOM each way. */
export function guardedRange(ys: readonly number[]): { lo: number; hi: number } {
  let hi = Math.max(0, ...ys), lo = Math.min(0, ...ys)
  if (hi - lo < 1e-9) { hi = 1; lo = -1 }
  const pad = (hi - lo) * HEADROOM
  return { lo: lo < 0 ? lo - pad : lo, hi: hi > 0 ? hi + pad : hi }
}

export function memberDiagramDrawing(xs: readonly number[], ys: readonly number[], o: MemberDiagramOpts): Drawing {
  const P: PlanPrimitive[] = []
  const H = o.height ?? 38
  const d = o.decimals ?? 1
  const x0 = xs[0], x1 = xs[xs.length - 1], xSpan = x1 - x0 || 1
  const { lo, hi } = guardedRange(ys)
  const pw = W - PAD.l - PAD.r, ph = H - PAD.t - PAD.b
  const sx = (x: number) => PAD.l + ((x - x0) / xSpan) * pw
  const sy = (y: number) => PAD.t + ((hi - y) / (hi - lo)) * ph
  // labels never leave the frame: clamp a point to the drawing, leaving room for text
  const cx = (x: number) => Math.min(W - PAD.r, Math.max(PAD.l, x))
  const cy = (y: number) => Math.min(H - PAD.b - 1, Math.max(PAD.t + 1.5, y))

  P.push({ kind: 'rect', x: 0, y: 0, w: W, h: H, stroke: '#dfe5ee', width: 0.6, fill: '#ffffff' })
  P.push({ kind: 'text', x: PAD.l, y: 3.6, text: o.title, size: 2.4, weight: 700, color: '#0f3a73' })
  P.push({ kind: 'text', x: W - PAD.r, y: 3.6, text: o.unit, size: 2, anchor: 'end', color: '#8a96a8' })

  // zero line and the axis frame
  const z = sy(0)
  P.push({ kind: 'line', x1: PAD.l, y1: z, x2: W - PAD.r, y2: z, stroke: '#4a5568', width: 0.9 })
  P.push({ kind: 'line', x1: PAD.l, y1: H - PAD.b, x2: W - PAD.r, y2: H - PAD.b, stroke: '#b8c2d0', width: 0.6 })
  P.push({ kind: 'text', x: PAD.l, y: H - 2.2, text: x0.toFixed(2), size: 1.9, anchor: 'start', color: '#64748b' })
  P.push({ kind: 'text', x: W - PAD.r, y: H - 2.2, text: `${x1.toFixed(2)} m`, size: 1.9, anchor: 'end', color: '#64748b' })

  // the fill to the zero line, then the curve on top
  const pts = xs.map((x, i) => ({ x: sx(x), y: sy(ys[i]) }))
  const fill: PathCmd[] = [{ c: 'M', x: pts[0].x, y: z }, ...pts.map((p) => ({ c: 'L' as const, x: p.x, y: p.y })), { c: 'L', x: pts[pts.length - 1].x, y: z }]
  P.push({ kind: 'path', cmds: fill, fill: tint(o.color, 0.86), closed: true })
  P.push({ kind: 'path', cmds: pts.map((p, i) => ({ c: i ? 'L' as const : 'M' as const, x: p.x, y: p.y })), stroke: o.color, width: 1.6, join: 'round' })

  // the extremes, marked and labelled inside the frame
  let iMax = 0, iMin = 0
  ys.forEach((y, i) => { if (y > ys[iMax]) iMax = i; if (y < ys[iMin]) iMin = i })
  const mark = (i: number, above: boolean) => {
    if (Math.abs(ys[i]) < 1e-9) return
    const p = pts[i]
    P.push({ kind: 'circle', cx: p.x, cy: p.y, r: 0.7, fill: o.color })
    const label = `${ys[i].toFixed(d)} @ ${xs[i].toFixed(2)} m`
    // anchor away from the nearer side wall so the label runs into the plot
    const anchor = p.x > PAD.l + pw * 0.7 ? 'end' : p.x < PAD.l + pw * 0.3 ? 'start' : 'middle'
    P.push({ kind: 'text', x: cx(p.x + (anchor === 'start' ? 1 : anchor === 'end' ? -1 : 0)), y: cy(p.y + (above ? -1.8 : 2.6)), text: label, size: 2, weight: 700, anchor, color: o.color })
  }
  mark(iMax, true)
  if (iMin !== iMax && Math.abs(ys[iMin] - ys[iMax]) > 1e-6 * (Math.abs(ys[iMax]) + 1)) mark(iMin, false)

  return { primitives: P, bounds: { minX: 0, minY: 0, maxX: W, maxY: H } }
}
