// ─────────────────────────────────────────────────────────────────────────
// THE RIGHT-TRIANGLE SOLVER — the trigonometry behind every slope, raker,
// stair stringer and force triangle on the board exam.
//
// The user states WHICH two of {a, b, c, A, B} they know (C = 90° always);
// this module decides which function each unknown needs — Pythagoras for the
// third side, a forward sine/cosine/tangent for a side found from an angle,
// the INVERSE (arcsin / arccos / arctan) for an angle found from two sides —
// and returns all five values.
//
// Notation is the textbook's: right angle at C; side a opposite A, side b
// opposite B, side c the hypotenuse; A + B = 90°. Sides are unitless here —
// the page decides whether they are metres, kN or feet, because a force
// triangle solves by exactly the same relations.
// ─────────────────────────────────────────────────────────────────────────

/** Which two quantities the user supplied. */
export type RightTriangleKnown =
  | 'a-b'  // two legs
  | 'a-c'  // leg a and the hypotenuse
  | 'b-c'  // leg b and the hypotenuse
  | 'a-A'  // leg a and its opposite angle
  | 'a-B'  // leg a and the adjacent angle
  | 'b-A'  // leg b and the adjacent angle
  | 'b-B'  // leg b and its opposite angle
  | 'c-A'  // hypotenuse and angle A
  | 'c-B'  // hypotenuse and angle B

export interface RightTriangleInput {
  known: RightTriangleKnown
  a?: number
  b?: number
  c?: number
  /** Angle A in degrees, (0, 90). */
  A?: number
  /** Angle B in degrees, (0, 90). */
  B?: number
}

export interface RightTriangle {
  a: number
  b: number
  c: number
  /** Degrees, in (0, 90). */
  A: number
  B: number
}

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI

function given(v: number | undefined, label: string): number {
  if (v === undefined || !Number.isFinite(v)) throw new Error(`${label} is not a number — the solver needs exactly two knowns.`)
  return v
}

function side(v: number | undefined, label: string): number {
  const s = given(v, label)
  if (s <= 0) throw new Error(`${label} must be positive.`)
  return s
}

function angle(v: number | undefined, label: string): number {
  const t = given(v, label)
  if (t <= 0 || t >= 90) throw new Error(`${label} must lie strictly between 0° and 90° — C is the right angle.`)
  return t
}

/**
 * Solve the triangle from the stated knowns, or throw with the reason.
 *
 * Each branch computes what it can directly and lets the identities finish
 * the rest: Pythagoras closes the sides, A + B = 90° closes the angles.
 */
export function solveRightTriangle(input: RightTriangleInput): RightTriangle {
  const { known } = input
  switch (known) {
    case 'a-b': {
      const a = side(input.a, 'a'), b = side(input.b, 'b')
      const c = Math.hypot(a, b)
      const A = deg(Math.atan2(a, b))
      return { a, b, c, A, B: 90 - A }
    }
    case 'a-c': {
      const a = side(input.a, 'a'), c = side(input.c, 'c')
      if (a >= c) throw new Error('a leg must be shorter than the hypotenuse (a < c).')
      const b = Math.sqrt(c * c - a * a)
      const A = deg(Math.asin(a / c))
      return { a, b, c, A, B: 90 - A }
    }
    case 'b-c': {
      const b = side(input.b, 'b'), c = side(input.c, 'c')
      if (b >= c) throw new Error('a leg must be shorter than the hypotenuse (b < c).')
      const a = Math.sqrt(c * c - b * b)
      const B = deg(Math.asin(b / c))
      return { a, b, c, A: 90 - B, B }
    }
    case 'a-A': {
      const a = side(input.a, 'a'), A = angle(input.A, 'A')
      const b = a / Math.tan(rad(A))
      const c = a / Math.sin(rad(A))
      return { a, b, c, A, B: 90 - A }
    }
    case 'a-B': {
      const a = side(input.a, 'a'), B = angle(input.B, 'B')
      const b = a * Math.tan(rad(B))
      const c = a / Math.cos(rad(B))
      return { a, b, c, A: 90 - B, B }
    }
    case 'b-A': {
      const b = side(input.b, 'b'), A = angle(input.A, 'A')
      const a = b * Math.tan(rad(A))
      const c = b / Math.cos(rad(A))
      return { a, b, c, A, B: 90 - A }
    }
    case 'b-B': {
      const b = side(input.b, 'b'), B = angle(input.B, 'B')
      const a = b / Math.tan(rad(B))
      const c = b / Math.sin(rad(B))
      return { a, b, c, A: 90 - B, B }
    }
    case 'c-A': {
      const c = side(input.c, 'c'), A = angle(input.A, 'A')
      const a = c * Math.sin(rad(A))
      const b = c * Math.cos(rad(A))
      return { a, b, c, A, B: 90 - A }
    }
    case 'c-B': {
      const c = side(input.c, 'c'), B = angle(input.B, 'B')
      const a = c * Math.sin(rad(90 - B))
      const b = c * Math.cos(rad(90 - B))
      return { a, b, c, A: 90 - B, B }
    }
  }
}

/**
 * The two angles from two sides, for the page's worked steps: it wants to say
 * WHICH inverse function was used and why, without repeating the solver.
 */
export const inverseUsed = (known: RightTriangleKnown): { target: 'A' | 'B'; fn: 'arcsin' | 'arccos' | 'arctan'; from: string } => {
  switch (known) {
    case 'a-b': return { target: 'A', fn: 'arctan', from: 'a/b' }
    case 'a-c': return { target: 'A', fn: 'arcsin', from: 'a/c' }
    case 'b-c': return { target: 'B', fn: 'arcsin', from: 'b/c' }
    case 'a-A': case 'a-B': case 'b-A': case 'b-B': case 'c-A': case 'c-B':
      // The angle was given; no inverse is needed anywhere in the solve.
      return { target: 'A', fn: 'arctan', from: '' }
  }
}
