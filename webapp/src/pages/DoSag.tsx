import { useState } from 'react'
import 'katex/dist/katex.min.css'
import { doSag, doSaturation, reaerationUNESCO, type SagResult } from '../engine/doSag'
import { Card, Num, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, MUTED, f2, f3 } from '../lib/influenceStyle'

// DO sag curve — the Streeter–Phelps oxygen balance after an outfall:
// flow-weighted mixing of BOD and DO, temperature-corrected rates, the
// closed-form deficit D(t), the critical point (tc, DOcrit) and the sag
// drawn against the saturation line with the BOD decay alongside.

const SAMPLE = {
  Qr: 4, Lr: 20, DOr: 7,
  Qw: 1, Lw: 40, DOw: 2,
  kd20: 0.25, kr20: 0.45, T: 20, u: 0.3,
}

export default function DoSag() {
  const [Qr, setQr] = useState(SAMPLE.Qr)
  const [Lr, setLr] = useState(SAMPLE.Lr)
  const [DOr, setDOr] = useState(SAMPLE.DOr)
  const [Qw, setQw] = useState(SAMPLE.Qw)
  const [Lw, setLw] = useState(SAMPLE.Lw)
  const [DOw, setDOw] = useState(SAMPLE.DOw)
  const [kd20, setKd20] = useState(SAMPLE.kd20)
  const [kr20, setKr20] = useState(SAMPLE.kr20)
  const [T, setT] = useState(SAMPLE.T)
  const [u, setU] = useState(SAMPLE.u)

  const out: { r: SagResult | null; error: string | null } = (() => {
    try {
      return { r: doSag({ Qr, Lr, DOr, Qw, Lw, DOw, kd20, kr20, T, u }), error: null }
    } catch (e) {
      return { r: null, error: e instanceof Error ? e.message : 'Invalid input.' }
    }
  })()
  const r = out.r

  const steps: SolutionStep[] = r ? [
    {
      title: 'Mixing at the outfall',
      lines: [
        { tex: `L_0 = \\frac{Q_r L_r + Q_w L_w}{Q_r + Q_w} = \\frac{${f2(Qr)}\\cdot${f2(Lr)} + ${f2(Qw)}\\cdot${f2(Lw)}}{${f2(Qr + Qw)}} = ${f2(r.L0)}\\ \\text{mg/L}` },
        { tex: `DO_{mix} = \\frac{${f2(Qr)}\\cdot${f2(DOr)} + ${f2(Qw)}\\cdot${f2(DOw)}}{${f2(Qr + Qw)}} = ${f2(r.DOmix)}\\ \\text{mg/L}` },
        { text: `DO saturation at ${f0(T)} °C is ${f2(r.DOsat)} mg/L (Benson–Krause), so the initial deficit is D0 = ${f2(r.D0)} mg/L.` },
      ],
    },
    {
      title: 'Temperature-corrected rates',
      lines: [
        { tex: 'k(T) = k_{20}\\,\\theta^{(T-20)}' },
        { tex: `k_d = ${f3(kd20)}\\cdot 1.047^{${f0(T - 20)}} = ${f3(r.kd)}\\ \\text{d}^{-1}, \\quad k_r = ${f3(kr20)}\\cdot 1.024^{${f0(T - 20)}} = ${f3(r.kr)}\\ \\text{d}^{-1}` },
        { text: 'θ = 1.047 for deoxygenation, 1.024 for reaeration — the standard Streeter–Phelps temperature pair (both editable conventions exist in the literature).' },
      ],
    },
    {
      title: 'The sag equation',
      lines: [
        { tex: 'D(t) = \\frac{k_d L_0}{k_r - k_d}\\left(e^{-k_d t} - e^{-k_r t}\\right) + D_0\\,e^{-k_r t}' },
        { text: 'The first term is the oxygen demanded by the decaying BOD load L(t) = L0·e^(−kd·t); the second is the initial deficit being re-aerated away.' },
      ],
    },
    r.tc !== null ? {
      title: 'Critical point',
      lines: [
        { tex: 't_c = \\frac{1}{k_r - k_d}\\,\\ln\\!\\left[\\frac{k_r}{k_d}\\left(1 - \\frac{D_0(k_r - k_d)}{k_d L_0}\\right)\\right]' },
        { tex: `t_c = ${f3(r.tc)}\\ \\text{d} \\;\\Rightarrow\\; D_{crit} = \\frac{k_d L_0}{k_r}e^{-k_d t_c} = ${f2(r.Dcrit ?? 0)}\\ \\text{mg/L}` },
        { text: `DO bottoms at ${f2(r.DOcrit ?? 0)} mg/L${r.xc !== null ? `, ${f1(r.xc)} km downstream at u = ${f2(u)} m/s` : ''}. ${r.anoxic ? 'That is below zero — the reach turns anoxic.' : r.DOcrit !== null && r.DOcrit < 2 ? 'Severe stress for aquatic life (below about 2 mg/L).' : 'Above the 2 mg/L stress line, but check the fishery standard.'}` },
      ],
    } : {
      title: 'No critical point',
      lines: [
        { text: 'Reaeration outruns deoxygenation from the outfall on, so the deficit decays from the mix onward and the DO recovers — the minimum sits at the outfall itself.' },
      ],
    },
    ...r.notes.map((nt) => ({ title: 'Note', lines: [{ text: nt }] })),
  ] : []

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
      <ReportControls title="DO Sag Report" badges={[r ? (r.DOcrit !== null ? `DOmin ${f2(r.DOcrit)} mg/L` : 'Streeter–Phelps') : 'oxygen sag']} />
      <p className="mt-2 max-w-3xl text-sm text-muted">
        The Streeter–Phelps oxygen sag downstream of a discharge: flow-weighted mixing of
        BOD and DO at the outfall, temperature-corrected deoxygenation and reaeration rates,
        the closed-form deficit curve, and the critical point where the DO bottoms out —
        the classic water-quality permitting calculation.
      </p>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="Upstream river">
            <Num label="Flow Qr" unit="m³/s" value={Qr} onChange={setQr} min={0.1} max={1000} step="0.5" />
            <Num label="Ultimate BOD Lr" unit="mg/L" value={Lr} onChange={setLr} min={0} max={500} step="1" />
            <Num label="DO" unit="mg/L" value={DOr} onChange={setDOr} min={0} max={15} step="0.1" />
          </Card>

          <Card title="Effluent">
            <Num label="Flow Qw" unit="m³/s" value={Qw} onChange={setQw} min={0} max={100} step="0.1" />
            <Num label="Ultimate BOD Lw" unit="mg/L" value={Lw} onChange={setLw} min={0} max={2000} step="5" />
            <Num label="DO" unit="mg/L" value={DOw} onChange={setDOw} min={0} max={15} step="0.1" />
          </Card>

          <Card title="Stream and kinetics">
            <Num label="Temperature T" unit="°C" value={T} onChange={setT} min={0} max={40} step="1" />
            <Num label="Deoxygenation kd20" unit="d⁻¹" value={kd20} onChange={setKd20} min={0.02} max={2} step="0.01" />
            <Num label="Reaeration kr20" unit="d⁻¹" value={kr20} onChange={setKr20} min={0.02} max={10} step="0.01" />
            <Num label="Velocity u (distance axis)" unit="m/s" value={u} onChange={setU} min={0} max={5} step="0.05" />
            <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>DOsat({f0(T)} °C) = {f2(doSaturation(T))} mg/L ·</span>
              <button type="button"
                onClick={() => setKr20(Math.min(10, reaerationUNESCO(Math.max(u, 0.05), 1.8)))}
                className="rounded-md border border-field-line px-2 py-0.5 font-semibold text-brand hover:bg-brand-tint">
                estimate kr from u (H = 1.8 m)
              </button>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="button"
                onClick={() => { setQr(SAMPLE.Qr); setLr(SAMPLE.Lr); setDOr(SAMPLE.DOr); setQw(SAMPLE.Qw); setLw(SAMPLE.Lw); setDOw(SAMPLE.DOw); setKd20(SAMPLE.kd20); setKr20(SAMPLE.kr20); setT(SAMPLE.T); setU(SAMPLE.u) }}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                Load the sample — 1 m³/s effluent into a 4 m³/s river
              </button>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          {r ? (
            <>
              <ResultCard title="Outfall mix">
                <Row label="Mixed ultimate BOD L0" value={`${f2(r.L0)} mg/L`} sub={`from ${(Qr / (Qr + Qw) * 100).toFixed(0)} % river / ${(Qw / (Qr + Qw) * 100).toFixed(0)} % effluent`} />
                <Row label="Mixed DO" value={`${f2(r.DOmix)} mg/L`} sub={`saturation ${f2(r.DOsat)} mg/L at ${f0(T)} °C → D0 = ${f2(r.D0)} mg/L`} />
                <Row label="Rates at T" value={`kd ${f3(r.kd)} · kr ${f3(r.kr)} d⁻¹`} sub={`kd/kr = ${f2(r.kd / r.kr)}`} />
              </ResultCard>

              <ResultCard title="Critical point">
                {r.tc !== null ? (
                  <>
                    <Row label="Critical time tc" value={`${f3(r.tc)} d`} sub={r.xc !== null ? `${f1(r.xc)} km downstream at ${f2(u)} m/s` : 'give a velocity for the distance'} />
                    <Row label="Critical deficit Dc" value={`${f2(r.Dcrit ?? 0)} mg/L`} sub="peak of the sag" />
                    <Row label="Minimum DO" value={`${f2(r.DOcrit ?? 0)} mg/L`} alert={r.anoxic || (r.DOcrit ?? 9) < 2}
                      sub={r.anoxic ? 'anoxic — below zero, curve is mathematical only past that point' : (r.DOcrit ?? 9) < 2 ? 'below the 2 mg/L stress line' : 'above the 2 mg/L stress line'} />
                  </>
                ) : (
                  <Row label="No sag" value="DO recovers from the mix" sub="reaeration outruns deoxygenation — no interior minimum" />
                )}
              </ResultCard>

              <DrawingCard title="Oxygen sag curve" meta={`DO and BOD over ${f2(r.curve[r.curve.length - 1].t)} d travel time`}>
                <SagDrawing result={r} />
              </DrawingCard>

              <WorkedSolution steps={steps} title="Streeter–Phelps — step by step" />
            </>
          ) : (
            <ResultCard title="Check the inputs">
              <p className="text-sm text-fail">{out.error ?? 'Give positive flows and rates; kr must differ from kd for the closed form.'}</p>
            </ResultCard>
          )}
        </div>
      </div>
    </div>
  )
}

