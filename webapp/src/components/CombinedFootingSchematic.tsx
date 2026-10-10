import type { JSX } from 'react'
import { DimBelow, DimSide } from './dims'
import { DrawingFrame } from './DrawingFrame'
import { STEEL, SHEET_NOTE } from '../engine/sheetInk'
import { barCentres, sampleForDraw } from './footingBars'
import {
  slabWidthAt, topZone, transverseCentresForDraw,
} from './combinedPlanBars'

const STROKE = '#37526e'
const FILL = '#eef3f8'
const COL = '#37526e'

export interface CombinedBarsSpec {
  /** The schedule's bar Ø, mm — one size for every group. */
  db: number
  /** Cover to the mat, mm. */
  cover: number
  /** Longitudinal bottom group (the sagging mat, full length). */
  bottom?: { bars: number; spacing: number } | null
  /** Longitudinal top group (hogging steel over the columns) — dashed. */
  top?: { bars: number; spacing: number } | null
  /** Transverse band under each column, banded at c + 2d, d in mm. */
  transverse: { label: string; xc: number; c: number; spacing: number; d: number }[]
}

export interface CombinedSchematicProps {
  shape: 'Rectangular (CRF)' | 'Trapezoidal (CTF)'
  Bx: number          // length along x, m
  By: number          // mean width (rect), m
  By1: number         // left-end width, m
  By2: number         // right-end width, m
  x1: number          // col-1 centre from left edge, m
  x2: number          // col-2 centre from left edge, m
  col1Width: number   // mm
  col2Width: number   // mm
  /**
   * The bars the schedule quotes, drawn back from those numbers the way the
   * isolated pad's plan draws its mat. Omitted, the drawing stays bare —
   * the model-space thumbnail still wants it that way.
   */
  bars?: CombinedBarsSpec | null
}

