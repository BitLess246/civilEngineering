import { useState } from 'react'
import { accelTilt, accelPressure, rotationRise, GAMMA_W } from '../engine/hydrostatics'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { VesselsSketch } from '../components/fluidSketches'
import { f2, f3 } from '../lib/influenceStyle'

// Relative equilibrium — liquid moving as a rigid body with its container:
// tanθ = ax/g, p = ρ(g + az)h, z = ω²r²/2g (engine/hydrostatics.ts).

export default function RelativeEquilibrium() {
  const [ax, setAx] = useState(3)
  const [az, setAz] = useState(2)
  const [h, setH] = useState(2)
  const [omega, setOmega] = useState(3)
  const [r, setR] = useState(1)
  const tilt = accelTilt(ax)
  const p = accelPressure(h, az)
  const rise = rotationRise(omega, r)

  return (
    <WorkspacePage title="Accelerating & Rotating Vessels" badges={['Hydrostatics', 'Relative equilibrium']}
      intro="Liquid moving as a rigid body with its container: a horizontal acceleration tilts the free surface, a vertical one changes the effective gravity, and spinning shapes the surface into a paraboloid."
      inputs={<>
        <InputGroup title="Linear acceleration">
          <Num label="Horizontal ax" unit="m/s²" value={ax} onChange={setAx} step="0.5" />
          <Num label="Vertical az (+ up)" unit="m/s²" value={az} onChange={setAz} step="0.5" />
          <div className="col-span-2"><Num label="Depth h below the surface" unit="m" value={h} onChange={setH} min={0} step="0.5" /></div>
        </InputGroup>
        <InputGroup title="Rotation">
          <Num label="Spin ω" unit="rad/s" value={omega} onChange={setOmega} min={0} step="0.5" />
          <Num label="Radius r" unit="m" value={r} onChange={setR} min={0} step="0.5" />
        </InputGroup>
      </>}
      checks={<>
        <CheckCard title="Surface tilt" basis={`ax = ${f2(ax)} m/s²`} status="info"
          value={f2(tilt.thetaDeg)} unit="°" formula="tanθ = ax / g"
          pairs={[{ label: 'tanθ', value: f3(tilt.tanTheta) }, { label: 'Rise per metre', value: `${f3(tilt.tanTheta)} m/m` }]} />
        <CheckCard title="Pressure at depth" basis={`h = ${f2(h)} m · az = ${f2(az)} m/s²`} status="info"
          value={f2(p)} unit="kPa" formula="p = ρ(g + az)·h"
          pairs={[{ label: 'At rest γh', value: `${f2(GAMMA_W * h)} kPa` }, { label: 'Factor (g+az)/g', value: f3((9.81 + az) / 9.81) }]} />
        <CheckCard title="Rim rise" basis={`ω ${f2(omega)} rad/s · r ${f2(r)} m`} status="info"
          value={f3(rise)} unit="m" formula="z = ω²r² / 2g"
          pairs={[{ label: 'Rim speed ωr', value: `${f2(omega * r)} m/s` }, { label: 'Center drop (open tank)', value: `${f3(rise / 2)} m` }]} />
      </>}
      summary={[
        { label: 'Horizontal ax', value: `${f2(ax)} m/s²` }, { label: 'Vertical az', value: `${f2(az)} m/s²` },
        { label: 'Depth h', value: `${f2(h)} m` }, { label: 'Spin ω', value: `${f2(omega)} rad/s` }, { label: 'Radius r', value: `${f2(r)} m` },
      ]}
      drawing={{ title: 'Free surfaces', node: <VesselsSketch tiltDeg={tilt.thetaDeg} rise={rise} r={r} /> }}
      results={[
        { check: 'Surface tilt', basis: 'tan⁻¹(ax/g)', demand: `${f2(tilt.thetaDeg)}°`, status: 'info' },
        { check: 'Pressure at depth', basis: 'ρ(g + az)h', demand: `${f2(p)} kPa`, status: 'info' },
        { check: 'Rim rise', basis: 'ω²r²/2g', demand: `${f3(rise)} m`, status: 'info' },
      ]}
      resultsCaption="In an open cylinder that neither spills nor uncovers its base, the surface falls z/2 at the center and rises z/2 at the rim — a paraboloid holds half its cylinder's volume."
      steps={[
        { title: 'Horizontal acceleration', lines: [
          { tex: `\\tan\\theta = a_x/g = ${f2(ax)}/9.81 = ${f3(tilt.tanTheta)} \\Rightarrow \\theta = ${f2(tilt.thetaDeg)}^\\circ` },
        ] },
        { title: 'Vertical acceleration', lines: [
          { tex: `p = \\rho(g + a_z)h = \\frac{${f2(GAMMA_W)}}{9.81}(9.81 + ${f2(az)})\\times${f2(h)} = ${f2(p)}\\ \\text{kPa}` },
          { text: 'Accelerating upward adds to gravity; a free fall (az = −g) takes the pressure to zero.' },
        ] },
        { title: 'Rotation', lines: [
          { tex: `z = \\frac{\\omega^2 r^2}{2g} = \\frac{${f2(omega)}^2\\times${f2(r)}^2}{19.62} = ${f3(rise)}\\ \\text{m}` },
        ] },
      ]}
      references={[
        { topic: 'Linear acceleration', basis: 'tanθ = ax/g; p = ρ(g + az)h', source: 'Relative equilibrium' },
        { topic: 'Rotation', basis: 'Forced vortex: z = ω²r²/2g', source: 'Relative equilibrium' },
      ]}
    />
  )
}
