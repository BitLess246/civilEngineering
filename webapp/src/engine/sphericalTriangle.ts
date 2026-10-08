// ─────────────────────────────────────────────────────────────────────────
// THE SPHERICAL TRIANGLE — the trigonometry of a triangle drawn on a sphere,
// which is what a surveyor solves between stations on the Earth and what an
// astronomy/spherical-geometry problem states outright.
//
// Sides are GREAT-CIRCLE ARCS stated in DEGREES (the arc's central angle);
// angles A, B, C are the dihedral angles between the tangent planes at the
// vertices, also in degrees. The two Napier equivalents:
//
//   sides form:   cos a = cos b·cos c + sin b·sin c·cos A
//   angles form:  cos A = −cos B·cos C + sin B·sin C·cos a
//
// Solved for the angle: cos A = (cos a − cos b·cos c) / (sin b·sin c).
// Unlike the plane triangle, the angles do NOT sum to 180° — the surplus is
// the SPHERICAL EXCESS E = A + B + C − 180°, and Girard's theorem gives the
// area as R²·E (E in radians), which is why the excess is worth reporting on
// its own.
//
// Existence conditions for sides a, b, c < 180°: each side is less than the
// sum of the other two, and the three sum to less than 360°. An octant (three
// mutually perpendicular 90° sides) is the classic edge case that satisfies
// all of them.
// ─────────────────────────────────────────────────────────────────────────

export interface SphericalTriangle {
  a: number; b: number; c: number      // sides, degrees
  A: number; B: number; C: number      // angles, degrees
  /** Spherical excess E = A + B + C − 180°, degrees. Always > 0 for a real triangle. */
  E: number
}

export interface SphericalWithRadius extends SphericalTriangle {
  /** Great-circle arc lengths, in the radius's own unit. */
  arcA: number; arcB: number; arcC: number
  /** Girard: area = R²·E, with E in radians. In the radius's unit squared. */
  area: number
}

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

/** Guard the arccos: floating point can push a valid cosine just past ±1. */
function acosDeg(cos: number, what: string): number {
  if (cos > 1 || cos < -1) {
    if (Math.abs(cos) - 1 > 1e-9) throw new Error(`${what} has no solution: cos = ${cos.toFixed(6)} is outside [−1, 1].`)
    return acosDeg(Math.sign(cos), what)
  }
  return deg(Math.acos(cos))
}

function checkSide(v: number, label: string): number {
  if (!Number.isFinite(v) || v <= 0 || v >= 180)
    throw new Error(`side ${label} must lie strictly between 0° and 180°.`)
  return v
}

function checkAngle(v: number, label: string): number {
  if (!Number.isFinite(v) || v <= 0 || v >= 180)
    throw new Error(`angle ${label} must lie strictly between 0° and 180°.`)
  return v
}

/** The three angles of a triangle whose three SIDES are known (SSS). */
export function sphericalFromSides(s: { a: number; b: number; c: number }): SphericalTriangle {
  const { a, b, c } = { a: checkSide(s.a, 'a'), b: checkSide(s.b, 'b'), c: checkSide(s.c, 'c') }
  // Existence: triangle inequalities on the sphere, plus the perimeter bound.
  if (a + b <= c || b + c <= a || a + c <= b)
    throw new Error('no spherical triangle: each side must be less than the sum of the other two.')
  if (a + b + c >= 360)
    throw new Error('no spherical triangle: the three sides must sum to less than 360°.')
  const A = acosDeg((Math.cos(rad(a)) - Math.cos(rad(b)) * Math.cos(rad(c))) / (Math.sin(rad(b)) * Math.sin(rad(c))), 'angle A')
  const B = acosDeg((Math.cos(rad(b)) - Math.cos(rad(a)) * Math.cos(rad(c))) / (Math.sin(rad(a)) * Math.sin(rad(c))), 'angle B')
  const C = acosDeg((Math.cos(rad(c)) - Math.cos(rad(a)) * Math.cos(rad(b))) / (Math.sin(rad(a)) * Math.sin(rad(b))), 'angle C')
  return { a, b, c, A, B, C, E: A + B + C - 180 }
}

/** Two sides and the INCLUDED angle (SAS): side a, angle C between a and b, side b. */
export function sphericalFromSas(s: { a: number; b: number; C: number }): SphericalTriangle {
  const a = checkSide(s.a, 'a'), b = checkSide(s.b, 'b'), C = checkAngle(s.C, 'C')
  // The included angle hands over the third side directly from the sides form.
  const cosC = Math.cos(rad(a)) * Math.cos(rad(b)) + Math.sin(rad(a)) * Math.sin(rad(b)) * Math.cos(rad(C))
  const c = acosDeg(cosC, 'side c')
  // The remaining angles come from the same rearrangement SSS uses — no
  // sine-rule ambiguity, since the cosine rule pins each angle uniquely.
  const A = acosDeg((Math.cos(rad(a)) - Math.cos(rad(b)) * Math.cos(rad(c))) / (Math.sin(rad(b)) * Math.sin(rad(c))), 'angle A')
  const B = acosDeg((Math.cos(rad(b)) - Math.cos(rad(a)) * Math.cos(rad(c))) / (Math.sin(rad(a)) * Math.sin(rad(c))), 'angle B')
  return { a, b, c, A, B, C, E: A + B + C - 180 }
}

/** Arc lengths and Girard area once a sphere radius is supplied. */
export function withRadius(t: SphericalTriangle, radius: number): SphericalWithRadius {
  if (!Number.isFinite(radius) || radius <= 0) throw new Error('the sphere radius must be a positive number.')
  return {
    ...t,
    arcA: rad(t.a) * radius,
    arcB: rad(t.b) * radius,
    arcC: rad(t.c) * radius,
    area: rad(t.E) * radius * radius,
  }
}
