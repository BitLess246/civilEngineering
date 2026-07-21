// CSV serialisation of a schedule report (pure, RFC-4180 quoting).
import type { ScheduleReport, ReportSection } from './scheduleReport'

/** Quote a field when it contains a comma, quote or newline; double inner quotes. */
function esc(v: string | number): string {
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** One section as CSV (header row + data rows). */
export function sectionToCSV(section: ReportSection): string {
  return [section.columns, ...section.rows].map((r) => r.map(esc).join(',')).join('\n')
}

/** The whole report as one CSV: a meta block then each section, blank-separated. */
export function reportToCSV(report: ScheduleReport): string {
  const blocks: string[] = [report.meta.map(([k, v]) => `${esc(k)},${esc(v)}`).join('\n')]
  for (const s of report.sections) blocks.push(`${esc(s.title)}\n${sectionToCSV(s)}`)
  return blocks.join('\n\n')
}
