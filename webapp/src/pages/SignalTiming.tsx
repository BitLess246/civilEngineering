import { useState } from 'react'
// Every page that renders worked-solution math carries its own KaTeX stylesheet
// — it stays out of the pages that never show an equation.
import 'katex/dist/katex.min.css'
import { websterTiming, losByDelay, type WebsterResult, type PhaseInput } from '../engine/websterSignal'
import { Card, Num, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, BRAND, MUTED, f2, f3 } from '../lib/influenceStyle'

// Signal Timing — Webster's optimal cycle for a fixed-time signal: flow
// ratios, cycle length, green splits, degrees of saturation, and the HCM
// delay with its LOS letter (engine/websterSignal.ts).

interface PhaseUI {
  name: string
  q: string
  s: string
  lost: string
}

const SAMPLE: PhaseUI[] = [
  { name: 'NS through', q: '800', s: '3200', lost: '4' },
  { name: 'EW through', q: '400', s: '3200', lost: '4' },
]

export default function SignalTiming() {
  const [phases, setPhases] = useState<PhaseUI[]>(SAMPLE)
  const [useOverride, setUseOverride] = useState(false)
  const [cycle, setCycle] = useState(60)

  const setPhase = (i: number, patch: Partial<PhaseUI>) =>
    setPhases((ps) => ps.map((p, k) => (k === i ? { ...p, ...patch } : p)))
  const addPhase = () => setPhases((ps) => [...ps, { name: `Phase ${ps.length + 1}`, q: '', s: '3200', lost: '4' }])
  const delPhase = (i: number) => setPhases((ps) => ps.filter((_, k) => k !== i))
  const loadSample = () => setPhases(SAMPLE.map((p) => ({ ...p })))

  const parsed: PhaseInput[] = phases.map((p, i) => ({
    name: p.name || `Phase ${i + 1}`,
    q: parseFloat(p.q) || 0,
    s: parseFloat(p.s) || 0,
    lost: parseFloat(p.lost) || 0,
  }))
  const res: WebsterResult | null = (() => {
    try { return websterTiming({ phases: parsed, cycleOverride: useOverride ? cycle : undefined }) } catch { return null }
  })()

  const steps: SolutionStep[] = res ? [
    {
      title: 'Critical flow ratios',
      lines: [
        ...res.phases.map((p) => ({
          item: `${p.name}: y = q/s = ${f3(p.q)}/${f3(p.s)} = ${f3(p.y)} · lost ${f2(p.lost)} s`,
        })),
        { tex: `Y = \\sum y_i = ${f3(res.Y)} < 1,\\qquad L = \\sum l_i = ${f2(res.L)}\\text{ s}` },
        { text: 'Y below 1 is the existence condition for any fixed-time cycle; each phase here uses its CRITICAL movement (the busiest approach it serves).' },
      ],
    },
    {
      title: "Webster's optimal cycle",
      lines: [
        { tex: `C_0 = \\frac{1.5L + 5}{1 - Y} = \\frac{1.5\\times ${f2(res.L)} + 5}{1 - ${f3(res.Y)}} = ${f3(res.C0)}\\text{ s}` },
        ...(useOverride ? [{ text: `The page uses your override C = ${f2(cycle)} s instead of C₀ — the splits scale with it, but Webster's delay math is calibrated near C₀.` }] : []),
      ],
    },
    {
      title: 'Effective greens and saturation degrees',
      lines: [
        { tex: `g_i = \\frac{y_i}{Y}\\,(C - L)` },
        ...res.phases.map((p) => ({
          item: `${p.name}: g = ${f3(p.g)} s (λ = ${f3(p.lambda)}) · X = ${f3(p.x)}${p.x >= 1 ? ' — OVERSATURATED' : ''}`,
        })),
        { text: 'Greens are shared out in proportion to the flow ratios, after the lost time is taken off the cycle.' },
      ],
    },
    {
      title: 'Delay and level of service',
      lines: [
        { tex: `d = \\frac{C(1-\\lambda)^2}{2(1-\\lambda X)} + \\frac{X^2}{2q(1-X)} - 0.65\\left(\\frac{C}{q^2}\\right)^{1/3}X^{2+5\\lambda}` },
        { text: 'Webster\u2019s uniform + overflow + empirical terms, per phase; the intersection delay is the flow-weighted average.' },
        { tex: `d_{\\text{avg}} = ${f3(res.avgDelay)}\\text{ s/veh} \\;\\Rightarrow\\; \\text{LOS } ${res.los}` },
        { text: 'HCM signalized bands: A ≤ 10 · B ≤ 20 · C ≤ 35 · D ≤ 55 · E ≤ 80 s/veh; F beyond, or whenever a phase sits at X ≥ 1.' },
      ],
    },
  ] : []

  return (
    <div>
      <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
        <ReportControls title="Signal Timing Report" badges={['Webster cycle · HCM LOS']} />
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Webster's method end to end: critical flow ratios, the optimal cycle, effective greens,
          saturation degrees, and the HCM delay letter — the pre-timed signal the exam and the
          intersection design course both ask for.
        </p>

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          {/* ── inputs ── */}
          <div className="space-y-5">
            <Card title="Phases" hint="q = critical arrival flow · s = saturation flow">
              <div className="sm:col-span-2 lg:col-span-3">
                <button type="button" onClick={loadSample}
                  className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                  Load the sample — two phases, 800/400 of 3200
                </button>
              </div>
              <div className="sm:col-span-2 lg:col-span-3 space-y-1.5">
                {phases.map((p, i) => (
                  <div key={i} className="grid grid-cols-[1fr_2.8rem_2.8rem_2.8rem_1.4rem] items-end gap-1.5">
                    <label className="flex flex-col text-sm">
                      <span className="mb-1 text-[11.5px] font-semibold text-muted">Phase {i + 1}</span>
                      <input value={p.name} onChange={(e) => setPhase(i, { name: e.target.value })} className="text-[13px]" />
                    </label>
                    <Num label="q" unit="veh/h" value={parseFloat(p.q) || 0} onChange={(v) => setPhase(i, { q: String(v) })} step="50" />
                    <Num label="s" unit="veh/h" value={parseFloat(p.s) || 0} onChange={(v) => setPhase(i, { s: String(v) })} step="100" />
                    <Num label="Lost" unit="s" value={parseFloat(p.lost) || 0} onChange={(v) => setPhase(i, { lost: String(v) })} step="1" />
                    <button type="button" onClick={() => delPhase(i)} disabled={phases.length <= 1}
                      className="mb-1.5 text-muted hover:text-fail disabled:opacity-30">✕</button>
                  </div>
                ))}
                <button type="button" onClick={addPhase}
                  className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">+ Add phase</button>
              </div>
            </Card>

            <Card title="Cycle length">
              <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-3">
                <input type="checkbox" checked={useOverride} onChange={(e) => setUseOverride(e.target.checked)} className="accent-brand" />
                <span className="text-[12.5px] font-semibold text-muted">Override C₀ with a fixed cycle</span>
              </label>
              {useOverride && (
                <Num label="Cycle C" unit="s" value={cycle} onChange={setCycle} min={10} max={180} step="5" />
              )}
              <p className="text-[10px] text-faint sm:col-span-2 lg:col-span-3">
                Agencies round the cycle to a workable value (30–120 s). The splits recompute against whatever cycle is used.
              </p>
            </Card>
          </div>

          {/* ── results ── */}
          <div className="space-y-5">
            {res ? (
              <>
                <ResultCard title="Timing sheet">
                  <Row label="Σy (critical)" value={f3(res.Y)} sub={res.Y < 0.85 ? 'comfortable capacity' : res.Y < 0.95 ? 'approaching the practical limit' : 'at the edge — check the geometry'} />
                  <Row label={useOverride ? 'Cycle used' : "Webster's optimal C₀"} value={`${f3(res.C)} s`} sub={`total lost time L = ${f2(res.L)} s · effective green ${f3(res.C - res.L)} s`} />
                  <Row label="Average delay" value={`${f3(res.avgDelay)} s/veh`} sub="flow-weighted across phases" />
                  <Row label="Intersection LOS" value={res.los} sub={losByDelay(res.avgDelay) === 'F' || res.los === 'F' ? 'oversaturated' : 'HCM signalized bands'} alert={res.los === 'F'} />
                </ResultCard>

                <DrawingCard title="Cycle diagram" meta="effective green by phase · lost time stripped first">
                  <DrawingFrame label="Signal cycle diagram">
                    <CycleDiagram res={res} />
                  </DrawingFrame>
                </DrawingCard>

                <ResultCard title="Phase table">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-muted">
                        <tr className="text-left">
                          <th className="py-1 pr-2 font-semibold">Phase</th>
                          <th className="pr-2 text-right font-semibold">q (veh/h)</th>
                          <th className="pr-2 text-right font-semibold">s (veh/h)</th>
                          <th className="pr-2 text-right font-semibold">y = q/s</th>
                          <th className="pr-2 text-right font-semibold">g (s)</th>
                          <th className="pr-2 text-right font-semibold">X</th>
                          <th className="pr-2 text-right font-semibold">Delay</th>
                          <th className="text-right font-semibold">LOS</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono">
                        {res.phases.map((p, k) => (
                          <tr key={k} className="border-t border-hairline-2">
                            <td className="py-1 pr-2 font-semibold">{p.name}</td>
                            <td className="pr-2 text-right">{f2(p.q)}</td>
                            <td className="pr-2 text-right">{f2(p.s)}</td>
                            <td className="pr-2 text-right">{f3(p.y)}</td>
                            <td className="pr-2 text-right font-semibold">{f3(p.g)}</td>
                            <td className={`pr-2 text-right ${p.x >= 1 ? 'font-bold text-fail' : ''}`}>{f3(p.x)}</td>
                            <td className="pr-2 text-right">{Number.isNaN(p.delay) ? '—' : f3(p.delay)}</td>
                            <td className={`text-right font-bold ${p.los === 'F' ? 'text-fail' : 'text-brand'}`}>{p.los}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ResultCard>
              </>
            ) : (
              <ResultCard title="No fixed-time cycle exists for these flows">
                <p className="text-sm text-fail">
                  Either Σ(q/s) has reached 1 — the intersection needs phasing changes, better
                  geometry, or actuated control — or a phase has non-positive q or s.
                </p>
              </ResultCard>
            )}
          </div>
        </div>

        {res && (
          <div className="mt-6">
            <WorkedSolution steps={steps} title="Webster Signal Timing — step-by-step" />
          </div>
        )}
      </div>
    </div>
  )
}

// ── cycle diagram ─────────────────────────────────────────────────────────

function CycleDiagram({ res }: { res: WebsterResult }) {
  const W = 760
  const H = 168
  const padL = 24
  const padR = 24
  const y0 = 42
  const barH = 34

  const x0 = padL
  const width = W - padL - padR
  const px = (s: number) => x0 + (s / res.C) * width

  // Blocks: lost time (amber) then effective green (brand) for each phase.
  const blocks: { a: number; b: number; g: boolean }[] = []
  let acc = 0
  for (const p of res.phases) {
    blocks.push({ a: acc, b: acc + p.lost, g: false })
    acc += p.lost
    blocks.push({ a: acc, b: acc + p.g, g: true })
    acc += p.g
  }

  // Label positions: green label centred on the green block, 'lost' on the lost one.
  const labels: { lx: number; gx: number; name: string; g: number }[] = []
  let acc2 = 0
  for (const p of res.phases) {
    labels.push({ lx: acc2 + p.lost / 2, gx: acc2 + p.lost + p.g / 2, name: p.name, g: p.g })
    acc2 += p.lost + p.g
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Signal cycle diagram">
      {/* timeline */}
      <line x1={x0} x2={x0 + width} y1={y0 + barH + 22} y2={y0 + barH + 22} stroke={INK} strokeWidth="1.2" />
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={px(f * res.C)} x2={px(f * res.C)} y1={y0 + barH + 19} y2={y0 + barH + 25} stroke={INK} />
          <text x={px(f * res.C)} y={y0 + barH + 38} textAnchor="middle" fontSize="9.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">{f2(f * res.C)} s</text>
        </g>
      ))}

      {/* phase blocks: lost (amber) + effective green (brand) */}
      {blocks.map((b, i) => (
        <g key={i}>
          <rect x={px(b.a)} y={y0} width={Math.max(px(b.b) - px(b.a), 0.5)} height={barH}
            fill={b.g ? 'rgba(15,76,146,0.82)' : 'rgba(232,179,75,0.55)'}
            stroke={INK} strokeWidth="0.8" />
          {b.g && (px(b.b) - px(b.a)) > 34 && (
            <text x={(px(b.a) + px(b.b)) / 2} y={y0 + barH / 2 + 3.5} textAnchor="middle" fontSize="9.5" fill="#ffffff" fontFamily="var(--font-mono, monospace)">
              {f2(b.b - b.a)} s
            </text>
          )}
        </g>
      ))}

      {/* phase labels below the blocks */}
      {labels.map((l, i) => (
        <g key={i}>
          <text x={px(l.gx)} y={y0 + barH + 10} textAnchor="middle" fontSize="9" fill={BRAND}>{l.name} · g={f2(l.g)}</text>
          <text x={px(l.lx)} y={y0 - 6} textAnchor="middle" fontSize="8.5" fill={MUTED}>lost</text>
        </g>
      ))}

      {/* cycle brace */}
      <text x={x0 + width} y={y0 - 6} textAnchor="end" fontSize="10" fill={INK} fontFamily="var(--font-mono, monospace)">
        C = {f2(res.C)} s · L = {f2(res.L)} s{Math.abs(res.C - res.C0) > 0.01 ? ` (C₀ = ${f2(res.C0)})` : ''}
      </text>
    </svg>
  )
}
