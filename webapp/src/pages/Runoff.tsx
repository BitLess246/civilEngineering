import { useState } from 'react'
import {
  scsRunoffSuite, type RunoffSuite, type CnPart,
} from '../engine/runoffHydrology'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { TriHydrograph } from '../components/waterCharts'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// SCS Runoff — the NRCS curve-number chain: composite CN from land covers,
// retention S and initial abstraction Ia, runoff depth Q from the storm P,
// the TR-55 lag-method time of concentration, and the triangular unit
// hydrograph peak (SI twin of the 484 equation) with the runoff volume.

const SAMPLE: CnPart[] = [
  { name: 'Meadow, B soils', area: 20, cn: 75 },
  { name: 'Roofs & pavement', area: 30, cn: 85 },
]

export default function Runoff() {
  const [parts, setParts] = useState<CnPart[]>(SAMPLE)
  const [P, setP] = useState(120)
  const [L, setL] = useState(500)
  const [slopePct, setSlopePct] = useState(3)
  const [dtMin, setDtMin] = useState(10)

  const out: { s: RunoffSuite | null } = (() => {
    try {
      return { s: scsRunoffSuite({ parts, P, L, slopePct, dtMin }) }
    } catch { return { s: null } }
  })()
  const s = out.s

  const setPart = (i: number, patch: Partial<CnPart>) => {
    setParts((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  }

  const steps: SolutionStep[] = s ? [
    {
      title: 'Composite curve number',
      lines: [
        { tex: 'CN = \\frac{\\sum A_i CN_i}{\\sum A_i}' },
        { tex: `CN = \\frac{${s.composite.rows.map((r) => `${f2(r.area)}\\times ${f2(r.cn)}`).join(' + ')}}{${s.composite.rows.map((r) => `${f2(r.area)}`).join(' + ')}} = ${f2(s.composite.cn)}` },
        { text: s.composite.rows.map((r) => `${r.name}: ${r.area} ha × CN ${r.cn} (${(r.weight * 100).toFixed(0)} %)`).join(' · ') },
        { tex: `S = \\frac{25400}{CN} - 254 = \\frac{25400}{${f2(s.composite.cn)}} - 254 = ${f2(s.runoff.S)}\\ \\text{mm}` },
      ],
    },
    {
      title: 'Runoff depth',
      lines: [
        { tex: 'I_a = 0.2S \\quad\\quad Q = \\frac{(P - I_a)^2}{P - I_a + S}' },
        { tex: `I_a = ${f2(s.runoff.Ia)}\\ \\text{mm} \\quad Q = \\frac{(${f2(P)} - ${f2(s.runoff.Ia)})^2}{${f2(P)} - ${f2(s.runoff.Ia)} + ${f2(s.runoff.S)}} = ${f2(s.runoff.Q)}\\ \\text{mm}` },
        { text: `Volumetric runoff coefficient Q/P = ${f3(s.runoff.coefficient)}; the storm delivers ${(s.runoff.Q / 10).toFixed(1)} L/m² over the catchment — ${(s.volumeM3 / 1000).toFixed(1)} × 10³ m³ in total (V = 10·Q·A_ha).` },
      ],
    },
    {
      title: 'Lag time → time of concentration (TR-55)',
      lines: [
        { tex: 'T_{lag} = \\frac{L^{0.8}(S + 25.4)^{0.7}}{7069\\sqrt{Y}} \\quad\\quad T_c = \\frac{T_{lag}}{0.6}' },
        { tex: `T_{lag} = \\frac{${f3(L)}^{0.8}(${f2(s.runoff.S)} + 25.4)^{0.7}}{7069\\sqrt{${f2(slopePct)}}} = ${f3(s.lag.lagHr)}\\ \\text{h}, \\quad T_c = ${f3(s.lag.tcHr)}\\ \\text{h}` },
        { text: `L = ${f3(L)} m of hydraulic length, Y = ${f2(slopePct)} % average watershed slope, S in mm. Lag = ${f3(s.lag.lagHr)} h → Tc = ${f3(s.lag.tcHr)} h (${f2(s.lag.tcHr * 60)} min).` },
      ],
    },
    {
      title: 'Triangular unit hydrograph peak',
      lines: [
        { tex: 'T_p = \\frac{\\Delta t}{2} + 0.6\\,T_c \\quad\\quad Q_p = \\frac{0.208\\,A\\,Q}{T_p}' },
        { tex: `T_p = \\frac{${f2(dtMin)}}{120} + 0.6\\times ${f3(s.lag.tcHr)} = ${f3(s.uh.tp)}\\ \\text{h}` },
        { tex: `Q_p = \\frac{0.208\\times ${(s.composite.area / 100).toFixed(2)}\\times ${f2(s.runoff.Q)}}{${f3(s.uh.tp)}} = ${f2(s.uh.qp)}\\ \\text{m}^3/\\text{s},\\quad t_b = 2.67\\,T_p = ${f2(s.uh.tb)}\\ \\text{h}` },
        { text: `Δt = ${dtMin} min computation interval, A = ${(s.composite.area / 100).toFixed(2)} km², Q in mm. The SI coefficient 0.208 is the metric twin of the 484 in TR-55's US-unit equation; the base time is 2.67·Tp.` },
      ],
    },
    ...s.runoff.notes.map((nt) => ({ title: 'Note', lines: [{ text: nt }] })),
  ] : [{ title: 'Check the inputs', lines: [{ text: 'Keep each cover area positive and its CN between 30 and 100; give a positive hydraulic length and slope.' }] }]

  const noRunoff = !!s && s.runoff.Q <= 0
  return (
    <WorkspacePage title="SCS Runoff" badges={['Hydrology', s ? `CN ${f2(s.composite.cn)}` : 'NRCS curve number']}
      intro="The NRCS curve-number chain for a design storm: a composite CN, the retention S and initial abstraction Ia, the runoff depth and its volume, the TR-55 lag-method time of concentration, and the triangular unit-hydrograph peak."
      inputs={<>
        <InputGroup title="Land covers" hint="Area in hectares, curve number 30–100.">
          <div className="col-span-2 space-y-1.5">
            {parts.map((p, i) => (
              <div key={i} className="space-y-1 rounded-md border border-hairline-2 p-2">
                <div className="flex items-center gap-2">
                  <input value={p.name} onChange={(e) => setPart(i, { name: e.target.value })} aria-label={`Cover ${i + 1} name`} className="min-w-0 flex-1 text-[13px]" />
                  <button type="button" aria-label={`Remove cover ${i + 1}`} onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))} disabled={parts.length <= 1}
                    className="text-muted hover:text-fail disabled:opacity-30">✕</button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <Num label="Area" unit="ha" value={p.area} onChange={(v) => setPart(i, { area: v })} min={0.1} step="1" />
                  <Num label="CN" value={p.cn} onChange={(v) => setPart(i, { cn: v })} min={30} max={100} step="1" />
                </div>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setParts((ps) => [...ps, { name: 'New cover', area: 10, cn: 80 }])}
                className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">+ Add cover</button>
              <button type="button" onClick={() => { setParts(SAMPLE.map((p) => ({ ...p }))); setP(120); setL(500); setSlopePct(3); setDtMin(10) }}
                className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">Sample: 50 ha, 120 mm storm</button>
            </div>
          </div>
        </InputGroup>
        <InputGroup title="Storm and watershed">
          <Num label="Storm depth P" unit="mm" value={P} onChange={setP} min={0} max={800} step="5" />
          <Num label="Hydraulic length L" unit="m" value={L} onChange={setL} min={20} max={20000} step="10" />
          <Num label="Watershed slope Y" unit="%" value={slopePct} onChange={setSlopePct} min={0.1} max={50} step="0.1" />
          <Num label="Interval Δt" unit="min" value={dtMin} onChange={setDtMin} min={2} max={60} step="1" />
        </InputGroup>
      </>}
      checks={s ? <>
        <CheckCard title="Peak discharge" basis={`${f2(s.composite.area)} ha · TR-55 triangle`} status="info" value={f2(s.uh.qp)} unit="m³/s" formula="Qp = 0.208 A Q / Tp"
          pairs={[{ label: 'Time to peak Tp', value: `${f3(s.uh.tp)} h` }, { label: 'Base time tb', value: `${f2(s.uh.tb)} h` }]} />
        <CheckCard title="Runoff depth" basis={`P = ${f2(P)} mm`} status={noRunoff ? 'warn' : 'info'} pillLabel={noRunoff ? 'NONE' : undefined} value={f2(s.runoff.Q)} unit="mm"
          formula="Q = (P − Ia)² / (P − Ia + S)" ratio={P > 0 ? s.runoff.Q / P : undefined} ratioLabel="Q / P"
          pairs={[{ label: 'Retention S', value: `${f2(s.runoff.S)} mm` }, { label: 'Initial abstraction Ia', value: `${f2(s.runoff.Ia)} mm` }]} />
        <CheckCard title="Volume and timing" basis="over the catchment" status="info" value={f2(s.volumeM3 / 1000)} unit="×10³ m³" formula="V = 10·Q·A"
          pairs={[{ label: 'Lag', value: `${f2(s.lag.lagHr * 60)} min` }, { label: 'Tc', value: `${f2(s.lag.tcHr * 60)} min` }]} />
      </> : (
        <CheckCard title="Check the inputs" basis="covers, length and slope" status="warn" pillLabel="CHECK" value="—" formula="Positive areas, CN 30–100, positive length and slope." />
      )}
      summary={[
        { label: 'Covers', value: `${parts.length}` }, { label: 'Composite CN', value: s ? f2(s.composite.cn) : '—' },
        { label: 'Storm depth P', value: `${f2(P)} mm` }, { label: 'Hydraulic length', value: `${f2(L)} m at ${f2(slopePct)} %` },
        { label: 'Interval Δt', value: `${f2(dtMin)} min` },
      ]}
      drawing={s ? { title: 'Triangular unit hydrograph', node: <div data-pdf-drawing><TriHydrograph tp={s.uh.tp} qp={s.uh.qp} tb={s.uh.tb} P={P} Q={s.runoff.Q} /></div> } : undefined}
      resultsCaption={s && s.runoff.notes.length ? s.runoff.notes.join(' ') : undefined}
      results={s ? [
        { check: 'Composite CN', basis: 'Σ AᵢCNᵢ / Σ Aᵢ', demand: f2(s.composite.cn), status: 'info' },
        { check: 'Runoff depth Q', basis: '(P − Ia)²/(P − Ia + S)', demand: `${f2(s.runoff.Q)} mm`, status: noRunoff ? 'warn' : 'info' },
        { check: 'Runoff volume', basis: '10·Q·A', demand: `${f2(s.volumeM3)} m³`, status: 'info' },
        { check: 'Time of concentration', basis: 'TR-55 lag / 0.6', demand: `${f2(s.lag.tcHr * 60)} min`, status: 'info' },
        { check: 'Peak discharge Qp', basis: '0.208 A Q / Tp', demand: `${f2(s.uh.qp)} m³/s`, status: 'info' },
      ] : [{ check: 'Runoff', basis: 'inputs out of range', demand: '—', status: 'warn' }]}
      steps={steps}
      references={[
        { topic: 'Curve-number runoff', basis: 'S = 25400/CN − 254; Ia = 0.2S; Q = (P − Ia)²/(P − Ia + S) (mm)', source: 'USDA NRCS NEH Part 630 Ch. 10' },
        { topic: 'Lag method', basis: 'T_lag = L^0.8 (S + 25.4)^0.7 / (7069 √Y); Tc = T_lag / 0.6', source: 'USDA TR-55 (1986)' },
        { topic: 'Unit hydrograph', basis: 'Qp = 0.208 A Q / Tp (SI); tb = 2.67 Tp', source: 'NRCS NEH Part 630 Ch. 16' },
      ]}
    />
  )
}
