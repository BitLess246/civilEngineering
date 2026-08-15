import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Activity, ScheduleProject } from '../engine/schedule/model'
import { useScheduleProject } from '../lib/useScheduleProject'
import { useScheduleSolve, type ScheduleSolve } from '../lib/useScheduleSolve'
import {
  captureBaseline, nextBaselineName, renameBaseline, removeBaseline, baselineAfterRemoval,
} from '../engine/schedule/baseline'
import { analyzeDelays } from '../lib/delayAnalysis'
import { PageHeader } from '../components/calc'
import { GuidedTour } from '../components/GuidedTour'
import { TourButton } from '../components/TourButton'
import { PersistenceAlerts } from '../components/PersistenceAlerts'
import { DAILY_STEPS } from '../lib/scheduleDailyTour'
import { useTour } from '../lib/useTour'

// Phase 10 — daily reports + delay analysis at /schedule/daily. Capture/select
// baselines, log per-activity actuals (% complete, actual start/finish, remarks)
// that update the schedule and recompute live, and analyse delays vs the
// baseline (per-activity finish slip; critical delays drive the project finish).

const btn = 'inline-flex items-center gap-1.5 rounded-md border border-[#d6d3c9] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#3d4a5c] hover:border-[#0f4c92] hover:text-[#0f4c92]'

type Update = (m: (d: ScheduleProject) => void) => void

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'bad' }) {
  return (
    <div className="rounded-lg border border-[#e3e1da] bg-white px-3.5 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a39d8d]">{label}</p>
      <p className={`mt-0.5 font-mono text-[16px] font-semibold ${tone === 'bad' ? 'text-[#c2402a]' : tone === 'ok' ? 'text-[#14603a]' : 'text-[#0f1b2a]'}`}>{value}</p>
    </div>
  )
}

