import type { JSX } from 'react'

export interface DiagramProps {
  /** Station coordinates along the footing, m (monotonic increasing). */
  xs: number[]
  /** Ordinate at each station (kN, kN·m, kPa …). */
  ys: number[]
  title: string
  unit: string
  /** Stroke colour of the curve. */
  color?: string
  /** Optional vertical reference lines (e.g. column centrelines), in x-units. */
  vlines?: { x: number; label?: string }[]
  /** Mark the global max & min ordinates with diamonds + labels. */
  markExtrema?: boolean
  /** Decimal places for value labels. */
  decimals?: number
}

const AXIS = '#94a3b8'
const ZERO = '#475569'
const GRID = '#eef2f7'

/**
 * Generic filled line diagram (load / shear / moment) drawn from the engine's
 * sampled arrays. A zero baseline is always shown; the fill goes from the curve
 * to that baseline so sign changes read at a glance.
 */
export function Diagram({
  xs, ys, title, unit, color = '#0056b3', vlines = [], markExtrema = true, decimals = 1,
}: DiagramProps): JSX.Element {
  const W = 520, H = 220
  const padL = 52, padR = 18, padT = 28, padB = 30
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const xMin = xs[0], xMax = xs[xs.length - 1]
  const xSpan = xMax - xMin || 1
  let yMax = Math.max(0, ...ys)
  let yMin = Math.min(0, ...ys)
  if (yMax === yMin) { yMax = 1; yMin = -1 }
  const ySpan = yMax - yMin

  const sx = (x: number) => padL + ((x - xMin) / xSpan) * plotW
  const sy = (y: number) => padT + ((yMax - y) / ySpan) * plotH
  const y0 = sy(0)

  const linePts = xs.map((x, i) => `${sx(x).toFixed(1)},${sy(ys[i]).toFixed(1)}`).join(' ')
  const fillPts = `${sx(xs[0]).toFixed(1)},${y0.toFixed(1)} ${linePts} ${sx(xs[xs.length - 1]).toFixed(1)},${y0.toFixed(1)}`

  // Extrema
  let iMax = 0, iMin = 0
  ys.forEach((y, i) => { if (y > ys[iMax]) iMax = i; if (y < ys[iMin]) iMin = i })

  // y gridlines / ticks (0, max, min)
  const yticks = Array.from(new Set([yMin, 0, yMax])).filter((v) => Number.isFinite(v))

  const fmt = (v: number) => v.toFixed(decimals)

  function Marker({ i, place }: { i: number; place: 'above' | 'below' }) {
    const x = sx(xs[i]), y = sy(ys[i])
    const ly = place === 'above' ? y - 9 : y + 15
    return (
      <g>
        <path d={`M${x} ${y - 4} L${x + 4} ${y} L${x} ${y + 4} L${x - 4} ${y} Z`} fill={color} />
        <text x={x} y={ly} fontSize={9.5} fill={color} fontWeight={700} textAnchor="middle"
          paintOrder="stroke" stroke="#fff" strokeWidth={2.6}>
          {fmt(ys[i])}@{xs[i].toFixed(2)}m
        </text>
      </g>
    )
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: 'auto', fontFamily: 'Arial, sans-serif' }}>
      <text x={padL} y={16} fontSize={11} fontWeight={700} fill="#0056b3">{title}</text>
      <text x={W - padR} y={16} fontSize={9.5} fill="#94a3b8" textAnchor="end">{unit}</text>

      {/* y gridlines + labels */}
      {yticks.map((v) => (
        <g key={`y${v}`}>
          <line x1={padL} y1={sy(v)} x2={W - padR} y2={sy(v)} stroke={v === 0 ? ZERO : GRID} strokeWidth={v === 0 ? 1.1 : 1} />
          <text x={padL - 6} y={sy(v) + 3} fontSize={9} fill="#64748b" textAnchor="end">{fmt(v)}</text>
        </g>
      ))}

      {/* x axis baseline ticks */}
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke={AXIS} strokeWidth={1} />
      {[xMin, (xMin + xMax) / 2, xMax].map((x, k) => (
        <g key={`x${k}`}>
          <line x1={sx(x)} y1={H - padB} x2={sx(x)} y2={H - padB + 4} stroke={AXIS} strokeWidth={1} />
          <text x={sx(x)} y={H - padB + 15} fontSize={9} fill="#64748b" textAnchor="middle">{x.toFixed(2)}</text>
        </g>
      ))}

      {/* column / reference verticals */}
      {vlines.map((v, k) => (
        <g key={`v${k}`}>
          <line x1={sx(v.x)} y1={padT} x2={sx(v.x)} y2={H - padB} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="4 3" />
          {v.label && <text x={sx(v.x)} y={padT - 2} fontSize={8.5} fill="#94a3b8" textAnchor="middle">{v.label}</text>}
        </g>
      ))}

      {/* fill + curve */}
      <polygon points={fillPts} fill={color} opacity={0.12} />
      <polyline points={linePts} fill="none" stroke={color} strokeWidth={1.8} />

      {markExtrema && Math.abs(ys[iMax]) > 1e-6 && <Marker i={iMax} place="above" />}
      {markExtrema && Math.abs(ys[iMin]) > 1e-6 && <Marker i={iMin} place="below" />}
    </svg>
  )
}
