// ─────────────────────────────────────────────────────────────────────────
// Paint a `Drawing` into a jsPDF document as VECTOR geometry.
//
// Every drawing in this app — borehole logs, framing plans, footing details,
// laboratory charts, the liquefaction FS profile — is already a typed
// `PlanPrimitive[]`, and `planToSvg` paints it for the screen. Until now the
// only route into a PDF was to rasterise that SVG through a canvas, which
// costs resolution, costs a browser, and cannot be tested in Node.
//
// This maps the same primitives onto jsPDF's own drawing calls, so a printed
// borehole log is as sharp as the type beside it and the painter can be
// unit-tested without a DOM.
//
// COORDINATES. A `Drawing` carries its own bounds in its own units. This fits
// it into a target box in millimetres of paper, preserving aspect ratio, and
// scales stroke widths and font sizes by the same factor — so a drawing does
// not arrive with hairlines at one size and slabs of ink at another.
// ─────────────────────────────────────────────────────────────────────────

import type { jsPDF } from 'jspdf'
import type { Drawing, PlanPrimitive, PathCmd } from '../engine/planRenderer'

export type RGB = [number, number, number]

/** '#0056b3' or '#abc' → [r, g, b]. Unknown/none returns undefined. */
export function parseColor(c: string | undefined): RGB | undefined {
  if (!c || c === 'none' || c === 'transparent') return undefined
  const h = c.trim().replace('#', '')
  if (h.length === 3) {
    const [r, g, b] = h.split('').map((x) => parseInt(x + x, 16))
    return [r, g, b]
  }
  if (h.length === 6) {
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  return undefined
}

export interface PaintBox {
  /** Top-left of the target box, mm. */
  x: number
  y: number
  /** Target width, mm. The height follows from the drawing's aspect ratio. */
  w: number
  /** Cap on the drawn height, mm. The drawing shrinks to fit if it would exceed it. */
  maxH?: number
}

export interface PaintResult {
  /** Actual drawn size, mm. */
  width: number
  height: number
  /** Scale applied, target mm per drawing unit. */
  scale: number
}

/** Where a drawing will land, without painting it — for page-break decisions. */
export function paintedSize(d: Drawing, box: PaintBox): PaintResult {
  const b = d.bounds
  const dw = Math.max(b.maxX - b.minX, 1e-9)
  const dh = Math.max(b.maxY - b.minY, 1e-9)
  let scale = box.w / dw
  if (box.maxH != null && dh * scale > box.maxH) scale = box.maxH / dh
  return { width: dw * scale, height: dh * scale, scale }
}

/**
 * Paint the drawing. Returns the space it used so the caller can advance its
 * cursor.
 *
 * Text is placed with jsPDF's baseline convention, which differs from the
 * SVG serialiser's `dominant-baseline: middle`; the offset below keeps a label
 * sitting where the on-screen drawing puts it, so the two agree.
 */
export function paintDrawing(doc: jsPDF, d: Drawing, box: PaintBox): PaintResult {
  const fit = paintedSize(d, box)
  const b = d.bounds
  const X = (v: number) => box.x + (v - b.minX) * fit.scale
  const Y = (v: number) => box.y + (v - b.minY) * fit.scale
  const L = (v: number) => v * fit.scale

  const setStroke = (c: string | undefined, w: number | undefined, dash?: number[]) => {
    const rgb = parseColor(c)
    if (!rgb) return false
    doc.setDrawColor(...rgb)
    doc.setLineWidth(Math.max(L(w ?? 0.3), 0.05))
    // jsPDF throws on an empty pattern; [] means "solid".
    doc.setLineDashPattern(dash ? dash.map((v) => L(v)) : [], 0)
    return true
  }
  const setFill = (c: string | undefined) => {
    const rgb = parseColor(c)
    if (!rgb) return false
    doc.setFillColor(...rgb)
    return true
  }

  for (const p of d.primitives as PlanPrimitive[]) {
    switch (p.kind) {
      case 'line': {
        if (!setStroke(p.stroke, p.width, p.dash)) break
        doc.line(X(p.x1), Y(p.y1), X(p.x2), Y(p.y2))
        break
      }
      case 'rect': {
        const hasFill = setFill(p.fill)
        const hasStroke = setStroke(p.stroke, p.width, p.dash)
        if (!hasFill && !hasStroke) break
        doc.rect(X(p.x), Y(p.y), L(p.w), L(p.h), hasFill && hasStroke ? 'FD' : hasFill ? 'F' : 'S')
        break
      }
      case 'circle': {
        const hasFill = setFill(p.fill)
        const hasStroke = setStroke(p.stroke, p.width)
        if (!hasFill && !hasStroke) break
        doc.circle(X(p.cx), Y(p.cy), L(p.r), hasFill && hasStroke ? 'FD' : hasFill ? 'F' : 'S')
        break
      }
      case 'text': {
        const rgb = parseColor(p.color) ?? [15, 27, 42]
        doc.setTextColor(...rgb)
        doc.setFont('sans', (p.weight ?? 400) >= 600 ? 'bold' : 'normal')
        const size = L(p.size)
        // jsPDF sizes in points; the drawing is in mm of paper.
        doc.setFontSize(size * 2.834645)
        doc.text(p.text, X(p.x), Y(p.y) + size * 0.36, {
          align: p.anchor === 'middle' ? 'center' : p.anchor === 'end' ? 'right' : 'left',
          angle: p.rotate ? -p.rotate : undefined,
        })
        break
      }
      case 'dim': {
        if (!setStroke('#5c6675', 0.2)) break
        doc.line(X(p.x1), Y(p.y1), X(p.x2), Y(p.y2))
        doc.setTextColor(92, 102, 117)
        doc.setFont('sans', 'normal')
        doc.setFontSize(L(p.size) * 2.834645)
        doc.text(p.text, X((p.x1 + p.x2) / 2), Y((p.y1 + p.y2) / 2) - L(p.off), { align: 'center' })
        break
      }
      case 'path': {
        const hasFill = setFill(p.fill)
        const hasStroke = setStroke(p.stroke, p.width, p.dash)
        if (!hasFill && !hasStroke) break
        paintPath(doc, p.cmds, X, Y, hasFill && hasStroke ? 'FD' : hasFill ? 'F' : 'S', p.closed)
        break
      }
    }
  }

  doc.setLineDashPattern([], 0)
  return fit
}

/**
 * Path commands as straight segments. An arc is drawn as its chord: the paths
 * this app emits are rebar tubes at small scale, where the difference is under
 * a printer dot — but it IS an approximation, so it is stated rather than
 * silently accepted.
 */
function paintPath(
  doc: jsPDF, cmds: PathCmd[],
  X: (v: number) => number, Y: (v: number) => number,
  style: string, closed?: boolean,
): void {
  const pts: [number, number][] = []
  for (const c of cmds) pts.push([X(c.x), Y(c.y)])
  if (pts.length < 2) return

  const [x0, y0] = pts[0]
  const rel: [number, number][] = []
  for (let i = 1; i < pts.length; i++) {
    rel.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]])
  }
  if (closed) rel.push([x0 - pts[pts.length - 1][0], y0 - pts[pts.length - 1][1]])
  doc.lines(rel, x0, y0, [1, 1], style, closed ?? false)
}
