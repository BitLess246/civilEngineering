import { useState } from 'react'
import {
  detentionRoute, triangularInflow, outletFlow, pondGeometry,
  type PondResult,
} from '../engine/detention'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { DetentionCharts } from '../components/waterCharts'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

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
  ] : [{ title: 'Check the inputs', lines: [{ text: out.error ?? 'Give a consistent triangular storm (time to peak shorter than base time) and at least one outlet.' }] }]

  const ok = !!r && inflow.length > 2
  const over = ok && r!.peakStage > depthMax
  const cap = pondGeometry(bottomWidth, bottomLength, sideZ, depthMax).storage
  const sample = () => { setBottomWidth(35); setBottomLength(35); setSideZ(2); setDepthMax(2); setOrificeArea(0.15); setOrificeCd(0.6); setOrificeInvert(0); setWeirLength(0); setWeirCrest(1.2); setWeirC(1.84); setDtMin(1); setQp(1.5); setTp(30); setTb(90) }
  return (
    <WorkspacePage title="Detention Pond" badges={['Hydrology', 'Level-pool routing']}
      intro="Route a storm through a detention pond by storage indication: the trapezoidal basin gives stage–storage, the orifice and optional weir give stage–discharge, and the inflow hydrograph steps through the 2S/Δt + O curve with the mass balance checked."
      inputs={<>
        <InputGroup title="Basin" hint="Trapezoidal prism; side slope z horizontal : 1 vertical.">
          <Num label="Bottom width W" unit="m" value={bottomWidth} onChange={setBottomWidth} min={1} max={500} step="1" />
          <Num label="Bottom length L" unit="m" value={bottomLength} onChange={setBottomLength} min={1} max={500} step="1" />
          <Num label="Side slope z" value={sideZ} onChange={setSideZ} min={0} max={6} step="0.25" />
          <Num label="Usable depth" unit="m" value={depthMax} onChange={setDepthMax} min={0.2} max={15} step="0.1" />
        </InputGroup>
        <InputGroup title="Outlets" hint="Heights measured above the pond bottom; weir length 0 = no weir.">
          <Num label="Orifice area" unit="m²" value={orificeArea} onChange={setOrificeArea} min={0} max={10} step="0.05" />
          <Num label="Orifice Cd" value={orificeCd} onChange={setOrificeCd} min={0.1} max={1} step="0.05" />
          <Num label="Orifice invert" unit="m" value={orificeInvert} onChange={setOrificeInvert} min={0} max={depthMax} step="0.1" />
          <Num label="Weir length" unit="m" value={weirLength} onChange={setWeirLength} min={0} max={100} step="0.5" />
          <Num label="Weir crest" unit="m" value={weirCrest} onChange={setWeirCrest} min={0} max={depthMax} step="0.1" />
          <Num label="Weir C" value={weirC} onChange={setWeirC} min={1} max={2.2} step="0.02" />
        </InputGroup>
        <InputGroup title="Storm" hint="Triangular inflow hydrograph.">
          <Num label="Peak inflow Qp" unit="m³/s" value={Qp} onChange={setQp} min={0.1} max={200} step="0.5" />
          <Num label="Time to peak" unit="min" value={tp} onChange={setTp} min={1} max={600} step="1" />
          <Num label="Base time" unit="min" value={tb} onChange={setTb} min={2} max={1440} step="5" />
          <Num label="Interval Δt" unit="min" value={dtMin} onChange={setDtMin} min={0.5} max={30} step="0.5" />
          <div className="col-span-2">
            <button type="button" onClick={sample} className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">Sample: 1.5 m³/s storm, 35 × 35 m pond</button>
          </div>
        </InputGroup>
      </>}
      checks={ok ? <>
        <CheckCard title="Peak stage" basis={`usable depth ${f2(depthMax)} m`} status={over ? 'fail' : 'pass'} pillLabel={over ? 'OVERTOPS' : 'CONTAINED'}
          value={f3(r!.peakStage)} unit="m" ratio={r!.peakStage / depthMax} ratioLabel="Stage ÷ usable depth"
          pairs={[{ label: 'Freeboard', value: `${f2(depthMax - r!.peakStage)} m` }, { label: 'Storage used', value: `${f0(pondGeometry(bottomWidth, bottomLength, sideZ, r!.peakStage).storage)} of ${f0(cap)} m³` }]} />
        <CheckCard title="Peak outflow" basis={`inflow peak ${f2(r!.peakIn)} m³/s`} status="info" value={f3(r!.peakOut)} unit="m³/s" formula="2S₂/Δt + O₂ = I₁ + I₂ + 2S₁/Δt − O₁"
          pairs={[{ label: 'Attenuation', value: `${f2(r!.attenuationPct)} %` }, { label: 'Lag', value: `${f0(r!.lagMin)} min` }]} />
        <CheckCard title="Mass balance" basis="in = out + stored" status={Math.abs(r!.massErrorPct) < 1 ? 'pass' : 'warn'} value={f3(r!.massErrorPct)} unit="% error"
          pairs={[{ label: 'Inflow', value: `${f0(r!.inflowVolume)} m³` }, { label: 'Outflow + stored', value: `${f0(r!.outflowVolume)} + ${f0(r!.residualStorage)} m³` }]} />
      </> : (
        <CheckCard title="Check the inputs" basis="storm and outlets" status="warn" pillLabel="CHECK" value="—" formula={out.error ?? 'Time to peak below base time, and at least one outlet.'} />
      )}
      summary={[
        { label: 'Basin', value: `${f2(bottomWidth)} × ${f2(bottomLength)} m, z ${f2(sideZ)}, ${f2(depthMax)} m deep` },
        { label: 'Capacity', value: `${f0(cap)} m³` },
        { label: 'Orifice', value: `${f2(orificeArea)} m², Cd ${f2(orificeCd)}, at ${f2(orificeInvert)} m` },
        { label: 'Weir', value: weirLength > 0 ? `${f2(weirLength)} m at ${f2(weirCrest)} m, C ${f2(weirC)}` : 'none' },
        { label: 'Storm', value: `Qp ${f2(Qp)} m³/s, tp ${f0(tp)} min, tb ${f0(tb)} min` },
        { label: 'Interval Δt', value: `${f2(dtMin)} min` },
      ]}
      drawing={ok ? { title: 'Hydrographs and stage', node: <div data-pdf-drawing>
        <DetentionCharts inflow={inflow} outflows={r!.outflows} stages={r!.stages} dtMin={dtMin} peakIn={r!.peakIn} peakOut={r!.peakOut} peakStage={r!.peakStage} depthMax={depthMax} />
      </div> } : undefined}
      resultsCaption={ok && r!.warnings.length ? r!.warnings.join(' ') : undefined}
      results={ok ? [
        { check: 'Peak stage', basis: 'storage indication', demand: `${f3(r!.peakStage)} m`, limit: `≤ ${f2(depthMax)} m`, ratio: r!.peakStage / depthMax, status: over ? 'fail' : 'pass' },
        { check: 'Peak outflow', basis: 'orifice + weir at peak stage', demand: `${f3(r!.peakOut)} m³/s`, status: 'info' },
        { check: 'Attenuation', basis: '1 − Qout/Qin', demand: `${f2(r!.attenuationPct)} %`, status: 'info' },
        { check: 'Mass balance', basis: 'in − out − stored', demand: `${f3(r!.massErrorPct)} %`, limit: '< 1 %', status: Math.abs(r!.massErrorPct) < 1 ? 'pass' : 'warn' },
      ] : [{ check: 'Routing', basis: out.error ?? 'invalid input', demand: '—', status: 'warn' }]}
      steps={steps}
      references={[
        { topic: 'Storage indication', basis: '2S₂/Δt + O₂ = (I₁ + I₂) + (2S₁/Δt − O₁)', source: 'Puls method; Chow, Applied Hydrology §8.2' },
        { topic: 'Orifice', basis: 'Q = Cd·a·√(2gh)', source: 'Fluid mechanics' },
        { topic: 'Weir', basis: 'Q = C·L·h^1.5 (Francis, SI)', source: 'USBR Water Measurement Manual' },
      ]}
    />
  )
}

const f0 = (v: number) => Math.round(v).toString()
