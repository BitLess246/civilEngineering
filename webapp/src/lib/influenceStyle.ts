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

export const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '—')
export const f3 = (v: number) => (Number.isFinite(v) ? v.toFixed(3) : '—')
export const signed = (v: number) => `${Number.isFinite(v) ? (v >= 0 ? '+' : '−') : ''}${f2(Math.abs(v))}`
