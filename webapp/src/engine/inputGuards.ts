/**
 * INPUT GUARDS FOR THE STANDALONE DESIGN ENGINES (layer 7) AND THE DESIGN
 * PIPELINE (layer 6).
 *
 * Every engine in this repo grew the same defect independently: a verdict
 * wired to ONE failure mode, blind to inputs that are not physical. The
 * beam's `flexOK` covered only a diverging bar layout; the column's `axialOK`
 * is φPn,max ≥ Pu on steel the engine itself sized to meet Pu; the retaining
 * wall's five booleans all read `true` for a wall with zero-yield steel.
 *
 * The errors are not merely wrong, they run UNCONSERVATIVE, and always for the
 * same reason: effective depth is `member − cover − tie − bar/2`, so it GROWS
 * as any of those goes negative. The section then claims depth it does not
 * have, asks for less steel than the demand needs, and reports a larger shear
 * capacity than it can deliver — under a green tick.
 *
 * These are the shared predicates. Each returns a printable reason or `null`,
 * so an engine's guard is a flat list a reader can check against the code it
 * is protecting. Keep the wording in the same voice as the engines' own notes:
 * say what is wrong, in the units the form uses.
 */

/** Drop the `null`s — the shape every engine's guard ends with. */
export const compact = (xs: (string | null)[]): string[] =>
  xs.filter((x): x is string => x !== null)

/** Finite and > 0. The common case: a dimension, a strength, a diameter. */
export const positive = (v: number | undefined, what: string): string | null =>
  v != null && Number.isFinite(v) && v > 0
    ? null
    : `${what} must be greater than zero (got ${v})`

/**
 * Finite and ≥ 0. For quantities a designer may legitimately zero out — a
 * cover of 0, a surcharge of 0, a toe projection of 0 — where only the
 * negative is impossible.
 */
export const nonNegative = (v: number | undefined, what: string): string | null =>
  v != null && Number.isFinite(v) && v >= 0
    ? null
    : `${what} cannot be negative (got ${v})`

/** Finite and ≥ `min`. For counts with a code minimum. */
export const atLeast = (v: number | undefined, min: number, what: string): string | null =>
  v != null && Number.isFinite(v) && v >= min
    ? null
    : `${what} must be at least ${min} (got ${v})`

/**
 * Finite and inside `[lo, hi)`. For angles and ratios with a physical ceiling
 * — a friction angle of 90° makes Ka zero and every factor of safety
 * infinite, which is how a wall came to report FS = ∞ on all counts.
 */
export const inRange = (
  v: number | undefined, lo: number, hi: number, what: string,
): string | null =>
  v != null && Number.isFinite(v) && v >= lo && v < hi
    ? null
    : `${what} must be at least ${lo} and below ${hi} (got ${v})`

/** Just finite — for a demand that may legitimately be zero or negative. */
export const finite = (v: number | undefined, what: string): string | null =>
  v != null && Number.isFinite(v) ? null : `${what} is not a number (got ${v})`

/**
 * The effective depth left after cover, the transverse bar and half a main
 * bar — the quantity every one of these engines derives and none of them
 * checked. `member` and the deductions are all mm.
 */
export const effectiveDepth = (
  member: number, cover: number, transverse: number, barDia: number,
  what = 'cover, tie and half a bar',
): string | null => {
  const d = member - cover - transverse - barDia / 2
  return Number.isFinite(d) && d > 0
    ? null
    : `${what} leave no effective depth in a ${member} mm section`
}
