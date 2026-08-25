// ─────────────────────────────────────────────────────────────────────────
// Elevation of one stair flight — the drawing the page did not have.
//
// Shows the three things a waist-slab design is actually about and which no
// table of numbers makes obvious:
//
//   • the WAIST is measured NORMAL to the soffit, not vertically. That is the
//     whole reason θ and the slope factor 1/cosθ exist, and drawing it
//     vertically would quietly contradict the calculation on the same page.
//   • the steps sit ON TOP of the waist as triangular fill — they are dead
//     load, not structure, which is why `stairLoads` counts them separately.
//   • the main bars run PARALLEL to the flight in the tension face, and the
//     distribution bars cross them.
//
// Geometry only. Nothing here decides anything; `engine/stair` does.
// ─────────────────────────────────────────────────────────────────────────

import { flightGeometry, MARGIN } from './stairLayout'

const INK = '#37526e'
const CONC = '#eef3f8'
const STEP = '#dde5ee'
const MAIN = '#c2402a'
const DIST = '#0f4c92'
const DIM = '#1f77b4'
const FAINT = '#a39d8d'

export interface StairElevationProps {
  /** Clear flight span along the SLOPE, m. */
  span: number
  /** Waist thickness, mm — normal to the soffit. */
  t: number
  /** Riser and going, mm. */
  R: number
  G: number
  /** Slope, degrees, from the engine so the drawing cannot disagree with it. */
  thetaDeg: number
  /** Bar callouts. */
  mainBars?: string
  distBars?: string
  /** How the flight is held, so the supports draw correctly. */
  support: 'simple' | 'one-end' | 'both-ends'
}

