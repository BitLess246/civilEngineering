import { useState, type JSX } from 'react'

export interface ReportControlsProps {
  /** Report heading, also used as the print/PDF document title. */
  title: string
  /** Code badges shown on the printed letterhead (e.g. ['ACI 318-14']). */
  badges?: string[]
}

/**
 * Report letterhead for every calculator page (docs/design/uiux-2026-07,
 * Report Print): on screen a letterhead card (Project / Sheet / Prepared by /
 * Date) with the ⎙ Export action; in print, the calc-sheet header — mono
 * document strip, CIVENG brand block, title, code badges and the letterhead
 * grid — ahead of the page's themed content. Pages with structured results
 * use the full PrintReport instead (components/calc.tsx).
 */
export function ReportControls({ title, badges = ['NSCP 2015', 'ACI 318-14'] }: ReportControlsProps): JSX.Element {
  const [project, setProject] = useState('')
  const [sheet, setSheet] = useState('')
  const [preparedBy, setPreparedBy] = useState('')
  const today = new Date().toISOString().slice(0, 10)

  const print = () => {
    const prev = document.title
    document.title = title + (project ? ` — ${project}` : '')
    window.print()
    window.setTimeout(() => { document.title = prev }, 500)
  }

  const field = (label: string, value: string, set: (v: string) => void, ph: string, mono = false) => (
    <label className="flex min-w-36 flex-1 flex-col text-sm">
      <span className="mb-1 text-[11.5px] font-semibold text-[#5c6675]">{label}</span>
      <input value={value} onChange={(e) => set(e.target.value)} placeholder={ph}
        className={`text-[13px] ${mono ? 'font-mono' : ''}`} />
    </label>
  )

  const lhCells: [string, string, boolean][] = [
    ['Project', project || '—', false], ['Sheet', sheet || '—', true],
    ['Prepared by', preparedBy || '—', false], ['Date', today, true],
  ]

  return (
    <>
      {/* Screen: letterhead card + export */}
      <div className="no-print mt-4 rounded-lg border border-[#e3e1da] bg-white p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-[13.5px] font-bold text-[#0f1b2a]">Report letterhead</h2>
          <span className="font-mono text-[10px] text-[#a39d8d]">prints on the calc sheet</span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {field('Project / job', project, setProject, 'Lot 12 Residence')}
          {field('Sheet', sheet, setSheet, 'S-01 · Rev A', true)}
          {field('Prepared by', preparedBy, setPreparedBy, 'Engineer, CE')}
          <button type="button" onClick={print}
            className="ml-auto inline-flex items-center gap-2 rounded-md bg-[#0f4c92] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0d3f78]">
            ⎙ Export report
          </button>
        </div>
      </div>

      {/* Print: calc-sheet letterhead header */}
      <div className="print-only mb-4">
        <div className="flex items-baseline justify-between border-b border-[#eeece5] pb-1.5 font-mono text-[9px] text-[#a39d8d]">
          <span>CIVENG TOOLKIT · {title.toUpperCase()}</span>
          <span>{sheet || '—'} · {today}</span>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-[14px] font-extrabold tracking-[.14em]">CIVENG</span>
          <span className="text-[8px] font-semibold uppercase tracking-[.22em] text-[#7a7568]">Toolkit</span>
        </div>
        <h1 className="mt-2 text-[24px] font-extrabold tracking-tight text-[#0f1b2a]">{title}</h1>
        <div className="mt-2 flex gap-2">
          {badges.map((b) => <span key={b} className="rounded border border-[#cddcf0] bg-[#eaf1f9] px-1.5 py-px font-mono text-[9.5px] font-medium text-[#0f4c92]">{b}</span>)}
        </div>
        <div className="mt-4 grid grid-cols-4 overflow-hidden rounded-lg border border-[#e3e1da]">
          {lhCells.map(([k, v, mono]) => (
            <div key={k} className="border-r border-[#eeece5] px-3.5 py-2 last:border-r-0">
              <p className="text-[8.5px] font-semibold uppercase tracking-widest text-[#a39d8d]">{k}</p>
              <p className={`mt-0.5 text-[11px] font-semibold text-[#0f1b2a] ${mono ? 'font-mono font-medium' : ''}`}>{v}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
