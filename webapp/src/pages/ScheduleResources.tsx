import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useScheduleProject } from '../lib/useScheduleProject'
import { useScheduleSolve } from '../lib/useScheduleSolve'
import { resourceLoad, hasOverAllocation, type ResourceLoad } from '../lib/resourceLoad'
import type { ResourceType } from '../engine/schedule/model'
import { PageHeader } from '../components/calc'
import { PersistenceAlerts } from '../components/PersistenceAlerts'

// Phase 8 — resource loading at /schedule/resources. Spreads each activity's
// resource assignment over its scheduled span (lib/resourceLoad, pure+tested),
// shows a per-resource daily-load histogram with over-allocation in red, and a
// summary table. Reuses the store-backed project + solve. Drawing-sheet palette.

const btn = 'inline-flex items-center gap-1.5 rounded-md border border-field-line bg-sheet px-2.5 py-1.5 text-[12px] font-semibold text-ink-2 hover:border-brand-hover hover:text-brand'
const CRITICAL = '#c2402a'
const TYPE_COLOR: Record<ResourceType, string> = { labor: '#0f4c92', equipment: '#7c3aed', material: '#1a7f4b' }
const n1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '—')

function Histogram({ load }: { load: ResourceLoad }) {
  const H = 64, bw = Math.max(3, Math.min(14, Math.floor(560 / Math.max(1, load.perDay.length))))
  const base = TYPE_COLOR[load.resource.type] ?? '#0f4c92'
  const max = Math.max(load.peak, load.available ?? 0, 1)
  const yAvail = load.available != null ? H - (load.available / max) * H : null
  return (
    <div className="overflow-x-auto">
      <svg width={load.perDay.length * bw + 8} height={H + 16} className="min-w-[220px]">
        {yAvail != null && (
          <>
            <line x1={0} y1={yAvail} x2={load.perDay.length * bw} y2={yAvail} stroke={CRITICAL} strokeWidth={1} strokeDasharray="3 2" />
            <text x={2} y={Math.max(9, yAvail - 2)} style={{ fontSize: 8, fontFamily: 'monospace', fill: CRITICAL }}>avail {load.available}</text>
          </>
        )}
        {load.perDay.map((v, t) => {
          const h = (v / max) * H
          const over = load.available != null && v > load.available + 1e-9
          return (
            <rect key={t} x={t * bw} y={H - h} width={Math.max(1, bw - 1)} height={h} fill={over ? CRITICAL : base} opacity={over ? 0.95 : 0.6}>
              <title>day {t}: {n1(v)} {load.resource.unit}{over ? ' (over)' : ''}</title>
            </rect>
          )
        })}
        {load.perDay.length > 0 && <>
          <text x={0} y={H + 12} style={{ fontSize: 8, fill: '#a39d8d' }}>day 0</text>
          <text x={load.perDay.length * bw} textAnchor="end" y={H + 12} style={{ fontSize: 8, fill: '#a39d8d' }}>day {load.perDay.length - 1}</text>
        </>}
      </svg>
    </div>
  )
}

