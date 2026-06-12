import type { JSX } from 'react'
import type { TributaryResult } from '../engine/tributary'
import { DimBelow, DimSide } from './dims'

const STROKE = '#37526e'
const FILL = '#eef3f8'
const TRIB = '#16a34a'
const EDGE = '#0056b3'

/** Plan of the slab panel with its tributary areas: 45° lines (two-way) or
 *  the one-way strip direction, and the edge labels. */
export function PanelSketch({ r }: { r: TributaryResult }): JSX.Element {
  const W = 420, H = 280
  const padL = 56, padT = 30, availW = 280, availH = 180
  const s = Math.min(availW / r.ly, availH / r.lx)
  const w = r.ly * s, h = r.lx * s
  const x0 = padL + (availW - w) / 2, y0 = padT

  return (
    <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', height: 'auto', fontFamily: 'Arial, sans-serif' }}>
      <text x={padL} y={14} fontSize={11} fontWeight={700} fill="#0056b3">PANEL PLAN — {r.behaviour}</text>

      <rect x={x0} y={y0} width={w} height={h} fill={FILL} stroke={STROKE} strokeWidth={1.6} />

      {r.behaviour === 'two-way' ? (
        <g stroke={TRIB} strokeWidth={1} strokeDasharray="5 3">
          <line x1={x0} y1={y0} x2={x0 + h / 2} y2={y0 + h / 2} />
          <line x1={x0} y1={y0 + h} x2={x0 + h / 2} y2={y0 + h / 2} />
          <line x1={x0 + w} y1={y0} x2={x0 + w - h / 2} y2={y0 + h / 2} />
          <line x1={x0 + w} y1={y0 + h} x2={x0 + w - h / 2} y2={y0 + h / 2} />
          <line x1={x0 + h / 2} y1={y0 + h / 2} x2={x0 + w - h / 2} y2={y0 + h / 2} />
        </g>
      ) : (
        <g stroke={TRIB} strokeWidth={1} strokeDasharray="5 3">
          <line x1={x0} y1={y0 + h / 2} x2={x0 + w} y2={y0 + h / 2} />
          {Array.from({ length: 5 }, (_, i) => {
            const x = x0 + (w * (i + 1)) / 6
            return (
              <g key={i}>
                <line x1={x} y1={y0 + 6} x2={x} y2={y0 + h - 6} strokeDasharray="2 3" strokeWidth={0.8} />
                <path d={`M ${x - 3} ${y0 + 10} L ${x} ${y0 + 5} L ${x + 3} ${y0 + 10}`} fill="none" strokeDasharray="" />
                <path d={`M ${x - 3} ${y0 + h - 10} L ${x} ${y0 + h - 5} L ${x + 3} ${y0 + h - 10}`} fill="none" strokeDasharray="" />
              </g>
            )
          })}
        </g>
      )}

      {/* edge labels */}
      <text x={x0 + w / 2} y={y0 - 5} fontSize={9} fill={EDGE} textAnchor="middle" fontWeight={700}>L1 (long)</text>
      <text x={x0 + w / 2} y={y0 + h + 11} fontSize={9} fill={EDGE} textAnchor="middle" fontWeight={700}>L2 (long)</text>
      <text x={x0 - 6} y={y0 + h / 2} fontSize={9} fill={EDGE} textAnchor="end" fontWeight={700}>S1</text>
      <text x={x0 + w + 6} y={y0 + h / 2} fontSize={9} fill={EDGE} fontWeight={700}>S2</text>

      <DimBelow xA={x0} xB={x0 + w} featY={y0 + h + 14} dY={y0 + h + 30} label={`ℓy = ${r.ly.toFixed(2)} m`} />
      <DimSide yA={y0} yB={y0 + h} featX={x0} dX={x0 - 22} label={`ℓx = ${r.lx.toFixed(2)} m`} side="left" />
    </svg>
  )
}
