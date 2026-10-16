// ─────────────────────────────────────────────────────────────────────────
// MOTION — the pure half of the app's animation: whether to move at all, and
// how a number counts from one value to the next.
//
// Results are the thing on screen that changes, so they are what moves: a
// check's headline value and its utilisation count to their new figure when
// an input changes, instead of swapping in place where the eye cannot tell
// that anything happened. Everything else (entrances, hovers, the tab
// indicator) is CSS in `styles/motion.css`.
//
// The count is cosmetic and must never become the number someone reads off:
// it only runs on a string that IS a number (a "4-⌀20" or a "—" is left
// alone), it ends on the exact text it was given, and with reduced motion —
// or no `matchMedia` at all, as in tests and server rendering — it never runs.
// ─────────────────────────────────────────────────────────────────────────

/** True when the viewer has not asked for reduced motion and the page can tell. */
export function motionOK(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export interface NumericSpec {
  value: number
  /** Digits after the point, as written. */
  decimals: number
  /** Thousands separated by commas, as written. */
  group: boolean
  /** A trailing % (the utilisation labels). */
  suffix: '' | '%'
  /** U+2212 for the minus, if that is how it was written. */
  minus: '-' | '−'
}

/** The parts of a string that is just a number — "0.95", "1,250", "−12.5", "95.0%" — or null. */
export function parseNumeric(text: string): NumericSpec | null {
  const m = /^([-−]?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(%?)$/.exec(text.trim())
  if (!m) return null
  const [, sign, int, frac = '', pct] = m
  const value = Number(`${int.replace(/,/g, '')}.${frac || '0'}`) * (sign ? -1 : 1)
  return { value, decimals: frac.length, group: int.includes(','), suffix: pct as '' | '%', minus: sign === '−' ? '−' : '-' }
}

/** `v` written the way `spec` was. */
export function formatLike(v: number, spec: NumericSpec): string {
  const abs = Math.abs(v).toFixed(spec.decimals)
  const [int, frac] = abs.split('.')
  const grouped = spec.group ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : int
  // no "-0.00" on the way through zero
  const neg = v < 0 && Number(abs) !== 0
  return `${neg ? spec.minus : ''}${grouped}${frac !== undefined ? `.${frac}` : ''}${spec.suffix}`
}

/** Exponential ease-out: fast away, long settle — the curve the CSS uses too. */
export const easeOutExpo = (t: number): number => (t >= 1 ? 1 : t <= 0 ? 0 : 1 - 2 ** (-10 * t))

/** The value at fraction `t` of the way from `a` to `b`, eased. */
export const tween = (a: number, b: number, t: number): number => a + (b - a) * easeOutExpo(t)
