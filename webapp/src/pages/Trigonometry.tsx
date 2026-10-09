import { useState } from 'react'
import { solveTriangle, type TriangleField, type TriangleCase, type TriangleInput, type SolvedTriangle } from '../engine/triangle'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { TriangleSketch } from '../components/mathSketches'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// Trigonometry — a solver for ANY triangle, right or oblique: the user
// states WHICH three of {a, b, c, A, B, C} they know (blank = unknown, at
// least one side) and the page picks the relation each unknown needs — the
// Law of Cosines, the Law of Sines, the angle sum, inverses included — and
// writes the solution out. C is never assumed to be 90°; when the knowns
// fit two triangles (the SSA ambiguous case) the toggle beside the title
// switches between both.

type Known = Partial<Record<TriangleField, number | null>>

const ORDER: TriangleField[] = ['a', 'b', 'c', 'A', 'B', 'C']
const LABEL: Record<TriangleField, string> = { a: 'side a', b: 'side b', c: 'side c', A: 'angle A', B: 'angle B', C: 'angle C' }

/** The filled fields, in canonical order — exactly the engine's knowns. */
const filledOf = (k: Known): TriangleField[] =>
  ORDER.filter((f) => k[f] !== null && k[f] !== undefined && Number.isFinite(k[f] as number))

const CASE_BASIS: Record<TriangleCase, string> = {
  SSS: 'three sides given',
  SAS: 'two sides with the included angle',
  'ASA/AAS': 'a side with two angles',
  SSA: 'two sides with a non-included angle',
}
const CASE_FORMULA: Record<TriangleCase, string> = {
  SSS: 'cos A = (b² + c² − a²)/(2bc)',
  SAS: 'c² = a² + b² − 2ab·cos C',
  'ASA/AAS': 'a/sin A = b/sin B = c/sin C',
  SSA: 'sin B = b·sin A / a',
}

