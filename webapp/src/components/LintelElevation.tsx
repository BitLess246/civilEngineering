// ─────────────────────────────────────────────────────────────────────────
// Elevation of a lintel over an opening — and the load it is designed for.
//
// The one thing worth drawing here is the ARCHING TRIANGLE. A lintel's steel
// follows from an assumption about how much wall reaches it, and that
// assumption is invisible in a table of numbers: the same opening under a tall
// wall and under a short one are different beams. So the triangle is drawn,
// with the wall that stands over it, and when the wall is too short for the
// arch to close the drawing says so by shading the whole rectangle instead.
//
// Geometry only. `engine/lintel` decides.
// ─────────────────────────────────────────────────────────────────────────

import { DrawingFrame } from './DrawingFrame'

// Theme-aware: the sheet colour drives every halo and knock-out, so the
// drawing reads on the dark theme as well as the light one.
const INK = 'var(--ink, #37526e)'
const WALL = 'rgba(115,109,94,0.12)'
const LOAD = 'rgba(194,64,42,0.95)'
const DIM = 'rgba(31,119,180,0.95)'
const FAINT = 'var(--muted, #8a8473)'
const SHEET = 'var(--sheet, #fff)'

export interface LintelElevationProps {
  /** Clear opening and the effective span, m. */
  opening: number
  span: number
  /** Bearing each end, mm; lintel section, mm. */
  bearing: number
  b: number
  h: number
  /** Wall over the lintel, m, and its thickness (for the label only). */
  wallHeightAbove: number
  /** Height of the arching triangle, m — 0 when no arch forms. */
  triangleHeight: number
  arching: boolean
  /** Masonry the lintel carries, kN, and the bar callout. */
  masonry: number
  bars?: string
}

