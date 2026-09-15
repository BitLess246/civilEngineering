import { checkCoverage, coverageSuffix } from '../lib/checkCoverage'
import type { ReactNode } from 'react'
import { ExportPdfButton } from './ExportPdfButton'
import type { SolutionStep } from '../lib/solution'
import { Math as KTex } from '../lib/math'
import { BRAND_MARK, BRAND_TAIL, COMPUTED_BY, docLabel } from '../lib/brand'

// Calculator-template building blocks (docs/design/uiux-2026-07, Foundation /
// Beam mockups): numbered input sections on the left, a sticky verdict panel
// on the right — pass/fail banner, key outputs in mono, utilization bars with
// the amber ≥ 0.95 warning band. Presentation only; pages feed engine results.

export function PageHeader({ title, badges, actions }: { title: string; badges: string[]; actions?: ReactNode }) {
  return (
    <div className="no-print flex flex-wrap items-center gap-3 border-b border-hairline bg-sheet px-5 py-3.5 sm:px-7">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <h1 className="text-[21px] font-extrabold tracking-tight text-ink">{title}</h1>
        {badges.map((b) => (
          <span key={b} className="whitespace-nowrap rounded border border-brand-line bg-brand-tint px-1.5 py-px font-mono text-[10px] font-medium text-brand">{b}</span>
        ))}
      </div>
      {actions && <div className="no-print ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  )
}

/**
 * The standard calculation-page body: full-width container, inputs rail on the
 * left, results on the right.
 *
 * WHY THIS EXISTS. Ten pages were still on `max-w-3xl`, a width chosen when
 * they were single-column forms. Everything since — the numbered input cards,
 * the verdict panel, the worked solution with its chips — is laid out for the
 * 1500px two-column rail the foundation pages use, and cramming it into 768px
 * is what makes the chips wrap out of their card. The container is the defect,
 * not the cards inside it.
 *
 * Pass two children: the left rail, then the right column. One child fills the
 * width, for a page that has no results side.
 */
export function CalcBody({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
      <div className={`grid grid-cols-1 items-start gap-5 ${
        wide ? '' : 'lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)]'}`}>
        {children}
      </div>
    </div>
  )
}

export function CalcSection({ num, title, hint, children, grid = true }: {
  num: string; title: string; hint?: string; children: ReactNode; grid?: boolean
}) {
  return (
    <section className="rail-card rounded-lg border border-hairline bg-sheet print-avoid-break">
      <div className="flex items-baseline gap-2.5 border-b border-hairline-2 px-4 py-3">
        <span className="font-mono text-[10.5px] font-semibold text-faint">{num}</span>
        <h2 className="text-[13.5px] font-bold text-ink">{title}</h2>
        {hint && <span className="ml-auto text-[11px] text-faint">{hint}</span>}
      </div>
      <div className={grid ? 'grid grid-cols-1 gap-3.5 p-4 sm:grid-cols-2 lg:grid-cols-3' : 'p-4'}>{children}</div>
    </section>
  )
}

export interface VerdictStat { label: string; value: string; unit?: string }

/**
 * One row of the verdict panel.
 *
 * `ratio: null` means NOT EVALUATED — the check exists for this design but its
 * inputs were not supplied, so no number was produced. It is a THIRD state,
 * distinct from pass and fail, and it must stay distinct all the way to the
 * printed sheet: a report headed `DESIGN OK` that silently omits a check the
 * code requires is the one output an engineer signs and is liable for.
 *
 * `note` says what would make it run ("enter span and service loads"), because
 * "NOT CHECKED" without a remedy is a dead end.
 */
export interface VerdictCheck { name: string; ratio: number | null; note?: string }

// Token values, not copies of them. These were hex literals — which meant the
// bars never themed, and the amber was still the 3.50:1 value corrected in the
// palette. `var()` resolves per theme in an inline style just as it does in a
// stylesheet.
const barColor = (r: number) => (r > 1.0001 ? 'var(--t-fail)' : r >= 0.95 ? 'var(--t-warn)' : 'var(--t-ok)')

export function UtilBar({ c }: { c: VerdictCheck }) {
  if (c.ratio === null) {
    return (
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11.5px] font-semibold text-ink-2">{c.name}</span>
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-warn">not checked</span>
        </div>
        {/* A dashed rail, not an empty one: a 0%-wide bar reads as "passing
            with room to spare", which is the opposite of what happened. */}
        <div className="mt-1 h-[5px] rounded-[3px] border border-dashed border-field-line" />
        {c.note && <p className="mt-1 text-[10.5px] text-faint">{c.note}</p>}
      </div>
    )
  }
  const color = barColor(c.ratio)
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11.5px] font-semibold text-ink-2">{c.name}</span>
        <span className="font-mono text-[11px]" style={{ color }}>{c.ratio.toFixed(2)}</span>
      </div>
      <div className="mt-1 h-[5px] overflow-hidden rounded-[3px] bg-hairline">
        <div className="h-full rounded-[3px]" style={{ background: color, width: `${Math.min(100, c.ratio * 100)}%` }} />
      </div>
    </div>
  )
}

