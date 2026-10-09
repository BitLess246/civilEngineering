import { useState } from 'react'
import { waterJet } from '../engine/hydraulics'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { JetVaneSketch } from '../components/fluidSketches'
import { f2, f3 } from '../lib/influenceStyle'

// A water jet on a stationary or moving vane — impulse–momentum
// (engine/hydraulics.ts · waterJet). SI: N, W.

const force = (F: number) => (Math.abs(F) >= 1000 ? { value: f2(F / 1000), unit: 'kN' } : { value: f2(F), unit: 'N' })

export default function JetOnVane() {
  const [v, setV] = useState(20)
  const [d, setD] = useState(50)
  const [theta, setTheta] = useState(90)
  const [u, setU] = useState(5)
  const uEff = Math.min(u, v)
  const r = waterJet({ v, d: d / 1000, thetaDeg: theta, u: uEff })
  const Fx = force(r.F_x), Fy = force(r.F_y)

  return (
    <WorkspacePage title="Jet on a Vane" badges={['Hydraulics', 'Impulse–momentum']}
      intro="The force a water jet exerts on a vane that turns it through θ, and — when the vane moves — the power it delivers and the efficiency of the transfer."
      inputs={<>
        <InputGroup title="Jet">
          <Num label="Jet velocity v" unit="m/s" value={v} onChange={setV} min={0.1} step="1" />
          <Num label="Jet diameter d" unit="mm" value={d} onChange={setD} min={1} step="5" />
        </InputGroup>
        <InputGroup title="Vane" hint="90° is a flat plate normal to the jet; 180° turns it right round (Pelton cup).">
          <Num label="Deflection θ" unit="°" value={theta} onChange={setTheta} min={0} max={180} step="15" />
          <Num label="Vane speed u" unit="m/s" value={u} onChange={setU} min={0} step="1" />
        </InputGroup>
      </>}
      checks={<>
        <CheckCard title="Force along the jet" basis={`θ ${f2(theta)}° · relative speed ${f2(v - uEff)} m/s`} status="info"
          value={Fx.value} unit={Fx.unit} formula="Fx = ρQr(v − u)(1 − cosθ)"
          pairs={[{ label: 'Across the jet Fy', value: `${Fy.value} ${Fy.unit}` }, { label: 'Relative flow Qr', value: `${f3(r.Q * 1000)} L/s` }]} />
        <CheckCard title="Power & efficiency" basis={uEff > 0 ? `vane moving at ${f2(uEff)} m/s` : 'stationary vane — no work done'} status="info"
          value={f2(r.power / 1000)} unit="kW" formula="P = Fx·u · η = P / (½ρAv³)"
          pairs={[{ label: 'Efficiency η', value: `${f2(r.efficiency * 100)} %` }, { label: 'Best speed v/3', value: `${f2(v / 3)} m/s` }]} />
      </>}
      summary={[
        { label: 'Jet velocity v', value: `${f2(v)} m/s` }, { label: 'Jet diameter d', value: `${f2(d)} mm` },
        { label: 'Deflection θ', value: `${f2(theta)}°` }, { label: 'Vane speed u', value: `${f2(uEff)} m/s` },
        { label: 'Jet area A', value: `${f3(r.A * 1e4)} cm²` }, { label: 'Density ρ', value: '1000 kg/m³' },
      ]}
      drawing={{ title: 'Jet and vane', node: <JetVaneSketch thetaDeg={theta} Fx={r.F_x} u={uEff} /> }}
      results={[
        { check: 'Force along the jet Fx', basis: 'ρQr(v−u)(1−cosθ)', demand: `${Fx.value} ${Fx.unit}`, status: 'info' },
        { check: 'Force across the jet Fy', basis: 'ρQr(v−u)sinθ', demand: `${Fy.value} ${Fy.unit}`, status: 'info' },
        { check: 'Power delivered', basis: 'Fx·u', demand: `${f2(r.power / 1000)} kW`, status: 'info' },
        { check: 'Efficiency', basis: 'P / (½ρAv³)', demand: `${f2(r.efficiency * 100)} %`, status: 'info' },
      ]}
      resultsCaption="A single moving vane intercepts only the relative flow A(v − u); its efficiency peaks at u = v/3 — 8/27 for a flat plate, twice that for a full reversal."
      steps={[
        { title: 'Flow the vane sees', lines: [
          { tex: `A = \\tfrac{\\pi}{4}d^2 = ${f3(r.A * 1e4)}\\times10^{-4}\\ \\text{m}^2 \\qquad Q_r = A(v-u) = ${f3(r.Q)}\\ \\text{m}^3/\\text{s}` },
        ] },
        { title: 'Force', lines: [
          { tex: `F_x = \\rho Q_r (v-u)(1-\\cos\\theta) = ${f2(r.F_x)}\\ \\text{N} \\qquad F_y = \\rho Q_r (v-u)\\sin\\theta = ${f2(r.F_y)}\\ \\text{N}` },
        ] },
        { title: 'Power and efficiency', lines: [
          { tex: `P = F_x u = ${f2(r.power)}\\ \\text{W} \\qquad \\eta = \\frac{P}{\\tfrac12 \\rho A v^3} = ${f2(r.efficiency * 100)}\\%` },
        ] },
      ]}
      references={[
        { topic: 'Force on a vane', basis: 'F = ρQ(v − u)(1 − cosθ) along the jet', source: 'Impulse–momentum' },
        { topic: 'Efficiency', basis: 'η = F·u / (½ρAv³); maximum at u = v/3 for a single vane', source: 'Impulse–momentum' },
      ]}
    />
  )
}
