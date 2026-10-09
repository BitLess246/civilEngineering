// ─────────────────────────────────────────────────────────────────────────
// Drawing for the stair calculator — the flight in longitudinal section, WITH
// both landings and the reinforcement detail at each junction.
//
// One scale for everything: plan span, rise, waist, landings and steps are
// all drawn at the same mm → px factor. The flight spans L (plan) between
// landing beams on the two bearing lines — the span the moment is computed on.
//
// The detail at the junctions is the point of the drawing (geometry in
// `lib/stairDetail`): where a face turns through a REENTRANT corner the bars
// CROSS and each runs ℓd past it; where it turns CONVEX the bar bends round.
// The waist t is measured square to the slope, as the engine takes it.
// ─────────────────────────────────────────────────────────────────────────
import { DimBelow, Tick } from './dims'
import { DrawingFrame } from './DrawingFrame'
import type { StairSupport } from '../engine/stair'
import { stairDetail, type Pt } from '../lib/stairDetail'

const INK = '#37526e'
const CONC = '#eef3f8'
const MAIN = '#0f4c92'       // bottom bars — the main tension steel
const TOP = '#7a3f8f'        // top bars at the junctions
const DIST = '#7c6f5a'       // distribution bars, seen end-on
const DIM = '#1f77b4'
const CL = '#7a8899'
const FAINT = '#a39d8d'
const HALO = { paintOrder: 'stroke' as const, stroke: 'var(--sheet, #fff)', strokeWidth: 2.6 }

export interface StairFlightProps {
  /** Plan span, m. */
  span: number
  /** Waist, riser, going, cover, bar diameters — mm. */
  t: number; R: number; G: number; cover: number; barDia: number; distDia: number
  mainSpacing: number; distSpacing: number
  support: StairSupport
  /** Tension development length of the main bar, mm. */
  ld?: number
}

