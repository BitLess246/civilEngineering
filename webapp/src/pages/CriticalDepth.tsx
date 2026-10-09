import { useState } from 'react'
import { geomAt, specificEnergy, criticalState, froude, type ChannelShape } from '../engine/openChannel'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'
import { buildShape, type ShapeState } from './openChannelTypes'
import { ShapeGroup, SectionSketch, EnergyCurve } from './openChannelShared'

// Open channel — critical depth. The control section: where Q²T/(gA³) = 1,
// specific energy is minimum and Fr crosses 1. Plots the specific-energy
// curve E(y) and locates any probe depth on it (engine/openChannel.ts). SI.

const SAMPLE: ShapeState = { kind: 'rect', b: '2', z: '1.5', D: '2' }

export default function CriticalDepth() {
  const [shape, setShape] = useState<ShapeState>(SAMPLE)
  const [Q, setQ] = useState(3)
  const [yGiven, setYGiven] = useState('1.2')

  const ch: ChannelShape = buildShape(shape)
  const y = parseFloat(yGiven) || 0

  type Point = { y: number; E: number; Fr: number }
  type CritRes =
    | { yc: number; E_min: number; gc: ReturnType<typeof geomAt>; point: Point | null }
    | { error: Error }
  const res: CritRes = (() => {
    try {
      const { yc, E_min } = criticalState(ch, Q)
      const gc = geomAt(ch, yc)
      const point: Point | null = y > 0
        ? { y, E: specificEnergy(ch, y, Q), Fr: froude(ch, y, Q) }
        : null
      return { yc, E_min, gc, point }
    } catch (e) {
      return { error: e as Error }
    }
  })()

  const probeGeom = 'yc' in res && res.point ? geomAt(ch, res.point.y) : null

  const steps: SolutionStep[] = 'yc' in res ? [
    {
      title: 'The critical condition',
      lines: [
        { tex: `\\frac{Q^2 T}{g A^3} = 1 \\;\\text{ at }\\; y = y_c` },
        { tex: `\\frac{${f3(Q)}^2\\times ${f3(res.gc.T)}}{9.81\\times ${f3(res.gc.A)}^3} = 1 \\;\\; (y_c = ${f3(res.yc)}\\text{ m},\\; A_c = ${f3(res.gc.A)}\\text{ m}^2,\\; T_c = ${f3(res.gc.T)}\\text{ m})` },
        { text: 'Critical flow is where the specific energy E = y + Q²/(2gA²) is minimum for the given discharge — the condition every control section (weir crest, brink, sill) passes through.' },
      ],
    },
    {
      title: 'Solve for the critical depth',
      lines: [
        { tex: `y_c = ${f3(res.yc)}\\text{ m}, \\qquad A_c = ${f3(res.gc.A)}\\text{ m}^2, \\qquad T_c = ${f3(res.gc.T)}\\text{ m}` },
        { text: 'For a rectangle the closed form yc = (Q²/gb²)^⅓ applies; the other shapes solve the critical condition by bisection.' },
      ],
    },
    {
      title: 'Minimum specific energy',
      lines: [
        { tex: `E_{min} = y_c + \\frac{Q^2}{2 g A_c^2} = ${f3(res.yc)} + \\frac{${f3(Q)}^2}{2\\times 9.81\\times ${f3(res.gc.A)}^2} = ${f3(res.E_min)}\\text{ m}` },
        { text: 'For a rectangular section this is exactly 1.5·yc — the velocity head is half the depth at critical flow.' },
      ],
    },
    ...(res.point ? [
      {
        title: `The given depth y = ${f3(res.point.y)} m on the curve`,
        lines: [
          { tex: `E = y + \\frac{Q^2}{2gA^2} = ${f3(res.point.y)} + \\frac{${f3(Q)}^2}{2\\times 9.81\\times ${f3(probeGeom?.A ?? 0)}^2} = ${f3(res.point.E)}\\text{ m}` },
          { tex: `Fr = \\sqrt{\\frac{Q^2 T}{gA^3}} = \\sqrt{\\frac{${f3(Q)}^2\\times ${f3(probeGeom?.T ?? 0)}}{9.81\\times ${f3(probeGeom?.A ?? 0)}^3}} = ${f3(res.point.Fr)}` },
          { text: res.point.Fr < 1
            ? `Fr < 1: subcritical (upper limb of the curve), deeper than critical. This depth can coexist with an alternate depth at the same energy — read it off the lower limb.`
            : `Fr > 1: supercritical (lower limb), shallower than critical. Its alternate depth sits on the upper limb at the same E = ${f3(res.point.E)} m.` },
        ],
      } satisfies SolutionStep,
    ] : []),
  ] : [{ title: 'Check the inputs', lines: [{ text: res.error.message }] }]

  const ok = 'yc' in res

  return (
    <WorkspacePage title="Critical Depth" badges={['Open channel', 'Specific energy']}
      intro="The control section: the critical depth and minimum specific energy for a discharge, and where any given depth sits on the E–y curve — subcritical upper limb or supercritical lower limb."
      inputs={<>
        <ShapeGroup shape={shape} onChange={(patch) => setShape((s) => ({ ...s, ...patch }))} hint="Trapezoid: bottom width b and side slope z (zH : 1V)." />
        <InputGroup title="Flow" hint="The probe depth is optional; 0 skips it.">
          <Num label="Discharge Q" unit="m³/s" value={Q} onChange={setQ} min={0.01} max={500} step="0.1" />
          <Num label="Probe depth y" unit="m" value={y} onChange={(v) => setYGiven(v === 0 ? '' : String(v))} min={0} max={20} step="0.1" />
        </InputGroup>
      </>}
      checks={ok ? <>
        <CheckCard title="Critical depth" basis={`Q ${f2(Q)} m³/s`} status="info" value={f3(res.yc)} unit="m" formula="Q²T / gA³ = 1"
          pairs={[{ label: 'Area A_c', value: `${f3(res.gc.A)} m²` }, { label: 'Top width T_c', value: `${f3(res.gc.T)} m` }]} />
        <CheckCard title="Minimum specific energy" basis={ch.kind === 'rect' ? 'rectangle: exactly 1.5 y_c' : 'E(y) at y_c'} status="info" value={f3(res.E_min)} unit="m" formula="E = y + Q²/2gA²"
          pairs={[{ label: 'Velocity head', value: `${f3(res.E_min - res.yc)} m` }, { label: 'Critical velocity', value: `${f3(Q / res.gc.A)} m/s` }]} />
        {res.point && (
          <CheckCard title={`Probe y = ${f3(res.point.y)} m`} basis={res.point.Fr < 1 ? 'upper limb' : 'lower limb'} status={res.point.Fr < 1 ? 'info' : 'warn'}
            pillLabel={res.point.Fr < 1 ? 'SUBCRITICAL' : 'SUPERCRITICAL'} value={f3(res.point.Fr)} unit="Froude"
            pairs={[{ label: 'Specific energy', value: `${f3(res.point.E)} m` }, { label: 'y ÷ y_c', value: f3(res.point.y / res.yc) }]} />
        )}
      </> : (
        <CheckCard title="Check the inputs" basis="section and discharge" status="warn" pillLabel="CHECK" value="—" formula={res.error.message} />
      )}
      summary={[
        { label: 'Section', value: ch.kind === 'rect' ? `rectangular, b ${f2(ch.b)} m` : ch.kind === 'trap' ? `trapezoidal, b ${f2(ch.b)} m, z ${f2(ch.z)}` : ch.kind === 'tri' ? `triangular, z ${f2(ch.z)}` : `circular, D ${f2(ch.D)} m` },
        { label: 'Discharge Q', value: `${f2(Q)} m³/s` }, { label: 'Probe depth', value: y > 0 ? `${f3(y)} m` : '—' },
      ]}
      drawing={ok ? { title: 'Specific-energy curve and control section', node: <div data-pdf-drawing className="space-y-3">
        <EnergyCurve shape={ch} Q={Q} yc={res.yc} EMin={res.E_min} probe={res.point} />
        <SectionSketch shape={ch} y={res.yc} caption="Critical condition: Q²T/(gA³) = 1 — Fr = 1, E = Emin" />
      </div> } : undefined}
      results={ok ? [
        { check: 'Critical depth y_c', basis: 'Q²T/(gA³) = 1', demand: `${f3(res.yc)} m`, status: 'info' },
        { check: 'Minimum specific energy', basis: 'y_c + Q²/2gA_c²', demand: `${f3(res.E_min)} m`, status: 'info' },
        ...(res.point ? [{ check: `Probe depth ${f3(res.point.y)} m`, basis: 'Froude number', demand: f3(res.point.Fr), status: (res.point.Fr < 1 ? 'info' : 'warn') as 'info' | 'warn' }] : []),
      ] : [{ check: 'Critical state', basis: res.error.message, demand: '—', status: 'warn' }]}
      steps={steps}
      references={[
        { topic: 'Critical flow', basis: 'Q²T/(gA³) = 1; rectangle y_c = (q²/g)^⅓, E_min = 1.5 y_c', source: 'Chow, Open-Channel Hydraulics §3' },
        { topic: 'Specific energy', basis: 'E = y + Q²/(2gA²); alternate depths share one E', source: 'Chow §3-2' },
      ]}
    />
  )
}
