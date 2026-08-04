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
  const nSteps = Math.max(1, Math.round((span * 1000 * Math.cos(th)) / Math.max(G, 1)))

  // Horizontal run and rise of the flight, in mm, from the step count so the
  // drawn staircase and the drawn slope are the same object.
  const run = nSteps * G
  const rise = nSteps * R

  const ML = 70, MR = 74, MB = 64
  const DRAW_W = 470
  const s = DRAW_W / Math.max(run, 1)
  // The top margin has to clear what sits ABOVE the soffit's top end: the
  // waist thickness plus one riser. A fixed 40 clipped the last tread off the
  // top of the frame on a thick waist.
  const MT = 18 + t * s + R * s
  const H = rise * s
  const W = ML + DRAW_W + MR, HT = MT + H + MB

  // Soffit runs from the bottom-left support up to the top-right. The waist is
  // offset NORMAL to it — components (sinθ, −cosθ) scaled by t.
  const x0 = ML, y0 = MT + H          // bottom of the soffit
  const x1 = ML + DRAW_W, y1 = MT     // top of the soffit
  const tw = t * s
  const nx = Math.sin(th) * tw, ny = -Math.cos(th) * tw

  // Step nosings, walked up the flight — from the TOP FACE of the waist, not
  // from the soffit. Walking from the soffit drew the treads one waist-
  // thickness low and left a spike where the last one overshot the top of the
  // slab, which is what the first render showed.
  const stepPts: string[] = []
  for (let i = 0; i < nSteps; i++) {
    const bx = x0 + nx + i * G * s, by = y0 + ny - i * R * s
    stepPts.push(`${bx},${by}`, `${bx},${by - R * s}`, `${bx + G * s},${by - R * s}`)
  }

  return (
    <svg viewBox={`0 0 ${W} ${HT}`} className="mx-auto block h-auto w-full"
      style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* the waist slab — a parallelogram offset normal to the soffit */}
      <path d={`M${x0} ${y0} L${x1} ${y1} L${x1 + nx} ${y1 + ny} L${x0 + nx} ${y0 + ny} z`}
        fill={CONC} stroke={INK} strokeWidth={1.6} />

      {/* the treads and risers, sitting on top of the waist as dead load */}
      <polygon points={`${x0 + nx},${y0 + ny} ${stepPts.join(' ')} ${x1 + nx},${y1 + ny}`}
        fill={STEP} stroke={INK} strokeWidth={1.1} />

      {/* main steel — parallel to the flight, in the tension face at the soffit */}
      <line x1={x0 + nx * 0.22} y1={y0 + ny * 0.22} x2={x1 + nx * 0.22} y2={y1 + ny * 0.22}
        stroke={MAIN} strokeWidth={2.2} strokeLinecap="round" />
      {/* distribution steel — crossing the main bars, so seen end-on */}
      {Array.from({ length: nSteps }, (_, i) => {
        const f = (i + 0.5) / nSteps
        return <circle key={i} cx={x0 + (x1 - x0) * f + nx * 0.5} cy={y0 + (y1 - y0) * f + ny * 0.5} r={1.9} fill={DIST} />
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
          const ox = Math.sin(th) * 34, oy = -Math.cos(th) * 34
          return (
            <>
              <line x1={mx} y1={my} x2={mx + nx} y2={my + ny} />
              <line x1={mx - 4} y1={my - 4} x2={mx + 4} y2={my + 4} />
              <line x1={mx + nx - 4} y1={my + ny - 4} x2={mx + nx + 4} y2={my + ny + 4} />
              <text x={mx + ox} y={my + oy} fontSize={8.5} fill={DIM} stroke="none" textAnchor="middle"
                paintOrder="stroke" strokeWidth={2.6}>t = {t} mm ⟂</text>
            </>
          )
        })()}
      </g>

      {/* riser and going on the first step */}
      <g fontSize={8} fill={DIM}>
        <text x={x0 + G * s * 0.5} y={y0 - R * s - 5} textAnchor="middle"
          paintOrder="stroke" stroke="#fff" strokeWidth={2.4}>G = {G}</text>
        <text x={x0 - 6} y={y0 - R * s * 0.5} textAnchor="end"
          paintOrder="stroke" stroke="#fff" strokeWidth={2.4}>R = {R}</text>
      </g>

      {/* slope */}
      <g>
        <path d={`M${x0 + 46} ${y0} A 46 46 0 0 0 ${x0 + 46 * Math.cos(th)} ${y0 - 46 * Math.sin(th)}`}
          fill="none" stroke={FAINT} strokeWidth={0.9} />
        <text x={x0 + 54} y={y0 - 14} fontSize={8.5} fill={FAINT}>θ = {thetaDeg.toFixed(1)}°</text>
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

      {/* legend */}
      <g fontSize={8}>
        <line x1={W - MR + 4} y1={MT + 6} x2={W - MR + 18} y2={MT + 6} stroke={MAIN} strokeWidth={2.2} />
        <text x={W - MR + 22} y={MT + 9} fill={MAIN}>main ∥</text>
        <circle cx={W - MR + 11} cy={MT + 20} r={1.9} fill={DIST} />
        <text x={W - MR + 22} y={MT + 23} fill={DIST}>dist ⊙</text>
        {mainBars && <text x={W - MR + 4} y={MT + 38} fill={MAIN}>{mainBars}</text>}
        {distBars && <text x={W - MR + 4} y={MT + 50} fill={DIST}>{distBars}</text>}
      </g>

      <text x={W / 2} y={HT - 8} fontSize={7.5} fill={FAINT} textAnchor="middle">
        Waist measured NORMAL to the soffit · treads are dead load, not structure · drawn to scale
      </text>
    </svg>
  )
}