export function StairFlight({ span, t, R, G, cover, barDia, distDia, mainSpacing, distSpacing, support, ld }: StairFlightProps) {
  const L = Math.max(span * 1000, 1)
  const g = stairDetail({ L, t, R, G, cover, db: barDia, ld, landing: Math.max(900, Math.min(1400, L * 0.3)) })
  const bd = g.beams[0][3] - g.beams[0][1]
  // one scale, fitted to whichever of the run or the rise binds
  const worldW = g.xRight - g.xLeft, worldH = g.zTop + bd
  const s = Math.min(560 / worldW, 270 / worldH)
  const ML = 30, MT = 46
  const W = ML + worldW * s + 30
  const X = (x: number) => ML + (x - g.xLeft) * s
  const Y = (z: number) => MT + (g.zTop - z) * s
  const pts = (line: Pt[]) => line.map(([x, z]) => `${X(x).toFixed(1)},${Y(z).toFixed(1)}`).join(' ')

  // the outline with its two far ends broken: a zigzag replaces the edge
  const zigV = (x: number, z0: number, z1: number) => {
    const n = 4, out: string[] = []
    for (let k = 1; k < n; k++) out.push(`${(X(x) + (k % 2 ? 4 : -4)).toFixed(1)},${Y(z0 + ((z1 - z0) * k) / n).toFixed(1)}`)
    return out.join(' ')
  }
  const o = g.outline
  const iRightTop = o.findIndex(([x, z]) => x === g.xRight && z === g.zTop)
  const outlinePts = [
    ...o.slice(0, iRightTop + 1).map(([x, z]) => `${X(x).toFixed(1)},${Y(z).toFixed(1)}`),
    zigV(g.xRight, g.zTop, g.zTop - t),
    ...o.slice(iRightTop + 1).map(([x, z]) => `${X(x).toFixed(1)},${Y(z).toFixed(1)}`),
    zigV(g.xLeft, -t, 0),
  ].join(' ')

  // distribution bars, end-on, just inside the main/landing bottom bars
  const dots: Pt[] = []
  const step = Math.max(distSpacing, 80)
  const along = (a: Pt, b: Pt, inset: number, nx: number, nz: number) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    const m = Math.max(1, Math.floor(len / step))
    for (let k = 0; k < m; k++) {
      const f = (k + 0.5) / m
      dots.push([a[0] + (b[0] - a[0]) * f + nx * inset, a[1] + (b[1] - a[1]) * f + nz * inset])
    }
  }
  const inset = (barDia + distDia) / 2
  const [fb0, fb1, fb2] = g.flightBottom
  along(fb0, fb1, inset, 0, 1)                                  // lower landing
  along(fb1, fb2, inset, -Math.sin(Math.atan(g.tan)), g.cos)    // flight
  along(g.upperLandingBottom[1], g.upperLandingBottom[0], inset, 0, 1) // upper landing
  const rDot = Math.max(1.5, (distDia / 2) * s)

  // R and G on a step in the middle of the flight; t at the second root corner
  const k = Math.min(g.n - 2, Math.max(1, Math.floor(g.n / 2)))
  const gY = Y((k + 2) * R) - 12
  const kt = Math.min(1, g.n - 1)
  const sinT = g.tan * g.cos
  const [tA, tAy] = [X(kt * G), Y(kt * R)]
  const [tB, tBy] = [X(kt * G + sinT * t), Y(kt * R - g.cos * t)]

  const beamY = Y(g.beams[0][1])
  const dimY = beamY + 34
  const H = dimY + 40
  const cont = support === 'simple' ? 'nominal top' : 'top (continuity)'

  return (
    <DrawingFrame label="stair flight section">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-auto w-full max-w-[640px]" style={{ fontFamily: 'Arial, sans-serif' }}>
        <polygon points={outlinePts} fill={CONC} stroke={INK} strokeWidth={1.3} strokeLinejoin="round" />

        {/* the bars — bottom (main), then the top bars at the junctions */}
        <g fill="none" strokeLinecap="round" strokeLinejoin="round">
          <polyline points={pts(g.flightBottom)} stroke={MAIN} strokeWidth={Math.max(1.6, barDia * s)} />
          <polyline points={pts(g.upperLandingBottom)} stroke={MAIN} strokeWidth={Math.max(1.6, barDia * s)} />
          <polyline points={pts(g.lowerLandingTop)} stroke={TOP} strokeWidth={Math.max(1.4, barDia * s * 0.9)} />
          <polyline points={pts(g.flightTopLower)} stroke={TOP} strokeWidth={Math.max(1.4, barDia * s * 0.9)} />
          <polyline points={pts(g.flightTopUpper)} stroke={TOP} strokeWidth={Math.max(1.4, barDia * s * 0.9)} />
        </g>
        {dots.map(([x, z], i) => <circle key={i} cx={X(x)} cy={Y(z)} r={rDot} fill={DIST} />)}

        {/* the two crossings, ringed — where a bent bar would have spalled the cover */}
        {[g.crossUpper, g.crossLower].map(([x, z], i) => (
          <circle key={i} cx={X(x)} cy={Y(z)} r={7} fill="none" stroke="#b3402a" strokeWidth={1} strokeDasharray="2 2" />
        ))}
        {/* callouts run OUT of the drawing, under the landings, clear of the bars */}
        {(() => {
          const [ux, uz] = g.crossUpper, [lx, lz] = g.crossLower
          const uTx = X(g.beams[1][2]) + 12, uTy = Y(g.zTop - t) + 12
          const lTx = X(g.beams[0][0]) - 12, lTy = Y(-t) + 12
          return (
            <g fontSize={8} fill="#b3402a">
              <polyline points={`${X(ux) + 5},${Y(uz) + 5} ${uTx - 2},${uTy}`} fill="none" stroke="#b3402a" strokeWidth={0.7} />
              <text x={uTx} y={uTy + 3} {...HALO}>bars cross<tspan x={uTx} dy={9.5}>ℓd ≥ {Math.round(g.ld)} past</tspan></text>
              <polyline points={`${X(lx) - 5},${Y(lz) + 5} ${lTx + 2},${lTy}`} fill="none" stroke="#b3402a" strokeWidth={0.7} />
              <text x={lTx} y={lTy + 3} textAnchor="end" {...HALO}>bars cross<tspan x={lTx} dy={9.5}>ℓd ≥ {Math.round(g.ld)} past</tspan></text>
            </g>
          )
        })()}

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
          const mid: Pt = [fb1[0] + (fb2[0] - fb1[0]) * 0.55, fb1[1] + (fb2[1] - fb1[1]) * 0.55]
          const dm = dots[Math.min(dots.length - 1, Math.floor(dots.length * 0.4))]
          const ub = g.upperLandingBottom[0]
          const tl = g.lowerLandingTop[0]
          return (
            <g fontSize={8.5}>
              <line x1={X(mid[0])} y1={Y(mid[1])} x2={X(mid[0]) + 24} y2={Y(mid[1]) + 26} stroke={MAIN} strokeWidth={0.8} />
              <text x={X(mid[0]) + 26} y={Y(mid[1]) + 34} fill={MAIN} {...HALO}>main ⌀{barDia} @ {Math.round(mainSpacing)} — bottom, into both landings</text>
              {dm && <>
                <line x1={X(dm[0])} y1={Y(dm[1])} x2={X(dm[0]) - 30} y2={Y(dm[1]) - 30} stroke={DIST} strokeWidth={0.8} />
                <text x={X(dm[0]) - 32} y={Y(dm[1]) - 33} fill={DIST} textAnchor="end" {...HALO}>dist ⌀{distDia} @ {Math.round(distSpacing)}</text>
              </>}
              <line x1={X(ub[0] - 160)} y1={Y(ub[1])} x2={X(ub[0] - 160)} y2={Y(g.zTop) - 12} stroke={MAIN} strokeWidth={0.8} />
              <circle cx={X(ub[0] - 160)} cy={Y(ub[1])} r={1.6} fill={MAIN} />
              <text x={X(ub[0] - 160) + 3} y={Y(g.zTop) - 15} fill={MAIN} textAnchor="end" {...HALO}>landing ⌀{barDia} @ {Math.round(mainSpacing)} bottom</text>
              <line x1={X(tl[0] + 120)} y1={Y(tl[1])} x2={X(tl[0] + 120)} y2={Y(tl[1]) - 20} stroke={TOP} strokeWidth={0.8} />
              <text x={X(tl[0] + 120)} y={Y(tl[1]) - 24} fill={TOP} {...HALO}>{cont} ⌀{barDia}</text>
            </g>
          )
        })()}

        {/* the landing beams on the bearing lines; the span between their centrelines */}
        {g.beams.map(([x0, z0, x1], i) => (
          <g key={i}>
            <line x1={X((x0 + x1) / 2)} y1={Y(z0) - 6} x2={X((x0 + x1) / 2)} y2={dimY + 5} stroke={CL} strokeWidth={0.7} strokeDasharray="10 3 2 3" />
            {/* the upper beam's label stands off to the right, clear of the soffit running in from the left */}
            <text x={i ? X(x1) + 3 : X((x0 + x1) / 2)} y={Y(z0) + (i ? 8 : 10)} fontSize={7.5} fill={FAINT} textAnchor={i ? 'start' : 'middle'} {...HALO}>landing beam</text>
          </g>
        ))}
        <DimBelow xA={X(0)} xB={X(L)} featY={dimY - 12} dY={dimY} label={`L = ${span.toFixed(2)} m (plan)`} />

        <text x={W / 2} y={H - 6} fontSize={7.5} fill={FAINT} textAnchor="middle">
          drawn to one scale · θ = {(Math.atan(g.tan) * 180 / Math.PI).toFixed(1)}° · landings broken off · {support === 'simple' ? 'simply supported on the landing beams' : support === 'one-end' ? 'continuous at one end' : 'continuous at both ends'}
        </text>
      </svg>
    </DrawingFrame>
  )
}