export default function Trigonometry() {
  const [k, setK] = useState<Known>({ a: 8, b: 5, c: null, A: null, B: null, C: 60 })
  const [solIdx, setSolIdx] = useState(0)

  const set = (f: TriangleField) => (v: number) => { setSolIdx(0); setK((s) => ({ ...s, [f]: Number.isFinite(v) ? v : null })) }
  const sample = (s: Known) => { setSolIdx(0); setK(s) }

  const knowns = filledOf(k)
  let solved: SolvedTriangle | null = null
  let err = ''
  try {
    if (knowns.length < 3) err = 'Fill exactly three fields — the three knowns. The rest stay blank.'
    else if (knowns.length > 3) err = 'Too many knowns — leave exactly three fields filled.'
    else solved = solveTriangle(Object.fromEntries(knowns.map((f) => [f, k[f] as number])) as TriangleInput)
  } catch (e) { err = (e as Error).message }

  const sol = solved ? solved.solutions[solIdx < solved.solutions.length ? solIdx : 0] : null

  const solutionToggle = solved?.ambiguous ? (
    <div className="flex items-center gap-0.5 rounded-md border border-field-line bg-field p-0.5">
      {solved.solutions.map((_, i) => (
        <button key={i} type="button" onClick={() => setSolIdx(i)}
          className={`rounded px-3 py-1.5 text-[11.5px] font-semibold ${i === solIdx ? 'bg-brand text-on-solid' : 'text-muted hover:text-ink'}`}>
          Solution {i + 1}
        </button>
      ))}
    </div>
  ) : undefined

  const steps: SolutionStep[] = sol
    ? [
        ...(solved?.ambiguous ? [{
          title: `Two triangles fit these knowns — showing solution ${solIdx + 1} of 2`,
          lines: [{ text: 'Two sides with a NON-included angle may fit two triangles: the isolated angle can take the arcsin value or its supplement, and both keep the sum under 180°. Both solutions are valid and solved in full — the toggle beside the title switches between them.' }],
        } as SolutionStep] : []),
        ...sol.steps,
      ]
    : [{ title: 'Waiting for three knowns', lines: [{ text: err || 'Fill exactly three of the six fields — at least one of them a side.' }] }]

  return (
    <WorkspacePage title="Trigonometry" badges={['Mathematics', 'Any triangle']} actions={solutionToggle}
      intro="Fill any three of the six fields — three sides, two sides with their included angle, a side with two angles, even two sides with a non-included angle — and the solver picks the right relation for every unknown: the Law of Cosines where the cosine closes a side or an angle one-to-one, the Law of Sines where a side travels with its opposite angle, the angle sum to finish, and the inverse functions when an angle must come out of two sides. C is never assumed to be the right angle — a 90° simply falls out of the laws when the numbers say so. When the knowns fit two triangles, both are solved; every step is written out."
      inputs={<>
        <InputGroup title="Sides" hint="Blank means unknown. Exactly three fields may be filled, at least one a side.">
          <Num label="Side a (opposite A)" value={k.a ?? NaN} onChange={set('a')} step="0.5" />
          <Num label="Side b (opposite B)" value={k.b ?? NaN} onChange={set('b')} step="0.5" />
          <Num label="Side c (opposite C)" value={k.c ?? NaN} onChange={set('c')} step="0.5" />
        </InputGroup>
        <InputGroup title="Angles" hint="Degrees. Any of them may be 90° — the right angle is solved, not assumed. A + B + C = 180°.">
          <Num label="Angle A (opposite a)" value={k.A ?? NaN} onChange={set('A')} step="1" />
          <Num label="Angle B (opposite b)" value={k.B ?? NaN} onChange={set('B')} step="1" />
          <Num label="Angle C (opposite c)" value={k.C ?? NaN} onChange={set('C')} step="1" />
        </InputGroup>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => sample({ a: 3, b: 4, c: 5, A: null, B: null, C: null })}
            className="rounded-md border border-field-line px-2.5 py-1.5 text-[12px] font-semibold text-brand hover:bg-brand-tint">
            Sample 3-4-5 (SSS)
          </button>
          <button type="button" onClick={() => sample({ a: 8, b: 5, c: null, A: null, B: null, C: 60 })}
            className="rounded-md border border-field-line px-2.5 py-1.5 text-[12px] font-semibold text-brand hover:bg-brand-tint">
            Sample 8 · 5 · 60° (SAS)
          </button>
          <button type="button" onClick={() => sample({ a: 5, b: 7, c: null, A: 30, B: null, C: null })}
            className="rounded-md border border-field-line px-2.5 py-1.5 text-[12px] font-semibold text-brand hover:bg-brand-tint">
            Sample ambiguous (SSA)
          </button>
          <button type="button" onClick={() => sample({ a: null, b: null, c: null, A: null, B: null, C: null })}
            className="rounded-md border border-field-line px-2.5 py-1.5 text-[12px] font-semibold text-muted hover:bg-sheet-2">
            Clear all
          </button>
        </div>
      </>}
      checks={sol && solved ? <>
        <CheckCard title="Sides" basis={CASE_BASIS[solved.caseName]} status="info"
          value={f3(sol.c)} unit="c" formula={CASE_FORMULA[solved.caseName]}
          pairs={[{ label: 'a', value: f3(sol.a) }, { label: 'b', value: f3(sol.b) }]} />
        <CheckCard title="Angles" basis="A + B + C = 180°" status="info"
          value={`${f2(sol.A)}°`} unit="A" formula="the angle sum closes the last one"
          pairs={[{ label: 'B', value: `${f2(sol.B)}°` }, { label: 'C', value: `${f2(sol.C)}°` }]} />
      </> : (
        <CheckCard title="Nothing solved yet" basis={err ? 'the knowns are refused' : 'three knowns needed'} status="warn" pillLabel="CHECK"
          value="—" formula={err || 'Fill exactly three fields, at least one of them a side.'} />
      )}
      summary={sol ? [
        { label: 'Side a', value: f3(sol.a) }, { label: 'Side b', value: f3(sol.b) }, { label: 'Side c', value: f3(sol.c) },
        { label: 'Angle A', value: `${f2(sol.A)}°` }, { label: 'Angle B', value: `${f2(sol.B)}°` }, { label: 'Angle C', value: `${f2(sol.C)}°` },
        { label: 'Knowns', value: knowns.map((f) => LABEL[f]).join(' + ') + (solved?.ambiguous ? ` — ${solved.solutions.length} solutions` : '') },
      ] : [{ label: 'Knowns', value: knowns.length ? knowns.map((f) => LABEL[f]).join(' + ') : 'none yet' }]}
      drawing={sol ? { title: 'The solved triangle — true shape', node: (
        <TriangleSketch a={sol.a} b={sol.b} c={sol.c} A={sol.A} B={sol.B} C={sol.C} />
      ) } : undefined}
      results={sol ? ORDER.map((f) => ({
        check: LABEL[f],
        basis: sol.basis[f],
        demand: f === 'a' || f === 'b' || f === 'c' ? f3(sol[f] as number) : `${f2(sol[f] as number)}°`,
        status: 'info' as const,
      })) : [{ check: 'Knowns', basis: 'fill exactly three fields, one a side', demand: '—', status: 'warn' as const }]}
      resultsCaption={solved?.ambiguous ? 'The SSA ambiguity: both triangles satisfy the given knowns — the toggle beside the title selects which one is displayed.' : undefined}
      steps={steps}
      references={[
        { topic: 'Law of Sines', basis: 'a/sin A = b/sin B = c/sin C — a side from two angles, or an angle from two sides; the asin returns the acute fit, and the supplement may fit too', source: 'Trigonometry — oblique triangles' },
        { topic: 'Law of Cosines', basis: 'c² = a² + b² − 2ab·cos C — the third side from two sides and their included angle, or an angle from three sides; at 90° it collapses to Pythagoras', source: 'Trigonometry — oblique triangles' },
        { topic: 'Angle sum', basis: 'A + B + C = 180° closes the last angle of every plane triangle, right or oblique', source: 'Plane geometry' },
        { topic: 'The ambiguous case', basis: 'two sides with a non-included angle may fit two triangles — the solver detects it and returns both, worked in full', source: 'Trigonometry — SSA ambiguity' },
      ]}
    />
  )
}
