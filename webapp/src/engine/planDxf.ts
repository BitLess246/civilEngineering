// ─────────────────────────────────────────────────────────────────────────
// PLAN SHEETS AS DXF — the same primitives `planToSvg` paints, written as a
// drawing a CAD package can edit.
//
// FORMAT. ASCII DXF, release 12 (AC1009): the oldest version every CAD
// program still opens without complaint (AutoCAD, BricsCAD, DraftSight,
// LibreCAD, QCAD), and the one with no object handles or class tables to
// get wrong. It has no true colour, lineweight or hatch — none of which a
// working drawing needs from an export; the steel is told apart by LAYER.
//
// DWG is Autodesk's closed binary format and there is no maintained writer
// for it that runs in a browser. Every CAD package that reads DWG reads DXF,
// and AutoCAD saves an opened DXF as DWG in one step.
//
// UNITS AND AXES. Sheet primitives are in metres with y pointing DOWN (they
// were laid out for the screen). DXF is y-UP, and a structural drawing is in
// millimetres, so every coordinate is ×1000 and y is negated. A 400 mm column
// measures 400 in the CAD file.
//
// WHAT CHANGES FROM THE SVG.
//   · Fills are dropped: CAD drawings carry outlines, and the pale concrete
//     tint and the white "casing" strokes (drawn under a bar so the bar reads
//     as passing in front) only make sense on a screen.
//   · A filled bar dot becomes a DONUT (a closed two-arc polyline with width),
//     which is what AutoCAD's own DONUT command writes.
//   · SVG arcs become polyline bulges.
//   · A dimension is written as the lines and text it is drawn with, not a
//     DIMENSION entity: an R12 associative dimension needs its block written
//     too, and a reader that skips it would lose the dimension entirely.
//   · Symbols the R12 code page lacks are written as AutoCAD escapes: ⌀/Ø as
//     %%c, ° as %%d, anything else outside ASCII as \U+XXXX.
//
// Units: input m (sheet space, y down); output mm (y up).
// ─────────────────────────────────────────────────────────────────────────
import type { Drawing, PlanPrimitive, PathCmd } from './planRenderer'
import { extensionLines } from './planRenderer'
import { SHEET_INK, SHEET_NOTE, SHEET_GRID, STEEL, STEEL_LIGHT, STEEL_CONTEXT, SHEET_ZONE, SHEET_WARN } from './sheetInk'

/** A layer: its name and AutoCAD Colour Index. */
interface Layer { name: string; aci: number }

/** The sheet palette, by what the colour MEANS on the drawing. */
const LAYER_BY_INK: Record<string, Layer> = {
  [STEEL]: { name: 'REBAR', aci: 5 },
  [STEEL_LIGHT]: { name: 'REBAR-TIES', aci: 4 },
  [STEEL_CONTEXT]: { name: 'REBAR-CONTEXT', aci: 8 },
  [SHEET_INK]: { name: 'OUTLINE', aci: 7 },
  '#0f4c92': { name: 'BEAMS', aci: 5 },
  [SHEET_GRID]: { name: 'GRID', aci: 8 },
  '#94a3b8': { name: 'GRID', aci: 8 },
  [SHEET_NOTE]: { name: 'NOTES', aci: 8 },
  [SHEET_ZONE]: { name: 'ZONES', aci: 3 },
  [SHEET_WARN]: { name: 'WARNINGS', aci: 1 },
}
const TEXT_LAYER: Layer = { name: 'TEXT', aci: 7 }
const DIM_LAYER: Layer = { name: 'DIMENSIONS', aci: 7 }
const DETAIL_LAYER: Layer = { name: 'DETAIL', aci: 8 }

const norm = (c?: string) => (c ?? '').trim().toLowerCase()
/** A colour that paints nothing a CAD file should keep. */
const invisible = (c?: string) => {
  const n = norm(c)
  return !n || n === 'none' || n === '#fff' || n === '#ffffff' || n === 'white' || n === 'transparent'
}
const layerOf = (c?: string): Layer => LAYER_BY_INK[norm(c)] ?? DETAIL_LAYER

/**
 * Typographic characters the sheets use, as the ASCII a drawing office would
 * type. AutoCAD reads a \U+XXXX escape in TEXT, but not every DXF reader does
 * (ezdxf and several viewers print the escape literally), and "400x400" and
 * "LAP - CLASS B" read the same to an engineer as their typeset forms.
 */
