import { describe, it, expect } from 'vitest'
import { sampleProject } from '../engine/schedule/sample'
import { solveSchedule } from './useScheduleSolve'
import { buildScheduleReport } from './scheduleReport'
import { buildSchedulePdf } from './schedulePdf'
import { buildScheduleWorkbook } from './scheduleExcel'

const report = buildScheduleReport(sampleProject(), solveSchedule(sampleProject()), { dataDate: '2026-09-01' })

describe('PDF generation (jsPDF + autotable)', () => {
  it('builds an A4 document with real bytes and no throw', () => {
    const doc = buildSchedulePdf(report)
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1)
    const buf = doc.output('arraybuffer')
    expect(buf.byteLength).toBeGreaterThan(1000)      // a real PDF, not empty
  })
})

describe('Excel generation (ExcelJS)', () => {
  it('builds a Summary sheet plus one sheet per report section', async () => {
    const wb = buildScheduleWorkbook(report)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'Schedule', 'Critical path', 'Progress & value', 'Resource loading'])
    const schedule = wb.getWorksheet('Schedule')!
    expect((schedule.getRow(1).values as unknown[]).includes('Activity')).toBe(true)
    expect(schedule.rowCount).toBe(1 + sampleProject().activities.length)   // header + activities
    const buf = await wb.xlsx.writeBuffer()
    expect(buf.byteLength).toBeGreaterThan(1000)
  })
})
