// "What goes in the print, and which files?" — asked before every export.
//
// The report grew an appendix, and a 130-page document with every table in
// it is not what someone checking one beam wants. So the export button opens
// this instead of downloading straight away: tick the sections, tick the
// files, Generate. A section whose result the engine never produced is shown
// disabled with the reason, so the print can never promise a modal table
// that was not run.
//
// Escape and the backdrop close it without exporting — a dialog you cannot
// leave is a wall.
import { useCallback, useEffect, useState } from 'react'
import type { AppendixKey } from '../lib/analysisAppendix'
import { APPENDIX_TITLES } from '../lib/analysisAppendix'
import type { ReportSectionKey } from '../lib/modelPdf'
import { REPORT_SECTION_TITLES } from '../lib/modelPdf'

export interface ExportOptions {
  reportSections: ReportSectionKey[]
  appendixSections: AppendixKey[]
  outputs: { report: boolean; appendix: boolean; combined: boolean }
}

const REPORT_KEYS: ReportSectionKey[] = ['snapshot', 'summary', 'status', 'project', 'schedules', 'solutions', 'drawings']
const APPENDIX_KEYS: AppendixKey[] = ['model', 'loading', 'analysis', 'modal', 'nonlinear', 'pushover', 'optimization']

export function ExportReportDialog({ available, unavailable, busy, onClose, onGenerate }: {
  /** Which appendix sections have data behind them. */
  available: Record<AppendixKey, boolean>
  /** Why a section is unavailable, by key — shown beside the disabled box. */
  unavailable?: Partial<Record<AppendixKey, string>>
  busy: boolean
  onClose: () => void
  onGenerate: (o: ExportOptions) => void
}) {
  const [report, setReport] = useState<ReadonlySet<ReportSectionKey>>(() => new Set(REPORT_KEYS))
  const [appendix, setAppendix] = useState<ReadonlySet<AppendixKey>>(() => new Set(APPENDIX_KEYS.filter((k) => available[k])))
  const [outputs, setOutputs] = useState({ report: true, appendix: true, combined: false })

  const close = useCallback(() => { if (!busy) onClose() }, [busy, onClose])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [close])

  const toggle = <K,>(set: ReadonlySet<K>, k: K): Set<K> => {
    const next = new Set(set)
    if (!next.delete(k)) next.add(k)
    return next
  }
  const nothing = !outputs.report && !outputs.appendix && !outputs.combined
  const noAppendix = APPENDIX_KEYS.every((k) => !appendix.has(k))
  const noReport = REPORT_KEYS.every((k) => !report.has(k))
  // An output with nothing in it is not a file anyone asked for.
  const blocked = nothing || (outputs.report && noReport) || (outputs.appendix && noAppendix)
    || (outputs.combined && noReport && noAppendix)

  const box = (key: string, checked: boolean, onChange: () => void, label: string, hint?: string, disabled = false) => (
    <label key={key} className={`flex items-start gap-2 rounded-md px-2 py-1 text-[12px] ${disabled ? 'text-slate-400' : 'text-slate-700 hover:bg-slate-50'}`}>
      <input type="checkbox" className="mt-0.5" checked={checked} disabled={disabled} onChange={onChange} />
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-[10.5px] leading-snug text-slate-400">{hint}</span>}
      </span>
    </label>
  )

  return (
    <div className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-[#0f1b2a]/55 p-4 py-[6vh]"
      onMouseDown={close} role="dialog" aria-modal="true" aria-labelledby="export-title">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-[#e3e1da] bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}>
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 id="export-title" className="text-[13px] font-bold uppercase tracking-wide text-[#0f4c92]">Generate report</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">Choose what the print includes and which PDFs to write. Sections the engine has not produced are greyed out.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">Structure design report</legend>
            {REPORT_KEYS.map((k) => box(k, report.has(k), () => setReport((s) => toggle(s, k)), REPORT_SECTION_TITLES[k].label, REPORT_SECTION_TITLES[k].hint))}
          </fieldset>
          <fieldset>
            <legend className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">Analysis appendix</legend>
            {APPENDIX_KEYS.map((k) => box(
              k,
              appendix.has(k) && available[k],
              () => setAppendix((s) => toggle(s, k)),
              `${['A', 'B', 'C', 'D', 'E', 'F', 'G'][APPENDIX_KEYS.indexOf(k)]} · ${APPENDIX_TITLES[k]}`,
              available[k] ? undefined : (unavailable?.[k] ?? 'not run'),
              !available[k],
            ))}
          </fieldset>
        </div>

        <div className="border-t border-slate-100 px-5 py-3">
          <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">PDFs to generate</p>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
            {box('report', outputs.report, () => setOutputs((o) => ({ ...o, report: !o.report })), 'Structure Design Report', 'summary, schedules, worked solutions, drawings')}
            {box('appendix', outputs.appendix, () => setOutputs((o) => ({ ...o, appendix: !o.appendix })), 'Analysis Appendix', 'model, loads, results, modes, hinges, optimizer')}
            {box('combined', outputs.combined, () => setOutputs((o) => ({ ...o, combined: !o.combined })), 'Combined PDF', 'both, bound as one document')}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-5 py-3">
          <button type="button" onClick={close} disabled={busy}
            className="rounded-md px-3 py-1.5 text-[12px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">
            Cancel
          </button>
          <button type="button" disabled={blocked || busy}
            onClick={() => onGenerate({ reportSections: REPORT_KEYS.filter((k) => report.has(k)), appendixSections: APPENDIX_KEYS.filter((k) => appendix.has(k) && available[k]), outputs })}
            className="rounded-md bg-[#0f4c92] px-4 py-1.5 text-[12px] font-semibold text-white hover:bg-[#0d417d] disabled:opacity-40">
            {busy ? '⏳ Building…' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  )
}
