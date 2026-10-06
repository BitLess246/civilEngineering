// ─────────────────────────────────────────────────────────────────────────
// Drawing for the stair calculator — the flight in longitudinal section.
//
// One scale for everything: plan span, rise, waist and steps are all drawn at
// the same mm → px factor, so the waist reads as thin as it really is against
// the flight. The span is the PLAN span the moment is computed on, so its
// dimension is horizontal and lands on the two bearing points.
//
// The waist thickness t is measured PERPENDICULAR to the slope, from the root
// line through the step inner corners to the soffit — which is how the engine
// takes it (self-weight γc·t/cosθ per plan area).
// ─────────────────────────────────────────────────────────────────────────
import { DimBelow, Tick } from './dims'
import { DrawingFrame } from './DrawingFrame'
import type { StairSupport } from '../engine/stair'

const INK = '#37526e'
const CONC = '#eef3f8'
const MAIN = '#0f4c92'       // main bars along the span, near the soffit
const DIST = '#7c6f5a'       // distribution bars, seen end-on
const DIM = '#1f77b4'
const FAINT = '#a39d8d'
const HALO = { paintOrder: 'stroke' as const, stroke: 'var(--sheet, #fff)', strokeWidth: 2.6 }

export interface StairFlightProps {
  /** Plan span, m. */
  span: number
  /** Waist, riser, going, cover, bar diameters — mm. */
  t: number; R: number; G: number; cover: number; barDia: number; distDia: number
  mainSpacing: number; distSpacing: number
  support: StairSupport
}

