import { useState } from 'react'
import { stoppingSightDistance, type SSDResult } from '../engine/geometricDesign'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { SSDBar } from '../components/highwaySketches'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// Stopping sight distance — reaction piece plus braking piece with the grade
// correction (engine/geometricDesign.ts · AASHTO Green Book). V in km/h, m.

export default function SightDistance() {
  const [V, setV] = useState(100)
  const [t, setT] = useState(2.5)
  const [f, setF] = useState(0.35)
  const [gradePct, setGradePct] = useState(0)

  let res: SSDResult | null = null
  let err = ''
  try { res = stoppingSightDistance({ V, t, f, grade: gradePct / 100 }) } catch (e) { err = (e as Error).message }
  const steps: SolutionStep[] = res ? [
    {
      title: 'Perception–brake reaction distance',
      lines: [
        { tex: `d_r = 0.278\\,V\\,t = 0.278\\times ${f2(V)}\\times ${f2(t)} = ${f3(res.reaction)}\\text{ m}` },
        { text: '0.278 converts km/h to m/s; t = 2.5 s is the AASHTO design reaction time — about the 90th-percentile driver, not the average one.' },
      ],
    },
    {
      title: 'Braking distance',
      lines: [
        { tex: `d_b = \\frac{V^2}{254\\,(f \\pm G)} = \\frac{${f2(V)}^2}{254\\times(${f2(f)} ${gradePct >= 0 ? '+' : '−'} ${f2(Math.abs(gradePct) / 100)})} = ${f3(res.braking)}\\text{ m}` },
        { text: `Grade G = ${f2(gradePct)}% ${gradePct > 0 ? 'upgrade — gravity assists, the distance shortens' : gradePct < 0 ? 'downgrade — gravity works against the brakes, the distance lengthens' : '— level grade'}. The 254 folds 2g and the km/h²→m conversion into one constant.` },
      ],
    },
    {
      title: 'Stopping sight distance',
      lines: [
        { tex: `SSD = d_r + d_b = ${f3(res.reaction)} + ${f3(res.braking)} = ${f3(res.total)}\\text{ m}` },
        { text: `At ${f2(V)} km/h the driver needs ${f3(res.reaction)} m of sight just to react plus ${f3(res.braking)} m to brake — ${f3(res.total)} m of unobstructed road, the number every crest, sag and sight-line check is judged against.` },
      ],
    },
  ] : [{ title: 'Check the inputs', lines: [{ text: err }] }]

  return (
    <WorkspacePage title="Stopping Sight Distance" badges={['Highway design', 'AASHTO']}
      intro="The distance a driver covers from seeing an object to a full stop: the reaction time at design speed, then the braking distance governed by friction and grade. Vertical curves and horizontal sight lines are checked against this number."
      inputs={<>
        <InputGroup title="Design conditions" hint="f = 0.35 is the AASHTO design value (wet pavement, hard braking).">
          <Num label="Design speed V" unit="km/h" value={V} onChange={setV} min={20} max={130} step="5" />
          <Num label="Reaction time t" unit="s" value={t} onChange={setT} min={1} max={4} step="0.1" />
          <Num label="Friction f" value={f} onChange={setF} min={0.05} max={0.5} step="0.01" />
          <Num label="Grade G" unit="%" value={gradePct} onChange={setGradePct} min={-12} max={12} step="0.5" hint="+ upgrade, − downgrade" />
        </InputGroup>
      </>}
      checks={res ? <>
        <CheckCard title="Stopping sight distance" basis={`${f2(V)} km/h, G ${f2(gradePct)}%`} status="info" value={f3(res.total)} unit="m" formula="SSD = 0.278Vt + V²/254(f ± G)"
          pairs={[{ label: 'Reaction dᵣ', value: `${f3(res.reaction)} m` }, { label: 'Braking d_b', value: `${f3(res.braking)} m` }]} />
        <CheckCard title="Reaction share" basis={`t = ${f2(t)} s`} status="info" value={f2((res.reaction / res.total) * 100)} unit="% of SSD" formula="dᵣ = 0.278 V t"
          pairs={[{ label: 'Speed', value: `${f2(V / 3.6)} m/s` }, { label: 'Braking share', value: `${f2((res.braking / res.total) * 100)} %` }]} />
      </> : (
        <CheckCard title="Check the inputs" basis="f + G must stay positive" status="warn" pillLabel="CHECK" value="—" formula={err} />
      )}
      summary={[
        { label: 'Design speed V', value: `${f2(V)} km/h` }, { label: 'Reaction time t', value: `${f2(t)} s` },
        { label: 'Friction f', value: f2(f) }, { label: 'Grade G', value: `${f2(gradePct)} %` },
      ]}
      drawing={res ? { title: 'Distance composition', node: <div data-pdf-drawing><SSDBar res={res} V={V} t={t} f={f} gradePct={gradePct} /></div> } : undefined}
      results={res ? [
        { check: 'Reaction distance', basis: '0.278 V t', demand: `${f3(res.reaction)} m`, status: 'info' },
        { check: 'Braking distance', basis: 'V²/254(f ± G)', demand: `${f3(res.braking)} m`, status: 'info' },
        { check: 'Stopping sight distance', basis: 'dᵣ + d_b', demand: `${f3(res.total)} m`, status: 'info' },
      ] : [{ check: 'SSD', basis: err, demand: '—', status: 'warn' }]}
      steps={steps}
      references={[
        { topic: 'Stopping sight distance', basis: 'SSD = 0.278 V t + V²/254(f ± G); V in km/h, distances in m', source: 'AASHTO Green Book §3.2.2' },
        { topic: 'Design values', basis: 't = 2.5 s brake reaction; f ≈ 0.35 wet pavement', source: 'AASHTO Green Book §3.2.2' },
      ]}
    />
  )
}
