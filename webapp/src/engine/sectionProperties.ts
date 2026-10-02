// ─────────────────────────────────────────────────────────────────────────
// SECTION PROPERTIES — area, centroid, moments of inertia, section moduli
// and radii of gyration for single shapes and built-up rectangles.
//
// Single shapes carry closed-form results (rectangle, circle, tube); any
// I / T / channel / angle / built-up section is a stack of rectangles
// solved by the composite route the board exam teaches:
//
//   ȳ   = Σ Aᵢ·ȳᵢ / Σ Aᵢ
//   Ix  = Σ ( Iᵢ + Aᵢ·dᵢ² )     parallel-axis theorem, dᵢ = ȳᵢ − ȳ
//   Iy  = Σ ( Iᵢ + Aᵢ·(x̄ᵢ − x̄)² )
//
// x is horizontal, y vertical up, y = 0 at the BOTTOM of the section.
// ─────────────────────────────────────────────────────────────────────────

export interface RectRow {
  /** x of the rectangle's left edge (mm). */
  x: number
  /** y of the rectangle's bottom edge (mm). */
  y: number
  /** Width (x-extent, mm). */
  w: number
  /** Height (y-extent, mm). */
  h: number
  /** Display name (e.g. 'flange', 'web'). */
  name?: string
}

export interface RowBreakdown {
  name: string
  A: number
  /** Row centroid, measured from the bottom (y) and from x = 0 (x). */
  cy: number
  cx: number
  Ix: number
  Iy: number
  /** Parallel-axis offsets: dy = cy − ȳ, dx = cx − x̄. */
  dy: number
  dx: number
  /** A·dy² and A·dx² transfer terms. */
  transferX: number
  transferY: number
}

export interface SectionResult {
  A: number
  /** Centroid: x from the left edge, y from the bottom (mm). */
  cx: number
  cy: number
  Ix: number
  Iy: number
  /** Extreme-fibre distances from the centroid axis (mm). */
  cTop: number
  cBot: number
  cLeft: number
  cRight: number
  /** Section moduli about the centroidal axes (mm³) — weakest fibre governs. */
  Sx: number
  Sy: number
  rx: number
  ry: number
  /** Per-row parallel-axis table (composite route only). */
  rows?: RowBreakdown[]
}

/** Centroidal properties of one rectangle. */
function rectProps(r: RectRow): { A: number; cx: number; cy: number; Ix: number; Iy: number } {
  const A = r.w * r.h
  return {
    A,
    cx: r.x + r.w / 2,
    cy: r.y + r.h / 2,
    Ix: r.w * r.h * r.h * r.h / 12,
    Iy: r.h * r.w * r.w * r.w / 12,
  }
}

/** Composite of rectangles — the general built-up solver. */
export function rectComposite(rows: RectRow[]): SectionResult {
  const live = rows.filter((r) => r.w > 0 && r.h > 0)
  if (live.length < 1) throw new Error('At least one rectangle with positive width and height is needed.')
  const parts = live.map((r, i) => ({ ...rectProps(r), name: r.name ?? `rect ${i + 1}` }))
  const A = parts.reduce((s, p) => s + p.A, 0)
  const cx = parts.reduce((s, p) => s + p.A * p.cx, 0) / A
  const cy = parts.reduce((s, p) => s + p.A * p.cy, 0) / A
  const Ix = parts.reduce((s, p) => s + p.Ix + p.A * Math.pow(p.cy - cy, 2), 0)
  const Iy = parts.reduce((s, p) => s + p.Iy + p.A * Math.pow(p.cx - cx, 2), 0)

  const yLo = Math.min(...live.map((r) => r.y))
  const yHi = Math.max(...live.map((r) => r.y + r.h))
  const xLo = Math.min(...live.map((r) => r.x))
  const xHi = Math.max(...live.map((r) => r.x + r.w))

  const breakdown: RowBreakdown[] = parts.map((p) => ({
    name: p.name,
    A: p.A, cx: p.cx, cy: p.cy, Ix: p.Ix, Iy: p.Iy,
    dy: p.cy - cy, dx: p.cx - cx,
    transferX: p.A * Math.pow(p.cy - cy, 2),
    transferY: p.A * Math.pow(p.cx - cx, 2),
  }))

  return finish({ A, cx, cy, Ix, Iy, yLo, yHi, xLo, xHi, rows: breakdown })
}