export function StairElevation({
  span, t, R, G, thetaDeg, mainBars, distBars, support,
}: StairElevationProps) {
  const th = (thetaDeg * Math.PI) / 180
  const { W, HT, MT, x0, y0, x1, y1, tv, nx, ny, nSteps, profile, flight, scale: s } =
    flightGeometry(span, t, R, G, thetaDeg)
  const ML = MARGIN.left
  const pt = (p: readonly [number, number]) => `${p[0]},${p[1]}`

  return (
    <svg viewBox={`0 0 ${W} ${HT}`} className="mx-auto block h-auto w-full"
      style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* the flight, filled as one piece of concrete */}
      <polygon points={flight.map(pt).join(' ')} fill={CONC} stroke="none" />

      {/* the step triangles tinted — dead load sitting on the waist, not
          structure, which is why `stairLoads` counts them separately. Fill
          only: their lower edge is the waist reference line, not an edge. */}
      <polygon points={profile.map(pt).join(' ')} fill={STEP} stroke="none" />

      {/* the waist's top face — a reference for t, so light and dashed */}
      <line x1={x0} y1={y0 - tv} x2={x1} y2={y1 - tv}
        stroke={INK} strokeWidth={0.7} strokeDasharray="5 4" opacity={0.45} />

      {/* ...and the single concrete outline over the top of all of it, so the
          risers are full-height vertical faces and the treads horizontal ones */}
      <polygon points={flight.map(pt).join(' ')} fill="none" stroke={INK}
        strokeWidth={1.6} strokeLinejoin="miter" />

      {/* main steel — parallel to the flight, in the tension face at the soffit */}
      <line x1={x0} y1={y0 - tv * 0.22} x2={x1} y2={y1 - tv * 0.22}
        stroke={MAIN} strokeWidth={2.2} strokeLinecap="round" />
      {/* distribution steel — crossing the main bars, so seen end-on */}
      {Array.from({ length: nSteps }, (_, i) => {
        const f = (i + 0.5) / nSteps
        return <circle key={i} cx={x0 + (x1 - x0) * f} cy={y0 + (y1 - y0) * f - tv * 0.5} r={1.9} fill={DIST} />
      })}

      {/* supports: a hatched bearing at each held end */}
      {([['bottom', x0, y0], ['top', x1, y1]] as const).map(([which, bx, by]) => {
        const held = support === 'both-ends' || (support === 'one-end' && which === 'top') || support === 'simple'
        if (!held) return null
        const fixed = support === 'both-ends' || (support === 'one-end' && which === 'top')
        return (
          <g key={which}>
            <rect x={bx - 13} y={by + (which === 'bottom' ? 0 : 0)} width={26} height={16}
              fill="#e2e5ea" stroke={INK} strokeWidth={1.1} />
            <text x={bx} y={by + 27} fontSize={7.5} fill={FAINT} textAnchor="middle">
              {fixed ? 'continuous' : 'simple'}
            </text>
          </g>
        )
      })}

      {/* ── dimensions ───────────────────────────────────────────────────── */}
      {/* waist, normal to the soffit — drawn along the normal on purpose */}
      <g stroke={DIM} strokeWidth={0.9} fill="none">
        {(() => {
          const mx = (x0 + x1) / 2, my = (y0 + y1) / 2
          // Label BELOW the soffit, on a leader. Along the +normal it landed
          // inside a step, crossing the profile it was measuring off — and a
          // short drop is not enough either, because the label is horizontal
          // and the soffit is not: over the label's own half-width the soffit
          // climbs by tanθ × that, and eats the text from the side.
          const off = 52
          const ox = -Math.sin(th) * off, oy = Math.cos(th) * off
          return (
            <>
              <line x1={mx} y1={my} x2={mx + nx} y2={my + ny} />
              <line x1={mx - 4} y1={my - 4} x2={mx + 4} y2={my + 4} />
              <line x1={mx + nx - 4} y1={my + ny - 4} x2={mx + nx + 4} y2={my + ny + 4} />
              <line x1={mx} y1={my} x2={mx + ox} y2={my + oy} strokeDasharray="3 3" opacity={0.7} />
              <text x={mx + ox} y={my + oy + 10} fontSize={8.5} fill={DIM} stroke="none" textAnchor="middle"
                paintOrder="stroke" strokeWidth={2.6}>t = {t} mm ⟂</text>
            </>
          )
        })()}
      </g>

      {/* riser and going on the first step */}
      <g fontSize={8} fill={DIM}>
        <text x={x0 + G * s * 0.5} y={y0 - tv - R * s - 5} textAnchor="middle"
          paintOrder="stroke" stroke="#fff" strokeWidth={2.4}>G = {G}</text>
        <text x={x0 - 6} y={y0 - tv - R * s * 0.5} textAnchor="end"
          paintOrder="stroke" stroke="#fff" strokeWidth={2.4}>R = {R}</text>
      </g>

      {/* slope — with the horizontal leg it is measured FROM, so the arc has
          two sides to subtend instead of floating beside the soffit */}
      <g fill="none" stroke={FAINT} strokeWidth={0.9}>
        <line x1={x0} y1={y0} x2={x0 + 58} y2={y0} strokeDasharray="4 3" />
        <path d={`M${x0 + 46} ${y0} A 46 46 0 0 0 ${x0 + 46 * Math.cos(th)} ${y0 - 46 * Math.sin(th)}`} />
        <text x={x0 + 62} y={y0 - 12} fontSize={8.5} fill={FAINT} stroke="none">θ = {thetaDeg.toFixed(1)}°</text>
      </g>

      {/* flight span, ALONG THE SLOPE — the span the moment is computed on */}
      <g>
        <line x1={x0} y1={HT - 30} x2={x1} y2={HT - 30} stroke={DIM} strokeWidth={0.9} />
        {[x0, x1].map((x, i) => (
          <line key={i} x1={x - 4} y1={HT - 26} x2={x + 4} y2={HT - 34} stroke={DIM} strokeWidth={1.2} />
        ))}
        <text x={(x0 + x1) / 2} y={HT - 34} fontSize={9} fill={DIM} textAnchor="middle"
          paintOrder="stroke" stroke="#fff" strokeWidth={2.6}>
          flight span = {span.toFixed(2)} m along the slope · {nSteps} risers
        </text>
      </g>

      {/* legend — TOP LEFT. On the right it sat on the top bearing and the end
          of the flight; the flight climbs to the right, so this corner is the
          one stretch of the frame that is empty whatever the geometry. */}
      <g fontSize={8}>
        <line x1={ML + 2} y1={MT + 6} x2={ML + 16} y2={MT + 6} stroke={MAIN} strokeWidth={2.2} />
        <text x={ML + 20} y={MT + 9} fill={MAIN}>main ∥</text>
        <circle cx={ML + 9} cy={MT + 20} r={1.9} fill={DIST} />
        <text x={ML + 20} y={MT + 23} fill={DIST}>dist ⊙</text>
        {mainBars && <text x={ML + 2} y={MT + 38} fill={MAIN}>{mainBars}</text>}
        {distBars && <text x={ML + 2} y={MT + 50} fill={DIST}>{distBars}</text>}
      </g>

      <text x={W / 2} y={HT - 8} fontSize={7.5} fill={FAINT} textAnchor="middle">
        Waist measured NORMAL to the soffit · treads are dead load, not structure · drawn to scale
      </text>
    </svg>
  )
}
