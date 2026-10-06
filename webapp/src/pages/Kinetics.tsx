import { useState } from 'react'
import { kinetics } from '../engine/dynamics'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { ForceSketch } from '../components/dynamicsSketches'
import { f2, f3 } from '../lib/influenceStyle'

// Kinetics of a particle — Newton's second law under a constant resultant
// force, then the motion it produces over t (engine/dynamics.ts · kinetics). SI.

const mag = (x: number, y: number, z: number) => Math.hypot(x, y, z)

export default function Kinetics() {
  const [m, setM] = useState(5)
  const [Fx, setFx] = useState(20)
  const [Fy, setFy] = useState(0)
  const [Fz, setFz] = useState(0)
  const [v0x, setV0x] = useState(0)
  const [v0y, setV0y] = useState(0)
  const [v0z, setV0z] = useState(0)
  const [t, setT] = useState(3)
  const r = kinetics({ m, forces: { Fx, Fy, Fz }, v0: { vx: v0x, vy: v0y, vz: v0z }, t })
  const a = mag(r.a.ax, r.a.ay, r.a.az), v = mag(r.v.vx, r.v.vy, r.v.vz), s = mag(r.s.sx, r.s.sy, r.s.sz)
  const vec = (x: number, y: number, z: number, u: string) => `(${f2(x)}, ${f2(y)}, ${f2(z)}) ${u}`

  return (
    <WorkspacePage title="Kinetics" badges={['Dynamics', 'ΣF = ma']}
      intro="A particle under a constant resultant force: its acceleration from Newton's second law, and the velocity and displacement that follow over a time interval."
      inputs={<>
        <InputGroup title="Body">
          <Num label="Mass m" unit="kg" value={m} onChange={setM} min={0.001} step="1" />
          <Num label="Time t" unit="s" value={t} onChange={setT} min={0} step="0.5" />
        </InputGroup>
        <InputGroup title="Resultant force">
          <Num label="Fx" unit="N" value={Fx} onChange={setFx} step="1" />
          <Num label="Fy" unit="N" value={Fy} onChange={setFy} step="1" />
          <Num label="Fz" unit="N" value={Fz} onChange={setFz} step="1" />
        </InputGroup>
        <InputGroup title="Initial velocity">
          <Num label="v₀x" unit="m/s" value={v0x} onChange={setV0x} step="0.5" />
          <Num label="v₀y" unit="m/s" value={v0y} onChange={setV0y} step="0.5" />
          <Num label="v₀z" unit="m/s" value={v0z} onChange={setV0z} step="0.5" />
        </InputGroup>
      </>}
      checks={<>
        <CheckCard title="Acceleration" basis={`ΣF ${f2(mag(Fx, Fy, Fz))} N on ${f2(m)} kg`} status="info" value={f3(a)} unit="m/s²" formula="a = ΣF / m"
          pairs={[{ label: 'aₓ', value: `${f3(r.a.ax)} m/s²` }, { label: 'a_y', value: `${f3(r.a.ay)} m/s²` }]} />
        <CheckCard title="Final velocity" basis={`after t = ${f2(t)} s`} status="info" value={f3(v)} unit="m/s" formula="v = v₀ + at"
          pairs={[{ label: 'vₓ', value: `${f3(r.v.vx)} m/s` }, { label: 'v_y', value: `${f3(r.v.vy)} m/s` }]} />
        <CheckCard title="Displacement" basis={`over t = ${f2(t)} s`} status="info" value={f3(s)} unit="m" formula="s = v₀t + ½at²"
          pairs={[{ label: 'sₓ', value: `${f3(r.s.sx)} m` }, { label: 's_y', value: `${f3(r.s.sy)} m` }]} />
      </>}
      summary={[
        { label: 'Mass m', value: `${f2(m)} kg` }, { label: 'Time t', value: `${f2(t)} s` },
        { label: 'Force ΣF', value: vec(Fx, Fy, Fz, 'N') }, { label: 'Initial velocity v₀', value: vec(v0x, v0y, v0z, 'm/s') },
      ]}
      drawing={{ title: 'Force and acceleration (x–y plane)', node: <ForceSketch Fx={Fx} Fy={Fy} ax={r.a.ax} ay={r.a.ay} /> }}
      results={[
        { check: 'Acceleration a', basis: 'ΣF/m', demand: vec(r.a.ax, r.a.ay, r.a.az, 'm/s²'), status: 'info' },
        { check: 'Final velocity v', basis: 'v₀ + at', demand: vec(r.v.vx, r.v.vy, r.v.vz, 'm/s'), status: 'info' },
        { check: 'Displacement s', basis: 'v₀t + ½at²', demand: vec(r.s.sx, r.s.sy, r.s.sz, 'm'), status: 'info' },
      ]}
      steps={[
        { title: "Newton's second law", lines: [
          { tex: `\\mathbf a = \\frac{\\Sigma\\mathbf F}{m} = \\frac{(${f2(Fx)},\\ ${f2(Fy)},\\ ${f2(Fz)})}{${f2(m)}} = (${f3(r.a.ax)},\\ ${f3(r.a.ay)},\\ ${f3(r.a.az)})\\ \\text{m/s}^2` },
        ] },
        { title: 'Motion over t', lines: [
          { tex: `\\mathbf v = \\mathbf v_0 + \\mathbf a t \\Rightarrow |\\mathbf v| = ${f3(v)}\\ \\text{m/s} \\qquad \\mathbf s = \\mathbf v_0 t + \\tfrac12 \\mathbf a t^2 \\Rightarrow |\\mathbf s| = ${f3(s)}\\ \\text{m}` },
          { text: 'Each axis is its own uniform-acceleration problem; the force is taken as constant over the interval.' },
        ] },
      ]}
      references={[
        { topic: "Newton's second law", basis: 'ΣF = m·a, applied per axis', source: 'Kinetics of particles' },
      ]}
    />
  )
}
