import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { importFoundationWorkbook } from './foundationExcel'

const HEADERS = [
  'Label', 'Footing Type', 'P (kN)', 'Pu (kN)', 'Column Width (mm)', 'Position',
  "f'c (MPa)", 'fy (MPa)', 'qa (kPa)', 'gamma soil (kN/m3)', 'gamma conc (kN/m3)',
  'H (m)', 'Bar Dia (mm)', 'Cover (mm)', 'Surcharge (kPa)', 'Aspect Bx/By',
]

async function toFile(aoa: (string | number)[][]): Promise<File> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('DESIGN PARAMETERS')
  aoa.forEach((r) => ws.addRow(r))
  const out = await wb.xlsx.writeBuffer()
  return { arrayBuffer: async () => out } as unknown as File
}

const makeFile = (rows: (string | number)[][]): Promise<File> => toFile([HEADERS, ...rows])

describe('foundation Excel import', () => {
  it('designs square + rectangular rows', async () => {
    const f = await makeFile([
      ['F-1', 'Isolated Square', 1000, 1400, 400, 'interior', 28, 415, 200, 18, 24, 1.5, 20, 75, 0, ''],
      ['F-2', 'Isolated Rectangular', 1200, 1680, 450, 'edge', 28, 415, 180, 18, 24, 1.5, 20, 75, 0, 1.5],
    ])
    const res = await importFoundationWorkbook(f)
    expect(res.rows).toHaveLength(2)
    expect(res.designed).toBe(2)
    expect(res.rows[0].ok).toBe(true)
    expect(res.rows[0].size).toMatch(/B = /)
    expect(res.rows[1].size).toMatch(/×/)
  })

  it('flags unknown types and missing required fields', async () => {
    const f = await makeFile([
      ['Bad', 'Mystery', 1000, 1400, 400, 'interior', 28, 415, 200, 18, 24, 1.5, 20, 75, 0, ''],
      ['Gap', 'Isolated Square', '', '', 400, 'interior', 28, 415, 200, 18, 24, 1.5, 20, 75, 0, ''],
    ])
    const res = await importFoundationWorkbook(f)
    expect(res.designed).toBe(0)
    expect(res.rows[0].ok).toBe(false)
    expect(res.rows[0].note).toMatch(/Unknown/)
    expect(res.rows[1].note).toMatch(/Missing/)
  })

  it('reports unknown headers', async () => {
    const file = await toFile([
      [...HEADERS, 'Some Extra Column'],
      ['F-1', 'Isolated Square', 1000, 1400, 400, 'interior', 28, 415, 200, 18, 24, 1.5, 20, 75, 0, '', 'junk'],
    ])
    const res = await importFoundationWorkbook(file)
    expect(res.unknownHeaders).toContain('Some Extra Column')
  })
})
