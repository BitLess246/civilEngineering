import { describe, it, expect } from 'vitest'
import { sampleProject } from '../engine/schedule/sample'
import { solveSchedule } from './useScheduleSolve'
import { buildScheduleReport } from './scheduleReport'
import { reportToCSV, sectionToCSV } from './scheduleCsv'

const project = sampleProject()
const solve = solveSchedule(project)
const report = buildScheduleReport(project, solve, { dataDate: '2026-09-01' })

describe('buildScheduleReport', () => {
  it('titles the report and carries project meta', () => {
    expect(report.title).toContain(project.meta.name)
    const metaKeys = report.meta.map(([k]) => k)
    expect(metaKeys).toEqual(expect.arrayContaining(['Project', 'Start', 'Finish', 'Data date', 'Client', 'Contractor', 'Engineer']))
    expect(report.meta.find(([k]) => k === 'Data date')![1]).toBe('2026-09-01')
  })
  it('has the four sections', () => {
    expect(report.sections.map((s) => s.title)).toEqual(['Schedule', 'Critical path', 'Progress & value', 'Resource loading'])
  })
  it('the schedule section has one row per activity with 8 columns', () => {
    const sched = report.sections[0]
    expect(sched.columns).toHaveLength(8)
    expect(sched.rows).toHaveLength(project.activities.length)
    // every row matches the column count
    expect(sched.rows.every((r) => r.length === 8)).toBe(true)
  })
  it('critical-path rows equal the CPM critical path', () => {
    expect(report.sections[1].rows).toHaveLength(solve.cpm!.criticalPath.length)
  })
  it('progress section reports SPI and includes cost EVM (sample has resource rates)', () => {
    const rows = report.sections[2].rows
    const labels = rows.map((r) => String(r[0]))
    expect(labels).toEqual(expect.arrayContaining(['Planned % complete', 'Actual % complete', 'SPI (duration)', 'Forecast finish']))
    expect(labels.some((l) => l.startsWith('Budget at completion'))).toBe(true)  // resources have costPerUnit
  })
  it('resource-loading rows equal the resource count', () => {
    expect(report.sections[3].rows).toHaveLength(project.resources.length)
  })
})

describe('CSV export', () => {
  it('sectionToCSV emits header + rows', () => {
    const csv = sectionToCSV(report.sections[0])
    const lines = csv.split('\n')
    expect(lines[0]).toBe('ID,Activity,Dur (d),Start,Finish,Total float,% complete,Critical')
    expect(lines).toHaveLength(1 + project.activities.length)
  })
  it('quotes fields containing commas/quotes and doubles inner quotes', () => {
    const csv = sectionToCSV({ title: 't', columns: ['a', 'b'], rows: [['x,y', 'he said "hi"']] })
    expect(csv).toBe('a,b\n"x,y","he said ""hi"""')
  })
  it('reportToCSV includes the meta block and every section title', () => {
    const csv = reportToCSV(report)
    expect(csv).toContain('Project,')
    for (const s of report.sections) expect(csv).toContain(s.title)
  })
})