const ASCII_FOR: Record<string, string> = {
  '×': 'x', '—': '-', '–': '-', '−': '-', '‐': '-', '·': '.', '•': '*',
  '≤': '<=', '≥': '>=', '≈': '~', '→': '->', '←': '<-', '↑': '^', '↓': 'v',
  '′': "'", '″': '"', '‘': "'", '’': "'", '“': '"', '”': '"', '…': '...',
  '²': '2', '³': '3', 'ℓ': 'l', 'φ': 'phi', 'ϕ': 'phi', 'Σ': 'SUM', 'Δ': 'D',
  'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'ρ': 'rho', 'λ': 'lambda', 'μ': 'u',
  '√': 'sqrt', '½': '1/2', '¼': '1/4', '¾': '3/4', '§': 'Sec. ', 'ψ': 'psi',
  '\u00a0': ' ', '\u2009': ' ', '\u202f': ' ',
}

/** Text in the R12 code page: AutoCAD's own codes for Ø ° ±, ASCII for
 *  the typography above, and a \U+XXXX escape only for anything else. */
export function dxfText(s: string): string {
  let out = ''
  for (const ch of s) {
    if (ch === '⌀' || ch === 'Ø' || ch === 'ø') out += '%%c'
    else if (ch === '°') out += '%%d'
    else if (ch === '±') out += '%%p'
    else if (ASCII_FOR[ch] !== undefined) out += ASCII_FOR[ch]
    else {
      const cp = ch.codePointAt(0)!
      out += cp < 0x80 ? ch : `\\U+${cp.toString(16).toUpperCase().padStart(4, '0')}`
    }
  }
  return out
}

/**
 * The bulge of an SVG arc from `a` to `b`, in the Y-UP frame the DXF is
 * written in: tan(θ/4), positive counter-clockwise.
 *
 * SVG's sweep-flag 1 is the positive-angle direction of a y-DOWN screen,
 * which is clockwise to the eye; negating y makes it counter-clockwise, so
 * sweep 1 ⇒ positive bulge. Radii too small for the chord are scaled up to
 * the half-chord, as SVG itself does.
 */
export function arcBulge(a: [number, number], b: [number, number], r: number, large: 0 | 1, sweep: 0 | 1): number {
  const c = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (c < 1e-12) return 0
  const R = Math.max(r, c / 2)
  let theta = 2 * Math.asin(Math.min(1, c / (2 * R)))
  if (large) theta = 2 * Math.PI - theta
  return Math.tan(theta / 4) * (sweep ? 1 : -1)
}

/** One DXF group: a code line and a value line. */
const g = (code: number, v: string | number) =>
  `${code}\n${typeof v === 'number' ? (Number.isInteger(v) && code >= 60 && code < 80 ? String(v) : fmt(v)) : v}\n`
const fmt = (v: number) => {
  const r = Math.round(v * 1e4) / 1e4
  return Object.is(r, -0) ? '0' : String(r)
}

/** Serialise a sheet as an R12 ASCII DXF string. */
export function planToDxf(d: Drawing): string {
  return writeDxf([{ d, dx: 0, dy: 0 }], d.bounds)
}

/**
 * The whole sheet set in ONE drawing, laid out left to right in rows of
 * `perRow`, each sheet a gap apart — so a drawing set opens as a single file
 * with every sheet at true scale, rather than forty downloads.
 */
export function planSetToDxf(drawings: Drawing[], perRow = 4): string {
  if (!drawings.length) return writeDxf([], { minX: 0, minY: 0, maxX: 1, maxY: 1 })
  const w = (d: Drawing) => d.bounds.maxX - d.bounds.minX
  const h = (d: Drawing) => d.bounds.maxY - d.bounds.minY
  const placed: { d: Drawing; dx: number; dy: number }[] = []
  let y = 0, gap = 0
  for (let r = 0; r * perRow < drawings.length; r++) {
    const row = drawings.slice(r * perRow, (r + 1) * perRow)
    // the gap is sized to the row it separates: sheets are at TRUE scale, so a
    // 12 m framing plan and a 2 m footing detail differ sixfold, and one gap
    // for the whole set left the small sheets a building-width apart
    gap = Math.max(...row.map((d) => Math.max(w(d), h(d)))) * 0.08
    let x = 0
    for (const d of row) {
      placed.push({ d, dx: x - d.bounds.minX, dy: y - d.bounds.minY })
      x += w(d) + gap
    }
    y += Math.max(...row.map(h)) + gap
  }
  const bounds = { minX: 0, minY: 0, maxX: 0, maxY: y - gap }
  for (const p of placed) bounds.maxX = Math.max(bounds.maxX, p.dx + p.d.bounds.maxX)
  return writeDxf(placed, bounds)
}

