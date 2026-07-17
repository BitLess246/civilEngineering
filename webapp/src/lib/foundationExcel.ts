// ─────────────────────────────────────────────────────────────────────────
// Excel batch import for the Foundation page — parse a "DESIGN PARAMETERS"
// sheet (one row per footing), run each row through the typed engine, and
// produce a schedule. Also generates a ready-to-fill template. ExcelJS is
// dynamically imported so it stays out of the main bundle. (Replaced the
// abandoned `xlsx` package, which carried unpatched high-severity CVEs — #322.)
// ─────────────────────────────────────────────────────────────────────────
import type { CellValue } from 'exceljs'
import { designSquareFooting } from '../engine/isolatedFooting'
import { designRectangularFooting } from '../engine/rectangularFooting'
import type { ColumnPosition } from '../engine/shear'
import { f0, f2, f3 } from './format'

const SHEET = 'DESIGN PARAMETERS'

/** Flatten an ExcelJS cell value to the primitive the row parser expects
 *  (number | string | ''), unwrapping formula/hyperlink/rich-text objects. */
function cellValue(v: CellValue): number | string {
  if (v == null) return ''
  if (typeof v === 'number' || typeof v === 'string') return v
  if (typeof v === 'boolean') return String(v)
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') {
    const o = v as unknown as Record<string, unknown>
    if ('result' in o) return cellValue(o.result as CellValue)
    if ('text' in o) return String(o.text ?? '')
    if ('richText' in o) return (o.richText as { text: string }[]).map((t) => t.text).join('')
    if ('hyperlink' in o) return String(o.hyperlink ?? '')
  }
  return ''
}

interface ColumnSpec {
  header: string
  key: string
  kind: 'num' | 'str'
  required?: boolean
  note: string
}

/** Header → engine field map. Header text is matched case-insensitively. */
const COLUMNS: ColumnSpec[] = [
  { header: 'Label', key: 'label', kind: 'str', note: 'Optional name (else auto-numbered).' },
  { header: 'Footing Type', key: 'type', kind: 'str', required: true, note: '"Isolated Square" or "Isolated Rectangular".' },
  { header: 'P (kN)', key: 'serviceLoad', kind: 'num', required: true, note: 'Service axial load.' },
  { header: 'Pu (kN)', key: 'ultimateLoad', kind: 'num', required: true, note: 'Factored axial load.' },
  { header: 'Column Width (mm)', key: 'columnWidth', kind: 'num', required: true, note: 'Square column side.' },
  { header: 'Position', key: 'position', kind: 'str', note: 'interior | edge | corner (default interior).' },
  { header: "f'c (MPa)", key: 'fc', kind: 'num', required: true, note: 'Concrete strength.' },
  { header: 'fy (MPa)', key: 'fy', kind: 'num', required: true, note: 'Steel yield.' },
  { header: 'qa (kPa)', key: 'qAllow', kind: 'num', required: true, note: 'Allowable bearing.' },
  { header: 'gamma soil (kN/m3)', key: 'gammaSoil', kind: 'num', required: true, note: 'Soil unit weight.' },
  { header: 'gamma conc (kN/m3)', key: 'gammaConc', kind: 'num', required: true, note: 'Concrete unit weight.' },
  { header: 'H (m)', key: 'H', kind: 'num', required: true, note: 'Total depth to founding level.' },
  { header: 'Bar Dia (mm)', key: 'barDia', kind: 'num', required: true, note: 'Main bar diameter.' },
  { header: 'Cover (mm)', key: 'cover', kind: 'num', required: true, note: 'Clear cover.' },
  { header: 'Surcharge (kPa)', key: 'surcharge', kind: 'num', note: 'Optional, default 0.' },
  { header: 'Aspect Bx/By', key: 'ratio', kind: 'num', note: 'Rectangular only, default 1.5.' },
]

export const TEMPLATE_GUIDE = COLUMNS.map((c) => ({
  header: c.header, required: c.required ? 'yes' : '', note: c.note,
}))

export interface ScheduleRow {
  label: string
  type: string
  ok: boolean
  size: string
  thickness: string
  steel: string
  note: string
}

interface ParsedRow { [k: string]: string | number }

function normalizeType(v: string): 'square' | 'rectangular' | null {
  const s = v.toLowerCase()
  if (s.includes('rect')) return 'rectangular'
  if (s.includes('square') || s.includes('isolated')) return 'square'
  return null
}

function pickColumns(raw: Record<string, unknown>): { row: ParsedRow; unknown: string[] } {
  const lower = new Map<string, ColumnSpec>()
  COLUMNS.forEach((c) => lower.set(c.header.toLowerCase(), c))
  const row: ParsedRow = {}
  const unknown: string[] = []
  for (const [k, val] of Object.entries(raw)) {
    const spec = lower.get(k.trim().toLowerCase())
    if (!spec) { if (String(val).trim() !== '') unknown.push(k); continue }
    if (spec.kind === 'num') {
      const n = typeof val === 'number' ? val : parseFloat(String(val))
      if (Number.isFinite(n)) row[spec.key] = n
    } else {
      row[spec.key] = String(val).trim()
    }
  }
  return { row, unknown }
}

