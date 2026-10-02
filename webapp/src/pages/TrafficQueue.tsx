import { useState } from 'react'
// Every page that renders worked-solution math carries its own KaTeX stylesheet
// — it stays out of the pages that never show an equation.
import 'katex/dist/katex.min.css'
import { solveDD1, solveMM1, type DD1Result, type MM1Result, type ArrivalPeriod } from '../engine/trafficQueue'
import { Card, Num, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, BRAND, FAIL, MUTED, HAIR, f2, f3 } from '../lib/influenceStyle'

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
        { tex: `Q_{\\max} = (\\lambda_1 - \\mu)\\,t_1 = ${f3(dd1.maxQueue)}\\text{ veh at } t = ${f2(dd1.maxQueueMinute)}\\text{ min}` },
      ],
    },
    {
      title: 'Dissipation',
      lines: dd1.dissipation !== null
        ? [
            { text: `After the peak, arrivals fall but the departures keep leaving at μ, so the line drains at (μ − λ₂) vehicles per minute until the cumulative curves cross back.` },
            { tex: `t_{\\text{clear}} = ${f2(dd1.dissipation)}\\text{ min}` },
          ]
        : [{ text: 'The queue never clears inside the study period — stretch the last arrival period or raise μ to see the dissipation.' }],
    },
    {
      title: 'Delay — the area between the arrival and departure curves',
      lines: [
        { tex: `D_{\\text{total}} = \\int_0^{t} Q(t)\\,dt = ${f3(dd1.totalDelay)}\\text{ veh}\\cdot\\text{min}` },
        { tex: `d_{\\text{avg}} = \\frac{D_{\\text{total}}}{\\text{vehicles}} = \\frac{${f3(dd1.totalDelay)}}{${f3(dd1.vehiclesDelayed)}} = ${f3(dd1.avgDelay)}\\text{ min/veh}` },
        { text: 'The integral is exact on the one-minute grid because every rate is constant within its period — no interpolation, no approximation.' },
      ],
    },
    ...(mm1?.stable ? [{
      title: 'M/M/1 benchmark at the same λ and μ',
      lines: [
        { tex: `\\rho = \\lambda/\\mu = ${f3(mm1.rho)},\\quad L_q = \\frac{\\rho^2}{1-\\rho} = ${f3(mm1.Lq)}\\text{ veh},\\quad W_q = \\frac{\\lambda}{\\mu(\\mu-\\lambda)} = ${f3(mm1.Wq)}\\text{ min}` },
        { text: 'Poisson arrivals with exponential service queue far longer than a perfectly metered line — the deterministic answer is the floor, not the expectation.' },
      ],
    } satisfies SolutionStep] : []),
  ] : []

  return (
    <div>
      <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
        <ReportControls title="Traffic Queue Report" badges={['D/D/1', 'M/M/1']} />
        <p className="mt-2 max-w-3xl text-sm text-muted">
          The classic deterministic queue: vehicles arriving at piecewise-constant rates against a
          bottleneck that serves at one rate — the longest queue, when the line clears, and the
          total and average delay read off the cumulative curves.
        </p>

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          {/* ── inputs ── */}
          <div className="space-y-5">
            <Card title="Arrival periods" hint="piecewise-constant rates, whole minutes">
              <div className="sm:col-span-2 lg:col-span-3">
                <button type="button" onClick={loadSample}
                  className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                  Load the classic — 600 veh/h for 15 min, then 300, μ = 400
                </button>
              </div>
              <div className="sm:col-span-2 lg:col-span-3 space-y-1.5">
                {periods.map((p, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1.4rem] items-end gap-1.5">
                    <Num label={`λ ${i + 1}`} unit="veh/h" value={parseFloat(p.rate) || 0} onChange={(v) => setPeriod(i, { rate: String(v) })} step="50" />
                    <Num label="for" unit="min" value={parseFloat(p.minutes) || 0} onChange={(v) => setPeriod(i, { minutes: String(v) })} step="5" />
                    <button type="button" onClick={() => delPeriod(i)} disabled={periods.length <= 1}
                      className="mb-1.5 text-muted hover:text-fail disabled:opacity-30">✕</button>
                  </div>
                ))}
                <button type="button" onClick={addPeriod}
                  className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">+ Add period</button>
              </div>
              <Num label="Service rate μ" unit="veh/h" value={service} onChange={setService} min={1} max={10000} step="50" />
            </Card>

            <Card title="Stochastic benchmark (M/M/1)">
              <Num label="Arrival rate λ" unit="veh/h" value={mmLambda} onChange={setMmLambda} min={1} max={10000} step="10" />
              <Num label="Service rate μ" unit="veh/h" value={mmMu} onChange={setMmMu} min={1} max={10000} step="10" />
              <p className="text-[10px] text-faint sm:col-span-2 lg:col-span-3">
                Same rates as the deterministic sheet if you keep the values aligned — the comparison is the point.
              </p>
            </Card>
          </div>

          {/* ── results ── */}
          <div className="space-y-5">
            {dd1 ? (
              <>
                <ResultCard title="Deterministic queue (D/D/1)">
                  <Row label="Longest queue" value={`${f3(dd1.maxQueue)} veh`} sub={`at t = ${f2(dd1.maxQueueMinute)} min`} alert={dd1.maxQueue > 0} />
                  <Row label="Dissipation" value={dd1.dissipation !== null ? `t = ${f2(dd1.dissipation)} min` : 'never clears in the study'} sub={dd1.dissipation !== null ? 'cumulative curves re-cross' : 'extend the study or raise μ'} alert={dd1.dissipation === null && dd1.maxQueue > 0} />
                  <Row label="Total delay" value={`${f3(dd1.totalDelay)} veh·min`} sub="area between arrival and departure curves" />
                  <Row label="Average delay" value={`${f3(dd1.avgDelay)} min/veh`} sub={`${f3(dd1.vehiclesDelayed)} vehicles delayed`} />
                </ResultCard>

                <DrawingCard title="Cumulative arrival–departure curves" meta="queue = vertical gap · delay = area between the curves">
                  <DrawingFrame label="Cumulative arrival and departure curves">
                    <QueuePlot res={dd1} />
                  </DrawingFrame>
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-[10px] text-faint">
                    <span className="flex items-center gap-1.5"><span className="inline-block h-[3px] w-5 rounded" style={{ background: BRAND }} />arrivals (cumulative)</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block h-[3px] w-5 rounded" style={{ background: INK }} />departures (cumulative)</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-4 rounded" style={{ background: 'rgba(220,38,38,0.15)' }} />queue standing</span>
                  </div>
                </DrawingCard>

                <ResultCard title="Stochastic benchmark (M/M/1)">
                  {mm1 ? (mm1.stable ? (
                    <>
                      <Row label="Utilisation ρ" value={f3(mm1.rho)} sub="λ/μ — stable" />
                      <Row label="Mean queue Lq" value={`${f3(mm1.Lq)} veh`} sub={`mean in system L = ${f3(mm1.L)} veh`} />
                      <Row label="Mean wait Wq" value={`${f3(mm1.Wq)} min`} sub={`mean in system W = ${f3(mm1.W)} min`} />
                    </>
                  ) : (
                    <Row label="Unstable" value="ρ ≥ 1" sub="Poisson demand at or beyond capacity — no stationary solution" alert />
                  )) : <p className="text-sm text-muted">Switch λ and μ above to positive values.</p>}
                </ResultCard>
              </>
            ) : (
              <ResultCard title="Check the periods">
                <p className="text-sm text-fail">
                  Arrival rates cannot be negative, service must be positive, and every period needs
                  a whole number of minutes.
                </p>
              </ResultCard>
            )}
          </div>
        </div>

        {dd1 && (
          <div className="mt-6">
            <WorkedSolution steps={steps} title="Traffic Queues — step-by-step" />
          </div>
        )}
      </div>
    </div>
  )
}

