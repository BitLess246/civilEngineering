import type { JSX } from 'react'
import { DimBelow, DimSide } from './dims'
import type { ColumnPosition } from '../engine/shear'

const STROKE = '#0f1b2a'
const FILL = '#fff'
const COL = '#0f1b2a'

export interface SchematicProps {
  /** Footing length along x, m. */
  Bx: number
  /** Footing width along y, m (= Bx for a square footing). */
  By: number
  /** Slab thickness D_c, mm. */
  Dc: number
  /** Square column width, mm. */
  columnWidth: number
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
}

const FREE = '#c2402a'          // a free edge, and anything that follows from one
const CRIT = '#0f4c92'

/** Plan + section of a designed footing, drawn to scale. */
export function FootingSchematic({
  Bx, By, Dc, columnWidth, H, position = 'interior', d, pressure,
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
  // The column sits AT the free edge, not at the centre — its face flush with
  // the pad's right edge (`edge`) and with the bottom one too (`corner`).
  const freeX = position !== 'interior'
  const freeY = position === 'corner'
  const cxc = freeX ? fx + fW - cpx / 2 : fx + fW / 2
  const cyc = freeY ? fyBot - cpx / 2 : (fyTop + fyBot) / 2
  // §22.6.4.1 critical section, at d/2 off every face that is not a free edge.
  const hp = d && d > 0 ? (d / 2 / 1000) * s : 0
  const crit = hp > 0 ? {
    x: cxc - cpx / 2 - hp,
    y: cyc - cpx / 2 - hp,
    w: cpx + hp + (freeX ? 0 : hp),
    h: cpx + hp + (freeY ? 0 : hp),
  } : null

  // ── SECTION ──
  const secTitleY = fyBot + 64
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

  const totalH = baseY + (pressure ? 96 : 26)

  return (
    <svg viewBox={`0 0 ${W} ${totalH}`} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: 'auto', fontFamily: 'Arial, sans-serif' }}>
      <text x={14} y={20} fontSize={11} fontWeight={700} fill="#a39d8d" fontFamily="IBM Plex Mono, monospace" letterSpacing="2">PLAN</text>
      {/* footing + column */}
      <rect x={fx} y={fyTop} width={fW} height={fH} fill={FILL} stroke={STROKE} strokeWidth={1.4} />
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
      <rect x={cxc - cpx / 2} y={cyc - cpx / 2} width={cpx} height={cpx} fill={COL} />
      {position !== 'interior' && (
        <text x={fx + 3} y={fyTop + 10} fontSize={7.5} fill={FREE} fontWeight={700}>
          {position === 'corner' ? 'CORNER — 2 free edges' : 'EDGE — 1 free edge'}
        </text>
      )}
      <DimBelow xA={fx} xB={fx + fW} featY={fyBot} dY={fyBot + 20} label={`Bx = ${Bx.toFixed(2)} m`} />
      <DimSide yA={fyTop} yB={fyBot} featX={fx + fW} dX={fx + fW + 10} label={`By = ${By.toFixed(2)} m`} side="right" />

      <text x={14} y={secTitleY} fontSize={11} fontWeight={700} fill="#a39d8d" fontFamily="IBM Plex Mono, monospace" letterSpacing="2">SECTION</text>
      {/* ground + soil */}
      <line x1={slabX} y1={gl} x2={slabX + sW} y2={gl} stroke="#8a6d3b" strokeWidth={1.2} />
      {soilTicks}
      {/* slab + column stub */}
      <rect x={slabX} y={slabY} width={sW} height={slabH} fill="#fff" stroke={STROKE} strokeWidth={1.4} />
      <rect x={stubX} y={gl} width={stubW} height={slabY - gl} fill={COL} />
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
  )
}