function designRow(r: ParsedRow, index: number): ScheduleRow {
  const label = (r.label as string) || `F-${index + 1}`
  const type = normalizeType(String(r.type ?? ''))
  const base = { label, type: String(r.type ?? '—'), ok: false, size: '—', thickness: '—', steel: '—', note: '' }

  if (!type) return { ...base, note: 'Unknown / unsupported footing type (use Isolated Square or Rectangular).' }

  const required = ['serviceLoad', 'ultimateLoad', 'columnWidth', 'fc', 'fy', 'qAllow', 'gammaSoil', 'gammaConc', 'H', 'barDia', 'cover']
  const missing = required.filter((k) => !Number.isFinite(r[k] as number))
  if (missing.length) return { ...base, note: `Missing/invalid: ${missing.join(', ')}` }

  const common = {
    serviceLoad: r.serviceLoad as number, ultimateLoad: r.ultimateLoad as number,
    columnWidth: r.columnWidth as number, fc: r.fc as number, fy: r.fy as number,
    qAllow: r.qAllow as number, gammaSoil: r.gammaSoil as number, gammaConc: r.gammaConc as number,
    H: r.H as number, barDia: r.barDia as number, cover: r.cover as number,
    surcharge: (r.surcharge as number) ?? 0,
    position: (['interior', 'edge', 'corner'].includes(String(r.position)) ? r.position : 'interior') as ColumnPosition,
  }

  try {
    if (type === 'square') {
      const d = designSquareFooting(common)
      if (!(d.qNet > 0)) return { ...base, type: 'Isolated Square', note: 'Net bearing ≤ 0 — increase qa or reduce depth.' }
      return {
        label, type: 'Isolated Square', ok: true,
        size: `B = ${f2(d.B)} m`,
        thickness: `${f0(d.Dc)} mm`,
        steel: `${d.bars}⌀${common.barDia} @ ${f0(d.barSpacing)} mm e.w.`,
        note: `qNet ${f3(d.qNet)} kPa`,
      }
    }
    const ratio = Number.isFinite(r.ratio as number) && (r.ratio as number) >= 1 ? (r.ratio as number) : 1.5
    const d = designRectangularFooting({ ...common, sizing: { mode: 'ratio', ratio } })
    if (!(d.qNet > 0)) return { ...base, type: 'Isolated Rectangular', note: 'Net bearing ≤ 0 — increase qa or reduce depth.' }
    return {
      label, type: 'Isolated Rectangular', ok: true,
      size: `${f2(d.Bx)} × ${f2(d.By)} m`,
      thickness: `${f0(d.Dc)} mm`,
      steel: `L ${d.long.bars}⌀${common.barDia}@${f0(d.long.spacing)} · S ${d.short.bars}⌀${common.barDia}@${f0(d.short.spacing)}`,
      note: `qNet ${f3(d.qNet)} kPa · ratio ${ratio}`,
    }
  } catch (e) {
    return { ...base, type: type === 'square' ? 'Isolated Square' : 'Isolated Rectangular', note: `Error: ${(e as Error).message}` }
  }
}

export interface BatchResult { rows: ScheduleRow[]; unknownHeaders: string[]; designed: number }

/** Parse an uploaded .xlsx and design every row. Rows are keyed by the header
 *  cells of row 1, so unknown/extra columns are still surfaced. */
export async function importFoundationWorkbook(file: File): Promise<BatchResult> {
  const { Workbook } = (await import('exceljs')).default
  const wb = new Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const ws = wb.getWorksheet(SHEET) ?? wb.worksheets[0]
  if (!ws) throw new Error('The workbook has no sheets.')

  const headers: string[] = []
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => { headers[col - 1] = String(cellValue(cell.value)).trim() })
  if (!headers.some((h) => h)) throw new Error(`Sheet "${ws.name}" has no header row.`)

  const raw: Record<string, unknown>[] = []
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return
    const obj: Record<string, unknown> = {}
    headers.forEach((h, i) => { if (h) obj[h] = cellValue(row.getCell(i + 1).value) })
    raw.push(obj)
  })
  if (!raw.length) throw new Error(`Sheet "${ws.name}" has no data rows.`)

  const unknown = new Set<string>()
  const rows = raw.map((r, i) => {
    const { row, unknown: u } = pickColumns(r)
    u.forEach((h) => unknown.add(h))
    return designRow(row, i)
  })
  return { rows, unknownHeaders: [...unknown], designed: rows.filter((r) => r.ok).length }
}

/** Build and download a ready-to-fill template (.xlsx) with sample rows + a guide. */
export async function downloadFoundationTemplate(): Promise<void> {
  const { Workbook } = (await import('exceljs')).default
  const headers = COLUMNS.map((c) => c.header)
  const sampleSquare = ['F-1', 'Isolated Square', 1000, 1400, 400, 'interior', 28, 415, 200, 18, 24, 1.5, 20, 75, 0, '']
  const sampleRect = ['F-2', 'Isolated Rectangular', 1200, 1680, 450, 'edge', 28, 415, 180, 18, 24, 1.5, 20, 75, 0, 1.5]
  const wb = new Workbook()
  const ws = wb.addWorksheet(SHEET)
  ws.addRow(headers); ws.addRow(sampleSquare); ws.addRow(sampleRect)
  const guide = wb.addWorksheet('PARAMETER GUIDE')
  guide.addRow(['Header', 'Required', 'Notes'])
  TEMPLATE_GUIDE.forEach((g) => guide.addRow([g.header, g.required, g.note]))
  const out = await wb.xlsx.writeBuffer()
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'foundation-template.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}
