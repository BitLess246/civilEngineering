import type { JSX } from 'react'
import type { Support, BeamLoad } from '../engine/beamAnalysis'

const BEAM = '#37526e'
const LOAD = '#dc2626'
const MOM = '#7c3aed'
const SUP = '#0056b3'

/** Elevation sketch of the analysis model: beam line, support symbols
 *  (pin / roller / fixed / spring) and load glyphs (point, UDL/VDL, moment). */
export function BeamElevation({ L, supports, loads }: {
  L: number; supports: Support[]; loads: BeamLoad[]
}): JSX.Element {
  const W = 560, H = 150
  const padL = 30, padR = 30
  const bx0 = padL, bx1 = W - padR
  const sx = (x: number) => bx0 + ((bx1 - bx0) * Math.max(0, Math.min(L, x))) / Math.max(L, 1e-9)
  const by = 92

  const supSym = (s: Support, i: number) => {
    const x = sx(s.x)
    if (s.type === 'fixed') {
      const dir = s.x < L / 2 ? -1 : 1
      return (
        <g key={`s${i}`} stroke={SUP} strokeWidth={1.6}>
          <line x1={x} y1={by - 18} x2={x} y2={by + 18} />
          {[-14, -7, 0, 7, 14].map((dy) => (
            <line key={dy} x1={x} y1={by + dy} x2={x + dir * 7} y2={by + dy + 6} strokeWidth={1} />
          ))}
        </g>
      )
    }
    if (s.type === 'spring') {
      const zig = `M ${x} ${by + 2} l 0 4 l 5 3 l -10 5 l 10 5 l -10 5 l 5 3 l 0 4`
      return (
        <g key={`s${i}`} stroke={SUP} strokeWidth={1.4} fill="none">
          <path d={zig} />
          <line x1={x - 9} y1={by + 31} x2={x + 9} y2={by + 31} />
          <text x={x} y={by + 43} fontSize={8} fill={SUP} textAnchor="middle" stroke="none">k={s.k ?? 1000}</text>
        </g>
      )
    }
    return (
      <g key={`s${i}`} stroke={SUP} strokeWidth={1.4} fill="none">
        <path d={`M ${x} ${by + 1} L ${x - 8} ${by + 15} L ${x + 8} ${by + 15} Z`} fill="#fff" />
        {s.type === 'roller'
          ? <g>{[-5, 0, 5].map((dx) => <circle key={dx} cx={x + dx} cy={by + 19} r={2.6} />)}</g>
          : <g>{[-8, -3, 2, 7].map((dx) => <line key={dx} x1={x + dx} y1={by + 15} x2={x + dx - 4} y2={by + 21} strokeWidth={1} />)}</g>}
        <text x={x} y={by + 32} fontSize={8} fill={SUP} textAnchor="middle" stroke="none">{s.type}</text>
      </g>
    )
  }

  const arrow = (x: number, y0: number, y1: number, color: string) => (
    <g stroke={color} strokeWidth={1.4}>
      <line x1={x} y1={y0} x2={x} y2={y1} />
      <path d={`M ${x - 3.5} ${y1 - 6} L ${x} ${y1} L ${x + 3.5} ${y1 - 6}`} fill="none" />
    </g>
  )

  const loadGlyph = (ld: BeamLoad, i: number) => {
    if (ld.type === 'point') {
      const x = sx(ld.x)
      return (
        <g key={`l${i}`}>
          {arrow(x, by - 44, by - 3, LOAD)}
          <text x={x} y={by - 48} fontSize={8.5} fill={LOAD} textAnchor="middle">{ld.P} kN ({ld.cat})</text>
        </g>
      )
    }
    if (ld.type === 'moment') {
      const x = sx(ld.x)
      const ccw = ld.M >= 0
      return (
        <g key={`l${i}`} stroke={MOM} fill="none" strokeWidth={1.4}>
          <path d={`M ${x - 8} ${by - 12} A 9 9 0 1 ${ccw ? 0 : 1} ${x + 8} ${by - 12}`} />
          <path d={ccw ? `M ${x + 8} ${by - 12} l -5 -4 m 5 4 l -6 2` : `M ${x - 8} ${by - 12} l 5 -4 m -5 4 l 6 2`} strokeWidth={1.2} />
          <text x={x} y={by - 26} fontSize={8.5} fill={MOM} textAnchor="middle" stroke="none">{ld.M} kN·m ({ld.cat})</text>
        </g>
      )
    }
    const xa = sx(ld.x1), xb = sx(ld.x2)
    const h1 = ld.type === 'udl' ? 26 : Math.max(8, 26 * (Math.abs(ld.w1) / Math.max(Math.abs(ld.w1), Math.abs(ld.w2), 1e-9)))
    const h2 = ld.type === 'udl' ? 26 : Math.max(8, 26 * (Math.abs(ld.w2) / Math.max(Math.abs(ld.w1), Math.abs(ld.w2), 1e-9)))
    const nA = Math.max(3, Math.floor((xb - xa) / 26))
    const label = ld.type === 'udl' ? `${ld.w} kN/m (${ld.cat})` : `${ld.w1}→${ld.w2} kN/m (${ld.cat})`
    return (
      <g key={`l${i}`}>
        <line x1={xa} y1={by - 4 - h1} x2={xb} y2={by - 4 - h2} stroke={LOAD} strokeWidth={1.2} />
        {Array.from({ length: nA + 1 }, (_, j) => {
          const t = j / nA
          const x = xa + (xb - xa) * t
          const hh = h1 + (h2 - h1) * t
          return arrow(x, by - 4 - hh, by - 3, LOAD)
        })}
        <text x={(xa + xb) / 2} y={by - 10 - Math.max(h1, h2)} fontSize={8.5} fill={LOAD} textAnchor="middle">{label}</text>
      </g>
    )
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: 'auto', fontFamily: 'Arial, sans-serif' }}>
      <line x1={bx0} y1={by} x2={bx1} y2={by} stroke={BEAM} strokeWidth={4} strokeLinecap="round" />
      {supports.map(supSym)}
      {loads.map(loadGlyph)}
      <text x={bx0} y={by + 56} fontSize={9} fill={BEAM}>0</text>
      <text x={bx1} y={by + 56} fontSize={9} fill={BEAM} textAnchor="end">L = {L} m</text>
    </svg>
  )
}