export function StairFlight({ span, t, R, G, cover, barDia, distDia, mainSpacing, distSpacing, support }: StairFlightProps) {
  const Lmm = Math.max(span * 1000, 1)
  const tanT = R / Math.max(G, 1)
  const cosT = 1 / Math.hypot(1, tanT), sinT = tanT * cosT
  const rise = Lmm * tanT
  // one scale, fitted to whichever of the run or the rise binds
  const s = Math.min(270 / Lmm, 165 / Math.max(rise + t / cosT + R, 1))
  const ML = 44, MT = 34
  const W = ML + Lmm * s + 76
  const yBase = MT + (rise + R) * s          // root line at x = 0
  // mm along the flight (x plan, z up) → px
  const X = (x: number) => ML + x * s
  const Y = (z: number) => yBase - z * s
  // perpendicular offset BELOW the root line, mm
  const nx = sinT, nz = -cosT
  const below = (x: number, off: number): [number, number] => [X(x + nx * off), Y(x * tanT + nz * off)]

  // steps at true R × G above the root line, clipped to the plan span
  const n = Math.max(1, Math.ceil(Lmm / Math.max(G, 1) - 1e-9))
  let d = `M${X(0)} ${Y(0)}`
  for (let k = 0; k < n; k++) {
    const x0 = k * G, x1 = Math.min((k + 1) * G, Lmm)
    d += ` L${X(x0)} ${Y((k + 1) * R)} L${X(x1)} ${Y((k + 1) * R)} L${X(x1)} ${Y(x1 * tanT)}`
  }
  // the waist soffit, t below the root line measured square to the slope
  const [sx0, sy0] = below(0, t), [sx1, sy1] = below(Lmm, t)
  const outline = `${d} L${sx1} ${sy1} L${sx0} ${sy0} Z`

  // main bars: cover + db/2 above the soffit; distribution bars on top of them
  const offMain = t - cover - barDia / 2
  const offDist = t - cover - barDia - distDia / 2
  const [mx0, my0] = below(0, offMain), [mx1, my1] = below(Lmm, offMain)
  const slopeLen = Lmm / cosT
  const nd = Math.max(1, Math.floor(slopeLen / Math.max(distSpacing, 50)))
  const dots = Array.from({ length: nd }, (_, i) => {
    const along = ((i + 0.5) / nd) * slopeLen
    return below(along * cosT, offDist)
  })
  const rDot = Math.max(1.6, (distDia / 2) * s)

  // bearings under the soffit ends; a continuous end is a slab carried on
  // past the support and broken off
  const contLow = support === 'both-ends'
  const contHigh = support !== 'simple'
  const bearing = (x: number, y: number, key: string) => (
    <path key={key} d={`M${x} ${y} l-6 11 h12 z`} fill="var(--sheet, #fff)" stroke={INK} strokeWidth={1.3} />
  )

  // R and G on a step in the middle of the flight; t at the second root corner
  const k = Math.min(n - 1, Math.max(1, Math.floor(n / 2)))
  const gY = Y((k + 2) * R) - 12
  const kt = Math.min(1, n - 1)
  const [tA, tAy] = [X(kt * G), Y(kt * R)]
  const [tB, tBy] = below(kt * G, t)

  const featY = Math.max(sy0, sy1) + 11
  const dimY = featY + 22
  const H = dimY + 34

  return (
    <DrawingFrame label="stair flight section">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-auto w-full max-w-[460px]" style={{ fontFamily: 'Arial, sans-serif' }}>
        <path d={outline} fill={CONC} stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />

        {/* continuity past a support: the slab carries on, broken off */}
        {contLow && <path d={`M${sx0} ${sy0} l-22 0 m0 0 l-3 -4 l4 -3 l-3 -4 M${X(0)} ${Y(0)} l-22 0`} fill="none" stroke={INK} strokeWidth={1.1} />}
        {contHigh && <path d={`M${sx1} ${sy1} l22 0 l3 -4 l-4 -3 l3 -4 M${X(Lmm)} ${Y(Lmm * tanT)} l22 0`} fill="none" stroke={INK} strokeWidth={1.1} />}

        <line x1={mx0} y1={my0} x2={mx1} y2={my1} stroke={MAIN} strokeWidth={Math.max(1.6, barDia * s)} strokeLinecap="round" />
        {dots.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={rDot} fill={DIST} />)}

        {bearing(sx0, sy0, 'lo')}
        {bearing(sx1, sy1, 'hi')}

        {/* G: extension lines up from two nosings to a common line above */}
        <g stroke={DIM}>
          <line x1={X(k * G)} y1={Y((k + 1) * R) - 3} x2={X(k * G)} y2={gY - 4} strokeWidth={0.6} />
          <line x1={X((k + 1) * G)} y1={Y((k + 2) * R) - 3} x2={X((k + 1) * G)} y2={gY - 4} strokeWidth={0.6} />
          <line x1={X(k * G)} y1={gY} x2={X((k + 1) * G)} y2={gY} strokeWidth={0.9} />
        </g>
        <Tick x={X(k * G)} y={gY} /><Tick x={X((k + 1) * G)} y={gY} />
        <text x={X((k + 0.5) * G)} y={gY - 5} fontSize={9} fill={DIM} textAnchor="middle" {...HALO}>G {Math.round(G)}</text>

        {/* R: from the tread below to an extension off the nosing */}
        <g stroke={DIM}>
          <line x1={X(k * G) - 3} y1={Y((k + 1) * R)} x2={X(k * G) - 16} y2={Y((k + 1) * R)} strokeWidth={0.6} />
          <line x1={X(k * G) - 12} y1={Y(k * R)} x2={X(k * G) - 12} y2={Y((k + 1) * R)} strokeWidth={0.9} />
        </g>
        <Tick x={X(k * G) - 12} y={Y(k * R)} /><Tick x={X(k * G) - 12} y={Y((k + 1) * R)} />
        <text x={X(k * G) - 17} y={Y((k + 0.5) * R) + 3} fontSize={9} fill={DIM} textAnchor="end" {...HALO}>R {Math.round(R)}</text>

        {/* t: square to the slope, root corner to soffit */}
        <line x1={tA} y1={tAy} x2={tB} y2={tBy} stroke={DIM} strokeWidth={0.9} />
        <Tick x={tA} y={tAy} /><Tick x={tB} y={tBy} />
        <text x={tB + 6} y={tBy + 10} fontSize={9} fill={DIM} {...HALO}>t {Math.round(t)}</text>

        {/* bar callouts, leaders landing on the bar they name */}
        {(() => {
          const [lx, ly] = below(Lmm * 0.62, offMain)
          const [dx, dy] = dots[Math.min(dots.length - 1, Math.floor(dots.length * 0.3))]
          return (
            <g fontSize={8.5}>
              <line x1={lx} y1={ly} x2={lx + 26} y2={ly + 26} stroke={MAIN} strokeWidth={0.8} />
              <text x={lx + 28} y={ly + 30} fill={MAIN} {...HALO}>main ⌀{barDia} @ {Math.round(mainSpacing)}</text>
              <line x1={dx} y1={dy} x2={dx + 18} y2={dy + 30} stroke={DIST} strokeWidth={0.8} />
              <text x={dx + 20} y={dy + 38} fill={DIST} {...HALO}>dist ⌀{distDia} @ {Math.round(distSpacing)}</text>
            </g>
          )
        })()}

        {/* plan span between the bearings; the upper bearing's extension
            line runs down to meet the shared start */}
        <line x1={sx1} y1={sy1 + 13} x2={sx1} y2={featY + 4} stroke={DIM} strokeWidth={0.6} />
        <line x1={sx0} y1={sy0 + 13} x2={sx0} y2={featY + 4} stroke={DIM} strokeWidth={0.6} />
        <DimBelow xA={sx0} xB={sx1} featY={featY} dY={dimY} label={`L = ${span.toFixed(2)} m (plan)`} />

        <text x={W / 2} y={H - 6} fontSize={7.5} fill={FAINT} textAnchor="middle">
          drawn to one scale · θ = {(Math.atan(tanT) * 180 / Math.PI).toFixed(1)}° · {support === 'simple' ? 'simply supported' : support === 'one-end' ? 'continuous at one end (drawn at the top)' : 'continuous at both ends'}
        </text>
      </svg>
    </DrawingFrame>
  )
}