export function LintelElevation({
  opening, span, bearing, b, h, wallHeightAbove, triangleHeight, arching, masonry, bars,
}: LintelElevationProps) {
  const jamb = 0.45                                   // drawn width of each jamb, m
  const bear = bearing / 1000
  const hL = h / 1000
  const stub = 0.5                                    // jamb shown below the lintel, m
  // Only draw as much wall as the drawing is ABOUT. A 300 lintel under 4 m of
  // wall, drawn to one scale, is a sliver: the triangle it carries is the
  // subject, so the wall is cut a little above the apex and the cut is shown.
  // Where no arch forms the whole wall IS the subject, and all of it is drawn.
  const wallTop = arching ? Math.min(wallHeightAbove, triangleHeight * 1.18) : wallHeightAbove
  const cut = wallTop < wallHeightAbove - 1e-9
  const worldW = opening + 2 * jamb
  const worldH = hL + wallTop + stub
  const M = { l: 54, r: 54, t: 26, b: 80 }
  const S = Math.min(560 / worldW, 320 / worldH)
  const W = M.l + worldW * S + M.r
  const HT = M.t + worldH * S + M.b
  // World → page. x = 0 at the left jamb's outer face, y = 0 at the lintel soffit.
  const X = (x: number) => M.l + x * S
  const Y = (y: number) => M.t + (worldH - stub - y) * S

  const oL = jamb, oR = jamb + opening                 // opening edges
  const apex = (oL + oR) / 2

  return (
    <DrawingFrame label="lintel elevation">
      <svg viewBox={`0 0 ${W} ${HT}`} className="mx-auto block h-auto w-full"
        style={{ fontFamily: 'Arial, sans-serif' }}>
        {/* the wall over the lintel */}
        <rect x={X(0)} y={Y(hL + wallTop)} width={worldW * S} height={wallTop * S}
          fill={WALL} stroke={INK} strokeWidth={1.2} />
        {cut && (
          // The wall carries on above: a break line rather than a solid top edge
          // that would read as the top of the wall.
          <g>
            <rect x={X(0) - 1} y={Y(hL + wallTop) - 5} width={worldW * S + 2} height={10} fill={SHEET} />
            <path d={`M${X(0)} ${Y(hL + wallTop)} ${Array.from({ length: 9 }, (_, k) =>
              `L${X(0) + ((k + 1) * worldW * S) / 9} ${Y(hL + wallTop) + (k % 2 ? 4 : -4)}`).join(' ')}`}
              fill="none" stroke={INK} strokeWidth={1.2} />
            <text x={X(worldW) - 2} y={Y(hL + wallTop) - 8} fontSize={7.5} fill={FAINT} textAnchor="end">
              wall continues to {wallHeightAbove.toFixed(2)} m
            </text>
          </g>
        )}
        {/* the jambs below it */}
        {[[0, jamb], [jamb + opening, jamb]].map(([x0, w], i) => (
          <rect key={i} x={X(x0)} y={Y(0)} width={w * S} height={stub * S}
            fill={WALL} stroke={INK} strokeWidth={1.2} />
        ))}

        {/* what the lintel carries — the whole point of the drawing */}
        {arching ? (
          <>
            <polygon points={`${X(oL)},${Y(hL)} ${X(oR)},${Y(hL)} ${X(apex)},${Y(hL + triangleHeight)}`}
              fill={LOAD} opacity={0.17} stroke={LOAD} strokeWidth={1.1} strokeDasharray="5 3" />
            {/* Clear of the apex, not straddling it: at 6 the label sat on the
                two lines it is describing. */}
            <text x={X(apex)} y={Y(hL + triangleHeight) - 13} fontSize={8} fill={LOAD} textAnchor="middle"
              paintOrder="stroke" stroke={SHEET} strokeWidth={2.6}>
              arch closes {triangleHeight.toFixed(2)} m up
            </text>
          </>
        ) : (
          <>
            <rect x={X(oL)} y={Y(hL + wallHeightAbove)} width={opening * S} height={wallHeightAbove * S}
              fill={LOAD} opacity={0.17} stroke={LOAD} strokeWidth={1.1} strokeDasharray="5 3" />
            <text x={X(apex)} y={Y(hL + wallHeightAbove) - 6} fontSize={8} fill={LOAD} textAnchor="middle"
              paintOrder="stroke" stroke={SHEET} strokeWidth={2.6}>
              no room for the arch — the whole rectangle bears
            </text>
          </>
        )}

        {/* the lintel itself, sitting on its bearings */}
        <rect x={X(oL - bear)} y={Y(hL)} width={(opening + 2 * bear) * S} height={hL * S}
          fill="rgba(15,76,146,0.12)" stroke={INK} strokeWidth={1.6} />
        {bars && (
          <text x={X(apex)} y={Y(hL / 2) + 3} fontSize={7.5} fill={LOAD} textAnchor="middle"
            paintOrder="stroke" stroke={SHEET} strokeWidth={2.4}>{bars}</text>
        )}

        {/* Dimensions BELOW the jamb stubs, each between extension lines from
            the features it measures: the clear opening between the jamb faces,
            the effective span between the support points marked on the soffit
            (centred on the opening — §6.3.2.1 extends it by the same amount at
            each end). The span used to be drawn between the lintel ENDS, which
            are ℓn + 2·bearing apart, under a label that said ℓn + h. */}
        {(() => {
          const yClear = Y(0) + stub * S + 20, ySpan = Y(0) + stub * S + 40
          const sL = apex - span / 2, sR = apex + span / 2
          const dim = (x0: number, x1: number, y: number, label: string) => (
            <g>
              <line x1={X(x0)} y1={y} x2={X(x1)} y2={y} />
              {[x0, x1].map((x, k) => (
                <line key={k} x1={X(x) - 3} y1={y + 3} x2={X(x) + 3} y2={y - 3} strokeWidth={1.2} />
              ))}
              <text x={X((x0 + x1) / 2)} y={y - 3.5} fill={DIM} stroke={SHEET} strokeWidth={2.4} paintOrder="stroke" textAnchor="middle">{label}</text>
            </g>
          )
          return (
            <g stroke={DIM} strokeWidth={0.85} fill="none" fontSize={8}>
              {[oL, oR].map((x) => <line key={`c${x}`} x1={X(x)} y1={Y(0) + stub * S + 2} x2={X(x)} y2={yClear + 4} strokeWidth={0.6} />)}
              {[sL, sR].map((x) => (
                <g key={`s${x}`}>
                  <line x1={X(x)} y1={Y(0) - 4} x2={X(x)} y2={Y(0) + 4} strokeWidth={1.2} />
                  <line x1={X(x)} y1={Y(0) + 6} x2={X(x)} y2={ySpan + 4} strokeWidth={0.6} strokeDasharray="3 2" />
                </g>
              ))}
              {dim(oL, oR, yClear, `clear ${opening.toFixed(2)} m`)}
              {dim(sL, sR, ySpan, `effective span ${span.toFixed(2)} m`)}
            </g>
          )
        })()}

        {/* The bearing, marked ON the overlap it is: the length of lintel sitting
            on the jamb, which is the area the bearing stress is checked over.
            Labelled above the wall's own base line rather than inside the wall,
            where it printed over the masonry it is not part of. */}
        <g>
          <line x1={X(oL - bear)} y1={Y(0) + 6} x2={X(oL)} y2={Y(0) + 6}
            stroke={FAINT} strokeWidth={1.2} />
          {[oL - bear, oL].map((x, k) => (
            <line key={k} x1={X(x)} y1={Y(0) + 3} x2={X(x)} y2={Y(0) + 9} stroke={FAINT} strokeWidth={1.2} />
          ))}
          <text x={X(oL - bear / 2)} y={Y(0) + 17} fontSize={7.5} fill={FAINT} textAnchor="middle"
            paintOrder="stroke" stroke={SHEET} strokeWidth={2.4}>{bearing} bearing</text>
        </g>

        <text x={W / 2} y={HT - 8} fontSize={7.5} fill={FAINT} textAnchor="middle">
          {arching
            ? `${b}×${h} lintel · the shaded triangle is the ${masonry.toFixed(1)} kN of wall that reaches it; the rest arches to the jambs`
            : `${b}×${h} lintel · the shaded rectangle is the ${masonry.toFixed(1)} kN of wall that reaches it — the arch cannot form`}
        </text>
      </svg>
    </DrawingFrame>
  )
}
