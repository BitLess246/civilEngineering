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
  const W = 640, H = 330, x0 = 60, x1 = W - 160
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
        {/* total loss, from the datum line (which runs out to here) down to an
            extension line off the end of the EGL — both ends on drawn lines */}
        <line x1={x1 + 3} x2={x1 + 20} y1={eEnd} y2={eEnd} stroke={EGL} strokeWidth="0.8" />
        <VDim x={x1 + 14} a={E0} b={eEnd} label={`hm + hf = ${f3(res.hTotal)} m`} color={EGL} />
        {/* velocity head at the outlet: dimensioned, or called out when too small to see */}
        {vTiny ? (
          <text x={x1 - 4} y={hgl(eEnd) + 16} textAnchor="end" fontSize="10" fill={MUTED} fontFamily={mono} {...halo}>EGL − HGL = V²/2g = {f3(vhead)} m</text>
        ) : (
          <VDim x={x1 - 18} a={eEnd} b={hgl(eEnd)} label={`V²/2g = ${f3(vhead)} m`} side="left" />
        )}
        <text x={x0} y={H - 10} fontSize="10" fill={MUTED} fontFamily={mono}>hf = {f3(res.hf)} m friction · heads to one scale · minor losses as one step</text>
      </svg>
    </DrawingFrame>
  )
}

export type WeirKind = 'rectSuppressed' | 'rectContracted' | 'cipolletti' | 'vnotch' | 'broadCrested'

/** A horizontal dimension between two screen x's, oblique ticks, label above. */
export function HDim({ y, a, b, label, color = INK }: { y: number; a: number; b: number; label: ReactNode; color?: string }) {
  return (
    <g>
      <line x1={a} x2={b} y1={y} y2={y} stroke={color} strokeWidth="1" />
      <line x1={a - 4} x2={a + 4} y1={y + 4} y2={y - 4} stroke={color} strokeWidth="1.2" />
      <line x1={b - 4} x2={b + 4} y1={y + 4} y2={y - 4} stroke={color} strokeWidth="1.2" />
      <text x={(a + b) / 2} y={y - 5} textAnchor="middle" fontSize="10" fill={color} fontFamily={mono} {...halo}>{label}</text>
    </g>
  )
}

/** Two views of a measurement weir at ONE scale: a longitudinal profile
 *  (pool, structure, drawdown, nappe, H measured upstream from the crest
 *  level) and the front view looking downstream (the opening, its crest
 *  length or notch angle, and the head in it). */
