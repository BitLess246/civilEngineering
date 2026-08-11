// ─────────────────────────────────────────────────────────────────────────
// The atoms the steel pages share. View layer.
//
// Steel Design used to be ONE page with three tabs, so these lived at the top
// of it and cost nothing. Splitting it into four pages — beam, column, bolted
// connection, welded connection — turned them into four copies waiting to
// drift, which is how two pages end up disagreeing about what "A36" means.
//
// The W-shape list and the grade table are DATA, so they live in
// `lib/steelShapes.ts` — a module exporting both components and values breaks
// Fast Refresh, and the lint rule says so.
// ─────────────────────────────────────────────────────────────────────────

import { W_SHAPES } from '../lib/steelShapes'

/** Pass/fail value with a tick or a cross. */
export function Verdict({ pass, value }: { pass: boolean; value: string }) {
  return <span className={pass ? 'font-semibold text-green-700' : 'font-semibold text-red-700'}>{value} {pass ? '✓' : '✗'}</span>
}

/** Lateral-torsional-buckling zone chip: plastic / inelastic / elastic. */
export function ZoneBadge({ zone }: { zone: string }) {
  const cls = zone === 'plastic' ? 'bg-green-100 text-green-800'
    : zone === 'inelastic' ? 'bg-amber-100 text-amber-800'
    : 'bg-red-100 text-red-800'
  return <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${cls}`}>{zone}</span>
}

export function Spinner() {
  return <div className="flex h-80 items-center justify-center rounded-lg border border-[#e3e1da] bg-white text-sm text-slate-400">Loading 3D…</div>
}

/** In-flight / failed state of the calc API call, shown beside a card title. */
export function CalcBadge({ loading, error }: { loading: boolean; error: string | null }) {
  if (error)   return <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">API error — check console</span>
  if (loading) return <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">computing…</span>
  return null
}

export function ShapePick({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="col-span-full flex flex-col text-sm">
      <span className="mb-1 text-[11.5px] font-semibold text-[#5c6675]">W-shape</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="rounded-md border border-[#d6d3c9] px-2.5 py-1.5 text-[13px] text-slate-800 focus:border-[#0f4c92] focus:outline-none">
        {W_SHAPES.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
      </select>
    </label>
  )
}
