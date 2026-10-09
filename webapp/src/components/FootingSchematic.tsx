import type { JSX } from 'react'
import { DimBelow, DimSide } from './dims'
import type { ColumnPosition } from '../engine/shear'
import { DrawingFrame } from './DrawingFrame'
import { STEEL, SHEET_NOTE } from '../engine/sheetInk'
import {
  barCentres, bandBarCentres, sampleForDraw, matSectionLevels, type MatSpec,
} from './footingBars'

const STROKE = '#0f1b2a'
const FILL = '#fff'
const COL = '#0f1b2a'

export interface FootingBarsSpec {
  /** The mat's bar Ø, mm — one size both ways, as the sheet quotes it. */
  db: number
  /** Cover to the mat, mm (bottom + sides, cast against earth). */
  cover: number
  /** Bars running along x — the long direction, or each way on a square pad. */
  long: Omit<MatSpec, 'db'>
  /**
   * Bars along y. Null on a square pad, which runs the long mat both ways;
   * on a rectangular one this is the short-direction mat, and when the
   * engine supplies `bandBars`/`bandFraction` the drawing concentrates it
   * the way §13.3.3.3 asks instead of spreading it uniformly.
   */
  short?: (Omit<MatSpec, 'db'> & { bandBars?: number; bandFraction?: number }) | null
}

export interface SchematicProps {
  /** Footing length along x, m. */
  Bx: number
  /** Footing width along y, m (= Bx for a square footing). */
  By: number
  /** Slab thickness D_c, mm. */
  Dc: number
  /** Square column width, mm. */
  columnWidth: number
  /** Rectangular column's width across y, mm — the plan and the two-way
   *  critical section are drawn at the real aspect once given. */
  columnWidthY?: number
  /** Total depth H, m. */
  H: number
  /**
   * Where the column sits on the pad. Interior is centred; `edge` puts its
   * face flush with the right-hand edge and `corner` with the right and bottom
   * ones — the same convention `criticalSection` truncates on.
   *
   * The drawing used to place the column at the pad centre unconditionally, so
   * a footing designed for an edge or corner column was drawn as an interior
   * one and the sheet contradicted the calculation beside it.
   */
  position?: ColumnPosition
  /** Effective depth, mm — draws the §22.6.4.1 critical section when given. */
  d?: number
  /** Service pressures under the trapezoid, kPa; `qMin` < 0 is uplift. */
  pressure?: { qMax: number; qMin: number } | null
  /**
   * The bottom mat, quoted on the schedule. Given, the plan draws both bar
   * layers and the section cuts them (in-plane bars as the line, cross bars
   * as the dots one diameter above); omitted, the drawing stays bare as the
   * model-space thumbnail still wants it.
   */
  bars?: FootingBarsSpec | null
}

const FREE = '#c2402a'          // a free edge, and anything that follows from one
const CRIT = '#0f4c92'

