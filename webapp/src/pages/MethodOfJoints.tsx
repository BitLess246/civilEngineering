import { useState } from 'react'
import { resolveJointForces, type JointForce } from '../engine/concurrentForces'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { JointForceSketch } from '../components/mathSketches'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// Method of Joints — the first step of the joint method as its own calculator:
// state the forces that meet at a joint, read each one's x/y components, the
// sums Rx and Ry, and the resultant R. A balanced joint shows R = 0.

interface Row {
  id: number
  name: string
  magnitude: number
  angleDeg: number
}

let seq = 0
const row = (name: string, magnitude: number, angleDeg: number): Row => ({ id: ++seq, name, magnitude, angleDeg })

const SAMPLE: Row[] = [row('F1', 10, 30), row('F2', 8, 150), row('F3', 6, 270)]

export default function MethodOfJoints() {
  const [rows, setRows] = useState<Row[]>(SAMPLE)

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const forces: JointForce[] = rows.map(({ name, magnitude, angleDeg }) => ({ name, magnitude, angleDeg }))
  let r: ReturnType<typeof resolveJointForces> | null = null
  let err = ''
  try {
    r = resolveJointForces(forces)
  } catch (e) { err = (e as Error).message }

  const steps: SolutionStep[] = r ? [
    {
      title: 'Resolve each force into x and y components',
      lines: [
        { tex: `F_{x} = F\\cos\\theta \\qquad F_{y} = F\\sin\\theta` },
        ...r.components.flatMap((c) => [
          { item: `${c.name}: Fx = ${f2(c.magnitude)} × cos ${f2(c.angleDeg)}° = ${f2(c.fx)} kN; Fy = ${f2(c.magnitude)} × sin ${f2(c.angleDeg)}° = ${f2(c.fy)} kN` },
        ]),
        { text: 'Directions are measured counter-clockwise from the +x axis — the angle the arrow makes on the drawing. A force pointing down-left carries a negative component on both axes.' },
      ],
    },
    {
      title: 'Sum the components',
      lines: [
        { tex: `R_{x} = \\sum F_{x} = ${r.components.map((c) => f2(c.fx)).join(' + ')} = ${f2(r.Rx)}\\ \\text{kN}` },
        { tex: `R_{y} = \\sum F_{y} = ${r.components.map((c) => f2(c.fy)).join(' + ')} = ${f2(r.Ry)}\\ \\text{kN}` },
      ],
    },
    {
      title: 'Resultant of the system',
      lines: [
        { tex: `R = \\sqrt{R_{x}^{2} + R_{y}^{2}} = \\sqrt{(${f2(r.Rx)})^{2} + (${f2(r.Ry)})^{2}} = ${f3(r.R)}\\ \\text{kN}` },
        { tex: `\\theta_{R} = \\operatorname{atan2}(R_{y}, R_{x}) = ${f2(r.thetaDeg)}^{\\circ}\\ \\text{(CCW from +x)}` },
      ],
    },
    {
      title: 'Equilibrium of the joint',
      lines: r.equilibrium
        ? [
            { tex: `R = ${f3(r.R)}\\ \\text{kN} \\approx 0` },
            { text: 'Both sums vanish: the forces close on themselves and the joint is in equilibrium — exactly the condition ΣFx = ΣFy = 0 the method of joints solves member forces from.' },
          ]
        : [
            { tex: `R = ${f3(r.R)}\\ \\text{kN} \\neq 0` },
            { text: `The system does not close: something — a support, or the member forces the rest of the truss supplies — must carry ${f2(r.R)} kN at ∠${f2(r.thetaDeg)}° before this joint balances. Add or adjust forces until R vanishes.` },
          ],
    },
  ] : [{ title: 'Check the inputs', lines: [{ text: err || 'Check the inputs.' }] }]

  return (
    <WorkspacePage title="Method of Joints" badges={['Statics', 'Concurrent forces']}
      intro="State the forces that meet at a joint — applied loads and member forces alike — and the calculator resolves each into x and y components, sums them into Rx and Ry, and reports the resultant R with its direction. R = 0 is the equilibrium the method of joints hunts for."
      inputs={<>
        {rows.map((w, i) => (
          <InputGroup key={w.id} title={`Force ${i + 1}`} hint={i === 0 ? 'Direction is measured counter-clockwise from the +x axis, in degrees.' : undefined}>
            <label className="flex flex-col text-sm">
              <span className="mb-1 text-[11.5px] font-semibold text-muted">Name</span>
              <input value={w.name} onChange={(e) => setRow(i, { name: e.target.value })}
                className="rounded-md border border-field-line bg-field px-2.5 py-1.5 text-[13px] text-ink focus-visible:border-brand" />
            </label>
            <Num label="Magnitude" unit="kN" value={w.magnitude} onChange={(v) => setRow(i, { magnitude: v })} min={0} step="0.5" />
            <Num label="Direction θ" unit="°" value={w.angleDeg} onChange={(v) => setRow(i, { angleDeg: v })} step="5" />
          </InputGroup>
        ))}
        <button type="button" onClick={() => setRows((rs) => [...rs, row(`F${rs.length + 1}`, 10, 0)])}
          className="rounded-md border border-field-line px-2.5 py-1.5 text-[12px] font-semibold text-brand hover:bg-brand-tint">
          + Add force
        </button>
        {rows.length > 1 && (
          <button type="button" onClick={() => setRows((rs) => rs.slice(0, -1))}
            className="rounded-md border border-field-line px-2.5 py-1.5 text-[12px] font-semibold text-muted hover:bg-sheet-2">
            − Remove last
          </button>
        )}
      </>}
      checks={r ? <>
        <CheckCard title="Resultant R" basis={`∠${f2(r.thetaDeg)}° CCW from +x`} status="info"
          value={f3(r.R)} unit="kN" formula="R = √(Rx² + Ry²)"
          pairs={[{ label: 'Rx = ΣFx', value: `${f2(r.Rx)} kN` }, { label: 'Ry = ΣFy', value: `${f2(r.Ry)} kN` }]} />
        <CheckCard title="Joint equilibrium" basis="ΣFx = 0 and ΣFy = 0" status={r.equilibrium ? 'pass' : 'warn'}
          pillLabel={r.equilibrium ? 'PASS' : 'CHECK'}
          value={r.equilibrium ? 'holds' : `${f2(r.R)} kN`} unit={r.equilibrium ? undefined : 'unbalanced'}
          formula={r.equilibrium ? 'the force polygon closes' : 'the support or members must carry R'}
          pairs={r.equilibrium ? undefined : [{ label: 'needs −Rx', value: `${f2(-r.Rx)} kN` }, { label: 'needs −Ry', value: `${f2(-r.Ry)} kN` }]} />
      </> : (
        <CheckCard title="No resultant yet" basis="the inputs are incomplete" status="warn" pillLabel="CHECK"
          value="—" formula={err || 'Give every force a name, a magnitude and a direction.'} />
      )}
      summary={r
        ? r.components.map((c) => ({ label: c.name, value: `${f2(c.magnitude)} kN ∠${f2(c.angleDeg)}°` }))
        : [{ label: 'Forces', value: 'incomplete' }]}
      drawing={r ? { title: 'Force diagram at the joint', node: (
        <JointForceSketch forces={r.components} R={r.R} thetaDeg={r.thetaDeg} equilibrium={r.equilibrium} />
      ) } : undefined}
      results={r ? [
        ...r.components.map((c) => ({
          check: `${c.name} → components`, basis: `${f2(c.magnitude)} kN ∠${f2(c.angleDeg)}°`,
          demand: `Fx ${f2(c.fx)} · Fy ${f2(c.fy)} kN`, status: 'info' as const,
        })),
        { check: 'ΣFx = Rx', basis: 'sum of x components', demand: `${f2(r.Rx)} kN`, status: 'info' as const },
        { check: 'ΣFy = Ry', basis: 'sum of y components', demand: `${f2(r.Ry)} kN`, status: 'info' as const },
        { check: 'Resultant R', basis: '√(Rx² + Ry²)', demand: `${f3(r.R)} kN ∠${f2(r.thetaDeg)}°`, status: 'info' as const },
        { check: 'Equilibrium', basis: 'R ≈ 0', demand: r.equilibrium ? 'joint holds' : `${f2(r.R)} kN unbalanced`, status: r.equilibrium ? ('pass' as const) : ('warn' as const) },
      ] : [{ check: 'Inputs', basis: 'every force needs a name, magnitude, direction', demand: '—', status: 'warn' as const }]}
      steps={steps}
      references={[
        { topic: 'Concurrent force system', basis: 'Rx = ΣF·cosθ, Ry = ΣF·sinθ; R = √(Rx² + Ry²); θR = atan2(Ry, Rx)', source: 'Statics — resultants' },
        { topic: 'Method of joints', basis: 'A joint in equilibrium satisfies ΣFx = 0 and ΣFy = 0; the equations solve two unknown member forces per joint', source: 'Statics — trusses' },
      ]}
    />
  )
}
