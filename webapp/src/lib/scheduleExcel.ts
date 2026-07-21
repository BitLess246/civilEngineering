// Excel export of a schedule report — a Summary sheet + one sheet per section.
// Loaded lazily via dynamic import so ExcelJS stays out of the main bundle.
import ExcelJS from 'exceljs'
import type { ScheduleReport } from './scheduleReport'

/** Excel sheet names: ≤31 chars, none of : \ / ? * [ ]. */
const sheetName = (t: string): string => t.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31)

/** Build the report workbook (no I/O — node-testable). */
export function buildScheduleWorkbook(report: ScheduleReport): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'CivEng Toolkit'

  const summary = wb.addWorksheet('Summary')
  summary.addRow([report.title]).font = { bold: true, size: 13 }
  summary.addRow([])
  for (const [k, v] of report.meta) summary.addRow([k, v])
  summary.getColumn(1).width = 22
  summary.getColumn(2).width = 40

  for (const s of report.sections) {
    const ws = wb.addWorksheet(sheetName(s.title))
    const header = ws.addRow(s.columns)
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    header.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F4C92' } } })
    for (const r of s.rows) ws.addRow(r)
    s.columns.forEach((col, i) => {
      const maxLen = Math.max(col.length, ...s.rows.map((r) => String(r[i] ?? '').length))
      ws.getColumn(i + 1).width = Math.min(48, Math.max(10, maxLen + 2))
    })
    ws.views = [{ state: 'frozen', ySplit: 1 }]
  }
  return wb
}

/** Build and download the report workbook (browser). */
export async function exportScheduleExcel(report: ScheduleReport, fileName?: string): Promise<void> {
  const wb = buildScheduleWorkbook(report)
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName ?? `schedule-report-${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