function finish(v: {
  A: number; cx: number; cy: number; Ix: number; Iy: number
  yLo: number; yHi: number; xLo: number; xHi: number
  rows?: RowBreakdown[]
}): SectionResult {
  const cTop = v.yHi - v.cy
  const cBot = v.cy - v.yLo
  const cLeft = v.cx - v.xLo
  const cRight = v.xHi - v.cx
  return {
    A: v.A, cx: v.cx, cy: v.cy, Ix: v.Ix, Iy: v.Iy,
    cTop, cBot, cLeft, cRight,
    Sx: v.Ix / Math.max(cTop, cBot),
    Sy: v.Iy / Math.max(cLeft, cRight),
    rx: Math.sqrt(v.Ix / v.A),
    ry: Math.sqrt(v.Iy / v.A),
    rows: v.rows,
  }
}

// ── single shapes, closed form ────────────────────────────────────────────

export function rectangle(b: number, h: number): SectionResult {
  if (!(b > 0) || !(h > 0)) throw new Error('Rectangle: base and height must be positive.')
  return finish({
    A: b * h, cx: b / 2, cy: h / 2,
    Ix: b * h ** 3 / 12, Iy: h * b ** 3 / 12,
    yLo: 0, yHi: h, xLo: 0, xHi: b,
  })
}

export function circle(d: number): SectionResult {
  if (!(d > 0)) throw new Error('Circle: diameter must be positive.')
  const A = Math.PI * d ** 2 / 4
  const I = Math.PI * d ** 4 / 64
  return finish({
    A, cx: d / 2, cy: d / 2, Ix: I, Iy: I,
    yLo: 0, yHi: d, xLo: 0, xHi: d,
  })
}

export function hollowCircle(D: number, d: number): SectionResult {
  if (!(D > 0) || !(d > 0)) throw new Error('Tube: both diameters must be positive.')
  if (d >= D) throw new Error('Tube: the inner diameter must be smaller than the outer.')
  const A = Math.PI * (D ** 2 - d ** 2) / 4
  const I = Math.PI * (D ** 4 - d ** 4) / 64
  return finish({
    A, cx: D / 2, cy: D / 2, Ix: I, Iy: I,
    yLo: 0, yHi: D, xLo: 0, xHi: D,
  })
}

// ── presets as rectangle stacks (so the worked solution shows the table) ──

/** Symmetric I-shape: overall depth d, flange width bf, flange thickness tf, web thickness tw. */
export function iShape(d: number, bf: number, tf: number, tw: number): SectionResult {
  if (!(d > 2 * tf)) throw new Error('I-shape: depth must exceed twice the flange thickness.')
  if (!(bf >= tw)) throw new Error('I-shape: flange width must be at least the web thickness.')
  const hw = d - 2 * tf
  return rectComposite([
    { x: (bf - tw) / 2, y: tf, w: tw, h: hw, name: 'web' },
    { x: 0, y: hw + tf, w: bf, h: tf, name: 'top flange' },
    { x: 0, y: 0, w: bf, h: tf, name: 'bottom flange' },
  ])
}

/** T-shape, flange on top: overall depth d, flange width bf, flange tf, web tw. */
export function tShape(d: number, bf: number, tf: number, tw: number): SectionResult {
  if (!(d > tf)) throw new Error('T-shape: depth must exceed the flange thickness.')
  if (!(bf >= tw)) throw new Error('T-shape: flange width must be at least the web thickness.')
  const hw = d - tf
  return rectComposite([
    { x: (bf - tw) / 2, y: 0, w: tw, h: hw, name: 'web' },
    { x: 0, y: hw, w: bf, h: tf, name: 'flange' },
  ])
}

/** Channel, flanges pointing left: depth d, flange width bf, flange tf, web tw (web on the right). */
export function channelShape(d: number, bf: number, tf: number, tw: number): SectionResult {
  if (!(d > 2 * tf)) throw new Error('Channel: depth must exceed twice the flange thickness.')
  return rectComposite([
    { x: bf - tw, y: 0, w: tw, h: d, name: 'web' },
    { x: 0, y: d - tf, w: bf, h: tf, name: 'top flange' },
    { x: 0, y: 0, w: bf, h: tf, name: 'bottom flange' },
  ])
}

/** Equal-leg angle, legs up and right: leg size a, thickness t. The horizontal
 *  leg starts at x = t so the corner is counted once. */
export function angleShape(a: number, t: number): SectionResult {
  if (!(a > t)) throw new Error('Angle: leg must exceed the thickness.')
  return rectComposite([
    { x: 0, y: 0, w: t, h: a, name: 'vertical leg' },
    { x: t, y: 0, w: a - t, h: t, name: 'horizontal leg' },
  ])
}
