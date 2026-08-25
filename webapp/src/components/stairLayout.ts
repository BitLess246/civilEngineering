// ─────────────────────────────────────────────────────────────────────────
// Frame and profile arithmetic for the stair-flight elevation.
//
// Pulled out of `StairElevation.tsx` — the same split `sectionLayout` got, and
// for the same reason: the complaint that started this ("the riser is diagonal,
// not a step vertical") is a statement about these numbers and nothing else,
// and rendering the component to check it would need a DOM the test setup does
// not have. The numbers do not.
//
// Units in: span m, t/R/G mm, θ degrees. Units out: SVG viewBox units.
// ─────────────────────────────────────────────────────────────────────────

export const MARGIN = { left: 70, right: 74, top: 18, bottom: 64 } as const
export const DRAW_W = 470

export type Pt = readonly [number, number]

export interface FlightGeometry {
  /** mm → viewBox units. */
  scale: number
  W: number
  HT: number
  /** Top margin, once the waist above the soffit's top end is allowed for. */
  MT: number
  /** Soffit, bottom end → top end. */
  x0: number; y0: number
  x1: number; y1: number
  /** Waist ⟂ to the soffit, and the VERTICAL height of that same waist. */
  tw: number
  tv: number
  /** Waist offset vector — normal to the soffit, pointing up out of the slab. */
  nx: number; ny: number
  nSteps: number
  /** Stepped top surface, bottom → top: riser (up R), tread (across G), … */
  profile: Pt[]
  /** The whole flight as ONE boundary: soffit, top end face, back down the
   *  steps, bottom end face. Both end faces are vertical. */
  flight: Pt[]
}

export function flightGeometry(
  span: number, t: number, R: number, G: number, thetaDeg: number,
): FlightGeometry {
  const th = (thetaDeg * Math.PI) / 180
  const nSteps = Math.max(1, Math.round((span * 1000 * Math.cos(th)) / Math.max(G, 1)))
  const run = nSteps * G, rise = nSteps * R
  const scale = DRAW_W / Math.max(run, 1)

  // ── Where the waist's top face sits ────────────────────────────────────
  // The soffit runs (cosθ, −sinθ) on screen. A normal to it is (−sinθ, −cosθ):
  // offsetting perpendicular from a slope that climbs to the RIGHT moves you up
  // and to the LEFT. The drawing used (sinθ, −cosθ) — up and to the RIGHT —
  // whose dot product with the soffit is 2 sinθ cosθ, not zero. So the one
  // thing this elevation exists to show, "t measured NORMAL to the soffit",
  // was measured along a direction that is not normal, and every face built off
  // it leaned by 2θ: the flight's end faces came out as diagonals exactly where
  // the first and last risers belong.
  //
  // Two parallel lines a perpendicular distance t apart are t/cosθ apart
  // VERTICALLY, so the top face is the soffit raised by that much — and the end
  // faces are then honestly vertical, which is how a flight is cut where it
  // meets a landing.
  const tw = t * scale
  const tv = tw / Math.max(Math.cos(th), 1e-6)
  const nx = -Math.sin(th) * tw, ny = -Math.cos(th) * tw

  const H = rise * scale
  const MT = MARGIN.top + tv
  const W = MARGIN.left + DRAW_W + MARGIN.right
  const HT = MT + H + MARGIN.bottom
  const x0 = MARGIN.left, y0 = MT + H
  const x1 = MARGIN.left + DRAW_W, y1 = MT

  // Each step is riser-then-tread: UP by R, then ACROSS by G. The point a riser
  // starts from is the step's INNER corner — where a tread meets the next riser
  // — and those corners sit on the waist's top face, which is what the waist
  // being the thinnest ⟂ section means.
  const profile: Pt[] = [[x0, y0 - tv]]
  for (let i = 0; i < nSteps; i++) {
    const bx = x0 + i * G * scale, by = y0 - tv - i * R * scale
    profile.push([bx, by - R * scale], [bx + G * scale, by - R * scale])
  }

  const flight: Pt[] = [
    [x0, y0], [x1, y1], [x1, y1 - tv],
    ...[...profile].slice(0, -1).reverse(),
  ]

  return { scale, W, HT, MT, x0, y0, x1, y1, tw, tv, nx, ny, nSteps, profile, flight }
}
