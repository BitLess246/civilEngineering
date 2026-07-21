import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { ScheduleProject, WorkingCalendar } from '../engine/schedule/model'
import { projectProgress } from '../engine/schedule/progress'
import { earnedValue, type EvmActivityInput } from '../engine/schedule/earnedValue'
import { plannedCurve } from '../lib/progressCurve'
import { parseISO, toISO, offsetToDate, workingDaysBetween, defaultCalendar } from '../engine/schedule/calendar'
import { useScheduleProject } from '../lib/useScheduleProject'
import { useScheduleSolve, type ScheduleSolve } from '../lib/useScheduleSolve'
import { PageHeader } from '../components/calc'

// Phase 7 — project dashboard at /schedule/dashboard. Composes the engine's
// projectProgress (schedule/progress) + earnedValue (cost EVM) at a user-chosen
// data date: KPIs, a status breakdown, a planned-vs-actual S-curve, cost EVM
// (BAC from resources + an actual-cost input), and critical/delayed/upcoming
// lists. Drawing-sheet palette; reuses the store-backed project + solve.

const btn = 'inline-flex items-center gap-1.5 rounded-md border border-[#d6d3c9] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#3d4a5c] hover:border-[#0f4c92] hover:text-[#0f4c92]'
const n1 = (v: number | null) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(1))
const n2 = (v: number | null) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(2))
const peso = (v: number) => '₱' + Math.round(v).toLocaleString('en-US')

function projectCalendar(p: ScheduleProject): WorkingCalendar {
  return p.calendars.find((c) => c.id === p.defaultCalendarId) ?? defaultCalendar(p.defaultCalendarId)
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'bad' | 'warn' }) {
  const color = tone === 'bad' ? 'text-[#c2402a]' : tone === 'ok' ? 'text-[#14603a]' : tone === 'warn' ? 'text-[#b97d10]' : 'text-[#0f1b2a]'
  return (
    <div className="rounded-lg border border-[#e3e1da] bg-white px-3.5 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a39d8d]">{label}</p>
      <p className={`mt-0.5 font-mono text-[18px] font-semibold ${color}`}>{value}</p>
      {sub && <p className="text-[10.5px] text-[#a39d8d]">{sub}</p>}
    </div>
  )
}

