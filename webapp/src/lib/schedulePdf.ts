// PDF export of a schedule report — A4 portrait, one autoTable per section.
// Loaded lazily via dynamic import so jsPDF stays out of the main bundle.
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { ScheduleReport } from './scheduleReport'

const BRAND: [number, number, number] = [15, 76, 146]
const INK: [number, number, number] = [15, 27, 42]

/** jsPDF's built-in Helvetica lacks ₱ / em-dash / minus glyphs — normalise them. */
const safe = (v: string | number): string =>
  String(v).replace(/₱/g, 'PHP ').replace(/[—−]/g, '-')

/** Build the report PDF document (no I/O — node-testable). */
export function buildSchedulePdf(report: ScheduleReport): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()

  doc.setTextColor(...INK).setFont('helvetica', 'bold').setFontSize(15)
  doc.text(safe(report.title), 14, 16)

  // Meta as two-column key: value lines.
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(92, 102, 117)
  let my = 23
  report.meta.forEach(([k, v], i) => {
    const x = i % 2 === 0 ? 14 : pageW / 2 + 4
    doc.text(`${safe(k)}:  ${safe(v)}`, x, my)
    if (i % 2 === 1) my += 5
  })
  let y = my + (report.meta.length % 2 === 1 ? 5 : 0) + 3

  for (const s of report.sections) {
    doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(...INK)
    doc.text(safe(s.title), 14, y)
    autoTable(doc, {
      head: [s.columns.map(safe)],
      body: s.rows.map((r) => r.map(safe)),
      startY: y + 2,
      margin: { left: 14, right: 14 },
      styles: { fontSize: 8, cellPadding: 1.5, textColor: INK, lineColor: [227, 225, 218], lineWidth: 0.1 },
      headStyles: { fillColor: BRAND, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [249, 248, 244] },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
  }

  const today = new Date().toISOString().slice(0, 10)
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(163, 157, 141)
    doc.text(`CivEng Toolkit · schedule report · ${today}`, 14, doc.internal.pageSize.getHeight() - 8)
    doc.text(`${p} / ${pages}`, pageW - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' })
  }
  return doc
}

/** Build and download the report PDF (browser). */
export function exportSchedulePdf(report: ScheduleReport, fileName?: string): void {
  buildSchedulePdf(report).save(fileName ?? `schedule-report-${new Date().toISOString().slice(0, 10)}.pdf`)
}
