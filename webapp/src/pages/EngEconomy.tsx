import { useState } from 'react'
// Every page that renders worked-solution math carries its own KaTeX stylesheet
// — it stays out of the pages that never show an equation.
import 'katex/dist/katex.min.css'
import {
  pf, pa, ap, fa, arithGradientPW, geomGradientPW, effRate,
  npv, irr, payback, discountedPayback, deprSL, deprSYD, deprDB,
  breakEven, capitalizedCost,
} from '../engine/engEconomy'
import { Card, Num, Pick, ResultCard, Row } from '../components/qty'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// Engineering Economy — the board-exam money mathematics: time-value factors,
// gradients and effective rates, NPV/IRR/payback on a cash-flow series, and
// depreciation plus break-even (engine/engEconomy.ts).

const SAMPLE_CF = ['-1000', '300', '300', '300', '300', '300']

const sNum = (s: string): number => (parseFloat(s) || 0)

export default function EngEconomy() {
  const [ratePct, setRatePct] = useState(8)
  const [n, setN] = useState(5)
  const [gradG, setGradG] = useState(100)
  const [geomA1, setGeomA1] = useState(1000)
  const [geomG, setGeomG] = useState(5)
  const [nominal, setNominal] = useState(12)
  const [periods, setPeriods] = useState(12)
  const [rows, setRows] = useState<string[]>(SAMPLE_CF.map((s) => s))
  const [discRate, setDiscRate] = useState(10)
  const [depMethod, setDepMethod] = useState<'sl' | 'syd' | 'db'>('syd')
  const [depCost, setDepCost] = useState(10000)
  const [depSalv, setDepSalv] = useState(2000)
  const [depLife, setDepLife] = useState(5)
  const [depRate, setDepRate] = useState(40)
  const [beFixed, setBeFixed] = useState(50000)
  const [bePrice, setBePrice] = useState(120)
  const [beVar, setBeVar] = useState(70)
  const [capA, setCapA] = useState(5000)

  const loadSample = () => {
    setRatePct(8); setN(5); setGradG(100); setGeomA1(1000); setGeomG(5)
    setNominal(12); setPeriods(12); setRows(SAMPLE_CF.map((s) => s)); setDiscRate(10)
    setDepMethod('syd'); setDepCost(10000); setDepSalv(2000); setDepLife(5); setDepRate(40)
    setBeFixed(50000); setBePrice(120); setBeVar(70); setCapA(5000)
  }

  const i = ratePct / 100
  const cfs = rows.map(sNum)
  const npvV = cfs.length > 0 ? npv(discRate / 100, cfs) : NaN
  const irrV = cfs.length > 1 ? irr(cfs) : null
  const pbV = cfs.length > 1 ? payback(cfs) : null
  const dpbV = cfs.length > 1 ? discountedPayback(discRate / 100, cfs) : null
  const sched = depMethod === 'sl'
    ? deprSL(depCost, depSalv, depLife)
    : depMethod === 'syd'
      ? deprSYD(depCost, depSalv, depLife)
      : deprDB(depCost, depSalv, depLife, depRate / 100)
  const beV = bePrice > beVar ? breakEven(beFixed, bePrice, beVar) : NaN

  const setRow = (k: number, v: string) =>
    setRows((rs) => rs.map((r, j) => (j === k ? v : r)))
  const addRow = () => setRows((rs) => [...rs, ''])
  const delRow = (k: number) => setRows((rs) => rs.filter((_, j) => j !== k))

  const steps: SolutionStep[] = [
    {
      title: 'Single-payment and uniform-series factors',
      lines: [
        { tex: `(P/F,${f2(ratePct)}\\%,${n}) = \\frac{1}{(1+${f3(i)})^{${n}}} = ${f3(pf(i, n))}` },
        { tex: `(A/P,${f2(ratePct)}\\%,${n}) = \\frac{${f3(i)}(1+${f3(i)})^{${n}}}{(1+${f3(i)})^{${n}}-1} = ${f3(ap(i, n))}` },
        { tex: `(F/A,${f2(ratePct)}\\%,${n}) = \\frac{(1+${f3(i)})^{${n}}-1}{${f3(i)}} = ${f3(fa(i, n))}` },
        { tex: `(P/A,${f2(ratePct)}\\%,${n}) = ${f3(pa(i, n))}` },
        { text: 'Read (P/F) as "pesos today per peso in year n". Capital recovery (A/P) turns a present project cost into its equivalent uniform annual cost — the annuity the project must beat.' },
      ],
    },
    {
      title: 'Gradients and the effective rate',
      lines: [
        { tex: `(P/G,${f2(ratePct)}\\%,${n}) = ${f3(arithGradientPW(i, 1, n))} \\quad\\Rightarrow\\quad P = ${f2(gradG)}\\times${f3(arithGradientPW(i, 1, n))} = ${f2(arithGradientPW(i, gradG, n))}` },
        { tex: `P_{geom} = ${f2(geomA1)}\\frac{1-((1+${f3(geomG / 100)})/(1+${f3(i)}))^{${n}}}{${f3(i)}-${f3(geomG / 100)}} = ${f2(geomGradientPW(i, geomG / 100, geomA1, n))}` },
        { tex: `i_{eff} = (1+${f3(nominal / 100)}/${periods})^{${periods}}-1 = ${f3(effRate(nominal / 100, periods))}\\ (${f2(effRate(nominal / 100, periods) * 100)}\\%)` },
        { text: 'An arithmetic gradient starts at zero and climbs by G each year (maintenance that worsens); a geometric one grows by g percent (escalating revenue). Always compare nominal rates through the effective rate first.' },
      ],
    },
    {
      title: 'Project measures on the cash-flow series',
      lines: [
        { tex: `NPV = \\sum CF_t/(1+${f3(discRate / 100)})^t = ${f2(npvV)}` },
        { tex: `IRR:\\ NPV = 0 \\Rightarrow i^* = ${irrV === null ? '\\text{—}' : f3(irrV * 100) + '\\%'}${irrV === null ? '' : ` \\;\\text{(accept iff } ${f2(discRate)}\\% < ${f2(irrV * 100)}\\%)`}` },
        { tex: `\\text{payback} = ${pbV === null ? '\\text{—}' : f2(pbV) + '\\text{ yr}'} \\qquad \\text{discounted} = ${dpbV === null ? '\\text{—}' : f2(dpbV) + '\\text{ yr}'}` },
        { text: 'NPV > 0 accepts at the hurdle rate; IRR is the hurdle rate that would just break even. Payback ignores the time value (and everything after it pays back) — discounted payback fixes the first flaw only. A series that never changes sign has no IRR.' },
      ],
    },
    {
      title: 'Depreciation, break-even and capitalized cost',
      lines: [
        { tex: `D_1 = ${f2(sched[0]?.dep ?? NaN)} \\qquad \\sum D = ${f2(sched.reduce((s, y) => s + y.dep, 0))} = ${f2(depCost - depSalv)}` },
        { tex: `Q_{BE} = ${f2(beFixed)}/(${f2(bePrice)}-${f2(beVar)}) = ${f2(beV)}\\ \\text{units}` },
        { tex: `P_{cap} = ${f2(capA)}/${f3(i)} = ${f2(capitalizedCost(capA, i))}` },
        { text: 'Depreciation spreads (cost − salvage) over the life — straight-line evenly, SYD and declining-balance front-loaded. Break-even is where contribution margin covers fixed cost; capitalized cost prices anything maintained forever (roads, dams) as A/i.' },
      ],
    },
  ]

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
      <ReportControls title="Engineering Economy Report" badges={[irrV !== null && irrV * 100 > discRate ? `IRR ${f2(irrV * 100)} % — accept` : 'Time value of money']} />
      <p className="mt-2 max-w-3xl text-sm text-muted">
        The board-exam money mathematics: time-value factors and gradients, NPV/IRR/payback
        on a cash-flow series, and depreciation with break-even — every line worked with
        your numbers below.
      </p>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="Rate & horizon">
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="button" onClick={loadSample}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                Load the sample — 8 % · 5 yr · −1000 + 300×5
              </button>
            </div>
            <Num label="Interest rate i" unit="%/yr" value={ratePct} onChange={setRatePct} min={0} max={50} step="0.5" />
            <Num label="Periods n" unit="yr" value={n} onChange={setN} min={1} max={100} step="1" />
            <Num label="Gradient G" unit="—" value={gradG} onChange={setGradG} step="10" />
            <Num label="Geometric A1" unit="—" value={geomA1} onChange={setGeomA1} step="100" />
            <Num label="Geometric growth g" unit="%/yr" value={geomG} onChange={setGeomG} max={50} step="0.5" />
            <Num label="Nominal rate" unit="%/yr" value={nominal} onChange={setNominal} min={0} max={60} step="0.5" />
            <Num label="Compounding m" unit="/yr" value={periods} onChange={setPeriods} min={1} max={365} step="1" />
          </Card>

          <Card title="Cash flows (t = 0, 1, …)">
            {rows.map((r, k) => (
              <div key={k} className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
                <span className="w-14 shrink-0 font-mono text-xs text-muted">t = {k}</span>
                <input value={r} onChange={(e) => setRow(k, e.target.value)}
                  className="w-full rounded-md border border-field-line bg-surface px-2 py-1.5 text-sm" aria-label={`Cash flow at year ${k}`} />
                <button type="button" aria-label={`Remove year ${k}`} onClick={() => delRow(k)}
                  className="rounded-md border border-field-line px-1 py-1 text-xs text-muted hover:text-fail">✕</button>
              </div>
            ))}
            <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
              <button type="button" onClick={addRow}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                + Add year
              </button>
              <Num label="Hurdle rate" unit="%/yr" value={discRate} onChange={setDiscRate} min={0} max={50} step="0.5" />
            </div>
          </Card>

          <Card title="Depreciation & break-even">
            <Pick label="Method" value={depMethod} onChange={(v) => setDepMethod(v as typeof depMethod)}
              options={[['sl', 'Straight line'], ['syd', 'Sum of years digits'], ['db', 'Declining balance']]} />
            <Num label="Cost" unit="—" value={depCost} onChange={setDepCost} min={1} step="500" />
            <Num label="Salvage" unit="—" value={depSalv} onChange={setDepSalv} min={0} step="100" />
            <Num label="Life" unit="yr" value={depLife} onChange={setDepLife} min={1} max={50} step="1" />
            {depMethod === 'db' && (
              <Num label="DB rate" unit="%/yr" value={depRate} onChange={setDepRate} min={1} max={99} step="1" />
            )}
            <Num label="Fixed cost" unit="—" value={beFixed} onChange={setBeFixed} min={0} step="1000" />
            <Num label="Price / unit" unit="—" value={bePrice} onChange={setBePrice} min={0} step="1" />
            <Num label="Variable / unit" unit="—" value={beVar} onChange={setBeVar} min={0} step="1" />
            <Num label="Perpetual annual A" unit="—" value={capA} onChange={setCapA} min={0} step="100" />
          </Card>
        </div>

        <div className="space-y-5">
          <ResultCard title="Time-value factors">
            <Row label="(P/F,i,n)" value={f3(pf(i, n))} sub={`(F/P) ${f3(1 / pf(i, n))}`} />
            <Row label="(P/A,i,n)" value={f3(pa(i, n))} sub={`(A/P) ${f3(ap(i, n))}`} />
            <Row label="Effective rate" value={`${f3(effRate(nominal / 100, periods) * 100)} %`} sub={`nominal ${f2(nominal)} % × ${periods}`} />
          </ResultCard>

          <ResultCard title="Project verdict">
            <Row label="NPV at hurdle" value={f2(npvV)} sub={`${f2(discRate)} % on ${cfs.length} flows`} />
            <Row label="IRR" value={irrV === null ? '—' : `${f2(irrV * 100)} %`} sub={irrV === null ? 'no sign change — no IRR' : irrV * 100 > discRate ? 'above hurdle — accept' : 'below hurdle — reject'} alert={irrV !== null && irrV * 100 <= discRate} />
            <Row label="Payback" value={pbV === null ? '—' : `${f2(pbV)} yr`} sub={dpbV === null ? 'never (discounted)' : `discounted ${f2(dpbV)} yr`} />
          </ResultCard>

          <ResultCard title="Depreciation schedule">
            {sched.map((y) => (
              <Row key={y.year} label={`Year ${y.year}`} value={f2(y.dep)} sub={`book ${f2(y.book)}`} />
            ))}
            <Row label="Break-even" value={Number.isFinite(beV) ? `${f2(beV)} units` : '—'} sub={`₱${f2(beFixed)} ÷ (₱${f2(bePrice)} − ₱${f2(beVar)})`} />
            <Row label="Capitalized cost" value={f2(capitalizedCost(capA, i))} sub={`₱${f2(capA)}/yr ÷ ${f2(ratePct)} %`} />
          </ResultCard>

          <CashFlowDiagram cfs={cfs} />

          <WorkedSolution steps={steps} title="Engineering economy — step by step" />
        </div>
      </div>
    </div>
  )
}

