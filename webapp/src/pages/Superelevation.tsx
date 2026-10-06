import { useState } from 'react'
import { superelevation, type SuperResult } from '../engine/geometricDesign'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { SuperelevationSection } from '../components/highwaySketches'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// Superelevation — the point-mass balance e + f = V²/(127R), split between
// banking and side friction, with the minimum radius and the degree of curve
// (engine/geometricDesign.ts · AASHTO). V in km/h, R in m.

export default function Superelevation() {
  const [V, setV] = useState(80)
  const [R, setR] = useState(230)
  const [eMax, setEMax] = useState(8) // percent
  const [fMax, setFMax] = useState(0.15)

  let res: SuperResult | null = null
  let err = ''
  try { res = superelevation({ V, R, eMax: eMax / 100, fMax }) } catch (e) { err = (e as Error).message }
  const steps: SolutionStep[] = res ? [
    {
      title: 'Centripetal demand',
      lines: [
        { tex: `e + f = \\frac{V^2}{127\\,R} = \\frac{${f2(V)}^2}{127\\times ${f2(R)}} = ${f3(res.demand)} \\;\\left(${f2(res.demand * 100)}\\%\\right)` },
        { text: 'The point-mass balance: the bank angle supplies e, tyre friction supplies f. The 127 folds g and unit conversions into one constant (V in km/h, R in m).' },
      ],
    },
    {
      title: 'Split between superelevation and friction',
      lines: [
        { tex: `e = \\max\\left(0,\\; \\frac{V^2}{127R} - f_{\\max}\\right) = ${f3(res.e)} \\;\\left(${f2(res.e * 100)}\\%\\right), \\qquad f = ${f3(res.f)}` },
        { text: `The friction allowance ${f2(fMax)} acts first; whatever demand it cannot carry becomes banking, capped at eMax = ${f2(eMax)}%.` },
      ],
    },
    {
      title: 'Minimum radius and degree of curve',
      lines: [
        { tex: `R_{\\min} = \\frac{V^2}{127\\,(e_{\\max}+f_{\\max})} = \\frac{${f2(V)}^2}{127\\times ${f3(eMax / 100 + fMax)}} = ${f3(res.Rmin)}\\text{ m}` },
        { tex: `D = \\frac{5729.578}{R} = ${f3(res.D)}^\\circ\\text{ per 100 m of arc}` },
        { text: res.warning ?? `R = ${f2(R)} m ≥ Rmin — the curve can carry the design speed.` },
      ],
      pass: res.ok,
    },
  ] : [{ title: 'Check the inputs', lines: [{ text: err }] }]

  return (
    <WorkspacePage title="Superelevation" badges={['Highway design', 'e + f = V²/127R']}
      intro="How much a curve must bank to carry the design speed: the centripetal demand is shared between superelevation and side friction, and the minimum radius is set by the two limits together."
      inputs={<>
        <InputGroup title="Curve">
          <Num label="Design speed V" unit="km/h" value={V} onChange={setV} min={20} max={130} step="5" />
          <Num label="Radius R" unit="m" value={R} onChange={setR} min={20} max={5000} step="10" />
        </InputGroup>
        <InputGroup title="Design limits" hint="8 % and 0.15 are the common highway defaults; urban or icy designs drop eMax to 4–6 %.">
          <Num label="Max superelevation" unit="%" value={eMax} onChange={setEMax} min={0} max={12} step="0.5" />
          <Num label="Side friction f" value={fMax} onChange={setFMax} min={0.05} max={0.3} step="0.01" />
        </InputGroup>
      </>}
      checks={res ? <>
        <CheckCard title="Minimum radius" basis={`${f2(V)} km/h at e ${f2(eMax)}%, f ${f2(fMax)}`} status={res.ok ? 'pass' : 'fail'}
          value={f2(res.Rmin)} unit="m" formula="Rmin = V²/127(eMax + fMax)" ratio={res.Rmin / R} ratioLabel="Rmin ÷ R"
          pairs={[{ label: 'Radius R', value: `${f2(R)} m` }, { label: 'Degree of curve', value: `${f3(res.D)}°` }]} />
        <CheckCard title="Superelevation" basis={res.e >= eMax / 100 - 1e-9 ? 'at the cap' : 'friction carries the rest'} status="info"
          value={f2(res.e * 100)} unit="%" formula="e = max(0, V²/127R − f)" ratio={eMax > 0 ? (res.e * 100) / eMax : undefined} ratioLabel="e ÷ eMax"
          pairs={[{ label: 'Demand e + f', value: `${f3(res.demand)}` }, { label: 'Side friction used', value: f3(res.f) }]} />
      </> : (
        <CheckCard title="Check the inputs" basis="positive speed and radius" status="warn" pillLabel="CHECK" value="—" formula={err} />
      )}
      summary={[
        { label: 'Design speed V', value: `${f2(V)} km/h` }, { label: 'Radius R', value: `${f2(R)} m` },
        { label: 'Max superelevation', value: `${f2(eMax)} %` }, { label: 'Side friction f', value: f2(fMax) },
      ]}
      drawing={res ? { title: 'Banked cross section', node: <div data-pdf-drawing><SuperelevationSection e={res.e} R={R} Rmin={res.Rmin} D={res.D} /></div> } : undefined}
      resultsCaption={res?.warning}
      results={res ? [
        { check: 'Centripetal demand', basis: 'V²/127R', demand: f3(res.demand), status: 'info' },
        { check: 'Superelevation e', basis: 'friction first, capped', demand: `${f2(res.e * 100)} %`, limit: `${f2(eMax)} %`, ratio: eMax > 0 ? (res.e * 100) / eMax : undefined, status: res.e <= eMax / 100 + 1e-9 ? 'pass' : 'fail' },
        { check: 'Side friction f', basis: 'demand − e', demand: f3(res.f), limit: f3(fMax), ratio: res.f / fMax, status: res.f <= fMax + 1e-9 ? 'pass' : 'fail' },
        { check: 'Radius', basis: 'R ≥ Rmin', demand: `${f2(R)} m`, limit: `≥ ${f2(res.Rmin)} m`, ratio: res.Rmin / R, status: res.ok ? 'pass' : 'fail' },
      ] : [{ check: 'Balance', basis: err, demand: '—', status: 'warn' }]}
      steps={steps}
      references={[
        { topic: 'Point-mass balance', basis: 'e + f = V²/127R (V in km/h, R in m)', source: 'AASHTO Green Book §3.3' },
        { topic: 'Minimum radius', basis: 'Rmin = V²/127(eMax + fMax)', source: 'AASHTO Green Book §3.3.4' },
        { topic: 'Degree of curve', basis: 'D = 5729.578/R per 100 m of arc', source: 'Route surveying' },
      ]}
    />
  )
}
