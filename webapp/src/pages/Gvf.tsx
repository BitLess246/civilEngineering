import { useState } from 'react'
import 'katex/dist/katex.min.css'
import { gvfProfile, frictionSlope, gvfSlope, type GvfResult } from '../engine/gvf'
import { froude } from '../engine/openChannel'
import { ShapeCard } from './openChannelShared'
import { buildShape, type ShapeState } from './openChannelTypes'
import { Card, Num, Pick, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, MUTED, HAIR, f3 } from '../lib/influenceStyle'

// GVF profiles — the gradually-varied-flow water surface: normal and
// critical depths, the Chow classification (M1…A3), an RK4 march of
// dy/dx = (S0 − Sf)/(1 − Fr²) from the control, and the longitudinal
// profile drawing with the yn / yc reference lines.

const f4 = (v: number) => v.toExponential(3)

const SAMPLE_SHAPE: ShapeState = { kind: 'rect', b: '2', z: '1.5', D: '2' }

export default function Gvf() {
  const [shape, setShape] = useState<ShapeState>(SAMPLE_SHAPE)
  const [Q, setQ] = useState(3)
  const [n, setN] = useState(0.014)
  const [S0, setS0] = useState(0.001)
  const [L, setL] = useState(200)
  const [yControl, setYControl] = useState(1.5)
  const [controlAt, setControlAt] = useState<'auto' | 'upstream' | 'downstream'>('auto')

  const out: { r: GvfResult | null } = (() => {
    try {
      return { r: gvfProfile({ shape: buildShape(shape), Q, n, S0, L, yControl, controlAt }) }
    } catch { return { r: null } }
  })()
  const r = out.r

  // Control-section geometry from the live shape inputs — the same
  // formulas the solver uses, so the Sf/Fr lines show real A and R.
  const chG = buildShape(shape)
  const ctrlGeom = (() => {
    const y = yControl
    if (chG.kind === 'rect') return { A: chG.b * y, R: (chG.b * y) / (chG.b + 2 * y) }
    if (chG.kind === 'trap') {
      const A = (chG.b + chG.z * y) * y
      return { A, R: A / (chG.b + 2 * y * Math.sqrt(1 + chG.z * chG.z)) }
    }
    if (chG.kind === 'tri') {
      const A = chG.z * y * y
      return { A, R: A / (2 * y * Math.sqrt(1 + chG.z * chG.z)) }
    }
    const th = 2 * Math.acos(Math.min(1, Math.max(-1, 1 - (2 * y) / chG.D)))
    const A = (chG.D * chG.D / 8) * (th - Math.sin(th))
    return { A, R: A / (chG.D * th / 2) }
  })()
  // One RK4 example step: control slope times the first station interval.
  const rk = r && r.stations.length > 1
    ? {
        s: gvfSlope(chG, yControl, Q, n, S0),
        dx: r.stations[1].x - r.stations[0].x,
        dy: r.stations[1].y - r.stations[0].y,
        y1: r.stations[1].y,
      }
    : null

  const steps: SolutionStep[] = r ? [
    {
      title: 'Normal and critical depths',
      lines: [
        { tex: `Q = ${f3(Q)}\\text{ m}^3\\text{/s}, \\quad n = ${f3(n)}, \\quad S_0 = ${f3(S0)}\\text{ m/m}` },
        { tex: 'Q = \\tfrac{1}{n}A R^{2/3} S_0^{1/2} \\;\\Rightarrow\\; y_n = ' + f3(r.yn ?? 0) + '\\ \\text{m}' },
        ...(r.yn !== null
          ? [{ tex: `S_f(y_n = ${f3(r.yn)}) = ${f4(frictionSlope(chG, r.yn, Q, n))} \\approx S_0 = ${f3(S0)}` }]
          : []),
        { tex: 'Q^2 T / (g A^3) = 1 \\;\\Rightarrow\\; y_c = ' + f3(r.yc) + '\\ \\text{m}' },
        { tex: `Fr(y_c = ${f3(r.yc)}) = ${f3(froude(chG, r.yc, Q))} = 1 \\;\\; (Q = ${f3(Q)}\\text{ m}^3\\text{/s})` },
        { text: r.slopeClass === 'horizontal' || r.slopeClass === 'adverse'
          ? 'The bed is ' + (r.slopeClass === 'horizontal' ? 'horizontal (S0 = 0) — no uniform-flow depth exists.' : 'adverse (S0 < 0) — no uniform-flow depth exists.')
          : `Solving Manning for the depth gives yn = ${f3(r.yn ?? 0)} m and the critical-depth condition gives yc = ${f3(r.yc)} m.` },
      ],
    },
    {
      title: 'Slope class and profile zone',
      lines: [
        { text: `Comparing the two: ${r.slopeClass === 'mild' ? `yn (${f3(r.yn ?? 0)}) > yc (${f3(r.yc)}) — a MILD slope.` : r.slopeClass === 'steep' ? `yn (${f3(r.yn ?? 0)}) < yc (${f3(r.yc)}) — a STEEP slope.` : r.slopeClass === 'critical' ? 'yn = yc — a CRITICAL slope.' : r.slopeClass === 'horizontal' ? 'A HORIZONTAL slope carries only H2/H3 profiles.' : 'An ADVERSE slope carries only A2/A3 profiles.'}` },
        { text: `The control depth yc = ${f3(r.yc)} m splits the diagram; y = ${f3(yControl)} m falls in zone ${r.zone}, so the profile is ${r.profile}.` },
      ],
    },
    {
      title: 'GVF equation and the control',
      lines: [
        { tex: '\\frac{dy}{dx} = \\frac{S_0 - S_f}{1 - Fr^2}, \\qquad S_f = \\left(\\frac{Q\\,n}{A R^{2/3}}\\right)^{2}' },
        { tex: `y_{ctrl} = ${f3(yControl)}\\text{ m}:\\; A = ${f3(ctrlGeom.A)}\\text{ m}^2,\\; R = ${f3(ctrlGeom.R)}\\text{ m} \\;\\; (Q = ${f3(Q)}\\text{ m}^3\\text{/s},\\; n = ${f3(n)})` },
        { tex: `S_f(${f3(yControl)}) = ${f4(frictionSlope(buildShape(shape), yControl, Q, n))} \\quad Fr = ${f3(froude(buildShape(shape), yControl, Q))}` },
        { tex: `\\left.\\frac{dy}{dx}\\right|_{ctrl} = ${f4(gvfSlope(buildShape(shape), yControl, Q, n, S0))}\\ \\text{m/m}` },
      ],
    },
    {
      title: 'March from the control',
      lines: [
        { text: `${r.FrControl > 1 ? 'Supercritical control (Fr > 1) sits at the upstream end and the march runs downstream.' : 'Subcritical control (Fr < 1) sits at the downstream end and the march runs upstream.'} The RK4 march stops at: ${r.terminus}.` },
        ...(rk
          ? [{ tex: `\\Delta y \\approx \\left.\\frac{dy}{dx}\\right|_{ctrl}\\Delta x = ${f4(rk.s)}\\times ${f3(rk.dx)} = ${f4(rk.s * rk.dx)}\\text{ m} \\;\\Rightarrow\\; y_1 = ${f3(rk.y1)}\\text{ m (RK4, actual }\\Delta y = ${f4(rk.dy)}\\text{ m)}` }]
          : []),
        { text: `Far-end depth y = ${f3(r.yEnd)} m${r.yn !== null ? ` against yn = ${f3(r.yn)} m` : ''} over the ${f0(L)} m reach.` },
      ],
    },
  ] : []

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
      <ReportControls title="GVF Profile Report" badges={[r ? r.profile : 'Chow profiles']} />
      <p className="mt-2 max-w-3xl text-sm text-muted">
        The gradually-varied-flow water surface behind a control: normal and critical depths,
        the Chow classification (M1–M3, S1–S3, C, H2/H3, A2/A3), and an RK4 integration of
        dy/dx = (S0 − Sf)/(1 − Fr²) drawn over the reach with the uniform-flow and critical
        depth reference lines.
      </p>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-5">
          <ShapeCard shape={shape} onChange={(patch) => setShape((s) => ({ ...s, ...patch }))}
            hint="Section geometry used for A, P, T at every depth." />
          <Card title="Flow and bed">
            <Num label="Discharge Q" unit="m³/s" value={Q} onChange={setQ} min={0.01} max={500} step="0.1" />
            <Num label="Manning n" value={n} onChange={setN} min={0.008} max={0.1} step="0.001" />
            <Num label="Bed slope S0" unit="m/m" value={S0} onChange={setS0} min={-0.02} max={0.05} step="0.0005" />
            <Num label="Reach length L" unit="m" value={L} onChange={setL} min={10} max={20000} step="10" />
          </Card>
          <Card title="Control (boundary condition)">
            <Num label="Control depth" unit="m" value={yControl} onChange={setYControl} min={0.01} max={30} step="0.05" />
            <Pick label="Control placed at" value={controlAt} onChange={(v) => setControlAt(v as typeof controlAt)}
              options={[['auto', 'Auto — subcritical downstream, supercritical upstream'], ['upstream', 'Upstream end'], ['downstream', 'Downstream end']]} />
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="button"
                onClick={() => { setShape(SAMPLE_SHAPE); setQ(3); setN(0.014); setS0(0.001); setL(200); setYControl(1.5); setControlAt('auto') }}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                Load the sample — M1 backwater ahead of a dam
              </button>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          {r ? (
            <>
              <ResultCard title="Classification">
                <Row label="Profile" value={r.profile} sub={`${r.slopeClass} slope · zone ${r.zone} · ${r.march === 'upstream' ? 'marches upstream' : 'marches downstream'} from the ${r.controlAt} control`} />
                <Row label="Normal depth yn" value={r.yn !== null ? `${f3(r.yn)} m` : '— (no uniform flow)'} sub={`critical depth yc = ${f3(r.yc)} m`} />
                <Row label="Control Froude" value={f3(r.FrControl)} sub={r.FrControl > 1 ? 'supercritical control' : 'subcritical control'} />
                <Row label="Far-end depth" value={`${f3(r.yEnd)} m`} sub={r.terminus} />
              </ResultCard>

              <DrawingCard title="Water-surface profile" meta={`${r.profile} profile over ${f0(L)} m — bed drop drawn true to S0·L`}>
                <ProfileDrawing result={r} L={L} S0={S0} />
              </DrawingCard>

              <WorkedSolution steps={steps} title="GVF profile — step by step" />
            </>
          ) : (
            <ResultCard title="Check the inputs">
              <p className="text-sm text-fail">
                Give a positive discharge, Manning n, reach length and control depth. On a circular
                section the control must stay below the crown. A control depth at (or extremely
                close to) critical depth sits on the classification singularity where dy/dx blows
                up — nudge it into zone 1, 2 or 3.
              </p>
            </ResultCard>
          )}
        </div>
      </div>
    </div>
  )
}

