import { useState } from 'react'
import 'katex/dist/katex.min.css'
import {
  forecastPopulation, demands, kuichlingFireFlow, storage, LPCD_OPTIONS,
  type ForecastMethod,
} from '../engine/waterDemand'
import { Card, Num, ResultCard, Row, Pick } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, MUTED, BRAND, FAIL, f2 } from '../lib/influenceStyle'

// Water Demand — the municipal chain: population forecast on the design
// horizon, average/max-day/peak-hour demands at the chosen per-capita rate,
// Kuichling fire flow, and the storage reservoir breakdown.

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

  let Pn = 0, fErr: string | null = null
  let d: ReturnType<typeof demands> | null = null
  let fire: ReturnType<typeof kuichlingFireFlow> | null = null
  let st: ReturnType<typeof storage> | null = null
  try {
    const f = forecastPopulation({ P0, P1, censusYears, growthPct, a, b, years, method })
    Pn = f.Pn
    d = demands(Pn, { lpcd, maxDayFactor, peakHourFactor })
    fire = kuichlingFireFlow(Pn)
    st = storage({ MDD: d.MDD, fireLps: fire.lps, fireHours, operatingFrac, emergencyFrac })
  } catch (e) { fErr = e instanceof Error ? e.message : 'Check the inputs' }

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
  ] : []

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
      <ReportControls title="Water Demand Report" badges={[st ? `${f2(st.total)} m³ storage` : 'Municipal demand']} />
      <p className="mt-2 max-w-3xl text-sm text-muted">
        The municipal water-supply chain: forecast the design-year population, turn it
        into average, maximum-day and peak-hour demands at the service-level per-capita
        rate, add the Kuichling fire flow, and break the storage reservoir into its
        operating, fire and emergency shares.
      </p>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="Population & horizon">
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="button"
                onClick={() => { setMethod('geometric'); setP0(100000); setP1(82000); setGrowthPct(1.8); setYears(20); setLpcd(120) }}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                Load the sample — 100 k growing 1.8 % · 120 LPCD
              </button>
            </div>
            <Pick label="Forecast method" value={method}
              onChange={(v) => setMethod(v as ForecastMethod)}
              options={Object.entries(METHOD_LABEL) as [ForecastMethod, string][]} />
            <div className="sm:col-span-2 lg:col-span-2">
              <Num label="Present population P0" unit="—" value={P0} onChange={setP0} min={100} step="1000" />
            </div>
            {(method === 'arithmetic') && (
              <>
                <Num label="Previous census P1" unit="—" value={P1} onChange={setP1} min={1} step="1000" />
                <Num label="Census interval" unit="yr" value={censusYears} onChange={setCensusYears} min={1} max={30} step="1" />
              </>
            )}
            {method === 'geometric' && (
              <Num label="Annual growth r" unit="%" value={growthPct} onChange={setGrowthPct} min={0} max={8} step="0.1" />
            )}
            {(method === 'incremental' || method === 'decreasing') && (
              <>
                <Num label="Mean increase a (per decade)" unit="—" value={a} onChange={setA} min={0} step="100" />
                <Num label="Increment of increase b" unit="—" value={b} onChange={setB} min={0} step="10" />
              </>
            )}
            <Num label="Design horizon" unit="yr" value={years} onChange={setYears} min={5} max={50} step="5" />
          </Card>

          <Card title="Demand levels">
            <Pick label="Per-capita demand q" value={String(lpcd)} onChange={(v) => setLpcd(Number(v))}
              options={LPCD_OPTIONS.map((o) => [String(o.v), o.label])} />
            <Num label="Max-day factor" unit="—" value={maxDayFactor} onChange={setMaxDayFactor} min={1} max={2.5} step="0.05" />
            <Num label="Peak-hour factor" unit="—" value={peakHourFactor} onChange={setPeakHourFactor} min={1} max={5} step="0.05" />
          </Card>

          <Card title="Fire & storage policy">
            <Num label="Fire duration" unit="h" value={fireHours} onChange={setFireHours} min={1} max={10} step="0.5" />
            <Num label="Operating storage (% of MDD)" unit="%" value={operatingFrac * 100} onChange={(v) => setOperatingFrac(v / 100)} min={10} max={50} step="5" />
            <Num label="Emergency storage (% of MDD)" unit="%" value={emergencyFrac * 100} onChange={(v) => setEmergencyFrac(v / 100)} min={0} max={50} step="5" />
          </Card>
        </div>

        <div className="space-y-5">
          {(d && fire && st) ? (
            <>
              <ResultCard title="Design population & demands">
                <Row label={`Population in ${years} yr`} value={Math.round(Pn).toLocaleString()} sub={`${METHOD_LABEL[method]} forecast`} />
                <Row label="Average day ADD" value={`${f2(d.ADD)} m³/d`} sub={`${f2(d.ADD_lps)} L/s · ${f2(lpcd)} LPCD`} />
                <Row label="Maximum day MDD" value={`${f2(d.MDD)} m³/d`} sub={`× ${f2(maxDayFactor)} — the source & transmission design case`} />
                <Row label="Peak hour PHD" value={`${f2(d.PHD)} m³/d`} sub={`× ${f2(peakHourFactor)} — the distribution & pumping design case`} />
              </ResultCard>

              <ResultCard title="Fire flow & storage">
                <Row label="Fire flow (Kuichling)" value={`${f2(fire.lps)} L/s`} sub={`${f2(fire.lpm)} L/min for ${f2(fireHours)} h`} />
                <Row label="Storage total" value={`${f2(st.total)} m³`}
                  sub={`operating ${f2(st.operating)} + fire ${f2(st.fire)} + emergency ${f2(st.emergency)} · ${f2(st.total / d.MDD)} days of MDD`} />
              </ResultCard>

              <DrawingCard title="Demand ladder & storage" meta="ADD → MDD → PHD and where the reservoir goes">
                <DrawingFrame label="Demand ladder">
                  <Ladder add={d.ADD} mdd={d.MDD} phd={d.PHD}
                    op={st.operating} fire={st.fire} em={st.emergency} />
                </DrawingFrame>
              </DrawingCard>

              <WorkedSolution steps={steps} title="Water demand — step by step" />
            </>
          ) : (
            <ResultCard title="Check the inputs">
              <p className="text-sm text-fail">{fErr}</p>
            </ResultCard>
          )}
        </div>
      </div>
    </div>
  )
}