export default function ScheduleResources() {
  const api = useScheduleProject()
  const solve = useScheduleSolve(api.project)
  const project = api.project

  const loads = useMemo(() => {
    if (!project || !solve.cpm) return []
    return resourceLoad(project.activities, solve.cpm, project.resources, solve.cpm.duration)
  }, [project, solve.cpm])

  const anyOver = hasOverAllocation(loads)
  const th = 'px-2.5 py-2 text-left text-[9.5px] font-bold uppercase tracking-widest text-muted'
  const td = 'px-2.5 py-1.5 align-middle'

  return (
    <>
      <PageHeader title="Resource Loading" badges={['labor', 'equipment', 'material']} actions={project ? <Link to="/schedule" className={btn}>Grid</Link> : undefined} />
      <div className="mx-auto max-w-[1400px] space-y-4 p-5 sm:p-7">
        <PersistenceAlerts saveError={api.saveError} clearSaveError={api.clearSaveError}
          conflict={api.conflict} reloadTheirs={api.reloadTheirs}
          overwriteWithMine={api.overwriteWithMine} />
        {!project ? (
          <div className="rounded-lg border border-dashed border-field-line bg-sheet px-6 py-16 text-center">
            <h2 className="text-[16px] font-bold text-ink">No schedule open</h2>
            <Link to="/schedule" className="mt-4 inline-flex rounded-md bg-brand px-3 py-1.5 text-[12px] font-semibold text-on-solid hover:bg-brand-hover">Go to the schedule grid</Link>
          </div>
        ) : project.resources.length === 0 ? (
          <div className="rounded-lg border border-dashed border-field-line bg-sheet px-6 py-16 text-center text-[13px] text-faint">This project has no resources. Load the sample, or import a project whose activities carry resource assignments and per-day availability, to see the loading.</div>
        ) : !solve.ok ? (
          <div className="rounded-lg border border-fail-line bg-fail-tint px-4 py-2.5 text-[12px] text-fail">The schedule has {solve.errorCount} blocking issue(s); fix them in the grid to compute resource loading.</div>
        ) : (
          <>
            <div className={`rounded-lg border px-4 py-2.5 text-[12px] ${anyOver ? 'border-fail-line bg-fail-tint text-fail' : 'border-ok-line bg-ok-tint text-ok'}`}>
              {anyOver
                ? <><b>Over-allocation detected.</b> {loads.filter((l) => l.overDays > 0).length} resource(s) exceed their daily availability on one or more days (shown in red below). Re-sequence or level to resolve.</>
                : <>No over-allocation — every resource stays within its daily availability across the schedule.</>}
            </div>

            {/* Summary table */}
            <div className="overflow-x-auto rounded-lg border border-hairline bg-sheet">
              <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-b-[1.5px] border-ink bg-sheet-2">
                    <th className={th}>Resource</th><th className={th}>Type</th>
                    <th className={`${th} text-right`}>Peak/day</th><th className={`${th} text-right`}>Avail/day</th>
                    <th className={`${th} text-right`}>Over days</th><th className={`${th} text-right`}>Total</th><th className={th}>Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {loads.map((l) => (
                    <tr key={l.resource.id} className={`border-b border-hairline-2 ${l.overDays > 0 ? 'bg-fail-tint' : ''}`}>
                      <td className={`${td} font-semibold text-ink`}>{l.resource.name}</td>
                      <td className={td}><span className="rounded px-1.5 py-px text-[10px] font-semibold text-white" style={{ background: TYPE_COLOR[l.resource.type] ?? '#5c6675' }}>{l.resource.type}</span></td>
                      <td className={`${td} text-right font-mono ${l.overDays > 0 ? 'font-semibold text-fail' : 'text-ink'}`}>{n1(l.peak)}</td>
                      <td className={`${td} text-right font-mono text-muted`}>{l.available ?? '—'}</td>
                      <td className={`${td} text-right font-mono ${l.overDays > 0 ? 'font-semibold text-fail' : 'text-faint'}`}>{l.overDays}</td>
                      <td className={`${td} text-right font-mono text-muted`}>{n1(l.total)}</td>
                      <td className={`${td} text-[11px] text-faint`}>{l.resource.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Per-resource histograms */}
            <div className="grid gap-4 lg:grid-cols-2">
              {loads.map((l) => (
                <section key={l.resource.id} className="rounded-lg border border-hairline bg-sheet">
                  <div className="flex items-center justify-between border-b border-hairline-2 px-4 py-2.5">
                    <h2 className="text-[13px] font-bold text-ink">{l.resource.name}</h2>
                    <span className="font-mono text-[10.5px] text-faint">peak {n1(l.peak)} / {l.available ?? '∞'} {l.resource.unit}{l.overDays > 0 && <span className="ml-2 text-fail">· {l.overDays}d over</span>}</span>
                  </div>
                  <div className="p-4"><Histogram load={l} /></div>
                </section>
              ))}
            </div>
            <p className="text-[11px] text-faint">Daily load spreads each activity's assigned quantity evenly over its scheduled working days; bars above the dashed availability line (red) are over-allocated. Assignments and per-day availability are set on the project.</p>
          </>
        )}
      </div>
    </>
  )
}
