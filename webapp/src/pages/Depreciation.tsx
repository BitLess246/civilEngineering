import { useState } from 'react'
import { deprSL, deprSYD, deprDB, type DepYear } from '../engine/engEconomy'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { BookValueSketch } from '../components/economySketches'
import { peso } from '../lib/money'
import { f2 } from '../lib/influenceStyle'

// Depreciation — straight-line, sum-of-years'-digits and declining-balance
// schedules of (cost − salvage) over a whole-year life (engine/engEconomy.ts).

type Method = 'sl' | 'syd' | 'db'
const METHOD: Record<Method, string> = { sl: 'Straight line', syd: "Sum of years' digits", db: 'Declining balance' }

export default function Depreciation() {
  const [method, setMethod] = useState<Method>('syd')
  const [cost, setCost] = useState(10000)
  const [salvage, setSalvage] = useState(2000)
  const [life, setLife] = useState(5)
  const [dbPct, setDbPct] = useState(40)
  const [readYear, setReadYear] = useState(3)

  const L = Math.max(1, Math.round(life))
  let sched: DepYear[] = []
  let err = ''
  try {
    sched = method === 'sl' ? deprSL(cost, salvage, L) : method === 'syd' ? deprSYD(cost, salvage, L) : deprDB(cost, salvage, L, dbPct / 100)
  } catch (e) { err = (e as Error).message }
  const ok = sched.length > 0
  const base = cost - salvage
  const total = sched.reduce((s, y) => s + y.dep, 0)
  const endBook = ok ? sched[sched.length - 1].book : NaN
  const short = ok && endBook - salvage > 0.005
  const k = Math.min(L, Math.max(1, Math.round(readYear)))
  const atK = ok ? sched[k - 1] : undefined
  const syd = (L * (L + 1)) / 2

  return (
    <WorkspacePage title="Depreciation" badges={['Engineering economy', METHOD[method]]}
      intro="Spread an asset's cost less its salvage value over its life — evenly by straight line, front-loaded by sum of years' digits or declining balance — and read the charge and book value for any year."
      inputs={<>
        <InputGroup title="Method">
          <div className="col-span-2">
            <Pick label="Schedule" value={method} onChange={(v) => setMethod(v as Method)} options={(Object.keys(METHOD) as Method[]).map((m) => [m, METHOD[m]] as [Method, string])} />
          </div>
          {method === 'db' && <Num label="Declining rate" unit="%/yr" value={dbPct} onChange={setDbPct} min={1} max={99} step="1" hint={`double declining = ${f2(200 / L)} %`} />}
        </InputGroup>
        <InputGroup title="Asset">
          <Num label="First cost C" unit="₱" value={cost} onChange={setCost} min={1} step="500" />
          <Num label="Salvage S" unit="₱" value={salvage} onChange={setSalvage} min={0} step="100" />
          <Num label="Life n" unit="yr" value={L} onChange={setLife} min={1} max={60} step="1" />
          <Num label="Read year k" unit="yr" value={k} onChange={setReadYear} min={1} max={L} step="1" />
        </InputGroup>
      </>}
      checks={ok ? <>
        <CheckCard title={`Year ${k}`} basis={METHOD[method]} status="info" value={peso(atK!.dep)} unit="charge"
          formula={method === 'sl' ? 'D = (C − S)/n' : method === 'syd' ? 'D_k = (n − k + 1)/Σ·(C − S)' : 'D_k = rate × book at start of year'}
          pairs={[{ label: `Book value end of year ${k}`, value: peso(atK!.book) }, { label: `Depreciated to year ${k}`, value: peso(cost - atK!.book) }]} />
        <CheckCard title="Depreciation recovered" basis="over the whole life" status={short ? 'warn' : 'pass'} pillLabel={short ? 'SHORT' : 'FULL'}
          value={peso(total)} formula="Σ D = C − S" ratio={base > 0 ? total / base : undefined} ratioLabel="Recovered"
          pairs={[{ label: 'Depreciable base', value: peso(base) }, { label: 'Book at end of life', value: peso(endBook) }]} />
        <CheckCard title="First-year charge" basis="the largest for SYD and DB" status="info" value={peso(sched[0].dep)}
          pairs={[{ label: 'Last-year charge', value: peso(sched[sched.length - 1].dep) }, { label: 'Straight-line equivalent', value: peso(base / L) }]} />
      </> : (
        <CheckCard title="No schedule" basis="check the asset inputs" status="warn" pillLabel="CHECK" value="—" formula={err} />
      )}
      summary={[
        { label: 'Method', value: METHOD[method] + (method === 'db' ? ` at ${f2(dbPct)} %` : '') },
        { label: 'First cost C', value: peso(cost) }, { label: 'Salvage S', value: peso(salvage) }, { label: 'Life n', value: `${L} yr` },
      ]}
      drawing={ok ? { title: 'Book value by year', node: <>
        <BookValueSketch cost={cost} salvage={salvage} book={sched.map((y) => y.book)} />
        <div className="mt-3 overflow-x-auto rounded-md border border-hairline bg-sheet">
          <table className="w-full min-w-[360px] border-collapse text-[11.5px]">
            <thead><tr className="bg-sheet-2 text-left text-[10.5px] font-bold uppercase tracking-wide text-muted">
              <th className="px-2.5 py-1.5">Year</th><th className="px-2.5 py-1.5 text-right">Charge</th><th className="px-2.5 py-1.5 text-right">Accumulated</th><th className="px-2.5 py-1.5 text-right">Book value</th>
            </tr></thead>
            <tbody>
              {sched.map((y) => (
                <tr key={y.year} className={`border-t border-hairline-2 ${y.year === k ? 'bg-brand-tint' : ''}`}>
                  <td className="px-2.5 py-1 text-ink">{y.year}</td>
                  <td className="px-2.5 py-1 text-right font-mono">{peso(y.dep)}</td>
                  <td className="px-2.5 py-1 text-right font-mono text-muted">{peso(cost - y.book)}</td>
                  <td className="px-2.5 py-1 text-right font-mono">{peso(y.book)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </> } : undefined}
      results={ok ? [
        { check: `Charge in year ${k}`, basis: METHOD[method], demand: peso(atK!.dep), status: 'info' },
        { check: `Book value, end of year ${k}`, basis: 'C − Σ D to year k', demand: peso(atK!.book), status: 'info' },
        { check: 'Total depreciation', basis: 'Σ D over the life', demand: peso(total), limit: peso(base), ratio: base > 0 ? total / base : undefined, status: short ? 'warn' : 'pass' },
      ] : [{ check: 'Schedule', basis: err, demand: '—', status: 'warn' }]}
      steps={ok ? [
        method === 'sl' ? { title: 'Straight line', lines: [
          { tex: `D = \\frac{C - S}{n} = \\frac{${f2(cost)} - ${f2(salvage)}}{${L}} = ${f2(base / L)}` },
          { tex: `BV_{${k}} = C - kD = ${f2(cost)} - ${k}\\times${f2(base / L)} = ${f2(atK!.book)}` },
          { text: 'The same charge every year; book value falls in a straight line to the salvage value.' },
        ] } : method === 'syd' ? { title: "Sum of years' digits", lines: [
          { tex: `\\Sigma = \\frac{n(n+1)}{2} = \\frac{${L}\\times${L + 1}}{2} = ${syd}` },
          { tex: `D_{${k}} = \\frac{n - k + 1}{\\Sigma}(C - S) = \\frac{${L - k + 1}}{${syd}}\\times${f2(base)} = ${f2(atK!.dep)}` },
          { tex: `BV_{${k}} = C - \\sum_{j=1}^{${k}} D_j = ${f2(atK!.book)}` },
          { text: 'The charges fall by the same step each year, n/Σ of the base in the first year down to 1/Σ in the last.' },
        ] } : { title: 'Declining balance', lines: [
          { tex: `D_k = r\\,BV_{k-1}, \\quad BV_k = C(1 - r)^k = ${f2(cost)}\\times(1 - ${f2(dbPct / 100)})^{${k}} = ${f2(cost * Math.pow(1 - dbPct / 100, k))}` },
          { tex: `D_{${k}} = ${f2(atK!.dep)} \\qquad BV_{${k}} = ${f2(atK!.book)}${atK!.book > cost * Math.pow(1 - dbPct / 100, k) + 0.005 ? '\\quad (\\text{floored at } S)' : ''}` },
          { text: short
            ? `The rate leaves ${peso(endBook - salvage)} above salvage at the end of the life. Raise the rate, or switch to straight line for the later years, to recover it.`
            : 'A charge is capped so the book value never drops below salvage; once it reaches salvage the remaining charges are zero.' },
        ] },
      ] : [{ title: 'No schedule', lines: [{ text: err }] }]}
      references={[
        { topic: 'Straight line', basis: 'D = (C − S)/n; BV_k = C − kD', source: 'Engineering economy — depreciation' },
        { topic: "Sum of years' digits", basis: 'D_k = (n − k + 1)/[n(n + 1)/2]·(C − S)', source: 'Engineering economy — depreciation' },
        { topic: 'Declining balance', basis: 'D_k = r·BV_(k−1), BV_k = C(1 − r)ᵏ, floored at salvage; double declining r = 2/n', source: 'Engineering economy — depreciation' },
      ]}
    />
  )
}