function Ladder({ add, mdd, phd, op, fire, em }: {
  add: number; mdd: number; phd: number; op: number; fire: number; em: number
}) {
  const W = 640, Hh = 320
  const x0 = 76, x1 = W - 46
  const baseY = Hh - 46, topY = 34
  const maxV = Math.max(phd, fire * 3.6 * 3, 1)
  const yOf = (v: number) => baseY - (v / maxV) * (baseY - topY)
  const bars = [
    { label: 'ADD', v: add, fill: 'rgba(15,76,146,0.30)' },
    { label: 'MDD ×1.3', v: mdd, fill: 'rgba(15,76,146,0.55)' },
    { label: 'PHD ×2.5', v: phd, fill: 'rgba(15,76,146,0.82)' },
  ]
  const bw = 64, gap = 56
  const xLadder = x0
  // storage stacked bar on the right half
  const sx = x0 + (x1 - x0) * 0.62
  const segs = [
    { label: 'operating', v: op, fill: 'rgba(15,76,146,0.35)' },
    { label: 'fire', v: fire, fill: FAIL },
    { label: 'emergency', v: em, fill: 'rgba(115,109,94,0.45)' },
  ]
  const segMax = Math.max(op + fire + em, 1)
  let cy = baseY
  const stack = segs.map((s) => {
    const y1 = cy - (s.v / segMax) * (baseY - topY)
    const seg = { ...s, y0: cy, y1 }
    cy = y1
    return seg
  })
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full" role="img" aria-label="Demand ladder and storage breakdown">
      <line x1={x0} x2={x1} y1={baseY} y2={baseY} stroke={INK} strokeWidth="1.2" />
      {bars.map((b, i) => {
        const x = xLadder + i * (bw + gap)
        return (
          <g key={b.label}>
            <rect x={x} y={yOf(b.v)} width={bw} height={baseY - yOf(b.v)} fill={b.fill} stroke={INK} strokeWidth="1" />
            <text x={x + bw / 2} y={yOf(b.v) - 6} textAnchor="middle" fontSize="10.5" fill={INK} fontFamily="var(--font-mono, monospace)">
              {f2(b.v)}
            </text>
            <text x={x + bw / 2} y={baseY + 15} textAnchor="middle" fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">{b.label}</text>
          </g>
        )
      })}
      <text x={xLadder} y={topY - 12} fontSize="10.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">m³/day</text>
      {/* stacked storage bar */}
      {stack.map((s, i) => (
        <rect key={i} x={sx} y={s.y1} width={bw} height={Math.max(0, s.y0 - s.y1)} fill={s.fill} stroke={INK} strokeWidth="0.8"
          opacity={i === 1 ? 0.75 : 1} />
      ))}
      <text x={sx + bw / 2} y={baseY + 15} textAnchor="middle" fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">storage m³</text>
      {stack.map((s, i) => (
        <text key={i} x={sx + bw + 10} y={(s.y0 + s.y1) / 2 + 4} fontSize="9.5" fill={INK} fontFamily="var(--font-mono, monospace)">
          {s.label} {f2(s.v)}
        </text>
      ))}
      <text x={sx + bw / 2} y={baseY - (segMax / segMax) * (baseY - topY) - 10} textAnchor="middle" fontSize="10.5" fill={BRAND} fontFamily="var(--font-mono, monospace)">
        total {f2(op + fire + em)}
      </text>
    </svg>
  )
}
