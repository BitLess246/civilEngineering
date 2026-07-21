import { useRef, useState } from 'react'
import type { Activity, RelationType, ScheduleProject } from '../engine/schedule/model'
import { wouldCreateCycle } from '../engine/schedule/cpm'
import { useScheduleProject } from '../lib/useScheduleProject'
import { useScheduleSolve, type ScheduleSolve } from '../lib/useScheduleSolve'
import { PageHeader } from '../components/calc'

// Phase 4 — WBS + activity grid. Edits flow through useScheduleProject (store-
// backed, auto-saved); CPM/validation/dates come from useScheduleSolve and
// recompute live. Separate /schedule/* routes share the same project via the
// store. Design system: drawing-sheet palette (docs/design/uiux-2026-07).

const REL: RelationType[] = ['FS', 'SS', 'FF', 'SF']

const btn = 'inline-flex items-center gap-1.5 rounded-md border border-[#d6d3c9] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#3d4a5c] hover:border-[#0f4c92] hover:text-[#0f4c92]'
const btnPrimary = 'inline-flex items-center gap-1.5 rounded-md bg-[#0f4c92] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#0d3f78]'

function fmtLag(lag: number): string {
  return lag === 0 ? '' : lag > 0 ? `+${lag}` : `${lag}`
}

// ── Inline editors ──────────────────────────────────────────────────────────
function TextInput({ value, onChange, placeholder, mono }: {
  value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean
}) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className={`w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-[12.5px] text-[#0f1b2a] hover:border-[#e3e1da] focus:border-[#0f4c92] focus:bg-white ${mono ? 'font-mono' : ''}`} />
  )
}
function NumInput({ value, onChange, min = 0, step = 1, w = 'w-16' }: {
  value: number; onChange: (v: number) => void; min?: number; step?: number; w?: string
}) {
  return (
    <input type="number" min={min} step={step} value={value}
      onChange={(e) => { const n = parseFloat(e.target.value); onChange(Number.isFinite(n) ? n : 0) }}
      className={`${w} rounded border border-[#e3e1da] px-1.5 py-1 text-right font-mono text-[12px] text-[#0f1b2a] focus:border-[#0f4c92]`} />
  )
}

// ── Dependency editor (cycle-prevented) ─────────────────────────────────────
function DependencyEditor({ project, activity, update }: {
  project: ScheduleProject; activity: Activity; update: (m: (d: ScheduleProject) => void) => void
}) {
  const [pred, setPred] = useState('')
  const [type, setType] = useState<RelationType>('FS')
  const [lag, setLag] = useState(0)

  const nameOf = (id: string) => project.activities.find((a) => a.id === id)?.name ?? id
  const existing = new Set(activity.predecessors.map((p) => p.predecessor))
  const candidates = project.activities.filter(
    (a) => a.id !== activity.id && !existing.has(a.id) && !wouldCreateCycle(project.activities, activity.id, a.id),
  )

  const add = () => {
    if (!pred) return
    update((d) => {
      const act = d.activities.find((a) => a.id === activity.id)
      if (act && !act.predecessors.some((p) => p.predecessor === pred)) {
        act.predecessors.push({ predecessor: pred, type, lag })
      }
    })
    setPred(''); setType('FS'); setLag(0)
  }
  const remove = (predId: string) => update((d) => {
    const act = d.activities.find((a) => a.id === activity.id)
    if (act) act.predecessors = act.predecessors.filter((p) => p.predecessor !== predId)
  })

  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-[#a39d8d]">Predecessors</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {activity.predecessors.length === 0 && <span className="text-[11.5px] text-[#a39d8d]">None — starts at project start.</span>}
        {activity.predecessors.map((p) => (
          <span key={p.predecessor} className="inline-flex items-center gap-1 rounded border border-[#cddcf0] bg-[#eaf1f9] px-1.5 py-0.5 text-[11px] text-[#0f4c92]">
            <span className="font-semibold">{nameOf(p.predecessor)}</span>
            <span className="font-mono">{p.type}{fmtLag(p.lag)}</span>
            <button type="button" onClick={() => remove(p.predecessor)} className="ml-0.5 text-[#0f4c92]/60 hover:text-[#c2402a]" aria-label="remove">×</button>
          </span>
        ))}
      </div>
      {candidates.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <select value={pred} onChange={(e) => setPred(e.target.value)}
            className="rounded border border-[#e3e1da] px-1.5 py-1 text-[12px]">
            <option value="">+ add predecessor…</option>
            {candidates.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value as RelationType)}
            className="rounded border border-[#e3e1da] px-1.5 py-1 font-mono text-[12px]">
            {REL.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <label className="flex items-center gap-1 text-[11px] text-[#5c6675]">lag <NumInput value={lag} onChange={setLag} min={-999} w="w-14" /></label>
          <button type="button" onClick={add} disabled={!pred} className={`${btn} disabled:opacity-40`}>Add</button>
        </div>
      )}
    </div>
  )
}

