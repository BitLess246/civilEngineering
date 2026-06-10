import { useState, type JSX } from 'react'

export interface ReportControlsProps {
  /** Report heading, also used as the print/PDF document title. */
  title: string
}

/**
 * Reusable report bar: on screen it offers project / prepared-by fields and a
 * "Print / Save PDF" button; in print it renders a clean letterhead. Pair with
 * the `.no-print` / `.print-avoid-break` utilities (see index.css). Browser
 * "Print → Save as PDF" is the export path — no extra dependency needed.
 */
export function ReportControls({ title }: ReportControlsProps): JSX.Element {
  const [project, setProject] = useState('')
  const [preparedBy, setPreparedBy] = useState('')
  const today = new Date().toISOString().slice(0, 10)

  const print = () => {
    const prev = document.title
    document.title = title + (project ? ` — ${project}` : '')
    window.print()
    window.setTimeout(() => { document.title = prev }, 500)
  }

  const field = (label: string, value: string, set: (v: string) => void, ph: string) => (
    <label className="flex flex-col text-sm">
      <span className="mb-1 font-medium text-slate-600">{label}</span>
      <input value={value} onChange={(e) => set(e.target.value)} placeholder={ph}
        className="rounded-md border border-slate-300 px-2.5 py-1.5 text-slate-800 focus:border-[#0056b3] focus:outline-none focus:ring-1 focus:ring-[#0056b3]" />
    </label>
  )

  return (
    <>
      {/* On-screen controls */}
      <div className="no-print mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        {field('Project / job', project, setProject, 'e.g. Lot 12 Residence')}
        {field('Prepared by', preparedBy, setPreparedBy, 'Engineer name')}
        <button type="button" onClick={print}
          className="ml-auto inline-flex items-center gap-2 rounded-lg bg-gradient-to-br from-[#0056b3] to-[#003f86] px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg">
          🖨 Print / Save PDF
        </button>
      </div>

      {/* Print-only letterhead */}
      <div className="print-only mb-4 border-b-2 border-[#0056b3] pb-2">
        <h1 className="text-xl font-extrabold text-[#0056b3]">{title}</h1>
        <p className="mt-0.5 text-xs text-slate-600">
          Project: <b>{project || '—'}</b> &nbsp;·&nbsp; Prepared by: <b>{preparedBy || '—'}</b> &nbsp;·&nbsp; Date: <b>{today}</b>
        </p>
      </div>
    </>
  )
}
