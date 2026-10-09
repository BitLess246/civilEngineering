// Money amounts for the engineering-economy pages: grouped thousands, two
// decimals, peso sign. The engine is currency-agnostic; this is display only.

const fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** `₱12,345.67`, `−₱1,000.00`, `—` when not finite. */
export function peso(v: number): string {
  if (!Number.isFinite(v)) return '—'
  return `${v < 0 ? '−' : ''}₱${fmt.format(Math.abs(v))}`
}

/** Grouped amount without the sign of the currency, for tight drawing labels. */
export function amount(v: number): string {
  if (!Number.isFinite(v)) return '—'
  return `${v < 0 ? '−' : ''}${fmt.format(Math.abs(v))}`
}
