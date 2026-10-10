// ─────────────────────────────────────────────────────────────────────────
// THE DESIGN STRIP A FOOTING'S DIAGRAMS ARE DRAWN FROM.
//
// The isolated-footing engines design one thing and quote it in three places:
// the cantilever moment at the column face (Mu = qu·b·a²/2), the one-way
// shear at d beyond the face (Vu = qu·b·(a − d)) and the mat that steel
// carries them. Until now the pages showed none of that as a picture — the
// sheet said "a = 0.80 m, Mu = 138 kN·m" and drew a plan.
//
// This module samples the strip the design acted on, and its numbers close
// EXACTLY on the sheet's: with the column reaction spread over its footprint
// (the same idealisation the combined-footing engine draws columns with),
//   · V at the face            = qu·b·a          (the cantilever's full push),
//   · V at the §22.5 section   = qu·b·(a − d)    — oneWayShearDepth's Vu,
//   · M at the face            = qu·b·a²/2       — the flexure step's Mu,
// because outside the column footprint the column reaction contributes
// nothing and the integrals collapse to those closed forms.
//
// The load model is deliberately the design's own: a UNIFORM factored net
// pressure qu over the strip (for the eccentric load, the peak qu,max the
// engine designs on). The service trapezoid is a bearing-check picture and
// lives on the section drawing; a diagram built on a different pressure than
// the quoted Mu would disagree with the sheet beside it.
//
// Units: plan dims & station x in m, qu in kPa, Pu in kN, column width c in
// m along the strip, d in mm. w in kN/m, V in kN, M in kN·m — all over the
// FULL strip width b, the same basis the flexure step designs and the sheet
// prints.
// ─────────────────────────────────────────────────────────────────────────

export interface StripInput {
  /** Pad length along the strip, m. */
  L: number
  /** Design strip width (the pad dimension across), m. */
  stripW: number
  /** Factored net pressure the design used, kPa (qu; the eccentric design's peak). */
  qu: number
  /** Factored column load, kN. */
  Pu: number
  /** Column dimension along the strip, m. */
  c: number
  /** Provided effective depth for shear, mm — places the §22.5 sections. */
  d: number
  /** Sample count across the strip (default 121). */
  n?: number
}

export interface StripSamples {
  x: number[]
  /** Factored net pressure on the strip, kN/m — constant, the design's model. */
  w: number[]
  /** Shear from the pad edge, kN over the full strip width. */
  V: number[]
  /** Moment, kN·m over the full strip width. */
  M: number[]
  /** Column-face stations, m. */
  faces: [number, number]
  /** §22.5 one-way shear sections at d beyond each face, m — null when d ≥ a. */
  crits: [number, number] | null
  /** Cantilever arm (L − c)/2, m. */
  arm: number
}

/** A column carried as a uniform line load over its footprint — the combined
 *  engine's convention, so both pages draw columns the same way. */
function colV(x: number, xc: number, cw: number, P: number): number {
  const xL = xc - cw / 2, xR = xc + cw / 2
  if (x <= xL) return 0
  if (x >= xR) return P
  return (P * (x - xL)) / cw
}

function colM(x: number, xc: number, cw: number, P: number): number {
  const xL = xc - cw / 2, xR = xc + cw / 2
  if (x <= xL) return 0
  if (x >= xR) return P * (x - xc)
  return (P * (x - xL) * (x - xL)) / (2 * cw)
}

/** The exact model at one station — { V, M } in kN / kN·m over the strip. */
export function stripAt(i: Pick<StripInput, 'L' | 'stripW' | 'qu' | 'Pu' | 'c'>, x: number): { V: number; M: number } {
  const w = i.qu * i.stripW
  return { V: w * x - colV(x, i.L / 2, i.c, i.Pu), M: (w * x * x) / 2 - colM(x, i.L / 2, i.c, i.Pu) }
}

/** Sample the design strip: w, V, M with the marks the sheet quotes. */
export function stripSamples(i: StripInput): StripSamples {
  const { L, stripW, qu, c, d } = i
  const n = Math.max(21, i.n ?? 121)
  const w = qu * stripW                          // kN/m, uniform
  const xc = L / 2
  const arm = (L - c) / 2
  const dM = d / 1000
  const x: number[] = [], V: number[] = [], M: number[] = []
  for (let k = 0; k < n; k++) {
    const xi = (L * k) / (n - 1)
    const at = stripAt(i, xi)
    x.push(xi)
    V.push(at.V)
    M.push(at.M)
  }
  const aCrit = arm - dM
  const crits = aCrit > 0 ? [aCrit, L - aCrit] as [number, number] : null
  return { x, w: x.map(() => w), V, M, faces: [xc - c / 2, xc + c / 2], crits, arm }
}