export function VerdictPanel({ ok, headline, governing, stats, checks, footnote }: {
  ok: boolean; headline: string; governing?: string
  stats: VerdictStat[]; checks: VerdictCheck[]; footnote?: ReactNode
}) {
  return (
    <section className="rail-card overflow-hidden rounded-lg border border-hairline bg-sheet print-avoid-break">
      <div className={`flex items-center gap-2.5 border-b px-4 py-3 ${ok ? 'border-ok-line bg-ok-tint' : 'border-fail-line bg-fail-tint'}`}>
        <span className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-on-solid ${ok ? 'bg-ok' : 'bg-fail'}`}>
          {ok
            ? <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            : <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>}
        </span>
        <div className="min-w-0">
          <p className={`text-[13px] font-extrabold tracking-wide ${ok ? 'text-ok' : 'text-fail'}`}>{headline}{coverageSuffix(checks)}</p>
          {governing && <p className={`mt-px truncate text-[11px] ${ok ? 'text-ok' : 'text-fail'}`}>{governing}</p>}
        </div>
      </div>
      {/* WRAPS, rather than forcing one row.
          `repeat(N, 1fr)` is `minmax(auto, 1fr)`: a track cannot shrink below
          its content, so a panel with several long stats grew WIDER than the
          card and the last of them ran off the right edge — `truncate` never
          fired, because every cell was already as wide as its text. auto-fit at
          a 150 px floor keeps three-stat panels on one row exactly as before
          and gives the wider ones a second row. The per-cell bottom border
          replaces the container's, so a wrapped row is divided too. */}
      {stats.length > 0 && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          {stats.map((s, i) => (
            <div key={s.label} className={`border-b border-hairline-2 px-3.5 py-3 ${i < stats.length - 1 ? 'border-r border-hairline-2' : ''}`}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-faint">{s.label}</p>
              <p className="mt-0.5 truncate font-mono text-[15px] font-semibold text-ink">
                {s.value}{s.unit && <span className="text-[11px] text-faint"> {s.unit}</span>}
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2.5 px-4 py-3.5">
        {checks.map((c) => <UtilBar key={c.name} c={c} />)}
        {footnote && <p className="mt-0.5 text-[10.5px] text-faint">{footnote}</p>}
      </div>
    </section>
  )
}

/**
 * Right-rail card with the drawing-sheet grid backdrop.
 *
 * `pdfDrawing` marks this card as the one whose SVG goes into the generated PDF
 * (see `ExportPdfButton`). Set it on exactly one card per page — the export
 * takes the first match.
 */
export function DrawingCard({ title, meta, children, pdfDrawing }: {
  title: string; meta?: string; children: ReactNode; pdfDrawing?: boolean
}) {
  return (
    <section className="rail-card rounded-lg border border-hairline bg-sheet print-avoid-break">
      <div className="flex items-center justify-between border-b border-hairline-2 px-4 py-3">
        <h2 className="text-[13.5px] font-bold text-ink">{title}</h2>
        {meta && <span className="font-mono text-[10px] text-faint">{meta}</span>}
      </div>
      {/* `data-drawing-sheet` marks a drawing surface: a dark theme inverts the
          INK inside it, never the card. `data-pdf-drawing` marks what the
          exporter captures — the SVG, whose own palette never changes, so the
          PDF is white paper in every theme. */}
      <div data-drawing-sheet {...(pdfDrawing ? { 'data-pdf-drawing': '' } : {})}
        className="p-3 [background-image:linear-gradient(#f0eee7_1px,transparent_1px),linear-gradient(90deg,#f0eee7_1px,transparent_1px)] [background-size:22px_22px]">
        {children}
      </div>
    </section>
  )
}

// ── Report letterhead (screen card) ─────────────────────────────────────────
export interface LetterheadState { project: string; sheet: string; preparedBy: string }

export function LetterheadCard({ lh, onChange, action }: {
  lh: LetterheadState
  onChange: (p: Partial<LetterheadState>) => void
  /** Optional export control, rendered beside the heading. */
  action?: ReactNode
}) {
  const today = new Date().toISOString().slice(0, 10)
  const cell = (label: string, value: string, key: keyof LetterheadState, ph: string, mono = false) => (
    <div className="min-w-0">
      <label className="block text-[9.5px] font-semibold uppercase tracking-widest text-faint" htmlFor={`lh-${key}`}>{label}</label>
      {/* A ruled line under the value, which is how a real title block says
          "write here" — the field previously had NO rest-state affordance at
          all, so the project name and the preparer read as printed text and
          went out blank. `!border-b` survives the `!border-0` reset that keeps
          the cell flush with the grid. */}
      <input id={`lh-${key}`} value={value} onChange={(e) => onChange({ [key]: e.target.value })} placeholder={ph}
        className={`w-full !border-0 !border-b !border-dotted !border-field-line !bg-transparent !p-0 text-[12px] font-semibold leading-[1.35] text-ink !shadow-none transition-colors hover:!border-brand-line focus-visible:!border-solid focus-visible:!border-brand placeholder:text-faint ${mono ? 'font-mono font-medium' : ''}`} />
    </div>
  )
  // Four fields on ONE row from `sm` up — the two-row grid was the whole of the
  // card's height, and none of these values is long enough to need half a card.
  return (
    <section className="rail-card no-print rounded-lg border border-hairline bg-sheet px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[12.5px] font-bold text-ink">Report letterhead</h2>
        {action ?? <span className="font-mono text-[10px] text-faint">prints on the calc sheet</span>}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1.5 sm:grid-cols-4">
        {cell('Project', lh.project, 'project', 'Lot 12 Residence')}
        {cell('Sheet', lh.sheet, 'sheet', 'F-01 · Rev A', true)}
        {cell('Prepared by', lh.preparedBy, 'preparedBy', 'Engineer, CE')}
        <div className="min-w-0">
          <span className="text-[9.5px] font-semibold uppercase tracking-widest text-faint">Date</span>
          <p className="font-mono text-[12px] font-medium leading-[1.35] text-ink">{today}</p>
        </div>
      </div>
    </section>
  )
}

// ── Print calc-sheet (docs/design/uiux-2026-07/Redesign - Report Print) ────
// Rendered print-only; the browser Print → Save as PDF path stays the export.
/** A printed check row. `ratio: null` = not evaluated; see `VerdictCheck`. */
export interface ReportCheckRow { name: string; ratio: number | null; ok: boolean; note?: string }
const SectionRule = ({ n, title }: { n: number; title: string }) => (
  <h2 className="mt-6 border-b-2 border-ink pb-1.5 text-[12px] font-extrabold uppercase tracking-[.12em] text-ink">{n} · {title}</h2>
)
export function PrintReport({ docTitle, docCode, badges, ok, governing, lh, onLhChange, stats = [], checks = [], data = [], steps, drawing, drawingTitle }: {
  docTitle: string; docCode: string; badges: string[]
  ok: boolean; governing: string
  lh: LetterheadState
  /** Edit handler for the on-screen letterhead this component now renders. */
  onLhChange?: (p: Partial<LetterheadState>) => void
  stats?: VerdictStat[]; checks?: ReportCheckRow[]
  data?: [string, string][]
  steps?: SolutionStep[]
  drawing?: ReactNode; drawingTitle?: string
}) {
  const today = new Date().toISOString().slice(0, 10)
  const lhCells: [string, string, boolean][] = [
    ['Project', lh.project || '—', false], ['Sheet', lh.sheet || '—', true],
    ['Prepared by', lh.preparedBy || '—', false], ['Date', today, true],
    ['Element', docTitle, false], ['Codes', badges.join(' · '), true],
  ]
  return (
    <>
    {/*
      Letterhead + export, in ONE card — rendered HERE rather than wired into
      each page because this component already receives every field the PDF
      needs. Hoisting the same prop soup out of eight pages to pass it to a
      second component would be eight chances to let the printed sheet and the
      generated PDF drift apart; taking both from one props object means they
      cannot.

      It used to be a separate "Calculation report" bar BELOW the page's own
      letterhead card — two cards where `ReportControls` (slab, stair, water
      tank, torsion, dev & splice, punching shear) has always had one, and
      wherever the page happened to place `PrintReport`: on the column page,
      the bottom. Same card, same place, on every calculator now.
    */}
    <div className="no-print mx-auto max-w-[1500px] px-5 pt-5 sm:px-7">
      <LetterheadCard lh={lh} onChange={onLhChange ?? (() => {})}
        action={<ExportPdfButton
          docTitle={docTitle} docCode={docCode} badges={badges} ok={ok} governing={governing} lh={lh}
          stats={stats} checks={checks} data={data} steps={steps} drawingTitle={drawingTitle}
          className="inline-flex flex-none items-center gap-2 rounded-md bg-brand px-3.5 py-1.5 text-[12.5px] font-semibold text-on-solid hover:bg-brand-hover disabled:opacity-50"
        />} />
    </div>
    <div className="print-only">
      <div className="flex items-baseline justify-between border-b border-hairline-2 pb-1.5 font-mono text-[9px] text-faint">
        <span>{docLabel(`${docTitle} — Calculation Report`)}</span>
        <span>{lh.sheet || docCode} · {today}</span>
      </div>
      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-[14px] font-extrabold tracking-[.14em]">{BRAND_MARK}</span>
            <span className="text-[8px] font-semibold uppercase tracking-[.22em] text-faint">{BRAND_TAIL}</span>
          </div>
          <h1 className="mt-2 text-[24px] font-extrabold tracking-tight">{docTitle} — Design Calculation</h1>
          <div className="mt-2 flex gap-2">
            {badges.map((b) => <span key={b} className="rounded border border-brand-line bg-brand-tint px-1.5 py-px font-mono text-[9.5px] font-medium text-brand">{b}</span>)}
          </div>
        </div>
        <div className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2.5 ${ok ? 'border-ok-line bg-ok-tint' : 'border-fail-line bg-fail-tint'}`}>
          <div>
            <p className={`text-[11.5px] font-extrabold tracking-wide ${ok ? 'text-ok' : 'text-fail'}`}>{ok ? 'DESIGN OK' : 'CHECK FAILED'}{coverageSuffix(checks)}</p>
            <p className={`mt-px text-[9.5px] ${ok ? 'text-ok' : 'text-fail'}`}>{governing}</p>
          </div>
        </div>
      </div>
      <div className="print-avoid-break mt-4 grid grid-cols-3 overflow-hidden rounded-lg border border-hairline">
        {lhCells.map(([k, v, mono]) => (
          <div key={k} className="border-b border-r border-hairline-2 px-3.5 py-2">
            <p className="text-[8.5px] font-semibold uppercase tracking-widest text-faint">{k}</p>
            <p className={`mt-0.5 text-[11px] font-semibold text-ink ${mono ? 'font-mono font-medium' : ''}`}>{v}</p>
          </div>
        ))}
      </div>

      {(stats.length > 0 || checks.length > 0) && <SectionRule n={1} title="Design Summary" />}
      {stats.length > 0 && <div className="print-avoid-break mt-3 grid grid-cols-3 gap-2.5">
        {stats.map((st) => (
          <div key={st.label} className="rounded-lg border border-hairline px-3.5 py-2.5">
            <p className="text-[8.5px] font-semibold uppercase tracking-widest text-faint">{st.label}</p>
            <p className="mt-0.5 font-mono text-[15px] font-semibold">{st.value}{st.unit && <span className="text-[10px] text-faint"> {st.unit}</span>}</p>
          </div>
        ))}
      </div>}
      {checks.length > 0 && <table className="mt-3 w-full border-collapse text-[10.5px]">
        <thead><tr>
          <th className="border-b-[1.5px] border-ink px-2.5 py-1.5 text-left text-[8.5px] font-bold uppercase tracking-widest text-muted">Check</th>
          <th className="border-b-[1.5px] border-ink px-2.5 py-1.5 text-right text-[8.5px] font-bold uppercase tracking-widest text-muted">Ratio</th>
          <th className="border-b-[1.5px] border-ink px-2.5 py-1.5 text-right text-[8.5px] font-bold uppercase tracking-widest text-muted">Status</th>
        </tr></thead>
        <tbody>
          {checks.map((c) => (
            <tr key={c.name}>
              <td className="border-b border-hairline-2 px-2.5 py-1.5 font-semibold">{c.name}</td>
              <td className="border-b border-hairline-2 px-2.5 py-1.5 text-right font-mono"
                style={c.ratio === null ? { color: 'var(--t-warn)' } : { color: barColor(c.ratio) }}>
                {c.ratio === null ? '\u2014' : c.ratio.toFixed(2)}
              </td>
              <td className="border-b border-hairline-2 px-2.5 py-1.5 text-right">
                <span className={`inline-block rounded px-1.5 py-px font-mono text-[9px] font-semibold ${
                  c.ratio === null ? 'bg-warn-tint text-warn' : c.ok ? 'bg-ok-tint text-ok' : 'bg-fail-tint text-fail'}`}>
                  {c.ratio === null ? 'NOT CHECKED' : c.ok ? 'PASS' : 'FAIL'}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>}

      {data.length > 0 && <SectionRule n={2} title="Design Data" />}
      {data.length > 0 && <div className="print-avoid-break mt-2 grid grid-cols-2 gap-x-7">
        {data.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between border-b border-hairline-2 py-1 text-[10.5px]">
            <span className="text-muted">{k}</span><span className="font-mono font-medium">{v}</span>
          </div>
        ))}
      </div>}

      {steps && steps.length > 0 && <SectionRule n={3} title="Worked Solution" />}
      {(steps ?? []).map((st, i) => (
        // minmax(0,…) rather than 1fr — see WorkedSolution: a track's automatic
        // minimum is its content, so a long equation widens the column instead
        // of scrolling inside it, and on a printed page there is no scrolling
        // to fall back on.
        <div key={i} className="print-avoid-break grid grid-cols-[minmax(0,1fr)_110px] gap-4 border-b border-hairline-2 py-3">
          <div className="min-w-0">
            <h3 className="text-[11.5px] font-bold"><span className="mr-1.5 font-mono font-semibold text-faint">3.{i + 1}</span>{st.title}</h3>
            <div className="mt-1 space-y-1">
              {st.lines.map((ln, j) => 'text' in ln
                ? <p key={j} className="text-[10.5px] leading-relaxed text-muted">{ln.text}</p>
                : 'item' in ln
                  ? <p key={j} className="relative pl-4 text-[10.5px] leading-relaxed text-muted before:absolute before:left-0 before:text-ok before:content-['\2713']">{ln.item}</p>
                  : <div key={j} className="overflow-x-auto rounded-md border border-hairline-2 bg-sheet-2 px-2.5 py-1 text-[10.5px]"><KTex block tex={ln.tex} /></div>)}
            </div>
          </div>
          <div className="pt-0.5">
            {st.pass !== undefined && (
              <span className={`inline-block rounded px-1.5 py-px font-mono text-[9px] font-semibold ${st.pass ? 'bg-ok-tint text-ok' : 'bg-fail-tint text-fail'}`}>{st.pass ? 'PASS' : 'FAIL'}</span>
            )}
            <p className="mt-1 text-[9px] leading-snug text-faint">{st.clause ?? st.note ?? ''}</p>
          </div>
        </div>
      ))}

      {drawing && <SectionRule n={4} title="Drawing" />}
      {drawing && <div className="print-avoid-break mt-3 rounded-lg border border-hairline p-3.5 [background-image:linear-gradient(#f0eee7_1px,transparent_1px),linear-gradient(90deg,#f0eee7_1px,transparent_1px)] [background-size:22px_22px]">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] font-bold tracking-[.14em] text-muted">{(lh.sheet || docCode).split('·')[0].trim()} · {(drawingTitle ?? docTitle).toUpperCase()}</span>
          <span className="font-mono text-[9px] text-faint">to scale</span>
        </div>
        <div className="mx-auto w-[46%]">{drawing}</div>
      </div>}

      {/* SCOPE. The sheet is signed, so it states its own boundaries: which
          checks ran, and which did not and why. Printed immediately before the
          signature block, because that is the last thing read before signing.
          Suppressed only when every check ran AND the letterhead is complete —
          there is then nothing to disclose. */}
      {(checkCoverage(checks).run < checkCoverage(checks).total || !lh.project.trim() || !lh.preparedBy.trim()) && <>
        <SectionRule n={drawing ? 5 : 4} title="Assumptions \u0026 Scope" />
        <div className="print-avoid-break mt-3 rounded-lg border border-hairline px-3.5 py-3 text-[10px] leading-relaxed">
          {checks.length > 0 && (
            <p><span className="font-semibold">Checks performed:</span>{' '}
              {checkCoverage(checks).run} of {checks.length}
              {' \u2014 '}
              {checks.filter((c) => c.ratio !== null).map((c) => c.name).join('; ') || 'none'}.</p>
          )}
          {checks.some((c) => c.ratio === null) && (
            <p className="mt-1.5 font-semibold text-warn">
              NOT evaluated: {checks.filter((c) => c.ratio === null)
                .map((c) => c.name + (c.note ? ` (${c.note})` : '')).join('; ')}.
              {' '}This sheet makes no statement about {checks.some((c) => c.ratio === null) && checks.filter((c) => c.ratio === null).length > 1 ? 'those checks' : 'that check'}.
            </p>
          )}
          {!lh.project.trim() && <p className="mt-1.5 text-warn">Project not named on this sheet.</p>}
          {!lh.preparedBy.trim() && <p className="mt-1.5 text-warn">Preparer not named on this sheet.</p>}
        </div>
      </>}

      <div className="print-avoid-break mt-6 grid grid-cols-2 gap-7">
        <div><div className="h-11 border-b border-ink" /><p className="mt-1.5 text-[10px] font-bold">{lh.preparedBy || '\u00a0'}</p><p className="text-[9px] text-faint">Prepared by</p></div>
        <div><div className="h-11 border-b border-ink" /><p className="mt-1.5 text-[10px] font-bold">{'\u00a0'}</p><p className="text-[9px] text-faint">Reviewed by · Date</p></div>
      </div>
      <p className="mt-4 text-[8.5px] leading-relaxed text-faint">{COMPUTED_BY} Load factors per NSCP 2015 §203.3; strength reduction factors per ACI 318-14 Table 21.2.1. Project: {lh.project || '—'}.</p>
    </div>
    </>
  )
}

