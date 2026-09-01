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

import { flightGeometry, barPath, stairBars, offsetPath, MARGIN, type Pt } from './stairLayout'

const INK = '#37526e'
const CONC = '#eef3f8'
const STEP = '#dde5ee'
const MAIN = '#c2402a'
const DIST = '#0f4c92'
const DIM = '#1f77b4'
const FAINT = '#a39d8d'

export interface StairElevationProps {
  /** Flight length in PLAN, m — the horizontal distance between the landings.
   *  The same quantity `designStair` computes Mu on, so the drawing and the
   *  calculation describe one stair. */
  run: number
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
  /** Landing length each end, mm. 0 draws the flight alone, as before. */
  landing?: number
  /** How far the steel carries past each re-entrant corner, mm. */
  ext?: number
  /** Landing bar callout, where it differs from the flight's. */
  landingBars?: string
}

export function StairElevation({
  run, t, R, G, thetaDeg, mainBars, distBars, support,
  landing = 0, ext = 450, landingBars,
}: StairElevationProps) {
  const th = (thetaDeg * Math.PI) / 180
  const g = flightGeometry(run, t, R, G, thetaDeg, landing)
  const { W, HT, MT, x0, y0, x1, y1, tv, nx, ny, nSteps, profile, flight, scale: s } = g
  const { lowLanding, upLanding, soffitLine, topLine } = g
  const ML = MARGIN.left
  const pt = (p: Pt) => `${p[0]},${p[1]}`
  const poly = (ps: Pt[]) => ps.map(pt).join(' ')

  // The bar layers: the two faces pulled in by the cover, which is what the
  // steel actually follows.
  const cov = tv * 0.18
  const inset = (line: Pt[], dir: 1 | -1): Pt[] => line.map(([x, y]) => [x, y + dir * cov] as Pt)
  const botLine = inset(soffitLine, -1)
  const topLineBar = inset(topLine, 1)
  // Bend radius and end hook, in drawing units. A bar turns through a radius
  // and returns 90° into the slab at a free edge; drawn as a bare polyline it
  // was neither.
  const rBend = Math.max(3, tv * 0.35)
  const hookLen = landing > 0 ? Math.max(6, tv * 0.55) : 0
  // WHICH bar turns each kink, and which two cross it — see `stairBars`. A top
  // bar hooks DOWN into the slab and a soffit bar UP, each away from the face
  // it covers, because that is the only side with concrete to develop into.
  // The lapping bar is placed one bar clear INSIDE the layer it laps past, the
  // way it is on site — otherwise it is drawn on top of that layer and the
  // detail this elevation exists to show is invisible.
  const barGap = Math.max(3, tv * 0.14)
  const bars = stairBars(botLine, topLineBar, ext, s, barGap)
  const drawn = bars.map((b) => ({
    ...b,
    path: barPath(b.pts, rBend, {
      hookStart: b.hookStart * hookLen,
      hookEnd: b.hookEnd * hookLen,
      hookDy: b.face === 'top' ? 1 : -1,
    }),
  }))

  return (
    <svg viewBox={`0 0 ${W} ${HT}`} className="mx-auto block h-auto w-full"
      style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* the landings, same waist, butting the flight's vertical end faces */}
      {lowLanding.length > 0 && <polygon points={poly(lowLanding)} fill={CONC} stroke={INK} strokeWidth={1.6} />}
      {upLanding.length > 0 && <polygon points={poly(upLanding)} fill={CONC} stroke={INK} strokeWidth={1.6} />}

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

      {/* ── main steel ────────────────────────────────────────────────────
          Four bars, and only TWO bends between them. At each kink the layer
          whose bend would bear on concrete turns the corner; the other pair
          carry straight on past it and lap — see `stairBars` for why, and the
          anchorage dimension below for how far. */}
      {drawn.map((b) => (
        <path key={b.id} d={b.path.d} fill="none" stroke={MAIN}
          strokeWidth={b.id.endsWith('-lap') ? 1.8 : 2.4}
          strokeLinecap="round" strokeLinejoin="round" />
      ))}

      {/* the two bends, so the turns read as turns — and so their absence at
          the other two corners reads as deliberate */}
      {drawn.flatMap((b) => b.path.bends).map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={1.7} fill="#0f4c92" stroke="#fff" strokeWidth={0.6} />
      ))}

      {/* distribution steel — crossing the main bars, so seen end-on */}
      {Array.from({ length: nSteps }, (_, i) => {
        const f = (i + 0.5) / nSteps
        return <circle key={i} cx={x0 + (x1 - x0) * f} cy={y0 + (y1 - y0) * f - tv * 0.5} r={1.9} fill={DIST} />
      })}

      {/* ── anchorage past the kink, for each bar that crosses it ────────
          One dimension per crossed bar — four, not the eight the old drawing
          stacked around two corners. Each FOLLOWS its own bar past the corner,
          bend and all, because a bent anchorage measured by the straight line
          between its ends prints 450 beside a line that is shorter than that. */}
      {landing > 0 && drawn.filter((b) => b.id.endsWith('-through') && b.anchor).map((b) => {
        const { corner, run } = b.anchor!
        const path = [corner, ...run]
        // ONE dimension per kink, not one per bar. Both crossed bars carry the
        // same distance past the same corner, and dimensioning both put two
        // lines through the same corner at different angles — they crossed each
        // other and their labels. The one drawn is the bar running into the
        // LANDING, whose run has clear space beside it.
        const side = b.face === 'soffit' ? -1 : 1
        const off = offsetPath(path, 19, side)
        const [d0, d1] = [off[0], off[1]]
        // Architectural tick — a slash across the dimension line, as on the
        // reference sheet, at each end of the run.
        const tick = (q: Pt, a: Pt, c: Pt) => {
          const dx = c[0] - a[0], dy = c[1] - a[1], L = Math.hypot(dx, dy) || 1
          return <line x1={q[0] - (dx / L) * 3.4} y1={q[1] - (dy / L) * 3.4}
            x2={q[0] + (dx / L) * 3.4} y2={q[1] + (dy / L) * 3.4} strokeWidth={1.2} />
        }
        // Label on the longest leg, turned to read along it and never upside
        // down.
        const legs = off.slice(1).map((p, i) => ({ a: off[i], b: p, L: Math.hypot(p[0] - off[i][0], p[1] - off[i][1]) }))
        const leg = legs.reduce((m, l) => (l.L > m.L ? l : m), legs[0])
        const mid: Pt = [(leg.a[0] + leg.b[0]) / 2, (leg.a[1] + leg.b[1]) / 2]
        let ang = (Math.atan2(leg.b[1] - leg.a[1], leg.b[0] - leg.a[0]) * 180) / Math.PI
        if (ang > 90 || ang < -90) ang += 180
        return (
          <g key={b.id} stroke={DIM} strokeWidth={0.75} fill="none">
            {path.map((p, i) => (
              <line key={i} x1={p[0]} y1={p[1]} x2={off[i][0]} y2={off[i][1]}
                strokeDasharray="3 2" opacity={0.5} />
            ))}
            <polyline points={poly(off)} />
            {tick(off[0], off[0], d1 ?? d0)}
            {tick(off[off.length - 1], off[off.length - 2], off[off.length - 1])}
            <text x={mid[0]} y={mid[1] - 3.5} fontSize={7} fill={DIM} stroke="#fff" strokeWidth={2.4}
              paintOrder="stroke" textAnchor="middle" transform={`rotate(${ang} ${mid[0]} ${mid[1]})`}>
              {ext}
            </text>
          </g>
        )
      })}

      {/* ── spacing callouts, on leaders ──────────────────────────────────
          Set as text laid over the member, each one landed on whatever was
          underneath it — the flight's callout rotated along the slope across
          the step outline and the G label, the lower landing's across its own
          anchorage dimension. A leader says which bar it means and puts the
          words where there is room, which is what the reference sheet does with
          its lettered callouts. */}
      {landing > 0 && mainBars && (() => {
        const lw = landing * s
        const notes: { at: Pt; to: Pt; text: string }[] = [
          // the flight — down-right into the empty quadrant under the soffit.
          // Pointed at a bar two thirds up and landed just past the flight's
          // own foot: aimed at midspan and landed off the far corner it drew a
          // leader longer than the flight it labelled.
          { at: [x0 + (x1 - x0) * 0.72, y0 + (y1 - y0) * 0.72 + cov * 0.5],
            to: [x0 + (x1 - x0) * 0.86, y0 + 24], text: mainBars },
          // the lower landing — BELOW its own slab. Above it, the leader walked
          // left into the legend as the landing grew: at 1.5 m of landing the
          // callout and the legend's distribution line printed over each other.
          // Under the landing is empty whatever the geometry.
          { at: [x0 - lw * 0.5, y0 - cov], to: [x0 - lw * 0.85, y0 + 26],
            text: landingBars ?? mainBars },
          // the upper landing — up-right, above its own slab
          { at: [x1 + lw * 0.55, y1 - tv + cov], to: [x1 + lw * 0.35, y1 - tv - 30],
            text: landingBars ?? mainBars },
        ]
        return notes.map((n, i) => {
          const dx = n.to[0] - n.at[0], dy = n.to[1] - n.at[1]
          const L = Math.hypot(dx, dy) || 1
          const head = 5
          // solid arrowhead on the bar, the way a CAD leader terminates
          const bx = n.at[0] + (dx / L) * head, by = n.at[1] + (dy / L) * head
          const px = (-dy / L) * 2, py = (dx / L) * 2
          // Shoulder and text run AWAY from the arrow. Anchored on a fixed
          // side, the text sat over the leader's own diagonal wherever the
          // leader happened to come from the same side — the landing callout
          // did exactly that once the flight grew a step longer.
          const anchor: 'start' | 'end' = dx <= 0 ? 'end' : 'start'
          const tx = anchor === 'end' ? n.to[0] - 3 : n.to[0] + 3
          return (
            <g key={i}>
              <polygon points={`${n.at[0]},${n.at[1]} ${bx + px},${by + py} ${bx - px},${by - py}`} fill={MAIN} />
              <polyline points={`${bx},${by} ${n.to[0]},${n.to[1]} ${tx + (anchor === 'end' ? -14 : 14)},${n.to[1]}`}
                fill="none" stroke={MAIN} strokeWidth={0.8} />
              {/* Clear of its own shoulder: at 3 the descender band of the
                  text sat on the line it is landed on. */}
              <text x={tx} y={n.to[1] - 4.5} fontSize={7.5} fill={MAIN} textAnchor={anchor}
                stroke="#fff" strokeWidth={2.4} paintOrder="stroke">{n.text}</text>
            </g>
          )
        })
      })()}

      {/* Supports: a bearing block at each held end — but ONLY when the flight
          is drawn alone. With the landings on, the landing IS what holds the
          flight, and a block drawn under the kink sits on top of the very
          anchorage dimensions that corner exists to show. */}
      {landing === 0 && ([['bottom', x0, y0], ['top', x1, y1]] as const).map(([which, bx, by]) => {
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
          // Measured up the slope from the bottom kink, NOT at the midpoint:
          // the θ arc is drawn at that kink, and a waist callout dropped from
          // mid-flight lands on top of it — "θ = 26.6°" and "t = 150 mm ⟂" were
          // printed over each other. Two thirds of the way up, the drop clears
          // the arc and still sits under the flight, where there is nothing.
          const f = 0.75
          const mx = x0 + (x1 - x0) * f, my = y0 + (y1 - y0) * f
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

      {/* riser and going, dimensioned ON one step rather than floated beside
          it — a going is a length, and a label with no line under it was only
          ever a caption. Drawn on the third step, above the tread and beside
          the riser it measures. */}
      {(() => {
        const k = 2                                   // the step dimensioned
        const bx = x0 + k * G * s, by = y0 - tv - k * R * s
        const gy = by - R * s - 4                     // just above that tread
        return (
          <g stroke={DIM} strokeWidth={0.75} fill="none" fontSize={7.5}>
            <line x1={bx} y1={gy} x2={bx + G * s} y2={gy} />
            {[bx, bx + G * s].map((qx, i) => (
              <line key={i} x1={qx - 2.5} y1={gy + 2.5} x2={qx + 2.5} y2={gy - 2.5} strokeWidth={1.1} />
            ))}
            <text x={bx + G * s / 2} y={gy - 3} fill={DIM} stroke="#fff" strokeWidth={2.4}
              paintOrder="stroke" textAnchor="middle">G = {G}</text>
            <line x1={bx - 5} y1={by} x2={bx - 5} y2={by - R * s} />
            {[by, by - R * s].map((qy, i) => (
              <line key={i} x1={bx - 7.5} y1={qy + 2.5} x2={bx - 2.5} y2={qy - 2.5} strokeWidth={1.1} />
            ))}
            <text x={bx - 8} y={by - R * s / 2 + 2.5} fill={DIM} stroke="#fff" strokeWidth={2.4}
              paintOrder="stroke" textAnchor="end">R = {R}</text>
          </g>
        )
      })()}

      {/* slope — with the horizontal leg it is measured FROM, so the arc has
          two sides to subtend instead of floating beside the soffit */}
      <g fill="none" stroke={FAINT} strokeWidth={0.9}>
        <line x1={x0} y1={y0} x2={x0 + 58} y2={y0} strokeDasharray="4 3" />
        <path d={`M${x0 + 46} ${y0} A 46 46 0 0 0 ${x0 + 46 * Math.cos(th)} ${y0 - 46 * Math.sin(th)}`} />
        {/* BELOW the horizontal leg. Above it, the label shared a band with the
            waist callout dropped from the soffit, and on a short flight — where
            the whole frame shrinks but the two labels do not — they printed
            over each other. */}
        <text x={x0 + 52} y={y0 + 11} fontSize={8.5} fill={FAINT} stroke="none">θ = {thetaDeg.toFixed(1)}°</text>
      </g>

      {/* The flight in PLAN — which is what a horizontal dimension line can
          measure, and the span `designStair` computes Mu on. Printed from what
          was DRAWN rather than from the input: rounding to whole steps moves
          the geometry, and this line used to carry the raw input against a
          drawing that had neither that plan run nor that slope length. */}
      <g>
        <line x1={x0} y1={HT - 30} x2={x1} y2={HT - 30} stroke={DIM} strokeWidth={0.9} />
        {[x0, x1].map((x, i) => (
          <line key={i} x1={x - 4} y1={HT - 26} x2={x + 4} y2={HT - 34} stroke={DIM} strokeWidth={1.2} />
        ))}
        <text x={(x0 + x1) / 2} y={HT - 34} fontSize={9} fill={DIM} textAnchor="middle"
          paintOrder="stroke" stroke="#fff" strokeWidth={2.6}>
          flight run = {g.drawn.run.toFixed(2)} m in plan · {nSteps} risers · slope {g.drawn.slope.toFixed(2)} m
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
        {/* The sizes live on the leaders now, one per zone, because the flight
            and the landings do not have to be reinforced alike. Repeating them
            here said they were. Only the DISTRIBUTION size stays, since those
            bars are drawn end-on and carry no leader of their own. */}
        {distBars && <text x={ML + 2} y={MT + 38} fill={DIST}>{distBars}</text>}
      </g>

      <text x={W / 2} y={HT - 8} fontSize={7.5} fill={FAINT} textAnchor="middle">
        Waist measured NORMAL to the soffit · treads are dead load, not structure ·
        anchorage past each kink measured ALONG the bar · drawn to scale
      </text>
    </svg>
  )
}
