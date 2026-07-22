import { useMemo, useState, type JSX } from 'react'
import { useNavigate } from 'react-router-dom'
import type { StructuralModel } from '../engine/model'
import type { StructureDesign } from '../engine/pipeline'
import { buildModelActivities, solveModelSchedule, withDuration, type Trade, type ActivityLink } from '../engine/modelSchedule'
import { findCycle } from '../engine/schedule/cpm'
import type { RelationType } from '../engine/schedule/model'
import { createStore, defaultBackend } from '../engine/schedule/store'
import { modelActivitiesToProject, mergeModelIntoProject } from '../lib/modelToScheduleProject'
import { CriticalPathDiagram } from './CriticalPathDiagram'

const SCHEDULE_ACTIVE_KEY = 'schedule:active'   // mirrors useScheduleProject
const SCHEDULE_LINK_KEY = 'schedule:model-link' // remembers the model's linked project

const REL_TYPES: RelationType[] = ['FS', 'SS', 'FF', 'SF']

const TRADE_COLOR: Record<Trade, string> = {
  sitework: '#a3792e', foundation: '#6b7280', columns: '#0f4c92', floor: '#0f766e', finishes: '#9333ea',
}
const f1 = (v: number) => v.toFixed(1)

/** Auto CPM/PERT construction schedule derived from the designed 3D model, with
 *  a live-editable critical-path diagram. Editing an activity's duration (in the
 *  diagram or the table) re-solves the network so the diagram, mini-Gantt and
 *  activity table all update together. */
