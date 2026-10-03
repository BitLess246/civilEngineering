import { useState } from 'react'
import 'katex/dist/katex.min.css'
import {
  operatingPoint, npsh, affinity, systemHead, pumpHead, hwFriction, minorLoss, PATM_HEAD, type SystemInput, type PumpSpec, type OperatingPoint, type NpshResult,
} from '../engine/pumpStation'
import { Card, Num, ResultCard, Row, Pick } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, MUTED, BRAND, FAIL, f2, f3 } from '../lib/influenceStyle'

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

  let op: OperatingPoint | null = null
  let nps: NpshResult | null = null
  let err: string | null = null
  try {
    op = operatingPoint(sys, pump)
    const hfSuction = op.Q > 0
      ? hwFriction(sL, op.Q, sC, sD) + minorLoss(op.Q, sD, sK)
      : 0
    nps = npsh({ patmHead: PATM_HEAD, vapourHead, zSuction, hfSuction, npshRequired })
  } catch (e) { err = e instanceof Error ? e.message : 'Check the inputs' }

  const r115 = op ? affinity(op.Q, op.H, op.Pshaft, 1.15) : null

  const steps: SolutionStep[] = op ? [
    {
      title: 'The system curve',
      lines: [
        { tex: 'H_{sys}(Q) = H_{static} + h_f(Q) + h_m(Q)' },
        { tex: `h_f = \\frac{10.67\\,L\\,Q^{1.852}}{C^{1.852} D^{4.8704}} \\quad h_m = \\Sigma K \\frac{V^2}{2g}` },
        { text: `Static lift ${f2(staticLift)} m plus ${f2(pressureHead)} m delivery head; Hazen–Williams on both legs (C ${f2(sC)} suction / ${f2(dC)} discharge) and ${f2(sK + dK)} K-units of fittings. At the operating point the circuit demands H = ${f2(op.H)} m.` },
      ],
    },
    {
      title: 'The pump curve and the crossing',
      lines: [
        { tex: `H_{pump}(Q) = H_0 - (H_0 - H_d)\\left(\\frac{Q}{Q_d}\\right)^2` },
        { text: `Pinned on shutoff H0 = ${f2(H0)} m and the rated point (${f3(Qd)} m³/s, ${f2(Hd)} m). The pump head falls, the system head rises — bisection finds the unique crossing.` },
        { tex: `Q^{*} = ${f3(op.Q)}\\ \\text{m}^3/\\text{s} \\quad H^{*} = ${f2(op.H)}\\ \\text{m}` },
      ],
    },
    {
      title: 'Power chain',
      lines: [
        { tex: `P_{water} = \\gamma\\,Q^{*}H^{*} = ${f2(op.Pwater)}\\ \\text{kW}` },
        { tex: `P_{shaft} = \\frac{P_{water}}{\\eta_{pump}} = ${f2(op.Pshaft)}\\ \\text{kW} \\quad P_{motor} = \\frac{P_{shaft}}{\\eta_{motor}} = ${f2(op.Pmotor)}\\ \\text{kW}` },
        { text: `Pump η = ${f2(eta)} at the rated point, motor η = ${f2(motorEta)}; the unit carries ${f2(op.kwhPerM3)} kWh of shaft energy per m³ lifted. A +15 % speed turn by the affinity laws would move the duty to ${f3(r115?.Q ?? 0)} m³/s at ${f2(r115?.H ?? 0)} m (${f2(r115?.P ?? 0)} kW shaft — cubes, mind the motor).` },
      ],
    },
    ...(nps ? [{
      title: 'NPSH margin at the suction',
      lines: [
        { tex: `NPSH_a = \\frac{P_{atm} - P_v}{\\gamma} + z_{suction} - h_{f,s} = ${f2(nps.npshAvailable)}\\ \\text{m}` },
        { text: `Suction losses at duty: Hazen–Williams + fittings on the ${f2(sL)} m suction leg (${f2(sK)} K-units). Sea-level atmosphere ${f2(PATM_HEAD)} m, vapour head ${f2(vapourHead)} m.` },
        { tex: `NPSH_a ${nps.ok ? '\\geq' : '<'} 1.3\\times NPSH_r = ${f2(nps.npshRequired)}\\ \\text{m}` },
        { text: nps.ok
          ? 'The +30 % margin over the datasheet NPSHr is the usual purchase requirement — the impeller sees no cavitation at duty.'
          : 'The suction side fails the +30 % margin: lower the pump, flood the suction, shorten the suction run or fit a larger suction diameter.' },
      ],
    }] : []),
  ] : []

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
      <ReportControls title="Pump Station Report" badges={[op ? `${f3(op.Q)} m³/s @ ${f2(op.H)} m` : 'System × pump']} />
      <p className="mt-2 max-w-3xl text-sm text-muted">
        One pumping circuit, end to end: the system curve the pipework demands, the
        pump curve the impeller gives, their intersection as the duty point, the
        power chain down to the motor, and the NPSH margin that keeps the impeller
        off cavitation.
      </p>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="System (pipework)">
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="button" onClick={() => { setStaticLift(20); setPressureHead(0); setSL(50); setSD(0.3); setSC(120); setSK(2); setDL(300); setDD(0.3); setDC(120); setDK(5); setH0(30); setQd(0.12); setHd(24); setEta(0.7); setMotorEta(0.9) }}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                Load the sample — 20 m lift · DN 300 · pump 30/24
              </button>
            </div>
            <Num label="Static lift" unit="m" value={staticLift} onChange={setStaticLift} min={0} step="0.5" />
            <Num label="Delivery pressure head" unit="m" value={pressureHead} onChange={setPressureHead} min={0} step="1" />
            <Num label="Suction length" unit="m" value={sL} onChange={setSL} min={1} step="5" />
            <Num label="Suction diameter" unit="m" value={sD} onChange={setSD} min={0.05} max={1.5} step="0.05" />
            <Num label="Suction C" unit="—" value={sC} onChange={setSC} min={60} max={150} step="5" />
            <Num label="Suction ΣK" unit="—" value={sK} onChange={setSK} min={0} step="0.5" />
            <Num label="Discharge length" unit="m" value={dL} onChange={setDL} min={1} step="10" />
            <Num label="Discharge diameter" unit="m" value={dD} onChange={setDD} min={0.05} max={1.5} step="0.05" />
            <Num label="Discharge C" unit="—" value={dC} onChange={setDC} min={60} max={150} step="5" />
            <Num label="Discharge ΣK" unit="—" value={dK} onChange={setDK} min={0} step="0.5" />
          </Card>

          <Card title="Pump & suction">
            <Num label="Shutoff head H0" unit="m" value={H0} onChange={setH0} min={1} step="1" />
            <Num label="Rated flow Qd" unit="m³/s" value={Qd} onChange={setQd} min={0.001} step="0.01" />
            <Num label="Rated head Hd" unit="m" value={Hd} onChange={setHd} min={0.5} step="0.5" />
            <Num label="Pump efficiency" unit="—" value={eta} onChange={setEta} min={0.2} max={0.95} step="0.01" />
            <Num label="Motor efficiency" unit="—" value={motorEta} onChange={setMotorEta} min={0.5} max={1} step="0.01" />
            <Num label="Vapour pressure head" unit="m" value={vapourHead} onChange={setVapourHead} min={0} max={3} step="0.02" />
            <Pick label="Suction arrangement" value={String(zSuction)} onChange={(v) => setZSuction(Number(v))}
              options={[['2', 'Flooded +2 m'], ['0', 'Level with the impeller'], ['-3', 'Lift −3 m'], ['-6', 'Lift −6 m']]} />
            <Num label="NPSH required (datasheet)" unit="m" value={npshRequired} onChange={setNpshRequired} min={0.5} step="0.5" />
          </Card>
        </div>

        <div className="space-y-5">
          {op && nps ? (
            <>
              <ResultCard title="Duty point">
                <Row label="Operating flow Q*" value={`${f3(op.Q)} m³/s`} sub={`${f2(op.Q * 1000)} L/s`} />
                <Row label="Operating head H*" value={`${f2(op.H)} m`} sub="system head the duty must develop" />
                <Row label="Shaft / motor power" value={`${f2(op.Pshaft)} / ${f2(op.Pmotor)} kW`} sub={`water power ${f2(op.Pwater)} kW · ${f2(op.kwhPerM3)} kWh/m³`} />
                <Row label="NPSH margin" value={`${f2(nps.margin)} m`} alert={!nps.ok}
                  sub={`NPSHa ${f2(nps.npshAvailable)} vs 1.3×NPSHr ${f2(nps.npshRequired)} m`} />
              </ResultCard>

              <DrawingCard title="System × pump curves" meta="the crossing is the duty point">
                <DrawingFrame label="Pump and system curves">
                  <Curves sys={sys} pump={pump} op={op} />
                </DrawingFrame>
              </DrawingCard>

              <WorkedSolution steps={steps} title="Pump duty — step by step" />
            </>
          ) : (
            <ResultCard title="Check the inputs">
              <p className="text-sm text-fail">{err}</p>
            </ResultCard>
          )}
        </div>
      </div>
    </div>
  )
}

