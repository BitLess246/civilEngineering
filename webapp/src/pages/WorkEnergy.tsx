import { useState } from 'react'
import { workEnergy } from '../engine/dynamics'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { EnergyBarsSketch } from '../components/dynamicsSketches'
import { f2, f3 } from '../lib/influenceStyle'

// Work–energy: ΔKE = W + Wnc − ΔPE (engine/dynamics.ts · workEnergy). SI.

export default function WorkEnergy() {
  const [mode, setMode] = useState<'v2' | 'W'>('v2')
  const [m, setM] = useState(2)
  const [v1, setV1] = useState(3)
  const [v2, setV2] = useState(7)
  const [W, setW] = useState(40)
  const [Wnc, setWnc] = useState(0)
  const [dPE, setDPE] = useState(0)

  let r: { v2: number; Wnet: number; deltaKE: number } | null = null
  let err = ''
  try {
    r = mode === 'W'
      ? workEnergy({ m, v1, Wnet: W, Wnc, deltaPE: dPE })
      : workEnergy({ m, v1, v2, Wnc, deltaPE: dPE })
  } catch (e) { err = (e as Error).message }
  const KE1 = 0.5 * m * v1 * v1
  const KE2 = r ? 0.5 * m * r.v2 * r.v2 : NaN

  return (
    <WorkspacePage title="Work–Energy" badges={['Dynamics', 'Energy methods']}
      intro="Kinetic energy changes by the work done on a body: ΔKE = W + Wnc − ΔPE, with W the work of other applied forces, Wnc the non-conservative work (friction is negative) and ΔPE the rise in potential energy."
      inputs={<>
        <InputGroup title="Solve for">
          <div className="col-span-2">
            <Pick label="Unknown" value={mode} onChange={(v) => setMode(v as 'v2' | 'W')}
              options={[['W', 'Final speed v₂ (work given)'], ['v2', 'Work W (final speed given)']]} />
          </div>
        </InputGroup>
        <InputGroup title="Body">
          <Num label="Mass m" unit="kg" value={m} onChange={setM} min={0.001} step="0.5" />
          <Num label="Initial speed v₁" unit="m/s" value={v1} onChange={setV1} min={0} step="0.5" />
          {mode === 'v2'
            ? <Num label="Final speed v₂" unit="m/s" value={v2} onChange={setV2} min={0} step="0.5" />
            : <Num label="Work W (other forces)" unit="J" value={W} onChange={setW} step="1" />}
        </InputGroup>
        <InputGroup title="Other energy terms">
          <Num label="Non-conservative Wnc" unit="J" value={Wnc} onChange={setWnc} step="1" />
          <Num label="Rise in PE, ΔPE" unit="J" value={dPE} onChange={setDPE} step="1" />
        </InputGroup>
      </>}
      checks={r ? <>
        <CheckCard title={mode === 'W' ? 'Final speed' : 'Work of other forces'} basis={`${f2(m)} kg from ${f2(v1)} m/s`} status="info"
          value={mode === 'W' ? f3(r.v2) : f2(r.Wnet)} unit={mode === 'W' ? 'm/s' : 'J'} formula="ΔKE = W + Wnc − ΔPE"
          pairs={[{ label: 'ΔKE', value: `${f2(r.deltaKE)} J` }, { label: 'KE₂', value: `${f2(KE2)} J` }]} />
        <CheckCard title="Kinetic energy" basis="before and after" status="info" value={f2(r.deltaKE)} unit="J change" formula="KE = ½mv²"
          pairs={[{ label: 'KE₁', value: `${f2(KE1)} J` }, { label: 'KE₂', value: `${f2(KE2)} J` }]} />
      </> : (
        <CheckCard title="No real final speed" basis="the energy runs out" status="warn" pillLabel="CHECK" value="—" formula={err || 'KE₂ would be negative: the body stops before the given work is done.'} />
      )}
      summary={[
        { label: 'Mass m', value: `${f2(m)} kg` }, { label: 'Initial speed v₁', value: `${f2(v1)} m/s` },
        { label: mode === 'W' ? 'Work W' : 'Final speed v₂', value: mode === 'W' ? `${f2(W)} J` : `${f2(v2)} m/s` },
        { label: 'Non-conservative Wnc', value: `${f2(Wnc)} J` }, { label: 'Rise in PE ΔPE', value: `${f2(dPE)} J` },
      ]}
      drawing={r ? { title: 'Energy balance', node: (
        <EnergyBarsSketch bars={[{ label: 'KE₁', value: KE1 }, { label: 'W', value: r.Wnet }, { label: 'Wnc', value: Wnc }, { label: '−ΔPE', value: -dPE }, { label: 'KE₂', value: KE2 }]} />
      ) } : undefined}
      results={[
        { check: 'Change in KE', basis: '½m(v₂² − v₁²)', demand: r ? `${f2(r.deltaKE)} J` : '—', status: r ? 'info' : 'warn' },
        { check: mode === 'W' ? 'Final speed v₂' : 'Work W', basis: 'ΔKE = W + Wnc − ΔPE', demand: r ? (mode === 'W' ? `${f3(r.v2)} m/s` : `${f2(r.Wnet)} J`) : '—', status: r ? 'info' : 'warn' },
      ]}
      steps={r ? [
        { title: 'Energy balance', lines: [
          { tex: `\\Delta KE = W + W_{nc} - \\Delta PE` },
          mode === 'W'
            ? { tex: `\\Delta KE = ${f2(W)} + ${f2(Wnc)} - ${f2(dPE)} = ${f2(r.deltaKE)}\\ \\text{J} \\Rightarrow v_2 = \\sqrt{v_1^2 + \\tfrac{2\\Delta KE}{m}} = ${f3(r.v2)}\\ \\text{m/s}` }
            : { tex: `\\Delta KE = \\tfrac12 m(v_2^2 - v_1^2) = ${f2(r.deltaKE)}\\ \\text{J} \\Rightarrow W = \\Delta KE - W_{nc} + \\Delta PE = ${f2(r.Wnet)}\\ \\text{J}` },
          { text: 'A body that rises (ΔPE > 0) gives up kinetic energy for it; friction (Wnc < 0) takes the rest as heat.' },
        ] },
      ] : [{ title: 'No real final speed', lines: [{ text: err || 'The body stops before the given work is done.' }] }]}
      references={[
        { topic: 'Work–energy', basis: 'ΔKE = W + Wnc − ΔPE; equivalently Wnc = ΔKE + ΔPE when no other force works', source: 'Kinetics — energy methods' },
      ]}
    />
  )
}
