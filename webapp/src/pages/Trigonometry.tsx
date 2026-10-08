import { useState } from 'react'
import { solveRightTriangle, inverseUsed, type RightTriangleKnown } from '../engine/rightTriangle'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { RightTriangleSketch } from '../components/mathSketches'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// Trigonometry — a right-triangle solver in the exam's own terms: the user
// states WHICH two of {a, b, c, A, B} they know (blank = unknown) and the
// page picks the function each unknown needs — Pythagoras, a forward
// sine/cosine/tangent, or the inverse — and writes the solution out.

type Field = 'a' | 'b' | 'c' | 'A' | 'B'
type Known = Partial<Record<Field, number | null>>

const ORDER: Field[] = ['a', 'b', 'c', 'A', 'B']
const LABEL: Record<Field, string> = { a: 'side a', b: 'side b', c: 'hypotenuse c', A: 'angle A', B: 'angle B' }

/** The filled fields, in canonical order, joined — exactly the engine's pair names. */
const pairOf = (k: Known): Field[] => ORDER.filter((f) => k[f] !== null && k[f] !== undefined && Number.isFinite(k[f] as number))

export default function Trigonometry() {
  const [k, setK] = useState<Known>({ a: 3, b: 4, c: null, A: null, B: null })

  const set = (f: Field) => (v: number) => setK((s) => ({ ...s, [f]: Number.isFinite(v) ? v : null }))
  const pair = pairOf(k)
  const known = pair.length === 2 ? (pair.join('-') as RightTriangleKnown) : null
  const ABonly = pair.length === 2 && pair[0] === 'A' && pair[1] === 'B'

  let r: ReturnType<typeof solveRightTriangle> | null = null
  let err = ''
  try {
    if (pair.length < 2) err = 'Fill exactly two fields — the two knowns. The rest stay blank.'
    else if (pair.length > 2) err = 'Too many knowns — leave exactly two fields filled.'
    else if (ABonly) err = 'A and B alone cannot fix a size: with no side given, the triangle could be any scale. Give at least one side.'
    else if (known) r = solveRightTriangle({ known, ...k } as Parameters<typeof solveRightTriangle>[0])
  } catch (e) { err = (e as Error).message }

  const inv = known ? inverseUsed(known) : null

  const steps: SolutionStep[] = r && known && inv
    ? buildSteps(known, k, r, inv)
    : [{ title: 'Waiting for two knowns', lines: [{ text: err || 'Fill exactly two of the five fields — at least one side.' }] }]

  return (
    <WorkspacePage title="Trigonometry" badges={['Mathematics', 'Right triangles']}
      intro="Fill any two of the five fields — a side and an angle, two sides, or a leg and the hypotenuse — and the solver picks the right relation for every unknown: Pythagoras to close the sides, sine, cosine or tangent for a side from an angle, and the inverse function when an angle must come out of two sides. Every step is written out."
      inputs={<>
        <InputGroup title="Sides" hint="Blank means unknown. Exactly two fields may be filled, at least one a side.">
          <Num label="Leg a" value={k.a ?? NaN} onChange={set('a')} step="0.5" />
          <Num label="Leg b" value={k.b ?? NaN} onChange={set('b')} step="0.5" />
          <Num label="Hypotenuse c" value={k.c ?? NaN} onChange={set('c')} step="0.5" />
        </InputGroup>
        <InputGroup title="Angles" hint="In degrees; C is the right angle. A + B = 90°.">
          <Num label="Angle A (opposite a)" value={k.A ?? NaN} onChange={set('A')} step="1" />
          <Num label="Angle B (opposite b)" value={k.B ?? NaN} onChange={set('B')} step="1" />
        </InputGroup>
        <div className="flex gap-2">
          <button type="button" onClick={() => setK({ a: 3, b: 4, c: null, A: null, B: null })}
            className="rounded-md border border-field-line px-2.5 py-1.5 text-[12px] font-semibold text-brand hover:bg-brand-tint">
            Sample 3-4-5
          </button>
          <button type="button" onClick={() => setK({ a: null, b: null, c: null, A: null, B: null })}
            className="rounded-md border border-field-line px-2.5 py-1.5 text-[12px] font-semibold text-muted hover:bg-sheet-2">
            Clear all
          </button>
        </div>
      </>}
      checks={r ? <>
        <CheckCard title="Sides" basis={`${LABEL[pair[0]]} and ${LABEL[pair[1]]} given`} status="info"
          value={f3(r.c)} unit="c" formula="a² + b² = c²"
          pairs={[{ label: 'a', value: f2(r.a) }, { label: 'b', value: f2(r.b) }]} />
        <CheckCard title="Angles" basis="C is the right angle" status="info"
          value={`${f2(r.A)}°`} unit="A" formula="A + B = 90°"
          pairs={[{ label: 'B', value: `${f2(r.B)}°` }, { label: 'C', value: '90°' }]} />
      </> : (
        <CheckCard title="Nothing solved yet" basis={err ? 'the knowns are refused' : 'two knowns needed'} status="warn" pillLabel="CHECK"
          value="—" formula={err || 'Fill exactly two fields, at least one of them a side.'} />
      )}
      summary={r ? [
        { label: 'Leg a', value: f2(r.a) }, { label: 'Leg b', value: f2(r.b) }, { label: 'Hypotenuse c', value: f3(r.c) },
        { label: 'Angle A', value: `${f2(r.A)}°` }, { label: 'Angle B', value: `${f2(r.B)}°` }, { label: 'Angle C', value: '90°' },
      ] : [{ label: 'Knowns', value: pair.length ? pair.map((f) => LABEL[f]).join(' + ') : 'none yet' }]}
      drawing={r ? { title: 'The solved triangle', node: (
        <RightTriangleSketch a={r.a} b={r.b} c={r.c} A={r.A} B={r.B} />
      ) } : undefined}
      results={r ? [
        { check: 'Leg a', basis: pair.includes('a') ? 'given' : 'solved', demand: f2(r.a), status: 'info' },
        { check: 'Leg b', basis: pair.includes('b') ? 'given' : 'solved', demand: f2(r.b), status: 'info' },
        { check: 'Hypotenuse c', basis: pair.includes('c') ? 'given' : '√(a² + b²) or √(c² − leg²)', demand: f3(r.c), status: 'info' },
        { check: 'Angle A', basis: pair.includes('A') ? 'given' : (inv && inv.target === 'A' ? `${inv.fn}(${inv.from})` : '90° − B'), demand: `${f2(r.A)}°`, status: 'info' },
        { check: 'Angle B', basis: pair.includes('B') ? 'given' : (inv && inv.target === 'B' ? `${inv.fn}(${inv.from})` : '90° − A'), demand: `${f2(r.B)}°`, status: 'info' },
        { check: 'Angle C', basis: 'the right angle', demand: '90°', status: 'info' },
      ] : [{ check: 'Knowns', basis: 'fill exactly two fields, one a side', demand: '—', status: 'warn' }]}
      steps={steps}
      references={[
        { topic: 'Pythagorean theorem', basis: 'a² + b² = c² closes the sides once two are known', source: 'Plane geometry' },
        { topic: 'Sine, cosine, tangent', basis: 'sin A = a/c, cos A = b/c, tan A = a/b — forward for a side from an angle, inverted for an angle from two sides', source: 'Trigonometry — right triangles' },
        { topic: 'Angle sum', basis: 'A + B = 90°: the two acute angles are complements', source: 'Plane geometry' },
      ]}
    />
  )
}

