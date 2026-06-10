import type { JSX } from 'react'
import type { PileCoord } from '../engine/pileCap'

const BLUE  = '#0056b3'
const STEEL = '#37526e'
const FILL  = '#eef3f8'
const PILE  = '#8ab4d8'
const DIM   = '#1f77b4'

interface Props {
  capBx: number        // mm
  capBy: number        // mm
  coords: PileCoord[]  // pile centres from cap centre, mm
  pileDia: number      // mm
  colX: number         // mm
  colY: number         // mm
  reactions: number[]  // service, kN
}

/** Top-view (plan) schematic of the pile cap with pile reactions. */
export function PileCapSchematic({ capBx, capBy, coords, pileDia, colX, colY, reactions }: Props): JSX.Element {
  const W = 320
  const PAD = 40
  const availW = W - 2 * PAD
  const availH = 220

  // Scale to fit cap in the available area
  const s = Math.min(availW / capBx, availH / capBy)

  // Cap corners in SVG coords (cap centre → SVG centre)
  const cx = W / 2
  const cy = availH / 2 + PAD / 2
  const cW = capBx * s
  const cH = capBy * s
  const capX = cx - cW / 2
  const capY = cy - cH / 2

  // Column rectangle
  const colW = colX * s
  const colH = colY * s

  // Pile radius in pixels
  const pr = Math.max(4, pileDia * s / 2)

  const maxR = Math.max(...reactions)

  return (
    <svg viewBox={`0 0 ${W} ${availH + PAD}`} xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: 'auto', fontFamily: 'Arial, sans-serif' }}>

      {/* Title */}
      <text x={14} y={16} fontSize={11} fontWeight={700} fill={BLUE}>PLAN (top view)</text>

      {/* Cap outline */}
      <rect x={capX} y={capY} width={cW} height={cH} rx={2}
        fill={FILL} stroke={STEEL} strokeWidth={1.4} />

      {/* Piles */}
      {coords.map((p, i) => {
        const px = cx + p.x * s
        const py = cy - p.y * s  // SVG y-down → invert y
        const intensity = maxR > 0 ? reactions[i] / maxR : 1
        const fill = `rgba(0, 86, 179, ${(0.25 + 0.65 * intensity).toFixed(2)})`
        return (
          <g key={i}>
            <circle cx={px} cy={py} r={pr} fill={fill} stroke={STEEL} strokeWidth={1} />
            <text x={px} y={py + pr + 9} fontSize={8} fill={STEEL} textAnchor="middle"
              paintOrder="stroke" stroke="#fff" strokeWidth={2}>
              {reactions[i].toFixed(0)} kN
            </text>
          </g>
        )
      })}

      {/* Column (on top of piles) */}
      <rect x={cx - colW / 2} y={cy - colH / 2} width={colW} height={colH}
        fill={STEEL} opacity={0.85} />

      {/* Dimension: cap width Bx */}
      <line x1={capX} y1={capY + cH + 12} x2={capX + cW} y2={capY + cH + 12}
        stroke={DIM} strokeWidth={0.9} />
      <line x1={capX} y1={capY + cH + 6} x2={capX} y2={capY + cH + 18}
        stroke={DIM} strokeWidth={0.7} />
      <line x1={capX + cW} y1={capY + cH + 6} x2={capX + cW} y2={capY + cH + 18}
        stroke={DIM} strokeWidth={0.7} />
      <text x={cx} y={capY + cH + 24} fontSize={9} fill={DIM} textAnchor="middle">
        Bx = {(capBx / 1000).toFixed(2)} m
      </text>

      {/* Dimension: cap height By (right side) */}
      <line x1={capX + cW + 12} y1={capY} x2={capX + cW + 12} y2={capY + cH}
        stroke={DIM} strokeWidth={0.9} />
      <line x1={capX + cW + 6} y1={capY} x2={capX + cW + 18} y2={capY}
        stroke={DIM} strokeWidth={0.7} />
      <line x1={capX + cW + 6} y1={capY + cH} x2={capX + cW + 18} y2={capY + cH}
        stroke={DIM} strokeWidth={0.7} />
      <text x={capX + cW + 26} y={cy} fontSize={9} fill={DIM} textAnchor="middle"
        transform={`rotate(90 ${capX + cW + 26} ${cy})`}>
        By = {(capBy / 1000).toFixed(2)} m
      </text>

      {/* N-piles label */}
      <text x={14} y={capY + cH + 44} fontSize={9.5} fill={STEEL}>
        {coords.length}-pile cap · pile ⌀{pileDia} mm
      </text>
    </svg>
  )
}