function Curves({ sys, pump, op }: { sys: SystemInput; pump: PumpSpec; op: OperatingPoint }) {
  const W = 640, Hh = 320
  const x0 = 64, x1 = W - 46
  const baseY = Hh - 48, topY = 32
  const Qmax = op.Q * 2.2
  const Hmax = Math.max(pump.H0, systemHead(sys, Qmax)) * 1.12
  const xOf = (Q: number) => x0 + (Q / Qmax) * (x1 - x0)
  const yOf = (H: number) => baseY - (H / Hmax) * (baseY - topY)
  const sysPts: string[] = [], pumpPts: string[] = []
  for (let i = 0; i <= 80; i++) {
    const Q = (i / 80) * Qmax
    sysPts.push(`${xOf(Q)},${yOf(systemHead(sys, Q))}`)
    const hp = pumpHead(Q, pump.H0, pump.Qd, pump.Hd)
    if (hp > 0) pumpPts.push(`${xOf(Q)},${yOf(hp)}`)
  }
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full" role="img" aria-label="System and pump curves">
      <line x1={x0} x2={x1} y1={baseY} y2={baseY} stroke={INK} strokeWidth="1.2" />
      <line x1={x0} x2={x0} y1={topY - 8} y2={baseY} stroke={INK} strokeWidth="1.2" />
      {/* static head line */}
      <line x1={x0} x2={x1} y1={yOf(sys.staticLift + sys.pressureHead)} y2={yOf(sys.staticLift + sys.pressureHead)} stroke={MUTED} strokeWidth="1" strokeDasharray="4 3" />
      <text x={x0 + 6} y={yOf(sys.staticLift + sys.pressureHead) - 5} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
        static {f2(sys.staticLift + sys.pressureHead)} m
      </text>
      <polyline points={sysPts.join(' ')} fill="none" stroke={MUTED} strokeWidth="2" />
      <polyline points={pumpPts.join(' ')} fill="none" stroke={BRAND} strokeWidth="2.2" />
      {/* duty point */}
      <circle cx={xOf(op.Q)} cy={yOf(op.H)} r="4.5" fill={FAIL} />
      <line x1={xOf(op.Q)} x2={xOf(op.Q)} y1={yOf(op.H)} y2={baseY} stroke={FAIL} strokeWidth="1" strokeDasharray="4 3" />
      <line x1={x0} x2={xOf(op.Q)} y1={yOf(op.H)} y2={yOf(op.H)} stroke={FAIL} strokeWidth="1" strokeDasharray="4 3" />
      <text x={xOf(op.Q) + 8} y={yOf(op.H) - 8} fontSize="11" fill={FAIL} fontFamily="var(--font-mono, monospace)">
        {f3(op.Q)} m³/s @ {f2(op.H)} m
      </text>
      <text x={x1} y={baseY + 16} textAnchor="end" fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">Q (m³/s)</text>
      <text x={x0 - 6} y={topY} textAnchor="end" fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">H (m)</text>
      <text x={x1 - 6} y={topY + 14} textAnchor="end" fontSize="10.5" fill={BRAND} fontFamily="var(--font-mono, monospace)">pump H0 = {f2(pump.H0)} m</text>
      <text x={x1 - 6} y={topY + 30} textAnchor="end" fontSize="10.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">system: static + friction</text>
    </svg>
  )
}
