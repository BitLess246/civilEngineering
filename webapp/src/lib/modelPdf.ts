// Direct PDF export of the Model Space structure report — A4 portrait calc
// sheet in the drawing-sheet style shared with the calculator pages' print
// reports (mono header strip, CIVENG brand, verdict chip, letterhead grid,
// numbered section rules, PASS/FAIL chips, signature blocks). Rendered with
// jsPDF + autotable as crisp vector text; formulas arrive as LaTeX from the
// solution builders and are converted by texToPlain. This module (and the
// embedded font subsets) is loaded lazily via dynamic import.
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { LetterheadState } from '../components/calc'
import type { ModelReport, ReportSection } from './modelReport'
import { texToPlain } from './texText'
import { SANS, SANS_BOLD, MONO, MONO_BOLD } from './pdfFonts'

// palette (matches index.css tokens)
const INK: [number, number, number] = [15, 27, 42]
const MUTED: [number, number, number] = [92, 102, 117]
const FAINT: [number, number, number] = [163, 157, 141]
const BRAND: [number, number, number] = [15, 76, 146]
const HAIR: [number, number, number] = [227, 225, 218]
const HAIR_SOFT: [number, number, number] = [238, 236, 229]
const OK_FG: [number, number, number] = [20, 96, 58]
const OK_BG: [number, number, number] = [236, 246, 239]
const FAIL_FG: [number, number, number] = [194, 64, 42]
const FAIL_BG: [number, number, number] = [251, 238, 234]
const EQ_BG: [number, number, number] = [249, 248, 244]

const PAGE_W = 210, PAGE_H = 297, M = 14           // mm
const CONTENT_W = PAGE_W - 2 * M
const FOOT_Y = PAGE_H - 12                          // keep-clear line for the footer

export interface ModelPdfInput {
  lh: LetterheadState
  report: ModelReport
  modelImg: string | null      // PNG data URL of the 3D canvas
  badges: string[]
  fileName?: string
}

/** Natural pixel size of a data-URL image (for aspect-correct placement). */
function imageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = reject
    img.src = dataUrl
  })
}

