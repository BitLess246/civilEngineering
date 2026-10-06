import { useState } from 'react'
import { trafficVolumes, type TrafficVolumeResult } from '../engine/trafficVolume'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { GrowthCurve } from '../components/trafficSketches'
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
        { tex: `\\text{flow rate} = \\frac{V}{PHF} = \\frac{${f2(hourly)}}{${f3(res.phf)}} = ${f3(res.flowRate)}\\text{ veh/h}` },
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
  ] : [{ title: 'Check the counts', lines: [{ text: 'Volumes must be positive, K between 0 and 1, D between 0.5 and 1, and the growth rate above −100 %.' }] }]

  const phfNote = res ? (res.phf > 0.92 ? 'uniform peak' : res.phf > 0.8 ? 'typical urban peak' : 'sharp spike') : ''
  return (
    <WorkspacePage title="Traffic Volume Studies" badges={['Traffic', 'PHF · DHV · AADT']}
      intro="From counts to design volumes: the peak-hour factor and the 15-minute flow rate, the design-hour and directional volumes from K and D, and the compound-growth projection that carries today's AADT to the design year."
      inputs={<>
        <InputGroup title="Peak hour" hint="PHF = V / (4·V₁₅); both counts must be positive.">
          <Num label="Peak-hour volume V" unit="veh/h" value={hourly} onChange={setHourly} min={1} max={50000} step="50" />
          <Num label="Busiest 15 min V₁₅" unit="veh" value={peak15} onChange={setPeak15} min={1} max={50000} step="10" />
        </InputGroup>
        <InputGroup title="Design hour" hint="Planning range K ≈ 0.08–0.13, D ≈ 0.52–0.68.">
          <div className="col-span-2"><Num label="ADT" unit="veh/day" value={adt} onChange={setAdt} min={100} max={500000} step="500" /></div>
          <Num label="K factor" value={k} onChange={setK} min={0.01} max={0.3} step="0.005" />
          <Num label="D factor" value={d} onChange={setD} min={0.5} max={1} step="0.01" />
        </InputGroup>
        <InputGroup title="Growth to the design year">
          <div className="col-span-2"><Num label="Base-year AADT" unit="veh/day" value={aadt0} onChange={setAadt0} min={100} max={500000} step="500" /></div>
          <Num label="Annual growth g" unit="%" value={growthPct} onChange={setGrowthPct} min={-5} max={15} step="0.5" />
          <Num label="Years" unit="yr" value={years} onChange={setYears} min={0} max={50} step="1" />
        </InputGroup>
      </>}
      checks={res ? <>
        <CheckCard title="Peak-hour factor" basis={phfNote} status="info" value={f3(res.phf)} formula="PHF = V / (4 V₁₅)"
          pairs={[{ label: 'Design flow rate', value: `${f2(res.flowRate)} veh/h` }, { label: 'Counted hour', value: `${f2(hourly)} veh/h` }]} />
        <CheckCard title="Directional design hour" basis="ADT × K × D" status="info" value={f2(res.ddhv)} unit="veh/h"
          pairs={[{ label: 'DHV', value: `${f2(res.dhv)} veh/h` }, { label: 'Split D', value: f3(d) }]} />
        <CheckCard title="Design-year AADT" basis={`${f2(growthPct)} %/yr for ${f2(years)} yr`} status="info" value={f2(res.aadtDesign)} unit="veh/day"
          formula="AADTₙ = AADT₀ (1 + g)ⁿ"
          pairs={[{ label: 'Growth added', value: `${f2(res.aadtDesign - aadt0)} veh/day` }, { label: 'Factor', value: `× ${f3(Math.pow(1 + growthPct / 100, years))}` }]} />
      </> : (
        <CheckCard title="Check the counts" basis="traffic volume" status="warn" pillLabel="CHECK" value="—" formula="Positive volumes; 0 < K < 1; 0.5 ≤ D ≤ 1." />
      )}
      summary={[
        { label: 'Peak hour', value: `${f2(hourly)} veh/h, V₁₅ ${f2(peak15)}` },
        { label: 'ADT', value: `${f2(adt)} veh/day` },
        { label: 'K, D', value: `${f3(k)}, ${f3(d)}` },
        { label: 'Growth', value: `${f2(growthPct)} %/yr, ${f2(years)} yr` },
      ]}
      drawing={res ? { title: 'AADT projection', node: <div data-pdf-drawing><GrowthCurve aadt0={aadt0} growthPct={growthPct} years={years} /></div> } : undefined}
      resultsCaption={res && res.warnings.length ? res.warnings.join(' ') : undefined}
      results={res ? [
        { check: 'Peak-hour factor', basis: 'V / (4 V₁₅)', demand: f3(res.phf), status: 'info' as const },
        { check: 'Design flow rate', basis: 'V / PHF', demand: `${f2(res.flowRate)} veh/h`, status: 'info' as const },
        { check: 'DHV', basis: 'ADT × K', demand: `${f2(res.dhv)} veh/h`, status: 'info' as const },
        { check: 'DDHV', basis: 'DHV × D', demand: `${f2(res.ddhv)} veh/h`, status: 'info' as const },
        { check: 'Design-year AADT', basis: 'compound growth', demand: `${f2(res.aadtDesign)} veh/day`, status: 'info' as const },
      ] : [{ check: 'Volumes', basis: 'invalid input', demand: '—', status: 'warn' as const }]}
      steps={steps}
      references={[
        { topic: 'Peak-hour factor', basis: 'PHF = V / (4 V₁₅)', source: 'HCM 6th ed., Ch. 4' },
        { topic: 'Design hour', basis: 'DHV = AADT × K, DDHV = DHV × D', source: 'AASHTO Green Book §2.3' },
        { topic: 'Projection', basis: 'compound growth to the design year', source: 'Garber & Hoel, Traffic and Highway Engineering' },
      ]}
    />
  )
}
