// Convert an auto-derived model construction schedule (ModelActivity[]) into a
// full ScheduleProject the /schedule module consumes — so the model's CPM/PERT
// can be opened in the scheduler with a calendar, resources, baselines and
// export. Activities carry their three-point estimate and precedence relations;
// a light WBS groups them by phase (Sitework / Foundation / Level n).
import type { ModelActivity } from '../engine/modelSchedule'
import type { ScheduleProject, Activity, WbsNode } from '../engine/schedule/model'
import { defaultCalendar } from '../engine/schedule/calendar'

/** WBS node id + label for an activity's phase. */
function phaseOf(a: ModelActivity): { id: string; name: string; order: number } {
  if (a.trade === 'sitework') return { id: 'wbs-site', name: 'Site works', order: 0 }
  if (a.trade === 'foundation') return { id: 'wbs-found', name: 'Substructure — foundations', order: 1 }
  const s = a.storey ?? 1
  return { id: `wbs-lvl-${s}`, name: `Level ${s}`, order: 1 + s }
}

export interface ProjectOpts { name?: string; start?: string; client?: string; engineer?: string }

/** Build a ScheduleProject from the model activities (already CPM/PERT-shaped). */
export function modelActivitiesToProject(activities: ModelActivity[], opts: ProjectOpts = {}): ScheduleProject {
  const cal = defaultCalendar()
  const wbsMap = new Map<string, WbsNode>()
  const acts: Activity[] = activities.map((a) => {
    const ph = phaseOf(a)
    if (!wbsMap.has(ph.id)) wbsMap.set(ph.id, { id: ph.id, name: ph.name, order: ph.order })
    return {
      id: a.id,
      wbsId: ph.id,
      name: a.name,
      duration: a.duration,
      unit: 'days',
      predecessors: a.predecessors.map((l) => ({ predecessor: l.id, type: l.type, lag: l.lag })),
      optimistic: a.o,
      mostLikely: a.m,
      pessimistic: a.p,
      status: 'not-started',
      remarks: `${a.quantity} ${a.unit}`,
    }
  })
  return {
    meta: {
      name: opts.name ?? 'Model construction schedule',
      description: 'Auto-generated from the 3D structural model (CPM/PERT).',
      client: opts.client, engineer: opts.engineer,
      start: opts.start ?? new Date().toISOString().slice(0, 10),
    },
    calendars: [cal],
    defaultCalendarId: cal.id,
    wbs: [...wbsMap.values()].sort((a, b) => a.order - b.order),
    activities: acts,
    resources: [],
    baselines: [],
  }
}

/** Refresh an existing linked project with the model's latest structure while
 *  KEEPING the scheduler-side setup — calendars, resources, baselines, meta — and
 *  each activity's progress/actuals/assignments (matched by id). Model edits
 *  (durations, predecessors, three-point) flow in; the user's plan is preserved. */
export function mergeModelIntoProject(existing: ScheduleProject, fresh: ScheduleProject): ScheduleProject {
  const prev = new Map(existing.activities.map((a) => [a.id, a]))
  const activities: Activity[] = fresh.activities.map((a) => {
    const p = prev.get(a.id)
    return p ? {
      ...a,
      calendarId: p.calendarId,
      actualStart: p.actualStart, actualFinish: p.actualFinish,
      percentComplete: p.percentComplete, status: p.status ?? a.status,
      responsible: p.responsible, resources: p.resources,
    } : a
  })
  return { ...existing, activities, wbs: fresh.wbs }
}
