// ─────────────────────────────────────────────────────────────────────────
// THE CONTROL PANEL'S FURNITURE — the ribbon's tabs, and the section, chip and
// swatch pieces every tab is built from.
//
// Also the TAB LIST itself, which is the page's one statement of what order the
// tabs come in. A guard test reads the source order of the `tab === '…'` blocks
// in the page and requires the two to agree, so this is the half of that pair
// that is data rather than markup.
// ─────────────────────────────────────────────────────────────────────────
import { type ReactNode } from 'react'
import type { SolveProgress } from '../../engine/progress'
import { LAT_DIRS, type Tab } from './tabs'

/** Live solver-progress card: phase, detail, and a determinate (current/total)
 *  or indeterminate bar. Renders nothing when idle. */
export function SolverProgress({ p }: { p: SolveProgress | null }) {
  if (!p) return null
  const pct = p.total && p.current ? Math.min(100, Math.round((p.current / p.total) * 100)) : null
  return (
    <div className="col-span-full rounded-lg border border-[#0f4c92]/30 bg-blue-50/60 p-2.5">
      <div className="flex items-center justify-between text-[11px] font-semibold text-[#0f4c92]">
        <span>⏳ {p.phase}</span>
        <span className="tabular-nums text-slate-500">
          {p.total && p.current ? `${p.current} / ${p.total}` : ''}{pct !== null ? ` · ${pct}%` : ''}
        </span>
      </div>
      {p.detail && (
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-600">
          <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#0f4c92] opacity-70" />
          <span className="truncate font-mono">{p.detail}</span>
        </div>
      )}
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-blue-100">
        {pct !== null
          ? <div className="h-full rounded-full bg-[#0f4c92] transition-all duration-150" style={{ width: `${pct}%` }} />
          : <div className="h-full w-1/3 animate-pulse rounded-full bg-[#0f4c92]" />}
      </div>
    </div>
  )
}

export function DirPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (d: string) => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d])
  return (
    <div className="col-span-full flex flex-col text-sm">
      <span className="mb-1 font-medium text-slate-600">Directions to envelope</span>
      <div className="flex gap-1.5">
        {LAT_DIRS.map((d) => (
          <label key={d} className={`inline-flex cursor-pointer items-center gap-1 rounded border px-2 py-0.5 text-xs ${value.includes(d) ? 'border-[#0f4c92] bg-blue-50 text-[#0f4c92]' : 'border-slate-200 text-slate-500'}`}>
            <input type="checkbox" className="sr-only" checked={value.includes(d)} onChange={() => toggle(d)} />{d}
          </label>
        ))}
      </div>
    </div>
  )
}

// ── Right-panel tabs ────────────────────────────────────────────────────────

export function Sec({ title, hint, grid = true, children }: {
  title: ReactNode; hint?: ReactNode; grid?: boolean; children: ReactNode
}) {
  return (
    <section className="py-3.5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#a39d8d]">{title}</p>
        {hint && <span className="text-[10.5px] text-[#a39d8d]">{hint}</span>}
      </div>
      {/* Column count follows THE RAIL, not the viewport. `lg:` is where the
          panel stops being full-width and becomes a fixed 380 px column, so
          three columns there would be ~110 px per field — the widening of the
          viewport is exactly when the panel has least room. */}
      {grid ? <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-2">{children}</div> : children}
    </section>
  )
}
/**
 * Legend chips for a display toggle — the colour, then what it means.
 *
 * On its own line under the label rather than inline beside it: in a 380 px
 * rail an inline legend wraps between the swatch and its own word, which reads
 * as a different control rather than as a key.
 */

/**
 * Legend chips for a display toggle — the colour, then what it means.
 *
 * On its own line under the label rather than inline beside it: in a 380 px
 * rail an inline legend wraps between the swatch and its own word, which reads
 * as a different control rather than as a key.
 */
export function Swatches({ items }: { items: readonly (readonly [string, string])[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 pl-6 text-[11px] text-slate-500">
      {items.map(([color, label]) => (
        <span key={label} className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm" style={{ background: color }} />{label}
        </span>
      ))}
    </div>
  )
}
/** Hairline between two ribbon groups. */

/** Hairline between two ribbon groups. */
export function Rule() {
  return <span aria-hidden className="mx-1.5 h-4 w-px shrink-0 bg-[#e3e1da]" />
}

export function TabBtn({ id, label, active, onClick }: { id: Tab; label: string; active: boolean; onClick: (t: Tab) => void }) {
  return (
    <button type="button" onClick={() => onClick(id)}
      className={`rounded-[5px] px-2.5 py-[5px] text-[11.5px] font-semibold transition ${active ? 'bg-[#0f4c92] text-white' : 'text-[#5c6675] hover:bg-[#eaf1f9] hover:text-[#0f1b2a]'}`}>
      {label}
    </button>
  )
}

/** Pass/fail pill for a schedule title — "all passed" (green) or "n failed"
 *  (red). `items` are the rows, `ok` maps a row to its verdict. */

/** Pass/fail pill for a schedule title — "all passed" (green) or "n failed"
 *  (red). `items` are the rows, `ok` maps a row to its verdict. */
export function SchedChip<T>({ items, ok }: { items: T[]; ok: (r: T) => boolean }) {
  const failed = items.reduce((n, r) => n + (ok(r) ? 0 : 1), 0)
  const good = failed === 0
  return (
    <span className={`ml-2 inline-block rounded px-1.5 py-px align-middle font-mono text-[10px] font-semibold ${
      good ? 'bg-[#ddefe3] text-[#14603a]' : 'bg-[#fbeeea] text-[#c2402a]'}`}>
      {good ? 'all passed' : `${failed} failed`}
    </span>
  )
}

/** §424.2 computed service deflection for one beam, integrated from its own
 *  D-only / L-only moment diagrams. Shown once per member in the accordion (and
 *  therefore in the printed report, which force-expands every row). */
