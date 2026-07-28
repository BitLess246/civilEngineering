export const f0 = (v: number) => (Number.isFinite(v) ? Math.round(v).toString() : '—')
export const f1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '—')
export const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '—')
export const f3 = (v: number) => (Number.isFinite(v) ? v.toFixed(3) : '—')

// Unit-suffixed quantity formatters (take-off pages). Kept here rather than in
// `components/qty.tsx` so that module exports components only — a file mixing
// components with plain values breaks React Fast Refresh.
export const kg = (v: number) => (Number.isFinite(v) ? `${v.toFixed(1)} kg` : '—')
export const m3 = (v: number) => (Number.isFinite(v) ? `${v.toFixed(2)} m³` : '—')
export const m = (v: number) => (Number.isFinite(v) ? `${v.toFixed(2)} m` : '—')
