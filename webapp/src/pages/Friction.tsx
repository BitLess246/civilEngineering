import { useState } from 'react'
import { friction } from '../engine/dynamics'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { InclineSketch } from '../components/dynamicsSketches'
import { statusOf } from '../lib/checkStatus'
import { f2, f3 } from '../lib/influenceStyle'

// Dry friction on a horizontal or inclined plane: does the block hold, and if
// not, how fast does it slide? (engine/dynamics.ts · friction). SI.

export default function Friction() {
  const [m, setM] = useState(10)
  const [muS, setMuS] = useState(0.5)
  const [muK, setMuK] = useState(0.3)
  const [theta, setTheta] = useState(30)
  const [F, setF] = useState(50)
  const [state, setState] = useState<'static' | 'sliding'>('static')
  const r = friction({ m, mu_s: muS, mu_k: muK, thetaDeg: theta, F_applied: F, motion: state })
  const Wpar = m * 9.81 * Math.sin((theta * Math.PI) / 180)
  const needed = Math.abs(F - Wpar)
  const ratio = r.F_friction_max > 0 ? needed / r.F_friction_max : Infinity
  const sliding = r.motion === 'sliding'

  return (
    <WorkspacePage title="Friction" badges={['Dynamics', 'Dry friction']}
      intro="A block on a horizontal or inclined plane with a force along the slope: whether static friction can hold it, and if it slides, the kinetic friction and the acceleration."
      inputs={<>
        <InputGroup title="Block and plane">
          <Num label="Mass m" unit="kg" value={m} onChange={setM} min={0.001} step="1" />
          <Num label="Incline θ" unit="°" value={theta} onChange={setTheta} min={0} max={89} step="5" />
          <Num label="Force F (+ up the slope)" unit="N" value={F} onChange={setF} step="5" />
          <Pick label="Starting from" value={state} onChange={(v) => setState(v as 'static' | 'sliding')}
            options={[['static', 'Rest'], ['sliding', 'Already sliding']]} />
        </InputGroup>
        <InputGroup title="Coefficients">
          <Num label="Static μₛ" value={muS} onChange={setMuS} min={0} step="0.05" />
          <Num label="Kinetic μₖ" value={muK} onChange={setMuK} min={0} step="0.05" />
        </InputGroup>
      </>}
      checks={<>
        <CheckCard title="Does it hold?" basis={state === 'sliding' ? 'already sliding — kinetic friction' : 'friction needed vs μₛN available'}
          status={sliding ? 'fail' : statusOf(ratio)} pillLabel={sliding ? 'SLIDES' : 'HOLDS'}
          value={f2(needed)} unit="N needed" formula="|F − W sinθ| ≤ μₛ·N to hold"
          ratio={state === 'sliding' ? undefined : ratio} ratioLabel="Friction used"
          pairs={[{ label: 'Available μₛN', value: `${f2(r.F_friction_max)} N` }, { label: 'Normal N', value: `${f2(r.N)} N` }]} />
        <CheckCard title="Acceleration" basis={sliding ? `kinetic friction ${f2(Math.abs(r.F_friction))} N` : 'friction balances the load'} status="info"
          value={f3(r.a)} unit="m/s²" formula="a = (F − W sinθ + Ff) / m"
          pairs={[{ label: 'Friction acting', value: `${f2(r.F_friction)} N` }, { label: 'Net force', value: `${f2(r.F_net)} N` }]} />
      </>}
      summary={[
        { label: 'Mass m', value: `${f2(m)} kg` }, { label: 'Incline θ', value: `${f2(theta)}°` },
        { label: 'Force F', value: `${f2(F)} N` }, { label: 'μₛ / μₖ', value: `${f2(muS)} / ${f2(muK)}` },
        { label: 'Weight along slope', value: `${f2(Wpar)} N` }, { label: 'Starting from', value: state === 'static' ? 'rest' : 'sliding' },
      ]}
      drawing={{ title: 'Forces on the block', node: <InclineSketch thetaDeg={theta} F={F} Ff={r.F_friction} sliding={sliding} /> }}
      results={[
        { check: 'Friction needed', basis: '|F − W sinθ|', demand: `${f2(needed)} N`, limit: `${f2(r.F_friction_max)} N`, ratio: state === 'sliding' ? undefined : ratio, status: sliding ? 'fail' : statusOf(ratio) },
        { check: 'Friction acting', basis: sliding ? 'μₖN, opposing motion' : 'static, balancing', demand: `${f2(r.F_friction)} N`, status: 'info' },
        { check: 'Acceleration', basis: 'ΣF / m', demand: `${f3(r.a)} m/s²`, status: 'info' },
      ]}
      resultsCaption="FAIL here means the block slides — static friction cannot supply what holding it needs."
      steps={[
        { title: 'Normal force and available friction', lines: [
          { tex: `N = mg\\cos\\theta = ${f2(m)}\\times9.81\\times\\cos${f2(theta)}^\\circ = ${f2(r.N)}\\ \\text{N} \\qquad \\mu_s N = ${f2(r.F_friction_max)}\\ \\text{N}` },
        ] },
        { title: 'Does it hold?', lines: [
          { tex: `|F - mg\\sin\\theta| = |${f2(F)} - ${f2(Wpar)}| = ${f2(needed)}\\ \\text{N} ${needed <= r.F_friction_max ? '\\le' : '>'} ${f2(r.F_friction_max)}\\ \\text{N}` },
          { text: sliding
            ? 'Static friction cannot supply that much, so the block slides and kinetic friction μₖN acts against the motion.'
            : 'Static friction supplies exactly what is needed — no more — and the block stays put.' },
        ] },
        { title: 'Acceleration', lines: [
          { tex: `a = \\frac{F - mg\\sin\\theta + F_f}{m} = \\frac{${f2(F)} - ${f2(Wpar)} + (${f2(r.F_friction)})}{${f2(m)}} = ${f3(r.a)}\\ \\text{m/s}^2` },
        ] },
      ]}
      references={[
        { topic: 'Dry (Coulomb) friction', basis: 'Static Ff ≤ μₛN; once sliding Ff = μₖN, opposing the motion', source: 'Statics and dynamics — friction' },
      ]}
    />
  )
}
