import { useState } from 'react'
import { geomAt, normalDepth, froude, peakFlowDepth, type ChannelShape } from '../engine/openChannel'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'
import { buildShape, SHAPE_SAMPLE, type ShapeState } from './openChannelTypes'
import { ShapeGroup, SectionSketch } from './openChannelShared'

// Open channel — normal depth. Manning's uniform-flow equation solved for the
// depth: given Q, n and S, the engine bisects (1/n)·A·R^(2/3)·√S = Q and
// reports the depth, velocity, Froude number and flow state
// (engine/openChannel.ts). SI: m, m³/s.

export default function OpenChannel() {
  const [shape, setShape] = useState<ShapeState>(SHAPE_SAMPLE)
  const [n, setN] = useState(0.014)
  const [S, setS] = useState(0.5)
  const [Q, setQ] = useState(3)

  const ch: ChannelShape = buildShape(shape)
  const slope = S / 100

  type NormalRes = { yn: number; g: ReturnType<typeof geomAt>; Fr: number; V: number } | { error: Error }
  const res: NormalRes = (() => {
    try {
      const yn = normalDepth(ch, Q, n, slope)
      const g = geomAt(ch, yn)
      return { yn, g, Fr: froude(ch, yn, Q), V: Q / g.A }
    } catch (e) { return { error: e as Error } }
  })()
  const yPeak = ch.kind === 'circle' ? peakFlowDepth(ch) : null

  const steps: SolutionStep[] = 'yn' in res ? [
    {
      title: 'Section geometry at the normal depth',
      lines: [
        { tex: ch.kind === 'rect'
          ? `A = b\\,y_n = ${f3(ch.b)}\\times ${f3(res.yn)} = ${f3(res.g.A)}\\text{ m}^2, \\quad P = b + 2y_n = ${f3(ch.b)} + 2\\times ${f3(res.yn)} = ${f3(res.g.P)}\\text{ m}`
          : ch.kind === 'trap'
            ? `A = (b + z\\,y_n)\\,y_n = (${f3(ch.b)} + ${f3(ch.z)}\\times ${f3(res.yn)})\\times ${f3(res.yn)} = ${f3(res.g.A)}\\text{ m}^2, \\quad P = b + 2y_n\\sqrt{1+z^2} = ${f3(res.g.P)}\\text{ m}`
            : ch.kind === 'tri'
              ? `A = z\\,y_n^2 = ${f3(ch.z)}\\times ${f3(res.yn)}^2 = ${f3(res.g.A)}\\text{ m}^2, \\quad P = 2y_n\\sqrt{1+z^2} = ${f3(res.g.P)}\\text{ m}`
              : `A = D^2(\\theta-\\sin\\theta)/8 = ${f3(res.g.A)}\\text{ m}^2, \\quad P = D\\theta/2 = ${f3(res.g.P)}\\text{ m} \\;\\; (D = ${f3(ch.D)}\\text{ m},\\; y_n = ${f3(res.yn)}\\text{ m})` },
        { tex: `R = \\frac{A}{P} = \\frac{${f3(res.g.A)}}{${f3(res.g.P)}} = ${f3(res.g.R)}\\text{ m}` },
        { text: 'Geometry follows from the shape: rectangle A = by, trapezoid A = (b + zy)y with P = b + 2y√(1+z²), triangle A = zy², circle A = D²(θ − sinθ)/8 with θ from the segment.' },
      ],
    },
    {
      title: 'Manning equation — solve for the depth',
      lines: [
        { tex: `Q = \\frac{1}{n} A R^{2/3} \\sqrt{S} = \\frac{1}{${f3(n)}}\\times ${f3(res.g.A)}\\times ${f3(res.g.R)}^{2/3}\\times \\sqrt{${f3(slope)}} = ${f3(Q)}\\text{ m}^3\\text{/s} \\;\\Rightarrow\\; y_n = ${f3(res.yn)}\\text{ m}` },
        { text: `The depth that satisfies this is yn = ${f3(res.yn)} m — found by bisection, since A and R are both functions of y and no closed form exists for trapezoids or circles.` },
      ],
    },
    {
      title: 'Velocity and flow state',
      lines: [
        { tex: `V = \\frac{Q}{A} = \\frac{${f3(Q)}}{${f3(res.g.A)}} = ${f3(res.V)}\\text{ m/s}` },
        { tex: `Fr = \\sqrt{\\frac{Q^2 T}{g A^3}} = \\sqrt{\\frac{${f3(Q)}^2\\times ${f3(res.g.T)}}{9.81\\times ${f3(res.g.A)}^3}} = ${f3(res.Fr)} \\;\\Rightarrow\\; \\text{${res.Fr < 1 ? 'subcritical (tranquil)' : 'supercritical (rapid)'}}` },
        { text: `Subcritical flow is deep and slow — depth control sits downstream. Supercritical is shallow and fast — control sits upstream, and any disturbance becomes a standing wave.` },
      ],
    },
  ] : [{ title: 'Check the inputs', lines: [{ text: res.error.message }] }]

  const ok = 'yn' in res
  const sub = ok && res.Fr < 1

  return (
    <WorkspacePage title="Normal Depth" badges={['Open channel', 'Manning']}
      intro="Uniform flow by Manning: given the discharge, roughness and bed slope, solve the depth the water settles at — rectangular, trapezoidal, triangular or circular. A circular pipe that cannot carry Q reports its peak capacity instead of a false depth."
      inputs={<>
        <ShapeGroup shape={shape} onChange={(patch) => setShape((s) => ({ ...s, ...patch }))} hint="Trapezoid: bottom width b and side slope z (zH : 1V)." />
        <InputGroup title="Manning" hint="n ≈ 0.013 concrete, 0.020–0.030 earth, 0.035+ natural streams.">
          <Num label="Manning n" value={n} onChange={setN} min={0.008} max={0.2} step="0.001" />
          <Num label="Bed slope S" unit="%" value={S} onChange={setS} min={0.0001} max={20} step="0.05" />
          <Num label="Discharge Q" unit="m³/s" value={Q} onChange={setQ} min={0.01} max={500} step="0.1" />
        </InputGroup>
      </>}
      checks={ok ? <>
        <CheckCard title="Normal depth" basis={`Q ${f2(Q)} m³/s, n ${f3(n)}, S ${f2(S)}%`} status="info" value={f3(res.yn)} unit="m" formula="Q = (1/n)·A·R^2/3·√S"
          pairs={[{ label: 'Area A', value: `${f3(res.g.A)} m²` }, { label: 'Hydraulic radius R', value: `${f3(res.g.R)} m` }]} />
        <CheckCard title="Flow state" basis={sub ? 'deep and slow' : 'shallow and fast'} status={sub ? 'info' : 'warn'} pillLabel={sub ? 'SUBCRITICAL' : 'SUPERCRITICAL'}
          value={f3(res.Fr)} unit="Froude" formula="Fr = √(Q²T / gA³)"
          pairs={[{ label: 'Velocity V', value: `${f3(res.V)} m/s` }, { label: 'Top width T', value: `${f3(res.g.T)} m` }]} />
        {yPeak !== null && ch.kind === 'circle' && (
          <CheckCard title="Pipe fullness" basis="Manning peaks below full" status={res.yn / ch.D <= yPeak / ch.D ? 'pass' : 'warn'}
            value={f2(res.yn / ch.D)} unit="y/D" ratio={res.yn / yPeak} ratioLabel="y ÷ y at peak Q"
            pairs={[{ label: 'Peak-capacity depth', value: `${f2(yPeak / ch.D)} D` }, { label: 'Diameter', value: `${f2(ch.D)} m` }]} />
        )}
      </> : (
        <CheckCard title="No normal depth" basis="check the section and Q" status="fail" pillLabel="CHECK" value="—" formula={res.error.message} />
      )}
      summary={[
        { label: 'Section', value: ch.kind === 'rect' ? `rectangular, b ${f2(ch.b)} m` : ch.kind === 'trap' ? `trapezoidal, b ${f2(ch.b)} m, z ${f2(ch.z)}` : ch.kind === 'tri' ? `triangular, z ${f2(ch.z)}` : `circular, D ${f2(ch.D)} m` },
        { label: 'Manning n', value: f3(n) }, { label: 'Bed slope S', value: `${f2(S)} %` }, { label: 'Discharge Q', value: `${f2(Q)} m³/s` },
      ]}
      drawing={ok ? { title: 'Section at the normal depth', node: <div data-pdf-drawing><SectionSketch shape={ch} y={res.yn} caption={`Manning: n = ${f3(n)}, S = ${f3(slope)} m/m`} /></div> } : undefined}
      results={ok ? [
        { check: 'Normal depth yn', basis: 'Manning, bisection', demand: `${f3(res.yn)} m`, status: 'info' },
        { check: 'Velocity', basis: 'Q/A', demand: `${f3(res.V)} m/s`, status: 'info' },
        { check: 'Froude number', basis: '√(Q²T/gA³)', demand: f3(res.Fr), limit: '< 1 subcritical', status: sub ? 'info' : 'warn' },
      ] : [{ check: 'Normal depth', basis: res.error.message, demand: '—', status: 'fail' }]}
      steps={steps}
      references={[
        { topic: 'Manning equation', basis: 'Q = (1/n)·A·R^2/3·√S (SI)', source: 'Chow, Open-Channel Hydraulics §6' },
        { topic: 'Froude number', basis: 'Fr = V/√(gD), D = A/T; Fr < 1 subcritical, > 1 supercritical', source: 'Chow §1-4' },
        { topic: 'Circular pipes', basis: 'Manning capacity peaks near y/D ≈ 0.94, above the full-pipe value', source: 'Chow §6' },
      ]}
    />
  )
}
