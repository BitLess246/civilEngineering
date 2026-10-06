import { useState } from 'react'
import {
  geomAt, normalDepth, froude, peakFlowDepth,
  type ChannelShape,
} from '../engine/openChannel'
import { Card, Num, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'
import { buildShape, type ShapeState } from './openChannelTypes'
import { ShapeCard, SectionSketch } from './openChannelShared'

// Open channel — NORMAL DEPTH mode. Manning's uniform-flow equation solved
// for the depth: given Q, n and S, the engine bisects (1/n)·A·R^(2/3)·√S = Q
// and reports the depth, velocity, Froude number and flow state.

const SAMPLE: ShapeState = { kind: 'trap', b: '2', z: '1.5', D: '2' }

export function NormalMode() {
  const [shape, setShape] = useState<ShapeState>(SAMPLE)
  const [n, setN] = useState(0.014)
  const [S, setS] = useState(0.5)
  const [slopePct, setSlopePct] = useState(true)
  const [Q, setQ] = useState(3)

  const ch: ChannelShape = buildShape(shape)
  const slope = slopePct ? S / 100 : S

  type NormalRes =
    | { yn: number; g: ReturnType<typeof geomAt>; Fr: number; V: number }
    | { error: Error }
  const res: NormalRes = (() => {
    try {
      const yn = normalDepth(ch, Q, n, slope)
      const g = geomAt(ch, yn)
      const Fr = froude(ch, yn, Q)
      return { yn, g, Fr, V: Q / g.A }
    } catch (e) {
      return { error: e as Error }
    }
  })()

  const yPeak = shape.kind === 'circle' ? peakFlowDepth(ch) : null

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
  ] : []

  return (
    <div>
      <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
        <ReportControls title="Open Channel — Normal Depth Report" badges={['Manning']} />
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Uniform flow by Manning: given the discharge, roughness and bed slope, solve the depth the
          water settles at. Works for rectangular, trapezoidal, triangular and circular sections —
          the circle reports its peak capacity when Q outruns the pipe.
        </p>

        <div className="mt-5 grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="space-y-5">
            <ShapeCard shape={shape} onChange={(patch) => setShape((s) => ({ ...s, ...patch }))}
              hint="Trapezoid: b + side slope z (zH:1V)" />

            <Card title="Manning inputs">
              <Num label="Manning n" value={n} onChange={setN} min={0.008} max={0.2} step="0.001" />
              <Num label={slopePct ? 'Bed slope S' : 'Bed slope S (m/m)'} unit={slopePct ? '%' : 'm/m'} value={S} onChange={setS} min={0.0001} max={20} step="0.05" />
              <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-3">
                <input type="checkbox" checked={slopePct} onChange={(e) => setSlopePct(e.target.checked)} className="accent-brand" />
                <span className="text-[12.5px] font-semibold text-muted">Slope entered in percent (uncheck for m/m)</span>
              </label>
              <Num label="Discharge Q" unit="m³/s" value={Q} onChange={setQ} min={0.01} max={500} step="0.1" />
            </Card>
          </div>

          <div className="space-y-5">
            {'yn' in res ? (
              <>
                <ResultCard title="Normal depth — uniform flow">
                  <Row label="Normal depth yn" value={`${f3(res.yn)} m`} sub={`A = ${f3(res.g.A)} m² · R = ${f3(res.g.R)} m`} />
                  <Row label="Velocity V" value={`${f3(res.V)} m/s`} sub={`Q = ${f3(Q)} m³/s`} />
                  <Row label="Froude number" value={f3(res.Fr)} sub={res.Fr < 1 ? 'subcritical — tranquil' : 'supercritical — rapid'} alert={res.Fr >= 1} />
                  {yPeak !== null && (
                    <Row label="Peak capacity depth" value={`${f2(yPeak / (ch as { D: number }).D)} · D`} sub="Manning Q peaks here, not at full" />
                  )}
                </ResultCard>

                <DrawingCard title="Section at the normal depth" meta="to scale · water surface at yn">
                  <SectionSketch shape={ch} y={res.yn}
                    caption={`Manning: Q = (1/n)·A·R^2/3·√S — n = ${f3(n)}, S = ${f3(slope)} m/m`} />
                </DrawingCard>

                <WorkedSolution steps={steps} title="Normal depth — step-by-step" />
              </>
            ) : (
              <>
                <ResultCard title="Check the inputs">
                  <p className="text-sm text-fail">{res.error.message}</p>
                  <p className="mt-2 text-sm text-muted">
                    Bottom width, side slope and diameter must be positive; Q must fit the section.
                    A circular pipe rejects any Q beyond its peak Manning capacity
                    {' '}{yPeak !== null ? `(near y/D = ${f2(yPeak / (ch as { D: number }).D)})` : ''} — widen the pipe or flatten the slope.
                  </p>
                </ResultCard>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