// ── The worked steps, per known pair ─────────────────────────────────────────

type RT = ReturnType<typeof solveRightTriangle>

function buildSteps(known: RightTriangleKnown, k: Partial<Record<Field, number | null>>, r: RT, inv: ReturnType<typeof inverseUsed>): SolutionStep[] {
  const num = (f: Field) => f2(k[f] ?? NaN)
  const deg = (f: Field) => `${f2(k[f] ?? NaN)}°`
  const given = (f: Field) => known.includes(f as never)
  const out: SolutionStep[] = []

  // 1 — the third side
  if (known === 'a-b') {
    out.push({ title: 'Close the sides with Pythagoras', lines: [
      { tex: `c = \\sqrt{a^{2} + b^{2}} = \\sqrt{${num('a')}^{2} + ${num('b')}^{2}} = ${f3(r.c)}` },
      { text: 'Two legs known: the hypotenuse needs no trigonometry at all.' },
    ] })
  } else if (known === 'a-c') {
    out.push({ title: 'Close the sides with Pythagoras', lines: [
      { tex: `b = \\sqrt{c^{2} - a^{2}} = \\sqrt{${num('c')}^{2} - ${num('a')}^{2}} = ${f3(r.b)}` },
      { text: 'Leg and hypotenuse known: the other leg follows from the same theorem, rearranged.' },
    ] })
  } else if (known === 'b-c') {
    out.push({ title: 'Close the sides with Pythagoras', lines: [
      { tex: `a = \\sqrt{c^{2} - b^{2}} = \\sqrt{${num('c')}^{2} - ${num('b')}^{2}} = ${f3(r.a)}` },
      { text: 'Leg and hypotenuse known: the other leg follows from the same theorem, rearranged.' },
    ] })
  }

  // 2 — sides from angles, when an angle was given
  if (known === 'a-A') out.push({ title: 'Sides from the angle', lines: [
    { tex: `b = \\frac{a}{\\tan A} = \\frac{${num('a')}}{\\tan ${deg('A')}} = ${f3(r.b)}` },
    { tex: `c = \\frac{a}{\\sin A} = \\frac{${num('a')}}{\\sin ${deg('A')}} = ${f3(r.c)}` },
    { text: 'a is OPPOSITE A, so the tangent (opposite/adjacent) gives b and the sine (opposite/hypotenuse) gives c.' },
  ] })
  else if (known === 'a-B') out.push({ title: 'Sides from the angle', lines: [
    { tex: `b = a\\tan B = ${num('a')}\\tan ${deg('B')} = ${f3(r.b)}` },
    { tex: `c = \\frac{a}{\\cos B} = \\frac{${num('a')}}{\\cos ${deg('B')}} = ${f3(r.c)}` },
    { text: 'a is ADJACENT to B: the tangent (opposite/adjacent) gives b and the cosine (adjacent/hypotenuse) gives c.' },
  ] })
  else if (known === 'b-A') out.push({ title: 'Sides from the angle', lines: [
    { tex: `a = b\\tan A = ${num('b')}\\tan ${deg('A')} = ${f3(r.a)}` },
    { tex: `c = \\frac{b}{\\cos A} = \\frac{${num('b')}}{\\cos ${deg('A')}} = ${f3(r.c)}` },
    { text: 'b is ADJACENT to A: the tangent gives a and the cosine gives c.' },
  ] })
  else if (known === 'b-B') out.push({ title: 'Sides from the angle', lines: [
    { tex: `a = \\frac{b}{\\tan B} = \\frac{${num('b')}}{\\tan ${deg('B')}} = ${f3(r.a)}` },
    { tex: `c = \\frac{b}{\\sin B} = \\frac{${num('b')}}{\\sin ${deg('B')}} = ${f3(r.c)}` },
    { text: 'b is OPPOSITE B, so the tangent (opposite/adjacent) gives a and the sine (opposite/hypotenuse) gives c.' },
  ] })
  else if (known === 'c-A') out.push({ title: 'Sides from the angle', lines: [
    { tex: `a = c\\sin A = ${num('c')}\\sin ${deg('A')} = ${f3(r.a)}` },
    { tex: `b = c\\cos A = ${num('c')}\\cos ${deg('A')} = ${f3(r.b)}` },
    { text: 'With the hypotenuse known, sine (opposite/hypotenuse) gives a and cosine (adjacent/hypotenuse) gives b.' },
  ] })
  else if (known === 'c-B') out.push({ title: 'Sides from the angle', lines: [
    { tex: `a = c\\cos B = ${num('c')}\\cos ${deg('B')} = ${f3(r.a)}` },
    { tex: `b = c\\sin B = ${num('c')}\\sin ${deg('B')} = ${f3(r.b)}` },
    { text: 'With the hypotenuse known, cosine (adjacent/hypotenuse) gives a and sine (opposite/hypotenuse) gives b.' },
  ] })

  // 3 — the angles: either given, or from the inverse function
  if (!given('A') || !given('B')) {
    const target = inv.target === 'A' ? 'A' : 'B'
    const fnTex = inv.fn === 'arcsin' ? '\\arcsin' : inv.fn === 'arccos' ? '\\arccos' : '\\arctan'
    const fromTex = inv.from
      .replace('a/b', `\\frac{a}{b} = \\frac{${num('a')}}{${num('b')}}`)
      .replace('a/c', `\\frac{a}{c} = \\frac{${num('a')}}{${num('c')}}`)
      .replace('b/c', `\\frac{b}{c} = \\frac{${num('b')}}{${num('c')}}`)
    const value = target === 'A' ? r.A : r.B
    out.push({ title: `Angle ${target} from the inverse function`, lines: [
      { tex: `${target} = ${fnTex}\\left(${fromTex}\\right) = ${f2(value)}^{\\circ}` },
      { text: `Two sides known and the angle unknown: the ratio ${inv.from} fixes ${target}, and the ${inv.fn} reads the angle back. The calculator chose ${inv.fn} because that is the inverse of the function connecting ${inv.from} to ${target} in a right triangle.` },
    ] })
    const other = target === 'A' ? 'B' : 'A'
    out.push({ title: `Angle ${other} by complement`, lines: [
      { tex: `${other} = 90^{\\circ} - ${target} = 90^{\\circ} - ${f2(value)}^{\\circ} = ${f2(target === 'A' ? r.B : r.A)}^{\\circ}` },
      { text: 'The acute angles of a right triangle are complements — no further function needed.' },
    ] })
  } else {
    out.push({ title: 'The third angle by complement', lines: [
      { tex: `C = 90^{\\circ},\\quad A + B = 90^{\\circ}` },
      { text: 'Both acute angles were given, so nothing remains to solve — but they must complement each other, and the solver checked that they do.' },
    ] })
  }

  return out
}
