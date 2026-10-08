// ─────────────────────────────────────────────────────────────────────────
// THE TRIANGLE SOLVER — the trigonometry behind every slope, skew span,
// traverse leg and force triangle on the board exam. ANY triangle: the
// right angle is a special case, never an assumption.
//
// The user states WHICH three of {a, b, c, A, B, C} they know (blank =
// unknown, at least one side); this module picks the relation each unknown
// needs — the Law of Cosines when three sides, or two sides with their
// included angle, are known; the Law of Sines when an angle travels with
// its opposite side; the angle sum to close — and writes every step.
//
// When the knowns are two sides and a NON-included angle, the sine law may
// fit TWO triangles (the ambiguous case): both are returned, each with its
// own worked steps. No solution — a side too short to reach, angles that
// cannot close — throws with the geometric reason.
//
// Notation is the textbook's: side a opposite angle A, b opposite B, c
// opposite C; A + B + C = 180°. Sides are unitless here — the page decides
// whether they are metres, kN or degrees of arc.
// ─────────────────────────────────────────────────────────────────────────
import type { SolutionStep } from '../lib/solution'

export type TriangleField = 'a' | 'b' | 'c' | 'A' | 'B' | 'C'
export type TriangleInput = Partial<Record<TriangleField, number>>

const FIELDS: TriangleField[] = ['a', 'b', 'c', 'A', 'B', 'C']
const isSide = (f: TriangleField) => f === 'a' || f === 'b' || f === 'c'
/** side x is opposite angle X — the same letter, other case. */
const OPP: Record<TriangleField, TriangleField> = { a: 'A', b: 'B', c: 'C', A: 'a', B: 'b', C: 'c' }

export type TriangleCase = 'SSS' | 'SAS' | 'ASA/AAS' | 'SSA'

export interface Triangle {
  a: number; b: number; c: number
  /** Degrees, in (0, 180). */
  A: number; B: number; C: number
}

export interface TriangleSolution extends Triangle {
  /** Where each of the six values came from — for the results table. */
  basis: Record<TriangleField, string>
  /** The worked steps for THIS solution, numbers baked in. */
  steps: SolutionStep[]
}

export interface SolvedTriangle {
  caseName: TriangleCase
  /** True when the SSA ambiguity produced two valid triangles. */
  ambiguous: boolean
  solutions: TriangleSolution[]
}

const rad = (d: number) => (d * Math.PI) / 180
const deg = (r: number) => (r * 180) / Math.PI
const clamp1 = (x: number) => Math.min(1, Math.max(-1, x))
const n2 = (v: number) => v.toFixed(2)
const n3 = (v: number) => v.toFixed(3)
/** An angle inside a KaTeX expression: 63.43^{\circ} */
const d2 = (v: number) => `${n2(v)}^{\\circ}`

const givenBasis = (known: TriangleField[]): Record<TriangleField, string> => {
  const b = { a: '', b: '', c: '', A: '', B: '', C: '' } as Record<TriangleField, string>
  for (const f of known) b[f] = 'given'
  return b
}

/** The cos-law statement for angle X with all six values at hand, both
 *  symbolic and numeric, ending in the arccos — one-to-one, so never the
 *  wrong supplement. Returns the angle in degrees too. */
function cosLawAngle(X: TriangleField, val: Record<TriangleField, number>, titleNote?: string): { degVal: number; step: SolutionStep } {
  const opp = OPP[X]
  const [u, w] = FIELDS.filter((f) => isSide(f) && f !== opp)
  const cosv = (val[u] * val[u] + val[w] * val[w] - val[opp] * val[opp]) / (2 * val[u] * val[w])
  const Xdeg = deg(Math.acos(clamp1(cosv)))
  const step: SolutionStep = {
    title: titleNote ?? `Angle ${X} from the Law of Cosines`,
    lines: [
      { tex: `\\cos ${X} = \\frac{${u}^{2} + ${w}^{2} - ${opp}^{2}}{2\\,${u}\\,${w}} = ${n3(cosv)} \\quad\\Rightarrow\\quad ${X} = \\arccos\\left(${n3(cosv)}\\right) = ${d2(Xdeg)}` },
      { text: titleNote
        ? 'The longest side faces the largest angle — the only one that could be obtuse — so it is read first, with the one-to-one arccos: no risk of the wrong supplement.'
        : 'The cosine law again for the second angle — arccos is one-to-one over its domain, where the sine law would have to choose between an angle and its supplement.' },
    ],
  }
  return { degVal: Xdeg, step }
}

