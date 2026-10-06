import { useState } from 'react'
import {
  forecastPopulation, demands, kuichlingFireFlow, storage, LPCD_OPTIONS,
  type ForecastMethod,
} from '../engine/waterDemand'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { DemandCharts } from '../components/waterCharts'
import type { SolutionStep } from '../lib/solution'
import { f2 } from '../lib/influenceStyle'

// Water Demand — the municipal chain: population forecast on the design
// horizon, average/max-day/peak-hour demands at the chosen per-capita rate,
// Kuichling fire flow, and the storage reservoir breakdown — demand (a rate)
// and storage (a volume) drawn on their own axes.

export default function WaterDemand() {
  const [method, setMethod] = useState<ForecastMethod>('geometric')
  const [P0, setP0] = useState(100000)
  const [P1, setP1] = useState(82000)
  const [censusYears, setCensusYears] = useState(10)
  const [growthPct, setGrowthPct] = useState(1.8)
  const [a, setA] = useState(1800)
  const [b, setB] = useState(60)
  const [years, setYears] = useState(20)
  const [lpcd, setLpcd] = useState(120)
  const [maxDayFactor, setMaxDayFactor] = useState(1.3)
  const [peakHourFactor, setPeakHourFactor] = useState(2.5)
  const [fireHours, setFireHours] = useState(3)
  const [operatingFrac, setOperatingFrac] = useState(0.25)
  const [emergencyFrac, setEmergencyFrac] = useState(0.25)

  const out: {
    Pn: number; d: ReturnType<typeof demands> | null; fire: ReturnType<typeof kuichlingFireFlow> | null
    st: ReturnType<typeof storage> | null; fErr: string | null
  } = (() => {
    try {
      const Pn = forecastPopulation({ P0, P1, censusYears, growthPct, a, b, years, method }).Pn
      const d = demands(Pn, { lpcd, maxDayFactor, peakHourFactor })
      const fire = kuichlingFireFlow(Pn)
      const st = storage({ MDD: d.MDD, fireLps: fire.lps, fireHours, operatingFrac, emergencyFrac })
      return { Pn, d, fire, st, fErr: null }
    } catch (e) {
      return { Pn: 0, d: null, fire: null, st: null, fErr: e instanceof Error ? e.message : 'Check the inputs' }
    }
  })()
  const { Pn, d, fire, st, fErr } = out

  const METHOD_LABEL: Record<ForecastMethod, string> = {
    arithmetic: 'Arithmetic increase',
    geometric: 'Geometric growth',
    incremental: 'Incremental increase',
    decreasing: 'Decreasing rate',
  }

  const steps: SolutionStep[] = (d && fire && st) ? [
    {
      title: `Population on the design horizon — ${METHOD_LABEL[method]}`,
      lines: method === 'geometric' ? [
        { tex: `P_n = P_0\\left(1 + \\tfrac{r}{100}\\right)^n = ${P0.toLocaleString()}\\,(1+${f2(growthPct)}/100)^{${years}}` },
        { tex: `P_n = ${Math.round(Pn).toLocaleString()}\\ \\text{capita}` },
      ] : method === 'arithmetic' ? [
        { tex: `P_n = P_0 + n\\cdot\\frac{P_0 - P_1}{t_{census}} = ${P0.toLocaleString()} + ${years}\\cdot\\frac{${P0.toLocaleString()} - ${P1.toLocaleString()}}{${censusYears}}` },
        { tex: `P_n = ${Math.round(Pn).toLocaleString()}\\ \\text{capita}` },
      ] : [
        { tex: `P_n = P_0 + n\\,a ${method === 'incremental' ? '+' : '-'} \\frac{n(n+1)}{2}\\,b \\qquad n\\text{ in decades}` },
        { tex: `n = ${f2(years)}/10 = ${f2(years / 10)} \\quad a = ${f2(a)}\\text{/dec} \\quad b = ${f2(b)}\\text{/dec}` },
        { tex: `P_n = ${P0.toLocaleString()} ${method === 'incremental' ? '+' : '-'} ${f2(years / 10)}\\times${f2(a)} ${method === 'incremental' ? '+' : '-'} ${f2((years / 10) * (years / 10 + 1) / 2 * b)} = ${Math.round(Pn).toLocaleString()}\\ \\text{capita}` },
      ],
    },
    {
      title: 'Average, maximum-day and peak-hour demands',
      lines: [
        { tex: `ADD = q\\cdot P_n = ${f2(lpcd)}\\cdot${(Pn / 1000).toFixed(1)}\\,k = ${f2(d.ADD)}\\ \\text{m}^3/\\text{d}` },
        { tex: `MDD = ${f2(maxDayFactor)}\\cdot ADD = ${f2(d.MDD)}\\ \\text{m}^3/\\text{d} \\qquad PHD = ${f2(peakHourFactor)}\\cdot ADD = ${f2(d.PHD)}\\ \\text{m}^3/\\text{d}` },
        { text: `In flow rates: ADD ${f2(d.ADD_lps)} L/s, MDD ${f2(d.MDD_lps)} L/s, PHD ${f2(d.PHD_lps)} L/s (÷86.4). The 1.30 / 2.50 factors are the usual Philippine water-district design pair — tune them to your utility's production records.` },
      ],
    },
    {
      title: 'Fire demand — Kuichling',
      lines: [
        { tex: `Q_f = 3182\\sqrt{P_{k}} = 3182\\sqrt{${f2(Pn / 1000)}} = ${f2(fire.lpm)}\\ \\text{L/min} = ${f2(fire.lps)}\\ \\text{L/s}` },
        { text: `P in thousands. The fire reserve for ${f2(fireHours)} h of this flow is ${f2(fire.lps * 3.6 * fireHours)} m³ — the single biggest storage item in small towns.` },
      ],
    },
    {
      title: 'Storage reservoir breakdown',
      lines: [
        { tex: `V_{op} = ${f2(operatingFrac * 100)}\\,\\%\\,MDD = ${f2(st.operating)}\\ \\text{m}^3 \\quad V_{fire} = Q_f\\cdot t = ${f2(st.fire)}\\ \\text{m}^3 \\quad V_{em} = ${f2(st.emergency)}\\ \\text{m}^3` },
        { tex: `V_{total} = ${f2(st.operating)} + ${f2(st.fire)} + ${f2(st.emergency)} = ${f2(st.total)}\\ \\text{m}^3` },
        { text: 'Operating (equalization) storage balances the hourly swing against the source; fire reserve covers the duration; emergency covers source failure. The total lands near a day of MDD for a typical small town — push it up if the source is single-thread.' },
      ],
    },
  ] : [{ title: 'Check the inputs', lines: [{ text: fErr ?? 'Check the inputs.' }] }]

  const btn = 'rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint'
  const days = d && st ? st.total / d.MDD : 0
  return (
    <WorkspacePage title="Water Demand" badges={['Water supply', 'Demand · storage']}
      intro="The municipal water-supply chain: forecast the design-year population, turn it into average, maximum-day and peak-hour demands at the per-capita rate, add the Kuichling fire flow, and break the storage reservoir into its operating, fire and emergency shares."
      inputs={<>
        <InputGroup title="Population and horizon">
          <div className="col-span-2">
            <Pick label="Forecast method" value={method} onChange={(v) => setMethod(v as ForecastMethod)}
              options={Object.entries(METHOD_LABEL) as [ForecastMethod, string][]} />
          </div>
          <Num label="Present population P₀" value={P0} onChange={setP0} min={100} step="1000" />
          <Num label="Design horizon" unit="yr" value={years} onChange={setYears} min={5} max={50} step="5" />
          {method === 'arithmetic' && <>
            <Num label="Previous census P₁" value={P1} onChange={setP1} min={1} step="1000" />
            <Num label="Census interval" unit="yr" value={censusYears} onChange={setCensusYears} min={1} max={30} step="1" />
          </>}
          {method === 'geometric' && <Num label="Annual growth r" unit="%" value={growthPct} onChange={setGrowthPct} min={0} max={8} step="0.1" />}
          {(method === 'incremental' || method === 'decreasing') && <>
            <Num label="Mean increase a" unit="/dec" value={a} onChange={setA} min={0} step="100" />
            <Num label="Increment b" unit="/dec" value={b} onChange={setB} min={0} step="10" />
          </>}
        </InputGroup>
        <InputGroup title="Demand levels">
          <div className="col-span-2">
            <Pick label="Per-capita demand q" value={String(lpcd)} onChange={(v) => setLpcd(Number(v))}
              options={LPCD_OPTIONS.map((o) => [String(o.v), o.label])} />
          </div>
          <Num label="Max-day factor" value={maxDayFactor} onChange={setMaxDayFactor} min={1} max={2.5} step="0.05" />
          <Num label="Peak-hour factor" value={peakHourFactor} onChange={setPeakHourFactor} min={1} max={5} step="0.05" />
        </InputGroup>
        <InputGroup title="Fire and storage policy" hint="Operating and emergency shares as % of MDD.">
          <Num label="Fire duration" unit="h" value={fireHours} onChange={setFireHours} min={1} max={10} step="0.5" />
          <Num label="Operating" unit="%" value={operatingFrac * 100} onChange={(v) => setOperatingFrac(v / 100)} min={10} max={50} step="5" />
          <Num label="Emergency" unit="%" value={emergencyFrac * 100} onChange={(v) => setEmergencyFrac(v / 100)} min={0} max={50} step="5" />
          <div className="col-span-2">
            <button type="button" className={btn}
              onClick={() => { setMethod('geometric'); setP0(100000); setP1(82000); setGrowthPct(1.8); setYears(20); setLpcd(120) }}>Sample: 100 k at 1.8 %, 120 LPCD</button>
          </div>
        </InputGroup>
      </>}
      checks={d && fire && st ? <>
        <CheckCard title="Design population" basis={`${METHOD_LABEL[method]}, ${years} yr`} status="info" value={Math.round(Pn).toLocaleString('en-US')} unit="capita"
          pairs={[{ label: 'Present', value: P0.toLocaleString('en-US') }, { label: 'Growth', value: `× ${f2(Pn / P0)}` }]} />
        <CheckCard title="Maximum day" basis="source and transmission design" status="info" value={f2(d.MDD)} unit="m³/day"
          formula={`MDD = ${f2(maxDayFactor)} × ADD`}
          pairs={[{ label: 'ADD', value: `${f2(d.ADD)} m³/day` }, { label: 'Peak hour', value: `${f2(d.PHD_lps)} L/s` }]} />
        <CheckCard title="Reservoir" basis="operating + fire + emergency" status="info" value={f2(st.total)} unit="m³"
          formula="Q_f = 3182 √P (P in thousands)"
          pairs={[{ label: 'Fire flow', value: `${f2(fire.lps)} L/s for ${f2(fireHours)} h` }, { label: 'Days of MDD', value: f2(days) }]} />
      </> : (
        <CheckCard title="Check the inputs" basis="water demand" status="warn" pillLabel="CHECK" value="—" formula={fErr ?? 'Check the inputs.'} />
      )}
      summary={[
        { label: 'Forecast', value: `${METHOD_LABEL[method]}, ${years} yr` },
        { label: 'Per-capita q', value: `${f2(lpcd)} L/cap/day` },
        { label: 'Peaking', value: `MDD ×${f2(maxDayFactor)}, PHD ×${f2(peakHourFactor)}` },
        { label: 'Fire duration', value: `${f2(fireHours)} h` },
      ]}
      drawing={d && st ? { title: 'Design demands and reservoir storage', node: <div data-pdf-drawing><DemandCharts ADD={d.ADD} MDD={d.MDD} PHD={d.PHD} fDay={maxDayFactor} fHour={peakHourFactor} operating={st.operating} fire={st.fire} emergency={st.emergency} /></div> } : undefined}
      results={d && fire && st ? [
        { check: 'Average day ADD', basis: `${f2(lpcd)} L/cap/day`, demand: `${f2(d.ADD)} m³/day`, status: 'info' as const },
        { check: 'Maximum day MDD', basis: `${f2(maxDayFactor)} × ADD`, demand: `${f2(d.MDD)} m³/day (${f2(d.MDD_lps)} L/s)`, status: 'info' as const },
        { check: 'Peak hour PHD', basis: `${f2(peakHourFactor)} × ADD`, demand: `${f2(d.PHD)} m³/day (${f2(d.PHD_lps)} L/s)`, status: 'info' as const },
        { check: 'Fire flow', basis: 'Kuichling', demand: `${f2(fire.lps)} L/s`, status: 'info' as const },
        { check: 'Storage', basis: `operating ${f2(st.operating)} + fire ${f2(st.fire)} + emergency ${f2(st.emergency)}`, demand: `${f2(st.total)} m³`, status: 'info' as const },
      ] : [{ check: 'Demand', basis: fErr ?? 'invalid input', demand: '—', status: 'warn' as const }]}
      steps={steps}
      references={[
        { topic: 'Population forecast', basis: 'arithmetic, geometric, incremental, decreasing-rate', source: 'Fair, Geyer & Okun, Water and Wastewater Engineering' },
        { topic: 'Peaking factors', basis: 'MDD and PHD as multiples of ADD', source: 'LWUA design guidelines; Philippine water-district practice' },
        { topic: 'Fire flow', basis: 'Kuichling Q = 3182 √P L/min', source: 'Kuichling (1897); Steel & McGhee, Water Supply and Sewerage' },
        { topic: 'Storage', basis: 'operating + fire reserve + emergency', source: 'AWWA M32 / M42' },
      ]}
    />
  )
}