// ── Expanded per-activity editor ────────────────────────────────────────────
function ActivityDetail({ project, activity, solve, update }: {
  project: ScheduleProject; activity: Activity; solve: ScheduleSolve; update: (m: (d: ScheduleProject) => void) => void
}) {
  const c = solve.cpm?.activities.get(activity.id)
  const set = (patch: Partial<Activity>) => update((d) => {
    const act = d.activities.find((a) => a.id === activity.id)
    if (act) Object.assign(act, patch)
  })
  const cpmCell = (label: string, v: number | undefined) => (
    <div className="rounded border border-[#eeece5] bg-[#f9f8f4] px-2 py-1">
      <p className="text-[9px] font-semibold uppercase tracking-widest text-[#a39d8d]">{label}</p>
      <p className="font-mono text-[12.5px] font-semibold text-[#0f1b2a]">{v ?? '—'}</p>
    </div>
  )
  return (
    <div className="grid gap-4 border-t border-[#eeece5] bg-[#fcfbf8] px-4 py-3.5 lg:grid-cols-[1.1fr_1fr]">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="flex flex-col text-[11px] text-[#5c6675]">WBS
            <select value={activity.wbsId ?? ''} onChange={(e) => set({ wbsId: e.target.value || undefined })}
              className="mt-0.5 rounded border border-[#e3e1da] px-1.5 py-1 text-[12px] text-[#0f1b2a]">
              <option value="">— none —</option>
              {project.wbs.map((w) => <option key={w.id} value={w.id}>{w.code ? `${w.code} ` : ''}{w.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col text-[11px] text-[#5c6675]">Responsible
            <TextInput value={activity.responsible ?? ''} onChange={(v) => set({ responsible: v || undefined })} placeholder="Engineer" />
          </label>
          <label className="flex flex-col text-[11px] text-[#5c6675]">Milestone
            <select value={activity.milestone ? 'yes' : 'no'} onChange={(e) => set({ milestone: e.target.value === 'yes', duration: e.target.value === 'yes' ? 0 : activity.duration || 1 })}
              className="mt-0.5 rounded border border-[#e3e1da] px-1.5 py-1 text-[12px] text-[#0f1b2a]">
              <option value="no">No</option><option value="yes">Yes (0 d)</option>
            </select>
          </label>
        </div>
        <label className="flex flex-col text-[11px] text-[#5c6675]">Remarks
          <TextInput value={activity.remarks ?? ''} onChange={(v) => set({ remarks: v || undefined })} placeholder="Notes…" />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="flex flex-col text-[11px] text-[#5c6675]">Optimistic (O)
            <NumInput value={activity.optimistic ?? activity.duration} onChange={(v) => set({ optimistic: v })} w="w-full" /></label>
          <label className="flex flex-col text-[11px] text-[#5c6675]">Most likely (M)
            <NumInput value={activity.mostLikely ?? activity.duration} onChange={(v) => set({ mostLikely: v })} w="w-full" /></label>
          <label className="flex flex-col text-[11px] text-[#5c6675]">Pessimistic (P)
            <NumInput value={activity.pessimistic ?? activity.duration} onChange={(v) => set({ pessimistic: v })} w="w-full" /></label>
        </div>
      </div>
      <div className="space-y-3">
        <DependencyEditor project={project} activity={activity} update={update} />
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-[#a39d8d]">CPM (working days)</p>
          <div className="grid grid-cols-3 gap-1.5">
            {cpmCell('ES', c?.es)}{cpmCell('EF', c?.ef)}{cpmCell('LS', c?.ls)}
            {cpmCell('LF', c?.lf)}{cpmCell('Total float', c?.totalFloat)}{cpmCell('Free float', c?.freeFloat)}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Activity grid ───────────────────────────────────────────────────────────
function ActivityGrid({ project, solve, update }: {
  project: ScheduleProject; solve: ScheduleSolve; update: (m: (d: ScheduleProject) => void) => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // Group activities by WBS, preserving project.activities order within a group.
  const groupName = (wbsId: string | undefined) => {
    if (!wbsId) return { key: '', label: 'Unassigned', code: '~' }
    const w = project.wbs.find((x) => x.id === wbsId)
    return { key: wbsId, label: w?.name ?? wbsId, code: w?.code ?? '' }
  }
  const order: string[] = []
  const groups = new Map<string, { label: string; code: string; acts: Activity[] }>()
  for (const a of project.activities) {
    const g = groupName(a.wbsId)
    if (!groups.has(g.key)) { groups.set(g.key, { label: g.label, code: g.code, acts: [] }); order.push(g.key) }
    groups.get(g.key)!.acts.push(a)
  }

  const move = (id: string, dir: -1 | 1) => update((d) => {
    const i = d.activities.findIndex((a) => a.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= d.activities.length) return
    ;[d.activities[i], d.activities[j]] = [d.activities[j], d.activities[i]]
  })
  const del = (id: string) => update((d) => {
    d.activities = d.activities.filter((a) => a.id !== id)
    for (const a of d.activities) a.predecessors = a.predecessors.filter((p) => p.predecessor !== id)
  })
  const toggleGroup = (key: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n })

  const th = 'px-2.5 py-2 text-left text-[9.5px] font-bold uppercase tracking-widest text-[#5c6675]'
  const td = 'px-2.5 py-1.5 align-middle'

  return (
    <div className="overflow-x-auto rounded-lg border border-[#e3e1da] bg-white">
      <table className="w-full min-w-[860px] border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b-[1.5px] border-[#0f1b2a] bg-[#f9f8f4]">
            <th className={th} style={{ width: 28 }}></th>
            <th className={th}>ID</th>
            <th className={`${th} min-w-[200px]`}>Activity</th>
            <th className={`${th} text-right`}>Dur</th>
            <th className={th}>Predecessors</th>
            <th className={`${th} text-right`}>% </th>
            <th className={th}>Start</th>
            <th className={th}>Finish</th>
            <th className={`${th} text-right`}>Float</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody>
          {order.map((key) => {
            const g = groups.get(key)!
            const isCollapsed = collapsed.has(key)
            return (
              <FragmentGroup key={key || 'unassigned'}>
                <tr className="border-b border-[#eeece5] bg-[#f4f3ef]">
                  <td className={td}>
                    <button type="button" onClick={() => toggleGroup(key)} className="text-[#7a7568] hover:text-[#0f1b2a]" aria-label="collapse">
                      {isCollapsed ? '▸' : '▾'}
                    </button>
                  </td>
                  <td className={`${td} font-mono text-[11px] text-[#a39d8d]`}>{g.code}</td>
                  <td className={`${td} font-bold text-[#0f1b2a]`} colSpan={8}>{g.label} <span className="ml-1 font-normal text-[#a39d8d]">({g.acts.length})</span></td>
                </tr>
                {!isCollapsed && g.acts.map((a) => {
                  const c = solve.cpm?.activities.get(a.id)
                  const dates = solve.dates.get(a.id)
                  const critical = c?.critical
                  const isOpen = open === a.id
                  return (
                    <FragmentGroup key={a.id}>
                      <tr className={`border-b border-[#f1efe8] ${critical ? 'bg-[#fdf3f0]' : 'hover:bg-[#faf9f5]'}`}>
                        <td className={td}>
                          <button type="button" onClick={() => setOpen(isOpen ? null : a.id)} className="text-[#7a7568] hover:text-[#0f4c92]" aria-label="expand">{isOpen ? '▾' : '▸'}</button>
                        </td>
                        <td className={`${td} font-mono text-[11px] text-[#5c6675]`}>{a.id}</td>
                        <td className={td}>
                          <div className="flex items-center gap-1.5">
                            <TextInput value={a.name} onChange={(v) => update((d) => { const x = d.activities.find((y) => y.id === a.id); if (x) x.name = v })} />
                            {critical && <span className="flex-none rounded bg-[#c2402a] px-1 py-px font-mono text-[9px] font-semibold text-white">CRIT</span>}
                            {a.milestone && <span className="flex-none rounded bg-[#0f1b2a] px-1 py-px font-mono text-[9px] font-semibold text-white">◆</span>}
                          </div>
                        </td>
                        <td className={`${td} text-right`}><NumInput value={a.duration} onChange={(v) => update((d) => { const x = d.activities.find((y) => y.id === a.id); if (x) x.duration = v })} /></td>
                        <td className={`${td} font-mono text-[10.5px] text-[#5c6675]`}>
                          {a.predecessors.length === 0 ? <span className="text-[#c8c2b4]">—</span>
                            : a.predecessors.map((p) => `${p.predecessor}${p.type !== 'FS' || p.lag ? ` ${p.type}${fmtLag(p.lag)}` : ''}`).join(', ')}
                        </td>
                        <td className={`${td} text-right`}>
                          <input type="number" min={0} max={100} value={a.percentComplete ?? 0}
                            onChange={(e) => { const n = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)); update((d) => { const x = d.activities.find((y) => y.id === a.id); if (x) x.percentComplete = n }) }}
                            className="w-14 rounded border border-[#e3e1da] px-1 py-1 text-right font-mono text-[12px]" />
                        </td>
                        <td className={`${td} whitespace-nowrap font-mono text-[11px] text-[#5c6675]`}>{dates?.start ?? '—'}</td>
                        <td className={`${td} whitespace-nowrap font-mono text-[11px] text-[#5c6675]`}>{dates?.finish ?? '—'}</td>
                        <td className={`${td} text-right font-mono text-[11.5px] ${critical ? 'font-semibold text-[#c2402a]' : 'text-[#5c6675]'}`}>{c ? c.totalFloat : '—'}</td>
                        <td className={`${td} whitespace-nowrap text-right`}>
                          <button type="button" onClick={() => move(a.id, -1)} className="px-1 text-[#a39d8d] hover:text-[#0f1b2a]" aria-label="up">▲</button>
                          <button type="button" onClick={() => move(a.id, 1)} className="px-1 text-[#a39d8d] hover:text-[#0f1b2a]" aria-label="down">▼</button>
                          <button type="button" onClick={() => del(a.id)} className="px-1 text-[#a39d8d] hover:text-[#c2402a]" aria-label="delete">✕</button>
                        </td>
                      </tr>
                      {isOpen && <tr><td colSpan={10} className="p-0"><ActivityDetail project={project} activity={a} solve={solve} update={update} /></td></tr>}
                    </FragmentGroup>
                  )
                })}
              </FragmentGroup>
            )
          })}
          {project.activities.length === 0 && (
            <tr><td colSpan={10} className="px-4 py-8 text-center text-[13px] text-[#a39d8d]">No activities yet — add one to start scheduling.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// A keyed fragment wrapper (React fragments can't take a key inline in .map easily here).
function FragmentGroup({ children }: { children: React.ReactNode }) { return <>{children}</> }

// ── Summary + validation ────────────────────────────────────────────────────
function Summary({ project, solve }: { project: ScheduleProject; solve: ScheduleSolve }) {
  const stat = (label: string, value: string, tone?: 'ok' | 'bad') => (
    <div className="rounded-lg border border-[#e3e1da] bg-white px-3.5 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a39d8d]">{label}</p>
      <p className={`mt-0.5 font-mono text-[16px] font-semibold ${tone === 'bad' ? 'text-[#c2402a]' : tone === 'ok' ? 'text-[#14603a]' : 'text-[#0f1b2a]'}`}>{value}</p>
    </div>
  )
  const criticalCount = solve.cpm ? solve.cpm.criticalPath.length : 0
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
      {stat('Duration', solve.ok ? `${solve.duration} d` : '—')}
      {stat('Start', project.meta.start)}
      {stat('Finish', solve.finishDate ?? '—')}
      {stat('Activities', String(project.activities.length))}
      {stat('Critical', String(criticalCount))}
      {solve.errorCount > 0
        ? stat('Status', `${solve.errorCount} error${solve.errorCount > 1 ? 's' : ''}`, 'bad')
        : stat('Status', solve.warningCount > 0 ? `${solve.warningCount} warning${solve.warningCount > 1 ? 's' : ''}` : 'Valid', solve.warningCount > 0 ? undefined : 'ok')}
    </div>
  )
}

function ValidationPanel({ solve }: { solve: ScheduleSolve }) {
  if (solve.issues.length === 0) return null
  return (
    <div className="rounded-lg border border-[#efd9cc] bg-[#fdf3ee] px-4 py-3">
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-[#8f4a2f]">Validation</p>
      <ul className="space-y-1">
        {solve.issues.map((i, k) => (
          <li key={k} className="flex items-start gap-2 text-[12px]">
            <span className={`mt-px flex-none rounded px-1 py-px font-mono text-[9px] font-semibold ${i.severity === 'error' ? 'bg-[#fbeeea] text-[#c2402a]' : 'bg-[#fdf0d8] text-[#b97d10]'}`}>{i.severity === 'error' ? 'ERR' : 'WARN'}</span>
            <span className="text-[#5c6675]">{i.message}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Project bar (new / sample / import / export / switch) ────────────────────
function ProjectBar({ api }: { api: ReturnType<typeof useScheduleProject> }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState<string | null>(null)

  const onImport = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try { api.importJSON(String(reader.result)); setErr(null) }
      catch (e) { setErr(e instanceof Error ? e.message : 'Import failed.') }
    }
    reader.readAsText(file)
  }
  const onExport = () => {
    const json = api.exportJSON(); if (!json) return
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${(api.project?.meta.name ?? 'schedule').replace(/\s+/g, '-').toLowerCase()}.json`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {api.projects.length > 0 && (
        <select value={api.activeId ?? ''} onChange={(e) => api.open(e.target.value)}
          className="rounded-md border border-[#d6d3c9] bg-white px-2 py-1.5 text-[12px] text-[#0f1b2a]">
          {api.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      <button type="button" onClick={() => api.newProject()} className={btn}>New</button>
      <button type="button" onClick={() => api.loadSample()} className={btn}>Load sample</button>
      <button type="button" onClick={() => fileRef.current?.click()} className={btn}>Import</button>
      <button type="button" onClick={onExport} className={btn}>Export</button>
      <input ref={fileRef} type="file" accept=".json,application/json" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = '' }} />
      {err && <span className="text-[11px] text-[#c2402a]">{err}</span>}
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function Schedule() {
  const api = useScheduleProject()
  const solve = useScheduleSolve(api.project)
  const { project, update } = api

  const addActivity = () => update((d) => {
    let n = d.activities.length + 1
    while (d.activities.some((a) => a.id === `A${n}`)) n++
    d.activities.push({ id: `A${n}`, name: 'New activity', duration: 1, unit: 'days', predecessors: [] })
  })

  return (
    <>
      <PageHeader title="Project Schedule" badges={['CPM', 'PERT', 'EVM']} actions={<ProjectBar api={api} />} />
      <div className="mx-auto max-w-[1400px] space-y-5 p-5 sm:p-7">
        {!project ? (
          <div className="rounded-lg border border-dashed border-[#d6d3c9] bg-white px-6 py-16 text-center">
            <h2 className="text-[16px] font-bold text-[#0f1b2a]">No schedule open</h2>
            <p className="mt-1 text-[13px] text-[#7a7568]">Start a new project, load the worked sample, or import a JSON file.</p>
            <div className="mt-4 flex justify-center gap-2">
              <button type="button" onClick={() => api.loadSample()} className={btnPrimary}>Load sample project</button>
              <button type="button" onClick={() => api.newProject()} className={btn}>New blank project</button>
            </div>
          </div>
        ) : (
          <>
            <section className="rounded-lg border border-[#e3e1da] bg-white p-4">
              <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                <label className="flex min-w-[220px] flex-1 flex-col text-[11px] font-semibold uppercase tracking-widest text-[#a39d8d]">Project
                  <input value={project.meta.name} onChange={(e) => api.rename(e.target.value)}
                    className="mt-0.5 border-0 bg-transparent p-0 text-[18px] font-extrabold tracking-tight text-[#0f1b2a] shadow-none focus:ring-0" />
                </label>
                {(['client', 'contractor', 'engineer'] as const).map((k) => (
                  <label key={k} className="flex flex-col text-[10px] font-semibold uppercase tracking-widest text-[#a39d8d]">{k}
                    <input value={project.meta[k] ?? ''} onChange={(e) => update((d) => { d.meta[k] = e.target.value || undefined })}
                      placeholder="—" className="mt-0.5 w-40 rounded border border-[#e3e1da] px-2 py-1 text-[12.5px] font-normal normal-case tracking-normal text-[#0f1b2a]" />
                  </label>
                ))}
                <label className="flex flex-col text-[10px] font-semibold uppercase tracking-widest text-[#a39d8d]">Start date
                  <input type="date" value={project.meta.start} onChange={(e) => update((d) => { d.meta.start = e.target.value })}
                    className="mt-0.5 rounded border border-[#e3e1da] px-2 py-1 font-mono text-[12.5px] font-normal tracking-normal text-[#0f1b2a]" />
                </label>
              </div>
            </section>

            <Summary project={project} solve={solve} />
            <ValidationPanel solve={solve} />

            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-bold text-[#0f1b2a]">Activities &amp; WBS</h2>
              <button type="button" onClick={addActivity} className={btnPrimary}>＋ Add activity</button>
            </div>
            <ActivityGrid project={project} solve={solve} update={update} />

            <p className="text-[11px] text-[#a39d8d]">
              Critical activities (zero total float) are tinted and tagged <span className="rounded bg-[#c2402a] px-1 py-px font-mono text-[9px] font-semibold text-white">CRIT</span>.
              Expand a row for the dependency editor and full CPM (ES/EF/LS/LF, floats). Edits auto-save and recompute live.
            </p>
          </>
        )}
      </div>
    </>
  )
}
