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

import { Link } from 'react-router-dom'
import { W_SHAPES } from '../lib/steelShapes'
import { TrialExhaustedError } from '../lib/calcRun'
import { GUEST_TRIAL_LIMIT } from '../lib/trialQuota'
import type { DesignBasis } from '../engine/designBasis'

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
export function CalcBadge({ loading, error, cause }: { loading: boolean; error: string | null; cause?: unknown }) {
  // A spent trial is not a fault, and must not be reported as one — "check
  // console" would send a paying-customer-to-be looking for a bug.
  if (cause instanceof TrialExhaustedError)
    return <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">free trial used up</span>
  if (error)   return <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">API error — check console</span>
  if (loading) return <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">computing…</span>
  return null
}

/**
 * Shown in place of the results when the SERVER refuses the calculation.
 *
 * `TrialGate` draws its own paywall from the browser's count, and that count
 * can be behind — a cleared cache, another device on the same connection, a
 * tab open since before the allowance ran out. This is the other half: the
 * endpoint has the authoritative count, and when it says no, the numbers on
 * screen are the last run's and will not update again.
 *
 * Saying that plainly matters more than the styling. A calculator that quietly
 * stops refreshing is worse than one that says why.
 */
export function TrialWall({ cause }: { cause: unknown }) {
  if (!(cause instanceof TrialExhaustedError)) return null
  return (
    <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] leading-6 text-amber-900">
      <p className="font-semibold">You have used all {GUEST_TRIAL_LIMIT} free runs of this calculator.</p>
      <p className="mt-0.5">
        Any results still shown are from your last run and will not update. A free
        account removes the counter from every single-purpose calculator — no card,
        no trial period.{' '}
        <Link to="/signup" className="font-semibold underline">Create a free account</Link>
        {' '}or{' '}
        <Link to="/signin" className="font-semibold underline">sign in</Link>.
      </p>
    </div>
  )
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

/**
 * LRFD / ASD. AISC 360 is a dual-format specification and the choice changes
 * BOTH sides of every check — the resistance side (φRn vs Rn/Ω) and the demand
 * side (factored vs service load combinations). It is deliberately one control
 * per page rather than a global setting: a report mixing the two would be
 * wrong, and a preference the user cannot see on the sheet is one they forget
 * they set.
 */
export function BasisPick({ value, onChange }: { value: DesignBasis; onChange: (v: DesignBasis) => void }) {
  return (
    <label className="flex flex-col text-sm">
      <span className="mb-1 text-[11.5px] font-semibold text-[#5c6675]">Design basis</span>
      <select value={value} onChange={e => onChange(e.target.value as DesignBasis)}
        className="rounded-md border border-[#d6d3c9] px-2.5 py-1.5 text-[13px] text-slate-800 focus:border-[#0f4c92] focus:outline-none">
        <option value="LRFD">LRFD — φRn vs 1.2D + 1.6L</option>
        <option value="ASD">ASD — Rn/Ω vs D + L</option>
      </select>
    </label>
  )
}

/** The basis stated where the report will print it. */
export function BasisNote({ basis }: { basis: DesignBasis }) {
  return (
    <p className="col-span-full text-[10px] text-slate-500">
      {basis === 'LRFD'
        ? 'LRFD: capacities are φRn, compared against the governing factored combination max(1.4D, 1.2D + 1.6L).'
        : 'ASD: capacities are the allowable Rn/Ω, compared against the service combination D + L. Do not compare these against factored loads.'}
    </p>
  )
}
