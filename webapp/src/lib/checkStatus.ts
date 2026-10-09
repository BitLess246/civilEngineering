/** The state a workspace check card or results row shows. */
export type CheckStatus = 'pass' | 'fail' | 'warn' | 'info'

/** Status from a demand/capacity ratio — the same thresholds as `UtilBar`
 *  (components/calc.tsx): amber from 0.95, red past 1. */
export const statusOf = (ratio: number): CheckStatus => (ratio > 1.0001 ? 'fail' : ratio >= 0.95 ? 'warn' : 'pass')