/** Cash-flow timeline: the profile every measure above is read off. */
function CashFlowDiagram({ cfs }: { cfs: number[] }) {
  const W = 640, Hh = 200, x0 = 46, x1 = W - 20, baseY = 130
  const n = Math.max(cfs.length - 1, 1)
  const maxAbs = Math.max(1, ...cfs.map((c) => Math.abs(c)))
  const X = (t: number) => x0 + ((x1 - x0) * t) / n
  const H = (c: number) => (Math.abs(c) / maxAbs) * 88
  return (
    <div className="rounded-xl border border-hairline bg-sheet p-4 shadow-sm">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">Cash-flow diagram</p>
      <DrawingFrame label="Cash-flow timeline">
      <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full" role="img" aria-label="Cash-flow timeline">
        <title>Cash-flow timeline</title>
        <line x1={x0 - 14} y1={baseY} x2={x1} y2={baseY} stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
        {cfs.map((c, t) => {
          const up = c >= 0
          const y1 = up ? baseY - H(c) : baseY + H(c)
          return (
            <g key={t}>
              <line x1={X(t)} y1={baseY} x2={X(t)} y2={y1} stroke="currentColor" strokeWidth="1.6" />
              <circle cx={X(t)} cy={y1} r="2.4" fill="currentColor" />
              <text x={X(t)} y={Hh - 14} textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.65">t={t}</text>
              <text x={X(t)} y={up ? y1 - 7 : y1 + 14} textAnchor="middle" fontSize="10" fill="currentColor">{c}</text>
            </g>
          )
        })}
      </svg>
      </DrawingFrame>
    </div>
  )
}
