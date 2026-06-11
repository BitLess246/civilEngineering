import type { JSX } from 'react'

const STROKE = '#37526e'
const FILL = '#eef3f8'
const BAR = '#37526e'
const DIM = '#1f77b4'

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

      {/* width dim (below) */}
      <line x1={x0} y1={y0 + hh + 14} x2={x0 + bw} y2={y0 + hh + 14} stroke={DIM} strokeWidth={0.9} />
      <text x={x0 + bw / 2} y={y0 + hh + 28} fontSize={9.5} fill={DIM} textAnchor="middle">b = {Math.round(b)} mm</text>

      {/* height dim (left) */}
      <line x1={x0 - 14} y1={y0} x2={x0 - 14} y2={y0 + hh} stroke={DIM} strokeWidth={0.9} />
      <text x={x0 - 24} y={y0 + hh / 2} fontSize={9.5} fill={DIM} textAnchor="middle"
        transform={`rotate(-90 ${x0 - 24} ${y0 + hh / 2})`}>h = {Math.round(h)} mm</text>

      {/* d dim (right) */}
      <line x1={x0 + bw + 14} y1={y0} x2={x0 + bw + 14} y2={y0 + dPx} stroke={DIM} strokeWidth={0.9} strokeDasharray="3 2" />
      <text x={x0 + bw + 24} y={y0 + dPx / 2} fontSize={9} fill={DIM} textAnchor="middle"
        transform={`rotate(-90 ${x0 + bw + 24} ${y0 + dPx / 2})`}>d = {Math.round(d)} mm</text>

      <text x={x0 + bw / 2} y={barY + br + 12} fontSize={8.5} fill={BAR} textAnchor="middle">{n} ⌀{barDia} mm</text>
    </svg>
  )
}