/** The angle-sum closing step, shared by every case. */
function sumStep(T: TriangleField, from: TriangleField[], fromVal: number[]): SolutionStep {
  return {
    title: `Angle ${T} closes the sum`,
    lines: [
      { tex: `${T} = 180^{\\circ} - ${from.join(' - ')} = 180^{\\circ} - ${fromVal.map(d2).join(' - ')} = ${d2(180 - fromVal.reduce((s, v) => s + v, 0))}` },
      { text: 'A + B + C = 180° in every plane triangle — the third angle needs no trigonometry at all.' },
    ],
  }
}

/** Side X from the Law of Sines, anchored at the side/angle pair (s0, O0). */
function sineLawSideStep(X: TriangleField, val: Record<TriangleField, number>, s0: TriangleField, title?: string): SolutionStep {
  const O = OPP[X], O0 = OPP[s0]
  const x = val[s0] * Math.sin(rad(val[O])) / Math.sin(rad(val[O0]))
  return {
    title: title ?? `Side ${X} from the Law of Sines`,
    lines: [
      { tex: `\\frac{${X}}{\\sin ${O}} = \\frac{${s0}}{\\sin ${O0}} \\quad\\Rightarrow\\quad ${X} = ${s0}\\,\\frac{\\sin ${O}}{\\sin ${O0}} = ${n3(val[s0])}\\cdot\\frac{\\sin ${d2(val[O])}}{\\sin ${d2(val[O0])}} = ${n3(x)}` },
      { text: 'Every side travels with its opposite angle — the shared ratio of the Law of Sines fixes the missing side.' },
    ],
  }
}

// ── SSS: three sides ────────────────────────────────────────────────────────

function solveSSS(known: TriangleField[], val: Record<TriangleField, number>): SolvedTriangle {
  const { a, b, c } = val
  if (a + b <= c || a + c <= b || b + c <= a)
    throw new Error('the sides cannot close: each pair must out-span the third (a + b > c, and the two symmetries).')
  const basis = givenBasis(known)
  const steps: SolutionStep[] = [{ title: 'The sides must close', lines: [
    { text: 'Each pair of sides must out-span the third — a + b > c, a + c > b, b + c > a — which the solver checked before any angle was computed.' },
  ] }]
  // Largest side first: its angle is the only one that could be obtuse.
  const ordered = (['a', 'b', 'c'] as const).map((f) => [f, val[f]] as const).sort((x, y) => y[1] - x[1])
  const A1 = cosLawAngle(OPP[ordered[0][0]], { ...val }, `Angle ${OPP[ordered[0][0]]} — opposite the longest side — from the Law of Cosines`)
  val = { ...val, [OPP[ordered[0][0]]]: A1.degVal }
  const A2 = cosLawAngle(OPP[ordered[1][0]], val)
  val = { ...val, [OPP[ordered[1][0]]]: A2.degVal }
  const T = OPP[ordered[2][0]]
  val = { ...val, [T]: 180 - A1.degVal - A2.degVal }
  steps.push(A1.step, A2.step, sumStep(T, [OPP[ordered[0][0]], OPP[ordered[1][0]]], [A1.degVal, A2.degVal]))
  basis[OPP[ordered[0][0]]] = 'law of cosines'
  basis[OPP[ordered[1][0]]] = 'law of cosines'
  basis[T] = 'angle sum'
  return { caseName: 'SSS', ambiguous: false, solutions: [{ ...{ a: val.a, b: val.b, c: val.c, A: val.A, B: val.B, C: val.C }, basis, steps }] }
}

// ── SAS: two sides with their included angle ───────────────────────────────

