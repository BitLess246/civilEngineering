import { useState } from 'react'
import 'katex/dist/katex.min.css'
import {
  detentionRoute, triangularInflow, outletFlow, pondGeometry,
  type PondResult,
} from '../engine/detention'
import { Card, Num, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, MUTED, HAIR, f2, f3 } from '../lib/influenceStyle'

// Detention pond routing — level-pool storage indication: the trapezoidal
// basin gives stage–storage, the orifice (plus optional weir) gives
// stage–discharge, and the routing steps the inflow hydrograph through the
// 2S/Δt + O curve with the mass balance checked end to end.

const TRI = { Qp: 1.5, tp: 30, tb: 90, dt: 1 }

export default function Detention() {
  const [bottomWidth, setBottomWidth] = useState(35)
  const [bottomLength, setBottomLength] = useState(35)
  const [sideZ, setSideZ] = useState(2)
  const [depthMax, setDepthMax] = useState(2)
  const [orificeArea, setOrificeArea] = useState(0.15)
  const [orificeCd, setOrificeCd] = useState(0.6)
  const [orificeInvert, setOrificeInvert] = useState(0)
  const [weirLength, setWeirLength] = useState(0)
  const [weirCrest, setWeirCrest] = useState(1.2)
  const [weirC, setWeirC] = useState(1.84)
  const [dtMin, setDtMin] = useState(1)
  const [Qp, setQp] = useState(TRI.Qp)
  const [tp, setTp] = useState(TRI.tp)
  const [tb, setTb] = useState(TRI.tb)

  const inflow: number[] = (() => {
    try { return triangularInflow(Qp, tp, tb, dtMin) } catch { return [] }
  })()

  const out: { r: PondResult | null; error: string | null } = (() => {
    try {
      return { r: detentionRoute({
        bottomWidth, bottomLength, sideZ, depthMax,
        orificeArea, orificeCd, orificeInvert,
        weirLength, weirCrest, weirC, dtMin, inflow,
      }), error: null }
    } catch (e) {
      return { r: null, error: e instanceof Error ? e.message : 'Invalid input.' }
    }
  })()
  const r = out.r

  const steps: SolutionStep[] = r ? [
    {
      title: 'Stage–storage (trapezoidal basin)',
      lines: [
        { tex: 'A(h) = (W + 2zh)(L + 2zh)' },
        { tex: `A(${f2(depthMax)}) = (${f2(bottomWidth)} + 2\\times ${f2(sideZ)}\\times ${f2(depthMax)})(${f2(bottomLength)} + 2\\times ${f2(sideZ)}\\times ${f2(depthMax)}) = ${f0(pondGeometry(bottomWidth, bottomLength, sideZ, depthMax).area)}\\ \\text{m}^2` },
        { tex: 'S(h) = WLh + z(W+L)h^2 + \\tfrac{4}{3}z^2h^3' },
        { tex: `S(${f2(depthMax)}) = ${f2(bottomWidth)}\\times ${f2(bottomLength)}\\times ${f2(depthMax)} + ${f2(sideZ)}(${f2(bottomWidth)}+${f2(bottomLength)})${f2(depthMax)}^2 + \\tfrac{4}{3}${f2(sideZ)}^2${f2(depthMax)}^3 = ${f0(pondGeometry(bottomWidth, bottomLength, sideZ, depthMax).storage)}\\ \\text{m}^3` },
        { text: `W = ${f2(bottomWidth)} m, L = ${f2(bottomLength)} m, side slope z = ${f2(sideZ)}. At the usable depth ${f2(depthMax)} m the pond stores ${f0(pondGeometry(bottomWidth, bottomLength, sideZ, depthMax).storage)} m³.` },
      ],
    },
    {
      title: 'Stage–discharge (outlet works)',
      lines: [
        { tex: 'Q_o = C_d\\,a\\sqrt{2g\\,h_o} \\qquad Q_w = C\\,L_w h_w^{3/2}' },
        { tex: `Q_o = ${f2(orificeCd)}\\times ${f2(orificeArea)}\\sqrt{2\\times 9.81\\times ${f2(Math.max(r.peakStage - orificeInvert, 0))}} = ${f3(orificeArea > 0 && r.peakStage > orificeInvert ? orificeCd * orificeArea * Math.sqrt(2 * 9.81 * (r.peakStage - orificeInvert)) : 0)}\\ \\text{m}^3/\\text{s} \\;\\; (h_o = ${f2(r.peakStage)} - ${f2(orificeInvert)})` },
        ...(weirLength > 0
          ? [{ tex: `Q_w = ${f2(weirC)}\\times ${f2(weirLength)}\\times ${f2(Math.max(r.peakStage - weirCrest, 0))}^{3/2} = ${f3(r.peakStage > weirCrest ? weirC * weirLength * Math.pow(r.peakStage - weirCrest, 1.5) : 0)}\\ \\text{m}^3/\\text{s} \\;\\; (h_w = ${f2(r.peakStage)} - ${f2(weirCrest)})` }]
          : []),
        { tex: `Q(${f3(r.peakStage)}) = ${f3(outletFlow(r.peakStage, { orificeArea, orificeCd, orificeInvert, weirLength, weirCrest, weirC }))}\\ \\text{m}^3/\\text{s} \\;\\; (Q_o + Q_w)` },
        { text: `Orifice a = ${f2(orificeArea)} m² (Cd = ${f2(orificeCd)}) set ${f2(orificeInvert)} m above the bottom${weirLength > 0 ? `; rectangular weir ${f2(weirLength)} m long on a crest ${f2(weirCrest)} m up (C = ${f2(weirC)})` : '; no weir'}. Peak outflow capacity at the routed high stage: ${f3(outletFlow(r.peakStage, { orificeArea, orificeCd, orificeInvert, weirLength, weirCrest, weirC }))} m³/s.` },
      ],
    },
    {
      title: 'Storage-indication routing',
      lines: [
        { tex: '\\frac{2S_2}{\\Delta t} + O_2 = (I_1 + I_2) + \\left(\\frac{2S_1}{\\Delta t} - O_1\\right)' },
        ...(inflow.length > 1 && r.stages.length > 1
          ? [{ tex: `F_1 = (I_0+I_1) + (F_0-2O_0) = (${f3(inflow[0])}+${f3(inflow[1])}) + 0 = ${f3(inflow[0] + inflow[1])} \\;\\Rightarrow\\; h_1 = ${f3(r.stages[1])}\\text{ m},\\; O_1 = ${f3(r.outflows[1])}\\text{ m}^3\\text{/s}` }]
          : []),
        { text: `Every Δt = ${f2(dtMin)} min the right side is known; the strictly increasing curve F(h) = 2S/Δt + O is inverted by bisection for the new stage, so each step is unambiguous.` },
      ],
    },
    {
      title: 'Performance',
      lines: [
        { tex: `Q_{p,in} = ${f3(r.peakIn)} \\rightarrow Q_{p,out} = ${f3(r.peakOut)}\\ \\text{m}^3/\\text{s}` },
        { text: `Attenuation ${f2(r.attenuationPct)} % with the outflow peak ${f0(r.lagMin)} min behind the inflow peak. Maximum stage ${f3(r.peakStage)} m ${r.peakStage > depthMax ? '— ABOVE the usable depth: the pond overtops.' : `of the ${f2(depthMax)} m usable depth (freeboard ${f2(depthMax - r.peakStage)} m).`}` },
        { text: `Mass balance: inflow ${f0(r.inflowVolume)} m³ = outflow ${f0(r.outflowVolume)} m³ + residual storage ${f0(r.residualStorage)} m³ (error ${f3(r.massErrorPct)} %).` },
      ],
    },
    ...r.warnings.map((w) => ({ title: 'Warning', lines: [{ text: w }] })),
  ] : []

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
      <ReportControls title="Detention Routing Report" badges={[r ? `peak stage ${f2(r.peakStage)} m` : 'level-pool routing']} />
      <p className="mt-2 max-w-3xl text-sm text-muted">
        Route a storm through a detention pond with the level-pool (storage-indication)
        method: a trapezoidal basin provides stage–storage, an orifice and optional weir
        provide stage–discharge, and the inflow hydrograph — the triangular TR-55 shape from
        the SCS Runoff tool — is stepped through the 2S/Δt + O curve with the mass balance
        checked.
      </p>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="Basin (trapezoidal prism)">
            <Num label="Bottom width W" unit="m" value={bottomWidth} onChange={setBottomWidth} min={1} max={500} step="1" />
            <Num label="Bottom length L" unit="m" value={bottomLength} onChange={setBottomLength} min={1} max={500} step="1" />
            <Num label="Side slope z (zH:1V)" value={sideZ} onChange={setSideZ} min={0} max={6} step="0.25" />
            <Num label="Usable depth" unit="m" value={depthMax} onChange={setDepthMax} min={0.2} max={15} step="0.1" />
          </Card>

          <Card title="Outlets">
            <Num label="Orifice area a" unit="m²" value={orificeArea} onChange={setOrificeArea} min={0} max={10} step="0.05" />
            <Num label="Orifice Cd" value={orificeCd} onChange={setOrificeCd} min={0.1} max={1} step="0.05" />
            <Num label="Orifice invert" unit="m above bottom" value={orificeInvert} onChange={setOrificeInvert} min={0} max={depthMax} step="0.1" />
            <Num label="Weir length" unit="m (0 = none)" value={weirLength} onChange={setWeirLength} min={0} max={100} step="0.5" />
            <Num label="Weir crest" unit="m above bottom" value={weirCrest} onChange={setWeirCrest} min={0} max={depthMax} step="0.1" />
            <Num label="Weir C (Francis, SI)" value={weirC} onChange={setWeirC} min={1} max={2.2} step="0.02" />
          </Card>

          <Card title="Storm (triangular inflow)">
            <Num label="Peak inflow Qp" unit="m³/s" value={Qp} onChange={setQp} min={0.1} max={200} step="0.5" />
            <Num label="Time to peak" unit="min" value={tp} onChange={setTp} min={1} max={600} step="1" />
            <Num label="Base time" unit="min" value={tb} onChange={setTb} min={2} max={1440} step="5" />
            <Num label="Routing interval Δt" unit="min" value={dtMin} onChange={setDtMin} min={0.5} max={30} step="0.5" />
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="button"
                onClick={() => { setBottomWidth(35); setBottomLength(35); setSideZ(2); setDepthMax(2); setOrificeArea(0.15); setOrificeCd(0.6); setOrificeInvert(0); setWeirLength(0); setWeirCrest(1.2); setWeirC(1.84); setDtMin(1); setQp(1.5); setTp(30); setTb(90) }}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                Load the sample — 1.5 m³/s storm on a 35 × 35 m pond
              </button>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          {r && inflow.length > 2 ? (
            <>
              <ResultCard title="Routing result">
                <Row label="Peak inflow → outflow" value={`${f2(r.peakIn)} → ${f2(r.peakOut)} m³/s`} sub={`attenuation ${f2(r.attenuationPct)} % · lag ${f0(r.lagMin)} min`} />
                <Row label="Maximum stage" value={`${f3(r.peakStage)} m`} sub={r.peakStage > depthMax ? `OVERTOPS the ${f2(depthMax)} m usable depth` : `usable depth ${f2(depthMax)} m · freeboard ${f2(depthMax - r.peakStage)} m`} />
                <Row label="Storage at peak" value={`${f0(pondGeometry(bottomWidth, bottomLength, sideZ, r.peakStage).storage)} m³`} sub={`of ${f0(pondGeometry(bottomWidth, bottomLength, sideZ, depthMax).storage)} m³ capacity`} />
                <Row label="Mass balance" value={`${f3(r.massErrorPct)} %`} sub={`in ${f0(r.inflowVolume)} = out ${f0(r.outflowVolume)} + stored ${f0(r.residualStorage)} m³`} />
              </ResultCard>

              <DrawingCard title="Routing hydrographs" meta={`inflow vs outflow at Δt = ${f2(dtMin)} min`}>
                <RoutingDrawing result={r} inflow={inflow} depthMax={depthMax} />
              </DrawingCard>

              <WorkedSolution steps={steps} title="Detention routing — step by step" />
            </>
          ) : (
            <ResultCard title="Check the inputs">
              <p className="text-sm text-fail">{out.error ?? 'Give a consistent triangular storm (time to peak shorter than base time) and at least one outlet.'}</p>
            </ResultCard>
          )}
        </div>
      </div>
    </div>
  )
}