export async function generateModelPdf({ lh, report, modelImg, badges, fileName }: ModelPdfInput): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  doc.addFileToVFS('DVS.ttf', SANS);      doc.addFont('DVS.ttf', 'sans', 'normal')
  doc.addFileToVFS('DVSB.ttf', SANS_BOLD); doc.addFont('DVSB.ttf', 'sans', 'bold')
  doc.addFileToVFS('DVM.ttf', MONO);      doc.addFont('DVM.ttf', 'mono', 'normal')
  doc.addFileToVFS('DVMB.ttf', MONO_BOLD); doc.addFont('DVMB.ttf', 'mono', 'bold')

  const today = new Date().toISOString().slice(0, 10)
  const sheet = lh.sheet || 'S-3D'
  let y = M

  const setF = (family: 'sans' | 'mono', style: 'normal' | 'bold', size: number, color: [number, number, number]) => {
    doc.setFont(family, style); doc.setFontSize(size); doc.setTextColor(...color)
  }
  /** Start a new page when fewer than `need` mm remain. */
  const ensure = (need: number) => {
    if (y + need > FOOT_Y) { doc.addPage(); y = M + 6 }
  }
  const rule = (n: number, title: string) => {
    ensure(16)
    y += 6
    setF('sans', 'bold', 9.5, INK)
    doc.text(`${n} · ${title.toUpperCase()}`, M, y, { charSpace: 0.25 })
    y += 1.6
    doc.setDrawColor(...INK); doc.setLineWidth(0.5)
    doc.line(M, y, M + CONTENT_W, y)
    y += 4
  }
  const chip = (x: number, cy: number, pass: boolean) => {
    const label = pass ? 'PASS' : 'FAIL'
    setF('mono', 'bold', 6, pass ? OK_FG : FAIL_FG)
    const w = doc.getTextWidth(label) + 3
    doc.setFillColor(...(pass ? OK_BG : FAIL_BG))
    doc.roundedRect(x, cy - 2.8, w, 4, 0.8, 0.8, 'F')
    doc.text(label, x + 1.5, cy)
    return w
  }
  const CONC: [number, number, number] = [238, 243, 248]
  /** Vector cross-section (bar layout + stirrup hooks + dimension lines) drawn
   *  into a boxW×boxH mm cell at (x, topY). Gutters are reserved on the bottom
   *  (width dimension) and right (height dimension) so the callouts stay clear. */
  const drawSection = (sec: ReportSection, x: number, topY: number, boxW: number, boxH: number) => {
    const padL = 2.5, padR = 8, padT = 3, padB = 6.5     // gutters for dim callouts
    const availW = boxW - padL - padR, availH = boxH - padT - padB
    const flanged = sec.kind === 'beam' && !!sec.bf && sec.bf > sec.b && !sec.hogging && !!sec.hf
    const drawW = flanged ? sec.bf! : sec.b
    const s = Math.min(availW / drawW, availH / sec.h)
    const wv = drawW * s, hv = sec.h * s, bwv = sec.b * s
    const bx = x + padL + (availW - wv) / 2, by = topY + padT + (availH - hv) / 2
    const webX = bx + (wv - bwv) / 2
    doc.setLineWidth(0.25); doc.setDrawColor(...INK); doc.setFillColor(...CONC)
    if (flanged) {
      const hfv = sec.hf! * s
      doc.rect(webX, by, bwv, hv, 'FD')       // web (full height)
      doc.rect(bx, by, wv, hfv, 'FD')         // flange cap
    } else {
      doc.rect(webX, by, bwv, hv, 'FD')
    }
    // tie / stirrup — bend radius r = 4ds/2 = 2ds (ACI 318-14 §407.3.2)
    const ins = (sec.cover + sec.stirrupDia / 2) * s
    const stX = webX + ins, stY = by + ins, stW = bwv - 2 * ins, stH = hv - 2 * ins
    const cr = Math.max(0.4, Math.min(1.4, 2 * sec.stirrupDia * s))
    doc.setDrawColor(...MUTED); doc.setLineWidth(0.35)
    doc.roundedRect(stX, stY, stW, stH, cr, cr, 'S')
    // bars
    const br = Math.max(0.5, (sec.barDia / 2) * s)
    const barIns = (sec.cover + sec.stirrupDia + sec.barDia / 2) * s
    const bx1 = webX + barIns, bx2 = webX + bwv - barIns
    const spanX = (n: number, i: number) => (n <= 1 ? (bx1 + bx2) / 2 : bx1 + ((bx2 - bx1) * i) / (n - 1))
    // 135° stirrup hooks — the tie is a bent bar with a 135° hook at BOTH ends,
    // meeting at the tension-side corner (bottom for sagging, top for hogging;
    // top for columns). Each free end is a single hairline stroke — same weight
    // as the tie — that bends 45° into the core, the two straddling the corner
    // bar they hook around. Tail ext = max(6ds, 75) mm (ACI 318-14 §425.3.2).
    const hookBottom = sec.kind === 'beam' ? !sec.hogging : false
    const dirX = 1 / Math.SQRT2, dirY = (hookBottom ? -1 : 1) / Math.SQRT2
    const hLen = Math.max(6 * sec.stirrupDia, 75) * s                     // straight tail
    const cornerBarY = hookBottom ? by + hv - barIns : by + barIns
    const edgeY = hookBottom ? stY + stH : stY                           // near tie horizontal leg
    doc.setDrawColor(...MUTED); doc.setLineWidth(0.35)
    // one end bends off the horizontal leg (above/below the bar), the other off
    // the vertical leg (beside it); they straddle the corner bar into the core
    doc.line(bx1, edgeY, bx1 + dirX * hLen, edgeY + dirY * hLen)
    doc.line(stX, cornerBarY, stX + dirX * hLen, cornerBarY + dirY * hLen)
    // interior crossties — each added leg (legs − 2) is a vertical hairline tie
    // gripping an interior bar top & bottom with a 135° hook at each end,
    // alternating sides (§25.7.2.3). Drawn before the bars so they sit on top.
    if (sec.kind === 'beam' && (sec.legs ?? 2) > 2) {
      const nCross = (sec.legs ?? 2) - 2
      const n0 = (sec.layers && sec.layers[0]) || sec.bars
      const yTop = by + barIns, yBot = by + hv - barIns
      const chd = (Math.max(6 * sec.stirrupDia, 75) * s) / Math.SQRT2
      const midX = (bx1 + bx2) / 2
      doc.setDrawColor(...MUTED); doc.setLineWidth(0.35)
      for (let k = 0; k < nCross; k++) {
        const idx = Math.min(n0 - 2, Math.max(1, Math.round(((n0 - 1) * (k + 1)) / (nCross + 1))))
        const xc = spanX(n0, idx)
        const hd = xc <= midX ? 1 : -1               // hooks point toward centre, clear of the corners
        doc.line(xc, yTop, xc, yBot)                 // crosstie leg
        doc.line(xc, yTop, xc + hd * chd, yTop + chd)  // top 135° hook
        doc.line(xc, yBot, xc + hd * chd, yBot - chd)  // bottom 135° hook
      }
    }
    doc.setFillColor(...INK); doc.setDrawColor(...INK); doc.setLineWidth(0.25)
    if (sec.kind === 'beam') {
      const pitch = (sec.barDia + 25) * s
      const tenBottom = !sec.hogging
      ;(sec.layers ?? [sec.bars]).forEach((n, li) => {
        const yb = tenBottom ? by + hv - barIns - li * pitch : by + barIns + li * pitch
        for (let i = 0; i < n; i++) doc.circle(spanX(n, i), yb, br, 'F')
      })
      ;(sec.comprLayers ?? []).forEach((n, li) => {
        const yb = tenBottom ? by + barIns + li * pitch : by + hv - barIns - li * pitch
        for (let i = 0; i < n; i++) doc.circle(spanX(n, i), yb, br, 'S')   // hollow
      })
    } else {
      // column — bars around the perimeter (all-around) or two faces
      const N = Math.max(4, 2 * Math.round(sec.bars / 2))
      const bwIn = sec.b - 2 * barIns / s, hIn = sec.h - 2 * barIns / s
      const nx = sec.fourFace ? Math.max(2, Math.min(N / 2, 2 + Math.round(((N - 4) / 2) * (bwIn / (bwIn + hIn))))) : N / 2
      const ny = sec.fourFace ? N / 2 + 2 - nx : 2
      const yTop = by + barIns, yBot = by + hv - barIns
      for (let i = 0; i < nx; i++) { doc.circle(spanX(nx, i), yTop, br, 'F'); doc.circle(spanX(nx, i), yBot, br, 'F') }
      for (let k = 1; k <= ny - 2; k++) {
        const yy = yTop + ((yBot - yTop) * k) / (ny - 1)
        doc.circle(bx1, yy, br, 'F'); doc.circle(bx2, yy, br, 'F')
      }
    }
    // dimension lines — width below, height on the right (bf across the top for
    // flanged sections). Ticks + centred value, true mm from the design.
    doc.setDrawColor(...FAINT); doc.setLineWidth(0.12)
    setF('mono', 'normal', 4.3, MUTED)
    const hDim = (x0: number, x1: number, yd: number, val: number) => {
      doc.line(x0, yd, x1, yd); doc.line(x0, yd - 0.9, x0, yd + 0.9); doc.line(x1, yd - 0.9, x1, yd + 0.9)
      doc.text(`${Math.round(val)} mm`, (x0 + x1) / 2, yd + 2.4, { align: 'center' })
    }
    const wDimY = by + hv + 3.4
    hDim(webX, webX + bwv, wDimY, sec.b)                       // web width b
    if (flanged) hDim(bx, bx + wv, by - 2, sec.bf!)            // flange width bf (above)
    // height h on the right
    const vx = webX + bwv + 3.6
    doc.line(vx, by, vx, by + hv); doc.line(vx - 0.9, by, vx + 0.9, by); doc.line(vx - 0.9, by + hv, vx + 0.9, by + hv)
    doc.text(`${Math.round(sec.h)} mm`, vx + 1.4, by + hv / 2, { align: 'center', angle: 90 })
  }

  const tableTheme = (right: number[] = []) => ({
    margin: { left: M, right: M, bottom: PAGE_H - FOOT_Y + 2 },
    styles: {
      font: 'sans', fontSize: 7.2, textColor: INK, cellPadding: { top: 1.2, bottom: 1.2, left: 1.4, right: 1.4 },
      lineColor: HAIR_SOFT, lineWidth: { bottom: 0.15 },
    },
    headStyles: { font: 'sans', fontStyle: 'bold' as const, fontSize: 6.4, textColor: MUTED, lineColor: INK, lineWidth: { bottom: 0.4 } },
    alternateRowStyles: {},
    columnStyles: Object.fromEntries(right.map((i) => [i, { halign: 'right' as const, font: 'mono' as const }])),
    theme: 'plain' as const,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    didParseCell: (d: any) => {
      // right-aligned numeric columns must right-align their HEADERS too —
      // headStyles outrank columnStyles in autotable, so set it per cell
      if (d.section === 'head' && right.includes(d.column.index)) d.cell.styles.halign = 'right'
      if (d.section === 'body' && (d.cell.raw === 'PASS' || d.cell.raw === 'FAIL')) {
        d.cell.styles.font = 'mono'; d.cell.styles.fontStyle = 'bold'; d.cell.styles.fontSize = 6.2
        d.cell.styles.textColor = d.cell.raw === 'PASS' ? OK_FG : FAIL_FG
      }
    },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastY = () => (doc as any).lastAutoTable?.finalY as number | undefined

  // ── Brand header + verdict ──
  setF('mono', 'normal', 6.4, FAINT)
  doc.text('CIVENG TOOLKIT · STRUCTURE — CALCULATION REPORT', M, y)
  doc.text(`${sheet} · ${today}`, M + CONTENT_W, y, { align: 'right' })
  y += 1.8
  doc.setDrawColor(...HAIR_SOFT); doc.setLineWidth(0.2)
  doc.line(M, y, M + CONTENT_W, y)
  y += 7
  setF('sans', 'bold', 11.5, INK)
  doc.text('CIVENG', M, y, { charSpace: 0.9 })
  setF('sans', 'bold', 5.4, [122, 117, 104])
  doc.text('TOOLKIT', M + doc.getTextWidth('CIVENG') + 13, y, { charSpace: 0.7 })
  y += 8
  setF('sans', 'bold', 15.5, INK)
  doc.text('Structure — Design Calculation', M, y)
  // verdict chip (top right)
  {
    const w = 52, x = M + CONTENT_W - w, cy = y - 9
    doc.setFillColor(...(report.ok ? OK_BG : FAIL_BG))
    doc.setDrawColor(...(report.ok ? [211, 232, 218] as [number, number, number] : [239, 212, 204] as [number, number, number]))
    doc.setLineWidth(0.25)
    doc.roundedRect(x, cy, w, 13, 1.6, 1.6, 'FD')
    setF('sans', 'bold', 8.4, report.ok ? OK_FG : FAIL_FG)
    doc.text(report.ok ? 'DESIGN OK' : 'CHECK FAILED', x + 3.5, cy + 5.4, { charSpace: 0.2 })
    setF('sans', 'normal', 5.6, report.ok ? [77, 122, 95] : [169, 91, 71])
    doc.text(doc.splitTextToSize(report.governing, w - 7).slice(0, 2), x + 3.5, cy + 8.8)
  }
  y += 4.5
  // badges
  let bx = M
  for (const b of badges) {
    setF('mono', 'normal', 6.2, BRAND)
    const w = doc.getTextWidth(b) + 3.2
    doc.setFillColor(234, 241, 249); doc.setDrawColor(205, 220, 240); doc.setLineWidth(0.2)
    doc.roundedRect(bx, y - 2.9, w, 4.2, 0.7, 0.7, 'FD')
    doc.text(b, bx + 1.6, y)
    bx += w + 2
  }
  y += 6

  // ── Letterhead grid ──
  const lhCells: [string, string, boolean][] = [
    ['PROJECT', lh.project || '—', false], ['SHEET', sheet, true],
    ['PREPARED BY', lh.preparedBy || '—', false], ['DATE', today, true],
    ['ELEMENT', 'Structure — 3D Model Space', false], ['CODES', badges.join(' · '), true],
  ]
  {
    const cw = CONTENT_W / 3, ch = 9.5
    doc.setDrawColor(...HAIR); doc.setLineWidth(0.25)
    doc.roundedRect(M, y, CONTENT_W, ch * 2, 1.6, 1.6, 'S')
    lhCells.forEach(([k, v, mono], i) => {
      const cx = M + (i % 3) * cw, cy = y + Math.floor(i / 3) * ch
      if (i % 3 > 0) { doc.setDrawColor(...HAIR_SOFT); doc.line(cx, cy, cx, cy + ch) }
      if (i >= 3) { doc.setDrawColor(...HAIR_SOFT); doc.line(cx, cy, cx + cw, cy) }
      setF('sans', 'bold', 5, FAINT)
      doc.text(k, cx + 2.5, cy + 3.4, { charSpace: 0.4 })
      setF(mono ? 'mono' : 'sans', mono ? 'normal' : 'bold', 6.8, INK)
      doc.text(doc.splitTextToSize(v, cw - 5)[0] ?? '', cx + 2.5, cy + 7.2)
    })
    y += ch * 2 + 2
  }

  // ── 3D model snapshot ──
  if (modelImg) {
    try {
      const { w, h } = await imageSize(modelImg)
      const drawW = CONTENT_W, drawH = Math.min(drawW * (h / w), 120)
      ensure(drawH + 10)
      y += 2
      doc.setDrawColor(...HAIR); doc.setLineWidth(0.25)
      doc.roundedRect(M, y, drawW, drawH + 6.5, 1.6, 1.6, 'S')
      doc.addImage(modelImg, 'PNG', M + 1, y + 1, drawW - 2, drawH - 2)
      setF('mono', 'normal', 5.8, FAINT)
      doc.text('FIG 1 · 3D STRUCTURAL MODEL — ANALYSIS SNAPSHOT', M + 2.5, y + drawH + 3)
      y += drawH + 9
    } catch { /* snapshot unavailable — skip the figure */ }
  }

  // ── 1 · Design summary ──
  rule(1, 'Design Summary')
  {
    const cw = (CONTENT_W - 5) / 3, ch = 10.5
    report.stats.forEach((s, i) => {
      if (i % 3 === 0) ensure(ch + 2.5)
      const cx = M + (i % 3) * (cw + 2.5)
      doc.setDrawColor(...HAIR); doc.setLineWidth(0.25)
      doc.roundedRect(cx, y, cw, ch, 1.4, 1.4, 'S')
      setF('sans', 'bold', 5, FAINT)
      doc.text(s.label.toUpperCase(), cx + 2.5, y + 3.6, { charSpace: 0.35 })
      setF('mono', 'bold', 8.4, INK)
      const shown = doc.splitTextToSize(s.value, cw - (s.unit ? 12 : 5))[0] ?? ''
      doc.text(shown, cx + 2.5, y + 8.2)
      if (s.unit) { setF('mono', 'normal', 6, FAINT); doc.text(s.unit, cx + 3.5 + doc.getTextWidth(shown) * 8.4 / 6, y + 8.2) }
      if (i % 3 === 2 || i === report.stats.length - 1) y += ch + 2.5
    })
  }
  ensure(20)
  autoTable(doc, {
    ...tableTheme([2]),
    startY: y,
    head: [['Check', 'Scope / governing', 'Ratio', 'Status']],
    body: report.checks.map((c) => [c.name, c.detail, c.ratio === null ? '—' : c.ratio.toFixed(2), c.ok ? 'PASS' : 'FAIL']),
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 44 }, 2: { halign: 'right', font: 'mono', cellWidth: 14 }, 3: { halign: 'right', cellWidth: 16 } },
  })
  y = (lastY() ?? y) + 4

  // ── 2 · Project & design data ──
  rule(2, 'Project & Design Data')
  {
    const half = Math.ceil(report.props.length / 2)
    const rows: string[][] = []
    for (let i = 0; i < half; i++) {
      const a = report.props[i], b = report.props[half + i]
      rows.push([a[0], a[1], b?.[0] ?? '', b?.[1] ?? ''])
    }
    autoTable(doc, {
      ...tableTheme(),
      startY: y,
      body: rows,
      styles: { ...tableTheme().styles, fontSize: 6.6, cellPadding: { top: 1, bottom: 1, left: 0, right: 2 } },
      columnStyles: {
        0: { textColor: MUTED, cellWidth: 26 }, 1: { font: 'mono', cellWidth: 65 },
        2: { textColor: MUTED, cellWidth: 26 }, 3: { font: 'mono' },
      },
    })
    y = (lastY() ?? y) + 4
  }

  // ── 3 · Member schedules ──
  rule(3, 'Member Schedules')
  report.tables.forEach((t, i) => {
    ensure(24)
    setF('sans', 'bold', 8, INK)
    doc.text(`3.${i + 1}  ${t.title}`, M, y)
    y += 2.5
    autoTable(doc, {
      ...tableTheme(t.right ?? []),
      startY: y,
      head: [t.head],
      body: t.rows,
      rowPageBreak: 'avoid',
    })
    y = (lastY() ?? y) + 5.5
  })

  // ── 4 · Worked solutions (every member) ──
  rule(4, 'Worked Solutions')
  const RIGHT_W = 30, LEFT_W = CONTENT_W - RIGHT_W - 4
  report.groups.forEach((g, gi) => {
    ensure(18)
    y += 1.5
    setF('sans', 'bold', 8.6, BRAND)
    doc.text(`4.${gi + 1}  ${g.title}`, M, y)
    y += 1.6
    doc.setDrawColor(...HAIR); doc.setLineWidth(0.3)
    doc.line(M, y, M + CONTENT_W, y)
    y += 4.5
    g.items.forEach((item) => {
      const fig = item.section
      const boxW = 46, boxH = 34
      ensure(fig ? boxH + 5 : 20)
      const headTop = y
      const leftW = fig ? CONTENT_W - boxW - 6 : CONTENT_W
      // cross-section figure — drawn BESIDE the name (top-right of the block)
      if (fig) {
        const fx = M + CONTENT_W - boxW
        setF('sans', 'bold', 5, FAINT)
        doc.text('SECTION', fx + 1, headTop + 1.5)
        doc.setDrawColor(...HAIR); doc.setLineWidth(0.2)
        doc.roundedRect(fx, headTop + 2.5, boxW, boxH, 1, 1, 'S')
        drawSection(fig, fx, headTop + 2.5, boxW, boxH)
      }
      // left stack — name, sub, bar callout, demand summary, plan location.
      // Vertically centre it against the figure so the block reads as one card
      // rather than leaving a tall blank band beside a short caption.
      const flanged = !!fig && fig.kind === 'beam' && !!fig.bf && fig.bf > fig.b && !fig.hogging && !!fig.hf
      const subN = item.sub ? doc.splitTextToSize(item.sub, leftW).length : 0
      const locN = item.loc ? doc.splitTextToSize(item.loc, leftW).length : 0
      const stackH = 4.4 + subN * 3 + (fig ? 3.6 : 0) + (item.details ? 3.3 : 0) + locN * 3.3
      if (fig) y = headTop + 2.5 + Math.max(0, (boxH - stackH) / 2)
      setF('sans', 'bold', 7.8, INK)
      doc.text(item.title, M, y + 1)
      y += 4.4
      if (item.sub) {
        setF('mono', 'normal', 5.8, FAINT)
        for (const w of doc.splitTextToSize(item.sub, leftW)) { doc.text(w, M, y); y += 3 }
      }
      if (fig) {
        const cap = `${fig.bars}⌀${fig.barDia}${flanged ? ` · T bf=${Math.round(fig.bf!)}` : ''} · ${fig.b}×${fig.h}`
        setF('mono', 'bold', 6.6, INK)
        doc.text(cap, M, y + 0.6); y += 3.6
      }
      if (item.details) {
        setF('sans', 'normal', 6.4, MUTED)
        doc.text(item.details, M, y + 0.4); y += 3.3
      }
      if (item.loc) {
        setF('sans', 'normal', 6.4, BRAND)
        for (const w of doc.splitTextToSize(item.loc, leftW)) { doc.text(w, M, y + 0.4); y += 3.3 }
      }
      // clear the figure box before the steps begin
      if (fig) y = Math.max(y, headTop + 2.5 + boxH)
      y += 2.5
      item.steps.forEach((st, si) => {
        ensure(12)
        const stepTop = y
        // left column — title + lines
        setF('mono', 'bold', 6, FAINT)
        doc.text(`${si + 1}`.padStart(2, '0'), M, y + 0.2)
        setF('sans', 'bold', 7, INK)
        doc.text(doc.splitTextToSize(st.title, LEFT_W - 8), M + 6, y)
        y += 3.6
        for (const ln of st.lines) {
          if ('text' in ln) {
            setF('sans', 'normal', 6.6, MUTED)
            const wrapped = doc.splitTextToSize(ln.text, LEFT_W - 6)
            for (const w of wrapped) { ensure(3.2); doc.text(w, M + 6, y); y += 3.1 }
            y += 0.4
          } else {
            setF('mono', 'normal', 6.4, INK)
            const plain = texToPlain(ln.tex)
            const wrapped = doc.splitTextToSize(plain, LEFT_W - 10)
            const boxH = wrapped.length * 3.2 + 2.4
            ensure(boxH + 1.5)
            doc.setFillColor(...EQ_BG); doc.setDrawColor(...HAIR_SOFT); doc.setLineWidth(0.15)
            doc.roundedRect(M + 6, y - 0.6, LEFT_W - 6, boxH, 0.9, 0.9, 'FD')
            let ly = y + 2.6
            for (const w of wrapped) { doc.text(w, M + 8, ly); ly += 3.2 }
            y += boxH + 1.3
          }
        }
        // right margin — PASS/FAIL chip + clause/note (at the step's first page position)
        const rx = M + LEFT_W + 4
        let ry = Math.min(stepTop, y)
        if (st.pass !== undefined) { chip(rx, ry + 0.2, st.pass); ry += 4.6 }
        const margin = st.clause ?? st.note
        if (margin) {
          setF('sans', 'normal', 5.6, FAINT)
          doc.text(doc.splitTextToSize(margin, RIGHT_W - 2), rx, ry)
        }
        y += 1
        doc.setDrawColor(...HAIR_SOFT); doc.setLineWidth(0.15)
        doc.line(M, y, M + CONTENT_W, y)
        y += 3
      })
      y += 2
    })
  })

  // ── Signature blocks + disclaimer ──
  ensure(34)
  y += 6
  const half = (CONTENT_W - 10) / 2
  doc.setDrawColor(...INK); doc.setLineWidth(0.3)
  doc.line(M, y + 10, M + half, y + 10)
  doc.line(M + half + 10, y + 10, M + CONTENT_W, y + 10)
  setF('sans', 'bold', 7, INK)
  doc.text(lh.preparedBy || ' ', M, y + 13.6)
  setF('sans', 'normal', 6, [122, 117, 104])
  doc.text('Prepared by', M, y + 17)
  doc.text('Reviewed by · Date', M + half + 10, y + 17)
  y += 22
  ensure(12)
  setF('sans', 'normal', 5.8, FAINT)
  doc.text(doc.splitTextToSize(
    `Computed client-side by the CivEng Toolkit engine · verify before construction use. Load factors per NSCP 2015 §203.3; strength reduction factors per ACI 318-14 Table 21.2.1; steel design per AISC 360-16 LRFD. Project: ${lh.project || '—'}.`,
    CONTENT_W), M, y)

  // ── Per-page footer (and header strip on continuation pages) ──
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    if (p > 1) {
      setF('mono', 'normal', 5.6, FAINT)
      doc.text('CIVENG TOOLKIT · STRUCTURE — CALCULATION REPORT', M, M - 5)
      doc.text(`${sheet} · ${today}`, M + CONTENT_W, M - 5, { align: 'right' })
      doc.setDrawColor(...HAIR_SOFT); doc.setLineWidth(0.15)
      doc.line(M, M - 3.5, M + CONTENT_W, M - 3.5)
    }
    doc.setDrawColor(...HAIR_SOFT); doc.setLineWidth(0.15)
    doc.line(M, FOOT_Y + 3, M + CONTENT_W, FOOT_Y + 3)
    setF('mono', 'normal', 5.6, FAINT)
    doc.text(`${sheet} · ${lh.project || 'CivEng Toolkit'}`, M, FOOT_Y + 6.5)
    doc.text(`page ${p} / ${pages}`, M + CONTENT_W, FOOT_Y + 6.5, { align: 'right' })
  }

  doc.save(fileName ?? `structure-report-${today}.pdf`)
}
