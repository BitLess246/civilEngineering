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
// scales GEOMETRY — coordinates, radii, text sizes, dash patterns — by that
// factor.
//
// STROKE WIDTHS ARE NOT GEOMETRY. `PlanPrimitive.width` is a PEN WEIGHT in
// pixels, which is how `planToSvg` uses it: `stroke-width="${p.width}"`, raw,
// whatever the drawing's scale. Everything else on a primitive is in the
// drawing's own units — `text.size` 0.05 is 50 mm of building, `dash` [0.06,
// 0.05] is 60 and 50 mm of building — but `width` 1.2 is 1.2 px of ink.
//
// Scaling it as though it were metres is what this file used to do, and the
// error grows with the drawing: a framing plan 18 m across, fitted to 170 mm
// of paper, has a scale of 10.7 mm per metre, so a 1.2 "unit" outline printed
// at 12.9 mm wide. Frame elevations reached 19.7 mm. The sheets came out as
// slabs of solid colour, and only the small drawings (a notes sheet, scale
// 0.65) looked nearly right — which is why it survived: the defect is
// invisible on exactly the drawings whose bounds are small.
//
// A pen weight converts through the SAME px-per-drawing relationship the
// screen uses, so a printed sheet has the line weights of the sheet on screen.
// ─────────────────────────────────────────────────────────────────────────

import type { jsPDF } from 'jspdf'
import type { Drawing, PlanPrimitive, PathCmd } from '../engine/planRenderer'
import { extensionLines } from '../engine/planRenderer'

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
  /** Scale applied to GEOMETRY, target mm per drawing unit. */
  scale: number
  /** Millimetres of paper per PIXEL of pen weight — see the header. */
  penScale: number
}

/**
 * The width `planToSvg` gives a drawing on screen, less its padding — the
 * reference a pen weight in pixels is measured against.
 *
 * `planToSvg(d, pxWidth = 1100)` pads 24 px each side, so the drawing's own
 * bounds span 1052 px. Printing a 1.2 px line therefore means 1.2/1052 of the
 * drawn width: 0.19 mm on a 170 mm sheet, which is a drafting pen.
 */
export const SVG_REFERENCE_PX = 1100 - 2 * 24

/** Where a drawing will land, without painting it — for page-break decisions. */
export function paintedSize(d: Drawing, box: PaintBox): PaintResult {
  const b = d.bounds
  const dw = Math.max(b.maxX - b.minX, 1e-9)
  const dh = Math.max(b.maxY - b.minY, 1e-9)
  let scale = box.w / dw
  if (box.maxH != null && dh * scale > box.maxH) scale = box.maxH / dh
  const width = dw * scale
  return { width, height: dh * scale, scale, penScale: width / SVG_REFERENCE_PX }
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
  /** A pen weight in px → mm of paper. Floored at a hairline so a 0.3 px rule
   *  on a small drawing still marks the page. */
  const pen = (w: number | undefined) => Math.max((w ?? 1) * fit.penScale, 0.05)

  const setStroke = (c: string | undefined, w: number | undefined, dash?: number[]) => {
    const rgb = parseColor(c)
    if (!rgb) return false
    doc.setDrawColor(...rgb)
    doc.setLineWidth(pen(w))
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
        // Extension lines first, in the pale grey and broken, so the dimension
        // line lands on top of them.
        for (const e of extensionLines(p)) {
          if (setStroke('#9aa5b5', 0.6, [e.dash, e.dash * 0.7])) doc.line(X(e.x1), Y(e.y1), X(e.x2), Y(e.y2))
        }
        if (!setStroke('#5c6675', 0.8)) break
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
