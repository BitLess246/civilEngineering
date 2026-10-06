import { useState } from 'react'
import { impulseMomentum } from '../engine/dynamics'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { MomentumSketch } from '../components/dynamicsSketches'
import { f2, f3 } from '../lib/influenceStyle'

// Impulse–momentum: I = Δp = m(v₂ − v₁), I = F·t for a constant force
// (engine/dynamics.ts · impulseMomentum). SI.

type Mode = 'impulse' | 'v2-from-I' | 'v2-from-Ft'

export default function ImpulseMomentum() {
  const [mode, setMode] = useState<Mode>('impulse')
  const [m, setM] = useState(4)
  const [v1, setV1] = useState(2)
  const [v2, setV2] = useState(10)
  const [I, setI] = useState(32)
  const [F, setF] = useState(16)
  const [t, setT] = useState(2)
  const r = mode === 'impulse' ? impulseMomentum({ m, v1, v2 })
    : mode === 'v2-from-I' ? impulseMomentum({ m, v1, I })
    : impulseMomentum({ m, v1, Favg: F, t })
  const Favg = mode === 'v2-from-Ft' ? F : null

  return (
    <WorkspacePage title="Impulse–Momentum" badges={['Dynamics', 'Momentum methods']}
      intro="The impulse of a force changes a body's momentum: I = m(v₂ − v₁), and for a constant force I = F·t. Find the impulse from a change of speed, or the final speed from an impulse."
      inputs={<>
        <InputGroup title="Solve for">
          <div className="col-span-2">
            <Pick label="Unknown" value={mode} onChange={(v) => setMode(v as Mode)}
              options={[['impulse', 'Impulse (speeds given)'], ['v2-from-I', 'Final speed (impulse given)'], ['v2-from-Ft', 'Final speed (force × time given)']]} />
          </div>
        </InputGroup>
        <InputGroup title="Body">
          <Num label="Mass m" unit="kg" value={m} onChange={setM} min={0.001} step="0.5" />
          <Num label="Initial velocity v₁" unit="m/s" value={v1} onChange={setV1} step="0.5" />
          {mode === 'impulse' && <Num label="Final velocity v₂" unit="m/s" value={v2} onChange={setV2} step="0.5" />}
        </InputGroup>
        {mode === 'v2-from-I' && (
          <InputGroup title="Impulse"><Num label="Impulse I" unit="N·s" value={I} onChange={setI} step="1" /></InputGroup>
        )}
        {mode === 'v2-from-Ft' && (
          <InputGroup title="Force">
            <Num label="Average force F" unit="N" value={F} onChange={setF} step="1" />
            <Num label="Duration t" unit="s" value={t} onChange={setT} min={0} step="0.1" />
          </InputGroup>
        )}
      </>}
      checks={<>
        <CheckCard title={mode === 'impulse' ? 'Impulse' : 'Final velocity'} basis={`${f2(m)} kg from ${f2(v1)} m/s`} status="info"
          value={mode === 'impulse' ? f2(r.I) : f3(r.v2)} unit={mode === 'impulse' ? 'N·s' : 'm/s'} formula="I = m(v₂ − v₁)"
          pairs={[{ label: 'Momentum before', value: `${f2(m * v1)} N·s` }, { label: 'Momentum after', value: `${f2(m * r.v2)} N·s` }]} />
        {Favg !== null && (
          <CheckCard title="Impulse of the force" basis={`F ${f2(F)} N for ${f2(t)} s`} status="info" value={f2(r.I)} unit="N·s" formula="I = F·t"
            pairs={[{ label: 'Average force', value: `${f2(F)} N` }, { label: 'Duration', value: `${f3(t)} s` }]} />
        )}
      </>}
      summary={[
        { label: 'Mass m', value: `${f2(m)} kg` }, { label: 'Initial velocity v₁', value: `${f2(v1)} m/s` },
        ...(mode === 'impulse' ? [{ label: 'Final velocity v₂', value: `${f2(v2)} m/s` }] : []),
        ...(mode === 'v2-from-I' ? [{ label: 'Impulse I', value: `${f2(I)} N·s` }] : []),
        ...(mode === 'v2-from-Ft' ? [{ label: 'Force × time', value: `${f2(F)} N × ${f2(t)} s` }] : []),
      ]}
      drawing={{ title: 'Momentum before and after', node: <MomentumSketch p1={m * v1} p2={m * r.v2} I={r.I} /> }}
      results={[
        { check: 'Impulse I', basis: 'm(v₂ − v₁)', demand: `${f2(r.I)} N·s`, status: 'info' },
        { check: 'Final velocity v₂', basis: 'v₁ + I/m', demand: `${f3(r.v2)} m/s`, status: 'info' },
      ]}
      steps={[
        { title: 'Impulse–momentum', lines: [
          mode === 'impulse'
            ? { tex: `I = m(v_2 - v_1) = ${f2(m)}\\times(${f2(v2)} - ${f2(v1)}) = ${f2(r.I)}\\ \\text{N·s}` }
            : { tex: `${Favg !== null ? `I = F t = ${f2(F)}\\times${f2(t)} = ${f2(r.I)}\\ \\text{N·s} \\qquad ` : ''}v_2 = v_1 + \\frac{I}{m} = ${f2(v1)} + \\frac{${f2(r.I)}}{${f2(m)}} = ${f3(r.v2)}\\ \\text{m/s}` },
          { text: 'Momentum is a vector: a force opposing the motion gives a negative impulse and slows the body.' },
        ] },
      ]}
      references={[
        { topic: 'Impulse–momentum', basis: 'I = ∫F dt = m(v₂ − v₁); I = F·t for a constant force', source: 'Kinetics — momentum methods' },
      ]}
    />
  )
}
