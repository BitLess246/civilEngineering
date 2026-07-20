// ─────────────────────────────────────────────────────────────────────────
// Schedule-project integrity validation.
//
// Structural checks a `ScheduleProject` must pass before it is solved, saved or
// imported: unique ids, resolvable references (predecessor / calendar / WBS /
// resource), no dependency or WBS-parent cycles, sane durations and percents.
// Returns a flat list of issues (errors block; warnings are advisory) so the UI
// can surface all problems at once rather than throwing on the first.
// ─────────────────────────────────────────────────────────────────────────

import type { ScheduleProject } from './model'
import { findCycle } from './cpm'

export type IssueSeverity = 'error' | 'warning'

export interface ValidationIssue {
  severity: IssueSeverity
  /** Stable machine code, e.g. 'unknown-predecessor'. */
  code: string
  message: string
  /** Related activity id, when applicable. */
  activityId?: string
}

/** Validate a project; empty array ⇒ clean. Errors block solve/save. */
export function validateProject(project: ScheduleProject): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const err = (code: string, message: string, activityId?: string) =>
    issues.push({ severity: 'error', code, message, activityId })
  const warn = (code: string, message: string, activityId?: string) =>
    issues.push({ severity: 'warning', code, message, activityId })

  const activityIds = new Set<string>()
  for (const a of project.activities) {
    if (activityIds.has(a.id)) err('duplicate-activity-id', `Duplicate activity id "${a.id}".`, a.id)
    activityIds.add(a.id)
  }

  const calendarIds = new Set(project.calendars.map((c) => c.id))
  const wbsIds = new Set(project.wbs.map((w) => w.id))
  const resourceIds = new Set(project.resources.map((r) => r.id))

  if (!calendarIds.has(project.defaultCalendarId)) {
    err('unknown-default-calendar', `Default calendar "${project.defaultCalendarId}" does not exist.`)
  }

  // WBS reference + parent-cycle checks.
  const wbsSeen = new Set<string>()
  for (const w of project.wbs) {
    if (wbsSeen.has(w.id)) err('duplicate-wbs-id', `Duplicate WBS id "${w.id}".`)
    wbsSeen.add(w.id)
    if (w.parentId && !wbsIds.has(w.parentId)) {
      err('unknown-wbs-parent', `WBS "${w.id}" references unknown parent "${w.parentId}".`)
    }
  }
  detectWbsCycles(project, wbsIds).forEach((id) =>
    err('wbs-cycle', `WBS node "${id}" is part of a parent cycle.`))

  // Per-activity checks.
  for (const a of project.activities) {
    if (a.duration < 0) err('negative-duration', `Activity "${a.id}" has a negative duration.`, a.id)
    if (a.milestone && a.duration !== 0) {
      warn('milestone-duration', `Milestone "${a.id}" has a non-zero duration (${a.duration}).`, a.id)
    }
    if (a.percentComplete != null && (a.percentComplete < 0 || a.percentComplete > 100)) {
      warn('percent-out-of-range', `Activity "${a.id}" percent complete ${a.percentComplete} is outside 0–100.`, a.id)
    }
    if (a.calendarId && !calendarIds.has(a.calendarId)) {
      err('unknown-calendar', `Activity "${a.id}" references unknown calendar "${a.calendarId}".`, a.id)
    }
    if (a.wbsId && !wbsIds.has(a.wbsId)) {
      err('unknown-wbs', `Activity "${a.id}" references unknown WBS node "${a.wbsId}".`, a.id)
    }

    const seenPreds = new Set<string>()
    for (const d of a.predecessors) {
      if (d.predecessor === a.id) err('self-dependency', `Activity "${a.id}" depends on itself.`, a.id)
      else if (!activityIds.has(d.predecessor)) {
        err('unknown-predecessor', `Activity "${a.id}" references unknown predecessor "${d.predecessor}".`, a.id)
      }
      const key = `${d.predecessor}:${d.type}`
      if (seenPreds.has(key)) warn('duplicate-predecessor', `Activity "${a.id}" has a duplicate ${d.type} link from "${d.predecessor}".`, a.id)
      seenPreds.add(key)
    }

    for (const r of a.resources ?? []) {
      if (!resourceIds.has(r.resourceId)) {
        err('unknown-resource', `Activity "${a.id}" references unknown resource "${r.resourceId}".`, a.id)
      }
    }
  }

  // Dependency cycle — only safe to run once predecessor refs resolve.
  const refsResolve = !issues.some((i) => i.code === 'unknown-predecessor' || i.code === 'self-dependency')
  if (refsResolve) {
    try {
      const cycle = findCycle(project.activities)
      if (cycle) err('dependency-cycle', `Circular dependency: ${cycle.join(' → ')}.`)
    } catch {
      /* buildEdges guards already covered above */
    }
  }

  return issues
}

/** True when the project has no error-level issues. */
export function isProjectValid(project: ScheduleProject): boolean {
  return !validateProject(project).some((i) => i.severity === 'error')
}

/** WBS node ids that sit on a parent cycle. */
function detectWbsCycles(project: ScheduleProject, wbsIds: Set<string>): string[] {
  const parent = new Map(project.wbs.map((w) => [w.id, w.parentId]))
  const onCycle: string[] = []
  for (const w of project.wbs) {
    const seen = new Set<string>()
    let cur: string | undefined = w.id
    while (cur && wbsIds.has(cur)) {
      if (seen.has(cur)) { onCycle.push(w.id); break }
      seen.add(cur)
      cur = parent.get(cur) ?? undefined
    }
  }
  return onCycle
}
