import { useState } from 'react'
import 'katex/dist/katex.min.css'
import { designSewer, STD_DN, type RunRow, type SewerResult } from '../engine/stormSewer'
import { Card, Num, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, MUTED, BRAND, f2, f3 } from '../lib/influenceStyle'

// Storm Sewer — a linear network sized by the Rational Method and Manning
// full-flow capacity: per-run Q, standard diameter, part-full velocity,
// travel time fed downstream into the tc chain, and warnings.

interface UiRun {
  name: string
  L: number
  slopePct: number
  n: number
  areaHa: number
  C: number
  tcMin: number
}

const SAMPLE: UiRun[] = [
  { name: 'Line 1', L: 200, slopePct: 0.5, n: 0.013, areaHa: 2.0, C: 0.60, tcMin: 15 },
  { name: 'Line 2', L: 250, slopePct: 0.5, n: 0.013, areaHa: 3.0, C: 0.50, tcMin: 20 },
  { name: 'Outfall line', L: 180, slopePct: 0.4, n: 0.013, areaHa: 1.5, C: 0.75, tcMin: 25 },
]

const NO_SPIN = "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"

export default function StormSewer() {
  const [runs, setRuns] = useState<UiRun[]>(SAMPLE)
  const [a, setA] = useState(800)
  const [b, setB] = useState(10)
  const [c, setC] = useState(0.75)
  const [Vmin, setVmin] = useState(0.75)
  const [Vwarn, setVwarn] = useState(3)

  const rows: RunRow[] = runs.map((r, i) => ({
    name: r.name, upstream: i - 1, L: r.L, slopePct: r.slopePct, n: r.n,
    inlet: { name: `Inlet ${i + 1}`, areaHa: r.areaHa, C: r.C, tcMin: r.tcMin },
  }))

  let res: SewerResult | null = null
  let err: string | null = null
  try { res = designSewer(rows, { a, b, c }, { Vmin, Vwarn }) }
  catch (e) { err = e instanceof Error ? e.message : 'Check the inputs' }

  const setRun = (i: number, patch: Partial<UiRun>) =>
    setRuns((rs) => rs.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const steps: SolutionStep[] = res ? [
    {
      title: 'Intensity at the point of concentration',
      lines: [
        { tex: `i(t_c) = \\frac{${f2(a)}}{(t_c + ${f2(b)})^{${f3(c)}}} \\;\\; \\text{mm/h}` },
        { tex: `${res.runs[0].name}:\\; i = \\frac{${f2(a)}}{(${f2(res.runs[0].tcHead)} + ${f2(b)})^{${f3(c)}}} = ${f2(res.runs[0].iDesign)}\\ \\text{mm/h}` },
        ...res.runs.slice(1).map((r) => ({ item: `${r.name}: tc = ${f2(r.tcHead)} min → i = ${f2(a)}/(${f2(r.tcHead)} + ${f2(b)})^${f3(c)} = ${f2(r.iDesign)} mm/h` })),
        { text: `tc at each run's head is the later of its own inlet time and the upstream arrival (upstream tc + travel time L/V) — intensity falls as the network accumulates, which is why Line 2 is not sized at Inlet 2's minute.` },
      ],
    },
    {
      title: 'Rational accumulation at each head',
      lines: [
        { tex: 'Q = C_{comp}\\cdot i(t_c)\\cdot \\Sigma A / 360 \\qquad C_{comp} = \\frac{\\Sigma(C\\cdot A)}{\\Sigma A}' },
        ...res.runs.map((r) => ({ tex: `${r.name}:\\; Q = \\frac{${f2(r.Ccomp)}\\times ${f2(r.iDesign)}\\times ${f2(r.areaHa)}}{360} = ${f3(r.Qdesign)}\\ \\text{m}^3/\\text{s}` })),
        { text: `Q in m³/s with i in mm/h and A in hectares — the 1/360 unit chain on ${res.runs[0].name}: ${f2(res.runs[0].Ccomp)} × ${f2(res.runs[0].iDesign)} × ${f2(res.runs[0].areaHa)}/360 = ${f3(res.runs[0].Qdesign)} m³/s.` },
      ],
    },
    {
      title: 'Manning sizing and self-cleansing',
      lines: [
        { tex: 'Q_f = \\frac{1}{n}\\cdot\\frac{\\pi D^2}{4}\\cdot\\left(\\frac{D}{4}\\right)^{2/3}\\sqrt{S}' },
        ...res.runs.map((r, i) => ({ tex: `${r.name}~\\text{(DN ${r.dn})}:\\; Q_f = \\frac{1}{${f3(runs[i]?.n ?? 0)}}\\cdot\\frac{\\pi\\times ${f3(r.dn / 1000)}^2}{4}\\cdot\\left(\\frac{${f3(r.dn / 1000)}}{4}\\right)^{2/3}\\sqrt{${f3(r.slopePct / 100)}} = ${f3(r.Qfull)}\\ \\text{m}^3\\text{/s} \\ge Q = ${f3(r.Qdesign)},\\; V_{part} = ${f2(r.Vpart)}\\text{ m/s}` })),
        { text: `The smallest commercial size whose full-flow capacity covers Q and whose PART-FULL (normal-depth) velocity keeps ≥ ${f2(Vmin)} m/s for self-cleansing. Part-full velocity falls as the pipe grows at fixed Q and grade, so when no size clears the floor the picker holds the smallest sufficient DN and flags the run — steepen the grade, do not upsize. Travel time uses the full-flow velocity — the standard simplification. Erosion checks at ${f2(Vwarn)} m/s.` },
      ],
    },
    ...res.runs.flatMap((r) => r.warnings.map((w) => ({ title: `${r.name} — check`, lines: [{ text: w }] }))),
  ] : []

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
      <ReportControls title="Storm Sewer Report" badges={[res ? `${res.runs.length} runs` : 'Rational · Manning']} />
      <p className="mt-2 max-w-3xl text-sm text-muted">
        A linear storm-sewer ladder sized the classic way: Rational Method flows with
        travel-time accumulation, Manning full-flow capacity against the commercial
        diameter ladder, part-full velocity for self-cleansing, and the tc chain
        carried downstream from inlet to outfall.
      </p>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,500px)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="IDF & velocity policy">
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="button"
                onClick={() => { setRuns(SAMPLE.map((r) => ({ ...r }))); setA(800); setB(10); setC(0.75); setVmin(0.75); setVwarn(3) }}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                Load the sample — 3 runs · i = 800/(tc+10)^0.75
              </button>
            </div>
            <Num label="IDF coefficient a" unit="—" value={a} onChange={setA} min={10} step="10" />
            <Num label="IDF coefficient b" unit="min" value={b} onChange={setB} min={0} step="1" />
            <Num label="IDF exponent c" unit="—" value={c} onChange={setC} min={0.2} max={1.2} step="0.05" />
            <Num label="Self-cleansing velocity" unit="m/s" value={Vmin} onChange={setVmin} min={0.3} max={1.5} step="0.05" />
            <Num label="Erosion check velocity" unit="m/s" value={Vwarn} onChange={setVwarn} min={1.5} max={6} step="0.5" />
          </Card>

          <Card title="Runs (head-first — each line feeds the next)">
            <div className="grid grid-cols-[minmax(0,1fr)_58px_54px_62px_56px_54px_60px_28px] gap-2 sm:col-span-2 lg:col-span-3">
              {['Run', 'L (m)', 'S (%)', 'n', 'A (ha)', 'C', 'tc (min)', ''].map((h, i) => (
                <span key={i} className="text-[10.5px] font-semibold text-muted">{h}</span>
              ))}
            </div>
            {runs.map((r, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_58px_54px_62px_56px_54px_60px_28px] items-center gap-2 sm:col-span-2 lg:col-span-3">
                <input value={r.name} onChange={(e) => setRun(i, { name: e.target.value })}
                  className="w-full rounded-md border border-field-line bg-surface px-2 py-1.5 text-sm" aria-label={`Run ${i + 1} name`} />
                <input type="number" value={r.L} min={5} step={10} onChange={(e) => setRun(i, { L: Number(e.target.value) })}
                  className={`w-full rounded-md border border-field-line bg-surface px-1.5 py-1.5 text-sm ${NO_SPIN}`} aria-label={`Run ${i + 1} length`} />
                <input type="number" value={r.slopePct} min={0.05} step={0.1} onChange={(e) => setRun(i, { slopePct: Number(e.target.value) })}
                  className={`w-full rounded-md border border-field-line bg-surface px-1.5 py-1.5 text-sm ${NO_SPIN}`} aria-label={`Run ${i + 1} slope`} />
                <input type="number" value={r.n} min={0.008} step={0.001} onChange={(e) => setRun(i, { n: Number(e.target.value) })}
                  className={`w-full rounded-md border border-field-line bg-surface px-1.5 py-1.5 text-sm ${NO_SPIN}`} aria-label={`Run ${i + 1} n`} />
                <input type="number" value={r.areaHa} min={0.1} step={0.5} onChange={(e) => setRun(i, { areaHa: Number(e.target.value) })}
                  className={`w-full rounded-md border border-field-line bg-surface px-1.5 py-1.5 text-sm ${NO_SPIN}`} aria-label={`Run ${i + 1} area`} />
                <input type="number" value={r.C} min={0.05} max={1} step={0.05} onChange={(e) => setRun(i, { C: Number(e.target.value) })}
                  className={`w-full rounded-md border border-field-line bg-surface px-1.5 py-1.5 text-sm ${NO_SPIN}`} aria-label={`Run ${i + 1} C`} />
                <input type="number" value={r.tcMin} min={1} step={1} onChange={(e) => setRun(i, { tcMin: Number(e.target.value) })}
                  className={`w-full rounded-md border border-field-line bg-surface px-1.5 py-1.5 text-sm ${NO_SPIN}`} aria-label={`Run ${i + 1} inlet time`} />
                <button type="button" aria-label={`Remove run ${i + 1}`}
                  onClick={() => setRuns((rs) => rs.filter((_, j) => j !== i))}
                  className="rounded-md border border-field-line px-1 py-1 text-xs text-muted hover:text-fail">✕</button>
              </div>
            ))}
            <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
              <button type="button"
                onClick={() => setRuns((rs) => [...rs, { name: `Line ${rs.length + 1}`, L: 150, slopePct: 0.5, n: 0.013, areaHa: 1, C: 0.6, tcMin: 20 }])}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                + Add run
              </button>
              <span className="self-center text-xs text-muted">each run connects upstream = the row above</span>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          {res ? (
            <>
              {res.runs.map((r, i) => (
                <ResultCard key={i} title={`${r.name} — DN ${r.dn}`}>
                  <Row label={`Design flow Q`} value={`${f3(r.Qdesign)} m³/s`}
                    sub={`i = ${f2(r.iDesign)} mm/h at tc = ${f2(r.tcHead)} min · Ccomp ${f2(r.Ccomp)} · ${f2(r.areaHa)} ha`} />
                  <Row label={`Capacity of DN ${r.dn}`} value={`${f3(r.Qfull)} m³/s`}
                    sub={`V full ${f2(r.Vfull)} m/s · V part-full ${f2(r.Vpart)} m/s${r.meetsVelocity ? '' : ' — below cleansing floor'} · utilization ${Math.round(r.utilization * 100)} %`} />
                  <Row label="Travel time" value={`${f2(r.travelMin)} min`}
                    sub={r.upstreamNames.length > 0 ? `receives ${r.upstreamNames.join(', ')}` : 'head of the network'} alert={r.warnings.length > 0} />
                  {r.warnings.map((w, j) => (
                    <p key={j} className="text-xs text-fail">{w}</p>
                  ))}
                </ResultCard>
              ))}

              <DrawingCard title="Longitudinal profile" meta="invert grades and pipe sizes down the ladder">
                <DrawingFrame label="Storm sewer profile">
                  <Profile res={res} />
                </DrawingFrame>
              </DrawingCard>

              <WorkedSolution steps={steps} title="Storm sewer — step by step" />
            </>
          ) : (
            <ResultCard title="Check the inputs">
              <p className="text-sm text-fail">{err}</p>
            </ResultCard>
          )}
        </div>
      </div>
    </div>
  )
}

