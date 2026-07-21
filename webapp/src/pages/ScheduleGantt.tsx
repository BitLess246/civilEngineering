import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Activity, ActivityStatus, ScheduleProject } from '../engine/schedule/model'
import { useScheduleProject } from '../lib/useScheduleProject'
import { useScheduleSolve, type ScheduleSolve } from '../lib/useScheduleSolve'
import { buildScale, buildTicks, ZOOM, ZOOM_LEVELS, type ZoomLevel } from '../lib/gantt'
import { PageHeader } from '../components/calc'

// Phase 5 — Gantt chart at /schedule/gantt. Reads the same store-backed project
// and CPM/date solve as the grid. Status-coloured bars with a %-complete fill,
// critical highlight, milestones, an optional baseline underlay, dependency
// connectors, zoom (day → year) and a data-date line. Drawing-sheet palette.

const LEFT_W = 244
const HEADER_H = 40
const GROUP_H = 24
const ROW_H = 26
const BAR_H = 13
const BASE_H = 4

const btn = 'inline-flex items-center gap-1.5 rounded-md border border-[#d6d3c9] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#3d4a5c] hover:border-[#0f4c92] hover:text-[#0f4c92]'

/** Progress status for colouring (explicit status wins, else from %). */
function statusOf(a: Activity): ActivityStatus {
  if (a.status) return a.status
  const pct = a.percentComplete ?? 0
  return pct >= 100 ? 'completed' : pct > 0 ? 'in-progress' : 'not-started'
}
const STATUS_COLOR: Record<ActivityStatus, string> = {
  completed: '#1a7f4b', 'in-progress': '#0f4c92', delayed: '#b97d10',
  blocked: '#7c3aed', 'not-started': '#94a0ae',
}
const CRITICAL = '#c2402a'

interface Group { key: string; label: string; code: string; acts: Activity[] }
function groupActivities(project: ScheduleProject): Group[] {
  const order: string[] = []
  const map = new Map<string, Group>()
  for (const a of project.activities) {
    const w = a.wbsId ? project.wbs.find((x) => x.id === a.wbsId) : undefined
    const key = a.wbsId ?? ''
    if (!map.has(key)) { map.set(key, { key, label: w?.name ?? 'Unassigned', code: w?.code ?? '', acts: [] }); order.push(key) }
    map.get(key)!.acts.push(a)
  }
  return order.map((k) => map.get(k)!)
}

type Row = { kind: 'group'; label: string; code: string; y: number } | { kind: 'act'; a: Activity; y: number }

function Legend() {
  const item = (c: string, label: string, ring = false) => (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-3 w-4 rounded-[2px]" style={{ background: c, boxShadow: ring ? `0 0 0 1.5px ${CRITICAL}` : undefined }} />
      <span className="text-[11px] text-[#5c6675]">{label}</span>
    </span>
  )
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {item(STATUS_COLOR.completed, 'Completed')}
      {item(STATUS_COLOR['in-progress'], 'In progress')}
      {item(STATUS_COLOR.delayed, 'Delayed')}
      {item(STATUS_COLOR['not-started'], 'Upcoming')}
      {item('#c9c3b4', 'Critical', true)}
      <span className="inline-flex items-center gap-1.5"><span className="text-[#0f1b2a]">◆</span><span className="text-[11px] text-[#5c6675]">Milestone</span></span>
      <span className="inline-flex items-center gap-1.5"><span className="h-3 w-4 rounded-[2px] bg-[#c9c3b4]" /><span className="text-[11px] text-[#5c6675]">Baseline</span></span>
    </div>
  )
}

