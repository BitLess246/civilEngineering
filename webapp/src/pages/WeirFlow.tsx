import { useState } from 'react'
import {
  weirDischarge, headForQ, type WeirShape, type WeirResult,
} from '../engine/weirFlow'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { WeirViews } from '../components/hydraulicsSketches'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// Weir Flow — discharge over the standard measurement weirs: rectangular
// (suppressed / contracted), Cipolletti, V-notch and broad-crested.
// Solve Q from the head, or the head from a target Q (bisection inverse).

type Solve = 'qFromH' | 'hFromQ'

const SHAPES: [string, string][] = [
  ['rectSuppressed', 'Rectangular — suppressed'],
  ['rectContracted', 'Rectangular — end contracted'],
  ['cipolletti', 'Cipolletti trapezoid'],
  ['vnotch', 'Triangular V-notch'],
  ['broadCrested', 'Broad-crested'],
]

const FORMULA_TEX: Record<WeirShape, string> = {
  rectSuppressed: 'Q = 1.84\\,L\\,H^{3/2}',
  rectContracted: 'Q = 1.84\\,(L - 0.1\\,nH)\\,H^{3/2}',
  cipolletti: 'Q = 1.86\\,L\\,H^{3/2}',
  vnotch: 'Q = \\tfrac{8}{15}\\,C_d\\sqrt{2g}\\,\\tan\\tfrac{\\theta}{2}\\,H^{5/2}',
  broadCrested: 'Q = 1.705\\,C_b\\,b\\,H^{3/2}',
}

const SHAPE_NOTES: Record<WeirShape, string> = {
  rectSuppressed: 'Francis formula with the SI constant 1.84 and no end contractions; an approach head ha swaps H for H + ha and removes the ha^1.5 term.',
  rectContracted: 'Each end contraction steals 0.1·H of crest length — n = 2 for a weir with both ends free in the channel.',
  cipolletti: 'The 4V:1H side slopes widen the nappe as the head draws down, cancelling the end-contraction loss, so L needs no correction.',
  vnotch: 'The general Kindsvater-style form; for a 90° notch the engine also reports Cone\u2019s empirical Q = 1.343·H^2.48 for comparison.',
  broadCrested: 'Critical depth controls on the horizontal crest: ideal coefficient 1.705, with Cb below 1.0 absorbing real-structure losses.',
}

interface SolveOut { res: WeirResult | null; solvedH: number }

const FORMULA_PLAIN: Record<WeirShape, string> = {
  rectSuppressed: 'Q = 1.84 L H^1.5',
  rectContracted: 'Q = 1.84 (L − 0.1nH) H^1.5',
  cipolletti: 'Q = 1.86 L H^1.5',
  vnotch: 'Q = (8/15) Cd √2g tan(θ/2) H^2.5',
  broadCrested: 'Q = 1.705 Cb b H^1.5',
}