export function ConstructionSchedule({ model, design }: { model: StructuralModel; design: StructureDesign }): JSX.Element {
  const navigate = useNavigate()
  const base = useMemo(() => buildModelActivities(model, design), [model, design])
  const [durOverride, setDurOverride] = useState<Record<string, number>>({})
  const [depOverride, setDepOverride] = useState<Record<string, ActivityLink[]>>({})
  const [depErr, setDepErr] = useState<string | null>(null)

  const activities = useMemo(() =>
    (base?.activities ?? []).map((a) => {
      const links = depOverride[a.id] ?? a.predecessors
      const withDeps = links === a.predecessors ? a : { ...a, predecessors: links }
      return durOverride[a.id] != null ? withDuration(withDeps, durOverride[a.id]) : withDeps
    }),
    [base, durOverride, depOverride])
  const solved = useMemo(() => (activities.length ? solveModelSchedule(activities) : null), [activities])

  if (!base || !solved) return <p className="text-sm text-slate-500">Add members to the model to generate a construction schedule.</p>

  const cpm = solved.pert.cpm.activities
  const span = Math.max(1, solved.pert.cpm.duration)
  const crit = new Set(solved.criticalPath)
  const edited = Object.keys(durOverride).length > 0 || Object.keys(depOverride).length > 0
  const setDuration = (id: string, d: number) => setDurOverride((o) => ({ ...o, [id]: d }))
  const resetAll = () => { setDurOverride({}); setDepOverride({}); setDepErr(null) }

  /** Push the (edited) network into the /schedule module. Re-opening UPDATES the
   *  same linked project — refreshing structure while keeping the scheduler-side
   *  calendar, resources, baselines and per-activity actuals — instead of making
   *  a new copy each time. */
  const [linked, setLinked] = useState<boolean>(() => {
    const id = defaultBackend().getItem(SCHEDULE_LINK_KEY)
    return !!(id && createStore(defaultBackend()).exists(id))
  })
  const openInScheduler = () => {
    const backend = defaultBackend()
    const store = createStore(backend)
    const fresh = modelActivitiesToProject(activities, { name: `${model.name || 'Model'} — construction schedule` })
    const linkedId = backend.getItem(SCHEDULE_LINK_KEY)
    const existing = linkedId && store.exists(linkedId) ? store.load(linkedId) : null
    const id = existing && linkedId ? linkedId : `p_${Date.now().toString(36)}`
    store.save(id, existing ? mergeModelIntoProject(existing, fresh) : fresh)
    backend.setItem(SCHEDULE_LINK_KEY, id)
    backend.setItem(SCHEDULE_ACTIVE_KEY, id)
    setLinked(true)
    navigate('/schedule')
  }

  /** Commit a new predecessor list for `id`, unless it creates a cycle. */
  const setLinks = (id: string, links: ActivityLink[]) => {
    const cand = activities.map((a) => (a.id === id ? { ...a, predecessors: links } : a))
    const cyc = findCycle(cand.map((a) => ({ id: a.id, duration: a.duration, predecessors: a.predecessors.map((l) => ({ predecessor: l.id, type: l.type, lag: l.lag })) })))
    if (cyc) { setDepErr(`That link would create a cycle: ${cyc.join(' → ')}`); return }
    setDepErr(null)
    setDepOverride((o) => ({ ...o, [id]: links }))
  }
  const addLink = (id: string, predId: string) => setLinks(id, [...(activities.find((a) => a.id === id)?.predecessors ?? []), { id: predId, type: 'FS', lag: 0 }])
  const patchLink = (id: string, predId: string, patch: Partial<ActivityLink>) =>
    setLinks(id, (activities.find((a) => a.id === id)?.predecessors ?? []).map((l) => (l.id === predId ? { ...l, ...patch } : l)))
  const removeLink = (id: string, predId: string) =>
    setLinks(id, (activities.find((a) => a.id === id)?.predecessors ?? []).filter((l) => l.id !== predId))

  return (
    <div className="mt-6 space-y-4 break-before-page">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-extrabold tracking-tight text-[#0f4c92]">Construction schedule — CPM / PERT</h2>
        <span className="flex items-center gap-3 text-sm text-slate-500">
          <span>auto-derived from the model · {base.frame} frame</span>
          {edited && <button type="button" onClick={resetAll}
            className="no-print rounded border border-slate-300 px-2 py-0.5 text-xs font-semibold text-[#0f4c92] hover:bg-blue-50">↺ reset edits</button>}
          <button type="button" onClick={openInScheduler} title={linked ? 'Refresh the linked scheduler project (keeps calendar, resources, baselines & actuals)' : 'Create a scheduler project from this schedule'}
            className="no-print rounded-md bg-[#0f4c92] px-3 py-1 text-xs font-bold text-white hover:bg-[#0d3f78]">{linked ? 'Update in Scheduler →' : 'Open in Scheduler →'}</button>
        </span>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Expected duration', `${f1(solved.projectDays)} days`],
          ['Std deviation (σ)', `${f1(solved.projectSd)} days`],
          ['P80 finish', `${f1(solved.projectDays + 0.842 * solved.projectSd)} days`],
          ['Activities', `${activities.length} · ${solved.criticalPath.length} critical`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{k}</p>
            <p className="mt-0.5 font-mono text-[15px] font-bold text-[#0f1b2a]">{v}</p>
          </div>
        ))}
      </div>

      {/* Editable critical-path (Activity-on-Node) diagram */}
      <h3 className="text-[1.02rem] font-bold text-[#0f4c92]">Critical-path diagram <span className="font-normal text-slate-400">— editable</span></h3>
      <CriticalPathDiagram activities={activities} cpm={cpm} critical={crit} onEditDuration={setDuration} />

      {/* Mini-Gantt on the working-day axis */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-[1.02rem] font-bold text-[#0f4c92]">Timeline (working days)</h3>
        <div className="space-y-1.5">
          {activities.map((a) => {
            const c = cpm.get(a.id); if (!c) return null
            const left = (c.es / span) * 100, width = Math.max(1.5, (c.duration / span) * 100)
            const isCrit = crit.has(a.id)
            return (
              <div key={a.id} className="flex items-center gap-2 text-[11px]">
                <span className="w-44 shrink-0 truncate text-slate-600" title={a.name}>{a.name}</span>
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
        <p className="mt-2 text-[11px] text-slate-500">Red = critical path (zero float). Bars run early-start → early-finish; overlaps show parallel work.</p>
      </div>

      {/* Activity table — editable duration */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-2 text-[1.02rem] font-bold text-[#0f4c92]">Activity network (CPM / PERT)</h3>
        {depErr && <p className="no-print mb-2 rounded border border-red-300 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700">{depErr}</p>}
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="text-left uppercase tracking-wide text-slate-500">
              <th className="py-1 pr-2 font-semibold">ID</th>
              <th className="py-1 pr-2 font-semibold">Activity</th>
              <th className="py-1 pr-2 font-semibold">Quantity</th>
              <th className="py-1 pr-2 font-semibold">Predecessors</th>
              <th className="py-1 pr-2 text-right font-semibold">Dur</th>
              <th className="py-1 pr-2 text-right font-semibold">ES</th>
              <th className="py-1 pr-2 text-right font-semibold">EF</th>
              <th className="py-1 pr-2 text-right font-semibold">LS</th>
              <th className="py-1 pr-2 text-right font-semibold">LF</th>
              <th className="py-1 pr-2 text-right font-semibold">Float</th>
              <th className="py-1 font-semibold">Critical</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {activities.map((a) => {
              const c = cpm.get(a.id)!
              const isCrit = crit.has(a.id)
              return (
                <tr key={a.id} className={`border-t border-slate-100 ${isCrit ? 'bg-red-50/60' : ''}`}>
                  <td className="py-1 pr-2 font-semibold">{a.id}</td>
                  <td className="py-1 pr-2 font-sans text-slate-700">{a.name}</td>
                  <td className="py-1 pr-2 text-slate-500">{a.quantity} {a.unit}</td>
                  <td className="py-1 pr-2 align-top">
                    <div className="flex flex-col gap-0.5">
                      {a.predecessors.map((l) => (
                        <div key={l.id} className="flex items-center gap-1">
                          <span className="w-12 font-semibold text-slate-600">{l.id}</span>
                          <select value={l.type} onChange={(e) => patchLink(a.id, l.id, { type: e.target.value as RelationType })}
                            className="rounded border border-slate-200 px-0.5 py-px text-[10px]">
                            {REL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <input type="number" value={l.lag} title="lead/lag (days)"
                            onChange={(e) => patchLink(a.id, l.id, { lag: Math.round(+e.target.value || 0) })}
                            className="w-9 rounded border border-slate-200 px-0.5 py-px text-right text-[10px]" />
                          <button type="button" onClick={() => removeLink(a.id, l.id)} title="remove link"
                            className="no-print px-0.5 text-red-500 hover:text-red-700">×</button>
                        </div>
                      ))}
                      <select value="" onChange={(e) => { if (e.target.value) addLink(a.id, e.target.value) }}
                        className="no-print w-24 rounded border border-dashed border-slate-300 px-0.5 py-px text-[10px] text-slate-500">
                        <option value="">+ add…</option>
                        {activities.filter((x) => x.id !== a.id && !a.predecessors.some((l) => l.id === x.id)).map((x) => <option key={x.id} value={x.id}>{x.id}</option>)}
                      </select>
                    </div>
                  </td>
                  <td className="py-1 pr-1 text-right">
                    <input type="number" min={1} value={a.duration}
                      onChange={(e) => setDuration(a.id, Math.max(1, Math.round(+e.target.value || 1)))}
                      className={`w-12 rounded border px-1 py-0.5 text-right ${durOverride[a.id] != null ? 'border-[#0f4c92] bg-blue-50 text-[#0f4c92]' : 'border-slate-200'}`} />
                  </td>
                  <td className="py-1 pr-2 text-right">{c.es}</td>
                  <td className="py-1 pr-2 text-right">{c.ef}</td>
                  <td className="py-1 pr-2 text-right">{c.ls}</td>
                  <td className="py-1 pr-2 text-right">{c.lf}</td>
                  <td className="py-1 pr-2 text-right">{c.totalFloat}</td>
                  <td className={`py-1 font-semibold ${isCrit ? 'text-red-600' : 'text-slate-400'}`}>{isCrit ? '● yes' : 'no'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-slate-500">
          Durations start from crew-productivity rates on the model quantities; edit any <b>Dur</b> (here or on the
          diagram), or add/remove <b>predecessors</b> and change their <b>relation (FS/SS/FF/SF)</b> and <b>lag</b> to
          re-solve the network. ES/EF/LS/LF/float from the CPM passes; expected project duration
          {' '}{f1(solved.projectDays)} days (σ {f1(solved.projectSd)}). Verify crew sizes, procurement and a working calendar for a contractual programme.
        </p>
      </div>
    </div>
  )
}
