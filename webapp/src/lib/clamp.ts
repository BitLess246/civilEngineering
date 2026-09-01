/**
 * Bound a typed value.
 *
 * Lives outside `components/qty.tsx` because that file may only export
 * components — Fast Refresh cannot track a module that mixes the two, and
 * eslint's `react-refresh/only-export-components` says so.
 *
 * The `min`/`max` input attributes alone are advisory: a typed or pasted
 * number passes straight through them, so the value is clamped before it
 * reaches the caller. A non-finite value goes through untouched, because
 * callers read NaN as "the field is empty" rather than as zero.
 */
export function clampTo(v: number, min?: number, max?: number): number {
  if (!Number.isFinite(v)) return v
  let out = v
  if (min !== undefined) out = Math.max(min, out)
  if (max !== undefined) out = Math.min(max, out)
  return out
}
