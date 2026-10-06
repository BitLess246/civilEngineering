import { useState } from 'react'
import { bernoulli } from '../engine/hydraulics'
import { GAMMA_W } from '../engine/hydrostatics'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { EnergyLineSketch } from '../components/fluidSketches'
import { f2, f3 } from '../lib/influenceStyle'

// The energy equation between two points of a flow, with pump and turbine
// heads and the head loss (engine/hydraulics.ts · bernoulli). Pressures in kPa
// at the page edge, Pa inside the engine.

type Unknown = 'p2' | 'v2' | 'z2' | 'hL' | 'hP' | 'hT'
const LABEL: Record<Unknown, string> = { p2: 'pressure p₂', v2: 'velocity v₂', z2: 'elevation z₂', hL: 'head loss hL', hP: 'pump head hP', hT: 'turbine head hT' }
const TEX: Record<Unknown, string> = { p2: 'p_2', v2: 'v_2', z2: 'z_2', hL: 'h_L', hP: 'h_P', hT: 'h_T' }
const round = (x: number) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : 0)

export default function EnergyEquation() {
  const [solveFor, setSolveFor] = useState<Unknown>('p2')
  const [p1, setP1] = useState(200)
  const [v1, setV1] = useState(2)
  const [z1, setZ1] = useState(10)
  const [p2, setP2] = useState(150)
  const [v2, setV2] = useState(4)
  const [z2, setZ2] = useState(12)
  const [hL, setHL] = useState(0.5)
  const [hP, setHP] = useState(0)
  const [hT, setHT] = useState(0)

  // only the KNOWN quantities go in; the unknown is the engine's to return
  const known = <T,>(k: Unknown, v: T): T | undefined => (solveFor === k ? undefined : v)
  let r: ReturnType<typeof bernoulli>
  let ok = true
  try {
    r = bernoulli({ p1: p1 * 1000, v1, z1, p2: known('p2', p2 * 1000), v2: known('v2', v2), z2: known('z2', z2),
      hL: known('hL', hL), hP: known('hP', hP), hT: known('hT', hT), solveFor })
  } catch {
    ok = false   // v₂² < 0: the flow cannot reach point 2 with this much energy
    r = { p2: p2 * 1000, v2: 0, z2, hL, hP, hT, head1: NaN, head2: NaN }
  }
  const lossNegative = ok && solveFor === 'hL' && r.hL < 0
  const g = 9.81
  const H1 = p1 / GAMMA_W + (v1 * v1) / (2 * g) + z1
  // total head at 2 from the FINAL p₂, v₂, z₂ (the engine's head2 is a working quantity)
  const H2 = r.p2 / (GAMMA_W * 1000) + (r.v2 * r.v2) / (2 * g) + r.z2
  const answer = !ok ? { value: '—', unit: 'no real v₂' }
    : solveFor === 'p2' ? { value: f2(r.p2 / 1000), unit: 'kPa' }
    : solveFor === 'v2' ? { value: f3(r.v2), unit: 'm/s' }
    : { value: f3(r[solveFor]), unit: 'm' }
  const field = (k: Unknown, label: string, unit: string, v: number, set: (x: number) => void, shown: number, min?: number, step = '0.5') => (
    <Num label={label} unit={unit} value={solveFor === k ? round(shown) : v} onChange={set} disabled={solveFor === k} min={min} step={step} />
  )

  return (
    <WorkspacePage title="Energy Equation" badges={['Hydraulics', 'Bernoulli']}
      intro="Total head between two points of a flow — pressure, velocity and elevation heads — with the head a pump adds, a turbine takes and friction loses. Pick the unknown; its field is computed."
      inputs={<>
        <InputGroup title="Unknown">
          <div className="col-span-2">
            <Pick label="Solve for" value={solveFor} onChange={(v) => setSolveFor(v as Unknown)}
              options={[['p2', 'Pressure p₂'], ['v2', 'Velocity v₂'], ['z2', 'Elevation z₂'], ['hL', 'Head loss hL'], ['hP', 'Pump head hP'], ['hT', 'Turbine head hT']]} />
          </div>
        </InputGroup>
        <InputGroup title="Point 1">
          <Num label="Pressure p₁" unit="kPa" value={p1} onChange={setP1} step="1" />
          <Num label="Velocity v₁" unit="m/s" value={v1} onChange={setV1} min={0} step="0.1" />
          <Num label="Elevation z₁" unit="m" value={z1} onChange={setZ1} step="0.5" />
        </InputGroup>
        <InputGroup title="Point 2">
          {field('p2', 'Pressure p₂', 'kPa', p2, setP2, r.p2 / 1000, undefined, '1')}
          {field('v2', 'Velocity v₂', 'm/s', v2, setV2, r.v2, 0, '0.1')}
          {field('z2', 'Elevation z₂', 'm', z2, setZ2, r.z2)}
        </InputGroup>
        <InputGroup title="Machines & losses">
          {field('hL', 'Head loss hL', 'm', hL, setHL, r.hL, 0, '0.1')}
          {field('hP', 'Pump head hP', 'm', hP, setHP, r.hP, 0)}
          {field('hT', 'Turbine head hT', 'm', hT, setHT, r.hT, 0)}
        </InputGroup>
      </>}
      checks={<>
        <CheckCard title="Answer" basis={`solving for ${LABEL[solveFor]}`} status={ok && !lossNegative ? 'info' : 'warn'}
          value={answer.value} unit={answer.unit} formula="p₁/γ + v₁²/2g + z₁ + hP = p₂/γ + v₂²/2g + z₂ + hT + hL"
          pairs={[{ label: 'Head at 1', value: `${f3(H1)} m` }, { label: 'Head at 2', value: ok ? `${f3(H2)} m` : '—' }]} />
        <CheckCard title="Energy balance" basis="H₁ + hP − hT − hL − H₂" status={ok && !lossNegative ? 'pass' : 'warn'}
          pillLabel={ok && !lossNegative ? 'BALANCED' : 'CHECK'}
          value={ok ? f3(H1 + r.hP - r.hT - r.hL - H2) : '—'} unit="m" formula="zero when the heads close"
          pairs={[{ label: 'Velocity head 1', value: `${f3((v1 * v1) / (2 * g))} m` }, { label: 'Velocity head 2', value: `${f3((r.v2 * r.v2) / (2 * g))} m` }]} />
      </>}
      summary={[
        { label: 'Point 1 p, v, z', value: `${f2(p1)} kPa · ${f2(v1)} m/s · ${f2(z1)} m` },
        { label: 'Point 2 p, v, z', value: `${f2(r.p2 / 1000)} kPa · ${f3(r.v2)} m/s · ${f2(r.z2)} m` },
        { label: 'hL · hP · hT', value: `${f3(r.hL)} · ${f3(r.hP)} · ${f3(r.hT)} m` },
        { label: 'Unit weight γ', value: `${f2(GAMMA_W)} kN/m³` },
      ]}
      drawing={{ title: 'Energy and hydraulic grade lines', node: (
        <EnergyLineSketch z1={z1} p1h={p1 / GAMMA_W} v1h={(v1 * v1) / (2 * g)} z2={r.z2} p2h={r.p2 / (GAMMA_W * 1000)} v2h={(r.v2 * r.v2) / (2 * g)} />
      ) }}
      results={[
        { check: 'Total head at 1', basis: 'p/γ + v²/2g + z', demand: `${f3(H1)} m`, status: 'info' },
        { check: 'Total head at 2', basis: 'p/γ + v²/2g + z', demand: ok ? `${f3(H2)} m` : '—', status: 'info' },
        { check: `Unknown — ${LABEL[solveFor]}`, basis: 'energy equation', demand: `${answer.value} ${answer.unit}`, status: ok && !lossNegative ? 'info' : 'warn' },
      ]}
      steps={ok ? [
        { title: 'Total head at point 1', lines: [
          { tex: `H_1 = \\frac{p_1}{\\gamma} + \\frac{v_1^2}{2g} + z_1 = \\frac{${f2(p1)}}{${f2(GAMMA_W)}} + \\frac{${f2(v1)}^2}{19.62} + ${f2(z1)} = ${f3(H1)}\\ \\text{m}` },
        ] },
        { title: `Solve for ${LABEL[solveFor]}`, lines: [
          { tex: `H_1 + h_P = H_2 + h_T + h_L \\;\\Rightarrow\\; ${f3(H1)} + ${f3(r.hP)} = ${f3(H2)} + ${f3(r.hT)} + ${f3(r.hL)}` },
          { tex: `${TEX[solveFor]} = ${answer.value}\\ \\text{${answer.unit}}` },
          { text: lossNegative
            ? 'A negative head loss means point 2 holds more energy than point 1 supplied — the flow runs the other way, or a pump is missing.'
            : 'Total head is conserved between the points once the pump adds, the turbine takes and friction loses its share.' },
        ] },
      ] : [
        { title: 'No real solution', lines: [{ text: 'With these heads, point 2 needs more energy for its pressure and elevation alone than point 1 can supply, so v₂² would be negative. Lower z₂ or p₂, or add a pump.' }] },
      ]}
      references={[
        { topic: 'Energy equation', basis: 'p₁/γ + v₁²/2g + z₁ + hP = p₂/γ + v₂²/2g + z₂ + hT + hL', source: 'Bernoulli, extended for machines and losses' },
      ]}
    />
  )
}
