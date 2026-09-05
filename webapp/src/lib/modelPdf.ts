// Direct PDF export of the Model Space structure report — A4 portrait calc
// sheet built from the SHARED chrome in `pdfKit` (mono header strip, the
// wordmark, verdict chip, letterhead grid, numbered section rules, PASS/FAIL
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
import type { ModelReport, ReportSection, ReportTable } from './modelReport'
import type { PlanSheet } from './planSheets'
import { COMPUTED_BY, docLabel as brandDocLabel } from './brand'
import { paintDrawing, paintedSize } from './drawingPdf'
import {
  createSheet, autoTable,
  INK, MUTED, FAINT, BRAND, HAIR, HAIR_SOFT,
  M, CONTENT_W, PAGE_W,
  type RGB,
} from './pdfKit'

const f0 = (v: number) => v.toFixed(0)
const f1 = (v: number) => v.toFixed(1)
const f2 = (v: number) => v.toFixed(2)

export interface ModelPdfInput {
  lh: LetterheadState
  report: ModelReport
  modelImg: string | null      // PNG data URL of the 3D canvas
  badges: string[]
  /** The plan + detail sheet set from `planSheets.buildSheetSet` — the SAME
   *  `Drawing` objects the Plans tab shows, painted as vectors here. Omitted
   *  (or empty) simply leaves the section out. */
  sheets?: PlanSheet[]
  fileName?: string
}