export default function WeirFlow() {
  const [shape, setShape] = useState<WeirShape>('rectSuppressed')
  const [solve, setSolve] = useState<Solve>('qFromH')
  const [H, setH] = useState(0.5)
  const [Q, setQ] = useState(1.3)
  const [L, setL] = useState(2)
  const [n, setN] = useState(2)
  const [angle, setAngle] = useState(90)
  const [Cd, setCd] = useState(0.6)
  const [Cb, setCb] = useState(1.0)
  const [ha, setHa] = useState(0)

  const needsL = shape !== 'vnotch'

  const out: SolveOut = (() => {
    const common = { shape, L: needsL ? L : undefined, n, angle, Cd, Cb, ha: ha > 0 ? ha : undefined }
    try {
      if (solve === 'qFromH') {
        return { res: weirDischarge({ ...common, H }), solvedH: H }
      }
      const h = headForQ({ ...common, Q })
      return { res: weirDischarge({ ...common, H: h }), solvedH: h }
    } catch {
      return { res: null, solvedH: NaN }
    }
  })()
  const res = out.res
  const shownH = solve === 'qFromH' ? H : out.solvedH

  // The selected weir equation with the live inputs substituted — the same
  // forward check doubles as the inverse verification in hFromQ mode.
  const Hused = solve === 'qFromH' ? H : out.solvedH
  const tanHalf = Math.tan((angle / 2) * Math.PI / 180)
  const subTex: string = shape === 'rectSuppressed' && ha > 0
    ? `Q = 1.84\\,L\\,[(H+h_a)^{3/2} - h_a^{3/2}] = 1.84\\times ${f3(L)}\\times [(${f3(Hused)}+${f3(ha)})^{3/2} - ${f3(ha)}^{3/2}] = ${f3(res?.Q ?? 0)}\\ \\text{m}^3/\\text{s}`
    : shape === 'rectSuppressed'
      ? `Q = 1.84\\,L\\,H^{3/2} = 1.84\\times ${f3(L)}\\times ${f3(Hused)}^{3/2} = ${f3(res?.Q ?? 0)}\\ \\text{m}^3/\\text{s}`
      : shape === 'rectContracted'
        ? `L' = L - 0.1\\,nH = ${f3(L)} - 0.1\\times ${f2(n)}\\times ${f3(Hused)} = ${f3(res?.effectiveLength ?? 0)}\\text{ m}, \\; Q = 1.84\\,L'\\,H^{3/2} = ${f3(res?.Q ?? 0)}\\ \\text{m}^3/\\text{s}`
        : shape === 'cipolletti'
          ? `Q = 1.86\\,L\\,H^{3/2} = 1.86\\times ${f3(L)}\\times ${f3(Hused)}^{3/2} = ${f3(res?.Q ?? 0)}\\ \\text{m}^3/\\text{s}`
          : shape === 'vnotch'
            ? `Q = \\tfrac{8}{15}\\,C_d\\sqrt{2g}\\,\\tan\\tfrac{\\theta}{2}\\,H^{5/2} = \\tfrac{8}{15}\\times ${f3(Cd)}\\times \\sqrt{19.62}\\times ${f3(tanHalf)}\\times ${f3(Hused)}^{5/2} = ${f3(res?.Q ?? 0)}\\ \\text{m}^3/\\text{s}`
            : `Q = 1.705\\,C_b\\,b\\,H^{3/2} = 1.705\\times ${f3(Cb)}\\times ${f3(L)}\\times ${f3(Hused)}^{3/2} = ${f3(res?.Q ?? 0)}\\ \\text{m}^3/\\text{s}`

  const steps: SolutionStep[] = res ? [
    {
      title: 'Governing formula',
      lines: [
        { tex: FORMULA_TEX[shape] },
        { text: SHAPE_NOTES[shape] },
      ],
    },
    solve === 'qFromH'
      ? {
          title: 'Substitute the head',
          lines: [
            { tex: subTex },
            { text: `H = ${f3(H)} m above the crest${ha > 0 && shape !== 'vnotch' && shape !== 'broadCrested' && shape !== 'cipolletti' ? ` with approach head ha = ${f3(ha)} m` : ''} — the substituted equation above is the discharge.` },
            ...(res.effectiveLength < L - 1e-9 ? [{ text: `End contractions reduced the wetted crest to L′ = ${f3(res.effectiveLength)} m.` }] : []),
          ],
        }
      : {
          title: 'Invert for the head',
          lines: [
            { tex: `Q(H)\\ \\text{is monotone in } H \\;\\Rightarrow\\; H = ${f3(out.solvedH)}\\ \\text{m by bisection (target } Q = ${f3(Q)}\\text{ m}^3\\text{/s)}` },
            { tex: `${subTex} \\quad\\checkmark` },
            { text: 'The inverse is a bracketed bisection to 1e-10 relative precision — the forward substitution above replays the solved head through the weir equation and lands back on the target discharge.' },
          ],
        },
    ...res.notes.map((nt) => ({ title: 'Note', lines: [{ text: nt }] })),
  ] : [{ title: 'Check the inputs', lines: [{ text: 'Give a positive head (or target discharge) and crest length. A contracted weir also refuses heads so large that 0.1·n·H eats the whole crest.' }] }]

  const name = SHAPES.find(([v]) => v === shape)?.[1] ?? ''
  const crestWord = shape === 'broadCrested' ? 'Crest width b' : 'Crest length L'
  return (
    <WorkspacePage title="Weir Flow" badges={['Hydraulics', name]}
      intro="The standard flow-measurement weirs: Francis rectangular with or without end contractions, the Cipolletti trapezoid whose 4V:1H sides offset the contractions, the V-notch for small flows, and the broad-crested crest. Head to discharge, or discharge to head."
      inputs={<>
        <InputGroup title="Weir">
          <div className="col-span-2"><Pick label="Weir type" value={shape} onChange={(v) => setShape(v as WeirShape)} options={SHAPES} /></div>
          {needsL && <Num label={crestWord} unit="m" value={L} onChange={setL} min={0.1} max={50} step="0.1" />}
          {shape === 'rectContracted' && <Num label="End contractions n" value={n} onChange={setN} min={0} max={2} step="1" />}
          {shape === 'vnotch' && <>
            <Num label="Notch angle θ" unit="°" value={angle} onChange={setAngle} min={20} max={150} step="5" />
            <Num label="Discharge coeff. Cd" value={Cd} onChange={setCd} min={0.4} max={0.9} step="0.01" />
          </>}
          {shape === 'broadCrested' && <Num label="Coefficient Cb" value={Cb} onChange={setCb} min={0.5} max={1.2} step="0.01" />}
        </InputGroup>
        <InputGroup title="Solve for">
          <div className="col-span-2"><Pick label="Unknown" value={solve} onChange={(v) => setSolve(v as Solve)} options={[['qFromH', 'Discharge Q from the head H'], ['hFromQ', 'Head H for a target Q']]} /></div>
          {solve === 'qFromH'
            ? <Num label="Head above crest H" unit="m" value={H} onChange={setH} min={0.01} max={5} step="0.05" />
            : <Num label="Target discharge Q" unit="m³/s" value={Q} onChange={setQ} min={0.001} max={200} step="0.1" />}
          {(shape === 'rectSuppressed' || shape === 'rectContracted') && <Num label="Approach head hₐ" unit="m" value={ha} onChange={setHa} min={0} max={0.5} step="0.01" />}
        </InputGroup>
      </>}
      checks={res ? <>
        <CheckCard title={solve === 'qFromH' ? 'Discharge' : 'Head above the crest'} basis={name} status="info"
          value={solve === 'qFromH' ? f3(res.Q) : f3(shownH)} unit={solve === 'qFromH' ? 'm³/s' : 'm'} formula={FORMULA_PLAIN[shape]}
          pairs={solve === 'qFromH'
            ? [{ label: 'In litres', value: `${f2(res.Q * 1000)} L/s` }, { label: 'Head H', value: `${f3(H)} m` }]
            : [{ label: 'Target Q', value: `${f3(Q)} m³/s` }, { label: 'Check Q(H)', value: `${f3(res.Q)} m³/s` }]} />
        <CheckCard title="Effective opening" basis={shape === 'vnotch' ? 'width at the surface' : shape === 'rectContracted' ? `${n} end contraction${n === 1 ? '' : 's'}` : 'crest'} status="info"
          value={f3(res.effectiveLength)} unit="m" formula={shape === 'rectContracted' ? "L′ = L − 0.1nH" : shape === 'vnotch' ? '2H tan(θ/2)' : 'no correction'}
          pairs={[{ label: shape === 'vnotch' ? 'Angle θ' : crestWord, value: shape === 'vnotch' ? `${f2(angle)}°` : `${f3(L)} m` }, { label: 'H / L', value: shape === 'vnotch' ? '—' : f3(shownH / L) }]} />
      </> : (
        <CheckCard title="Check the inputs" basis={name} status="warn" pillLabel="CHECK" value="—" formula="Positive head (or Q) and crest length; a contracted weir cannot lose its whole crest to 0.1·n·H." />
      )}
      summary={[
        { label: 'Weir', value: name },
        ...(needsL ? [{ label: crestWord, value: `${f3(L)} m` }] : [{ label: 'Notch angle θ', value: `${f2(angle)}°` }]),
        solve === 'qFromH' ? { label: 'Head H', value: `${f3(H)} m` } : { label: 'Target Q', value: `${f3(Q)} m³/s` },
        ...(ha > 0 && (shape === 'rectSuppressed' || shape === 'rectContracted') ? [{ label: 'Approach head hₐ', value: `${f3(ha)} m` }] : []),
      ]}
      drawing={res && Number.isFinite(shownH) ? { title: 'Profile and front view', node: <div data-pdf-drawing>
        <WeirViews shape={shape} H={shownH} L={needsL ? L : 1} angle={angle} n={n} Leff={res.effectiveLength} />
      </div> } : undefined}
      resultsCaption={res && res.notes.length ? res.notes.join(' ') : undefined}
      results={res ? [
        { check: 'Discharge Q', basis: FORMULA_PLAIN[shape], demand: `${f3(res.Q)} m³/s`, status: 'info' },
        { check: 'Head above crest H', basis: solve === 'qFromH' ? 'given' : 'bisection on Q(H)', demand: `${f3(shownH)} m`, status: 'info' },
        { check: 'Effective opening', basis: shape === 'rectContracted' ? 'L − 0.1nH' : 'as built', demand: `${f3(res.effectiveLength)} m`, status: 'info' },
      ] : [{ check: 'Discharge', basis: 'inputs out of range', demand: '—', status: 'warn' }]}
      steps={steps}
      references={[
        { topic: 'Francis rectangular', basis: 'Q = 1.84(L − 0.1nH)H^1.5 (SI); approach head: (H + hₐ)^1.5 − hₐ^1.5', source: 'Francis (1883); USBR Water Measurement Manual' },
        { topic: 'Cipolletti', basis: 'Q = 1.86 L H^1.5 with 4V:1H sides', source: 'USBR Water Measurement Manual' },
        { topic: 'V-notch', basis: 'Q = (8/15) Cd √(2g) tan(θ/2) H^2.5', source: 'Kindsvater–Shen; ISO 1438' },
        { topic: 'Broad-crested', basis: 'Q = 1.705 Cb b H^1.5 (critical depth 2H/3 on the crest)', source: 'Open-channel hydraulics' },
      ]}
    />
  )
}
