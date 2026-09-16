// ─────────────────────────────────────────────────────────────────────────
// SHELL-STRESS COLOUR SCALE — one ramp, one domain, two surfaces.
//
// `ShellContourPanel` (2D SVG) and the 3D viewport's contour layer both paint
// the same recovered stresses. Two copies of a colour scale is the failure
// #600 exists to prevent: the one nobody is looking at drifts, and then the
// same element reads amber on the plan and red in the model.
//
// Colours here are DELIBERATELY NOT THEME TOKENS. A data ramp encodes a
// magnitude, not a brand; re-tinting it per theme would change what a colour
// means. It is fixed, and it is the same in all five themes.
//
// Units are the engine's: kN/m² (= kPa) for membrane stress, kN·m/m for the
// bending moments per unit width.
// ─────────────────────────────────────────────────────────────────────────

/** The stress quantities `ElementStress` carries, as contour keys. */
export type StressKey =
  | 'vonMises' | 'sigmaX' | 'sigmaY' | 'tauXY' | 'sigma1' | 'sigma2'
  | 'Mx' | 'My' | 'Mxy'

export const STRESS_KEYS: readonly { key: StressKey; label: string; unit: string }[] = [
  { key: 'vonMises', label: 'Von Mises σvm', unit: 'kN/m²' },
  { key: 'sigmaX', label: 'σx', unit: 'kN/m²' },
  { key: 'sigmaY', label: 'σy', unit: 'kN/m²' },
  { key: 'tauXY', label: 'τxy', unit: 'kN/m²' },
  { key: 'sigma1', label: 'σ₁ principal', unit: 'kN/m²' },
  { key: 'sigma2', label: 'σ₂ principal', unit: 'kN/m²' },
  { key: 'Mx', label: 'Mx', unit: 'kN·m/m' },
  { key: 'My', label: 'My', unit: 'kN·m/m' },
  { key: 'Mxy', label: 'Mxy', unit: 'kN·m/m' },
]

export const unitFor = (key: StressKey): string =>
  STRESS_KEYS.find((k) => k.key === key)?.unit ?? ''

export const labelFor = (key: StressKey): string =>
  STRESS_KEYS.find((k) => k.key === key)?.label ?? key

/**
 * Is this quantity SIGNED?
 *
 * Von Mises is a magnitude — it is a norm of the deviatoric stress and cannot
 * be negative. Everything else can: a σx of −2 000 kPa is 2 MPa of
 * COMPRESSION, and an Mx that changes sign along a span is the difference
 * between sagging and hogging, which is where the top steel has to go.
 *
 * The distinction decides the ramp, and getting it wrong is not cosmetic: a
 * linear min→max scale puts zero wherever it happens to land, so on a slab
 * running −40 to +10 kN·m/m the sign change sits at 80% of the way up the
 * colour bar and the hogging region reads as "medium" rather than "the other
 * sign". A diverging ramp pins zero to the middle.
 */
export const isSigned = (key: StressKey): boolean => key !== 'vonMises'

/**
 * Is this an IN-PLANE (membrane) quantity rather than a bending one?
 *
 * Worth naming because of what it explains when the field comes back flat. A
 * flat shell's membrane and bending actions are DECOUPLED — CST stretching and
 * DKT plate bending share nodes but not stiffness — so a slab carrying only
 * transverse pressure has identically zero membrane stress. Every quantity
 * here reads 0.00 everywhere on the commonest model in the app, and that is
 * the mechanics working, not a failed recovery. The legend says so, and it can
 * only say so if it knows which half of the field the reader picked.
 *
 * Not the same question as `isSigned`: σx is signed AND membrane, von Mises is
 * unsigned AND membrane. Gating the explanation on signedness prints it for
 * von Mises alone and leaves σx/σy/τxy/σ₁/σ₂ silently blank.
 */
export const isMembrane = (key: StressKey): boolean =>
  key !== 'Mx' && key !== 'My' && key !== 'Mxy'

