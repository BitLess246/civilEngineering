// ─────────────────────────────────────────────────────────────────────────
// Project-scheduling data model (PERT/CPM module).
//
// Pure, JSON-serialisable types shared by the scheduling engines (CPM, PERT,
// earned-value, resources) and the UI. Dates are ISO 'YYYY-MM-DD' strings so a
// whole project round-trips through `JSON.stringify` / localStorage unchanged.
//
// UNITS. Durations and lags live on an abstract *working-time* axis measured in
// the activity's `unit` (default: whole working days). The CPM engine solves on
// that numeric axis; the working-calendar layer (`calendar.ts`) projects the
// resulting offsets onto real dates, skipping non-working days and holidays.
// ─────────────────────────────────────────────────────────────────────────

/** Precedence relation between a predecessor P and its successor Q.
 *  FS finish-to-start · FF finish-to-finish · SS start-to-start · SF start-to-finish. */
export type RelationType = 'FS' | 'FF' | 'SS' | 'SF'

export type DurationUnit = 'days' | 'hours'

export type ActivityStatus =
  | 'not-started'
  | 'in-progress'
  | 'completed'
  | 'delayed'
  | 'blocked'

export type ResourceType = 'labor' | 'equipment' | 'material'

/** A single precedence link, stored on the *successor* activity.
 *  `lag` is in working units; a negative lag is a lead. */
export interface Dependency {
  /** Activity id of the predecessor. */
  predecessor: string
  /** Relation type; FS if omitted by a caller. */
  type: RelationType
  /** Lead/lag in working units (default 0). */
  lag: number
}

/** A resource definition in the project pool. */
export interface Resource {
  id: string
  name: string
  type: ResourceType
  /** Unit of measure, e.g. 'man-day', 'hr', 'm³'. */
  unit: string
  /** Cost per `unit` (project currency); optional. */
  costPerUnit?: number
  /** Max units available per working day (for over-allocation checks); optional. */
  availablePerDay?: number
}

/** A resource assigned to an activity. */
export interface ActivityResource {
  resourceId: string
  /** Quantity of the resource consumed by the activity (in the resource's unit). */
  quantity: number
}

/** A schedule activity (task). A milestone is an activity with `duration === 0`. */
export interface Activity {
  id: string
  /** Owning WBS node id (optional; activities may sit at project root). */
  wbsId?: string
  name: string
  description?: string
  /** Planned duration in `unit` (0 = milestone). */
  duration: number
  unit: DurationUnit
  /** Working-calendar id; falls back to the project default when omitted. */
  calendarId?: string
  /** Precedence links to predecessors. */
  predecessors: Dependency[]
  milestone?: boolean

  // ── PERT three-point estimate (optional) ──
  optimistic?: number
  mostLikely?: number
  pessimistic?: number

  // ── Progress / actuals ──
  actualStart?: string
  actualFinish?: string
  /** 0–100. */
  percentComplete?: number
  responsible?: string
  status?: ActivityStatus
  remarks?: string

  // ── Resources ──
  resources?: ActivityResource[]
}

/** A Work-Breakdown-Structure node. Unlimited hierarchy via `parentId`. */
export interface WbsNode {
  id: string
  /** Outline code, e.g. '1.2.3' (may be derived; stored for stable display). */
  code?: string
  name: string
  parentId?: string
  /** Sibling ordering (ascending). */
  order: number
}

/** A working calendar: which weekdays are worked plus explicit holiday dates. */
export interface WorkingCalendar {
  id: string
  name: string
  /** Seven flags indexed Sun(0)…Sat(6); true = a working day. */
  workweek: boolean[]
  /** Non-working ISO dates (holidays / shutdowns). */
  holidays: string[]
  /** Working hours per day — used only to convert 'hours' durations to days. */
  hoursPerDay?: number
}

/** Header / contractual metadata for a project. */
export interface ProjectMeta {
  name: string
  description?: string
  client?: string
  contractor?: string
  engineer?: string
  /** Project data date / start (ISO). */
  start: string
  /** Contractual planned finish (ISO), optional target. */
  plannedFinish?: string
}

/** A frozen snapshot of the schedule for variance tracking. */
export interface Baseline {
  id: string
  name: string
  createdAt: string
  /** Per-activity planned {start, finish} ISO dates and duration at capture. */
  activities: Record<string, { start: string; finish: string; duration: number }>
}

/** The complete, serialisable scheduling project. */
export interface ScheduleProject {
  meta: ProjectMeta
  calendars: WorkingCalendar[]
  defaultCalendarId: string
  wbs: WbsNode[]
  activities: Activity[]
  resources: Resource[]
  baselines: Baseline[]
}

/** Convenience constructor for an FS dependency with no lag. */
export function fs(predecessor: string): Dependency {
  return { predecessor, type: 'FS', lag: 0 }
}
