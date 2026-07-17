import type { JSX } from 'react'
import { DimBelow, DimSide } from './dims'

const STROKE = '#37526e'
const FILL = '#eef3f8'
const BAR = '#37526e'

export interface ColumnSchematicProps {
  shape: 'tied' | 'spiral'
  b?: number; h?: number      // mm, tied
  D?: number                  // mm, spiral
  cover: number; barDia: number; tieDia: number
  bars: number
  tieSpacing?: number         // label only
}

/** Column cross-section to scale: rectangular tied (bars on two faces, tie at
 *  real thickness) or circular spiral (ring of bars + spiral wire). */
export function ColumnSchematic({ shape, b = 0, h = 0, D = 0, cover, barDia, tieDia, bars, tieSpacing }: ColumnSchematicProps): JSX.Element {
  const W = 320, H = 280
  const padT = 28, availW = 170, availH = 190
  const tied = shape === 'tied'
  const bb = tied ? b : D, hh0 = tied ? h : D
  const s = Math.min(availW / bb, availH / hh0)
  const bw = bb * s, hgt = hh0 * s
  const x0 = 70 + (availW - bw) / 2, y0 = padT
  const stW = Math.max(1, tieDia * s)
  const br = Math.max(3, (barDia / 2) * s)

  const inset = (cover + tieDia / 2) * s

  let body: JSX.Element
  if (tied) {
    const x1 = x0 + (cover + tieDia + barDia / 2) * s
    const x2 = x0 + bw - (cover + tieDia + barDia / 2) * s
    const yT = y0 + (cover + tieDia + barDia / 2) * s
    const yB = y0 + hgt - (cover + tieDia + barDia / 2) * s
    // real cage: 4 corner bars + the rest split between the b- and h-faces in
    // proportion to the face lengths (mirrors engine barLayers 'all-around')
    const N = Math.max(4, 2 * Math.round(bars / 2))
    const bwIn = b - 2 * (cover + tieDia + barDia / 2)
    const hIn = h - 2 * (cover + tieDia + barDia / 2)
    let nx = 2 + Math.round(((N - 4) / 2) * (bwIn / (bwIn + hIn)))
    nx = Math.max(2, Math.min(nx, N / 2))
    const ny = N / 2 + 2 - nx
    const rowX = Array.from({ length: nx }, (_, i) => (nx === 1 ? (x1 + x2) / 2 : x1 + ((x2 - x1) * i) / (nx - 1)))
    const sideY = Array.from({ length: Math.max(0, ny - 2) }, (_, i) => yT + ((yB - yT) * (i + 1)) / (ny - 1))
    // interior crossties (C-ties) that grip the interior face bars — vertical for
    // the top/bottom-face bars, horizontal for the side-face bars (§25.7.2.3)
    const midX = (x1 + x2) / 2, midY = (yT + yB) / 2
    const rw = br + (tieDia / 2) * s, stub = (br + (tieDia / 2) * s) * 1.6, NS = 10
    const cTie = (A: [number, number], B: [number, number], u: [number, number], od: [number, number]): string => {
      const pts: [number, number][] = [[A[0] + od[0] * rw + u[0] * stub, A[1] + od[1] * rw + u[1] * stub]]
      for (let j = 0; j <= NS; j++) { const t = (Math.PI * j) / NS, c = Math.cos(t), sn = Math.sin(t)
        pts.push([A[0] + (od[0] * c - u[0] * sn) * rw, A[1] + (od[1] * c - u[1] * sn) * rw]) }
      pts.push([B[0] - od[0] * rw, B[1] - od[1] * rw])
      for (let j = 0; j <= NS; j++) { const t = (Math.PI * j) / NS, c = Math.cos(t), sn = Math.sin(t)
        pts.push([B[0] + (-od[0] * c + u[0] * sn) * rw, B[1] + (-od[1] * c + u[1] * sn) * rw]) }
      pts.push([B[0] + od[0] * rw - u[0] * stub, B[1] + od[1] * rw - u[1] * stub])
      return pts.map((p) => p.join(',')).join(' ')
    }
    const crossties: string[] = [
      ...rowX.slice(1, -1).map((bx) => cTie([bx, yT], [bx, yB], [0, 1], [bx <= midX ? 1 : -1, 0])),
      ...sideY.map((sy) => cTie([x1, sy], [x2, sy], [1, 0], [0, sy <= midY ? 1 : -1])),
    ]
    body = (
      <g>
        <rect x={x0} y={y0} width={bw} height={hgt} rx={2} fill={FILL} stroke={STROKE} strokeWidth={1.6} />
        <rect x={x0 + inset} y={y0 + inset} width={bw - 2 * inset} height={hgt - 2 * inset}
          rx={Math.max(2, 2.5 * tieDia * s)} fill="none" stroke={BAR} strokeWidth={stW} opacity={0.8} />
        {crossties.map((pts, i) => <polyline key={`c${i}`} points={pts} fill="none" stroke={BAR} strokeWidth={stW} opacity={0.8} strokeLinecap="round" strokeLinejoin="round" />)}
        {rowX.map((bx, i) => <circle key={`t${i}`} cx={bx} cy={yT} r={br} fill={BAR} />)}
        {rowX.map((bx, i) => <circle key={`b${i}`} cx={bx} cy={yB} r={br} fill={BAR} />)}
        {sideY.map((sy, i) => <g key={`s${i}`}>
          <circle cx={x1} cy={sy} r={br} fill={BAR} />
          <circle cx={x2} cy={sy} r={br} fill={BAR} />
        </g>)}
      </g>
    )
  } else {
    const cx = x0 + bw / 2, cy = y0 + hgt / 2
    const R = bw / 2
    const ringR = R - (cover + tieDia + barDia / 2) * s
    body = (
      <g>
        <circle cx={cx} cy={cy} r={R} fill={FILL} stroke={STROKE} strokeWidth={1.6} />
        <circle cx={cx} cy={cy} r={R - inset} fill="none" stroke={BAR} strokeWidth={stW} opacity={0.8} strokeDasharray="10 4" />
        {Array.from({ length: Math.max(6, bars) }, (_, i) => {
          const ang = (2 * Math.PI * i) / Math.max(6, bars) - Math.PI / 2
          return <circle key={i} cx={cx + ringR * Math.cos(ang)} cy={cy + ringR * Math.sin(ang)} r={br} fill={BAR} />
        })}
      </g>
    )
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: 'auto', fontFamily: 'Arial, sans-serif' }}>
      <text x={70} y={14} fontSize={11} fontWeight={700} fill="#0056b3">SECTION</text>
      {body}
      <text x={x0 + bw / 2} y={y0 + hgt + 12} fontSize={8.5} fill={BAR} textAnchor="middle">
        {bars} ⌀{barDia} mm · {tied ? `ties ⌀${tieDia}` : `spiral ⌀${tieDia}`}{tieSpacing ? ` @ ${Math.round(tieSpacing)} mm` : ''}
      </text>
      <DimBelow xA={x0} xB={x0 + bw} featY={y0 + hgt + 14} dY={y0 + hgt + 30}
        label={tied ? `b = ${Math.round(b)} mm` : `D = ${Math.round(D)} mm`} />
      {tied && <DimSide yA={y0} yB={y0 + hgt} featX={x0} dX={x0 - 16} label={`h = ${Math.round(h)} mm`} side="left" />}
    </svg>
  )
}
