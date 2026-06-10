import type { JSX } from 'react'

const STROKE = '#37526e'
const FILL = '#eef3f8'
const COL = '#37526e'
const DIM = '#1f77b4'

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
}

/** Plan view of a combined footing (rectangular or trapezoidal) with both columns. */
export function CombinedFootingSchematic({
  shape, Bx, By, By1, By2, x1, x2, col1Width, col2Width,
}: CombinedSchematicProps): JSX.Element {
  const W = 520, H = 200
  const padL = 24, padR = 24, padT = 40, padB = 44
  const plotW = W - padL - padR
  const plotH = H - padT - padB

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

  return (
    <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: 'auto', fontFamily: 'Arial, sans-serif' }}>
      <text x={padL} y={18} fontSize={11} fontWeight={700} fill="#0056b3">PLAN — {shape}</text>

      <polygon points={outline} rx={2} fill={FILL} stroke={STROKE} strokeWidth={1.4} />

      {/* columns */}
      {[c1, c2].map((c, i) => (
        <rect key={i} x={c.cx - c.cw / 2} y={cy - c.cw / 2} width={c.cw} height={c.cw} fill={COL} />
      ))}
      <text x={c1.cx} y={cy - wL / 2 - 6} fontSize={9} fill={COL} textAnchor="middle" fontWeight={700}>C1</text>
      <text x={c2.cx} y={cy - wR / 2 - 6} fontSize={9} fill={COL} textAnchor="middle" fontWeight={700}>C2</text>

      {/* length dimension */}
      <g>
        <line x1={fx} y1={cy + Math.max(wL, wR) / 2 + 14} x2={fx + fW} y2={cy + Math.max(wL, wR) / 2 + 14} stroke={DIM} strokeWidth={0.9} />
        <text x={fx + fW / 2} y={cy + Math.max(wL, wR) / 2 + 28} fontSize={9.5} fill={DIM} textAnchor="middle">
          Bx = {Bx.toFixed(2)} m
        </text>
      </g>

      {/* width labels */}
      <text x={fx - 4} y={cy} fontSize={9} fill={DIM} textAnchor="end" dominantBaseline="middle">
        {(trap ? By1 : By).toFixed(2)} m
      </text>
      <text x={fx + fW + 4} y={cy} fontSize={9} fill={DIM} textAnchor="start" dominantBaseline="middle">
        {(trap ? By2 : By).toFixed(2)} m
      </text>
    </svg>
  )
}
