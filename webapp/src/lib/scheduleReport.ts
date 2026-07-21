// ─────────────────────────────────────────────────────────────────────────
// Schedule report payload (pure). Composes the tested engines (projectProgress,
// earnedValue, resourceLoad) + the CPM date projection into a structured,
// section-oriented payload that the CSV / PDF / Excel exporters render
// uniformly. No I/O, no React — fully testable.
// ─────────────────────────────────────────────────────────────────────────

import type { ScheduleProject } from '../engine/schedule/model'
import type { ScheduleSolve } from './useScheduleSolve'
import { projectProgress } from '../engine/schedule/progress'
import { earnedValue, plannedFraction, type EvmActivityInput } from '../engine/schedule/earnedValue'
import { resourceLoad } from './resourceLoad'
import { defaultCalendar } from '../engine/schedule/calendar'
import { dataDateOffset, forecastFinishISO } from './scheduleDates'

export interface ReportSection {
  title: string
  columns: string[]
  rows: (string | number)[][]
}

export interface ScheduleReport {
  title: string
  /** Header label/value pairs (project, parties, dates). */
  meta: [string, string][]
  sections: ReportSection[]
}

const n1 = (v: number): string => (Number.isFinite(v) ? v.toFixed(1) : '—')
const money = (v: number): string => Math.round(v).toLocaleString('en-PH', { maximumFractionDigits: 0 })

/**
 * Build the report payload for a solved project. `opts.dataDate` (ISO) sets the
 * progress/EVM as-of date (default: the project start — a plan-baseline report).
 */
export function buildScheduleReport(
  project: ScheduleProject,
  solve: ScheduleSolve,
  opts: { dataDate?: string } = {},
): ScheduleReport {
  const cpm = solve.cpm
  const cal = project.calendars.find((c) => c.id === project.defaultCalendarId) ?? defaultCalendar(project.defaultCalendarId)
  const start = project.meta.start
  const finish = solve.finishDate ?? start
  const dataDate = opts.dataDate ?? start
  const dataOffset = dataDateOffset(cal, start, dataDate)
  const nameOf = new Map(project.activities.map((a) => [a.id, a.name]))

  const meta: [string, string][] = [
    ['Project', project.meta.name],
    ...(project.meta.client ? [['Client', project.meta.client] as [string, string]] : []),
    ...(project.meta.contractor ? [['Contractor', project.meta.contractor] as [string, string]] : []),
    ...(project.meta.engineer ? [['Engineer', project.meta.engineer] as [string, string]] : []),
    ['Start', start],
    ['Finish', finish],
    ['Data date', dataDate],
    ['Activities', String(project.activities.length)],
  ]

  const sections: ReportSection[] = []

  // 1 — Schedule
  if (cpm) {
    const rows: (string | number)[][] = []
    for (const id of cpm.order) {
      const a = project.activities.find((x) => x.id === id)
      const c = cpm.activities.get(id)
      const d = solve.dates.get(id)
      if (!a || !c) continue
      rows.push([
        a.id, a.name, a.duration,
        d?.start ?? '—', d?.finish ?? '—',
        c.totalFloat, a.percentComplete ?? 0,
        c.critical ? 'yes' : '',
      ])
    }
    sections.push({ title: 'Schedule', columns: ['ID', 'Activity', 'Dur (d)', 'Start', 'Finish', 'Total float', '% complete', 'Critical'], rows })

    // 2 — Critical path
    sections.push({
      title: 'Critical path',
      columns: ['ID', 'Activity', 'Dur (d)'],
      rows: cpm.criticalPath.map((id) => [id, nameOf.get(id) ?? id, cpm.activities.get(id)?.duration ?? 0]),
    })

    // 3 — Progress & value
    const prog = projectProgress(project.activities, cpm, dataOffset)
    const costOf = new Map(project.resources.map((r) => [r.id, r.costPerUnit ?? 0]))
    let bac = 0, pv = 0, ev = 0, hasCost = false
    for (const a of project.activities) {
      const c = cpm.activities.get(a.id)
      const b = (a.resources ?? []).reduce((s, r) => s + r.quantity * (costOf.get(r.resourceId) ?? 0), 0)
      if (b > 0) hasCost = true
      bac += b
      pv += b * (c ? plannedFraction(c.es, c.ef, dataOffset) : 0)
      ev += b * (Math.min(100, Math.max(0, a.percentComplete ?? 0)) / 100)
    }
    const progRows: (string | number)[][] = [
      ['Planned % complete', n1(prog.plannedPercent)],
      ['Actual % complete', n1(prog.actualPercent)],
      ['Schedule variance %', n1(prog.scheduleVariancePercent)],
      ['SPI (duration)', prog.spi == null ? '—' : prog.spi.toFixed(2)],
      ['Days ahead (+) / behind (−)', n1(prog.daysAheadBehind)],
      ['Planned finish', finish],
      ['Forecast finish', forecastFinishISO(cal, start, prog.forecastDuration)],
      ['Remaining duration (d)', n1(prog.remainingDuration)],
    ]
    if (hasCost) {
      const evm = earnedValue([{ id: 'project', bac, percentComplete: bac > 0 ? (ev / bac) * 100 : 0, plannedFraction: bac > 0 ? pv / bac : 0, actualCost: 0 } as EvmActivityInput])
      progRows.push(
        ['Budget at completion (BAC, ₱)', money(evm.bac)],
        ['Planned value (PV, ₱)', money(evm.pv)],
        ['Earned value (EV, ₱)', money(evm.ev)],
        ['Cost schedule variance (SV, ₱)', money(evm.sv)],
      )
    }
    sections.push({ title: 'Progress & value', columns: ['Metric', 'Value'], rows: progRows })
  }

  // 4 — Resource loading
  if (cpm && project.resources.length > 0) {
    const loads = resourceLoad(project.activities, cpm, project.resources, cpm.duration)
    sections.push({
      title: 'Resource loading',
      columns: ['Resource', 'Type', 'Peak/day', 'Avail/day', 'Over days', 'Total'],
      rows: loads.map((l) => [l.resource.name, l.resource.type, n1(l.peak), l.available ?? '—', l.overDays, n1(l.total)]),
    })
  }

  return { title: `Schedule Report — ${project.meta.name}`, meta, sections }
}