function Profile({ res }: { res: SewerResult }) {
  const W = 680, Hh = 280
  const x0 = 56, x1 = W - 44
  const topY = 40, baseY = Hh - 46
  const runs = res.runs
  const dnMin = 300, dnMax = 3000
  const hOf = (dn: number) => 8 + (Math.log(dn / dnMin) / Math.log(dnMax / dnMin)) * 26
  const w = (x1 - x0) / runs.length
  const segs = runs.map((r, i) => ({ x0: x0 + i * w, x1: x0 + (i + 1) * w, r, i }))
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full" role="img" aria-label="Storm sewer longitudinal profile">
      {/* grade line */}
      {segs.map(({ x0: sx, x1: ex, r }) => {
        const yTop = topY + (r.slopePct > 0.6 ? 6 : 18) - Math.min(12, r.slopePct * 10)
        const yBot = yTop + 12
        return (
          <g key={r.name}>
            <rect x={sx + 8} y={yTop} width={ex - sx - 16} height={hOf(r.dn)} fill="rgba(15,76,146,0.14)" stroke={INK} strokeWidth="1.3" />
            <line x1={sx} y1={yBot + 30} x2={ex} y2={yBot + 30 + Math.min(14, r.slopePct * 14)} stroke={MUTED} strokeWidth="1" strokeDasharray="4 3" />
            <text x={(sx + ex) / 2} y={yTop - 7} textAnchor="middle" fontSize="10.5" fill={INK} fontFamily="var(--font-mono, monospace)">
              DN {r.dn}
            </text>
            <text x={(sx + ex) / 2} y={yBot + 62} textAnchor="middle" fontSize="9.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">
              Q {f3(r.Qdesign)} · V {f2(r.Vfull)}
            </text>
            <text x={(sx + ex) / 2} y={yBot + 75} textAnchor="middle" fontSize="9.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">
              {r.name}
            </text>
          </g>
        )
      })}
      {/* flow direction */}
      <line x1={x0 + 4} y1={baseY + 8} x2={x1 - 4} y2={baseY + 8} stroke={BRAND} strokeWidth="1.4" />
      <polygon points={`${x1 - 4},${baseY + 8} ${x1 - 16},${baseY + 4} ${x1 - 16},${baseY + 12}`} fill={BRAND} />
      <text x={x1} y={baseY + 26} textAnchor="end" fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
        to outfall · pipe sizes DN {STD_DN[0]}–{STD_DN[STD_DN.length - 1]}
      </text>
    </svg>
  )
}
