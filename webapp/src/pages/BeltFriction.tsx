import { useState } from 'react'
import { beltFriction } from '../engine/dynamics'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { BeltSketch } from '../components/dynamicsSketches'
import { f2, f3 } from '../lib/influenceStyle'

// Belt (capstan) friction: T₁ = T₂·e^(μβ) for a flat belt or rope on a fixed
// drum about to slip (engine/dynamics.ts · beltFriction). β in degrees at the
// page edge, radians inside.

type Unknown = 'T1' | 'T2' | 'mu' | 'beta'
const LABEL: Record<Unknown, string> = { T1: 'tight-side tension T₁', T2: 'slack-side tension T₂', mu: 'friction coefficient μ', beta: 'wrap angle β' }

export default function BeltFriction() {
  const [solveFor, setSolveFor] = useState<Unknown>('T1')
  const [T1, setT1] = useState(500)
  const [T2, setT2] = useState(200)
  const [mu, setMu] = useState(0.3)
  const [betaDeg, setBetaDeg] = useState(180)
  const beta = (betaDeg * Math.PI) / 180

  let r: ReturnType<typeof beltFriction> | null = null
  let err = ''
  try {
    if ((solveFor === 'mu' || solveFor === 'beta') && T1 < T2) throw new Error('The tight side T₁ must carry at least the slack-side tension T₂.')
    r = beltFriction({ T1: solveFor === 'T1' ? undefined : T1, T2: solveFor === 'T2' ? undefined : T2, mu, beta, solveFor })
  } catch (e) { err = (e as Error).message }
  const rT1 = r?.T1 ?? NaN, rT2 = r?.T2 ?? NaN, rMu = r?.mu ?? NaN, rBetaDeg = r ? (r.beta * 180) / Math.PI : NaN
  const shown = (k: Unknown, v: number, solved: number) => (solveFor === k && Number.isFinite(solved) ? Math.round(solved * 1000) / 1000 : v)
  const answer: Record<Unknown, { value: string; unit: string }> = {
    T1: { value: f2(rT1), unit: 'N' }, T2: { value: f2(rT2), unit: 'N' }, mu: { value: f3(rMu), unit: '' }, beta: { value: f2(rBetaDeg), unit: '°' },
  }

  return (
    <WorkspacePage title="Belt Friction" badges={['Dynamics', 'Capstan equation']}
      intro="A flat belt or rope wrapped round a fixed drum, on the point of slipping: the tight side holds e^(μβ) times the slack side. Pick the unknown — either tension, the coefficient or the wrap angle."
      inputs={<>
        <InputGroup title="Unknown">
          <div className="col-span-2">
            <Pick label="Solve for" value={solveFor} onChange={(v) => setSolveFor(v as Unknown)}
              options={[['T1', 'Tight side T₁'], ['T2', 'Slack side T₂'], ['mu', 'Coefficient μ'], ['beta', 'Wrap angle β']]} />
          </div>
        </InputGroup>
        <InputGroup title="Belt and drum">
          <Num label="Tight side T₁" unit="N" value={shown('T1', T1, rT1)} onChange={setT1} min={0} step="10" disabled={solveFor === 'T1'} />
          <Num label="Slack side T₂" unit="N" value={shown('T2', T2, rT2)} onChange={setT2} min={0} step="10" disabled={solveFor === 'T2'} />
          <Num label="Coefficient μ" value={shown('mu', mu, rMu)} onChange={setMu} min={0} step="0.05" disabled={solveFor === 'mu'} />
          <Num label="Wrap angle β" unit="°" value={shown('beta', betaDeg, rBetaDeg)} onChange={setBetaDeg} min={0} step="15" disabled={solveFor === 'beta'} />
        </InputGroup>
      </>}
      checks={r ? <>
        <CheckCard title={LABEL[solveFor].replace(/^./, (c) => c.toUpperCase())} basis="belt about to slip" status="info"
          value={answer[solveFor].value} unit={answer[solveFor].unit} formula="T₁ = T₂·e^(μβ)"
          pairs={[{ label: 'Ratio T₁/T₂', value: f3(r.ratio) }, { label: 'μβ', value: f3(r.mu * r.beta) }]} />
        <CheckCard title="Tension difference" basis="what the drum's friction carries" status="info" value={f2(r.T1 - r.T2)} unit="N" formula="T₁ − T₂"
          pairs={[{ label: 'T₁', value: `${f2(r.T1)} N` }, { label: 'T₂', value: `${f2(r.T2)} N` }]} />
      </> : (
        <CheckCard title="No solution" basis={`solving for ${LABEL[solveFor]}`} status="warn" pillLabel="CHECK" value="—" formula={err} />
      )}
      summary={[
        { label: 'Solve for', value: LABEL[solveFor] },
        { label: 'T₁ / T₂', value: r ? `${f2(r.T1)} / ${f2(r.T2)} N` : '—' },
        { label: 'Coefficient μ', value: r ? f3(r.mu) : '—' },
        { label: 'Wrap angle β', value: r ? `${f2(rBetaDeg)}° (${f3(r.beta)} rad)` : '—' },
      ]}
      drawing={r ? { title: 'Belt on the drum', node: <BeltSketch betaDeg={rBetaDeg} T1={r.T1} T2={r.T2} /> } : undefined}
      results={[
        { check: LABEL[solveFor], basis: 'T₁ = T₂e^(μβ)', demand: r ? `${answer[solveFor].value} ${answer[solveFor].unit}`.trim() : '—', status: r ? 'info' : 'warn' },
        { check: 'Tension ratio', basis: 'e^(μβ)', demand: r ? f3(r.ratio) : '—', status: r ? 'info' : 'warn' },
      ]}
      steps={r ? [
        { title: 'Capstan equation', lines: [
          { tex: `\\frac{T_1}{T_2} = e^{\\mu\\beta} = e^{${f3(r.mu)}\\times${f3(r.beta)}} = ${f3(r.ratio)}` },
          { tex: `T_1 = ${f2(r.T1)}\\ \\text{N} \\qquad T_2 = ${f2(r.T2)}\\ \\text{N} \\qquad \\beta = ${f2(rBetaDeg)}^\\circ` },
          { text: 'The ratio grows exponentially with the wrap: each extra half turn multiplies the holding power by e^(πμ). β is in radians inside the exponent.' },
        ] },
      ] : [{ title: 'No solution', lines: [{ text: err }] }]}
      references={[
        { topic: 'Belt friction', basis: 'T₁ = T₂·e^(μβ), flat belt or rope on a fixed drum at impending slip', source: 'Statics — belt friction' },
      ]}
    />
  )
}