export interface Domain {
  min: number; max: number; signed: boolean
  /**
   * The field has no spread — every value is the same (usually zero).
   *
   * Worth carrying rather than re-deriving, because the honest presentation of
   * a flat field is a sentence, not a colour bar: the fallback domain below
   * spans 0…1, and a bar labelled 0.00–1.00 over a uniformly zero field reads
   * as a real scale the reader can look things up on.
   */
  flat: boolean
}

/**
 * The value range the ramp spans.
 *
 * Signed quantities get a domain SYMMETRIC about zero, so equal magnitudes of
 * tension and compression are equally saturated and the zero contour is the
 * pale band in the middle. Unsigned quantities run 0 → max.
 *
 * An empty set, or one with no spread, still returns a usable domain: a flat
 * field should paint as flat, not divide by zero.
 */
export function stressDomain(values: readonly number[], signed: boolean): Domain {
  const finite = values.filter((v) => Number.isFinite(v))
  if (finite.length === 0) return { min: signed ? -1 : 0, max: 1, signed, flat: true }
  const spread = Math.max(...finite) - Math.min(...finite)
  if (signed) {
    const m = Math.max(...finite.map(Math.abs))
    const span = m > 0 ? m : 1
    return { min: -span, max: span, signed, flat: !(spread > 0) }
  }
  const max = Math.max(...finite, 0)
  return { min: 0, max: max > 0 ? max : 1, signed, flat: !(spread > 0) }
}

/** Position of `v` in the domain, clamped to 0…1. */
export function normalise(v: number, d: Domain): number {
  if (!Number.isFinite(v)) return 0
  const span = d.max - d.min
  if (!(span > 0)) return 0.5
  return Math.max(0, Math.min(1, (v - d.min) / span))
}

// ── the ramps ──────────────────────────────────────────────────────────────

