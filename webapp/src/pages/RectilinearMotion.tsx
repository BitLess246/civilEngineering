import { useState } from 'react'
import { kinematicsRectilinear } from '../engine/dynamics'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { VelocityTimeSketch } from '../components/dynamicsSketches'
import { f2, f3 } from '../lib/influenceStyle'

// Rectilinear motion at constant acceleration — any three of u, a, t, v, s
// give the other two (engine/dynamics.ts · kinematicsRectilinear). SI.

type Known = 'uat' | 'uav' | 'uas' | 'uvt' | 'uvs' | 'uts'
const KNOWN_LABEL: Record<Known, string> = {
  uat: 'u, a and t', uav: 'u, a and v', uas: 'u, a and s',
  uvt: 'u, v and t', uvs: 'u, v and s', uts: 'u, t and s',
}

export default function RectilinearMotion() {
  const [known, setKnown] = useState<Known>('uat')
  const [u, setU] = useState(10)
  const [a, setA] = useState(2)
  const [t, setT] = useState(5)
  const [v, setV] = useState(20)
  const [s, setS] = useState(75)
  const has = (k: 'a' | 't' | 'v' | 's') => known.includes(k)

  let r: { u: number; v: number; a: number; t: number; s: number } | null = null
  let err = ''
  try {
    r = kinematicsRectilinear({ u, a: has('a') ? a : 0, ...(has('t') ? { t } : {}), ...(has('v') ? { v } : {}), ...(has('s') ? { s } : {}) })
  } catch (e) { err = (e as Error).message }
  const ok = !!r && Number.isFinite(r.t) && Number.isFinite(r.v) && Number.isFinite(r.s) && Number.isFinite(r.a)
  const q = ok ? r! : { u, v: NaN, a: NaN, t: NaN, s: NaN }
  const shown = (k: 'a' | 't' | 'v' | 's', input: number) => (has(k) ? input : Number.isFinite(q[k]) ? Math.round(q[k] * 1000) / 1000 : 0)

  return (
    <WorkspacePage title="Rectilinear Motion" badges={['Dynamics', 'Kinematics']}
      intro="Straight-line motion at constant acceleration: give any three of initial velocity, acceleration, time, final velocity and displacement and the other two follow. When a position is reached twice, the first time is reported."
      inputs={<>
        <InputGroup title="Known quantities">
          <div className="col-span-2">
            <Pick label="Given" value={known} onChange={(k) => setKnown(k as Known)}
              options={(Object.keys(KNOWN_LABEL) as Known[]).map((k) => [k, KNOWN_LABEL[k]] as [Known, string])} />
          </div>
          <Num label="Initial velocity u" unit="m/s" value={u} onChange={setU} step="0.5" />
          <Num label="Acceleration a" unit="m/s²" value={shown('a', a)} onChange={setA} step="0.1" disabled={!has('a')} />
          <Num label="Time t" unit="s" value={shown('t', t)} onChange={setT} min={0} step="0.5" disabled={!has('t')} />
          <Num label="Final velocity v" unit="m/s" value={shown('v', v)} onChange={setV} step="0.5" disabled={!has('v')} />
          <Num label="Displacement s" unit="m" value={shown('s', s)} onChange={setS} step="1" disabled={!has('s')} />
        </InputGroup>
      </>}
      checks={ok ? <>
        <CheckCard title="Final velocity" basis={`given ${KNOWN_LABEL[known]}`} status="info" value={f3(q.v)} unit="m/s" formula="v = u + at"
          pairs={[{ label: 'Acceleration a', value: `${f3(q.a)} m/s²` }, { label: 'Time t', value: `${f3(q.t)} s` }]} />
        <CheckCard title="Displacement" basis="area under the v–t line" status="info" value={f3(q.s)} unit="m" formula="s = ut + ½at² = (u + v)t / 2"
          pairs={[{ label: 'Average velocity', value: `${f3((q.u + q.v) / 2)} m/s` }, { label: 'Check v² = u² + 2as', value: `${f2(q.v * q.v)} = ${f2(q.u * q.u + 2 * q.a * q.s)}` }]} />
      </> : (
        <CheckCard title="No solution" basis={`given ${KNOWN_LABEL[known]}`} status="warn" pillLabel="CHECK" value="—" formula={err || 'These values cannot all hold at once.'} />
      )}
      summary={[
        { label: 'Given', value: KNOWN_LABEL[known] },
        { label: 'Initial velocity u', value: `${f2(u)} m/s` },
        { label: 'Acceleration a', value: ok ? `${f3(q.a)} m/s²` : '—' },
        { label: 'Time t', value: ok ? `${f3(q.t)} s` : '—' },
        { label: 'Final velocity v', value: ok ? `${f3(q.v)} m/s` : '—' },
        { label: 'Displacement s', value: ok ? `${f3(q.s)} m` : '—' },
      ]}
      drawing={ok && q.t > 0 ? { title: 'Velocity–time graph', node: <VelocityTimeSketch u={q.u} v={q.v} t={q.t} /> } : undefined}
      results={[
        { check: 'Final velocity v', basis: 'v = u + at', demand: ok ? `${f3(q.v)} m/s` : '—', status: ok ? 'info' : 'warn' },
        { check: 'Displacement s', basis: 's = ut + ½at²', demand: ok ? `${f3(q.s)} m` : '—', status: ok ? 'info' : 'warn' },
        { check: 'Time t', basis: 'first time s is reached', demand: ok ? `${f3(q.t)} s` : '—', status: ok ? 'info' : 'warn' },
        { check: 'Acceleration a', basis: 'given or (v − u)/t', demand: ok ? `${f3(q.a)} m/s²` : '—', status: ok ? 'info' : 'warn' },
      ]}
      steps={ok ? [
        { title: 'The three equations of uniform acceleration', lines: [
          { tex: `v = u + at = ${f2(q.u)} + ${f3(q.a)}\\times${f3(q.t)} = ${f3(q.v)}\\ \\text{m/s}` },
          { tex: `s = ut + \\tfrac12 at^2 = ${f2(q.u)}\\times${f3(q.t)} + \\tfrac12\\times${f3(q.a)}\\times${f3(q.t)}^2 = ${f3(q.s)}\\ \\text{m}` },
          { tex: `v^2 = u^2 + 2as \\Rightarrow ${f2(q.v * q.v)} = ${f2(q.u * q.u + 2 * q.a * q.s)}` },
          { text: 'Solving for t from s takes the earliest non-negative root: a decelerating body passes a point on the way out before it turns back.' },
        ] },
      ] : [{ title: 'No solution', lines: [{ text: err || 'The given values cannot all hold for constant acceleration.' }] }]}
      references={[
        { topic: 'Uniform acceleration', basis: 'v = u + at; s = ut + ½at²; v² = u² + 2as', source: 'Kinematics of particles' },
      ]}
    />
  )
}
