import { useState } from 'react'
import { curvilinear } from '../engine/dynamics'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { CurvilinearSketch } from '../components/dynamicsSketches'
import { f2, f3 } from '../lib/influenceStyle'

// Curvilinear motion in normal–tangential components: aₙ = v²/ρ, aₜ = dv/dt
// (engine/dynamics.ts · curvilinear). SI.

export default function CurvilinearMotion() {
  const [v, setV] = useState(10)
  const [rho, setRho] = useState(25)
  const [at, setAt] = useState(0)
  const r = curvilinear({ v, rho, at })

  return (
    <WorkspacePage title="Curvilinear Motion" badges={['Dynamics', 'n–t components']}
      intro="A particle moving along a curved path: the normal acceleration that turns it toward the center of curvature, the tangential one that changes its speed, and their resultant."
      inputs={<>
        <InputGroup title="Path and speed">
          <Num label="Speed v" unit="m/s" value={v} onChange={setV} min={0} step="1" />
          <Num label="Radius of curvature ρ" unit="m" value={rho} onChange={setRho} min={0.01} step="1" />
          <Num label="Tangential aₜ" unit="m/s²" value={at} onChange={setAt} step="0.5" />
        </InputGroup>
      </>}
      checks={<>
        <CheckCard title="Total acceleration" basis={`v ${f2(v)} m/s on ρ ${f2(rho)} m`} status="info" value={f3(r.a)} unit="m/s²" formula="a = √(aₜ² + aₙ²)"
          pairs={[{ label: 'Angle from tangent', value: `${f2(r.thetaDeg)}°` }, { label: 'In g', value: `${f3(r.a / 9.81)} g` }]} />
        <CheckCard title="Normal acceleration" basis="toward the center of curvature" status="info" value={f3(r.an)} unit="m/s²" formula="aₙ = v² / ρ"
          pairs={[{ label: 'Tangential aₜ', value: `${f3(r.at)} m/s²` }, { label: 'Speed v', value: `${f2(v)} m/s` }]} />
      </>}
      summary={[
        { label: 'Speed v', value: `${f2(v)} m/s` }, { label: 'Radius ρ', value: `${f2(rho)} m` }, { label: 'Tangential aₜ', value: `${f2(at)} m/s²` },
      ]}
      drawing={{ title: 'Acceleration components', node: <CurvilinearSketch at={r.at} an={r.an} rho={rho} /> }}
      results={[
        { check: 'Normal aₙ', basis: 'v²/ρ', demand: `${f3(r.an)} m/s²`, status: 'info' },
        { check: 'Tangential aₜ', basis: 'dv/dt', demand: `${f3(r.at)} m/s²`, status: 'info' },
        { check: 'Total a', basis: '√(aₜ² + aₙ²)', demand: `${f3(r.a)} m/s²`, status: 'info' },
      ]}
      steps={[
        { title: 'Components', lines: [
          { tex: `a_n = \\frac{v^2}{\\rho} = \\frac{${f2(v)}^2}{${f2(rho)}} = ${f3(r.an)}\\ \\text{m/s}^2` },
          { tex: `a = \\sqrt{a_t^2 + a_n^2} = ${f3(r.a)}\\ \\text{m/s}^2 \\qquad \\phi = \\tan^{-1}\\frac{a_n}{a_t} = ${f2(r.thetaDeg)}^\\circ` },
          { text: 'At constant speed the whole acceleration is normal — the turn — and points to the center of curvature.' },
        ] },
      ]}
      references={[
        { topic: 'Normal–tangential', basis: 'aₙ = v²/ρ; aₜ = dv/dt; a = √(aₜ² + aₙ²)', source: 'Kinematics of particles' },
      ]}
    />
  )
}
