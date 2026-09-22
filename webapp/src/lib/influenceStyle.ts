// Shared palette + formatters for the influence-lines modes (truss and beam).
// The hex values are the drafting-sheet tokens the SVG drawings use — they are
// fixed (not theme variables) so the drawings print identically on paper.

export const INK = '#0f1b2a'
export const BRAND = '#0f4c92'
export const FAIL = '#dc2626'
export const AMBER = '#e8b34b'
export const FAINT = '#736d5e'
export const MUTED = '#5c6675'
export const HAIR = '#e3e1da'
export const TINT_T = '#eaf1f9'   // positive / tension fill
export const TINT_C = '#fbeaea'   // negative / compression fill
export const TINT_LOAD = '#fdf3dd' // placement highlight

/**
 * A TYPOGRAPHIC MINUS, not a hyphen.
 *
 * `toFixed` emits U+002D HYPHEN-MINUS; `signed` below was already hand-writing
 * U+2212 MINUS SIGN. The two met inside single cards and inside single charts
 * — "IL maximum +2.000 / IL minimum -2.000" in one card, and a y-axis reading
 * "−2.00" against an ordinate reading "-2.000" in the same plot — because the
 * fix was applied at one call site instead of at the formatter.
 *
 * Fixed HERE so there is no correct-and-incorrect pair to choose between: the
 * hyphen cannot reach the screen through `f2`, `f3` or `signed`. It matters
 * more than it sounds in a monospaced drawing: the hyphen is a third of the
 * width of the digits it sits beside, so a column of negative ordinates
 * visibly fails to line up.
 *
 * Nothing machine-reads these — both consumers are the two influence-line
 * pages, and neither parses the output back — so the substitution is safe.
 */
const minus = (s: string) => s.replace('-', '−')

export const f2 = (v: number) => (Number.isFinite(v) ? minus(v.toFixed(2)) : '—')
export const f3 = (v: number) => (Number.isFinite(v) ? minus(v.toFixed(3)) : '—')
export const signed = (v: number) => `${Number.isFinite(v) ? (v >= 0 ? '+' : '−') : ''}${f2(Math.abs(v))}`
