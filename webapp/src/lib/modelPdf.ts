// Direct PDF export of the Model Space structure report — A4 portrait calc
// sheet built from the SHARED chrome in `pdfKit` (mono header strip, CIVENG
// brand, verdict chip, letterhead grid, numbered section rules, PASS/FAIL
// chips, equation boxes, signature blocks, per-page footer). The calculator
// pages' `calcPdf` is built from the same kit, which is what keeps the two
// reports looking like sheets from one set instead of two lookalikes that
// drift apart.
//
// What stays here is what only this report has: the reinforcement cross-section
// drawing and the member schedules. Rendered with jsPDF + autotable as crisp
// vector text; formulas arrive as LaTeX from the solution builders and are
// converted by texToPlain. This module (and the embedded font subsets) is
// loaded lazily via dynamic import.
import type { LetterheadState } from '../components/calc'
import type { ModelReport, ReportSection } from './modelReport'
import {
  createSheet, autoTable,
  INK, MUTED, FAINT, BRAND, HAIR, M, CONTENT_W,
} from './pdfKit'

export interface ModelPdfInput {
  lh: LetterheadState
  report: ModelReport
  modelImg: string | null      // PNG data URL of the 3D canvas
  badges: string[]
  fileName?: string
}

export async function generateModelPdf({ lh, report, modelImg, badges, fileName }: ModelPdfInput): Promise<void> {
  const sh = createSheet()
  const { doc } = sh
  const setF = sh.setF
  const ensure = sh.ensure
  const rule = sh.rule
  const tableTheme = sh.tableTheme
  const lastY = sh.lastY

  const today = new Date().toISOString().slice(0, 10)
  const sheet = lh.sheet || 'S-3D'
  const docLabel = 'CIVENG TOOLKIT · STRUCTURE — CALCULATION REPORT'

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
    // C-tie: an interior crosstie that arcs around bar A and bar B (the two bars
    // it grips) at the tie radius, joined by a leg on the far side with a short
    // hook tail, the opening facing `openDir` (toward the section centre). u is
    // the unit A→B axis; used vertically (beams/columns) and horizontally (cols).
    const cTie = (
      A: [number, number], B: [number, number], u: [number, number], openDir: [number, number], rw: number, stub: number,
    ) => {
      const NS = 8, pts: [number, number][] = []
      const P = (Q: [number, number], vx: number, vy: number): [number, number] => [Q[0] + vx, Q[1] + vy]
      pts.push(P(A, openDir[0] * rw + u[0] * stub, openDir[1] * rw + u[1] * stub))
      for (let j = 0; j <= NS; j++) { const t = (Math.PI * j) / NS, c = Math.cos(t), sn = Math.sin(t)
        pts.push(P(A, (openDir[0] * c - u[0] * sn) * rw, (openDir[1] * c - u[1] * sn) * rw)) }
      pts.push(P(B, -openDir[0] * rw, -openDir[1] * rw))
      for (let j = 0; j <= NS; j++) { const t = (Math.PI * j) / NS, c = Math.cos(t), sn = Math.sin(t)
        pts.push(P(B, (-openDir[0] * c + u[0] * sn) * rw, (-openDir[1] * c + u[1] * sn) * rw)) }
      pts.push(P(B, openDir[0] * rw - u[0] * stub, openDir[1] * rw - u[1] * stub))
      doc.setDrawColor(...MUTED); doc.setLineWidth(0.35)
      for (let j = 0; j < pts.length - 1; j++) doc.line(pts[j][0], pts[j][1], pts[j + 1][0], pts[j + 1][1])
    }
    // column bar grid (shared by the crossties and the bar circles below)
    let colNx = 0, colNy = 0
    if (sec.kind === 'column') {
      const N = Math.max(4, 2 * Math.round(sec.bars / 2))
      const bwIn = sec.b - 2 * barIns / s, hIn = sec.h - 2 * barIns / s
      colNx = sec.fourFace ? Math.max(2, Math.min(N / 2, 2 + Math.round(((N - 4) / 2) * (bwIn / (bwIn + hIn))))) : N / 2
      colNy = sec.fourFace ? N / 2 + 2 - colNx : 2
    }
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
    // interior crossties — each added leg is a C-tie gripping an interior bar
    // pair (§25.7.2.3). Drawn before the bars so the bars sit on top.
    const yTopB = by + barIns, yBotB = by + hv - barIns
    const rwC = br + (sec.stirrupDia / 2) * s, stubC = (br + (sec.stirrupDia / 2) * s) * 1.6
    const midX = (bx1 + bx2) / 2, midY = (yTopB + yBotB) / 2
    if (sec.kind === 'beam' && (sec.legs ?? 2) > 2) {
      const nCross = (sec.legs ?? 2) - 2
      const n0 = (sec.layers && sec.layers[0]) || sec.bars
      for (let k = 0; k < nCross; k++) {
        const idx = Math.min(n0 - 2, Math.max(1, Math.round(((n0 - 1) * (k + 1)) / (nCross + 1))))
        const xc = spanX(n0, idx)
        cTie([xc, yTopB], [xc, yBotB], [0, 1], [xc <= midX ? 1 : -1, 0], rwC, stubC)  // vertical
      }
    } else if (sec.kind === 'column') {
      // vertical C-ties grip interior top/bottom-face bars; horizontal C-ties
      // grip interior side-face bars — the added legs of a tied column cage.
      for (let i = 1; i <= colNx - 2; i++) {
        const xc = spanX(colNx, i)
        cTie([xc, yTopB], [xc, yBotB], [0, 1], [xc <= midX ? 1 : -1, 0], rwC, stubC)
      }
      for (let k = 1; k <= colNy - 2; k++) {
        const yy = yTopB + ((yBotB - yTopB) * k) / (colNy - 1)
        cTie([bx1, yy], [bx2, yy], [1, 0], [0, yy <= midY ? 1 : -1], rwC, stubC)  // horizontal
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
      const yTop = by + barIns, yBot = by + hv - barIns
      for (let i = 0; i < colNx; i++) { doc.circle(spanX(colNx, i), yTop, br, 'F'); doc.circle(spanX(colNx, i), yBot, br, 'F') }
      for (let k = 1; k <= colNy - 2; k++) {
        const yy = yTop + ((yBot - yTop) * k) / (colNy - 1)
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


  sh.brandHeader({
    docLabel, title: 'Structure — Design Calculation', sheet, today,
    ok: report.ok, governing: report.governing, badges,
  })
  sh.letterheadGrid([
    ['PROJECT', lh.project || '—', false], ['SHEET', sheet, true],
    ['PREPARED BY', lh.preparedBy || '—', false], ['DATE', today, true],
    ['ELEMENT', 'Structure — 3D Model Space', false], ['CODES', badges.join(' · '), true],
  ])

  // ── 3D model snapshot ──
  if (modelImg) await sh.figure(modelImg, 'FIG 1 · 3D STRUCTURAL MODEL — ANALYSIS SNAPSHOT')

  // ── 1 · Design summary ──
  rule(1, 'Design Summary')
  sh.statCards(report.stats)
  ensure(20)
  autoTable(doc, {
    ...tableTheme([2]),
    startY: sh.y,
    head: [['Check', 'Scope / governing', 'Ratio', 'Status']],
    body: report.checks.map((c) => [c.name, c.detail, c.ratio === null ? '—' : c.ratio.toFixed(2), c.ok ? 'PASS' : 'FAIL']),
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 44 }, 2: { halign: 'right', font: 'mono', cellWidth: 14 }, 3: { halign: 'right', cellWidth: 16 } },
  })
  sh.y = (lastY() ?? sh.y) + 4

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
      startY: sh.y,
      body: rows,
      styles: { ...(tableTheme().styles as object), fontSize: 6.6, cellPadding: { top: 1, bottom: 1, left: 0, right: 2 } },
      columnStyles: {
        0: { textColor: MUTED, cellWidth: 26 }, 1: { font: 'mono', cellWidth: 65 },
        2: { textColor: MUTED, cellWidth: 26 }, 3: { font: 'mono' },
      },
    })
    sh.y = (lastY() ?? sh.y) + 4
  }

  // ── 3 · Member schedules ──
  rule(3, 'Member Schedules')
  report.tables.forEach((t, i) => {
    ensure(24)
    setF('sans', 'bold', 8, INK)
    doc.text(`3.${i + 1}  ${t.title}`, M, sh.y)
    sh.y += 2.5
    autoTable(doc, {
      ...tableTheme(t.right ?? []),
      startY: sh.y,
      head: [t.head],
      body: t.rows,
      rowPageBreak: 'avoid',
    })
    sh.y = (lastY() ?? sh.y) + 5.5
  })

  // ── 4 · Worked solutions (every member) ──
  rule(4, 'Worked Solutions')
  report.groups.forEach((g, gi) => {
    ensure(18)
    sh.y += 1.5
    setF('sans', 'bold', 8.6, BRAND)
    doc.text(`4.${gi + 1}  ${g.title}`, M, sh.y)
    sh.y += 1.6
    doc.setDrawColor(...HAIR); doc.setLineWidth(0.3)
    doc.line(M, sh.y, M + CONTENT_W, sh.y)
    sh.y += 4.5
    g.items.forEach((item) => {
      const fig = item.section
      const boxW = 46, boxH = 34
      ensure(fig ? boxH + 5 : 20)
      const headTop = sh.y
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
      if (fig) sh.y = headTop + 2.5 + Math.max(0, (boxH - stackH) / 2)
      setF('sans', 'bold', 7.8, INK)
      doc.text(item.title, M, sh.y + 1)
      sh.y += 4.4
      if (item.sub) {
        setF('mono', 'normal', 5.8, FAINT)
        for (const w of doc.splitTextToSize(item.sub, leftW)) { doc.text(w, M, sh.y); sh.y += 3 }
      }
      if (fig) {
        const cap = `${fig.bars}⌀${fig.barDia}${flanged ? ` · T bf=${Math.round(fig.bf!)}` : ''} · ${fig.b}×${fig.h}`
        setF('mono', 'bold', 6.6, INK)
        doc.text(cap, M, sh.y + 0.6); sh.y += 3.6
      }
      if (item.details) {
        setF('sans', 'normal', 6.4, MUTED)
        doc.text(item.details, M, sh.y + 0.4); sh.y += 3.3
      }
      if (item.loc) {
        setF('sans', 'normal', 6.4, BRAND)
        for (const w of doc.splitTextToSize(item.loc, leftW)) { doc.text(w, M, sh.y + 0.4); sh.y += 3.3 }
      }
      // clear the figure box before the steps begin
      if (fig) sh.y = Math.max(sh.y, headTop + 2.5 + boxH)
      sh.y += 2.5
      sh.solutionSteps(item.steps)
      sh.y += 2
    })
  })

  sh.signatures(lh.preparedBy)
  sh.disclaimer(
    'Computed client-side by the CivEng Toolkit engine · verify before construction use. '
    + 'Load factors per NSCP 2015 §203.3; strength reduction factors per ACI 318-14 Table 21.2.1; '
    + `steel design per AISC 360-16 LRFD. Project: ${lh.project || '—'}.`,
  )
  sh.pageFooters(docLabel, sheet, today, lh.project)

  doc.save(fileName ?? `structure-report-${today}.pdf`)
}