function GanttChart({ project, solve, zoom, baselineId }: {
  project: ScheduleProject; solve: ScheduleSolve; zoom: ZoomLevel; baselineId: string | null
}) {
  const baseline = baselineId ? project.baselines.find((b) => b.id === baselineId) ?? null : null

  const { rows, rowY, bodyHeight, scale, ticks, todayX } = useMemo(() => {
    const groups = groupActivities(project)
    const rows: Row[] = []
    const rowY = new Map<string, number>()
    let y = 0
    for (const g of groups) {
      rows.push({ kind: 'group', label: g.label, code: g.code, y }); y += GROUP_H
      for (const a of g.acts) { rows.push({ kind: 'act', a, y }); rowY.set(a.id, y); y += ROW_H }
    }
    const bodyHeight = Math.max(y, ROW_H)

    // Frame the timeline over every current + baseline date.
    let minIso = project.meta.start, maxIso = solve.finishDate ?? project.meta.start
    const consider = (iso?: string) => { if (iso) { if (iso < minIso) minIso = iso; if (iso > maxIso) maxIso = iso } }
    for (const d of solve.dates.values()) { consider(d.start); consider(d.finish) }
    if (baseline) for (const e of Object.values(baseline.activities)) { consider(e.start); consider(e.finish) }

    const scale = buildScale(minIso, maxIso, ZOOM[zoom].pxPerDay)
    const ticks = buildTicks(scale, ZOOM[zoom].tick)
    const todayIso = new Date().toISOString().slice(0, 10)
    const off = scale.dayOffset(todayIso)
    const todayX = off >= 0 && off <= scale.totalDays ? off * scale.pxPerDay : null
    return { rows, rowY, bodyHeight, scale, ticks, todayX }
  }, [project, solve, zoom, baseline])

  // Dependency connectors (source edge → target edge, simple elbow).
  const arrows = useMemo(() => {
    const out: { d: string; tx: number; ty: number }[] = []
    for (const a of project.activities) {
      const ad = solve.dates.get(a.id); const ay = rowY.get(a.id)
      if (ad == null || ay == null) continue
      for (const dep of a.predecessors) {
        const pd = solve.dates.get(dep.predecessor); const py = rowY.get(dep.predecessor)
        if (!pd || py == null) continue
        const fromFinish = dep.type === 'FS' || dep.type === 'FF'
        const toStart = dep.type === 'FS' || dep.type === 'SS'
        const sx = fromFinish ? scale.x(pd.finish) + scale.barWidth(pd.start, pd.finish) : scale.x(pd.start)
        const tx = toStart ? scale.x(ad.start) : scale.x(ad.finish) + scale.barWidth(ad.start, ad.finish)
        const sy = py + ROW_H / 2, ty = ay + ROW_H / 2
        const midx = Math.max(sx + 8, tx - 12)
        out.push({ d: `M ${sx} ${sy} H ${midx} V ${ty} H ${tx}`, tx, ty })
      }
    }
    return out
  }, [project, solve, rowY, scale])

  const gridLines = ticks.map((t, i) => (
    <line key={i} x1={t.x} y1={0} x2={t.x} y2={bodyHeight} stroke={t.major ? '#e3e1da' : '#f1efe8'} strokeWidth={1} />
  ))

  return (
    <div className="flex overflow-hidden rounded-lg border border-[#e3e1da] bg-white">
      {/* Left: activity names */}
      <div className="flex-none border-r border-[#e3e1da]" style={{ width: LEFT_W }}>
        <div className="flex items-end border-b border-[#eeece5] bg-[#f9f8f4] px-3 pb-1.5 text-[9.5px] font-bold uppercase tracking-widest text-[#5c6675]" style={{ height: HEADER_H }}>Activity</div>
        <div className="relative" style={{ height: bodyHeight }}>
          {rows.map((r, i) => r.kind === 'group' ? (
            <div key={i} className="absolute flex w-full items-center gap-1.5 bg-[#f4f3ef] px-3 text-[11.5px] font-bold text-[#0f1b2a]" style={{ top: r.y, height: GROUP_H }}>
              <span className="font-mono text-[10px] text-[#a39d8d]">{r.code}</span>{r.label}
            </div>
          ) : (
            <div key={i} className="absolute flex w-full items-center gap-1.5 px-3" style={{ top: r.y, height: ROW_H }}>
              <span className="truncate text-[12px] text-[#0f1b2a]">{r.a.name}</span>
              {solve.cpm?.activities.get(r.a.id)?.critical && <span className="flex-none rounded bg-[#c2402a] px-1 font-mono text-[8px] font-bold text-white">C</span>}
              <span className="ml-auto flex-none font-mono text-[10px] text-[#a39d8d]">{r.a.milestone ? '◆' : `${r.a.percentComplete ?? 0}%`}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right: timeline */}
      <div className="flex-1 overflow-x-auto">
        <div style={{ width: scale.totalWidth }}>
          {/* tick header */}
          <div className="relative border-b border-[#eeece5] bg-[#f9f8f4]" style={{ height: HEADER_H }}>
            {ticks.map((t, i) => (
              <div key={i} className={`absolute top-0 h-full border-l ${t.major ? 'border-[#d6d3c9]' : 'border-[#eeece5]'}`} style={{ left: t.x }}>
                <span className={`ml-1 text-[10px] ${t.major ? 'font-semibold text-[#3d4a5c]' : 'text-[#a39d8d]'}`}>{t.label}</span>
              </div>
            ))}
          </div>
          {/* body */}
          <div className="relative" style={{ height: bodyHeight }}>
            <svg className="pointer-events-none absolute inset-0" width={scale.totalWidth} height={bodyHeight}>
              {gridLines}
              {arrows.map((a, i) => (
                <g key={i}>
                  <path d={a.d} fill="none" stroke="#b7b0a0" strokeWidth={1} />
                  <path d={`M ${a.tx - 4} ${a.ty - 3} L ${a.tx} ${a.ty} L ${a.tx - 4} ${a.ty + 3}`} fill="#b7b0a0" />
                </g>
              ))}
              {todayX != null && <line x1={todayX} y1={0} x2={todayX} y2={bodyHeight} stroke="#0f4c92" strokeWidth={1} strokeDasharray="3 3" />}
            </svg>
            {rows.filter((r): r is Extract<Row, { kind: 'act' }> => r.kind === 'act').map((r) => {
              const d = solve.dates.get(r.a.id)
              if (!d) return null
              const critical = solve.cpm?.activities.get(r.a.id)?.critical ?? false
              const cy = r.y + (ROW_H - BAR_H) / 2
              if (r.a.milestone) {
                const mx = scale.x(d.start)
                return <div key={r.a.id} className="absolute" title={`${r.a.name} — ${d.start}`}
                  style={{ left: mx - BAR_H / 2, top: cy, width: BAR_H, height: BAR_H, background: '#0f1b2a', transform: 'rotate(45deg)' }} />
              }
              const left = scale.x(d.start), width = scale.barWidth(d.start, d.finish)
              const color = STATUS_COLOR[statusOf(r.a)]
              const pct = Math.min(100, Math.max(0, r.a.percentComplete ?? 0))
              return (
                <div key={r.a.id}>
                  {baseline?.activities[r.a.id] && (
                    <div className="absolute rounded-[2px] bg-[#c9c3b4]" title="Baseline"
                      style={{ left: scale.x(baseline.activities[r.a.id].start), top: cy + BAR_H, width: scale.barWidth(baseline.activities[r.a.id].start, baseline.activities[r.a.id].finish), height: BASE_H }} />
                  )}
                  <div className="absolute overflow-hidden rounded-[3px]" title={`${r.a.name}  ${d.start} → ${d.finish}  ${pct}%`}
                    style={{ left, top: cy, width, height: BAR_H, background: `${color}59`, boxShadow: critical ? `0 0 0 1.5px ${CRITICAL}` : `inset 0 0 0 1px ${color}` }}>
                    <div className="h-full rounded-l-[3px]" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ScheduleGantt() {
  const api = useScheduleProject()
  const solve = useScheduleSolve(api.project)
  const [zoom, setZoom] = useState<ZoomLevel>('week')
  const [baselineId, setBaselineId] = useState<string | null>(null)
  const project = api.project

  const actions = project && (
    <div className="flex flex-wrap items-center gap-2">
      {project.baselines.length > 0 && (
        <select value={baselineId ?? ''} onChange={(e) => setBaselineId(e.target.value || null)}
          className="rounded-md border border-[#d6d3c9] bg-white px-2 py-1.5 text-[12px]">
          <option value="">No baseline</option>
          {project.baselines.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      )}
      <div className="flex overflow-hidden rounded-md border border-[#d6d3c9]">
        {ZOOM_LEVELS.map((z) => (
          <button key={z} type="button" onClick={() => setZoom(z)}
            className={`px-2 py-1.5 text-[11.5px] font-semibold capitalize ${z === zoom ? 'bg-[#0f4c92] text-white' : 'bg-white text-[#3d4a5c] hover:bg-[#f1efe8]'}`}>{z}</button>
        ))}
      </div>
      <Link to="/schedule" className={btn}>Grid</Link>
    </div>
  )

  return (
    <>
      <PageHeader title="Gantt Chart" badges={['CPM', 'baseline', 'progress']} actions={actions ?? undefined} />
      <div className="mx-auto max-w-[1400px] space-y-4 p-5 sm:p-7">
        {!project ? (
          <div className="rounded-lg border border-dashed border-[#d6d3c9] bg-white px-6 py-16 text-center">
            <h2 className="text-[16px] font-bold text-[#0f1b2a]">No schedule open</h2>
            <p className="mt-1 text-[13px] text-[#7a7568]">Open or create a project in the grid first.</p>
            <Link to="/schedule" className="mt-4 inline-flex rounded-md bg-[#0f4c92] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#0d3f78]">Go to the schedule grid</Link>
          </div>
        ) : project.activities.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#d6d3c9] bg-white px-6 py-16 text-center text-[13px] text-[#a39d8d]">No activities to chart — add some in the grid.</div>
        ) : (
          <>
            <Legend />
            {!solve.ok && <div className="rounded-lg border border-[#efd9cc] bg-[#fdf3ee] px-4 py-2.5 text-[12px] text-[#8f4a2f]">The schedule has {solve.errorCount} blocking issue(s); fix them in the grid to chart the timeline.</div>}
            {solve.ok && <GanttChart project={project} solve={solve} zoom={zoom} baselineId={baselineId} />}
            <p className="text-[11px] text-[#a39d8d]">Bars run start → finish on the working calendar; the darker fill is % complete. Critical bars carry a red outline; the dashed blue line is today. Connectors show predecessor links.</p>
          </>
        )}
      </div>
    </>
  )
}