function solveSAS(known: TriangleField[], val: Record<TriangleField, number>, P: TriangleField): SolvedTriangle {
  const [S1, S2] = known.filter(isSide)
  const R = OPP[P] // the missing side, opposite the included angle
  const p1 = val[S1], p2 = val[S2], Pv = val[P]
  const r = Math.sqrt(Math.max(p1 * p1 + p2 * p2 - 2 * p1 * p2 * Math.cos(rad(Pv)), 0))
  const basis = givenBasis(known)
  basis[R] = 'law of cosines'
  const lines: SolutionStep['lines'] = [
    { tex: `${R} = \\sqrt{${S1}^{2} + ${S2}^{2} - 2\\,${S1}\\,${S2}\\cos ${P}} = \\sqrt{${n3(p1)}^{2} + ${n3(p2)}^{2} - 2\\cdot ${n3(p1)}\\cdot ${n3(p2)}\\cos ${d2(Pv)}} = ${n3(r)}` },
    { text: `The known angle ${P} sits between the two known sides, so the Law of Cosines closes the third side directly.` },
  ]
  if (Math.abs(Pv - 90) < 0.01) lines.push({ text: 'The included angle is 90°: cos 90° = 0 and the law collapses to Pythagoras — the right-triangle shortcut is this special case.' })
  const steps: SolutionStep[] = [{ title: 'Close the third side with the Law of Cosines', lines }]
  const full: Record<TriangleField, number> = { ...val, [R]: r }
  // Second angle: opposite the LONGER known side, by the cosine law (one-to-one).
  const U = p1 >= p2 ? OPP[S1] : OPP[S2]
  const Ures = cosLawAngle(U, full)
  full[U] = Ures.degVal
  // The remaining angle = the angle field not yet set:
  const Vfield = (['A', 'B', 'C'] as const).find((f) => f !== P && f !== U) as TriangleField
  full[Vfield] = 180 - Pv - Ures.degVal
  basis[U] = 'law of cosines'
  basis[Vfield] = 'angle sum'
  steps.push(Ures.step, sumStep(Vfield, [P, U], [Pv, Ures.degVal]))
  return { caseName: 'SAS', ambiguous: false, solutions: [{ ...{ a: full.a, b: full.b, c: full.c, A: full.A, B: full.B, C: full.C }, basis, steps }] }
}

// ── ASA / AAS: one side with two angles ────────────────────────────────────

function solveAngleSum(known: TriangleField[], val: Record<TriangleField, number>): SolvedTriangle {
  const [f1, f2] = known.filter((f) => !isSide(f))
  const T = (['A', 'B', 'C'] as const).find((f) => f !== f1 && f !== f2) as TriangleField
  const Tv = 180 - val[f1] - val[f2]
  const basis = givenBasis(known)
  basis[T] = 'angle sum'
  const steps: SolutionStep[] = [sumStep(T, [f1, f2], [val[f1], val[f2]])]
  const full: Record<TriangleField, number> = { ...val, [T]: Tv }
  const s0 = known.find(isSide) as TriangleField
  for (const X of (['a', 'b', 'c'] as const).filter((f) => f !== s0)) {
    const step = sineLawSideStep(X, full, s0)
    steps.push(step)
    full[X] = full[s0] * Math.sin(rad(full[OPP[X]])) / Math.sin(rad(full[OPP[s0]]))
    basis[X] = 'law of sines'
  }
  return { caseName: 'ASA/AAS', ambiguous: false, solutions: [{ ...{ a: full.a, b: full.b, c: full.c, A: full.A, B: full.B, C: full.C }, basis, steps }] }
}

// ── SSA: two sides with a NON-included angle — the ambiguous case ──────────

