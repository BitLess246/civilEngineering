// ─────────────────────────────────────────────────────────────────────────
// Load-combination chart — every factored combination as a bar on ONE
// scale about a zero line, so the governing maximum and any reversal (a
// negative minimum, the uplift / overturning case) read at a glance.
// ─────────────────────────────────────────────────────────────────────────
import { DrawingFrame } from './DrawingFrame'
import type { ComboResult } from '../engine/loadCombinations'

const INK = '#37526e'
const BAR = '#9fb6cf'
const MAX = '#1f7a4a'
const MIN = '#c2402a'
const FAINT = '#a39d8d'

export function ComboBars({ combos, maxId, minId }: { combos: ComboResult[]; maxId: string; minId: string }) {
  const ROW = 17, ML = 46, MR = 64, MT = 14, W = 420
  const H = MT + combos.length * ROW + 30
  const hi = Math.max(0, ...combos.map((c) => c.value))
  const lo = Math.min(0, ...combos.map((c) => c.value))
  const span = Math.max(hi - lo, 1e-9)
  const plotW = W - ML - MR
  const X = (v: number) => ML + ((v - lo) / span) * plotW
  const x0 = X(0)
  return (
    <DrawingFrame label="load combination chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-auto w-full max-w-[560px]" style={{ fontFamily: 'Arial, sans-serif' }}>
        {combos.map((c, i) => {
          const y = MT + i * ROW
          const isMax = c.id === maxId, isMin = c.id === minId && c.value < 0
          const fill = isMax ? MAX : isMin ? MIN : BAR
          const xa = Math.min(x0, X(c.value)), w = Math.abs(X(c.value) - x0)
          return (
            <g key={c.id}>
              <text x={ML - 6} y={y + 11} fontSize={8.5} fill={INK} textAnchor="end">{c.id}</text>
              <rect x={xa} y={y + 3} width={Math.max(w, 0.5)} height={ROW - 6} fill={fill} />
              <text x={c.value >= 0 ? X(c.value) + 4 : X(c.value) - 4} y={y + 11} fontSize={8} fill={isMax || isMin ? fill : INK}
                textAnchor={c.value >= 0 ? 'start' : 'end'} fontWeight={isMax || isMin ? 700 : 400}>
                {c.value.toFixed(2)}{isMax ? '  max' : isMin ? '  min' : ''}
              </text>
            </g>
          )
        })}
        {/* the zero line every bar is measured from */}
        <line x1={x0} y1={MT - 4} x2={x0} y2={MT + combos.length * ROW + 2} stroke={INK} strokeWidth={1} />
        <text x={x0} y={MT + combos.length * ROW + 13} fontSize={8} fill={INK} textAnchor="middle">0</text>
        <text x={W / 2} y={H - 4} fontSize={7} fill={FAINT} textAnchor="middle">
          one scale for every combination · units as entered
        </text>
      </svg>
    </DrawingFrame>
  )
}
