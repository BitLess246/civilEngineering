// ─────────────────────────────────────────────────────────────────────────
// THE CAPACITY CURVE'S OWN SIZE — base shear against control-node
// displacement, as drawn by both pushover panels.
//
// It lives in the Model Space side panel: a fixed 380 px column that leaves the
// chart 294 px (measured at 1024, 1280 and 1600 wide). It was drawn in a
// 460-unit viewBox with 9-unit tick labels, so `DrawingFrame` — which will not
// shrink text below 9 px — held it at 460 px and scrolled it. The right third
// of the curve, the maximum-displacement tick and the axis title sat behind
// the scroll: a capacity curve cut off before the displacement it was pushed
// to. The viewBox is now the width the panel has.
// Units: displacement mm, base shear kN, geometry in viewBox units.
// ─────────────────────────────────────────────────────────────────────────

/** The chart's width in the Model Space side panel, CSS px (measured). */
export const SIDE_PANEL_CHART_PX = 294

export const CURVE_W = 280
export const CURVE_H = 200
/** Smallest annotation (tick labels); axis titles are 10. */
export const CURVE_MIN_FONT = 9

const PAD = { l: 50, r: 16, t: 14, b: 36 }

export interface CurvePoint {
  /** Control-node displacement, mm (drawn as its magnitude). */
  x: number
  /** Base shear, kN (drawn as its magnitude). */
  y: number
  /** Marks a point where a hinge formed / is yielding. */
  hot?: boolean
  title?: string
}

export interface CurveLayout {
  x0: number; x1: number; y0: number; y1: number
  points: { cx: number; cy: number; hot: boolean; title?: string }[]
  polyline: string
  xTicks: { x: number; label: string }[]
  yTicks: { y: number; label: string }[]
}

/** Plot geometry: magnitudes, axes from zero, ticks at 0, ½ and the maximum. */
export function curveLayout(pts: CurvePoint[]): CurveLayout {
  const xs = pts.map((p) => Math.abs(p.x)), ys = pts.map((p) => Math.abs(p.y))
  const xMax = Math.max(...xs, 1e-9), yMax = Math.max(...ys, 1e-9)
  const x0 = PAD.l, x1 = CURVE_W - PAD.r, y0 = CURVE_H - PAD.b, y1 = PAD.t
  const sx = (v: number) => x0 + (x1 - x0) * (v / xMax)
  const sy = (v: number) => y0 - (y0 - y1) * (v / yMax)
  const points = pts.map((p, i) => ({ cx: sx(xs[i]), cy: sy(ys[i]), hot: !!p.hot, title: p.title }))
  return {
    x0, x1, y0, y1, points,
    polyline: points.map((p) => `${p.cx.toFixed(1)},${p.cy.toFixed(1)}`).join(' '),
    xTicks: [0, 0.5, 1].map((f) => ({ x: sx(xMax * f), label: (xMax * f).toFixed(1) })),
    yTicks: [0, 0.5, 1].map((f) => ({ y: sy(yMax * f), label: (yMax * f).toFixed(0) })),
  }
}