const f0 = (v: number) => Math.round(v).toString()
const f1 = (v: number) => v.toFixed(1)

function SagDrawing({ result }: { result: SagResult }) {
  const W = 640, H = 340
  const x0 = 58, x1 = W - 130
  const baseY = H - 46, topY = 42
  const window = result.curve[result.curve.length - 1].t
  const doMax = Math.max(result.DOsat * 1.06, ...result.curve.map((p) => p.DO)) 
  const bodMax = Math.max(result.L0 * 1.08, 1)
  const px = (t: number) => x0 + (t / Math.max(window, 1e-9)) * (x1 - x0)
  const pyDO = (v: number) => baseY - (v / doMax) * (baseY - topY)
  const pyBOD = (v: number) => baseY - (v / bodMax) * (baseY - topY)

  const doPath = result.curve.map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(p.t).toFixed(2)} ${pyDO(Math.max(p.DO, 0)).toFixed(2)}`).join(' ')
  const bodPath = result.curve.map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(p.t).toFixed(2)} ${pyBOD(p.BOD).toFixed(2)}`).join(' ')

  return (
    <DrawingFrame label="Streeter–Phelps oxygen sag">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="DO sag curve">
        {/* axes */}
        <line x1={x0} x2={x1} y1={baseY} y2={baseY} stroke={INK} strokeWidth="1.2" />
        <line x1={x0} x2={x0} y1={topY - 8} y2={baseY} stroke={INK} strokeWidth="1.2" />
        {/* saturation line */}
        <line x1={x0} x2={x1} y1={pyDO(result.DOsat)} y2={pyDO(result.DOsat)} stroke={MUTED} strokeWidth="1" strokeDasharray="6 4" />
        <text x={x1 + 6} y={pyDO(result.DOsat) + 3} fontSize="9.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">DOsat {f2(result.DOsat)}</text>
        {/* 2 mg/L stress line */}
        <line x1={x0} x2={x1} y1={pyDO(2)} y2={pyDO(2)} stroke="rgba(220,80,80,0.65)" strokeWidth="1" strokeDasharray="3 3" />
        <text x={x1 + 6} y={pyDO(2) + 3} fontSize="9.5" fill="rgba(220,80,80,0.85)" fontFamily="var(--font-mono, monospace)">2 mg/L</text>
        {/* zero line when anoxic */}
        {result.anoxic && (
          <line x1={x0} x2={x1} y1={pyDO(0)} y2={pyDO(0)} stroke="rgba(220,80,80,0.9)" strokeWidth="1.2" />
        )}
        {/* BOD decay (right axis scale) */}
        <path d={bodPath} stroke="rgba(120,100,20,0.75)" strokeWidth="1.6" fill="none" strokeDasharray="7 3" />
        <text x={result.curve[Math.round(result.curve.length * 0.08)].x === 0 ? px(window * 0.08) + 6 : px(window * 0.08) + 6}
          y={pyBOD(result.L0 * Math.exp(-result.kd * window * 0.08)) - 8}
          fontSize="9.5" fill="rgba(120,100,20,0.9)" fontFamily="var(--font-mono, monospace)">
          BOD {f2(result.L0)} mg/L
        </text>
        {/* DO curve */}
        <path d={doPath} stroke="rgba(15,76,146,0.95)" strokeWidth="2.2" fill="none" />
        {/* critical point */}
        {result.tc !== null && (
          <>
            <line x1={px(result.tc)} x2={px(result.tc)} y1={pyDO(Math.max(result.DOcrit ?? 0, -1))} y2={baseY} stroke={MUTED} strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={px(result.tc)} cy={pyDO(Math.max(result.DOcrit ?? 0, -1))} r="3.4" fill="rgba(15,76,146,0.95)" />
            <text x={px(result.tc) + 7} y={pyDO(Math.max(result.DOcrit ?? 0, -1)) + 4} fontSize="10.5" fill={INK} fontFamily="var(--font-mono, monospace)">
              DOmin {f2(result.DOcrit ?? 0)} @ {f2(result.tc)} d
            </text>
          </>
        )}
        {/* axis labels */}
        <text x={12} y={topY} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">mg/L</text>
        <text x={x1} y={baseY + 16} textAnchor="end" fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">t (days)</text>
        <text x={x0} y={baseY + 16} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">outfall</text>
        <text x={x0 + 8} y={topY - 12} fontSize="9.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">
          solid = DO · dashed = BOD decay (own scale)
        </text>
      </svg>
    </DrawingFrame>
  )
}
