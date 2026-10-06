import { useState } from 'react'
import {
  operatingPoint, npsh, affinity, systemHead, pumpHead, hwFriction, minorLoss, PATM_HEAD, type SystemInput, type PumpSpec, type OperatingPoint, type NpshResult,
} from '../engine/pumpStation'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { PumpCurves } from '../components/waterCharts'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// Pump Station — system curve vs pump curve operating point, NPSH margin
// and the power chain, for one pumping circuit.

const SAMPLE_SYS: SystemInput = {
  staticLift: 20, pressureHead: 0,
  suction: { L: 50, D: 0.3, C: 120, K: 2 },
  discharge: { L: 300, D: 0.3, C: 120, K: 5 },
}
const SAMPLE_PUMP = { H0: 30, Qd: 0.12, Hd: 24, eta: 0.7, motorEta: 0.9 }

export default function PumpStation() {
  const [staticLift, setStaticLift] = useState(SAMPLE_SYS.staticLift)
  const [pressureHead, setPressureHead] = useState(SAMPLE_SYS.pressureHead)
  const [sL, setSL] = useState(SAMPLE_SYS.suction.L)
  const [sD, setSD] = useState(SAMPLE_SYS.suction.D)
  const [sC, setSC] = useState(SAMPLE_SYS.suction.C)
  const [sK, setSK] = useState(SAMPLE_SYS.suction.K)
  const [dL, setDL] = useState(SAMPLE_SYS.discharge.L)
  const [dD, setDD] = useState(SAMPLE_SYS.discharge.D)
  const [dC, setDC] = useState(SAMPLE_SYS.discharge.C)
  const [dK, setDK] = useState(SAMPLE_SYS.discharge.K)
  const [H0, setH0] = useState(SAMPLE_PUMP.H0)
  const [Qd, setQd] = useState(SAMPLE_PUMP.Qd)
  const [Hd, setHd] = useState(SAMPLE_PUMP.Hd)
  const [eta, setEta] = useState(SAMPLE_PUMP.eta)
  const [motorEta, setMotorEta] = useState(SAMPLE_PUMP.motorEta)
  const [vapourHead, setVapourHead] = useState(0.24)
  const [zSuction, setZSuction] = useState(2)
  const [npshRequired, setNpshRequired] = useState(3)

  const sys: SystemInput = {
    staticLift, pressureHead,
    suction: { L: sL, D: sD, C: sC, K: sK },
    discharge: { L: dL, D: dD, C: dC, K: dK },
  }
  const pump: PumpSpec = { H0, Qd, Hd, eta, motorEta }

  const out: { op: OperatingPoint | null; nps: NpshResult | null; err: string | null } = (() => {
    try {
      const o = operatingPoint(sys, pump)
      const hfSuction = o.Q > 0 ? hwFriction(sL, o.Q, sC, sD) + minorLoss(o.Q, sD, sK) : 0
      return { op: o, nps: npsh({ patmHead: PATM_HEAD, vapourHead, zSuction, hfSuction, npshRequired }), err: null }
    } catch (e) {
      return { op: null, nps: null, err: e instanceof Error ? e.message : 'Check the inputs' }
    }
  })()
  const { op, nps, err } = out

  const r115 = op ? affinity(op.Q, op.H, op.Pshaft, 1.15) : null

  const steps: SolutionStep[] = op ? [
    {
      title: 'The system curve',
      lines: [
        { tex: 'H_{sys}(Q) = H_{static} + h_f(Q) + h_m(Q)' },
        { tex: `h_f = \\frac{10.67\\,L\\,Q^{1.852}}{C^{1.852} D^{4.8704}} \\quad h_m = \\Sigma K \\frac{V^2}{2g}` },
        { tex: `h_{f,s} = \\frac{10.67\\times ${f2(sL)}\\times ${f3(op.Q)}^{1.852}}{${f2(sC)}^{1.852}\\times ${f3(sD)}^{4.8704}} = ${f3(hwFriction(sL, op.Q, sC, sD))}\\text{ m}, \\; h_{f,d} = \\frac{10.67\\times ${f2(dL)}\\times ${f3(op.Q)}^{1.852}}{${f2(dC)}^{1.852}\\times ${f3(dD)}^{4.8704}} = ${f3(hwFriction(dL, op.Q, dC, dD))}\\text{ m}` },
        { tex: `h_m = ${f2(sK)}\\times\\frac{${f3(op.Q / (Math.PI * sD * sD / 4))}^2}{19.62} + ${f2(dK)}\\times\\frac{${f3(op.Q / (Math.PI * dD * dD / 4))}^2}{19.62} = ${f3(minorLoss(op.Q, sD, sK) + minorLoss(op.Q, dD, dK))}\\text{ m}` },
        { tex: `H_{sys}(${f3(op.Q)}) = ${f2(staticLift)} + ${f2(pressureHead)} + ${f3(hwFriction(sL, op.Q, sC, sD) + hwFriction(dL, op.Q, dC, dD))} + ${f3(minorLoss(op.Q, sD, sK) + minorLoss(op.Q, dD, dK))} = ${f2(op.H)}\\text{ m}` },
        { text: `Static lift ${f2(staticLift)} m plus ${f2(pressureHead)} m delivery head; Hazen–Williams on both legs (C ${f2(sC)} suction / ${f2(dC)} discharge) and ${f2(sK + dK)} K-units of fittings. At the operating point the circuit demands H = ${f2(op.H)} m.` },
      ],
    },
    {
      title: 'The pump curve and the crossing',
      lines: [
        { tex: `H_{pump}(Q) = H_0 - (H_0 - H_d)\\left(\\frac{Q}{Q_d}\\right)^2` },
        { tex: `H_{pump}(${f3(op.Q)}) = ${f2(H0)} - (${f2(H0)}-${f2(Hd)})\\times\\left(\\frac{${f3(op.Q)}}{${f3(Qd)}}\\right)^2 = ${f2(op.H)}\\text{ m} = H_{sys}` },
        { text: `Pinned on shutoff H0 = ${f2(H0)} m and the rated point (${f3(Qd)} m³/s, ${f2(Hd)} m). The pump head falls, the system head rises — bisection finds the unique crossing.` },
        { tex: `Q^{*} = ${f3(op.Q)}\\ \\text{m}^3/\\text{s} \\quad H^{*} = ${f2(op.H)}\\ \\text{m}` },
      ],
    },
    {
      title: 'Power chain',
      lines: [
        { tex: `P_{water} = \\gamma\\,Q^{*}H^{*} = 9.81\\times ${f3(op.Q)}\\times ${f2(op.H)} = ${f2(op.Pwater)}\\ \\text{kW}` },
        { tex: `P_{shaft} = \\frac{P_{water}}{\\eta_{pump}} = \\frac{${f2(op.Pwater)}}{${f2(eta)}} = ${f2(op.Pshaft)}\\ \\text{kW}, \\; P_{motor} = \\frac{P_{shaft}}{\\eta_{motor}} = \\frac{${f2(op.Pshaft)}}{${f2(motorEta)}} = ${f2(op.Pmotor)}\\ \\text{kW}` },
        { text: `Pump η = ${f2(eta)} at the rated point, motor η = ${f2(motorEta)}; the unit carries ${f2(op.kwhPerM3)} kWh of shaft energy per m³ lifted. A +15 % speed turn by the affinity laws would move the duty to ${f3(r115?.Q ?? 0)} m³/s at ${f2(r115?.H ?? 0)} m (${f2(r115?.P ?? 0)} kW shaft — cubes, mind the motor).` },
      ],
    },
    ...(nps ? [{
      title: 'NPSH margin at the suction',
      lines: [
        { tex: `NPSH_a = \\frac{P_{atm} - P_v}{\\gamma} + z_{suction} - h_{f,s} = (${f2(PATM_HEAD)} - ${f2(vapourHead)}) + ${f2(zSuction)} - ${f3(hwFriction(sL, op.Q, sC, sD) + minorLoss(op.Q, sD, sK))} = ${f2(nps.npshAvailable)}\\ \\text{m}` },
        { text: `Suction losses at duty: Hazen–Williams + fittings on the ${f2(sL)} m suction leg (${f2(sK)} K-units). Sea-level atmosphere ${f2(PATM_HEAD)} m, vapour head ${f2(vapourHead)} m.` },
        { tex: `NPSH_a ${nps.ok ? '\\geq' : '<'} 1.3\\times NPSH_r = ${f2(nps.npshRequired)}\\ \\text{m}` },
        { text: nps.ok
          ? 'The +30 % margin over the datasheet NPSHr is the usual purchase requirement — the impeller sees no cavitation at duty.'
          : 'The suction side fails the +30 % margin: lower the pump, flood the suction, shorten the suction run or fit a larger suction diameter.' },
      ],
    }] : []),
  ] : [{ title: 'Check the inputs', lines: [{ text: err ?? 'Check the inputs.' }] }]

  // both curves sampled to 2.2 × the duty flow for the chart
  const curves = op ? Array.from({ length: 81 }, (_, i) => {
    const q = (i / 80) * op.Q * 2.2
    return { sys: { Q: q, H: systemHead(sys, q) }, pump: { Q: q, H: pumpHead(q, H0, Qd, Hd) } }
  }) : []
  const loadSample = () => { setStaticLift(20); setPressureHead(0); setSL(50); setSD(0.3); setSC(120); setSK(2); setDL(300); setDD(0.3); setDC(120); setDK(5); setH0(30); setQd(0.12); setHd(24); setEta(0.7); setMotorEta(0.9) }
  return (
    <WorkspacePage title="Pump Station" badges={['Water supply', 'Duty point · NPSH']}
      intro="One pumping circuit end to end: the system curve the pipework demands, the pump curve the impeller gives, their crossing as the duty point, the power chain down to the motor, and the NPSH margin that keeps the impeller off cavitation."
      inputs={<>
        <InputGroup title="Lift">
          <Num label="Static lift" unit="m" value={staticLift} onChange={setStaticLift} min={0} step="0.5" />
          <Num label="Delivery pressure" unit="m" value={pressureHead} onChange={setPressureHead} min={0} step="1" />
        </InputGroup>
        <InputGroup title="Suction leg" hint="Hazen–Williams C and the fittings' ΣK.">
          <Num label="Length" unit="m" value={sL} onChange={setSL} min={1} step="5" />
          <Num label="Diameter" unit="m" value={sD} onChange={setSD} min={0.05} max={1.5} step="0.05" />
          <Num label="C" value={sC} onChange={setSC} min={60} max={150} step="5" />
          <Num label="ΣK" value={sK} onChange={setSK} min={0} step="0.5" />
        </InputGroup>
        <InputGroup title="Discharge leg">
          <Num label="Length" unit="m" value={dL} onChange={setDL} min={1} step="10" />
          <Num label="Diameter" unit="m" value={dD} onChange={setDD} min={0.05} max={1.5} step="0.05" />
          <Num label="C" value={dC} onChange={setDC} min={60} max={150} step="5" />
          <Num label="ΣK" value={dK} onChange={setDK} min={0} step="0.5" />
        </InputGroup>
        <InputGroup title="Pump" hint="Curve pinned on shutoff and the rated point.">
          <Num label="Shutoff head H₀" unit="m" value={H0} onChange={setH0} min={1} step="1" />
          <Num label="Rated head Hd" unit="m" value={Hd} onChange={setHd} min={0.5} step="0.5" />
          <Num label="Rated flow Qd" unit="m³/s" value={Qd} onChange={setQd} min={0.001} step="0.01" />
          <Num label="Pump η" value={eta} onChange={setEta} min={0.2} max={0.95} step="0.01" />
          <Num label="Motor η" value={motorEta} onChange={setMotorEta} min={0.5} max={1} step="0.01" />
        </InputGroup>
        <InputGroup title="Suction conditions">
          <div className="col-span-2">
            <Pick label="Arrangement" value={String(zSuction)} onChange={(v) => setZSuction(Number(v))}
              options={[['2', 'Flooded +2 m'], ['0', 'Level with the impeller'], ['-3', 'Lift −3 m'], ['-6', 'Lift −6 m']]} />
          </div>
          <Num label="Vapour head" unit="m" value={vapourHead} onChange={setVapourHead} min={0} max={3} step="0.02" />
          <Num label="NPSHr" unit="m" value={npshRequired} onChange={setNpshRequired} min={0.5} step="0.5" />
          <div className="col-span-2">
            <button type="button" onClick={loadSample}
              className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">Sample: 20 m lift, DN 300, pump 30/24</button>
          </div>
        </InputGroup>
      </>}
      checks={op && nps ? <>
        <CheckCard title="Duty point" basis="pump curve = system curve" status="info" value={f3(op.Q)} unit="m³/s"
          formula="H₀ − (H₀ − Hd)(Q/Qd)² = Hsys(Q)"
          pairs={[{ label: 'Head H*', value: `${f2(op.H)} m` }, { label: 'Flow', value: `${f2(op.Q * 1000)} L/s` }]} />
        <CheckCard title="NPSH" basis="NPSHa ≥ 1.3 NPSHr" status={nps.ok ? 'pass' : 'fail'} value={f2(nps.npshAvailable)} unit="m available"
          formula="NPSHa = (Patm − Pv)/γ + z − hf,s" ratio={nps.npshAvailable > 0 ? nps.npshRequired / nps.npshAvailable : undefined} ratioLabel="1.3 NPSHr ÷ NPSHa"
          pairs={[{ label: 'Required ×1.3', value: `${f2(nps.npshRequired)} m` }, { label: 'Margin', value: `${f2(nps.margin)} m` }]} />
        <CheckCard title="Power" basis="γQH / η" status="info" value={f2(op.Pmotor)} unit="kW motor"
          formula="P = 9.81 Q H / (η_pump η_motor)"
          pairs={[{ label: 'Shaft', value: `${f2(op.Pshaft)} kW` }, { label: 'Energy', value: `${f2(op.kwhPerM3)} kWh/m³` }]} />
      </> : (
        <CheckCard title="Check the inputs" basis="pump station" status="warn" pillLabel="CHECK" value="—" formula={err ?? 'Check the inputs.'} />
      )}
      summary={[
        { label: 'Static lift', value: `${f2(staticLift + pressureHead)} m` },
        { label: 'Suction', value: `${f2(sL)} m × ${f2(sD)} m, C ${f2(sC)}` },
        { label: 'Discharge', value: `${f2(dL)} m × ${f2(dD)} m, C ${f2(dC)}` },
        { label: 'Pump', value: `H₀ ${f2(H0)} m, ${f3(Qd)} m³/s at ${f2(Hd)} m` },
      ]}
      drawing={op ? { title: 'Pump and system curves', node: <div data-pdf-drawing><PumpCurves pump={curves.map((c) => c.pump)} system={curves.map((c) => c.sys)} Hstatic={staticLift + pressureHead} H0={H0} Q={op.Q} H={op.H} /></div> } : undefined}
      results={op && nps ? [
        { check: 'Duty flow Q*', basis: 'curve crossing', demand: `${f3(op.Q)} m³/s`, status: 'info' as const },
        { check: 'Duty head H*', basis: `static ${f2(staticLift + pressureHead)} m + losses`, demand: `${f2(op.H)} m`, status: 'info' as const },
        { check: 'Motor power', basis: `η ${f2(eta)} × ${f2(motorEta)}`, demand: `${f2(op.Pmotor)} kW`, status: 'info' as const },
        { check: 'NPSH available', basis: '≥ 1.3 × NPSHr', demand: `${f2(nps.npshAvailable)} m`, limit: `${f2(nps.npshRequired)} m`, ratio: nps.npshAvailable > 0 ? nps.npshRequired / nps.npshAvailable : undefined, status: nps.ok ? 'pass' as const : 'fail' as const },
      ] : [{ check: 'Duty', basis: err ?? 'invalid input', demand: '—', status: 'warn' as const }]}
      steps={steps}
      references={[
        { topic: 'Friction loss', basis: 'Hazen–Williams, SI form 10.67 L Q^1.852 / (C^1.852 D^4.8704)', source: 'AWWA M32; Mays, Water Resources Engineering' },
        { topic: 'Duty point', basis: 'crossing of pump and system curves', source: 'Hydraulic Institute ANSI/HI 9.6.3' },
        { topic: 'NPSH margin', basis: 'NPSHa ≥ 1.3 NPSHr', source: 'ANSI/HI 9.6.1 (margin ratio guidance)' },
        { topic: 'Affinity laws', basis: 'Q ∝ N, H ∝ N², P ∝ N³', source: 'Karassik, Pump Handbook' },
      ]}
    />
  )
}