// ── cumulative curves ─────────────────────────────────────────────────────

function QueuePlot({ res }: { res: DD1Result }) {
  const W = 760
  const H = 340
  const padL = 58
  const padR = 20
  const padT = 22
  const padB = 38

  const n = res.cumArrivals.length
  const tMax = n
  const vMax = Math.max(res.cumArrivals[n - 1], res.cumDepartures[n - 1]) * 1.08

  const x = (t: number) => padL + (t / tMax) * (W - padL - padR)
  const y = (v: number) => padT + (1 - v / vMax) * (H - padT - padB)

  const arrPts = res.cumArrivals.map((v, t) => `${x(t + 1)},${y(v)}`).join(' ')
  const depPts = res.cumDepartures.map((v, t) => `${x(t + 1)},${y(v)}`).join(' ')

  // queue polygon: arrivals forward, then departures back along the same axis
  const depRev = res.cumDepartures
    .map((v, t) => `${x(t + 1)},${y(v)}`)
    .reverse()
  const band = n > 0
    ? `${res.cumArrivals.map((v, t) => `${x(t + 1)},${y(v)}`).join(' ')} ${depRev.join(' ')}`
    : ''

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Cumulative arrival departure curves">
      {/* gridlines */}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={padL} x2={W - padR} y1={y(vMax * f)} y2={y(vMax * f)} stroke={HAIR} />
          <text x={padL - 6} y={y(vMax * f) + 3.5} textAnchor="end" fontSize="9.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">{f2(vMax * f)}</text>
        </g>
      ))}

      {/* queue band */}
      {band && <polygon points={band} fill="rgba(220,38,38,0.13)" />}

      {/* curves */}
      <polyline points={arrPts} fill="none" stroke={BRAND} strokeWidth="2.2" />
      <polyline points={depPts} fill="none" stroke={INK} strokeWidth="2.2" />

      {/* peak queue annotation */}
      <g>
        <line x1={x(res.maxQueueMinute)} x2={x(res.maxQueueMinute)} y1={y(res.cumArrivals[res.maxQueueMinute - 1] ?? 0)} y2={y(res.cumDepartures[res.maxQueueMinute - 1] ?? 0)} stroke={FAIL} strokeWidth="1.4" strokeDasharray="3 2" />
        <text x={x(res.maxQueueMinute) + 6} y={Math.min(y(res.cumArrivals[res.maxQueueMinute - 1] ?? 0), y(res.cumDepartures[res.maxQueueMinute - 1] ?? 0)) + 14} fontSize="10" fill={FAIL} fontFamily="var(--font-mono, monospace)">
          Qmax = {f2(res.maxQueue)} veh
        </text>
      </g>

      {/* axes labels */}
      <text x={W - padR} y={H - padB + 16} textAnchor="end" fontSize="10" fill={MUTED}>t (min)</text>
      <text x={padL} y={padT - 8} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">vehicles (cumulative)</text>
      {[0, Math.round(tMax / 4), Math.round(tMax / 2), Math.round((3 * tMax) / 4), tMax].map((t) => (
        <text key={t} x={x(t)} y={H - padB + 16} textAnchor="middle" fontSize="9.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">{t}</text>
      ))}
    </svg>
  )
}