export function WeirViews({ shape, H, L, angle, n = 2, Leff }: {
  shape: WeirKind; H: number; L: number; angle: number; n?: number; Leff?: number
}) {
  const W = 660, Ht = 330
  const crestY = 205, bedY = 285
  const half = Math.tan((angle / 2) * Math.PI / 180)
  // opening width at the water surface, for the scale
  const topW = shape === 'vnotch' ? 2 * H * half : shape === 'cipolletti' ? L + H / 2 : L
  const k = Math.min(120 / Math.max(H, 1e-6), 170 / Math.max(topW, 1e-6))
  const h = H * k
  const surfY = crestY - h

  // ── profile (side view) ──
  const xw = 250                                    // the weir face
  const broad = shape === 'broadCrested'
  const crestX0 = broad ? xw - 70 : xw, crestX1 = broad ? xw : xw + 5
  const xm = 118                                    // where H is measured, upstream of the drawdown
  const dd = broad ? surfY + h / 3 : surfY + 0.15 * h // surface at the crest: yc = 2H/3 broad, ≈0.85H sharp
  const surface = `M 20 ${surfY} L ${crestX0 - 60} ${surfY} C ${crestX0 - 25} ${surfY}, ${crestX0 - 15} ${dd}, ${crestX0} ${dd} L ${crestX1} ${dd}`
  const nappeTop = `C ${crestX1 + 22} ${dd}, ${crestX1 + 38} ${dd + 30}, ${crestX1 + 46} ${bedY}`
  const nappeBot = `M ${crestX1} ${crestY} C ${crestX1 + 14} ${crestY - 4}, ${crestX1 + 26} ${crestY + 30}, ${crestX1 + 30} ${bedY}`

  // ── front view (looking downstream) ──
  const cx = 495
  const wall = shape === 'rectSuppressed' || shape === 'broadCrested' ? (L * k) / 2 : Math.max((topW * k) / 2 + 34, (L * k) / 2 + 34)
  const opening: string = shape === 'vnotch'
    ? `M ${cx - (h + 30) * half} ${surfY - 30} L ${cx} ${crestY} L ${cx + (h + 30) * half} ${surfY - 30}`
    : shape === 'cipolletti'
      ? `M ${cx - (L * k) / 2 - (h + 30) / 4} ${surfY - 30} L ${cx - (L * k) / 2} ${crestY} L ${cx + (L * k) / 2} ${crestY} L ${cx + (L * k) / 2 + (h + 30) / 4} ${surfY - 30}`
      : `M ${cx - (L * k) / 2} ${surfY - 30} L ${cx - (L * k) / 2} ${crestY} L ${cx + (L * k) / 2} ${crestY} L ${cx + (L * k) / 2} ${surfY - 30}`
  const waterFront = shape === 'vnotch'
    ? `M ${cx - h * half} ${surfY} L ${cx} ${crestY} L ${cx + h * half} ${surfY} Z`
    : shape === 'cipolletti'
      ? `M ${cx - (L * k) / 2 - h / 4} ${surfY} L ${cx - (L * k) / 2} ${crestY} L ${cx + (L * k) / 2} ${crestY} L ${cx + (L * k) / 2 + h / 4} ${surfY} Z`
      : `M ${cx - (L * k) / 2} ${surfY} L ${cx - (L * k) / 2} ${crestY} L ${cx + (L * k) / 2} ${crestY} L ${cx + (L * k) / 2} ${surfY} Z`
  // crop the empty band above a low head: the sheet starts just above the
  // front view's walls
  const vbTop = Math.max(0, surfY - 76)
  const surfHalf = shape === 'vnotch' ? h * half : shape === 'cipolletti' ? (L * k) / 2 + h / 4 : (L * k) / 2

  return (
    <DrawingFrame label="Weir profile and front view">
      <svg viewBox={`0 ${vbTop} ${W} ${Ht - vbTop}`} className="w-full" role="img" aria-label="Weir profile and front view">
        <text x={20} y={vbTop + 22} fontSize="10.5" fontWeight="700" fill={INK} fontFamily={mono}>PROFILE</text>
        <text x={cx} y={vbTop + 22} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={INK} fontFamily={mono}>FRONT VIEW (looking downstream)</text>

        {/* profile: bed, pool, structure, nappe */}
        <line x1={14} x2={xw + 120} y1={bedY} y2={bedY} stroke={INK} strokeWidth="1.4" />
        <path d={`${surface} L ${crestX1} ${crestY} L ${crestX0} ${crestY} L ${crestX0} ${bedY} L 20 ${bedY} Z`} fill="rgba(15,76,146,0.18)" stroke="none" />
        <path d={surface} fill="none" stroke={WATER} strokeWidth="1.6" />
        {/* the nappe as a falling sheet of water: filled between its two surfaces */}
        {!broad && <path d={`M ${crestX1} ${dd} ${nappeTop} L ${crestX1 + 30} ${bedY} C ${crestX1 + 26} ${crestY + 30}, ${crestX1 + 14} ${crestY - 4}, ${crestX1} ${crestY} Z`} fill="rgba(15,76,146,0.18)" stroke="none" />}
        {!broad && <path d={`M ${crestX1} ${dd} ${nappeTop}`} fill="none" stroke={WATER} strokeWidth="1.4" />}
        {!broad && <path d={nappeBot} fill="none" stroke={WATER} strokeWidth="1.1" />}
        {broad && <path d={`M ${crestX1} ${dd} C ${crestX1 + 20} ${dd + 4}, ${crestX1 + 30} ${bedY - 20}, ${crestX1 + 48} ${bedY - 6}`} fill="none" stroke={WATER} strokeWidth="1.4" />}
        {broad
          ? <rect x={crestX0} y={crestY} width={crestX1 - crestX0} height={bedY - crestY} fill="rgba(120,120,120,0.18)" stroke={INK} strokeWidth="1.6" />
          : <path d={`M ${xw} ${bedY} L ${xw} ${crestY} L ${xw + 5} ${crestY} L ${xw + 5} ${crestY + 6} L ${xw + 9} ${bedY}`} fill="rgba(120,120,120,0.18)" stroke={INK} strokeWidth="1.6" />}
        <SurfaceMark x={xm + 40} y={surfY} />
        {/* H measured upstream: crest level carried back as an extension line */}
        <line x1={xm - 8} x2={crestX0 - 2} y1={crestY} y2={crestY} stroke={MUTED} strokeWidth="0.8" strokeDasharray="3 3" />
        <VDim x={xm} a={surfY} b={crestY} label={`H = ${f3(H)} m`} color={INK} side="left" />
        <text x={xm} y={bedY + 16} textAnchor="middle" fontSize="9.5" fill={MUTED} fontFamily={mono}>H measured ≥ 4H upstream</text>
        {broad
          ? <text x={(crestX0 + crestX1) / 2} y={dd - 8} textAnchor="middle" fontSize="9.5" fill={MUTED} fontFamily={mono} {...halo}>y_c = 2H/3</text>
          : <text x={crestX1 + 52} y={crestY + 30} fontSize="9.5" fill={MUTED} fontFamily={mono}>nappe</text>}

        {/* front view: channel walls, plate with the opening, water in it */}
        <line x1={cx - wall} x2={cx - wall} y1={surfY - 40} y2={bedY} stroke={INK} strokeWidth="1.4" />
        <line x1={cx + wall} x2={cx + wall} y1={surfY - 40} y2={bedY} stroke={INK} strokeWidth="1.4" />
        <line x1={cx - wall - 10} x2={cx + wall + 10} y1={bedY} y2={bedY} stroke={INK} strokeWidth="1.4" />
        <path d={`${opening} L ${cx + wall} ${surfY - 30} L ${cx + wall} ${bedY} L ${cx - wall} ${bedY} L ${cx - wall} ${surfY - 30} Z`} fill="rgba(120,120,120,0.16)" stroke="none" fillRule="evenodd" />
        <path d={opening} fill="none" stroke={INK} strokeWidth="1.8" />
        <path d={waterFront} fill="rgba(15,76,146,0.22)" stroke="none" />
        <line x1={cx - surfHalf} x2={cx + surfHalf} y1={surfY} y2={surfY} stroke={WATER} strokeWidth="1.6" />
        {/* H in the front view: extension lines off the crest and the surface */}
        <line x1={cx + surfHalf + 3} x2={cx + wall + 30} y1={surfY} y2={surfY} stroke={MUTED} strokeWidth="0.8" />
        <line x1={shape === 'vnotch' ? cx + 3 : cx + (L * k) / 2 + 3} x2={cx + wall + 30} y1={crestY} y2={crestY} stroke={MUTED} strokeWidth="0.8" />
        <VDim x={cx + wall + 24} a={surfY} b={crestY} label="H" color={INK} />
        {shape === 'vnotch' ? (
          <>
            <path d={`M ${cx - 26 * half / Math.hypot(1, half)} ${crestY - 26 / Math.hypot(1, half)} A 26 26 0 0 1 ${cx + 26 * half / Math.hypot(1, half)} ${crestY - 26 / Math.hypot(1, half)}`} fill="none" stroke={INK} strokeWidth="1" />
            <text x={cx} y={crestY - 32} textAnchor="middle" fontSize="10" fill={INK} fontFamily={mono} {...halo}>θ = {f2(angle)}°</text>
          </>
        ) : (
          <>
            {/* crest length: extension lines down from the crest ends */}
            <line x1={cx - (L * k) / 2} x2={cx - (L * k) / 2} y1={crestY + 3} y2={crestY + 30} stroke={MUTED} strokeWidth="0.8" />
            <line x1={cx + (L * k) / 2} x2={cx + (L * k) / 2} y1={crestY + 3} y2={crestY + 30} stroke={MUTED} strokeWidth="0.8" />
            <HDim y={crestY + 25} a={cx - (L * k) / 2} b={cx + (L * k) / 2} label={`${broad ? 'b' : 'L'} = ${f3(L)} m`} />
          </>
        )}
        {shape === 'rectContracted' && Leff != null && (
          <text x={cx} y={bedY + 16} textAnchor="middle" fontSize="9.5" fill={MUTED} fontFamily={mono}>{n} end contraction{n === 1 ? '' : 's'} · effective L′ = {f3(Leff)} m</text>
        )}
        {shape === 'cipolletti' && <text x={cx} y={bedY + 16} textAnchor="middle" fontSize="9.5" fill={MUTED} fontFamily={mono}>sides 4V : 1H</text>}
        <text x={20} y={Ht - 8} fontSize="9.5" fill={MUTED} fontFamily={mono}>both views to one scale · weir height schematic</text>
      </svg>
    </DrawingFrame>
  )
}
