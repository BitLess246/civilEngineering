import { useState } from 'react'
import { projectile } from '../engine/dynamics'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { TrajectorySketch } from '../components/dynamicsSketches'
import { f2, f3 } from '../lib/influenceStyle'

// Projectile motion under constant gravity, no air resistance
// (engine/dynamics.ts · projectile). SI.

export default function ProjectileMotion() {
  const [u, setU] = useState(20)
  const [theta, setTheta] = useState(45)
  const [y0, setY0] = useState(0)
  const [g, setG] = useState(9.81)
  const r = projectile({ u, thetaDeg: theta, y0, g })
  const ux = u * Math.cos((theta * Math.PI) / 180), uy = u * Math.sin((theta * Math.PI) / 180)

  return (
    <WorkspacePage title="Projectile Motion" badges={['Dynamics', 'Kinematics']}
      intro="A body launched at speed u and angle θ from height y₀, under gravity alone: time of flight, maximum height, range and how it lands."
      inputs={<>
        <InputGroup title="Launch">
          <Num label="Launch speed u" unit="m/s" value={u} onChange={setU} min={0.1} step="1" />
          <Num label="Angle θ" unit="°" value={theta} onChange={setTheta} min={-89} max={89} step="5" />
          <Num label="Launch height y₀" unit="m" value={y0} onChange={setY0} min={0} step="1" />
          <Num label="Gravity g" unit="m/s²" value={g} onChange={setG} min={0.1} step="0.01" />
        </InputGroup>
      </>}
      checks={<>
        <CheckCard title="Range" basis={`u ${f2(u)} m/s at ${f2(theta)}°`} status="info" value={f2(r.range)} unit="m" formula="R = uₓ·T"
          pairs={[{ label: 'Time of flight T', value: `${f3(r.timeOfFlight)} s` }, { label: 'Horizontal uₓ', value: `${f2(ux)} m/s` }]} />
        <CheckCard title="Maximum height" basis="above the landing level" status="info" value={f2(r.maxHeight)} unit="m" formula="H = y₀ + u_y² / 2g"
          pairs={[{ label: 'Vertical u_y', value: `${f2(uy)} m/s` }, { label: 'Time to apex', value: `${f3(Math.max(0, uy / g))} s` }]} />
        <CheckCard title="Impact" basis="at the landing level" status="info" value={f2(r.impactSpeed)} unit="m/s" formula="v = √(uₓ² + v_y²)"
          pairs={[{ label: 'Angle below horizontal', value: `${f2(r.impactAngleDeg)}°` }, { label: 'Path y = Ax² + Bx + C', value: `A ${r.trajectory.A.toExponential(2)}` }]} />
      </>}
      summary={[
        { label: 'Launch speed u', value: `${f2(u)} m/s` }, { label: 'Angle θ', value: `${f2(theta)}°` },
        { label: 'Launch height y₀', value: `${f2(y0)} m` }, { label: 'Gravity g', value: `${f2(g)} m/s²` },
      ]}
      drawing={{ title: 'Trajectory', node: <TrajectorySketch A={r.trajectory.A} B={r.trajectory.B} C={r.trajectory.C} range={r.range} hMax={r.maxHeight} /> }}
      results={[
        { check: 'Time of flight T', basis: 'y(T) = 0', demand: `${f3(r.timeOfFlight)} s`, status: 'info' },
        { check: 'Maximum height H', basis: 'y₀ + u_y²/2g', demand: `${f2(r.maxHeight)} m`, status: 'info' },
        { check: 'Range R', basis: 'uₓ·T', demand: `${f2(r.range)} m`, status: 'info' },
        { check: 'Impact speed', basis: '√(uₓ² + v_y²)', demand: `${f2(r.impactSpeed)} m/s`, status: 'info' },
      ]}
      steps={[
        { title: 'Components', lines: [
          { tex: `u_x = u\\cos\\theta = ${f2(ux)}\\ \\text{m/s} \\qquad u_y = u\\sin\\theta = ${f2(uy)}\\ \\text{m/s}` },
        ] },
        { title: 'Flight', lines: [
          { tex: `0 = y_0 + u_y T - \\tfrac12 g T^2 \\Rightarrow T = \\frac{u_y + \\sqrt{u_y^2 + 2 g y_0}}{g} = ${f3(r.timeOfFlight)}\\ \\text{s}` },
          { tex: `R = u_x T = ${f2(r.range)}\\ \\text{m} \\qquad H = y_0 + \\frac{u_y^2}{2g} = ${f2(r.maxHeight)}\\ \\text{m}` },
          { text: 'From level ground the range peaks at 45°; a launch from a height peaks a little below it.' },
        ] },
      ]}
      references={[
        { topic: 'Projectile', basis: 'x = uₓt; y = y₀ + u_y t − ½gt²; no air resistance', source: 'Kinematics of particles' },
      ]}
    />
  )
}
