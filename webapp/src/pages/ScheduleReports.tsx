import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ScheduleProject } from '../engine/schedule/model'
import { useScheduleProject } from '../lib/useScheduleProject'
import { useScheduleSolve, type ScheduleSolve } from '../lib/useScheduleSolve'
import { buildScheduleReport } from '../lib/scheduleReport'
import { reportToCSV } from '../lib/scheduleCsv'
import { PageHeader } from '../components/calc'
import { PersistenceAlerts } from '../components/PersistenceAlerts'

// Phase 9 — reports at /schedule/reports. Builds a structured report payload
// (lib/scheduleReport, pure+tested) from the project + solve, previews it, and
// exports to CSV (inline), PDF (jsPDF) and Excel (ExcelJS). The PDF/Excel
// modules are lazy-loaded so their libraries stay out of the main bundle.

const btn = 'inline-flex items-center gap-1.5 rounded-md border border-field-line bg-sheet px-3 py-1.5 text-[12px] font-semibold text-ink-2 hover:border-brand-hover hover:text-brand disabled:opacity-50'
const btnPrimary = 'inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[12px] font-semibold text-on-solid hover:bg-brand-hover disabled:opacity-50'

function download(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function Reports({ project, solve }: { project: ScheduleProject; solve: ScheduleSolve }) {
  const start = project.meta.start
  const finish = solve.finishDate ?? start
  const defaultData = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return today < start ? start : today > finish ? finish : today
  }, [start, finish])
  const [dataDate, setDataDate] = useState(defaultData)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const report = useMemo(() => buildScheduleReport(project, solve, { dataDate }), [project, solve, dataDate])
  const slug = (project.meta.name || 'schedule').replace(/\s+/g, '-').toLowerCase()

  const onCsv = () => download(reportToCSV(report), `${slug}-report.csv`, 'text/csv;charset=utf-8')
  const lazy = async (kind: 'pdf' | 'xlsx') => {
    setBusy(kind); setErr(null)
    try {
      if (kind === 'pdf') (await import('../lib/schedulePdf')).exportSchedulePdf(report, `${slug}-report.pdf`)
      else await (await import('../lib/scheduleExcel')).exportScheduleExcel(report, `${slug}-report.xlsx`)
    } catch (e) {
      setErr(`${kind.toUpperCase()} export failed: ${e instanceof Error ? e.message : 'unknown error'}`)
    } finally { setBusy(null) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-hairline bg-sheet p-3">
        <label className="flex flex-col text-[10px] font-semibold uppercase tracking-widest text-faint">Report data date
          <input type="date" value={dataDate} min={start} max={finish} onChange={(e) => setDataDate(e.target.value || start)}
            className="mt-0.5 rounded border border-hairline px-2 py-1 font-mono text-[12.5px] font-normal tracking-normal text-ink" />
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" onClick={onCsv} className={btn}>⬇ CSV</button>
          <button type="button" disabled={busy !== null} onClick={() => lazy('xlsx')} className={btn}>{busy === 'xlsx' ? 'Exporting…' : '⬇ Excel'}</button>
          <button type="button" disabled={busy !== null} onClick={() => lazy('pdf')} className={btnPrimary}>{busy === 'pdf' ? 'Exporting…' : '⎙ PDF'}</button>
        </div>
      </div>
      {err && <div className="rounded-lg border border-fail-line bg-fail-tint px-4 py-2.5 text-[12px] text-fail">{err}</div>}

      {/* Preview */}
      <section className="rounded-lg border border-hairline bg-sheet p-5">
        <h1 className="text-[17px] font-extrabold tracking-tight text-ink">{report.title}</h1>
        <div className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1 sm:grid-cols-4">
          {report.meta.map(([k, v]) => (
            <div key={k} className="text-[11.5px]"><span className="text-faint">{k}: </span><span className="font-medium text-ink">{v}</span></div>
          ))}
        </div>
        {report.sections.map((s) => (
          <div key={s.title} className="mt-5">
            <h2 className="mb-1.5 border-b border-ink pb-1 text-[12px] font-bold uppercase tracking-[.1em] text-ink">{s.title}</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-[12px]">
                <thead>
                  <tr className="bg-sheet-2">
                    {s.columns.map((c) => <th key={c} className="border-b border-hairline px-2 py-1.5 text-left text-[9.5px] font-bold uppercase tracking-widest text-muted">{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((r, i) => (
                    <tr key={i} className="border-b border-hairline-2">
                      {r.map((cell, j) => <td key={j} className={`px-2 py-1 ${j === 0 ? 'font-medium text-ink' : 'font-mono text-muted'}`}>{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>
      <p className="text-[11px] text-faint">CSV downloads instantly; PDF (jsPDF) and Excel (ExcelJS) load their libraries on first use. Progress/value figures are computed as of the report data date.</p>
    </div>
  )
}

export default function ScheduleReports() {
  const api = useScheduleProject()
  const solve = useScheduleSolve(api.project)
  const project = api.project

  return (
    <>
      <PageHeader title="Reports" badges={['PDF', 'Excel', 'CSV']} actions={project ? <Link to="/schedule" className={btn}>Grid</Link> : undefined} />
      <div className="mx-auto max-w-[1400px] space-y-4 p-5 sm:p-7">
        <PersistenceAlerts saveError={api.saveError} clearSaveError={api.clearSaveError}
          conflict={api.conflict} reloadTheirs={api.reloadTheirs}
          overwriteWithMine={api.overwriteWithMine} />
        {!project ? (
          <div className="rounded-lg border border-dashed border-field-line bg-sheet px-6 py-16 text-center">
            <h2 className="text-[16px] font-bold text-ink">No schedule open</h2>
            <Link to="/schedule" className="mt-4 inline-flex rounded-md bg-brand px-3 py-1.5 text-[12px] font-semibold text-on-solid hover:bg-brand-hover">Go to the schedule grid</Link>
          </div>
        ) : project.activities.length === 0 ? (
          <div className="rounded-lg border border-dashed border-field-line bg-sheet px-6 py-16 text-center text-[13px] text-faint">No activities to report — add some in the grid.</div>
        ) : !solve.ok ? (
          <div className="rounded-lg border border-fail-line bg-fail-tint px-4 py-2.5 text-[12px] text-fail">The schedule has {solve.errorCount} blocking issue(s); fix them in the grid to generate a report.</div>
        ) : (
          <Reports project={project} solve={solve} />
        )}
      </div>
    </>
  )
}