/** Plan + section of a designed footing, drawn to scale. */
export function FootingSchematic({
  Bx, By, Dc, columnWidth, columnWidthY, H, position = 'interior', d, pressure, bars,
}: SchematicProps): JSX.Element {
  const W = 360
  const cm = columnWidth / 1000

  // ── PLAN (single scale → true proportions) ──
  const planTop = 36
  const RM = 52
  const px0 = 14
  const availW = W - RM - px0
  const availH = 116
  const s = Math.min(availW / Bx, availH / By)
  const fW = Bx * s
  const fH = By * s
  const fx = px0 + (availW - fW) / 2
  const fyTop = planTop
  const fyBot = planTop + fH
  const cpx = Math.max(6, cm * s)
  const cpy = Math.max(6, ((columnWidthY ?? columnWidth) / 1000) * s)
  // The column sits AT the free edge, not at the centre — its face flush with
  // the pad's right edge (`edge`) and with the bottom one too (`corner`).
  const freeX = position !== 'interior'
  const freeY = position === 'corner'
  const cxc = freeX ? fx + fW - cpx / 2 : fx + fW / 2
  const cyc = freeY ? fyBot - cpy / 2 : (fyTop + fyBot) / 2
  // §22.6.4.1 critical section, at d/2 off every face that is not a free edge.
  const hp = d && d > 0 ? (d / 2 / 1000) * s : 0
  const crit = hp > 0 ? {
    x: cxc - cpx / 2 - hp,
    y: cyc - cpy / 2 - hp,
    w: cpx + hp + (freeX ? 0 : hp),
    h: cpy + hp + (freeY ? 0 : hp),
  } : null

  // ── THE MAT, back from the schedule's "N ⌀db @ s c/c" ───────────────────
  // Plan px per metre is `s`; the sample floor is 4 px of screen per bar, so
  // a dense mat strides but its two edge bars always draw (the extent is the
  // drawing's job, the count is the callout's).
  const gapPlan = 4 / s
  const endInset = Math.max(2, (bars ? bars.cover : 0) / 1000 * s - 1)
  const barW = bars ? Math.min(3, Math.max(1.2, (bars.db / 1000) * s)) : 1.2
  /** Long-direction bars: they RUN along x, so the plan spreads them over By. */
  const longCentres = bars
    ? sampleForDraw(barCentres(By, bars.cover, { ...bars.long, db: bars.db }), gapPlan) : []
  /** Short-direction centres across Bx — banded on a rectangular pad. */
  const shortAll = (() => {
    if (!bars) return []
    const sh = bars.short
    if (!sh) return barCentres(Bx, bars.cover, { ...bars.long, db: bars.db })
    if (sh.bandBars == null) return barCentres(Bx, bars.cover, { ...sh, db: bars.db })
    const r = bandBarCentres(Bx, bars.cover, {
      ...sh, db: bars.db, bandBars: sh.bandBars, bandWidth: By * 1000, bandCentre: (cxc - fx) / s,
    })
    return [...r.left, ...r.band, ...r.right].sort((a, b) => a - b)
  })()
  const shortCentres = bars ? sampleForDraw(shortAll, gapPlan) : []
  // What the callout says — the schedule's numbers, not the sampled drawing's.
  const barNotes: string[] = []
  if (bars) {
    const quoted = (m: { bars: number; spacing: number }) =>
      `${Math.max(2, Math.round(m.bars))}⌀${bars.db} @ ${Math.round(m.spacing)} c/c`
    if (bars.short) {
      barNotes.push(`bottom mat — long (x): ${quoted(bars.long)} · cover ${bars.cover} mm`)
      const pct = bars.short.bandFraction != null
        ? ` · ≈${Math.round(bars.short.bandFraction * 100)}% in the central band` : ''
      barNotes.push(`short (y): ${quoted(bars.short)}${pct}`)
    } else {
      barNotes.push(`bottom mat each way: ${quoted(bars.long)} · cover ${bars.cover} mm`)
    }
  }

  // ── SECTION ──
  const secTitleY = fyBot + 64 + Math.max(0, barNotes.length - 1) * 12
  const secTop = secTitleY + 10
  const gl = secTop + 6
  const slabX = 46
  const sW = W - slabX - 44
  const sV = 96 / H
  const Hpx = Math.max(46, H * sV)
  const slabH = Math.max(8, (Dc / 1000) * sV)
  const slabY = gl + (Hpx - slabH)
  const baseY = gl + Hpx
  // column stub scaled to the section's horizontal scale (sW px ≙ Bx m), so it
  // matches the plan's column-to-footing proportion instead of a fixed width.
  const stubW = Math.max(6, cm * (sW / Bx))
  // Mirror the plan offset into the section, on the section's own scale.
  const stubX = freeX ? slabX + sW - stubW : slabX + sW / 2 - stubW / 2
  const soilTicks: JSX.Element[] = []
  for (let x = slabX; x < slabX + sW; x += 12) {
    soilTicks.push(<line key={`s${x}`} x1={x} y1={gl} x2={x - 6} y2={gl + 6} stroke="#caa472" strokeWidth={0.8} />)
  }

  // Section cut along x: the long bars lie IN the plane (the continuous
  // line, on the cover), the short bars cross it (the dots, resting one
  // diameter on top) — the layering `footingCage` builds and `matLayout`
  // designs to. Levels clamp inside the slab on a thin pad.
  const lv = bars ? matSectionLevels(bars.db, bars.cover) : null
  const sxs = sW / Bx
  const yLong = lv ? Math.max(slabY + 1.5, baseY - (lv.longY / 1000) * sV) : 0
  const yShort = lv ? Math.max(slabY + 1, Math.min(yLong - 2.2, baseY - (lv.shortY / 1000) * sV)) : 0
  const endSec = Math.max(2, (bars ? bars.cover : 0) / 1000 * sxs - 1)
  const dotGap = 5 / sxs
  const dotCentres = bars ? sampleForDraw(shortAll, dotGap) : []
  const dotR = bars ? Math.max(1.7, (bars.db / 1000) * sV * 0.6) : 1.7

  const totalH = baseY + (pressure ? 96 : 26)

  return (
    <DrawingFrame label="footing section">
      <svg viewBox={`0 0 ${W} ${totalH}`} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: 'auto', fontFamily: 'Arial, sans-serif' }}>
        <text x={14} y={20} fontSize={11} fontWeight={700} fill="#a39d8d" fontFamily="IBM Plex Mono, monospace" letterSpacing="2">PLAN</text>
        {/* footing + column */}
        <rect x={fx} y={fyTop} width={fW} height={fH} fill={FILL} stroke={STROKE} strokeWidth={1.4} />
        {/* The bottom mat, both ways. Bars stop at the side cover; the
            schedule's own count and spacing stay in the callout below — a
            sampled drawing never quotes a number of its own. */}
        {bars && shortCentres.map((c, i) => (
          <line key={`sy${i}`} x1={fx + c * s} y1={fyTop + endInset} x2={fx + c * s} y2={fyBot - endInset}
            stroke={STEEL} strokeWidth={barW} />
        ))}
        {bars && longCentres.map((c, i) => (
          <line key={`sx${i}`} x1={fx + endInset} y1={fyTop + c * s} x2={fx + fW - endInset} y2={fyTop + c * s}
            stroke={STEEL} strokeWidth={barW} />
        ))}
        {/* The critical section, and which of its sides actually resist. A free
            edge carries no shear, so it is drawn open — that is the difference
            the αs table exists to describe. */}
        {crit && (
          <g>
            <rect x={crit.x} y={crit.y} width={crit.w} height={crit.h}
              fill="none" stroke={CRIT} strokeWidth={1} strokeDasharray="4 3" opacity={0.85} />
            <text x={crit.x - 3} y={crit.y - 3} fontSize={7.5} fill={CRIT} textAnchor="end">crit. @ d/2</text>
          </g>
        )}
        {/* Free edges of the pad, where the column face is flush. */}
        {freeX && <line x1={fx + fW} y1={fyTop} x2={fx + fW} y2={fyBot} stroke={FREE} strokeWidth={3} />}
        {freeY && <line x1={fx} y1={fyBot} x2={fx + fW} y2={fyBot} stroke={FREE} strokeWidth={3} />}
        <rect x={cxc - cpx / 2} y={cyc - cpy / 2} width={cpx} height={cpy} fill={COL} />
        {position !== 'interior' && (
          <text x={fx + 3} y={fyTop + 10} fontSize={7.5} fill={FREE} fontWeight={700}>
            {position === 'corner' ? 'CORNER — 2 free edges' : 'EDGE — 1 free edge'}
          </text>
        )}
        <DimBelow xA={fx} xB={fx + fW} featY={fyBot} dY={fyBot + 20} label={`Bx = ${Bx.toFixed(2)} m`} />
        <DimSide yA={fyTop} yB={fyBot} featX={fx + fW} dX={fx + fW + 10} label={`By = ${By.toFixed(2)} m`} side="right" />

        {/* the mat the drawing shows, named the way the schedule does */}
        {barNotes.map((note, k) => (
          <g key={`bn${k}`}>
            <line x1={px0} y1={fyBot + 33 + k * 12} x2={px0 + 10} y2={fyBot + 33 + k * 12} stroke={STEEL} strokeWidth={2} />
            <text x={px0 + 14} y={fyBot + 36 + k * 12} fontSize={8.5} fill={SHEET_NOTE}>{note}</text>
          </g>
        ))}

        <text x={14} y={secTitleY} fontSize={11} fontWeight={700} fill="#a39d8d" fontFamily="IBM Plex Mono, monospace" letterSpacing="2">SECTION</text>
        {/* ground + soil */}
        <line x1={slabX} y1={gl} x2={slabX + sW} y2={gl} stroke="#8a6d3b" strokeWidth={1.2} />
        {soilTicks}
        {/* slab + column stub */}
        <rect x={slabX} y={slabY} width={sW} height={slabH} fill="#fff" stroke={STROKE} strokeWidth={1.4} />
        <rect x={stubX} y={gl} width={stubW} height={slabY - gl} fill={COL} />
        {/* the mat cut: cross bars as dots on the upper layer, the in-plane
            bars as the line under them */}
        {bars && dotCentres.map((c, i) => (
          <circle key={`dy${i}`} cx={slabX + c * sxs} cy={yShort} r={dotR} fill={STEEL} />
        ))}
        {bars && (
          <line x1={slabX + endSec} y1={yLong} x2={slabX + sW - endSec} y2={yLong}
            stroke={STEEL} strokeWidth={Math.max(1.3, (bars.db / 1000) * sV)} />
        )}
        {/* Bearing pressure. Off-centre the load, and the base no longer bears
            uniformly; past the kern part of it lifts, which is drawn ABOVE the
            line rather than clipped away, because the lift is the finding. */}
        {pressure && (() => {
          const { qMax, qMin } = pressure
          const peak = Math.max(Math.abs(qMax), Math.abs(qMin), 1e-9)
          // Its own zero datum, clear of the slab. With zero ON the base the
          // uplift half climbed back up through the footing it was describing.
          const sc = 34 / peak                       // px per kPa
          const datum = baseY + 42
          // The peak sits at the free edge (right) when the column is offset;
          // centred, the trapezoid degenerates to the uniform rectangle.
          const qR = qMax
          const qL = freeX ? qMin : qMax
          const yL = datum + qL * sc, yR = datum + qR * sc
          const lift = qMin < 0
          return (
            <g>
              <line x1={slabX} y1={datum} x2={slabX + sW} y2={datum} stroke="#a39d8d" strokeWidth={0.8} strokeDasharray="3 2" />
              <path d={`M ${slabX} ${datum} L ${slabX + sW} ${datum} L ${slabX + sW} ${yR} L ${slabX} ${yL} Z`}
                fill={lift ? 'rgba(194,64,42,.14)' : 'rgba(15,76,146,.14)'}
                stroke={lift ? FREE : CRIT} strokeWidth={1} />
              <text x={slabX + sW + 4} y={yR + 3} fontSize={7.5} fill={lift ? FREE : CRIT}>
                {Math.round(qMax)} kPa
              </text>
              <text x={slabX - 4} y={yL + 3} fontSize={7.5} textAnchor="end" fill={lift ? FREE : CRIT}>
                {Math.round(qMin)}
              </text>
              {lift && (
                <text x={slabX + sW / 2} y={datum - 26} fontSize={8} textAnchor="middle"
                  fill={FREE} fontWeight={700}>UPLIFT — resultant outside the kern</text>
              )}
            </g>
          )
        })()}
        <DimSide yA={gl} yB={baseY} featX={slabX} dX={slabX - 12} label={`H = ${H.toFixed(2)} m`} side="left" />
        <DimSide yA={slabY} yB={baseY} featX={slabX + sW} dX={slabX + sW + 8} label={`Dc = ${Math.round(Dc)} mm`} side="right" />
      </svg>
    </DrawingFrame>
  )
}