function solveSSA(known: TriangleField[], val: Record<TriangleField, number>, P: TriangleField): SolvedTriangle {
  const x = OPP[P]                                  // the side opposite the known angle
  const xv = val[x]
  const y = known.find((f) => isSide(f) && f !== x) as TriangleField
  const yv = val[y]
  const Y = OPP[y]                                  // the angle to isolate
  const sinY = yv * Math.sin(rad(val[P])) / xv
  if (sinY > 1 + 1e-9)
    throw new Error(`no triangle exists: the Law of Sines needs sin ${Y} = ${n3(sinY)} > 1 — side ${y} is too short to reach with ${P} = ${n2(val[P])}°.`)
  const Y1 = sinY > 1 - 1e-9 ? 90 : deg(Math.asin(clamp1(sinY)))
  const cands = [Y1]
  if (Math.abs(180 - 2 * Y1) > 1e-6) cands.push(180 - Y1) // the supplement fits the same sine
  const valid = cands.filter((Yd) => val[P] + Yd < 180 - 1e-9).sort((m, n2v) => m - n2v)
  if (valid.length === 0)
    throw new Error(`no triangle exists: with ${P} = ${n2(val[P])}° the remaining angle ${Y} would push the angle sum past 180°.`)
  const R = (['A', 'B', 'C'] as const).find((f) => f !== P && f !== Y) as TriangleField
  const r = OPP[R]                                  // the third side, still unknown
  const basis0 = givenBasis(known)
  const solutions: TriangleSolution[] = valid.map((Yd, k) => {
    const Rd = 180 - val[P] - Yd
    const rv = xv * Math.sin(rad(Rd)) / Math.sin(rad(val[P]))
    const basis = { ...basis0, [Y]: k === 0 ? 'law of sines' : 'law of sines — supplement', [R]: 'angle sum', [r]: 'law of sines' } as Record<TriangleField, string>
    const first: SolutionStep = k === 0
      ? {
          title: `Angle ${Y} from the Law of Sines`,
          lines: [
            { tex: `\\frac{\\sin ${Y}}{${y}} = \\frac{\\sin ${P}}{${x}} \\quad\\Rightarrow\\quad \\sin ${Y} = \\frac{${n3(yv)}\\sin ${d2(val[P])}}{${n3(xv)}} = ${n3(Math.min(sinY, 1))}` },
            ...(Y1 === 90
              ? [{ text: `The ratio lands on 1: ${Y} is exactly 90° — the far end of side ${y} meets side ${r} perpendicular, the right-triangle limit.` } as SolutionStep['lines'][number]]
              : [
                  { tex: `${Y} = \\arcsin(${n3(Math.min(sinY, 1))}) = ${d2(Yd)}` },
                  { text: valid.length === 2
                    ? `The asin returns the acute angle that fits the ratio — but the supplement pairs with the same sine, and with these knowns both keep the sum under 180°: TWO triangles exist. The second follows.`
                    : 'Two sides with a NON-included angle: the sine law isolates the angle opposite the second side, and only this angle fits.' },
                ]),
          ],
        }
      : {
          title: `Angle ${Y} — the supplement`,
          lines: [
            { tex: `${Y} = 180^{\\circ} - \\arcsin(${n3(Math.min(sinY, 1))}) = 180^{\\circ} - ${d2(Y1)} = ${d2(Yd)}` },
            { text: 'The same sine fits two angles: asin returns the acute one; its supplement satisfies the same ratio and still leaves room for the third angle — the ambiguous case of the Law of Sines.' },
          ],
        }
    const steps: SolutionStep[] = [
      first,
      sumStep(R, [P, Y], [val[P], Yd]),
      sineLawSideStep(r, { ...val, [Y]: Yd, [R]: Rd } as Record<TriangleField, number>, x),
    ]
    return { ...{ a: val.a, b: val.b, c: val.c, A: val.A, B: val.B, C: val.C, [Y]: Yd, [R]: Rd, [r]: rv } as Triangle, basis, steps }
  })
  return { caseName: 'SSA', ambiguous: solutions.length === 2, solutions }
}

// ── Dispatch ────────────────────────────────────────────────────────────────

/**
 * Solve the triangle from the stated knowns, or throw with the reason.
 *
 * Exactly three fields must be present, at least one a side. The case falls
 * out of WHICH fields are known: three sides → SSS; two sides whose angle
 * sits between them → SAS; two sides and the angle opposite one of them →
 * SSA (possibly two triangles); a side with two angles → the angle sum and
 * the Law of Sines.
 */
export function solveTriangle(input: TriangleInput): SolvedTriangle {
  const known = FIELDS.filter((f) => input[f] !== undefined && Number.isFinite(input[f]))
  if (known.length !== 3)
    throw new Error(`the solver needs exactly three knowns — got ${known.length}. Fill three of the six fields, at least one a side.`)
  if (!known.some(isSide))
    throw new Error('three angles fix only the shape — any scale fits. At least one side is required.')
  for (const f of known) {
    const v = input[f] as number
    if (isSide(f)) { if (v <= 0) throw new Error(`side ${f} must be positive.`) }
    else if (v <= 0 || v >= 180) throw new Error(`angle ${f} must lie strictly between 0° and 180°.`)
  }
  const angles = known.filter((f) => !isSide(f))
  if (angles.length === 2 && (input[angles[0]] as number) + (input[angles[1]] as number) >= 180)
    throw new Error(`angles ${angles[0]} and ${angles[1]} already sum to 180° or more — no triangle can close.`)
  const val = Object.fromEntries(known.map((f) => [f, input[f] as number])) as Record<TriangleField, number>

  const sides = known.filter(isSide)
  if (sides.length === 3) return solveSSS(known, { ...val })
  if (sides.length === 2) {
    const P = angles[0]
    return known.includes(OPP[P]) ? solveSSA(known, { ...val }, P) : solveSAS(known, { ...val }, P)
  }
  return solveAngleSum(known, { ...val })
}
