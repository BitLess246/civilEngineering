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
    <div className="no-print flex flex-wrap items-center gap-3 border-b border-[#e3e1da] bg-white px-5 py-3.5 sm:px-7">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <h1 className="text-[21px] font-extrabold tracking-tight text-[#0f1b2a]">{title}</h1>
        {badges.map((b) => (
          <span key={b} className="whitespace-nowrap rounded border border-[#cddcf0] bg-[#eaf1f9] px-1.5 py-px font-mono text-[10px] font-medium text-[#0f4c92]">{b}</span>
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
    <section className="rail-card rounded-lg border border-[#e3e1da] bg-white print-avoid-break">
      <div className="flex items-baseline gap-2.5 border-b border-[#eeece5] px-4 py-3">
        <span className="font-mono text-[10.5px] font-semibold text-[#a39d8d]">{num}</span>
        <h2 className="text-[13.5px] font-bold text-[#0f1b2a]">{title}</h2>
        {hint && <span className="ml-auto text-[11px] text-[#a39d8d]">{hint}</span>}
      </div>
      <div className={grid ? 'grid grid-cols-1 gap-3.5 p-4 sm:grid-cols-2 lg:grid-cols-3' : 'p-4'}>{children}</div>
    </section>
  )
}

export interface VerdictStat { label: string; value: string; unit?: string }
export interface VerdictCheck { name: string; ratio: number }

const barColor = (r: number) => (r > 1.0001 ? '#c2402a' : r >= 0.95 ? '#b97d10' : '#1a7f4b')

export function UtilBar({ c }: { c: VerdictCheck }) {
  const color = barColor(c.ratio)
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11.5px] font-semibold text-[#3d4a5c]">{c.name}</span>
        <span className="font-mono text-[11px]" style={{ color }}>{c.ratio.toFixed(2)}</span>
      </div>
      <div className="mt-1 h-[5px] overflow-hidden rounded-[3px] bg-[#eeece5]">
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
    <section className="rail-card overflow-hidden rounded-lg border border-[#e3e1da] bg-white print-avoid-break">
      <div className={`flex items-center gap-2.5 border-b px-4 py-3 ${ok ? 'border-[#d3e8da] bg-[#ecf6ef]' : 'border-[#efd4cc] bg-[#fbeeea]'}`}>
        <span className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-white ${ok ? 'bg-[#1a7f4b]' : 'bg-[#c2402a]'}`}>
          {ok
            ? <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            : <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>}
        </span>
        <div className="min-w-0">
          <p className={`text-[13px] font-extrabold tracking-wide ${ok ? 'text-[#14603a]' : 'text-[#8f2f1e]'}`}>{headline}</p>
          {governing && <p className={`mt-px truncate text-[11px] ${ok ? 'text-[#4d7a5f]' : 'text-[#a95b47]'}`}>{governing}</p>}
        </div>
      </div>
      {stats.length > 0 && (
        <div className="grid border-b border-[#eeece5]" style={{ gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}>
          {stats.map((s, i) => (
            <div key={s.label} className={`px-3.5 py-3 ${i < stats.length - 1 ? 'border-r border-[#eeece5]' : ''}`}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a39d8d]">{s.label}</p>
              <p className="mt-0.5 truncate font-mono text-[15px] font-semibold text-[#0f1b2a]">
                {s.value}{s.unit && <span className="text-[11px] text-[#a39d8d]"> {s.unit}</span>}
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2.5 px-4 py-3.5">
        {checks.map((c) => <UtilBar key={c.name} c={c} />)}
        {footnote && <p className="mt-0.5 text-[10.5px] text-[#a39d8d]">{footnote}</p>}
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
    <section className="rail-card rounded-lg border border-[#e3e1da] bg-white print-avoid-break">
      <div className="flex items-center justify-between border-b border-[#eeece5] px-4 py-3">
        <h2 className="text-[13.5px] font-bold text-[#0f1b2a]">{title}</h2>
        {meta && <span className="font-mono text-[10px] text-[#a39d8d]">{meta}</span>}
      </div>
      <div {...(pdfDrawing ? { 'data-pdf-drawing': '' } : {})}
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
      <span className="text-[9.5px] font-semibold uppercase tracking-widest text-[#a39d8d]">{label}</span>
      <input value={value} onChange={(e) => onChange({ [key]: e.target.value })} placeholder={ph}
        className={`w-full !border-0 !bg-transparent !p-0 text-[12px] font-semibold leading-[1.35] text-[#0f1b2a] !shadow-none placeholder:text-[#c8c2b4] ${mono ? 'font-mono font-medium' : ''}`} />
    </div>
  )
  // Four fields on ONE row from `sm` up — the two-row grid was the whole of the
  // card's height, and none of these values is long enough to need half a card.
  return (
    <section className="rail-card no-print rounded-lg border border-[#e3e1da] bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[12.5px] font-bold text-[#0f1b2a]">Report letterhead</h2>
        {action ?? <span className="font-mono text-[10px] text-[#a39d8d]">prints on the calc sheet</span>}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-1.5 sm:grid-cols-4">
        {cell('Project', lh.project, 'project', 'Lot 12 Residence')}
        {cell('Sheet', lh.sheet, 'sheet', 'F-01 · Rev A', true)}
        {cell('Prepared by', lh.preparedBy, 'preparedBy', 'Engineer, CE')}
        <div className="min-w-0">
          <span className="text-[9.5px] font-semibold uppercase tracking-widest text-[#a39d8d]">Date</span>
          <p className="font-mono text-[12px] font-medium leading-[1.35] text-[#0f1b2a]">{today}</p>
        </div>
      </div>
    </section>
  )
}

// ── Print calc-sheet (docs/design/uiux-2026-07/Redesign - Report Print) ────
// Rendered print-only; the browser Print → Save as PDF path stays the export.
export interface ReportCheckRow { name: string; ratio: number; ok: boolean }
const SectionRule = ({ n, title }: { n: number; title: string }) => (
  <h2 className="mt-6 border-b-2 border-[#0f1b2a] pb-1.5 text-[12px] font-extrabold uppercase tracking-[.12em] text-[#0f1b2a]">{n} · {title}</h2>
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
          className="inline-flex flex-none items-center gap-2 rounded-md bg-[#0f4c92] px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-[#0d3f78] disabled:opacity-50"
        />} />
    </div>
    <div className="print-only">
      <div className="flex items-baseline justify-between border-b border-[#eeece5] pb-1.5 font-mono text-[9px] text-[#a39d8d]">
        <span>{docLabel(`${docTitle} — Calculation Report`)}</span>
        <span>{lh.sheet || docCode} · {today}</span>
      </div>
      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-[14px] font-extrabold tracking-[.14em]">{BRAND_MARK}</span>
            <span className="text-[8px] font-semibold uppercase tracking-[.22em] text-[#7a7568]">{BRAND_TAIL}</span>
          </div>
          <h1 className="mt-2 text-[24px] font-extrabold tracking-tight">{docTitle} — Design Calculation</h1>
          <div className="mt-2 flex gap-2">
            {badges.map((b) => <span key={b} className="rounded border border-[#cddcf0] bg-[#eaf1f9] px-1.5 py-px font-mono text-[9.5px] font-medium text-[#0f4c92]">{b}</span>)}
          </div>
        </div>
        <div className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2.5 ${ok ? 'border-[#d3e8da] bg-[#ecf6ef]' : 'border-[#efd4cc] bg-[#fbeeea]'}`}>
          <div>
            <p className={`text-[11.5px] font-extrabold tracking-wide ${ok ? 'text-[#14603a]' : 'text-[#8f2f1e]'}`}>{ok ? 'DESIGN OK' : 'CHECK FAILED'}</p>
            <p className={`mt-px text-[9.5px] ${ok ? 'text-[#4d7a5f]' : 'text-[#a95b47]'}`}>{governing}</p>
          </div>
        </div>
      </div>
      <div className="print-avoid-break mt-4 grid grid-cols-3 overflow-hidden rounded-lg border border-[#e3e1da]">
        {lhCells.map(([k, v, mono]) => (
          <div key={k} className="border-b border-r border-[#eeece5] px-3.5 py-2">
            <p className="text-[8.5px] font-semibold uppercase tracking-widest text-[#a39d8d]">{k}</p>
            <p className={`mt-0.5 text-[11px] font-semibold text-[#0f1b2a] ${mono ? 'font-mono font-medium' : ''}`}>{v}</p>
          </div>
        ))}
      </div>

      {(stats.length > 0 || checks.length > 0) && <SectionRule n={1} title="Design Summary" />}
      {stats.length > 0 && <div className="print-avoid-break mt-3 grid grid-cols-3 gap-2.5">
        {stats.map((st) => (
          <div key={st.label} className="rounded-lg border border-[#e3e1da] px-3.5 py-2.5">
            <p className="text-[8.5px] font-semibold uppercase tracking-widest text-[#a39d8d]">{st.label}</p>
            <p className="mt-0.5 font-mono text-[15px] font-semibold">{st.value}{st.unit && <span className="text-[10px] text-[#a39d8d]"> {st.unit}</span>}</p>
          </div>
        ))}
      </div>}
      {checks.length > 0 && <table className="mt-3 w-full border-collapse text-[10.5px]">
        <thead><tr>
          <th className="border-b-[1.5px] border-[#0f1b2a] px-2.5 py-1.5 text-left text-[8.5px] font-bold uppercase tracking-widest text-[#5c6675]">Check</th>
          <th className="border-b-[1.5px] border-[#0f1b2a] px-2.5 py-1.5 text-right text-[8.5px] font-bold uppercase tracking-widest text-[#5c6675]">Ratio</th>
          <th className="border-b-[1.5px] border-[#0f1b2a] px-2.5 py-1.5 text-right text-[8.5px] font-bold uppercase tracking-widest text-[#5c6675]">Status</th>
        </tr></thead>
        <tbody>
          {checks.map((c) => (
            <tr key={c.name}>
              <td className="border-b border-[#eeece5] px-2.5 py-1.5 font-semibold">{c.name}</td>
              <td className="border-b border-[#eeece5] px-2.5 py-1.5 text-right font-mono" style={{ color: c.ratio > 1.0001 ? '#c2402a' : c.ratio >= 0.95 ? '#b97d10' : '#1a7f4b' }}>{c.ratio.toFixed(2)}</td>
              <td className="border-b border-[#eeece5] px-2.5 py-1.5 text-right">
                <span className={`inline-block rounded px-1.5 py-px font-mono text-[9px] font-semibold ${c.ok ? 'bg-[#ddefe3] text-[#14603a]' : 'bg-[#fbeeea] text-[#c2402a]'}`}>{c.ok ? 'PASS' : 'FAIL'}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>}

      {data.length > 0 && <SectionRule n={2} title="Design Data" />}
      {data.length > 0 && <div className="print-avoid-break mt-2 grid grid-cols-2 gap-x-7">
        {data.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between border-b border-[#f3f1ea] py-1 text-[10.5px]">
            <span className="text-[#5c6675]">{k}</span><span className="font-mono font-medium">{v}</span>
          </div>
        ))}
      </div>}

      {steps && steps.length > 0 && <SectionRule n={3} title="Worked Solution" />}
      {(steps ?? []).map((st, i) => (
        <div key={i} className="print-avoid-break grid grid-cols-[1fr_110px] gap-4 border-b border-[#f3f1ea] py-3">
          <div>
            <h3 className="text-[11.5px] font-bold"><span className="mr-1.5 font-mono font-semibold text-[#a39d8d]">3.{i + 1}</span>{st.title}</h3>
            <div className="mt-1 space-y-1">
              {st.lines.map((ln, j) => 'text' in ln
                ? <p key={j} className="text-[10.5px] leading-relaxed text-[#5c6675]">{ln.text}</p>
                : <div key={j} className="overflow-x-auto rounded-md border border-[#eeece5] bg-[#f9f8f4] px-2.5 py-1 text-[10.5px]"><KTex block tex={ln.tex} /></div>)}
            </div>
          </div>
          <div className="pt-0.5">
            {st.pass !== undefined && (
              <span className={`inline-block rounded px-1.5 py-px font-mono text-[9px] font-semibold ${st.pass ? 'bg-[#ddefe3] text-[#14603a]' : 'bg-[#fbeeea] text-[#c2402a]'}`}>{st.pass ? 'PASS' : 'FAIL'}</span>
            )}
            <p className="mt-1 text-[9px] leading-snug text-[#a39d8d]">{st.clause ?? st.note ?? ''}</p>
          </div>
        </div>
      ))}

      {drawing && <SectionRule n={4} title="Drawing" />}
      {drawing && <div className="print-avoid-break mt-3 rounded-lg border border-[#e3e1da] p-3.5 [background-image:linear-gradient(#f0eee7_1px,transparent_1px),linear-gradient(90deg,#f0eee7_1px,transparent_1px)] [background-size:22px_22px]">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] font-bold tracking-[.14em] text-[#5c6675]">{(lh.sheet || docCode).split('·')[0].trim()} · {(drawingTitle ?? docTitle).toUpperCase()}</span>
          <span className="font-mono text-[9px] text-[#a39d8d]">to scale</span>
        </div>
        <div className="mx-auto w-[46%]">{drawing}</div>
      </div>}

      <div className="print-avoid-break mt-6 grid grid-cols-2 gap-7">
        <div><div className="h-11 border-b border-[#0f1b2a]" /><p className="mt-1.5 text-[10px] font-bold">{lh.preparedBy || '\u00a0'}</p><p className="text-[9px] text-[#7a7568]">Prepared by</p></div>
        <div><div className="h-11 border-b border-[#0f1b2a]" /><p className="mt-1.5 text-[10px] font-bold">{'\u00a0'}</p><p className="text-[9px] text-[#7a7568]">Reviewed by · Date</p></div>
      </div>
      <p className="mt-4 text-[8.5px] leading-relaxed text-[#a39d8d]">{COMPUTED_BY} Load factors per NSCP 2015 §203.3; strength reduction factors per ACI 318-14 Table 21.2.1. Project: {lh.project || '—'}.</p>
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
      <span className="mb-1 text-[11.5px] font-semibold text-[#5c6675]">{label}</span>
      <input value={lh[key]} onChange={(e) => onChange({ [key]: e.target.value })} placeholder={ph}
        className={`text-[13px] ${mono ? 'font-mono' : ''}`} />
    </label>
  )
  return (
    <div className="no-print mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-[#e3e1da] bg-white p-3">
      {field('Project / job', 'project', 'Lot 12 Residence')}
      {field('Sheet', 'sheet', 'S-01 · Rev A', true)}
      {field('Prepared by', 'preparedBy', 'Engineer, CE')}
      <button type="button" onClick={print}
        className="ml-auto inline-flex items-center gap-2 rounded-md bg-[#0f4c92] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d3f78]">
        ⎙ Export report
      </button>
    </div>
  )
}
