import { useState } from 'react'
import { solveDD1, solveMM1, type DD1Result, type MM1Result, type ArrivalPeriod } from '../engine/trafficQueue'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { QueueCurves } from '../components/trafficSketches'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// Traffic Queues — the deterministic D/D/1 accumulation of the board exam
// (piecewise arrival rates against a constant bottleneck service rate) with
// the M/M/1 stochastic benchmark beside it (engine/trafficQueue.ts).

interface PeriodUI {
  rate: string
  minutes: string
}

const SAMPLE: PeriodUI[] = [
  { rate: '600', minutes: '15' },
  { rate: '300', minutes: '30' },
]

export default function TrafficQueue() {
  const [periods, setPeriods] = useState<PeriodUI[]>(SAMPLE)
  const [service, setService] = useState(400)
  const [mmLambda, setMmLambda] = useState(80)
  const [mmMu, setMmMu] = useState(100)

  const setPeriod = (i: number, patch: Partial<PeriodUI>) =>
    setPeriods((ps) => ps.map((p, k) => (k === i ? { ...p, ...patch } : p)))
  const addPeriod = () => setPeriods((ps) => [...ps, { rate: '', minutes: '15' }])
  const delPeriod = (i: number) => setPeriods((ps) => ps.filter((_, k) => k !== i))
  const loadSample = () => { setPeriods(SAMPLE.map((p) => ({ ...p }))); setService(400) }

  const parsedPeriods: ArrivalPeriod[] = periods.map((p) => ({
    rate: parseFloat(p.rate) || 0,
    minutes: parseFloat(p.minutes) || 0,
  }))

  const dd1: DD1Result | null = (() => {
    try { return solveDD1({ periods: parsedPeriods, service }) } catch { return null }
  })()
  const mm1: MM1Result | null = (() => { try { return solveMM1(mmLambda, mmMu) } catch { return null } })()

  const steps: SolutionStep[] = dd1 ? [
    {
      title: 'The queue builds at (λ − μ) while demand exceeds service',
      lines: [
        ...parsedPeriods.map((p) => ({ item: `λ = ${f3(p.rate)} veh/h for ${f2(p.minutes)} min — ${f3(p.rate * p.minutes / 60)} veh arrive` })),
        { text: `Service clears μ = ${f3(service)} veh/h = ${f3(service / 60)} veh/min. Every minute the arrival rate exceeds it, the line grows by the difference.` },
        { tex: `Q_{\\max} = (\\lambda_1 - \\mu)\\,t_1 = (${f3(parsedPeriods[0]?.rate ?? 0)} - ${f3(service)})\\times ${f2(parsedPeriods[0]?.minutes ?? 0)}\\!/\\!60 = ${f3(dd1.maxQueue)}\\text{ veh at } t = ${f2(dd1.maxQueueMinute)}\\text{ min}` },
      ],
    },
    {
      title: 'Dissipation',
      lines: dd1.dissipation !== null
        ? [
            { text: `After the peak, arrivals fall but the departures keep leaving at μ, so the line drains at (μ − λ₂) = (${f3(service)} − ${f3(parsedPeriods[parsedPeriods.length - 1]?.rate ?? 0)})/60 = ${f3((service - (parsedPeriods[parsedPeriods.length - 1]?.rate ?? 0)) / 60)} veh/min until the cumulative curves cross back.` },
            { tex: `t_{\\text{clear}} = ${f2(dd1.dissipation)}\\text{ min}` },
          ]
        : [{ text: 'The queue never clears inside the study period — stretch the last arrival period or raise μ to see the dissipation.' }],
    },
    {
      title: 'Delay — the area between the arrival and departure curves',
      lines: [
        { tex: `D_{\\text{total}} = \\int_0^{t} Q(t)\\,dt = \\sum_{t=1}^{${dd1.ticks.length}} Q_t\\cdot 1 = ${f3(dd1.totalDelay)}\\text{ veh}\\cdot\\text{min}` },
        { tex: `d_{\\text{avg}} = \\frac{D_{\\text{total}}}{\\text{vehicles}} = \\frac{${f3(dd1.totalDelay)}}{${f3(dd1.vehiclesDelayed)}} = ${f3(dd1.avgDelay)}\\text{ min/veh}` },
        { text: 'The integral is exact on the one-minute grid because every rate is constant within its period — no interpolation, no approximation.' },
      ],
    },
    ...(mm1?.stable ? [{
      title: 'M/M/1 benchmark at the same λ and μ',
      lines: [
        { tex: `\\rho = \\lambda/\\mu = ${f3(mmLambda)}/${f3(mmMu)} = ${f3(mm1.rho)},\\quad L_q = \\frac{\\rho^2}{1-\\rho} = \\frac{${f3(mm1.rho)}^2}{1-${f3(mm1.rho)}} = ${f3(mm1.Lq)}\\text{ veh},\\quad W_q = \\frac{\\lambda}{\\mu(\\mu-\\lambda)} = \\frac{${f3(mmLambda)}}{${f3(mmMu)}\\times(${f3(mmMu)}-${f3(mmLambda)})}\\times 60 = ${f3(mm1.Wq)}\\text{ min}` },
        { text: 'Poisson arrivals with exponential service queue far longer than a perfectly metered line — the deterministic answer is the floor, not the expectation.' },
      ],
    } satisfies SolutionStep] : []),
  ] : [{ title: 'Check the periods', lines: [{ text: 'Arrival rates cannot be negative, service must be positive, and every period needs a whole number of minutes.' }] }]

  const btn = 'rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint'
  return (
    <WorkspacePage title="Traffic Queues" badges={['Traffic', 'D/D/1 · M/M/1']}
      intro="The deterministic queue: vehicles arriving at piecewise-constant rates against a bottleneck that serves at one rate — the longest queue, when the line clears, and the total and average delay read off the cumulative curves, with the M/M/1 stochastic benchmark beside it."
      inputs={<>
        <InputGroup title="Arrival periods" hint="Piecewise-constant rates, whole minutes.">
          {periods.map((p, i) => (
            <div key={i} className="col-span-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
              <Num label={`λ${i + 1}`} unit="veh/h" value={parseFloat(p.rate) || 0} onChange={(v) => setPeriod(i, { rate: String(v) })} step="50" />
              <Num label="for" unit="min" value={parseFloat(p.minutes) || 0} onChange={(v) => setPeriod(i, { minutes: String(v) })} step="5" />
              <button type="button" onClick={() => delPeriod(i)} disabled={periods.length <= 1} aria-label={`Remove period ${i + 1}`}
                className="mb-2 rounded-md border border-field-line px-1.5 py-0.5 text-xs text-muted hover:text-fail disabled:opacity-30">✕</button>
            </div>
          ))}
          <div className="col-span-2 flex flex-wrap gap-2">
            <button type="button" onClick={addPeriod} className={btn}>+ Add period</button>
            <button type="button" onClick={loadSample} className={btn}>Sample: 600 for 15 min, then 300, μ = 400</button>
          </div>
        </InputGroup>
        <InputGroup title="Bottleneck">
          <div className="col-span-2"><Num label="Service rate μ" unit="veh/h" value={service} onChange={setService} min={1} max={10000} step="50" /></div>
        </InputGroup>
        <InputGroup title="Stochastic benchmark (M/M/1)" hint="Keep the rates aligned with the deterministic sheet — the comparison is the point.">
          <Num label="Arrival λ" unit="veh/h" value={mmLambda} onChange={setMmLambda} min={1} max={10000} step="10" />
          <Num label="Service μ" unit="veh/h" value={mmMu} onChange={setMmMu} min={1} max={10000} step="10" />
        </InputGroup>
      </>}
      checks={dd1 ? <>
        <CheckCard title="Longest queue" basis={`at t = ${f2(dd1.maxQueueMinute)} min`} status={dd1.maxQueue > 0 ? 'warn' : 'pass'} pillLabel={dd1.maxQueue > 0 ? 'QUEUE' : 'FREE FLOW'}
          value={f2(dd1.maxQueue)} unit="veh" formula="Q = (λ − μ) t"
          pairs={[{ label: 'Clears', value: dd1.dissipation !== null ? `${f2(dd1.dissipation)} min` : 'not in the study' }, { label: 'Service', value: `${f2(service)} veh/h` }]} />
        <CheckCard title="Delay" basis="area between the curves" status="info" value={f2(dd1.avgDelay)} unit="min/veh"
          pairs={[{ label: 'Total', value: `${f2(dd1.totalDelay)} veh·min` }, { label: 'Vehicles delayed', value: f2(dd1.vehiclesDelayed) }]} />
        {mm1 && <CheckCard title="M/M/1 benchmark" basis="ρ = λ/μ" status={mm1.stable ? 'info' : 'fail'} pillLabel={mm1.stable ? undefined : 'UNSTABLE'}
          value={mm1.stable ? f2(mm1.Wq) : '—'} unit={mm1.stable ? 'min wait' : undefined} formula="Lq = ρ² / (1 − ρ)"
          pairs={mm1.stable ? [{ label: 'ρ', value: f3(mm1.rho) }, { label: 'Lq', value: `${f2(mm1.Lq)} veh` }] : [{ label: 'ρ', value: f3(mm1.rho) }]} />}
      </> : (
        <CheckCard title="Check the periods" basis="D/D/1" status="warn" pillLabel="CHECK" value="—" formula="Non-negative rates, positive service, whole minutes." />
      )}
      summary={[
        ...parsedPeriods.map((p, i) => ({ label: `Period ${i + 1}`, value: `${f2(p.rate)} veh/h for ${f2(p.minutes)} min` })),
        { label: 'Service μ', value: `${f2(service)} veh/h` },
      ]}
      drawing={dd1 ? { title: 'Cumulative arrival and departure curves', node: <div data-pdf-drawing><QueueCurves res={dd1} /></div> } : undefined}
      results={dd1 ? [
        { check: 'Longest queue', basis: `t = ${f2(dd1.maxQueueMinute)} min`, demand: `${f2(dd1.maxQueue)} veh`, status: 'info' as const },
        { check: 'Dissipation', basis: 'curves re-cross', demand: dd1.dissipation !== null ? `${f2(dd1.dissipation)} min` : 'never in the study', status: dd1.dissipation === null && dd1.maxQueue > 0 ? 'warn' as const : 'info' as const },
        { check: 'Total delay', basis: 'area between the curves', demand: `${f2(dd1.totalDelay)} veh·min`, status: 'info' as const },
        { check: 'Average delay', basis: `${f2(dd1.vehiclesDelayed)} vehicles`, demand: `${f2(dd1.avgDelay)} min/veh`, status: 'info' as const },
        ...(mm1 && mm1.stable ? [{ check: 'M/M/1 mean wait', basis: `ρ = ${f3(mm1.rho)}`, demand: `${f2(mm1.Wq)} min`, status: 'info' as const }] : []),
      ] : [{ check: 'Queue', basis: 'invalid periods', demand: '—', status: 'warn' as const }]}
      steps={steps}
      references={[
        { topic: 'Deterministic queue', basis: 'cumulative arrival and departure curves', source: 'Mannering & Washburn, Principles of Highway Engineering and Traffic Analysis, Ch. 5' },
        { topic: 'M/M/1', basis: 'Lq = ρ²/(1 − ρ), Wq = λ / μ(μ − λ)', source: 'Garber & Hoel, Traffic and Highway Engineering' },
      ]}
    />
  )
}