/** Screen report bar for calculator pages that keep a single-column layout:
 *  inline letterhead fields + the Export (print) action. Pairs with
 *  PrintReport, which renders the printed letterhead itself. */
export function ReportBar({ title, lh, onChange }: {
  title: string; lh: LetterheadState; onChange: (p: Partial<LetterheadState>) => void
}) {
  const print = () => {
    const prev = document.title
    document.title = title + (lh.project ? ` — ${lh.project}` : '')
    window.print()
    window.setTimeout(() => { document.title = prev }, 500)
  }
  const field = (label: string, key: keyof LetterheadState, ph: string, mono = false) => (
    <label className="flex min-w-36 flex-1 flex-col text-sm">
      <span className="mb-1 text-[11.5px] font-semibold text-muted">{label}</span>
      <input value={lh[key]} onChange={(e) => onChange({ [key]: e.target.value })} placeholder={ph}
        className={`text-[13px] ${mono ? 'font-mono' : ''}`} />
    </label>
  )
  return (
    <div className="no-print mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-hairline bg-sheet p-3">
      {field('Project / job', 'project', 'Lot 12 Residence')}
      {field('Sheet', 'sheet', 'S-01 · Rev A', true)}
      {field('Prepared by', 'preparedBy', 'Engineer, CE')}
      <button type="button" onClick={print}
        className="ml-auto inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-on-solid hover:bg-brand-hover">
        ⎙ Export report
      </button>
    </div>
  )
}
