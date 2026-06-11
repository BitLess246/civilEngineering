import type { JSX } from 'react'
import { DimBelow, DimSide } from './dims'

const STROKE = '#37526e'
const FILL = '#eef3f8'
const BAR = '#37526e'

export interface BeamSchematicProps {
  b: number; h: number; cover: number; barDia: number; stirrupDia: number; bars: number; d: number
}

/** Beam cross-section: stirrup outline + tension bars, drawn to scale. */
export function BeamSchematic({ b, h, cover, barDia, stirrupDia, bars, d }: BeamSchematicProps): JSX.Element {
  const W = 320, H = 300
  const padL = 60, padT = 24, availW = 150, availH = 210
  const s = Math.min(availW / b, availH / h)
  const bw = b * s, hh = h * s
  const x0 = padL + (availW - bw) / 2, y0 = padT
  const inset = (cover + stirrupDia / 2) * s
  const br = Math.max(3, (barDia / 2) * s)
  const dPx = d * s

  // tension bar centres along the bottom row
  const barY = y0 + hh - (cover + stirrupDia + barDia / 2) * s
  const x1 = x0 + (cover + stirrupDia + barDia / 2) * s
  const x2 = x0 + bw - (cover + stirrupDia + barDia / 2) * s
  const n = Math.max(2, bars)
  const barsX = Array.from({ length: n }, (_, i) => (n === 1 ? (x1 + x2) / 2 : x1 + ((x2 - x1) * i) / (n - 1)))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: 'auto', fontFamily: 'Arial, sans-serif' }}>
      <text x={padL} y={16} fontSize={11} fontWeight={700} fill="#0056b3">SECTION</text>

      {/* concrete + stirrup */}
      <rect x={x0} y={y0} width={bw} height={hh} rx={2} fill={FILL} stroke={STROKE} strokeWidth={1.6} />
      <rect x={x0 + inset} y={y0 + inset} width={bw - 2 * inset} height={hh - 2 * inset} rx={4}
        fill="none" stroke={BAR} strokeWidth={1.2} />

      {/* tension bars */}
      {barsX.map((bx, i) => <circle key={i} cx={bx} cy={barY} r={br} fill={BAR} />)}

      {/* dimensions: b below, h left, d right (to the tension-steel centroid) */}
      <DimBelow xA={x0} xB={x0 + bw} featY={y0 + hh} dY={y0 + hh + 18} label={`b = ${Math.round(b)} mm`} />
      <DimSide yA={y0} yB={y0 + hh} featX={x0} dX={x0 - 16} label={`h = ${Math.round(h)} mm`} side="left" />
      <DimSide yA={y0} yB={y0 + dPx} featX={x0 + bw} dX={x0 + bw + 16} label={`d = ${Math.round(d)} mm`} side="right" />

      <text x={x0 + bw / 2} y={barY + br + 12} fontSize={8.5} fill={BAR} textAnchor="middle">{n} ⌀{barDia} mm</text>
    </svg>
  )
}
