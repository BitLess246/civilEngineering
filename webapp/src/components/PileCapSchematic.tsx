import type { JSX } from 'react'
import type { PileCoord } from '../engine/pileCap'
import { DimBelow, DimSide } from './dims'

const BLUE  = '#0056b3'
const STEEL = '#37526e'
const FILL  = '#eef3f8'

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

      {/* Dimensions: Bx below, By right, pile spacing between the first pile pair */}
      <DimBelow xA={capX} xB={capX + cW} featY={capY + cH} dY={capY + cH + 16}
        label={`Bx = ${(capBx / 1000).toFixed(2)} m`} />
      <DimSide yA={capY} yB={capY + cH} featX={capX + cW} dX={capX + cW + 14}
        label={`By = ${(capBy / 1000).toFixed(2)} m`} side="right" />

      {/* N-piles label */}
      <text x={14} y={capY + cH + 44} fontSize={9.5} fill={STEEL}>
        {coords.length}-pile cap · pile ⌀{pileDia} mm
      </text>
    </svg>
  )
}
