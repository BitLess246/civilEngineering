// ─────────────────────────────────────────────────────────────────────────
// Drawings for the hydraulics calculators. One rule across all of them:
// every head on a drawing (depths, losses, velocity heads) shares ONE
// vertical scale, so a gap between two lines reads as the quantity it is
// labelled with, and every drop is dimensioned from a stated datum.
// ─────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react'
import { DrawingFrame } from './DrawingFrame'
import type { PipeResult } from '../engine/pipeFlow'
import { INK, MUTED, HAIR, f2, f3 } from '../lib/influenceStyle'

const mono = 'var(--font-mono, monospace)'
export const WATER = '#0f4c92'
const EGL = 'rgba(15,76,146,0.85)'
const halo = { paintOrder: 'stroke' as const, stroke: 'var(--sheet)', strokeWidth: 3 }

/** A vertical dimension between two screen heights, oblique ticks, label
 *  to one side. */
export function VDim({ x, a, b, label, color = MUTED, side = 'right' }: {
  x: number; a: number; b: number; label: ReactNode; color?: string; side?: 'left' | 'right'
}) {
  return (
    <g>
      <line x1={x} x2={x} y1={a} y2={b} stroke={color} strokeWidth="1" />
      <line x1={x - 4} x2={x + 4} y1={a + 4} y2={a - 4} stroke={color} strokeWidth="1.2" />
      <line x1={x - 4} x2={x + 4} y1={b + 4} y2={b - 4} stroke={color} strokeWidth="1.2" />
      <text x={side === 'right' ? x + 8 : x - 8} y={(a + b) / 2 + 4} textAnchor={side === 'right' ? 'start' : 'end'} fontSize="10" fill={color} fontFamily={mono} {...halo}>{label}</text>
    </g>
  )
}

/** The ▽ free-surface symbol at (x, y). */
export function SurfaceMark({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <path d={`M ${x - 6} ${y - 10} h 12 l -6 9 z`} fill="none" stroke={WATER} strokeWidth="1.2" />
      <line x1={x - 5} x2={x + 5} y1={y + 4} y2={y + 4} stroke={WATER} strokeWidth="1" />
      <line x1={x - 3} x2={x + 3} y1={y + 7} y2={y + 7} stroke={WATER} strokeWidth="1" />
    </g>
  )
}

/** Energy and hydraulic grade lines along a pipe of length L. The minor
 *  losses ΣK·V²/2g are drawn as one step at the inlet (their real positions
 *  are not modelled); friction then drops the EGL linearly by hf. The HGL
 *  runs V²/2g below the EGL. The pipe's elevation is schematic — only the
 *  heads are to scale. */
export function PipeProfile({ L, res }: { L: number; res: PipeResult }) {
  const W = 640, H = 330, x0 = 70, x1 = W - 110
  const vhead = (res.V * res.V) / (2 * 9.81)
  const pipeTop = H - 70
  const top = 50
  const ky = (pipeTop - 40 - top) / Math.max(res.hTotal + vhead, 1e-6)
  const E0 = top                                   // energy line at the inlet, before losses
  const xs = x0 + 24                                 // where the minor-loss step sits
  const eAfterMinor = E0 + res.hm * ky
  const eEnd = eAfterMinor + res.hf * ky
  const hgl = (y: number) => y + vhead * ky
  const eAt = (x: number) => (x <= xs ? eAfterMinor : eAfterMinor + ((x - xs) / (x1 - xs)) * (eEnd - eAfterMinor))
  const vTiny = vhead * ky < 10
  return (
    <DrawingFrame label="Energy and hydraulic grade lines along the pipe">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Energy and hydraulic grade lines">
        {/* pipe, schematic */}
        <rect x={x0} y={pipeTop} width={x1 - x0} height={16} fill="rgba(15,76,146,0.12)" stroke={INK} strokeWidth="1.4" />
        <text x={(x0 + x1) / 2} y={pipeTop + 34} textAnchor="middle" fontSize="10" fill={MUTED} fontFamily={mono}>pipe, L = {f2(L)} m (elevation schematic)</text>

        {/* datum: the inlet energy level carried the whole length */}
        <line x1={x0} x2={x1 + 30} y1={E0} y2={E0} stroke={HAIR} strokeWidth="1" strokeDasharray="2 3" />
        <text x={x1} y={E0 - 6} textAnchor="end" fontSize="10" fill={MUTED} fontFamily={mono}>inlet energy level (datum)</text>

        {/* EGL: minor-loss step, then friction slope */}
        <polyline points={`${x0},${E0} ${xs},${E0} ${xs},${eAfterMinor} ${x1},${eEnd}`} fill="none" stroke={EGL} strokeWidth="1.6" strokeDasharray="7 3" />
        {/* HGL, V²/2g below the EGL */}
        <polyline points={`${x0},${hgl(E0)} ${xs},${hgl(E0)} ${xs},${hgl(eAfterMinor)} ${x1},${hgl(eEnd)}`} fill="none" stroke={WATER} strokeWidth="1.6" />
        {/* line labels on the clear side of a falling line: EGL above-right,
            HGL below-left */}
        <text x={xs + 50} y={eAt(xs + 50) - 10} fontSize="10" fill={EGL} fontFamily={mono} {...halo}>energy grade line (EGL)</text>
        <text x={x1 - 50} y={hgl(eAt(x1 - 50)) + 20} textAnchor="end" fontSize="10" fill={WATER} fontFamily={mono} {...halo}>hydraulic grade line (HGL) · S = {f3(res.S)} m/m</text>

        {/* losses, measured from the datum */}
        {res.hm * ky > 14
          ? <VDim x={xs + 12} a={E0} b={eAfterMinor} label={`hm = ${f3(res.hm)} m`} color={EGL} />
          : res.hm > 0 && <text x={x0} y={E0 - 6} fontSize="10" fill={EGL} fontFamily={mono}>hm = {f3(res.hm)} m step</text>}
        <VDim x={x1 + 14} a={eAfterMinor} b={eEnd} label={`hf = ${f3(res.hf)} m`} color={EGL} />
        {/* velocity head at the outlet: dimensioned, or called out when too small to see */}
        {vTiny ? (
          <text x={x1 - 4} y={hgl(eEnd) + 16} textAnchor="end" fontSize="10" fill={MUTED} fontFamily={mono} {...halo}>EGL − HGL = V²/2g = {f3(vhead)} m</text>
        ) : (
          <VDim x={x1 - 18} a={eEnd} b={hgl(eEnd)} label={`V²/2g = ${f3(vhead)} m`} side="left" />
        )}
        <text x={x0} y={H - 10} fontSize="10" fill={MUTED} fontFamily={mono}>total loss {f3(res.hTotal)} m = hm + hf · heads to one scale · minor losses as one step</text>
      </svg>
    </DrawingFrame>
  )
}
