// Axis scaling shared by the calculator charts: round tick spacing, tick
// labels with just enough decimals, and the value → screen mappers.

/** Round tick spacing (1, 2, 2.5 or 5 × 10ⁿ) giving about n intervals up to max. */
export function niceStep(max: number, n = 4): number {
  if (!(max > 0)) return 1
  const raw = max / n
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const m = raw / p
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p
}
/** Tick label with as many decimals as the step itself carries (0.25 → 2). */
export const tickLabel = (v: number, step: number) => {
  const decimals = Math.min(4, (String(+step.toPrecision(6)).split('.')[1] ?? '').length)
  return v.toFixed(decimals)
}

/** Value → screen mappers for a plot box. */
export function axesMap(box: { x0: number; x1: number; top: number; base: number }, xMax: number, yMax: number) {
  const X = (x: number) => box.x0 + (x / Math.max(xMax, 1e-12)) * (box.x1 - box.x0)
  const Y = (y: number) => box.base - (y / Math.max(yMax, 1e-12)) * (box.base - box.top)
  return { X, Y }
}

