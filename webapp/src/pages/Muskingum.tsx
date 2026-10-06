import { useState } from 'react'
import { muskingumRoute, type MuskingumResult } from '../engine/muskingum'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { RoutedHydrographs } from '../components/waterCharts'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// Muskingum channel routing — K, X and Δt give the three weighting
// coefficients; the inflow hydrograph routes step by step through
// O2 = C0·I2 + C1·I1 + C2·O1, with the peak attenuation and lag read off
// the paired hydrographs.

const SAMPLE_INFLOW = [0, 10, 30, 60, 90, 70, 45, 25, 12, 5, 0]

export default function Muskingum() {
  const [K, setK] = useState(1)
  const [X, setX] = useState(0.2)
  const [dt, setDt] = useState(0.5)
  const [inflow, setInflow] = useState<number[]>(SAMPLE_INFLOW)

  const out: { r: MuskingumResult | null; error: string | null } = (() => {
    try {
      return { r: muskingumRoute({ K, X, dt, inflow }), error: null }
    } catch (e) {
      return { r: null, error: e instanceof Error ? e.message : 'Invalid input.' }
    }
  })()
  const r = out.r

  const setOrd = (i: number, v: number) => setInflow((qs) => qs.map((q, j) => (j === i ? v : q)))

  const steps: SolutionStep[] = r ? [
    {
      title: 'Storage model',
      lines: [
        { tex: 'S = K\\,[\\,X I + (1-X)\\,O\\,]' },
        { text: `K = ${f2(K)} h is the reach's storage time constant; X = ${f2(X)} weights inflow against outflow storage (0 = level-pool reservoir, 0.5 = pure translation).` },
      ],
    },
    {
      title: 'Routing coefficients',
      lines: [
        { tex: 'C_0 = \\frac{0.5\\Delta t - KX}{K(1-X) + 0.5\\Delta t},\\quad C_1 = \\frac{0.5\\Delta t + KX}{K(1-X) + 0.5\\Delta t},\\quad C_2 = \\frac{K(1-X) - 0.5\\Delta t}{K(1-X) + 0.5\\Delta t}' },
        { tex: `D = ${f2(K)}\\times ${(1 - X).toFixed(2)} + 0.5\\times ${f2(dt)} = ${f3(K * (1 - X) + 0.5 * dt)}` },
        { tex: `C_0 = \\frac{0.5\\times ${f2(dt)} - ${f2(K)}\\times ${f2(X)}}{D} = ${f3(r.C0)},\\; C_1 = \\frac{0.5\\times ${f2(dt)} + ${f2(K)}\\times ${f2(X)}}{D} = ${f3(r.C1)},\\; C_2 = \\frac{${f2(K)}\\times ${(1 - X).toFixed(2)} - 0.5\\times ${f2(dt)}}{D} = ${f3(r.C2)},\\; \\sum C = 1` },
        { text: `All three are non-negative because 2KX = ${f2(2 * K * X)} h ≤ Δt = ${f2(dt)} h ≤ 2K(1−X) = ${f2(2 * K * (1 - X))} h — the stability window.` },
      ],
    },
    {
      title: 'Step the hydrograph',
      lines: [
        { tex: 'O_2 = C_0 I_2 + C_1 I_1 + C_2 O_1' },
        { tex: `O_1 = ${f3(r.C0)}\\times ${f2(inflow[1])} + ${f3(r.C1)}\\times ${f2(inflow[0])} + ${f3(r.C2)}\\times ${f2(r.outflow[0])} = ${f2(r.outflow[1])}\\ \\text{m}^3/\\text{s}` },
        { text: `Starting from steady flow O0 = I0 = ${f2(inflow[0])} m³/s, each interval routes ${f2(dt)} h of inflow. ${inflow.length} ordinates in, ${inflow.length} out.` },
        { tex: `Q_{peak}\\colon ${f2(r.peakIn)} \\rightarrow ${f2(r.peakOut)}\\ \\text{m}^3/\\text{s} \\quad (${f2(r.attenuationPct)}\\%\\ \\text{attenuated})` },
        { text: `The peak passes the reach ${f2(r.lagHr)} h later than it entered — translation plus storage.` },
      ],
    },
    {
      title: 'Volume check',
      lines: [
        { tex: '\\text{trap}(I) - \\text{trap}(O) = \\Delta S = K[\\,XI + (1-X)O\\,]_{end} - K[\\,XI + (1-X)O\\,]_{start}' },
        { tex: `\\text{trap}(I) - \\text{trap}(O) = ${(r.volumeIn / 1000).toFixed(1)} - ${(r.volumeOut / 1000).toFixed(1)} = ${((r.volumeIn - r.volumeOut) / 1000).toFixed(1)}\\ \\times 10^3\\text{ m}^3 = \\Delta S` },
        { text: `Inflow ${(r.volumeIn / 1000).toFixed(1)} ×10³ m³, outflow ${(r.volumeOut / 1000).toFixed(1)} ×10³ m³; the difference is stored in (or released from) the reach, exactly the change in K[XI+(1−X)O].` },
      ],
    },
    ...r.notes.map((nt) => ({ title: 'Note', lines: [{ text: nt }] })),
  ] : [{ title: 'Check the inputs', lines: [{ text: out.error ?? 'Give at least three non-negative inflow ordinates.' }] }]

  const lo = 2 * K * X, hi = 2 * K * (1 - X)
  const stable = dt >= lo - 1e-9 && dt <= hi + 1e-9
  return (
    <WorkspacePage title="Muskingum Routing" badges={['Hydrology', 'Channel routing']}
      intro="Route a flood wave through a river reach: the storage S = K[X·I + (1−X)·O] turns K, X and the interval into three weighting coefficients that delay and flatten the inflow hydrograph, inside the stability window 2KX ≤ Δt ≤ 2K(1−X)."
      inputs={<>
        <InputGroup title="Reach and interval">
          <Num label="Storage constant K" unit="h" value={K} onChange={setK} min={0.1} max={72} step="0.1" />
          <Num label="Weighting X" value={X} onChange={setX} min={0} max={0.5} step="0.05" />
          <Num label="Interval Δt" unit="h" value={dt} onChange={setDt} min={0.1} max={24} step="0.1" hint={`stable for ${f2(lo)}–${f2(hi)} h`} />
        </InputGroup>
        <InputGroup title="Inflow hydrograph" hint="m³/s at each interval, starting at t = 0.">
          <div className="col-span-2 grid grid-cols-3 gap-1.5 [&_input]:!px-2">
            {inflow.map((q, i) => (
              <Num key={i} label={`t ${f2(i * dt)} h`} value={q} onChange={(v) => setOrd(i, v)} min={0} step="1" />
            ))}
          </div>
          <div className="col-span-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => setInflow((qs) => [...qs, qs[qs.length - 1] ?? 0])}
              className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">+ Add ordinate</button>
            <button type="button" onClick={() => setInflow((qs) => qs.slice(0, -1))} disabled={inflow.length <= 3}
              className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint disabled:opacity-40">− Remove last</button>
            <button type="button" onClick={() => { setK(1); setX(0.2); setDt(0.5); setInflow(SAMPLE_INFLOW) }}
              className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">Sample: 90 m³/s wave</button>
          </div>
        </InputGroup>
      </>}
      checks={r ? <>
        <CheckCard title="Peak outflow" basis={`inflow peak ${f2(r.peakIn)} m³/s`} status="info" value={f2(r.peakOut)} unit="m³/s" formula="O₂ = C₀I₂ + C₁I₁ + C₂O₁"
          ratio={r.peakIn > 0 ? r.peakOut / r.peakIn : undefined} ratioLabel="Outflow ÷ inflow peak"
          pairs={[{ label: 'Attenuation', value: `${f2(r.attenuationPct)} %` }, { label: 'Lag', value: `${f2(r.lagHr)} h` }]} />
        <CheckCard title="Stability" basis="all coefficients ≥ 0" status={stable ? 'pass' : 'fail'} pillLabel={stable ? 'STABLE' : 'UNSTABLE'}
          value={`${f3(r.C0)} · ${f3(r.C1)} · ${f3(r.C2)}`} formula="2KX ≤ Δt ≤ 2K(1 − X)"
          pairs={[{ label: 'Window', value: `${f2(lo)} – ${f2(hi)} h` }, { label: 'Δt', value: `${f2(dt)} h` }]} />
        <CheckCard title="Volume balance" basis="change in reach storage" status="info" value={f2((r.volumeIn - r.volumeOut) / 1000)} unit="×10³ m³"
          pairs={[{ label: 'Inflow', value: `${f2(r.volumeIn / 1000)} ×10³ m³` }, { label: 'Outflow', value: `${f2(r.volumeOut / 1000)} ×10³ m³` }]} />
      </> : (
        <CheckCard title="Check the inputs" basis="Muskingum" status="warn" pillLabel="CHECK" value="—" formula={out.error ?? 'At least three non-negative ordinates.'} />
      )}
      summary={[
        { label: 'Storage constant K', value: `${f2(K)} h` }, { label: 'Weighting X', value: f2(X) },
        { label: 'Interval Δt', value: `${f2(dt)} h` }, { label: 'Ordinates', value: `${inflow.length}` },
      ]}
      drawing={r ? { title: 'Inflow and routed outflow', node: <div data-pdf-drawing><RoutedHydrographs inflow={inflow} outflow={r.outflow} dt={dt} /></div> } : undefined}
      resultsCaption={r && r.notes.length ? r.notes.join(' ') : undefined}
      results={r ? [
        { check: 'Routing coefficients', basis: 'C₀ + C₁ + C₂ = 1', demand: `${f3(r.C0)} · ${f3(r.C1)} · ${f3(r.C2)}`, status: stable ? 'pass' : 'fail' },
        { check: 'Peak inflow', basis: `t = ${f2(r.tPeakIn)} h`, demand: `${f2(r.peakIn)} m³/s`, status: 'info' },
        { check: 'Peak outflow', basis: `t = ${f2(r.tPeakOut)} h`, demand: `${f2(r.peakOut)} m³/s`, status: 'info' },
        { check: 'Attenuation and lag', basis: 'peak to peak', demand: `${f2(r.attenuationPct)} %, ${f2(r.lagHr)} h`, status: 'info' },
      ] : [{ check: 'Routing', basis: out.error ?? 'invalid input', demand: '—', status: 'warn' }]}
      steps={steps}
      references={[
        { topic: 'Muskingum storage', basis: 'S = K[XI + (1 − X)O]', source: 'McCarthy (1938); Chow, Applied Hydrology §8.4' },
        { topic: 'Routing coefficients', basis: 'C₀, C₁, C₂ from K, X, Δt; ΣC = 1', source: 'Chow, Maidment & Mays, Applied Hydrology' },
        { topic: 'Stability', basis: '2KX ≤ Δt ≤ 2K(1 − X) keeps every coefficient non-negative', source: 'Applied Hydrology §8.4' },
      ]}
    />
  )
}
