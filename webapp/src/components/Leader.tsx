// ─────────────────────────────────────────────────────────────────────────
// The on-screen leader — the same arrowhead, leg, dogleg and glyph as the
// plotted sheets (`engine/leaderShape`), for the SVG figures drawn in React.
//
// A figure used to draw a callout as a bare line from near the thing to near
// the text: no arrowhead to say which end names what, no landing to say
// where the label begins, and a leg free to fold back at any angle. This is
// the one leader every figure uses; the angle at the knee is never acute.
// ─────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react'
import { leaderShape } from '../engine/leaderShape'

const HALO = { paintOrder: 'stroke' as const, stroke: 'var(--sheet, #fff)', strokeWidth: 2.6, strokeLinejoin: 'round' as const }

export interface LeaderProps {
  /** The point named — the arrowhead's tip, in the SVG's units. */
  x: number
  y: number
  /** The label's anchor and baseline. The text runs AWAY from the landing. */
  tx: number
  ty: number
  /** One line, or several stacked under the first. */
  text: ReactNode | ReactNode[]
  fontSize: number
  /** Label colour; the leader's line takes `ink`, or the label colour. */
  color: string
  ink?: string
  weight?: number
  side?: 'left' | 'right'
  landing?: number
  /** Line height for stacked lines, × fontSize. */
  leading?: number
  /** Arrowhead length. Default 0.6 × fontSize — a sheet's 0.285 is a speck at screen text sizes. */
  arrow?: number
}

export function Leader({ x, y, tx, ty, text, fontSize, color, ink, weight, side, landing, leading = 1.2, arrow }: LeaderProps) {
  const sh = leaderShape({ x, y, tx, ty, size: fontSize, side, landing, arrow: arrow ?? fontSize * 0.6 })
  const stroke = ink ?? color
  const lines = Array.isArray(text) ? text : [text]
  return (
    <g>
      <polyline points={sh.line.map((q) => q.join(',')).join(' ')} fill="none" stroke={stroke}
        strokeWidth={Math.max(0.6, fontSize * 0.075)} strokeLinejoin="round" strokeLinecap="round" />
      <polygon points={sh.head.map((q) => q.join(',')).join(' ')} fill={stroke} />
      {lines.map((t, k) => (
        <text key={k} x={sh.tx} y={sh.ty + k * fontSize * leading} fontSize={fontSize} fill={color} fontWeight={k === 0 ? weight : undefined}
          textAnchor={sh.anchor} {...HALO}>{t}</text>
      ))}
    </g>
  )
}