function Card({ title, right, children }: { title: string; right?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[#e3e1da] bg-white">
      <div className="flex items-center justify-between border-b border-[#eeece5] px-4 py-2.5">
        <h2 className="text-[13px] font-bold text-[#0f1b2a]">{title}</h2>
        {right && <span className="font-mono text-[10.5px] text-[#a39d8d]">{right}</span>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

const STATUS_BAR: { key: 'completed' | 'inProgress' | 'delayed' | 'notStarted' | 'blocked'; label: string; color: string }[] = [
  { key: 'completed', label: 'Completed', color: '#1a7f4b' },
  { key: 'inProgress', label: 'In progress', color: '#0f4c92' },
  { key: 'delayed', label: 'Delayed', color: '#b97d10' },
  { key: 'blocked', label: 'Blocked', color: '#7c3aed' },
  { key: 'notStarted', label: 'Upcoming', color: '#94a0ae' },
]

function SCurve({ curve, duration, actualPct, dataOffset }: { curve: { t: number; planned: number }[]; duration: number; actualPct: number; dataOffset: number }) {
  const W = 640, H = 200, pad = 30
  const x = (t: number) => pad + (duration > 0 ? (t / duration) * (W - pad * 2) : 0)
  const y = (p: number) => H - pad - (p / 100) * (H - pad * 2)
  const path = curve.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.t).toFixed(1)} ${y(p.planned).toFixed(1)}`).join(' ')
  const dx = x(Math.min(duration, Math.max(0, dataOffset)))
  return (
    <div className="overflow-x-auto">
      <svg width={W} height={H} className="min-w-[520px]">
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={pad} y1={y(g)} x2={W - pad} y2={y(g)} stroke="#f1efe8" />
            <text x={pad - 6} y={y(g) + 3} textAnchor="end" style={{ fontSize: 9, fontFamily: 'monospace', fill: '#a39d8d' }}>{g}</text>
          </g>
        ))}
        <path d={path} fill="none" stroke="#0f4c92" strokeWidth={2} />
        <line x1={dx} y1={pad} x2={dx} y2={H - pad} stroke="#c2402a" strokeWidth={1} strokeDasharray="3 3" />
        <circle cx={dx} cy={y(actualPct)} r={4} fill="#c2402a" />
        <text x={dx + 6} y={y(actualPct) - 6} style={{ fontSize: 10, fontFamily: 'monospace', fill: '#c2402a' }}>actual {actualPct.toFixed(0)}%</text>
        <text x={pad} y={H - 8} style={{ fontSize: 9, fill: '#a39d8d' }}>planned S-curve (blue) · data date (red)</text>
      </svg>
    </div>
  )
}

function Dashboard({ project, solve }: { project: ScheduleProject; solve: ScheduleSolve }) {
  const cal = projectCalendar(project)
  const start = project.meta.start
  const finishIso = solve.finishDate ?? start

  const defaultData = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const cand = [today, ...project.activities.flatMap((a) => [a.actualStart, a.actualFinish].filter((d): d is string => !!d))]
      .filter((d) => d >= start && d <= finishIso)
    if (cand.length) return cand.reduce((m, d) => (d > m ? d : m))
    return today < start ? start : today > finishIso ? finishIso : today
  }, [project, start, finishIso])

  const [dataDate, setDataDate] = useState(defaultData)
  const [acInput, setAcInput] = useState(0)
  const dataOffset = Math.max(0, workingDaysBetween(cal, parseISO(start), parseISO(dataDate)))

  const nameOf = useMemo(() => new Map(project.activities.map((a) => [a.id, a.name])), [project])
  const prog = useMemo(() => projectProgress(project.activities, solve.cpm!, dataOffset), [project, solve.cpm, dataOffset])

  // Cost EVM — BAC from resource costs; AC from the input, split by earned share.
  const costOf = useMemo(() => new Map(project.resources.map((r) => [r.id, r.costPerUnit ?? 0])), [project])
  const evm = useMemo(() => {
    const rows = project.activities.map((a) => {
      const c = solve.cpm!.activities.get(a.id)
      const bac = (a.resources ?? []).reduce((s, r) => s + r.quantity * (costOf.get(r.resourceId) ?? 0), 0)
      const pct = Math.min(100, Math.max(0, a.percentComplete ?? 0))
      return { id: a.id, bac, pct, ev: bac * (pct / 100), pf: c ? (c.ef > c.es ? Math.min(1, Math.max(0, (dataOffset - c.es) / (c.ef - c.es))) : dataOffset >= c.ef ? 1 : 0) : 0 }
    })
    const totalEv = rows.reduce((s, r) => s + r.ev, 0)
    const items: EvmActivityInput[] = rows.map((r) => ({
      id: r.id, bac: r.bac, percentComplete: r.pct, plannedFraction: r.pf,
      actualCost: totalEv > 0 ? acInput * (r.ev / totalEv) : 0,
    }))
    return { result: earnedValue(items), hasCost: items.some((i) => i.bac > 0) }
  }, [project, solve.cpm, costOf, dataOffset, acInput])

  const forecastFinish = toISO(offsetToDate(cal, parseISO(start), Math.round(prog.forecastDuration)))
  const ahead = prog.daysAheadBehind
  const varTone = prog.scheduleVariancePercent < -0.5 ? 'bad' : prog.scheduleVariancePercent > 0.5 ? 'ok' : undefined

  const critical = prog.activities.filter((a) => a.critical)
  const delayed = prog.activities.filter((a) => a.status === 'delayed')
  const upcoming = prog.activities.filter((a) => a.status === 'not-started').sort((a, b) => a.es - b.es).slice(0, 6)

  const miniList = (rows: typeof prog.activities, empty: string) => (
    rows.length === 0 ? <p className="text-[11.5px] text-[#a39d8d]">{empty}</p> : (
      <ul className="space-y-1">
        {rows.slice(0, 6).map((a) => (
          <li key={a.id} className="flex items-center gap-2 text-[12px]">
            <span className="truncate text-[#0f1b2a]">{nameOf.get(a.id)}</span>
            <span className="ml-auto flex-none font-mono text-[10.5px] text-[#a39d8d]">{a.percentComplete}%</span>
          </li>
        ))}
      </ul>
    )
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-[#e3e1da] bg-white p-3">
        <label className="flex flex-col text-[10px] font-semibold uppercase tracking-widest text-[#a39d8d]">Data date
          <input type="date" value={dataDate} min={start} max={finishIso} onChange={(e) => setDataDate(e.target.value || start)}
            className="mt-0.5 rounded border border-[#e3e1da] px-2 py-1 font-mono text-[12.5px] font-normal tracking-normal text-[#0f1b2a]" />
        </label>
        <label className="flex flex-col text-[10px] font-semibold uppercase tracking-widest text-[#a39d8d]">Actual cost to date (₱)
          <input type="number" min={0} step={1000} value={acInput} onChange={(e) => setAcInput(Math.max(0, parseFloat(e.target.value) || 0))}
            className="mt-0.5 w-40 rounded border border-[#e3e1da] px-2 py-1 text-right font-mono text-[12.5px] font-normal tracking-normal text-[#0f1b2a]" />
        </label>
        <span className="ml-auto text-[11px] text-[#a39d8d]">Data date = working day {dataOffset} of {prog.plannedDuration}</span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Actual progress" value={`${n1(prog.actualPercent)}%`} />
        <Stat label="Planned progress" value={`${n1(prog.plannedPercent)}%`} />
        <Stat label="Schedule var." value={`${prog.scheduleVariancePercent > 0 ? '+' : ''}${n1(prog.scheduleVariancePercent)}%`} tone={varTone} />
        <Stat label="SPI" value={n2(prog.spi)} tone={prog.spi != null && prog.spi < 0.995 ? 'bad' : prog.spi != null && prog.spi > 1.005 ? 'ok' : undefined} />
        <Stat label={ahead >= 0 ? 'Days ahead' : 'Days behind'} value={`${Math.abs(ahead).toFixed(1)} d`} tone={ahead < -0.05 ? 'bad' : ahead > 0.05 ? 'ok' : undefined} />
        <Stat label="Est. completion" value={forecastFinish} sub={`planned ${finishIso}`} tone={forecastFinish > finishIso ? 'bad' : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card title="Progress S-curve" right={`${prog.completed}/${prog.total} activities complete`}>
          <SCurve curve={plannedCurve(prog.activities.map((a) => ({ es: a.es, ef: a.ef, weight: a.duration })), prog.plannedDuration, 48)}
            duration={prog.plannedDuration} actualPct={prog.actualPercent} dataOffset={dataOffset} />
        </Card>
        <Card title="Status breakdown" right={`${prog.critical} critical`}>
          <div className="flex h-4 overflow-hidden rounded">
            {STATUS_BAR.map((s) => {
              const v = prog[s.key]
              return v > 0 ? <div key={s.key} title={`${s.label}: ${v}`} style={{ width: `${(v / prog.total) * 100}%`, background: s.color }} /> : null
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
            {STATUS_BAR.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5 text-[11.5px]">
                <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: s.color }} />
                <span className="text-[#5c6675]">{s.label}</span>
                <span className="ml-auto font-mono text-[#0f1b2a]">{prog[s.key]}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 border-t border-[#eeece5] pt-2 text-[11px] text-[#5c6675]">Remaining duration <span className="float-right font-mono text-[#0f1b2a]">{n1(prog.remainingDuration)} d</span></p>
        </Card>
      </div>

      {/* Earned value (cost) */}
      <Card title="Earned Value Management (cost)" right="BAC from resource rates · AC from input">
        {!evm.hasCost ? (
          <p className="text-[12px] text-[#a39d8d]">No resource costs are defined on the activities — add resource assignments with rates in the project to see cost EVM. Schedule performance (SPI, days ahead/behind) above is duration-based and needs no cost.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="PV" value={peso(evm.result.pv)} />
            <Stat label="EV" value={peso(evm.result.ev)} />
            <Stat label="AC" value={peso(evm.result.ac)} />
            <Stat label="BAC" value={peso(evm.result.bac)} />
            <Stat label="CPI" value={n2(evm.result.cpi)} tone={evm.result.cpi != null && evm.result.cpi < 0.995 ? 'bad' : evm.result.cpi != null && evm.result.cpi > 1.005 ? 'ok' : undefined} />
            <Stat label="SV / CV" value={`${peso(evm.result.sv)} / ${peso(evm.result.cv)}`} />
            <Stat label="EAC" value={evm.result.eac == null ? '—' : peso(evm.result.eac)} sub="BAC / CPI" />
            <Stat label="VAC" value={evm.result.vac == null ? '—' : peso(evm.result.vac)} tone={evm.result.vac != null && evm.result.vac < 0 ? 'bad' : undefined} />
            <Stat label="ETC" value={evm.result.etc == null ? '—' : peso(evm.result.etc)} />
            <Stat label="TCPI" value={n2(evm.result.tcpi)} />
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Critical activities" right={`${critical.length}`}>{miniList(critical, 'None on the critical path.')}</Card>
        <Card title="Delayed" right={`${delayed.length}`}>{miniList(delayed, 'Nothing behind schedule.')}</Card>
        <Card title="Upcoming" right={`${upcoming.length}`}>{miniList(upcoming, 'No upcoming activities.')}</Card>
      </div>
    </div>
  )
}

export default function ScheduleDashboard() {
  const api = useScheduleProject()
  const solve = useScheduleSolve(api.project)
  const project = api.project

  return (
    <>
      <PageHeader title="Dashboard" badges={['progress', 'EVM', 'SPI/CPI']} actions={project ? <Link to="/schedule" className={btn}>Grid</Link> : undefined} />
      <div className="mx-auto max-w-[1400px] space-y-4 p-5 sm:p-7">
        {!project ? (
          <div className="rounded-lg border border-dashed border-[#d6d3c9] bg-white px-6 py-16 text-center">
            <h2 className="text-[16px] font-bold text-[#0f1b2a]">No schedule open</h2>
            <Link to="/schedule" className="mt-4 inline-flex rounded-md bg-[#0f4c92] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#0d3f78]">Go to the schedule grid</Link>
          </div>
        ) : project.activities.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#d6d3c9] bg-white px-6 py-16 text-center text-[13px] text-[#a39d8d]">No activities yet — add some in the grid.</div>
        ) : !solve.ok ? (
          <div className="rounded-lg border border-[#efd9cc] bg-[#fdf3ee] px-4 py-2.5 text-[12px] text-[#8f4a2f]">The schedule has {solve.errorCount} blocking issue(s); fix them in the grid to see the dashboard.</div>
        ) : (
          <Dashboard project={project} solve={solve} />
        )}
      </div>
    </>
  )
}