const f0 = (v: number) => Math.round(v).toString()

function RoutingDrawing({ result, inflow, depthMax }: { result: PondResult; inflow: number[]; depthMax: number }) {
  const W = 640, H = 360
  const x0 = 62, x1 = W - 44
  const splitY = 196
  const topY = 40, baseY = splitY - 26
  const stageBase = H - 44, stageTop = splitY + 26
  const tEnd = inflow.length - 1
  const qMax = Math.max(result.peakIn, ...result.curve.map((c) => c.outflow), 0.5) * 1.12
  const hMax = Math.max(depthMax * 1.25, result.peakStage * 1.15)
  const px = (i: number) => x0 + (i / Math.max(tEnd, 1)) * (x1 - x0)
  const py = (q: number) => baseY - (q / qMax) * (baseY - topY)
  const ph = (h: number) => stageBase - (h / hMax) * (stageBase - stageTop)

  const flowPath = (qs: number[]) => qs.map((q, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(2)} ${py(q).toFixed(2)}`).join(' ')
  const flowArea = (qs: number[]) => `${flowPath(qs)} L ${px(qs.length - 1)} ${baseY} L ${px(0)} ${baseY} Z`
  const stagePath = `M ${px(0)} ${ph(0)} ` + result.stages.map((s, i) => `L ${px(i).toFixed(2)} ${ph(s).toFixed(2)}`).join(' ')
  const iPeakOut = result.outflows.indexOf(result.peakOut)

  return (
    <DrawingFrame label="Detention routing — hydrographs and stage">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Routing hydrographs and stage">
        {/* hydrograph panel */}
        <line x1={x0} x2={x1} y1={baseY} y2={baseY} stroke={INK} strokeWidth="1.2" />
        <line x1={x0} x2={x0} y1={topY - 6} y2={baseY} stroke={INK} strokeWidth="1.2" />
        <path d={flowArea(result.outflows)} fill="rgba(15,76,146,0.14)" stroke="none" />
        <path d={flowPath(result.outflows)} stroke="rgba(15,76,146,0.95)" strokeWidth="2" fill="none" />
        <path d={flowPath(inflow)}
          stroke="rgba(15,76,146,0.55)" strokeWidth="1.4" fill="none" strokeDasharray="5 3" />
        <text x={x0 + 6} y={topY - 10} fontSize="9.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">
          outflow (solid) vs inflow (dashed) — peak {f2(result.peakIn)} → {f2(result.peakOut)} m³/s
        </text>
        <text x={14} y={topY + 4} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">Q m³/s</text>
        <text x={x0} y={baseY + 14} fontSize="9.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">0</text>
        <text x={x1} y={baseY + 14} textAnchor="end" fontSize="9.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">{f0(tEnd)}·Δt min</text>
        {/* peak outflow marker */}
        <line x1={px(iPeakOut)} x2={px(iPeakOut)} y1={py(result.peakOut)} y2={baseY} stroke={MUTED} strokeWidth="1" strokeDasharray="3 3" />

        {/* stage panel */}
        <line x1={x0} x2={x1} y1={stageBase} y2={stageBase} stroke={INK} strokeWidth="1.2" />
        <line x1={x0} x2={x0} y1={stageTop - 6} y2={stageBase} stroke={INK} strokeWidth="1.2" />
        {/* usable depth + crest guides */}
        <line x1={x0} x2={x1} y1={ph(depthMax)} y2={ph(depthMax)} stroke="rgba(220,80,80,0.7)" strokeWidth="1.1" strokeDasharray="6 3" />
        <text x={x1 - 4} y={ph(depthMax) - 4} textAnchor="end" fontSize="9.5" fill="rgba(220,80,80,0.9)" fontFamily="var(--font-mono, monospace)">usable {f2(depthMax)} m</text>
        <path d={stagePath} stroke="rgba(15,76,146,0.9)" strokeWidth="2" fill="none" />
        <path d={`${stagePath} L ${px(tEnd)} ${stageBase} L ${px(0)} ${stageBase} Z`} fill="rgba(15,76,146,0.12)" stroke="none" />
        <text x={14} y={stageTop + 4} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">stage m</text>
        <text x={x0 + 6} y={stageTop - 10} fontSize="9.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">
          peak stage {f3(result.peakStage)} m {result.peakStage > depthMax ? '— overtops!' : ''}
        </text>
        {/* separator hatching */}
        {Array.from({ length: 30 }, (_, i) => {
          const x = x0 + (i / 29) * (x1 - x0)
          return <line key={i} x1={x} x2={x + 6} y1={splitY + 6} y2={splitY} stroke={HAIR} strokeWidth="1" />
        })}
      </svg>
    </DrawingFrame>
  )
}