/** Plan view of a combined footing (rectangular or trapezoidal) with both columns. */
export function CombinedFootingSchematic({
  shape, Bx, By, By1, By2, x1, x2, col1Width, col2Width, bars,
}: CombinedSchematicProps): JSX.Element {
  const W = 520, H0 = 224
  const padL = 40, padR = 40, padT = 40, padB = 62
  const plotW = W - padL - padR
  const plotH = H0 - padT - padB

  const trap = shape[0] === 'T'
  const wMax = Math.max(By1, By2, By)
  const s = Math.min(plotW / Bx, plotH / wMax)
  const fW = Bx * s
  const fx = padL + (plotW - fW) / 2
  const cy = padT + plotH / 2

  const wL = (trap ? By1 : By) * s
  const wR = (trap ? By2 : By) * s
  // slab outline (trapezoid): left edge height wL, right edge height wR
  const outline = `${fx},${cy - wL / 2} ${fx + fW},${cy - wR / 2} ${fx + fW},${cy + wR / 2} ${fx},${cy + wL / 2}`

  const colRect = (xc: number, cwmm: number) => {
    const cx = fx + xc * s
    const cw = Math.max(6, (cwmm / 1000) * s)
    return { cx, cw }
  }
  const c1 = colRect(x1, col1Width)
  const c2 = colRect(x2, col2Width)

  // ── THE BARS, back from the schedule's "N ⌀db @ s c/c" ────────────────
  // A straight longitudinal bar cannot follow a taper, so on a trapezoidal
  // pad the groups spread across the NARROWEST width, centred — inside the
  // outline at both ends means inside it everywhere. Transverse bars span
  // the pad's own width at their station. Dense groups stride on screen;
  // the callouts quote the schedule's true counts.
  const endInset = Math.max(2, (bars ? bars.cover : 0) / 1000 * s - 1)
  const barW = bars ? Math.min(3, Math.max(1.2, (bars.db / 1000) * s)) : 1.2
  const across = (trap ? Math.min(By1, By2) : By)
  const longCentres = (g?: { bars: number; spacing: number } | null) =>
    bars && g ? sampleForDraw(barCentres(across, bars.cover, { ...g, db: bars.db }), 4 / s) : []
  const botCentres = longCentres(bars?.bottom)
  const topCentres = longCentres(bars?.top)
  const yAt = (c: number) => cy - (across * s) / 2 + c * s
  const [topA, topB] = bars?.top ? topZone(x1, col1Width / 1000, x2, col2Width / 1000) : [0, 0]

  const barNotes: string[] = []
  if (bars) {
    const quoted = (m: { bars: number; spacing: number }) =>
      `${Math.max(2, Math.round(m.bars))}⌀${bars.db} @ ${Math.round(m.spacing)} c/c`
    if (bars.bottom) barNotes.push(`long (x) — bottom: ${quoted(bars.bottom)} · cover ${bars.cover} mm`)
    if (bars.top) barNotes.push(`long (x) — top (dashed): ${quoted(bars.top)} over the columns`)
    for (const t of bars.transverse) {
      const bw = t.c + 2 * (t.d / 1000)
      barNotes.push(`transverse @ ${t.label}: ⌀${bars.db} @ ${Math.round(t.spacing)} c/c · band c+2d = ${bw.toFixed(2)} m`)
    }
  }
  // the callouts live in a strip below the dimension chain; the canvas grows
  // by exactly that strip so the plan's own scale never changes
  const H = H0 + (barNotes.length > 0 ? 18 + (barNotes.length - 1) * 12 : 0)
  const noteY0 = padT + plotH + padB - 6

  return (
    <DrawingFrame label="combined footing">
      <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: 'auto', fontFamily: 'Arial, sans-serif' }}>
        <text x={padL} y={18} fontSize={11} fontWeight={700} fill="#0056b3">PLAN — {shape}</text>

        <polygon points={outline} rx={2} fill={FILL} stroke={STROKE} strokeWidth={1.4} />

        {/* the mat: longitudinal bottom (solid, full length), longitudinal top
            (dashed, over the columns), transverse banded under each column —
            the bars pass under the columns, so the columns draw last */}
        {botCentres.map((c, i) => (
          <line key={`b${i}`} x1={fx + endInset} y1={yAt(c)} x2={fx + fW - endInset} y2={yAt(c)}
            stroke={STEEL} strokeWidth={barW} />
        ))}
        {topCentres.map((c, i) => (
          <line key={`t${i}`} x1={fx + topA * s} y1={yAt(c)} x2={fx + topB * s} y2={yAt(c)}
            stroke={STEEL} strokeWidth={barW} strokeDasharray="5 3" />
        ))}
        {bars?.transverse.map((t, gi) => (
          /* t.d arrives in mm — the band helper works in metres */
          transverseCentresForDraw(t.xc, t.c, t.d / 1000, t.spacing, Bx, bars.db, 4, s).map((c, i) => {
            const wAt = slabWidthAt(c, trap ? By1 : By, trap ? By2 : By, Bx) * s
            return (
              <line key={`v${gi}-${i}`} x1={fx + c * s} y1={cy - wAt / 2 + endInset} x2={fx + c * s} y2={cy + wAt / 2 - endInset}
                stroke={STEEL} strokeWidth={barW} />
            )
          })
        ))}

        {/* columns */}
        {[c1, c2].map((c, i) => (
          <rect key={i} x={c.cx - c.cw / 2} y={cy - c.cw / 2} width={c.cw} height={c.cw} fill={COL} />
        ))}
        <text x={c1.cx} y={cy - wL / 2 - 6} fontSize={9} fill={COL} textAnchor="middle" fontWeight={700}>C1</text>
        <text x={c2.cx} y={cy - wR / 2 - 6} fontSize={9} fill={COL} textAnchor="middle" fontWeight={700}>C2</text>

        {/* dimensions: Bx below the deepest edge; end widths on each side;
            column-centre offsets below the slab */}
        <DimBelow xA={fx} xB={fx + fW} featY={cy + Math.max(wL, wR) / 2} dY={cy + Math.max(wL, wR) / 2 + 30}
          label={`Bx = ${Bx.toFixed(2)} m`} />
        {/* x₁ is usually a few pixels wide, so its label sits outside the
            chain to the left instead of printing over its own ticks */}
        <DimBelow xA={fx} xB={c1.cx} featY={cy + Math.max(wL, wR) / 2} dY={cy + Math.max(wL, wR) / 2 + 14} label="" />
        <text x={fx - 7} y={cy + Math.max(wL, wR) / 2 + 17} fontSize={9.5} fill="#1f77b4" textAnchor="end"
          paintOrder="stroke" stroke="var(--sheet, #fff)" strokeWidth={2.6}>x₁ = {x1.toFixed(2)}</text>
        <DimBelow xA={c1.cx} xB={c2.cx} featY={cy + Math.max(wL, wR) / 2} dY={cy + Math.max(wL, wR) / 2 + 14}
          label={`s = ${(x2 - x1).toFixed(2)}`} />
        <DimSide yA={cy - wL / 2} yB={cy + wL / 2} featX={fx} dX={fx - 12}
          label={`${trap ? 'By₁' : 'By'} = ${(trap ? By1 : By).toFixed(2)} m`} side="left" />
        {/* a rectangle has one width — dimension it once */}
        {trap && <DimSide yA={cy - wR / 2} yB={cy + wR / 2} featX={fx + fW} dX={fx + fW + 12}
          label={`By₂ = ${By2.toFixed(2)} m`} side="right" />}

        {/* the bars the drawing shows, named the way the schedule does */}
        {barNotes.map((note, k) => (
          <g key={`bn${k}`}>
            <line x1={padL} y1={noteY0 + k * 12 - 3} x2={padL + 10} y2={noteY0 + k * 12 - 3} stroke={STEEL} strokeWidth={2} />
            <text x={padL + 14} y={noteY0 + k * 12} fontSize={8.5} fill={SHEET_NOTE}>{note}</text>
          </g>
        ))}
      </svg>
    </DrawingFrame>
  )
}
