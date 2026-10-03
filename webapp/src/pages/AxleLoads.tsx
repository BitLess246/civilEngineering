import { useState } from 'react'
import 'katex/dist/katex.min.css'
import { esalFromAxles, TYPICAL_AXLES, AXLES_IN, type AxleRow, type AxleKind } from '../engine/axleLoads'
import { Card, Num, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, MUTED, BRAND, f2, f3 } from '../lib/influenceStyle'

// Axle Load ESALs — the generalized fourth-power law over an editable
// axle-load census: LEF per row, daily ESALs, and the design-period W18.

const SAMPLE: AxleRow[] = TYPICAL_AXLES.slice(2, 5).map((t) => ({ ...t, perDay: 120 }))

const NO_SPIN = "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"

export default function AxleLoads() {
  const [rows, setRows] = useState<AxleRow[]>(SAMPLE)
  const [exponent, setExponent] = useState(4)
  const [directional, setDirectional] = useState(0.5)
  const [laneFactor, setLaneFactor] = useState(1)
  const [growthPct, setGrowthPct] = useState(2)
  const [years, setYears] = useState(20)

  let r: ReturnType<typeof esalFromAxles> | null = null
  let err: string | null = null
  try { r = esalFromAxles({ rows, exponent, directional, laneFactor, growthPct, years }) }
  catch (e) { err = e instanceof Error ? e.message : 'Check the inputs' }

  const setRow = (i: number, patch: Partial<AxleRow>) =>
    setRows((rs) => rs.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const steps: SolutionStep[] = r ? [
    {
      title: 'The generalized fourth-power law',
      lines: [
        { tex: `\\text{LEF} = \\left(\\frac{P}{80\\ \\text{kN}}\\right)^{${f2(exponent)}}` },
        { text: 'The AASHO Road Test digested: pavement life consumed scales with roughly the fourth power of the load ratio to the standard 80 kN (18-kip) single axle. The exponent is editable — thin or heavily loaded pavements behave closer to 4.5, thick flexible sections closer to 3.5.' },
      ],
    },
    {
      title: 'Per-axle treatment of axle groups',
      lines: [
        { tex: `\\text{group} = n_{\\text{axles}}\\cdot\\left(\\frac{P_{\\text{group}}}{n_{\\text{axles}} \\cdot 80}\\right)^{4}` },
        { text: `A tandem/tridem spreads its load: a 150 kN tandem is 2 × (75/80)⁴ = ${f2(2 * (75 / 80) ** 4)} ESALs — far less than the ${f2((150 / 80) ** 4)} a lone 150 kN axle would cost, and the reason tandem bogies dominate heavy fleets.` },
      ],
    },
    {
      title: 'Daily ESALs → design W18',
      lines: [
        { tex: `W_{18} = 365 \\cdot G \\cdot \\sum_i \\text{ADT}_i \\cdot \\text{LEF}_i \\cdot D \\cdot L` },
        { text: `Directional split ${f2(directional)} · design-lane factor ${f2(laneFactor)} · growth ${f2(growthPct)} %/yr over ${years} yr (G = ${f2(r.growthFactor)}). Daily ESALs today: ${f2(r.dailyEsal)}.` },
        { tex: `W_{18} = ${f3(r.W18 / 1e6)}\\times 10^6 \\ \\text{ESALs}` },
        { text: 'Feed this W18 to /pavement (flexible SN) or /rigid-pavement (slab D) — the two design tools take it as their traffic input.' },
      ],
    },
  ] : []

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
      <ReportControls title="Axle Load ESAL Report" badges={[r ? `W18 ${(r.W18 / 1e6).toFixed(2)}M` : 'Fourth-power law']} />
      <p className="mt-2 max-w-3xl text-sm text-muted">
        Convert a weighed axle-load census into design ESALs: the fourth-power law
        prices every axle against the 80 kN standard, groups share the load across
        their axles, and the traffic side grows the result across the design period.
      </p>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="Traffic & growth">
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="button"
                onClick={() => { setRows(SAMPLE.map((x) => ({ ...x }))); setExponent(4); setDirectional(0.5); setLaneFactor(1); setGrowthPct(2); setYears(20) }}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                Load the sample — trucks at legal loads · 2 % growth
              </button>
            </div>
            <Num label="Load exponent n" unit="—" value={exponent} onChange={setExponent} min={2} max={6} step="0.1" />
            <Num label="Directional split" unit="—" value={directional} onChange={setDirectional} min={0.1} max={0.9} step="0.05" />
            <Num label="Design-lane factor" unit="—" value={laneFactor} onChange={setLaneFactor} min={0.3} max={1} step="0.05" />
            <Num label="Annual growth" unit="%" value={growthPct} onChange={setGrowthPct} min={0} max={10} step="0.5" />
            <Num label="Design period" unit="yr" value={years} onChange={setYears} min={1} max={50} step="1" />
          </Card>

          <Card title="Axle-load census (group load · veh/day)">
            {rows.map((row, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_96px_72px_58px_32px] items-center gap-2 sm:col-span-2 lg:col-span-3">
                <input
                  value={row.name}
                  onChange={(e) => setRow(i, { name: e.target.value })}
                  className="w-full rounded-md border border-field-line bg-surface px-2 py-1.5 text-sm"
                  aria-label={`Row ${i + 1} name`}
                />
                <select
                  value={row.kind}
                  onChange={(e) => setRow(i, { kind: e.target.value as AxleKind })}
                  className="w-full rounded-md border border-field-line bg-surface px-1 py-1.5 text-sm"
                  aria-label={`Row ${i + 1} axle kind`}
                >
                  {(Object.keys(AXLES_IN) as AxleKind[]).map((k) => (
                    <option key={k} value={k}>{k} ({AXLES_IN[k]})</option>
                  ))}
                </select>
                <input
                  type="number" value={row.loadK} min={1} step={5}
                  onChange={(e) => setRow(i, { loadK: Number(e.target.value) })}
                  className={`w-full rounded-md border border-field-line bg-surface px-2 py-1.5 text-sm ${NO_SPIN}`}
                  aria-label={`Row ${i + 1} load (kN)`}
                />
                <input
                  type="number" value={row.perDay} min={0} step={10}
                  onChange={(e) => setRow(i, { perDay: Number(e.target.value) })}
                  className={`w-full rounded-md border border-field-line bg-surface px-2 py-1.5 text-sm ${NO_SPIN}`}
                  aria-label={`Row ${i + 1} per day`}
                />
                <button type="button" aria-label={`Remove row ${i + 1}`}
                  onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                  className="rounded-md border border-field-line px-1 py-1 text-xs text-muted hover:text-fail">
                  ✕
                </button>
              </div>
            ))}
            <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
              <button type="button"
                onClick={() => setRows((rs) => [...rs, { name: 'New axle group', kind: 'single', loadK: 80, perDay: 50 }])}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                + Add axle row
              </button>
              <span className="self-center text-xs text-muted">group load in kN · all axles of the group together</span>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          {r ? (
            <>
              <ResultCard title="Design ESALs">
                <Row label="Daily ESALs (both directions × lane)" value={f2(r.dailyEsal)} sub={`growth factor G = ${f2(r.growthFactor)}`} />
                <Row label="Design W18" value={`${f3(r.W18 / 1e6)} × 10⁶`} sub={`${rows.length} axle rows · n = ${f2(exponent)}`} />
              </ResultCard>

              <DrawingCard title="Load–ESAL curve" meta="LEF = (P/80)⁴ — the fourth-power wall">
                <DrawingFrame label="Fourth-power curve">
                  <Curve exponent={exponent} rows={rows} />
                </DrawingFrame>
              </DrawingCard>

              <WorkedSolution steps={steps} title="Fourth-power law — step by step" />
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

function Curve({ exponent, rows }: { exponent: number; rows: AxleRow[] }) {
  const W = 640, Hh = 300
  const x0 = 64, x1 = W - 40
  const baseY = Hh - 46, topY = 30
  const Pmax = 200
  const LEFmax = Math.pow(Pmax / 80, exponent)
  const yOf = (lef: number) => baseY - Math.min(1, lef / LEFmax) * (baseY - topY)
  const xOf = (P: number) => x0 + (P / Pmax) * (x1 - x0)
  const pts: string[] = []
  for (let P = 0; P <= Pmax; P += 2) pts.push(`${xOf(P)},${yOf(Math.pow(P / 80, exponent))}`)
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full" role="img" aria-label="Fourth-power LEF curve">
      <line x1={x0} x2={x1} y1={baseY} y2={baseY} stroke={INK} strokeWidth="1.2" />
      <line x1={x0} x2={x0} y1={topY - 6} y2={baseY} stroke={INK} strokeWidth="1.2" />
      <polyline points={pts.join(' ')} fill="none" stroke={BRAND} strokeWidth="2" />
      {/* the 80 kN reference */}
      <line x1={xOf(80)} x2={xOf(80)} y1={baseY} y2={topY} stroke={MUTED} strokeWidth="1" strokeDasharray="4 3" />
      <text x={xOf(80) + 5} y={topY + 10} fontSize="10.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">80 kN standard</text>
      {/* the fleet */}
      {rows.map((row, i) => {
        const lef = AXLES_IN[row.kind] * Math.pow(row.loadK / AXLES_IN[row.kind] / 80, exponent)
        const px = xOf(row.loadK)
        // stagger the labels so neighbours never share a line
        const dy = (i % 2 === 0 ? -8 : 12) - Math.floor(i / 2) * 13
        return (
          <g key={i}>
            <circle cx={px} cy={yOf(lef)} r="4" fill={BRAND} />
            <text x={px - 8} y={yOf(lef) + dy} textAnchor="end" fontSize="9.5" fill={INK} fontFamily="var(--font-mono, monospace)">
              {row.name.length > 26 ? `${row.name.slice(0, 25)}…` : row.name}: {f2(lef)}
            </text>
          </g>
        )
      })}
      <text x={x1} y={baseY + 16} textAnchor="end" fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">group load P (kN)</text>
      <text x={x0 - 6} y={topY} textAnchor="end" fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">LEF ({f2(LEFmax)})</text>
      <text x={16} y={topY} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">LEF = (P/80)^{exponent.toFixed(1)}</text>
    </svg>
  )
}