function writeDxf(sheets: { d: Drawing; dx: number; dy: number }[], b: Drawing['bounds']): string {
  // the offset of the sheet being written, in sheet metres
  let ox = 0, oy = 0
  const X = (x: number) => (x + ox) * 1000
  const Y = (y: number) => -(y + oy) * 1000
  const L = (v: number) => v * 1000
  const used = new Map<string, Layer>()
  const ent: string[] = []
  let dashed = false
  const layerName = (l: Layer) => { used.set(l.name, l); return l.name }

  const line = (x1: number, y1: number, x2: number, y2: number, layer: string, dash = false) => {
    if (dash) dashed = true
    ent.push(g(0, 'LINE') + g(8, layer) + (dash ? g(6, 'DASHED') : '')
      + g(10, X(x1)) + g(20, Y(y1)) + g(30, 0) + g(11, X(x2)) + g(21, Y(y2)) + g(31, 0))
  }
  /** A 2D polyline; `bulges[k]` belongs to vertex k (the arc leaving it). */
  const poly = (pts: [number, number][], closed: boolean, layer: string, opts: { dash?: boolean; bulges?: number[]; width?: number } = {}) => {
    if (pts.length < 2) return
    if (opts.dash) dashed = true
    let s = g(0, 'POLYLINE') + g(8, layer) + (opts.dash ? g(6, 'DASHED') : '') + g(66, 1)
      + g(10, 0) + g(20, 0) + g(30, 0) + g(70, closed ? 1 : 0)
    if (opts.width) s += g(40, opts.width) + g(41, opts.width)
    pts.forEach(([x, y], k) => {
      const b = opts.bulges?.[k] ?? 0
      s += g(0, 'VERTEX') + g(8, layer) + g(10, X(x)) + g(20, Y(y)) + g(30, 0) + (b ? g(42, b) : '')
    })
    ent.push(s + g(0, 'SEQEND') + g(8, layer))
  }
  const text = (x: number, y: number, str: string, size: number, anchor: 'start' | 'middle' | 'end', rotate: number, layer: string) => {
    // SVG font-size is the em; CAD text height is the cap height
    const h = L(size) * 0.72
    const hj = anchor === 'middle' ? 1 : anchor === 'end' ? 2 : 0
    // the SVG sets dominant-baseline middle, so the anchor is mid-height
    let s = g(0, 'TEXT') + g(8, layer) + g(10, X(x)) + g(20, Y(y)) + g(30, 0) + g(40, h) + g(1, dxfText(str))
    // SVG rotates clockwise on a y-down screen: counter-clockwise in DXF is −
    if (rotate) s += g(50, -rotate)
    s += g(72, hj) + g(11, X(x)) + g(21, Y(y)) + g(31, 0) + g(73, 2)
    ent.push(s)
  }

  for (const sh of sheets) {
    ox = sh.dx; oy = sh.dy
    for (const p of sh.d.primitives) prim(p)
  }

  function prim(p: PlanPrimitive) {
    if (p.kind === 'line') {
      if (invisible(p.stroke)) return
      line(p.x1, p.y1, p.x2, p.y2, layerName(layerOf(p.stroke)), !!p.dash?.length)
    } else if (p.kind === 'rect') {
      if (invisible(p.stroke)) return
      poly([[p.x, p.y], [p.x + p.w, p.y], [p.x + p.w, p.y + p.h], [p.x, p.y + p.h]], true,
        layerName(layerOf(p.stroke)), { dash: !!p.dash?.length })
    } else if (p.kind === 'circle') {
      if (!invisible(p.fill) && invisible(p.stroke)) {
        // a solid dot: AutoCAD's DONUT — two half-circle arcs at half the
        // radius, drawn a radius wide
        poly([[p.cx - p.r / 2, p.cy], [p.cx + p.r / 2, p.cy]], true, layerName(layerOf(p.fill)),
          { bulges: [1, 1], width: L(p.r) })
      } else if (!invisible(p.stroke)) {
        ent.push(g(0, 'CIRCLE') + g(8, layerName(layerOf(p.stroke))) + g(10, X(p.cx)) + g(20, Y(p.cy)) + g(30, 0) + g(40, L(p.r)))
      }
    } else if (p.kind === 'text') {
      if (invisible(p.color) && p.color) return
      const l = LAYER_BY_INK[norm(p.color)]
      text(p.x, p.y, p.text, p.size, p.anchor ?? 'start', p.rotate ?? 0, layerName(l ?? TEXT_LAYER))
    } else if (p.kind === 'dim') {
      const layer = layerName(DIM_LAYER)
      for (const e of extensionLines(p)) line(e.x1, e.y1, e.x2, e.y2, layer, true)
      line(p.x1, p.y1, p.x2, p.y2, layer)
      const t = p.size * 0.45
      for (const [x, y] of [[p.x1, p.y1], [p.x2, p.y2]] as const) line(x - t, y - t, x + t, y + t, layer)
      const mx = (p.x1 + p.x2) / 2, my = (p.y1 + p.y2) / 2
      const vertical = Math.abs(p.y2 - p.y1) > Math.abs(p.x2 - p.x1)
      // text sits just off the line, on the side the SVG puts it
      text(vertical ? mx - p.size * 0.35 : mx, vertical ? my : my - p.size * 0.35, p.text, p.size, 'middle', vertical ? -90 : 0, layer)
    } else if (p.kind === 'path') {
      const strokeless = invisible(p.stroke)
      const filled = !invisible(p.fill)
      if (strokeless && !filled) return
      const layer = layerName(layerOf(strokeless ? p.fill : p.stroke))
      // split at every M into subpaths; an A command bends the segment that
      // arrives at its end point, so its bulge belongs to the vertex before it
      const subs: { pts: [number, number][]; bulges: number[] }[] = []
      let cur: { pts: [number, number][]; bulges: number[] } | null = null
      for (const c of p.cmds as PathCmd[]) {
        if (c.c === 'M' || !cur) {
          cur = { pts: [[c.x, c.y]], bulges: [0] }
          subs.push(cur)
          if (c.c === 'M') continue
        }
        const prev = cur.pts[cur.pts.length - 1]!
        if (c.c === 'A') cur.bulges[cur.bulges.length - 1] = arcBulge(prev, [c.x, c.y], (c.rx + c.ry) / 2, c.large ?? 0, c.sweep ?? 0)
        cur.pts.push([c.x, c.y]); cur.bulges.push(0)
      }
      for (const s of subs) {
        // a closed path that repeats its start point as its end drops the copy
        const pts = [...s.pts], bulges = [...s.bulges]
        const first = pts[0]!, last = pts[pts.length - 1]!
        const closed = !!p.closed || (pts.length > 2 && Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-9)
        if (closed && pts.length > 2 && Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-9) { pts.pop(); bulges.pop() }
        poly(pts, closed, layer, { dash: !!p.dash?.length, bulges })
      }
    }
  }

  ox = 0; oy = 0
  const out: string[] = []
  out.push(g(0, 'SECTION') + g(2, 'HEADER')
    + g(9, '$ACADVER') + g(1, 'AC1009')
    + g(9, '$EXTMIN') + g(10, X(b.minX)) + g(20, Y(b.maxY)) + g(30, 0)
    + g(9, '$EXTMAX') + g(10, X(b.maxX)) + g(20, Y(b.minY)) + g(30, 0)
    + g(9, '$LTSCALE') + g(40, 1)
    + g(0, 'ENDSEC'))
  // TABLES: line types, then layers, then the one text style
  const dashLen = Math.max(50, L(Math.max(b.maxX - b.minX, b.maxY - b.minY)) / 150)
  let lt = g(0, 'TABLE') + g(2, 'LTYPE') + g(70, dashed ? 2 : 1)
    + g(0, 'LTYPE') + g(2, 'CONTINUOUS') + g(70, 0) + g(3, 'Solid line') + g(72, 65) + g(73, 0) + g(40, 0)
  if (dashed) {
    lt += g(0, 'LTYPE') + g(2, 'DASHED') + g(70, 0) + g(3, '__ __ __') + g(72, 65) + g(73, 2)
      + g(40, dashLen * 1.6) + g(49, dashLen) + g(49, -dashLen * 0.6)
  }
  lt += g(0, 'ENDTAB')
  const layers = [...used.values()]
  let ly = g(0, 'TABLE') + g(2, 'LAYER') + g(70, layers.length + 1)
    + g(0, 'LAYER') + g(2, '0') + g(70, 0) + g(62, 7) + g(6, 'CONTINUOUS')
  for (const l of layers) ly += g(0, 'LAYER') + g(2, l.name) + g(70, 0) + g(62, l.aci) + g(6, 'CONTINUOUS')
  ly += g(0, 'ENDTAB')
  const st = g(0, 'TABLE') + g(2, 'STYLE') + g(70, 1)
    + g(0, 'STYLE') + g(2, 'STANDARD') + g(70, 0) + g(40, 0) + g(41, 1) + g(50, 0) + g(71, 0) + g(42, 2.5) + g(3, 'txt') + g(4, '')
    + g(0, 'ENDTAB')
  out.push(g(0, 'SECTION') + g(2, 'TABLES') + lt + ly + st + g(0, 'ENDSEC'))
  out.push(g(0, 'SECTION') + g(2, 'ENTITIES') + ent.join('') + g(0, 'ENDSEC'))
  out.push(g(0, 'EOF'))
  return out.join('')
}
