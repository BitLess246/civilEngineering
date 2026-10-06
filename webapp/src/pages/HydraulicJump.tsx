import { useState } from 'react'
import { hydraulicJump, type JumpResult, type ChannelShape } from '../engine/openChannel'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'
import { buildShape, type ShapeState } from './openChannelTypes'
import { ShapeGroup, JumpProfile } from './openChannelShared'

// Open channel — hydraulic jump. Given the discharge and the supercritical
// approach depth, the engine finds the sequent depth where the momentum
// function matches, then reports the energy dissipated, the power, the jump
// class and a classical length (engine/openChannel.ts). SI.

const SAMPLE: ShapeState = { kind: 'rect', b: '2', z: '1.5', D: '2' }

export default function HydraulicJump() {
  const [shape, setShape] = useState<ShapeState>(SAMPLE)
  const [Q, setQ] = useState(3)
  const [y1, setY1] = useState(0.35)

  const ch: ChannelShape = buildShape(shape)

  type JumpRes = { j: JumpResult } | { error: Error }
  const res: JumpRes = (() => {
    try {
      const j = hydraulicJump(ch, Q, y1)
      return { j }
    } catch (e) {
      return { error: e as Error }
    }
  })()

  // Approach area/top-width from the live section inputs — the same
  // formulas geomAt uses, so the Fr₁ substitution shows real numbers.
  const geom12 = (y: number) => {
    if (ch.kind === 'rect') return { A: ch.b * y, T: ch.b }
    if (ch.kind === 'trap') return { A: (ch.b + ch.z * y) * y, T: ch.b + 2 * ch.z * y }
    if (ch.kind === 'tri') return { A: ch.z * y * y, T: 2 * ch.z * y }
    const th = 2 * Math.acos(Math.min(1, Math.max(-1, 1 - (2 * y) / ch.D)))
    return { A: (ch.D * ch.D / 8) * (th - Math.sin(th)), T: ch.D * Math.sin(th / 2) }
  }
  const g1 = geom12(y1)
  const g2 = 'j' in res ? geom12(res.j.y2) : null
  const mom1 = (Q * Q) / (9.81 * g1.A)
  const mom2 = 'j' in res ? res.j.M - mom1 : 0

  const steps: SolutionStep[] = 'j' in res ? [
    {
      title: 'Approach flow',
      lines: [
        { tex: ch.kind === 'rect'
          ? `A_1 = b\\,y_1 = ${f3(ch.b)}\\times ${f3(y1)} = ${f3(g1.A)}\\text{ m}^2, \\quad T_1 = b = ${f3(g1.T)}\\text{ m}`
          : ch.kind === 'trap'
            ? `A_1 = (b + z\\,y_1)\\,y_1 = ${f3(g1.A)}\\text{ m}^2, \\quad T_1 = b + 2z\\,y_1 = ${f3(ch.b)} + 2\\times ${f3(ch.z)}\\times ${f3(y1)} = ${f3(g1.T)}\\text{ m}`
            : ch.kind === 'tri'
              ? `A_1 = z\\,y_1^2 = ${f3(ch.z)}\\times ${f3(y1)}^2 = ${f3(g1.A)}\\text{ m}^2, \\quad T_1 = 2z\\,y_1 = ${f3(g1.T)}\\text{ m}`
              : `A_1 = ${f3(g1.A)}\\text{ m}^2, \\quad T_1 = ${f3(g1.T)}\\text{ m} \\;\\; (D = ${f3(ch.D)}\\text{ m},\\; y_1 = ${f3(y1)}\\text{ m})` },
        { tex: `Fr_1 = \\sqrt{\\frac{Q^2 T_1}{g A_1^3}} = \\sqrt{\\frac{${f3(Q)}^2\\times ${f3(g1.T)}}{9.81\\times ${f3(g1.A)}^3}} = ${f3(res.j.Fr1)} \\;\\Rightarrow\\; \\text{${res.j.cls}} jump` },
        { text: 'A jump forms only when the approach flow is supercritical (Fr₁ > 1): the fast shallow stream cannot stay on the curve and rises abruptly to its sequent partner.' },
      ],
    },
    {
      title: 'Sequent depth — momentum is conserved across the jump',
      lines: res.j.closedForm
        ? [
            { tex: `M = \\frac{Q^2}{gA} + A\\bar{y}:\\quad M(y_2) = M(y_1)` },
            { tex: `y_2 = \\frac{y_1}{2}\\left(\\sqrt{1 + 8Fr_1^2} - 1\\right) = \\frac{${f3(y1)}}{2}\\left(\\sqrt{1 + 8\\times ${f3(res.j.Fr1)}^2} - 1\\right) = ${f3(res.j.y2)}\\text{ m}` },
            { text: 'For a rectangle this solves in closed form; for trapezoids, triangles and pipes the momentum function is matched by bisection on the subcritical branch.' },
          ]
        : [
            { tex: `M = \\frac{Q^2}{gA} + A\\bar{y}:\\quad M(y_2) = M(y_1) = ${f3(res.j.M)}\\text{ m}^3` },
            { tex: `M(y_1) = \\frac{${f3(Q)}^2}{9.81\\times ${f3(g1.A)}} + ${f3(g1.A)}\\times ${f3(g1.A > 0 ? mom2 / g1.A : 0)} = ${f3(mom1)} + ${f3(mom2)} = ${f3(res.j.M)}\\text{ m}^3` },
            { text: `The sequent depth is y₂ = ${f3(res.j.y2)} m, found by bisecting the momentum function on the subcritical branch above the critical depth. The rectangular closed form does not apply to this shape.` },
          ],
    },
    {
      title: 'Energy destroyed in the roller',
      lines: [
        { tex: `E_1 = y_1 + \\frac{Q^2}{2gA_1^2} = ${f3(y1)} + \\frac{${f3(Q)}^2}{2\\times 9.81\\times ${f3(g1.A)}^2} = ${f3(res.j.E1)}\\text{ m}` },
        { tex: `E_2 = y_2 + \\frac{Q^2}{2gA_2^2} = ${f3(res.j.y2)} + \\frac{${f3(Q)}^2}{2\\times 9.81\\times ${f3(g2?.A ?? 0)}^2} = ${f3(res.j.E2)}\\text{ m}` },
        { tex: `\\Delta E = E_1 - E_2 = \\left(${f3(res.j.E1)}\\right) - \\left(${f3(res.j.E2)}\\right) = ${f3(res.j.dE)}\\text{ m}` },
        { tex: `P = \\gamma\\, Q\\, \\Delta E = 9.81 \\times ${f3(Q)} \\times ${f3(res.j.dE)} = ${f2(res.j.powerKW)}\\text{ kW}` },
        { text: `A rectangular jump has the closed loss form ΔE = (y₂ − y₁)³/(4·y₁·y₂). The basin below the jump must take this as turbulence — stilling basins shorten the roller with baffle blocks and sills.` },
      ],
    },
  ] : [{ title: 'No jump forms', lines: [{ text: res.error.message }] }]

  const ok = 'j' in res

  return (
    <WorkspacePage title="Hydraulic Jump" badges={['Open channel', 'Sequent depth']}
      intro="The stilling-basin calculation: the sequent depth from momentum conservation, the energy head destroyed in the roller, the power it turns into turbulence, and the jump class that decides how violent the surface is."
      inputs={<>
        <ShapeGroup shape={shape} onChange={(patch) => setShape((s) => ({ ...s, ...patch }))} hint="Usually the apron downstream of a spillway." />
        <InputGroup title="Approach flow" hint="y₁ must be supercritical (Fr₁ > 1) for a jump to form.">
          <Num label="Discharge Q" unit="m³/s" value={Q} onChange={setQ} min={0.01} max={500} step="0.1" />
          <Num label="Approach depth y₁" unit="m" value={y1} onChange={setY1} min={0.01} max={20} step="0.05" />
        </InputGroup>
      </>}
      checks={ok ? <>
        <CheckCard title="Sequent depth" basis={res.j.closedForm ? 'rectangle, closed form' : 'momentum bisection'} status="info" value={f3(res.j.y2)} unit="m"
          formula={res.j.closedForm ? 'y₂ = (y₁/2)(√(1 + 8Fr₁²) − 1)' : 'M(y₂) = M(y₁)'}
          pairs={[{ label: 'Ratio y₂ / y₁', value: f3(res.j.y2 / y1) }, { label: 'Jump length ≈ 6.1 y₂', value: `${f2(res.j.Lj)} m` }]} />
        <CheckCard title="Jump class" basis={`Fr₁ = ${f3(res.j.Fr1)}`} status={res.j.Fr1 >= 4.5 && res.j.Fr1 <= 9 ? 'pass' : 'warn'} pillLabel={res.j.cls.toUpperCase()}
          value={f3(res.j.Fr1)} unit="Fr₁" formula="Fr₁ = √(Q²T₁ / gA₁³)"
          pairs={[{ label: 'Fr₂ downstream', value: f3(res.j.Fr2) }, { label: 'Steady range', value: 'Fr₁ 4.5 – 9' }]} />
        <CheckCard title="Energy dissipated" basis="in the roller" status="info" value={f3(res.j.dE)} unit="m head" formula="ΔE = E₁ − E₂; P = γQΔE"
          ratio={res.j.dE / res.j.E1} ratioLabel="ΔE ÷ E₁"
          pairs={[{ label: 'Power', value: `${f2(res.j.powerKW)} kW` }, { label: 'E₁ → E₂', value: `${f3(res.j.E1)} → ${f3(res.j.E2)} m` }]} />
      </> : (
        <CheckCard title="No jump forms" basis="the approach must be supercritical" status="fail" pillLabel="NO JUMP" value="—" formula={res.error.message} />
      )}
      summary={[
        { label: 'Section', value: ch.kind === 'rect' ? `rectangular, b ${f2(ch.b)} m` : ch.kind === 'trap' ? `trapezoidal, b ${f2(ch.b)} m, z ${f2(ch.z)}` : ch.kind === 'tri' ? `triangular, z ${f2(ch.z)}` : `circular, D ${f2(ch.D)} m` },
        { label: 'Discharge Q', value: `${f2(Q)} m³/s` }, { label: 'Approach depth y₁', value: `${f3(y1)} m` },
      ]}
      drawing={ok ? { title: 'Jump profile', node: <div data-pdf-drawing><JumpProfile shape={ch} j={res.j} /></div> } : undefined}
      results={ok ? [
        { check: 'Approach Froude Fr₁', basis: 'must exceed 1', demand: f3(res.j.Fr1), limit: '> 1', status: 'pass' },
        { check: 'Sequent depth y₂', basis: 'momentum balance', demand: `${f3(res.j.y2)} m`, status: 'info' },
        { check: 'Energy loss ΔE', basis: 'E₁ − E₂', demand: `${f3(res.j.dE)} m`, status: 'info' },
        { check: 'Power dissipated', basis: 'γQΔE', demand: `${f2(res.j.powerKW)} kW`, status: 'info' },
        { check: 'Jump length', basis: '≈ 6.1 y₂', demand: `${f2(res.j.Lj)} m`, status: 'info' },
      ] : [{ check: 'Jump', basis: res.error.message, demand: '—', status: 'fail' }]}
      steps={steps}
      references={[
        { topic: 'Momentum function', basis: 'M = Q²/(gA) + A·ȳ is conserved across the jump', source: 'Chow, Open-Channel Hydraulics §3-6' },
        { topic: 'Rectangular jump', basis: 'y₂/y₁ = (√(1 + 8Fr₁²) − 1)/2; ΔE = (y₂ − y₁)³/(4y₁y₂)', source: 'Chow §15' },
        { topic: 'Jump classes', basis: 'undular < 1.7 < weak < 2.5 < oscillating < 4.5 < steady < 9 < strong', source: 'USBR Engineering Monograph 25' },
        { topic: 'Jump length', basis: 'L ≈ 6.1 y₂ for the steady range', source: 'USBR EM 25' },
      ]}
    />
  )
}
