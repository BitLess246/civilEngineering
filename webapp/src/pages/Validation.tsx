import { Link } from 'react-router-dom'
import { VALIDATION_CASES, pctDiff, type ValidationCase } from '../engine/validation'

const CATS = ['RC', 'Steel', 'Analysis', 'Seismic', 'Dynamics', 'Wind', 'Geotech'] as const

function fmt(v: number): string {
  if (!Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  return a >= 100 ? v.toFixed(1) : a >= 1 ? v.toFixed(3) : v.toPrecision(3)
}

function Row({ c }: { c: ValidationCase }) {
  const d = pctDiff(c)
  const ok = d <= c.tol * 100 + 1e-9 || d < 0.01
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="py-2 pr-3">
        <p className="font-medium text-slate-800">{c.title}</p>
        <p className="text-[11px] text-slate-400">{c.reference}</p>
      </td>
      <td className="py-2 pr-3 font-mono text-[11px] text-slate-600">{c.formula}</td>
      <td className="py-2 pr-3 text-right font-mono">{fmt(c.manual)}</td>
      <td className="py-2 pr-3 text-right font-mono">{fmt(c.software)}</td>
      <td className="py-2 pr-3 text-right text-slate-500">{c.unit}</td>
      <td className="py-2 pr-3 text-right font-mono">{d < 1e-9 ? '0' : d.toFixed(4)}%</td>
      <td className={`py-2 text-right font-semibold ${ok ? 'text-emerald-600' : 'text-red-600'}`}>{ok ? '✓' : '✗'}</td>
    </tr>
  )
}

const passes = (c: ValidationCase) => pctDiff(c) <= c.tol * 100 + 1e-9 || pctDiff(c) < 0.01

export default function Validation() {
  const total = VALIDATION_CASES.length
  const passing = VALIDATION_CASES.filter(passes).length
  const allOK = passing === total
  const perCat = CATS.map((cat) => {
    const cases = VALIDATION_CASES.filter((c) => c.category === cat)
    return { cat, n: cases.length, ok: cases.filter(passes).length }
  }).filter((g) => g.n > 0)

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Reference</p>
      <h1 className="mt-1 text-2xl font-bold text-[#0056b3]">Validation</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        Each calculation engine is checked against an independent closed-form hand calculation from a
        textbook or the governing code clause. The <b>Software</b> column is produced by the same engine
        the design pages use; the <b>Manual</b> column is the analytical result. Every case below is also
        enforced by the automated test suite.
      </p>

      {/* Per-module pass-count summary */}
      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-md px-3 py-1.5 text-sm font-bold ${allOK ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            {allOK ? '✓' : '✗'} {passing}/{total} benchmarks passing
          </span>
          {perCat.map((g) => (
            <span key={g.cat} className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${g.ok === g.n ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {g.cat} {g.ok}/{g.n}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          A benchmark passes when the engine result is within tolerance of the hand calculation
          (typically &lt; 0.01 %). Counts are evaluated live from the same engines the design pages use.
        </p>
      </div>

      {CATS.map((cat) => {
        const cases = VALIDATION_CASES.filter((c) => c.category === cat)
        if (!cases.length) return null
        return (
          <section key={cat} className="mt-8">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">{cat}</h2>
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left uppercase tracking-wide text-slate-400">
                    <th className="py-1 pr-3 font-semibold">Benchmark</th>
                    <th className="py-1 pr-3 font-semibold">Formula</th>
                    <th className="py-1 pr-3 text-right font-semibold">Manual</th>
                    <th className="py-1 pr-3 text-right font-semibold">Software</th>
                    <th className="py-1 pr-3 text-right font-semibold">Unit</th>
                    <th className="py-1 pr-3 text-right font-semibold">Δ</th>
                    <th className="py-1 text-right font-semibold">OK</th>
                  </tr>
                </thead>
                <tbody>{cases.map((c) => <Row key={c.id} c={c} />)}</tbody>
              </table>
            </div>
          </section>
        )
      })}

      <p className="mt-8 text-[11px] text-slate-400">
        Codes: NSCP 2015 · ACI 318-14 · AISC 360. See the{' '}
        <Link to="/docs" className="text-[#0056b3] underline">documentation</Link> for the full toolkit guide.
      </p>
    </main>
  )
}