export async function generateModelPdf({ lh, report, modelImg, badges, sheets, fileName }: ModelPdfInput): Promise<void> {
  const sh = createSheet()
  const { doc } = sh
  const setF = sh.setF
  const ensure = sh.ensure
  const rule = sh.rule
  const tableTheme = sh.tableTheme
  const lastY = sh.lastY

  const today = new Date().toISOString().slice(0, 10)
  const sheet = lh.sheet || 'S-3D'
  const docLabel = brandDocLabel('Structure — Calculation Report')

  // Gap-free section numbering — sections render conditionally, so the counter
  // lives here instead of literal rule(1..5) calls. A report from a model whose
  // modal/pushover runs were never made must not print orphaned numbers.
  let secN = 0
  const sec = (title: string): number => { secN += 1; rule(secN, title); return secN }

  /** Small muted paragraph line — notes that are not worth a table. */
  const kv = (text: string, color: RGB = MUTED, size = 6.4) => {
    ensure(6)
    setF('sans', 'normal', size, color)
    for (const line of doc.splitTextToSize(text, CONTENT_W)) { doc.text(line, M, sh.y); sh.y += 3 }
  }

  /** A payload table with a numbered subtitle — the shape every section's
   *  tables take (appendix tables use lettered numbers, e.g. `A.1`). */
  const dataTable = (label: string, t: ReportTable) => {
    ensure(22)
    setF('sans', 'bold', 8, INK)
    doc.text(`${label}  ${t.title}`, M, sh.y)
    sh.y += 2.5
    autoTable(doc, {
      ...tableTheme(t.right ?? []),
      startY: sh.y,
      head: [t.head],
      body: t.rows,
      rowPageBreak: 'avoid',
    })
    sh.y = (lastY() ?? sh.y) + 5.5
  }

  /** Vector capacity curve — framed axes, light grid, polyline, mm/kN ticks. */
  const drawCurve = (title: string, curve: { x: number; y: number }[], xLabel: string, yLabel: string) => {
    if (curve.length < 2) return
    const H = 56
    ensure(H + 22)
    setF('sans', 'bold', 7.6, INK)
    doc.text(title, M, sh.y + 1)
    sh.y += 4
    const x0 = M + 17, y0 = sh.y, x1 = M + CONTENT_W - 2, y1 = sh.y + H
    const maxX = Math.max(...curve.map((p) => p.x)), maxY = Math.max(...curve.map((p) => p.y))
    if (!(maxX > 0) || !(maxY > 0)) return
    const px = (x: number) => x0 + (x / maxX) * (x1 - x0)
    const py = (y: number) => y1 - (y / maxY) * (y1 - y0)
    doc.setDrawColor(...HAIR); doc.setLineWidth(0.25)
    doc.rect(x0, y0, x1 - x0, y1 - y0, 'S')
    doc.setDrawColor(...HAIR_SOFT); doc.setLineWidth(0.15)
    for (const fr of [0.25, 0.5, 0.75]) {
      doc.line(x0 + (x1 - x0) * fr, y0, x0 + (x1 - x0) * fr, y1)
      doc.line(x0, y1 - (y1 - y0) * fr, x1, y1 - (y1 - y0) * fr)
    }
    doc.setDrawColor(...BRAND); doc.setLineWidth(0.5)
    for (let i = 1; i < curve.length; i++)
      doc.line(px(curve[i - 1].x), py(curve[i - 1].y), px(curve[i].x), py(curve[i].y))
    setF('mono', 'normal', 5.2, MUTED)
    doc.text('0', x0, y1 + 3, { align: 'center' })
    doc.text(f0(maxX), x1, y1 + 3, { align: 'right' })
    doc.text('0', x0 - 1.5, y1 + 1, { align: 'right' })
    doc.text(f0(maxY), x0 - 1.5, y0 + 2, { align: 'right' })
    doc.text(xLabel, (x0 + x1) / 2, y1 + 6.8, { align: 'center' })
    doc.text(yLabel, x0 - 12, (y0 + y1) / 2, { align: 'center', angle: 90 })
    sh.y = y1 + 10
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
    // An L (edge) beam's overhang is all on one side — Table 406.3.2.1's edge
    // row — so its web sits flush with the flange, not centred under it.
    const webX = flanged && sec.edge ? bx : bx + (wv - bwv) / 2
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

  // ── 1 · Design summary (with the executive status panels) ──
  sec('Design Summary')
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

  // Executive status — a ✓ is printed only when the engine actually produced
  // one; analyses never run print NOT RUN, never a pass (spec data-integrity).
  if (report.exec) {
    const panel = (title: string, list: { label: string; ok: boolean | null; note?: string }[]) => {
      if (!list.length) return
      ensure(16)
      setF('sans', 'bold', 7.6, BRAND)
      doc.text(title.toUpperCase(), M, sh.y, { charSpace: 0.2 })
      sh.y += 1.5
      autoTable(doc, {
        ...tableTheme(),
        startY: sh.y,
        head: [['Check', 'Status', 'Note']],
        body: list.map((s) => [s.label, s.ok === null ? 'NOT RUN' : s.ok ? 'PASS' : 'FAIL', s.note ?? '']),
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52 }, 1: { halign: 'right', cellWidth: 18 }, 2: { fontSize: 6.2, textColor: MUTED } },
        rowPageBreak: 'avoid',
      })
      sh.y = (lastY() ?? sh.y) + 3.5
    }
    panel('Analysis', report.exec.analysis)
    panel('Design', report.exec.design)
    if (report.exec.optimization) panel('Optimization', [report.exec.optimization])
    sh.y += 1
  }

  // ── 2 · Project & design data ──
  sec('Project & Design Data')
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

  // ── Analytical model ──
  if (report.modelSummary) {
    const n = sec('Analytical Model')
    dataTable(`${n}.1`, report.modelSummary)
    kv('Node coordinates, member connectivity, supports and section properties are tabulated in the appendices.')
  }

  // ── Loading ──
  if (report.loading) {
    const n = sec('Loading')
    const tabs = [report.loading.cases, report.loading.combos, report.loading.assignments]
      .filter((t): t is ReportTable => !!t)
    tabs.forEach((t, i) => dataTable(`${n}.${i + 1}`, t))
  }

  // ── Linear static analysis ──
  if (report.linear) {
    const n = sec('Linear Static Analysis')
    const L = report.linear
    kv(`${L.runs} case runs${L.skipped ? ` (${L.skipped} skipped)` : ''} · governing case ${L.governingCombo}. Full reactions and member-force envelopes are tabulated in the appendices.`)
    const blocks: { equil?: typeof L.equilibrium; table?: ReportTable }[] = []
    if (L.equilibrium) blocks.push({ equil: L.equilibrium })
    if (L.displacements) blocks.push({ table: L.displacements })
    if (L.governingForces) blocks.push({ table: L.governingForces })
    blocks.forEach((b, i) => {
      const label = `${n}.${i + 1}`
      if (b.equil) {
        const e = b.equil
        ensure(30)
        setF('sans', 'bold', 8, INK)
        doc.text(`${label}  Static equilibrium — ${e.combo}`, M, sh.y)
        sh.y += 2.5
        autoTable(doc, {
          ...tableTheme([1, 2, 3]),
          startY: sh.y,
          head: [['Statics self-check', 'Fx (kN)', 'Fy (kN)', 'Fz (kN)']],
          body: [
            ['Σ applied', f2(e.applied[0]), f2(e.applied[1]), f2(e.applied[2])],
            ['Σ reactions', f2(e.reacted[0]), f2(e.reacted[1]), f2(e.reacted[2])],
            ['Difference', f2(e.applied[0] + e.reacted[0]), f2(e.applied[1] + e.reacted[1]), f2(e.applied[2] + e.reacted[2])],
            ['Max residual, % of load', e.residPct.toExponential(1), '', ''],
            ['Status (≤ 1%)', e.ok ? 'PASS' : 'FAIL', '', ''],
          ],
          columnStyles: { 0: { fontStyle: 'bold', cellWidth: 48 } },
          rowPageBreak: 'avoid',
        })
        sh.y = (lastY() ?? sh.y) + 4
      } else if (b.table) {
        dataTable(label, b.table)
      }
    })
  }

  // ── Modal analysis ──
  if (report.modal) {
    const n = sec('Modal Analysis')
    dataTable(`${n}.1`, report.modal.table)
    const cov = report.modal.coverage
    kv(`Total lumped mass ${f1(report.modal.totalMass[0])} / ${f1(report.modal.totalMass[1])} / ${f1(report.modal.totalMass[2])} t (X/Y/Z). `
      + `Cumulative effective mass after all ${report.modal.modes} modes: UX ${(cov[0] * 100).toFixed(1)}% · UY ${(cov[1] * 100).toFixed(1)}% · UZ ${(cov[2] * 100).toFixed(1)}%.`)
  }

  // ── Nonlinear time-history ──
  if (report.nonlinear) {
    sec('Nonlinear Time-History Analysis')
    const N = report.nonlinear
    autoTable(doc, {
      ...tableTheme(),
      startY: sh.y,
      head: [['Nonlinear analysis status', 'Value']],
      body: [
        ['Model', N.source],
        ['Elastic period', N.period !== null ? `${f2(N.period)} s` : '—'],
        ['Convergence', N.converged ? 'PASS' : 'FAIL'],
        ['Max iterations per step', N.maxIterations !== null ? f0(N.maxIterations) : '—'],
        ['Worst residual', N.worstResidual !== null ? N.worstResidual.toExponential(2) : '—'],
        ['Peak ductility demand', N.ductility !== null ? f2(N.ductility) : '—'],
        ['Hinges yielded', N.yieldedHinges !== null ? f0(N.yieldedHinges) : '—'],
        ['Energy dissipated', N.totalDissipated !== null ? `${f1(N.totalDissipated)} kN·m` : '—'],
        ['Peak base shear', N.peakBaseShear !== null ? `${f1(N.peakBaseShear)} kN` : '—'],
        ['Peak displacement', N.peakDisp !== null ? `${f1(N.peakDisp * 1000)} mm` : '—'],
      ],
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52 } },
      rowPageBreak: 'avoid',
    })
    sh.y = (lastY() ?? sh.y) + 5
  }

  // ── Pushover ──
  if (report.pushover) {
    const n = sec('Pushover Analysis')
    const P = report.pushover
    kv(`Control node ${P.controlNode} · H = ${f1(P.totalHeight)} m · ${P.events} hinge events`
      + `${P.mechanism ? ' · collapse mechanism reached' : ''}${P.pmInteraction ? ' · P–M interaction at hinges' : ''}${P.pDelta ? ' · second-order P-Δ' : ''}.`
      + ' Performance-point criteria are not computed by the engine and are deliberately not reported.')
    drawCurve('PUSHOVER CAPACITY CURVE — BASE SHEAR vs ROOF DISPLACEMENT', P.curve, 'Roof displacement (mm)', 'Base shear (kN)')
    dataTable(`${n}.1`, P.hingeTable)
    if (P.hingeOverflow) dataTable(`${n}.1 (continued)`, P.hingeOverflow)
  }

  // ── Biaxial column checks ──
  if (report.biaxial) {
    const n = sec('Biaxial Column Checks')
    dataTable(`${n}.1`, report.biaxial.table)
    const bx = report.biaxial.skewPushover
    if (bx) {
      drawCurve(`BIAXIAL PUSHOVER — ${f0(bx.angleDeg)}° SKEW, BASE SHEAR vs CONTROL DISPLACEMENT`, bx.curve,
        `Control displacement along ${bx.controlDir.toUpperCase()} (mm)`, 'Base shear (kN)')
      kv(`Peak base shear ${f1(bx.peakShear)} kN · ${bx.yieldedHinges} hinge(s) past yield at the end of the push.`)
    }
  }

  // ── Design optimization ──
  if (report.optimization) {
    const n = sec('Design Optimization')
    const O = report.optimization
    ensure(14)
    setF('sans', 'bold', 7.6, BRAND)
    doc.text('OBJECTIVE, AS IMPLEMENTED', M, sh.y, { charSpace: 0.2 })
    sh.y += 4
    for (const line of O.objective) kv(`•  ${line}`, MUTED, 6.6)
    sh.y += 1
    const tabs: ReportTable[] = [
      O.steps,
      ...(O.initialVsFinal.rows.length ? [O.initialVsFinal] : []),
      ...(O.totals.length ? [{ title: 'Quantities — initial vs final', head: ['Quantity', 'Initial', 'Final'], right: [1, 2], rows: O.totals.map((t) => [t.label, t.before, t.after]) }] : []),
    ]
    tabs.forEach((t, i) => dataTable(`${n}.${i + 1}`, t))
    if (!O.converged && O.stopReason) kv(`Optimizer stopped: ${O.stopReason}`, FAINT)
  }

  // ── Member schedules ──
  const nSched = sec('Member Schedules')
  report.tables.forEach((t, i) => {
    ensure(24)
    setF('sans', 'bold', 8, INK)
    doc.text(`${nSched}.${i + 1}  ${t.title}`, M, sh.y)
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

  // ── Worked solutions (every member) ──
  const nSol = sec('Worked Solutions')
  report.groups.forEach((g, gi) => {
    ensure(18)
    sh.y += 1.5
    setF('sans', 'bold', 8.6, BRAND)
    doc.text(`${nSol}.${gi + 1}  ${g.title}`, M, sh.y)
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
        const cap = `${fig.bars}⌀${fig.barDia}${flanged ? ` · ${fig.edge ? 'L' : 'T'} bf=${Math.round(fig.bf!)}` : ''} · ${fig.b}×${fig.h}`
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

  // ── Traceability — analysis → design → schedule → detailing ──
  if (report.trace?.length) {
    sec('Traceability — Analysis → Design → Schedule')
    autoTable(doc, {
      ...tableTheme([6]),
      startY: sh.y,
      head: [['Member', 'Location', 'Case', 'Demand (governing)', 'Required', 'Provided (final)', 'Util', 'Status']],
      body: report.trace.map((t) => [
        `${t.kind === 'beam' ? 'FB' : 'C'} · ${t.member}`,
        t.loc ?? '—', t.combo ?? '—', t.demand, t.required, t.provided,
        t.util !== undefined ? f2(t.util) : '—', t.ok === false ? 'FAIL' : 'PASS',
      ]),
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 20 }, 1: { fontSize: 5.8, cellWidth: 20 },
        2: { fontSize: 5.8, cellWidth: 18 }, 3: { fontSize: 5.9 }, 4: { fontSize: 5.9 }, 5: { fontSize: 5.9 },
        6: { halign: 'right', font: 'mono', cellWidth: 10 }, 7: { halign: 'right', cellWidth: 12 },
      },
      rowPageBreak: 'avoid',
    })
    sh.y = (lastY() ?? sh.y) + 5
    kv('Each governing member is traced from its governing load case, through the required steel, to the bars the schedule and the placed cage carry — one source of truth for the final reinforcement.')
  }

  // ── Governing design summary ──
  if (report.governingSummary) {
    const n = sec('Governing Design Summary')
    dataTable(`${n}.1`, report.governingSummary.table)
  }

  // ── Drawings (the same sheets the Plans tab shows) ──
  //
  // Painted as VECTORS through the shared `paintDrawing`, not rasterised: a
  // 261 mm dimension has to stay readable when the sheet is printed, and a
  // screenshot of the tab would not be.
  if (sheets?.length) {
    const nDraw = sec('Drawings')
    let n = 0
    let lastGroup = ''
    for (const s of sheets) {
      if (s.group !== lastGroup) {
        lastGroup = s.group
        ensure(14)
        sh.y += 2
        setF('sans', 'bold', 8, INK)
        doc.text(s.group.toUpperCase(), M, sh.y, { charSpace: 0.2 })
        sh.y += 3
      }
      n += 1
      const box = { x: M, y: sh.y, w: CONTENT_W, maxH: 150 }
      const size = paintedSize(s.drawing, box)
      // Keep a sheet with its caption rather than orphaning the caption on the
      // next page — the same rule the soils report figures use.
      ensure(size.height + 14)
      const placed = { ...box, y: sh.y + 3, x: (PAGE_W - size.width) / 2 }
      paintDrawing(doc, s.drawing, placed)
      sh.y = placed.y + size.height + 3.5

      setF('sans', 'bold', 7, INK)
      doc.text(`${nDraw}.${n}  ${s.title}${s.subtitle ? ` · ${s.subtitle}` : ''}`, M, sh.y)
      sh.y += 3.4
      for (const w of s.warnings) {
        setF('sans', 'normal', 6.4, MUTED)
        for (const line of doc.splitTextToSize(`\u26a0 ${w}`, CONTENT_W)) { doc.text(line, M, sh.y); sh.y += 3 }
      }
      sh.y += 3
    }
  }

  // ── Engineering status — from actual engine results, NOT RUN when absent ──
  if (report.status?.length) {
    sec('Analysis / Design Status')
    autoTable(doc, {
      ...tableTheme([1]),
      startY: sh.y,
      head: [['Check', 'Status', 'Detail']],
      body: report.status.map((s) => [s.check, s.status, s.detail ?? '']),
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52 }, 1: { halign: 'right', cellWidth: 20 }, 2: { fontSize: 6.2, textColor: MUTED } },
      rowPageBreak: 'avoid',
    })
    sh.y = (lastY() ?? sh.y) + 5
  }

  // ── Appendices — large datasets, lettered for the ones that exist ──
  for (const ap of report.appendices ?? []) {
    ensure(20)
    sh.y += 2
    setF('sans', 'bold', 8.6, BRAND)
    doc.text(`APPENDIX ${ap.letter} — ${ap.title.toUpperCase()}`, M, sh.y, { charSpace: 0.2 })
    sh.y += 1.6
    doc.setDrawColor(...HAIR); doc.setLineWidth(0.3)
    doc.line(M, sh.y, M + CONTENT_W, sh.y)
    sh.y += 4.5
    ap.tables.forEach((t, i) => dataTable(`${ap.letter}.${i + 1}`, t))
  }

  sh.signatures(lh.preparedBy)
  sh.disclaimer(
    COMPUTED_BY + ' '
    + 'Load factors per NSCP 2015 §203.3; strength reduction factors per ACI 318-14 Table 21.2.1; '
    + `steel design per AISC 360-16 LRFD. Project: ${lh.project || '—'}.`,
  )
  sh.pageFooters(docLabel, sheet, today, lh.project)

  doc.save(fileName ?? `structure-report-${today}.pdf`)
}
