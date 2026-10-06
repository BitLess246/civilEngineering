// ─────────────────────────────────────────────────────────────────────────
// The calculator WORKSPACE — three columns, each with one job:
//
//   inputs rail      │ report document (tabbed)        │ checks rail
//   grouped fields,  │ Drawing sheet · Calculations ·   │ one card per check:
//   scrolls on its   │ References — numbered sections,  │ value, basis, PASS pill,
//   own              │ summary tables, the drawing      │ utilization bar
//
// Modelled on the Purlin Designer layout the owner pointed at. Presentation
// only: pages feed it engine results, exactly as they feed `calc.tsx`.
//
// Widths: three columns from `xl`; at `lg` the checks rail drops into a row of
// cards above the document; below that everything stacks — inputs, checks,
// document — so on a phone the answer comes straight after the inputs.
// ─────────────────────────────────────────────────────────────────────────
import { useState, type ReactNode } from 'react'
import { ExportPdfButton } from './ExportPdfButton'
import type { CalcReportData } from './ReportControls'
import type { LetterheadState } from './calc'

// ── Layout ──────────────────────────────────────────────────────────────────

/** The three-column page. Children are slots, so the DOM order (inputs →
 *  checks → document) is the reading order on a phone. */
export function Workspace({ title, badges, intro, inputs, checks, document }: {
  title: string
  badges?: string[]
  intro?: ReactNode
  inputs: ReactNode
  checks: ReactNode
  document: ReactNode
}) {
  return (
    <div className="mx-auto max-w-[1840px] px-4 py-4 sm:px-6">
      <div className="no-print mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-[21px] font-extrabold tracking-tight text-ink">{title}</h1>
        {badges?.map((b) => (
          <span key={b} className="whitespace-nowrap rounded border border-brand-line bg-brand-tint px-1.5 py-px font-mono text-[10px] font-medium text-brand">{b}</span>
        ))}
        {intro && <p className="basis-full max-w-4xl text-[13px] text-muted">{intro}</p>}
      </div>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_310px]">
        <aside aria-label="Inputs"
          className="no-print lg:sticky lg:top-3 lg:row-span-2 lg:max-h-[calc(100vh-1.5rem)] lg:overflow-y-auto lg:overscroll-contain xl:row-span-1">
          {inputs}
        </aside>
        <aside aria-label="Checks"
          className="no-print grid grid-cols-1 gap-3 sm:grid-cols-2 lg:col-start-2 lg:row-start-1 xl:col-start-3 xl:sticky xl:top-3 xl:max-h-[calc(100vh-1.5rem)] xl:grid-cols-1 xl:overflow-y-auto xl:overscroll-contain">
          {checks}
        </aside>
        <div className="min-w-0 lg:col-start-2 lg:row-start-2 xl:row-start-1">{document}</div>
      </div>
    </div>
  )
}

// ── Inputs rail ─────────────────────────────────────────────────────────────