function DelayAnalysis({ project, solve, baselineId }: { project: ScheduleProject; solve: ScheduleSolve; baselineId: string }) {
  const baseline = project.baselines.find((b) => b.id === baselineId)
  const delays = useMemo(
    () => (baseline && solve.cpm ? analyzeDelays(project, solve.cpm, baseline, solve.finishDate ?? project.meta.start) : null),
    [project, solve.cpm, solve.finishDate, baseline],
  )
  if (!delays) return null
  const slipped = delays.activities.filter((a) => a.finishVarianceDays !== 0)
  const td = 'px-2.5 py-1.5'
  const th = 'px-2.5 py-2 text-left text-[9.5px] font-bold uppercase tracking-widest text-[#5c6675]'

  return (
    <section className="space-y-3">
      <div className={`rounded-lg border px-4 py-2.5 text-[12px] ${delays.projectSlipDays > 0 ? (delays.criticalDelayedCount > 0 ? 'border-[#efd4cc] bg-[#fbeeea] text-[#8f2f1e]' : 'border-[#f0e2c8] bg-[#fdf6e9] text-[#8a6a1e]') : 'border-[#d3e8da] bg-[#ecf6ef] text-[#14603a]'}`}>
        {delays.projectSlipDays > 0
          ? (delays.criticalDelayedCount > 0
              ? <><b>Project delayed {delays.projectSlipDays} day{delays.projectSlipDays === 1 ? '' : 's'} vs baseline.</b> {delays.criticalDelayedCount} critical activit{delays.criticalDelayedCount === 1 ? 'y is' : 'ies are'} behind and pushing the finish.</>
              : <>The project finish has slipped {delays.projectSlipDays} day(s) vs baseline.</>)
          : delays.projectSlipDays < 0
            ? <>Ahead of baseline — the project finishes {-delays.projectSlipDays} day(s) earlier.{delays.criticalDelayedCount > 0 ? ` (${delays.criticalDelayedCount} activity(ies) slipped locally but don't push the finish.)` : ''}</>
            : <>On baseline — no project delay.</>}
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="Project slip" value={`${delays.projectSlipDays} d`} tone={delays.projectSlipDays > 0 ? 'bad' : 'ok'} />
        <Stat label="Delayed activities" value={String(delays.delayedCount)} tone={delays.delayedCount > 0 ? 'bad' : 'ok'} />
        <Stat label="Critical delays" value={String(delays.criticalDelayedCount)} tone={delays.criticalDelayedCount > 0 ? 'bad' : 'ok'} />
        <Stat label="Worst slip" value={delays.worst ? `${delays.worst.finishVarianceDays} d` : '—'} />
      </div>
      {slipped.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-[#e3e1da] bg-white">
          <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b-[1.5px] border-[#0f1b2a] bg-[#f9f8f4]">
                <th className={th}>Activity</th><th className={`${th} text-right`}>Start Δ</th><th className={`${th} text-right`}>Finish Δ</th><th className={`${th} text-right`}>Dur Δ</th><th className={th}>Flag</th>
              </tr>
            </thead>
            <tbody>
              {slipped.map((a) => (
                <tr key={a.id} className={`border-b border-[#f1efe8] ${a.criticalDelay ? 'bg-[#fdf3f0]' : ''}`}>
                  <td className={`${td} font-medium text-[#0f1b2a]`}>{a.name}</td>
                  <td className={`${td} text-right font-mono text-[#5c6675]`}>{a.startVarianceDays > 0 ? '+' : ''}{a.startVarianceDays}</td>
                  <td className={`${td} text-right font-mono ${a.delayed ? 'font-semibold text-[#c2402a]' : 'text-[#14603a]'}`}>{a.finishVarianceDays > 0 ? '+' : ''}{a.finishVarianceDays}</td>
                  <td className={`${td} text-right font-mono text-[#5c6675]`}>{a.durationVariance > 0 ? '+' : ''}{a.durationVariance}</td>
                  <td className={td}>{a.criticalDelay ? <span className="rounded bg-[#c2402a] px-1.5 py-px font-mono text-[9px] font-semibold text-white">CRITICAL</span> : a.delayed ? <span className="text-[11px] text-[#b97d10]">delayed</span> : <span className="text-[11px] text-[#14603a]">ahead</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-[#a39d8d]">Δ = current schedule minus the selected baseline (start/finish in calendar days, duration in working days; + = later/longer). A finish slip on the critical path (red) pushes the project completion. The delay reflects the current <em>plan</em> vs baseline — record actuals in the log below (they feed the dashboard, EVM and Gantt).</p>
    </section>
  )
}

function ProgressLog({ project, update }: { project: ScheduleProject; update: Update }) {
  const set = (id: string, patch: Partial<Activity>) => update((d) => { const a = d.activities.find((x) => x.id === id); if (a) Object.assign(a, patch) })
  const th = 'px-2.5 py-2 text-left text-[9.5px] font-bold uppercase tracking-widest text-[#5c6675]'
  const td = 'px-2.5 py-1 align-middle'
  const dinput = 'rounded border border-[#e3e1da] px-1.5 py-1 font-mono text-[11.5px] text-[#0f1b2a] focus:border-[#0f4c92]'
  return (
    <div className="overflow-x-auto rounded-lg border border-[#e3e1da] bg-white">
      <table className="w-full min-w-[760px] border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b-[1.5px] border-[#0f1b2a] bg-[#f9f8f4]">
            <th className={th}>Activity</th><th className={`${th} text-right`}>% complete</th><th className={th}>Actual start</th><th className={th}>Actual finish</th><th className={th}>Remarks</th>
          </tr>
        </thead>
        <tbody>
          {project.activities.map((a) => (
            <tr key={a.id} className="border-b border-[#f1efe8]">
              <td className={`${td} font-medium text-[#0f1b2a]`}>{a.name}</td>
              <td className={`${td} text-right`}>
                <input type="number" min={0} max={100} value={a.percentComplete ?? 0}
                  onChange={(e) => { const n = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)); set(a.id, { percentComplete: n }) }}
                  className={`w-16 text-right ${dinput}`} />
              </td>
              <td className={td}><input type="date" value={a.actualStart ?? ''} onChange={(e) => set(a.id, { actualStart: e.target.value || undefined })} className={dinput} /></td>
              <td className={td}><input type="date" value={a.actualFinish ?? ''} onChange={(e) => set(a.id, { actualFinish: e.target.value || undefined })} className={dinput} /></td>
              <td className={td}>
                <input value={a.remarks ?? ''} onChange={(e) => set(a.id, { remarks: e.target.value || undefined })} placeholder="—"
                  className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-[12px] text-[#0f1b2a] hover:border-[#e3e1da] focus:border-[#0f4c92] focus:bg-white" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Choose a baseline, rename it, delete it.
 *
 * Capture used to be the only verb. A stray snapshot was therefore permanent,
 * and "Baseline 4" told you nothing about which revision it was — the only way
 * out of either was to export the project, edit the JSON and import it back.
 *
 * DELETING ASKS, renaming does not. A baseline is the reference every delay
 * figure on this page is measured against and there is no undo, so it follows
 * the same two-step the project delete uses. A name is recoverable by typing
 * it again, so a confirmation there would only be in the way.
 */
function BaselinePicker({ project, activeId, onSelect, update }: {
  project: ScheduleProject; activeId: string
  onSelect: (id: string) => void; update: Update
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)

  const active = project.baselines.find((b) => b.id === activeId)
  if (!active) return null

  const startEdit = () => { setDraft(active.name); setConfirmDel(false); setEditing(true) }
  const commit = () => {
    update((d) => { d.baselines = renameBaseline(d.baselines, active.id, draft) })
    setEditing(false)
  }
  const remove = () => {
    // Work out the survivor BEFORE the update, so the selection never points
    // at an id that has just been deleted.
    const next = baselineAfterRemoval(project.baselines, active.id, activeId)
    update((d) => { d.baselines = removeBaseline(d.baselines, active.id) })
    onSelect(next ?? '')
    setConfirmDel(false)
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          placeholder="Baseline name"
          className="w-48 rounded-md border border-[#0f4c92] px-2 py-1.5 text-[12px] text-[#0f1b2a] focus:outline-none" />
        <button type="button" onClick={commit} disabled={!draft.trim()}
          className="rounded-md bg-[#0f4c92] px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#0d3f78] disabled:opacity-40">Save</button>
        <button type="button" onClick={() => setEditing(false)} className={btn}>Cancel</button>
      </span>
    )
  }

  if (confirmDel) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded border border-red-200 bg-red-50 px-2 py-1">
        <span className="text-[11.5px] text-red-900">Delete “{active.name}”? Delay figures measured against it go with it.</span>
        <button type="button" onClick={remove}
          className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-red-700">Delete</button>
        <button type="button" onClick={() => setConfirmDel(false)} className={btn}>Keep</button>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5" data-tour="baseline-select">
      <select value={activeId} onChange={(e) => onSelect(e.target.value)}
        className="rounded-md border border-[#d6d3c9] bg-white px-2 py-1.5 text-[12px]">
        {project.baselines.map((b) => <option key={b.id} value={b.id}>{b.name} · {b.createdAt.slice(0, 10)}</option>)}
      </select>
      <button type="button" onClick={startEdit} className={btn} title="Rename this baseline">Rename</button>
      <button type="button" onClick={() => setConfirmDel(true)}
        className="rounded-md border border-red-200 px-2 py-1.5 text-[12px] font-semibold text-red-700 hover:bg-red-50"
        title="Delete this baseline">Delete</button>
    </span>
  )
}

export default function ScheduleDaily() {
  const api = useScheduleProject()
  const solve = useScheduleSolve(api.project)
  const [baselineId, setBaselineId] = useState<string>('')
  const project = api.project

  const capture = () => {
    if (!solve.ok) return   // captureBaseline runs CPM — a cyclic schedule would throw
    const id = `bl_${Date.now().toString(36)}`
    api.update((d) => { d.baselines.push(captureBaseline(d, id, nextBaselineName(d.baselines), new Date().toISOString())) })
    setBaselineId(id)
  }

  /**
   * The guide captures a baseline, then puts it back.
   *
   * Two of its steps describe a delay table that does not render without one,
   * and they used to show the overlay's "not on screen yet" notice for exactly
   * as long as the user had not taken the advice of step one.
   *
   * The rule is exact, and it is the same one the schedule grid's guide
   * follows: NO BASELINE BEFORE ⇒ NO BASELINE AFTER. A project that already
   * has one is left completely alone — the guide runs against the user's own
   * snapshot, and removes nothing on the way out.
   *
   * Only ever the one it created. A baseline the user captures with the button
   * WHILE the guide is open has a different id and survives, which is the
   * behaviour someone following along expects.
   *
   * `useTour` pairs these: `onEnd` fires exactly once and only after `onStart`,
   * whether the guide ended at the last step, by Esc, or by the close button.
   */
  const seeded = useRef<string | null>(null)
  const tour = useTour(DAILY_STEPS, () => {}, {
    onStart: () => {
      if (!solve.ok || !project || project.baselines.length > 0) return
      const id = `bl_${Date.now().toString(36)}`
      seeded.current = id
      api.update((d) => {
        d.baselines.push(captureBaseline(d, id, nextBaselineName(d.baselines), new Date().toISOString()))
      })
      setBaselineId(id)
    },
    onEnd: () => {
      const id = seeded.current
      if (!id) return
      seeded.current = null
      api.update((d) => { d.baselines = removeBaseline(d.baselines, id) })
      setBaselineId('')
    },
  })

  const actions = project && (
    <div className="flex items-center gap-2">
      <button type="button" onClick={capture} disabled={!solve.ok} className={`${btn} disabled:opacity-40`} title={solve.ok ? '' : 'Fix schedule errors first'} data-tour="capture-baseline">+ Capture baseline</button>
      <TourButton onClick={tour.start} label="Guide" />
      <Link to="/schedule" className={btn}>Grid</Link>
    </div>
  )

  const activeBaseline = project?.baselines.some((b) => b.id === baselineId) ? baselineId
    : project?.baselines.length ? project.baselines[project.baselines.length - 1].id : ''

  return (
    <>
      <PageHeader title="Daily Progress & Delays" badges={['actuals', 'baseline', 'delay']} actions={actions ?? undefined} />
      <div className="mx-auto max-w-[1400px] space-y-5 p-5 sm:p-7">
        <PersistenceAlerts saveError={api.saveError} clearSaveError={api.clearSaveError}
          conflict={api.conflict} reloadTheirs={api.reloadTheirs}
          overwriteWithMine={api.overwriteWithMine} />
        {!project ? (
          <div className="rounded-lg border border-dashed border-[#d6d3c9] bg-white px-6 py-16 text-center">
            <h2 className="text-[16px] font-bold text-[#0f1b2a]">No schedule open</h2>
            <Link to="/schedule" className="mt-4 inline-flex rounded-md bg-[#0f4c92] px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-[#0d3f78]">Go to the schedule grid</Link>
          </div>
        ) : project.activities.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#d6d3c9] bg-white px-6 py-16 text-center text-[13px] text-[#a39d8d]">No activities to track — add some in the grid.</div>
        ) : (
          <>
            {/* Delay analysis */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-[14px] font-bold text-[#0f1b2a]">Delay analysis</h2>
                {project.baselines.length > 0 ? (
                  <BaselinePicker project={project} activeId={activeBaseline}
                    onSelect={setBaselineId} update={api.update} />
                ) : <span className="text-[12px] text-[#a39d8d]">No baseline yet — <button type="button" onClick={capture} className="font-semibold text-[#0f4c92] underline">capture one</button> to measure delays against.</span>}
              </div>
              {!solve.ok
                ? <div className="rounded-lg border border-[#efd9cc] bg-[#fdf3ee] px-4 py-2.5 text-[12px] text-[#8f4a2f]">The schedule has {solve.errorCount} blocking issue(s); fix them in the grid to analyse delays.</div>
                : activeBaseline && <div data-tour="delay-analysis"><DelayAnalysis project={project} solve={solve} baselineId={activeBaseline} /></div>}
            </section>

            {/* Daily progress log */}
            <section className="space-y-2">
              <h2 className="text-[14px] font-bold text-[#0f1b2a]">Daily progress log</h2>
              <div data-tour="progress-log"><ProgressLog project={project} update={api.update} /></div>
              <p className="text-[11px] text-[#a39d8d]">Record actual % complete, actual start/finish and remarks per activity. Edits save immediately and feed the dashboard, Gantt shading and reports. (Photo attachments are a future enhancement — no file storage yet.)</p>
            </section>
          </>
        )}
      </div>
      {tour.on && (
        <GuidedTour step={tour.step} index={tour.at} total={tour.total}
          onNext={tour.next} onPrev={tour.prev} onClose={tour.close} />
      )}
    </>
  )
}