type RGB = [number, number, number]

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const mix = (a: RGB, b: RGB, t: number): RGB =>
  [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

/** Sample an evenly-spaced control-point ramp at t ∈ 0…1. */
function sample(stops: readonly RGB[], t: number): RGB {
  const c = Math.max(0, Math.min(1, t))
  const n = stops.length - 1
  const i = Math.min(n - 1, Math.floor(c * n))
  return mix(stops[i], stops[i + 1], c * n - i)
}

/**
 * Sequential ramp — viridis, sampled at nine control points.
 *
 * NOT the blue→cyan→green→yellow→red rainbow this replaces. A rainbow is not
 * perceptually uniform: it compresses detail in the greens and invents a hard
 * edge at cyan and yellow that no gradient in the data put there, so readers
 * see contour bands that are artefacts of the palette. It also collapses under
 * the common red–green deficiencies, and a stress plot that can only be read
 * by some engineers is a stress plot with a defect. Viridis is monotonic in
 * lightness, which means it also survives being printed in grey.
 */
const VIRIDIS: readonly RGB[] = [
  [68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142], [38, 130, 142],
  [31, 158, 137], [53, 183, 121], [110, 206, 88], [253, 231, 37],
]

/**
 * Diverging ramp — blue (compression) ↔ pale (zero) ↔ red (tension).
 *
 * Blue for negative and red for positive is the convention these plots are
 * read with. The centre is deliberately a pale warm grey rather than pure
 * white so that the zero band is still distinguishable from the background of
 * an unmeshed panel.
 */
const DIVERGING: readonly RGB[] = [
  [5, 48, 97], [33, 102, 172], [67, 147, 195], [146, 197, 222], [238, 236, 230],
  [244, 165, 130], [214, 96, 77], [178, 24, 43], [103, 0, 31],
]

/**
 * The ramp's control points, for whoever needs to sample it somewhere other
 * than JavaScript — the contour shader takes these as a uniform so the picture
 * and the legend are the SAME nine numbers rather than two transcriptions.
 */
export const rampStops = (signed: boolean): readonly RGB[] => (signed ? DIVERGING : VIRIDIS)

/**
 * How many discrete colour bands a contour is drawn in. 0 = smooth.
 *
 * Bands are what make a contour plot a CONTOUR plot. A continuously blended
 * field has no iso-boundaries to read, which is why every FEA post-processor
 * (ETABS, STAAD, ANSYS) bands its stress plots: the boundary between two bands
 * IS the iso-line, and without it the reader cannot tell 40% of peak from 55%
 * anywhere on the model. 12 is the usual default and the one used here.
 */
export const DEFAULT_BANDS = 12

/**
 * Snap a normalised position to the CENTRE of its band.
 *
 * Centre, not edge: a band drawn in its own lower-edge colour is half a band
 * darker than the values it contains, so the legend swatch and the surface
 * disagree by half a step everywhere. Shared by the legend swatches and the
 * shader, so the two cannot drift.
 */
export function bandCenter(t: number, bands: number): number {
  if (!(bands > 0)) return Math.max(0, Math.min(1, t))
  const c = Math.max(0, Math.min(1, t))
  const i = Math.min(bands - 1, Math.floor(c * bands))
  return (i + 0.5) / bands
}

/** The value boundaries between bands, low → high — the iso-levels a reader
 *  looks a value up against. `bands + 1` entries. */
export function bandEdges(d: Domain, bands: number): number[] {
  const n = Math.max(1, bands)
  return Array.from({ length: n + 1 }, (_, i) => d.min + ((d.max - d.min) * i) / n)
}

/** `rgb(r,g,b)` for a normalised position on the ramp this domain calls for. */
export function stressColor(t: number, signed: boolean): string {
  const [r, g, b] = sample(signed ? DIVERGING : VIRIDIS, t)
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`
}

/** The same colour as 0–1 channel floats, which is what three.js wants. */
export function stressColorRGB(t: number, signed: boolean): RGB {
  const [r, g, b] = sample(signed ? DIVERGING : VIRIDIS, t)
  return [r / 255, g / 255, b / 255]
}

/**
 * Swatches for the colour bar, low → high.
 *
 * With `bands > 0` this returns EXACTLY the band colours the surface is drawn
 * in — one swatch per band, each at its band centre — so the bar is a key to
 * the picture rather than a decorative gradient beside it. A legend that
 * cannot be matched to a region is not a legend.
 */
export function rampSwatches(n: number, signed: boolean, bands = 0): string[] {
  if (bands > 0) {
    return Array.from({ length: bands }, (_, i) => stressColor(bandCenter((i + 0.5) / bands, bands), signed))
  }
  if (n < 2) return [stressColor(0.5, signed)]
  return Array.from({ length: n }, (_, i) => stressColor(i / (n - 1), signed))
}

/**
 * Tick labels for a colour bar, low → high.
 *
 * Formatted to the magnitude of the domain rather than a fixed precision: a
 * bending field of ±0.8 kN·m/m and a membrane field of ±40 000 kPa are both
 * read off the same bar, and `0` / `40000` are the wrong answers for one of
 * them each.
 */
export function rampTicks(d: Domain, n = 5): string[] {
  const dp = dpFor(d)
  return Array.from({ length: n }, (_, i) => {
    const v = d.min + ((d.max - d.min) * i) / (n - 1)
    return v.toFixed(dp)
  })
}

/** Decimal places appropriate to the magnitude of this field. */
const dpFor = (d: Domain): number => {
  const span = Math.max(Math.abs(d.min), Math.abs(d.max))
  return span >= 100 ? 0 : span >= 10 ? 1 : span >= 1 ? 2 : 3
}

/**
 * One value from this field, at the SAME precision as the bar's tick labels.
 *
 * The peak read-out sits under the colour bar and is read against it. Printed
 * to its own fixed precision it disagrees with the ticks either way round —
 * `16.0` beside ticks of `0.800`, or `16.01` beside ticks of `40000`.
 */
export const formatStress = (v: number, d: Domain): string =>
  Number.isFinite(v) ? v.toFixed(dpFor(d)) : '—'
