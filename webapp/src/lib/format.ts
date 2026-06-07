export const f0 = (v: number) => (Number.isFinite(v) ? Math.round(v).toString() : '—')
export const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '—')
export const f3 = (v: number) => (Number.isFinite(v) ? v.toFixed(3) : '—')
