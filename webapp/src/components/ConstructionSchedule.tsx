import { useMemo, type JSX } from 'react'
import type { StructuralModel } from '../engine/model'
import type { StructureDesign } from '../engine/pipeline'
import { buildModelSchedule, type Trade } from '../engine/modelSchedule'

const TRADE_COLOR: Record<Trade, string> = {
  sitework: '#a3792e', foundation: '#6b7280', columns: '#0f4c92', floor: '#0f766e',
}
const f1 = (v: number) => v.toFixed(1)

/** Auto CPM/PERT construction schedule derived from the designed 3D model:
 *  summary metrics, a mini-Gantt on the working-day axis, and the activity
 *  table (quantity, O/M/P, ES/EF, total float, critical). */
export function ConstructionSchedule({ model, design }: { model: StructuralModel; design: StructureDesign }): JSX.Element {
  const sch = useMemo(() => buildModelSchedule(model, design), [model, design])
  if (!sch) return <p className="text-sm text-slate-500">Add members to the model to generate a construction schedule.</p>

  const cpm = sch.pert.cpm.activities
  const span = Math.max(1, sch.pert.cpm.duration)
  const crit = new Set(sch.criticalPath)

  return (
    <div className="mt-6 space-y-4 break-before-page">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-extrabold tracking-tight text-[#0f4c92]">Construction schedule — CPM / PERT</h2>
        <span className="text-sm text-slate-500">auto-derived from the model · {sch.frame} frame</span>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Expected duration', `${f1(sch.projectDays)} days`],
          ['Std deviation (σ)', `${f1(sch.projectSd)} days`],
          ['P80 finish', `${f1(sch.projectDays + 0.842 * sch.projectSd)} days`],
          ['Activities', `${sch.activities.length} · ${sch.criticalPath.length} critical`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{k}</p>
            <p className="mt-0.5 font-mono text-[15px] font-bold text-[#0f1b2a]">{v}</p>
          </div>
        ))}
      </div>

      {/* Mini-Gantt on the working-day axis */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-[1.02rem] font-bold text-[#0f4c92]">Timeline (working days)</h3>
        <div className="space-y-1.5">
          {sch.activities.map((a) => {
            const c = cpm.get(a.id)
            if (!c) return null
            const left = (c.es / span) * 100, width = Math.max(1.5, (c.duration / span) * 100)
            const isCrit = crit.has(a.id)
            return (
              <div key={a.id} className="flex items-center gap-2 text-[11px]">
                <span className="w-40 shrink-0 truncate text-slate-600" title={a.name}>{a.name}</span>
                <div className="relative h-4 flex-1 rounded bg-slate-50">
                  <div className="absolute top-0 h-4 rounded" style={{
                    left: `${left}%`, width: `${width}%`,
                    background: isCrit ? '#c2402a' : TRADE_COLOR[a.trade], opacity: isCrit ? 0.95 : 0.8,
                  }} title={`${a.name}: day ${c.es}–${c.ef}`} />
                </div>
                <span className="w-14 shrink-0 text-right font-mono text-slate-500">{c.es}–{c.ef}</span>
              </div>
            )
          })}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Red = critical path (zero float). Bars run from early-start to early-finish on the working-day axis.
        </p>
      </div>

      {/* Activity table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Activity network (CPM / PERT)</h3>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="text-left uppercase tracking-wide text-slate-500">
              <th className="py-1 pr-2 font-semibold">ID</th>
              <th className="py-1 pr-2 font-semibold">Activity</th>
              <th className="py-1 pr-2 font-semibold">Quantity</th>
              <th className="py-1 pr-2 font-semibold">Pred.</th>
              <th className="py-1 pr-2 text-right font-semibold">O / M / P</th>
              <th className="py-1 pr-2 text-right font-semibold">TE</th>
              <th className="py-1 pr-2 text-right font-semibold">ES</th>
              <th className="py-1 pr-2 text-right font-semibold">EF</th>
              <th className="py-1 pr-2 text-right font-semibold">Float</th>
              <th className="py-1 font-semibold">Critical</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {sch.activities.map((a) => {
              const c = cpm.get(a.id)!
              const te = sch.pert.activities.get(a.id)!.te
              const isCrit = crit.has(a.id)
              return (
                <tr key={a.id} className={`border-t border-slate-100 ${isCrit ? 'bg-red-50/60' : ''}`}>
                  <td className="py-1 pr-2 font-semibold">{a.id}</td>
                  <td className="py-1 pr-2 font-sans text-slate-700">{a.name}</td>
                  <td className="py-1 pr-2 text-slate-500">{a.quantity} {a.unit}</td>
                  <td className="py-1 pr-2 text-slate-500">{a.predecessors.join(', ') || '—'}</td>
                  <td className="py-1 pr-2 text-right">{a.o}/{a.m}/{a.p}</td>
                  <td className="py-1 pr-2 text-right font-semibold">{f1(te)}</td>
                  <td className="py-1 pr-2 text-right">{c.es}</td>
                  <td className="py-1 pr-2 text-right">{c.ef}</td>
                  <td className="py-1 pr-2 text-right">{c.totalFloat}</td>
                  <td className={`py-1 font-semibold ${isCrit ? 'text-red-600' : 'text-slate-400'}`}>{isCrit ? '● yes' : 'no'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-slate-500">
          Durations from crew-productivity rates on the model quantities; TE = (O + 4M + P)/6. ES/EF/float from the
          CPM forward/backward pass; expected project duration {f1(sch.projectDays)} days (σ {f1(sch.projectSd)}).
          Verify crew sizes, procurement lead times and calendar/holidays for a contractual programme.
        </p>
      </div>
    </div>
  )
}
