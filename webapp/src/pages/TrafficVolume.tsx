import { useState } from 'react'
// Every page that renders worked-solution math carries its own KaTeX stylesheet
// — it stays out of the pages that never show an equation.
import 'katex/dist/katex.min.css'
import { trafficVolumes, type TrafficVolumeResult } from '../engine/trafficVolume'
import { Card, Num, ResultCard, Row } from '../components/qty'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// Traffic Volume Studies — the counting vocabulary: peak-hour factor and the
// 15-minute flow rate, design-hour volumes (DHV/DDHV from K and D), and the
// compound-growth AADT projection to the design year (engine/trafficVolume.ts).

export default function TrafficVolume() {
  const [hourly, setHourly] = useState(1000)
  const [peak15, setPeak15] = useState(300)
  const [adt, setAdt] = useState(20000)
  const [k, setK] = useState(0.10)
  const [d, setD] = useState(0.6)
  const [aadt0, setAadt0] = useState(25000)
  const [growthPct, setGrowthPct] = useState(3)
  const [years, setYears] = useState(10)

  const res: TrafficVolumeResult | null = (() => {
    try {
      return trafficVolumes(
        { hourly, peak15 },
        { adt, k, d },
        { aadt0, growthPct, years },
      )
    } catch { return null }
  })()

  const steps: SolutionStep[] = res ? [
    {
      title: 'Peak-hour factor and the design flow rate',
      lines: [
        { tex: `PHF = \\frac{V}{4\\times V_{15}} = \\frac{${f2(hourly)}}{4\\times ${f2(peak15)}} = ${f3(res.phf)}` },
        { tex: `\\text{flow rate} = \\frac{V}{PHF} = ${f3(res.flowRate)}\\text{ veh/h}` },
        { text: 'PHF = 1.00 means the busiest 15 minutes ran at the hourly average all hour; smaller values mean a sharper spike. Dividing by PHF converts the counted hour into the rate the design must actually clear.' },
      ],
    },
    {
      title: 'Design-hour volumes from the daily traffic',
      lines: [
        { tex: `DHV = ADT \\times K = ${f3(adt)} \\times ${f3(k)} = ${f3(res.dhv)}\\text{ veh/h}` },
        { tex: `DDHV = ADT \\times K \\times D = ${f3(adt)} \\times ${f3(k)} \\times ${f3(d)} = ${f3(res.ddhv)}\\text{ veh/h}` },
        { text: 'K is the fraction of daily traffic that lands in the 30th-highest hour of the year; D splits it to the peak direction. DDHV is the number lanes are actually sized against.' },
      ],
    },
    {
      title: `Projection to the design year (+${f2(growthPct)} %/yr for ${f2(years)} yr)`,
      lines: [
        { tex: `AADT_{n} = AADT_0\\,(1+g)^{n} = ${f3(aadt0)}\\times(1+${f3(growthPct / 100)})^{${f2(years)}} = ${f3(res.aadtDesign)}\\text{ veh/day}` },
        { text: `The daily traffic the facility opens with is not what it must carry at the end of its service life — compound growth over ${f2(years)} years adds ${f2(res.aadtDesign - aadt0)} veh/day.` },
      ],
    },
    ...(res.warnings.length ? [{
      title: 'Consistency notes',
      lines: res.warnings.map((w) => ({ item: w })),
    } satisfies SolutionStep] : []),
  ] : []

  return (
    <div>
      <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
        <ReportControls title="Traffic Volume Studies Report" badges={['PHF · DHV · AADT']} />
        <p className="mt-2 max-w-3xl text-sm text-muted">
          From counts to design volumes: the peak-hour factor and the 15-minute flow rate, the
          design-hour and directional volumes from K and D, and the compound-growth projection that
          carries today's AADT to the design year.
        </p>

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          {/* ── inputs ── */}
          <div className="space-y-5">
            <Card title="Peak hour">
              <Num label="Peak-hour volume V" unit="veh/h" value={hourly} onChange={setHourly} min={1} max={50000} step="50" />
              <Num label="Busiest 15 minutes V₁₅" unit="veh" value={peak15} onChange={setPeak15} min={1} max={50000} step="10" />
              <p className="text-[10px] text-faint sm:col-span-2 lg:col-span-3">PHF = V / (4·V₁₅) — leave the peak 15 blank at 0? No: both counts must be positive.</p>
            </Card>

            <Card title="Design hour (from ADT)">
              <Num label="ADT" unit="veh/day" value={adt} onChange={setAdt} min={100} max={500000} step="500" />
              <Num label="K factor" value={k} onChange={setK} min={0.01} max={0.3} step="0.005" />
              <Num label="D factor (directional)" value={d} onChange={setD} min={0.5} max={1} step="0.01" />
              <p className="text-[10px] text-faint sm:col-span-2 lg:col-span-3">Planning range: K ≈ 0.08–0.13, D ≈ 0.52–0.68 — outside it the engine attaches a note, not an error.</p>
            </Card>

            <Card title="Growth to the design year">
              <Num label="Base-year AADT" unit="veh/day" value={aadt0} onChange={setAadt0} min={100} max={500000} step="500" />
              <Num label="Annual growth g" unit="%" value={growthPct} onChange={setGrowthPct} min={-5} max={15} step="0.5" />
              <Num label="Years to design year" unit="yr" value={years} onChange={setYears} min={0} max={50} step="1" />
            </Card>
          </div>

          {/* ── results ── */}
          <div className="space-y-5">
            {res ? (
              <>
                <ResultCard title="Peak-hour demand">
                  <Row label="Peak-hour factor" value={f3(res.phf)} sub={res.phf > 0.92 ? 'uniform peak — design-friendly' : res.phf > 0.8 ? 'typical urban peak' : 'sharp spike — nearly all demand in one quarter hour'} />
                  <Row label="Design flow rate" value={`${f3(res.flowRate)} veh/h`} sub="the rate the facility must clear" />
                </ResultCard>

                <ResultCard title="Design-hour volumes">
                  <Row label="DHV" value={`${f3(res.dhv)} veh/h`} sub={`ADT × K = ${f3(adt)} × ${f3(k)}`} />
                  <Row label="DDHV (peak direction)" value={`${f3(res.ddhv)} veh/h`} sub={`DHV × D = ${f3(d)} directional split`} />
                </ResultCard>

                <ResultCard title="Projection">
                  <Row label={`AADT in ${f2(years)} years`} value={`${f3(res.aadtDesign)} veh/day`} sub={`from ${f3(aadt0)} at ${f2(growthPct)} %/yr compound`} />
                  <Row label="Growth added" value={`+${f3(res.aadtDesign - aadt0)} veh/day`} sub={`×${f3(Math.pow(1 + growthPct / 100, years))} total factor`} />
                </ResultCard>

                {res.warnings.length > 0 && (
                  <ResultCard title="Notes">
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                      {res.warnings.map((w) => <li key={w}>{w}</li>)}
                    </ul>
                  </ResultCard>
                )}
              </>
            ) : (
              <ResultCard title="Check the counts">
                <p className="text-sm text-fail">
                  Volumes must be positive, K between 0 and 1, D between 0.5 and 1, and the growth
                  rate above −100 %.
                </p>
              </ResultCard>
            )}
          </div>
        </div>

        {res && (
          <div className="mt-6">
            <WorkedSolution steps={steps} title="Traffic Volume Studies — step-by-step" />
          </div>
        )}
      </div>
    </div>
  )
}