const f0 = (v: number) => Math.round(v).toString()

function ProfileDrawing({ result, L, S0 }: { result: GvfResult; L: number; S0: number }) {
  const W = 640, H = 340
  const padL = 52, padR = 74, padT = 42, padB = 46
  const x0 = padL, x1 = W - padR

  const stations = result.stations
  const bandTop = padT, bandBottom = H - padB
  // elevations measured above the downstream bed: bed(x) = S0·(L − x)
  const elevMax = Math.max(
    ...stations.map((s) => s.y + S0 * (L - s.x)),
    (result.yn ?? 0) + S0 * L, result.yc + S0 * L,
  ) * 1.1
  const px = (x: number) => x0 + (x / L) * (x1 - x0)
  const py = (x: number, depth: number) =>
    bandBottom - ((depth + S0 * (L - x)) / elevMax) * (bandBottom - bandTop)
  const bedPath = `M ${px(0)} ${py(0, 0)} L ${px(L)} ${py(L, 0)}`
  const waterPath = stations.map((s, i) => `${i === 0 ? 'M' : 'L'} ${px(s.x).toFixed(2)} ${py(s.x, s.y).toFixed(2)}`).join(' ')
  const ynPath = result.yn !== null
    ? `M ${px(0)} ${py(0, result.yn)} L ${px(L)} ${py(L, result.yn)}`
    : ''
  const ycPath = `M ${px(0)} ${py(0, result.yc)} L ${px(L)} ${py(L, result.yc)}`
  const ctrl = stations[0]

  return (
    <DrawingFrame label="Longitudinal water-surface profile">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="GVF profile">
        {/* bed */}
        <path d={bedPath} stroke={INK} strokeWidth="1.8" fill="none" />
        {Array.from({ length: 26 }, (_, i) => {
          const x = (i / 25) * L
          const xa = px(x), ya = py(x, 0)
          return <line key={i} x1={xa} y1={ya + 2} x2={xa - 7} y2={ya + 10} stroke={HAIR} strokeWidth="1" />
        })}
        {/* yn and yc reference lines, parallel to the bed */}
        {ynPath !== '' && (
          <>
            <path d={ynPath} stroke={MUTED} strokeWidth="1.1" strokeDasharray="7 4" fill="none" />
            <text x={x1 + 6} y={py(L, result.yn ?? 0) + 3} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">yn {f3(result.yn ?? 0)}</text>
          </>
        )}
        <path d={ycPath} stroke={MUTED} strokeWidth="1.1" strokeDasharray="2 3" fill="none" />
        <text x={x1 + 6} y={py(L, result.yc) + 3} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">yc {f3(result.yc)}</text>
        {/* water surface */}
        <path d={`${waterPath} L ${px(stations[stations.length - 1].x)} ${py(stations[stations.length - 1].x, 0)} L ${px(stations[0].x)} ${py(stations[0].x, 0)} Z`}
          fill="rgba(15,76,146,0.14)" stroke="none" />
        <path d={waterPath} stroke="rgba(15,76,146,0.9)" strokeWidth="2" fill="none" />
        {/* control marker */}
        <circle cx={px(ctrl.x)} cy={py(ctrl.x, ctrl.y)} r="3.4" fill="rgba(15,76,146,0.9)" />
        <text x={px(ctrl.x) + (result.controlAt === 'downstream' ? -8 : 8)} y={py(ctrl.x, ctrl.y) - 10}
          textAnchor={result.controlAt === 'downstream' ? 'end' : 'start'} fontSize="10.5" fill={INK}
          fontFamily="var(--font-mono, monospace)">
          control y = {f3(ctrl.y)} m
        </text>
        {/* profile label */}
        <text x={(x0 + x1) / 2} y={padT - 18} textAnchor="middle" fontSize="13" fontWeight="600" fill={INK}
          fontFamily="var(--font-mono, monospace)">{result.profile}</text>
        <text x={(x0 + x1) / 2} y={padT - 5} textAnchor="middle" fontSize="9.5" fill={MUTED}
          fontFamily="var(--font-mono, monospace)">{result.terminus}</text>
        {/* flow direction */}
        <text x={(x0 + x1) / 2} y={H - padB + 26} textAnchor="middle"
          fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
          flow →
        </text>
        <text x={x0} y={H - padB + 26} fontSize="9.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">x = 0</text>
        <text x={x1} y={H - padB + 26} textAnchor="end" fontSize="9.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">x = {f0(L)} m</text>
      </svg>
    </DrawingFrame>
  )
}
