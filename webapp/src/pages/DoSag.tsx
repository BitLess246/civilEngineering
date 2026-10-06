import { useState } from 'react'
import { doSag, doSaturation, reaerationUNESCO, type SagResult } from '../engine/doSag'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { SagCharts } from '../components/waterCharts'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// DO sag curve — the Streeter–Phelps oxygen balance after an outfall:
// flow-weighted mixing of BOD and DO, temperature-corrected rates, the
// closed-form deficit D(t), the critical point (tc, DOcrit), and the sag
// drawn under the saturation line with the BOD decay in its own panel.

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
        ...(r.tc !== null && r.Dcrit !== null
          ? [{ tex: `D(${f3(r.tc)}) = \\frac{${f3(r.kd)}\\times ${f2(r.L0)}}{${f3(r.kr)}-${f3(r.kd)}}(e^{-${f3(r.kd)}\\times ${f3(r.tc)}}-e^{-${f3(r.kr)}\\times ${f3(r.tc)}}) + ${f2(r.D0)}\\,e^{-${f3(r.kr)}\\times ${f3(r.tc)}} = ${f2(r.Dcrit)}\\ \\text{mg/L}` }]
          : [{ tex: `D(${f3(r.curve[60].t)}) = \\frac{${f3(r.kd)}\\times ${f2(r.L0)}}{${f3(r.kr)}-${f3(r.kd)}}(e^{-${f3(r.kd)}\\times ${f3(r.curve[60].t)}}-e^{-${f3(r.kr)}\\times ${f3(r.curve[60].t)}}) + ${f2(r.D0)}\\,e^{-${f3(r.kr)}\\times ${f3(r.curve[60].t)}} = ${f2(r.curve[60].D)}\\ \\text{mg/L}` }]),
        { text: 'The first term is the oxygen demanded by the decaying BOD load L(t) = L0·e^(−kd·t); the second is the initial deficit being re-aerated away.' },
      ],
    },
    r.tc !== null ? {
      title: 'Critical point',
      lines: [
        { tex: 't_c = \\frac{1}{k_r - k_d}\\,\\ln\\!\\left[\\frac{k_r}{k_d}\\left(1 - \\frac{D_0(k_r - k_d)}{k_d L_0}\\right)\\right]' },
        { tex: `t_c = \\frac{1}{${f3(r.kr)}-${f3(r.kd)}}\\,\\ln\\!\\left[\\frac{${f3(r.kr)}}{${f3(r.kd)}}\\left(1-\\frac{${f2(r.D0)}(${f3(r.kr)}-${f3(r.kd)})}{${f3(r.kd)}\\times ${f2(r.L0)}}\\right)\\right] = ${f3(r.tc)}\\ \\text{d}` },
        { tex: `D_{crit} = \\frac{k_d L_0}{k_r}e^{-k_d t_c} = \\frac{${f3(r.kd)}\\times ${f2(r.L0)}}{${f3(r.kr)}}e^{-${f3(r.kd)}\\times ${f3(r.tc)}} = ${f2(r.Dcrit ?? 0)}\\ \\text{mg/L}` },
        { text: `DO bottoms at ${f2(r.DOcrit ?? 0)} mg/L${r.xc !== null ? `, ${f1(r.xc)} km downstream at u = ${f2(u)} m/s` : ''}. ${r.anoxic ? 'That is below zero — the reach turns anoxic.' : r.DOcrit !== null && r.DOcrit < 2 ? 'Severe stress for aquatic life (below about 2 mg/L).' : 'Above the 2 mg/L stress line, but check the fishery standard.'}` },
      ],
    } : {
      title: 'No critical point',
      lines: [
        { text: 'Reaeration outruns deoxygenation from the outfall on, so the deficit decays from the mix onward and the DO recovers — the minimum sits at the outfall itself.' },
      ],
    },
    ...r.notes.map((nt) => ({ title: 'Note', lines: [{ text: nt }] })),
  ] : [{ title: 'Check the inputs', lines: [{ text: out.error ?? 'Give positive flows and rates; kr must differ from kd for the closed form.' }] }]

  const stress = r ? (r.DOcrit ?? r.DOmix) : 0
  const loadSample = () => { setQr(SAMPLE.Qr); setLr(SAMPLE.Lr); setDOr(SAMPLE.DOr); setQw(SAMPLE.Qw); setLw(SAMPLE.Lw); setDOw(SAMPLE.DOw); setKd20(SAMPLE.kd20); setKr20(SAMPLE.kr20); setT(SAMPLE.T); setU(SAMPLE.u) }
  return (
    <WorkspacePage title="DO Sag" badges={['Water quality', 'Streeter–Phelps']}
      intro="The oxygen sag downstream of a discharge: flow-weighted mixing of BOD and DO at the outfall, temperature-corrected deoxygenation and reaeration, the closed-form deficit curve, and the critical point where the DO bottoms out."
      inputs={<>
        <InputGroup title="Upstream river">
          <Num label="Flow Qr" unit="m³/s" value={Qr} onChange={setQr} min={0.1} max={1000} step="0.5" />
          <Num label="Ultimate BOD Lr" unit="mg/L" value={Lr} onChange={setLr} min={0} max={500} step="1" />
          <Num label="DO" unit="mg/L" value={DOr} onChange={setDOr} min={0} max={15} step="0.1" />
        </InputGroup>
        <InputGroup title="Effluent">
          <Num label="Flow Qw" unit="m³/s" value={Qw} onChange={setQw} min={0} max={100} step="0.1" />
          <Num label="Ultimate BOD Lw" unit="mg/L" value={Lw} onChange={setLw} min={0} max={2000} step="5" />
          <Num label="DO" unit="mg/L" value={DOw} onChange={setDOw} min={0} max={15} step="0.1" />
        </InputGroup>
        <InputGroup title="Stream and kinetics" hint={`DOsat at ${f0(T)} °C is ${f2(doSaturation(T))} mg/L.`}>
          <Num label="Temperature T" unit="°C" value={T} onChange={setT} min={0} max={40} step="1" />
          <Num label="Velocity u" unit="m/s" value={u} onChange={setU} min={0} max={5} step="0.05" />
          <Num label="Deoxygenation kd20" unit="d⁻¹" value={kd20} onChange={setKd20} min={0.02} max={2} step="0.01" />
          <Num label="Reaeration kr20" unit="d⁻¹" value={kr20} onChange={setKr20} min={0.02} max={10} step="0.01" />
          <div className="col-span-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => setKr20(Math.min(10, reaerationUNESCO(Math.max(u, 0.05), 1.8)))}
              className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">Estimate kr from u (H = 1.8 m)</button>
            <button type="button" onClick={loadSample}
              className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">Sample: 1 m³/s into a 4 m³/s river</button>
          </div>
        </InputGroup>
      </>}
      checks={r ? <>
        <CheckCard title="Minimum DO" basis="2 mg/L stress line" status={r.anoxic ? 'fail' : stress < 2 ? 'warn' : 'pass'}
          pillLabel={r.anoxic ? 'ANOXIC' : stress < 2 ? 'STRESSED' : 'ABOVE 2 mg/L'} value={f2(stress)} unit="mg/L"
          formula={r.tc !== null ? 'D_c = (k_d L₀ / k_r) e^(−k_d t_c)' : 'no interior minimum — DO recovers from the mix'}
          pairs={r.tc !== null ? [{ label: 'Critical time', value: `${f3(r.tc)} d` }, { label: 'Distance', value: r.xc !== null ? `${f1(r.xc)} km` : 'give u' }] : [{ label: 'Mixed DO', value: `${f2(r.DOmix)} mg/L` }]} />
        <CheckCard title="Outfall mix" basis="flow-weighted" status="info" value={f2(r.L0)} unit="mg/L BOD"
          formula="L₀ = (QrLr + QwLw) / (Qr + Qw)"
          pairs={[{ label: 'Mixed DO', value: `${f2(r.DOmix)} mg/L` }, { label: 'Initial deficit D₀', value: `${f2(r.D0)} mg/L` }]} />
        <CheckCard title="Rates at T" basis={`${f0(T)} °C`} status="info" value={`${f3(r.kd)} · ${f3(r.kr)}`} unit="d⁻¹"
          formula="k(T) = k₂₀ θ^(T − 20)"
          pairs={[{ label: 'kd / kr', value: f2(r.kd / r.kr) }, { label: 'Saturation', value: `${f2(r.DOsat)} mg/L` }]} />
      </> : (
        <CheckCard title="Check the inputs" basis="Streeter–Phelps" status="warn" pillLabel="CHECK" value="—" formula={out.error ?? 'Positive flows and rates.'} />
      )}
      summary={[
        { label: 'River', value: `${f2(Qr)} m³/s, BOD ${f2(Lr)}, DO ${f2(DOr)} mg/L` },
        { label: 'Effluent', value: `${f2(Qw)} m³/s, BOD ${f2(Lw)}, DO ${f2(DOw)} mg/L` },
        { label: 'Kinetics', value: `kd20 ${f3(kd20)}, kr20 ${f3(kr20)} d⁻¹` },
        { label: 'Stream', value: `${f0(T)} °C, u = ${f2(u)} m/s` },
      ]}
      drawing={r ? { title: 'Oxygen sag and BOD decay', node: <div data-pdf-drawing><SagCharts curve={r.curve} DOsat={r.DOsat} DOmix={r.DOmix} L0={r.L0} kd={r.kd} tc={r.tc} DOcrit={r.DOcrit} anoxic={r.anoxic} /></div> } : undefined}
      resultsCaption={r && r.notes.length ? r.notes.join(' ') : undefined}
      results={r ? [
        { check: 'Mixed BOD L₀', basis: 'flow-weighted', demand: `${f2(r.L0)} mg/L`, status: 'info' },
        { check: 'Initial deficit D₀', basis: `DOsat ${f2(r.DOsat)} − DOmix ${f2(r.DOmix)}`, demand: `${f2(r.D0)} mg/L`, status: 'info' },
        { check: 'Critical time', basis: r.xc !== null ? `${f1(r.xc)} km downstream` : 'travel time', demand: r.tc !== null ? `${f3(r.tc)} d` : 'none', status: 'info' },
        { check: 'Minimum DO', basis: '≥ 2 mg/L', demand: `${f2(stress)} mg/L`, limit: '2.00 mg/L', status: r.anoxic ? 'fail' : stress < 2 ? 'warn' : 'pass' },
      ] : [{ check: 'Sag', basis: out.error ?? 'invalid input', demand: '—', status: 'warn' }]}
      steps={steps}
      references={[
        { topic: 'Oxygen sag', basis: 'D(t) closed form; tc and Dc', source: 'Streeter & Phelps (1925); Davis & Cornwell, Introduction to Environmental Engineering §5' },
        { topic: 'Temperature correction', basis: 'θ = 1.047 (kd), 1.024 (kr)', source: 'Metcalf & Eddy, Wastewater Engineering' },
        { topic: 'DO saturation', basis: 'Benson–Krause polynomial, fresh water at 1 atm', source: 'Benson & Krause (1984); USGS DOTABLES' },
        { topic: 'Reaeration estimate', basis: 'kr = 2.148 u^0.878 H^−1.48', source: 'UNESCO IHP stream reaeration equation' },
      ]}
    />
  )
}

const f0 = (v: number) => Math.round(v).toString()
const f1 = (v: number) => v.toFixed(1)