/** The inputs card: one white panel holding every group, like a property sheet. */
export function InputRail({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-5 rounded-lg border border-hairline bg-sheet p-4">{children}</div>
}

/** One labelled group of fields — a small-caps heading ruled to the edge, then
 *  a two-column field grid. `wide` children span both columns via `col-span-2`. */
export function InputGroup({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2.5 flex items-center gap-3">
        <h2 className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[.14em] text-ink-2">{title}</h2>
        <span aria-hidden className="h-px flex-1 bg-hairline" />
      </div>
      {hint && <p className="-mt-1 mb-2 text-[10.5px] text-faint">{hint}</p>}
      {/* minmax(0, …): a bare 1fr track cannot shrink below an input's
          intrinsic width, which pushed the rail off a phone screen */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-3">{children}</div>
    </section>
  )
}

/** The report fields as an input group, with the export action. */
export function ReportGroup({ lh, onChange, onPrint, title, badges, report }: {
  lh: LetterheadState
  onChange: (p: Partial<LetterheadState>) => void
  onPrint: () => void
  title: string
  badges: string[]
  report?: CalcReportData
}) {
  const field = (label: string, key: keyof LetterheadState, ph: string, wide = false) => (
    <label className={`flex flex-col text-sm ${wide ? 'col-span-2' : ''}`}>
      <span className="mb-1 text-[11.5px] font-semibold text-muted">{label}</span>
      <input value={lh[key]} placeholder={ph} onChange={(e) => onChange({ [key]: e.target.value })}
        className="rounded-md border border-field-line bg-field px-2.5 py-1.5 text-[13px] text-ink placeholder:text-faint focus-visible:border-brand" />
    </label>
  )
  const btn = 'col-span-2 inline-flex items-center justify-center gap-2 rounded-md bg-brand px-3.5 py-2 text-[12.5px] font-semibold text-on-solid hover:bg-brand-hover disabled:opacity-50'
  return (
    <div data-ai-ignore>
      <InputGroup title="Project & report">
        {field('Project', 'project', 'Lot 12 Residence', true)}
        {field('Prepared by', 'preparedBy', 'Engineer, CE', true)}
        {field('Sheet', 'sheet', 'H-01 · Rev A')}
        <div className="flex flex-col justify-end">
          <span className="mb-1 text-[11.5px] font-semibold text-muted">Date</span>
          <span className="py-1.5 font-mono text-[12.5px] text-ink">{new Date().toISOString().slice(0, 10)}</span>
        </div>
        {report
          ? <ExportPdfButton {...report} docTitle={title} badges={badges} lh={lh} className={btn} />
          : <button type="button" onClick={onPrint} className={btn}>⎙ Export report</button>}
      </InputGroup>
    </div>
  )
}

// ── Checks rail ─────────────────────────────────────────────────────────────

import type { CheckStatus } from '../lib/checkStatus'
export type { CheckStatus }

const STATUS: Record<CheckStatus, { label: string; cls: string }> = {
  pass: { label: 'PASS', cls: 'border-ok-line bg-ok-tint text-ok' },
  fail: { label: 'FAIL', cls: 'border-fail-line bg-fail-tint text-fail' },
  warn: { label: 'CHECK', cls: 'border-warn-line bg-warn-tint text-warn' },
  info: { label: 'RESULT', cls: 'border-brand-line bg-brand-tint text-brand' },
}

export function StatusPill({ status, label }: { status: CheckStatus; label?: string }) {
  const s = STATUS[status]
  return <span className={`inline-flex flex-none items-center rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide ${s.cls}`}>{label ?? s.label}</span>
}

/** Same thresholds as `UtilBar` in calc.tsx: amber from 0.95, red past 1. */
const barColor = (r: number) => (r > 1.0001 ? 'var(--t-fail)' : r >= 0.95 ? 'var(--t-warn)' : 'var(--t-ok)')

export interface CheckPair { label: string; value: string }

/**
 * One check, one card: title and status, the governing case, the headline
 * number in large mono with its unit, the formula that produced it, then —
 * when the check has a demand/capacity ratio — the utilization with its bar,
 * and the demand/allowable pair underneath.
 */
export function CheckCard({ title, basis, status, value, unit, formula, ratio, ratioLabel = 'Utilization', pairs, pillLabel }: {
  title: string
  /** The governing case or the basis of the number ("D + Lr", "Zone 1"). */
  basis?: string
  status: CheckStatus
  value: string
  unit?: string
  formula?: ReactNode
  /** Demand/capacity; omit for a plain result. */
  ratio?: number
  ratioLabel?: string
  pairs?: CheckPair[]
  pillLabel?: string
}) {
  return (
    <section className="rail-card rounded-lg border border-hairline bg-sheet p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[13px] font-bold text-ink">{title}</h3>
          {basis && <p className="mt-0.5 truncate text-[11px] text-faint">{basis}</p>}
        </div>
        <StatusPill status={status} label={pillLabel} />
      </div>
      <p className="mt-2.5 font-mono text-[24px] font-bold leading-none text-brand">
        {value}{unit && <span className="ml-1 text-[11.5px] font-semibold text-faint">{unit}</span>}
      </p>
      {formula && <p className="mt-1.5 text-[11px] text-muted">{formula}</p>}
      {ratio !== undefined && Number.isFinite(ratio) && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-[11px]">
            <span className="text-muted">{ratioLabel}</span>
            <span className="font-mono font-semibold" style={{ color: barColor(ratio) }}>{(ratio * 100).toFixed(1)}%</span>
          </div>
          <div className="mt-1 h-[5px] overflow-hidden rounded-[3px] bg-hairline">
            <div className="h-full rounded-[3px]" style={{ background: barColor(ratio), width: `${Math.min(100, Math.max(0, ratio * 100))}%` }} />
          </div>
        </div>
      )}
      {pairs && pairs.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-hairline-2 pt-2.5">
          {pairs.map((p) => (
            <div key={p.label} className="min-w-0">
              <dt className="truncate text-[10.5px] text-faint">{p.label}</dt>
              <dd className="truncate font-mono text-[12px] font-semibold text-ink">{p.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

// ── Report document ─────────────────────────────────────────────────────────

export interface DocTab { id: string; label: string; content: ReactNode }

/**
 * The report, tabbed. Every tab stays in the DOM: the inactive ones are hidden
 * on screen and PRINTED, so the sheet that goes out carries the drawing, the
 * calculations and the references whichever tab was open.
 */
export function DocPanel({ tabs, initial }: { tabs: DocTab[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id)
  const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return (
    <div className="flex flex-col gap-4">
      <div className="no-print flex items-center gap-1 overflow-x-auto rounded-lg border border-hairline bg-sheet px-3" role="tablist" aria-label="Report">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={active === t.id} aria-controls={`panel-${t.id}`}
            onClick={() => setActive(t.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-3 text-[11.5px] font-bold uppercase tracking-[.08em] ${
              active === t.id ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink'}`}>
            {t.label}
          </button>
        ))}
        <span className="ml-auto whitespace-nowrap pl-3 font-mono text-[10px] text-faint">Live · {stamp}</span>
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`}
          className={active === t.id ? 'flex flex-col gap-4' : 'hidden print:flex print:flex-col print:gap-4'}>
          {t.content}
        </div>
      ))}
    </div>
  )
}

/** The sheet's title block: firm line, report title, sheet/date, and the
 *  project strip — what the top of a signed calc sheet carries. */
export function ReportTitleBlock({ title, lh, today, sheetLabel = 'Sheet' }: {
  title: string; lh: LetterheadState; today: string; sheetLabel?: string
}) {
  const cells: [string, string][] = [
    ['Project', lh.project || '—'], [sheetLabel, lh.sheet || '—'],
    ['Prepared by', lh.preparedBy || '—'], ['Date', today],
  ]
  return (
    <section className="no-print rounded-lg border border-hairline bg-sheet px-5 py-4">
      <p className="text-[10.5px] font-bold uppercase tracking-[.16em] text-ink-2">{lh.preparedBy || 'Prepared by —'}</p>
      <h2 className="mt-1 text-[22px] font-extrabold tracking-tight text-brand">{title}</h2>
      <div className="mt-3 h-[2px] bg-brand" />
      <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-md border border-hairline sm:grid-cols-4">
        {cells.map(([k, v]) => (
          <div key={k} className="min-w-0 border-b border-r border-hairline-2 px-3 py-2 sm:border-b-0">
            <p className="text-[9.5px] font-semibold uppercase tracking-widest text-faint">{k}</p>
            <p className="mt-0.5 truncate text-[12px] font-bold uppercase text-ink">{v}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/** A numbered report section: "1. Design Input Summary" ruled to the edge. */
export function DocSection({ num, title, aside, children, card = false }: {
  num: number | string; title: string; aside?: ReactNode; children: ReactNode
  /** Wrap the body in a white card (drawings); tables sit on the page. */
  card?: boolean
}) {
  return (
    <section className="print-avoid-break">
      <div className="mb-2 flex items-center gap-3">
        {/* a long title wraps on a phone instead of pushing the aside off-screen */}
        <h2 className="min-w-0 text-balance text-[14.5px] font-extrabold text-ink sm:whitespace-nowrap">{num}. {title}</h2>
        <span aria-hidden className="h-[2px] min-w-6 flex-1 bg-ink" />
        {aside}
      </div>
      {card ? <div className="rounded-lg border border-hairline bg-sheet p-3">{children}</div> : children}
    </section>
  )
}

export interface KeyValue { label: string; value: string }

/** The "Design Input Summary" table: label/value pairs, three to a row on a
 *  wide sheet, fewer as it narrows — never a sideways scroll. */
export function KeyValueGrid({ items }: { items: KeyValue[] }) {
  return (
    <div className="grid overflow-hidden rounded-md border border-hairline bg-sheet"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
      {items.map((it) => (
        <div key={it.label} className="grid min-w-0 grid-cols-[1fr_1fr] border-b border-r border-hairline-2">
          <span className="break-words bg-sheet-2 px-2.5 py-1.5 text-[11px] font-semibold text-ink-2">{it.label}</span>
          <span className="break-words px-2.5 py-1.5 font-mono text-[11.5px] font-semibold text-ink">{it.value}</span>
        </div>
      ))}
    </div>
  )
}

export interface ResultRow {
  check: string
  basis: string
  demand: string
  limit?: string
  ratio?: number
  status: CheckStatus
}

/** The "Design Summary" table: check · basis · demand · limit · util · status. */
export function ResultsTable({ rows, caption }: { rows: ResultRow[]; caption?: ReactNode }) {
  return (
    <div>
      {caption && <p className="mb-1.5 text-[11px] text-muted">{caption}</p>}
      <div className="overflow-x-auto rounded-md border border-hairline bg-sheet">
        <table className="w-full min-w-[620px] border-collapse text-[11.5px]">
          <thead>
            <tr className="bg-brand text-left text-[10.5px] font-bold uppercase tracking-wide text-on-solid">
              <th className="px-2.5 py-2">Check</th><th className="px-2.5 py-2">Basis</th>
              <th className="px-2.5 py-2 text-right">Value</th><th className="px-2.5 py-2 text-right">Limit</th>
              <th className="px-2.5 py-2 text-right">Util.</th><th className="px-2.5 py-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.check} className="border-t border-hairline-2">
                <td className="px-2.5 py-1.5 text-ink">{r.check}</td>
                <td className="px-2.5 py-1.5 text-muted">{r.basis}</td>
                <td className="px-2.5 py-1.5 text-right font-mono text-ink">{r.demand}</td>
                <td className="px-2.5 py-1.5 text-right font-mono text-muted">{r.limit ?? '—'}</td>
                <td className="px-2.5 py-1.5 text-right font-mono text-muted">{r.ratio !== undefined && Number.isFinite(r.ratio) ? `${(r.ratio * 100).toFixed(1)}%` : '—'}</td>
                <td className="px-2.5 py-1.5 text-center"><StatusPill status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** The References tab: the relation behind each result, with its source. */
export function ReferenceList({ items }: { items: { topic: string; basis: ReactNode; source: string }[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-hairline bg-sheet">
      {items.map((it) => (
        <div key={it.topic} className="grid gap-1 border-b border-hairline-2 px-3.5 py-2.5 last:border-b-0 sm:grid-cols-[180px_minmax(0,1fr)_160px] sm:gap-3">
          <span className="text-[12px] font-bold text-ink">{it.topic}</span>
          <span className="text-[12px] text-ink-2">{it.basis}</span>
          <span className="text-[11px] text-faint sm:text-right">{it.source}</span>
        </div>
      ))}
    </div>
  )
}
