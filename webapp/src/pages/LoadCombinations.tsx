import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { calcLoadCombinations, type LoadDemands } from '../engine/loadCombinations'
import { Num, Card } from '../components/qty'
import { ReportControls } from '../components/ReportControls'
import { f2 } from '../lib/format'

const DEFAULTS: LoadDemands = { D: 0, L: 0, Lr: 0, W: 0, E: 0 }

export default function LoadCombinations() {
  const [d, setD] = useState<LoadDemands>(DEFAULTS)
  const set = <K extends keyof LoadDemands>(k: K) => (v: number) =>
    setD(s => ({ ...s, [k]: v }))

  const allFinite = Object.values(d).every(Number.isFinite)
  const r = useMemo(
    () => (allFinite ? calcLoadCombinations(d) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(d), allFinite],
  )

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link to="/" className="no-print text-sm text-[#0056b3] hover:underline">← Home</Link>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#0056b3]">
        Load Combinations
      </h1>
      <p className="no-print mt-1 text-slate-600">
        NSCP 2015 §203.3 Strength Design (LRFD) — 13 factored combinations.
        Enter unfactored characteristic loads; the table shows every factored result
        with the governing (max/min) envelope highlighted.
      </p>
      <ReportControls title="NSCP 2015 Load Combinations" />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_2fr]">
        {/* ── INPUTS ── */}
        <Card title="Unfactored Loads">
          <Num label="D — Dead load"       value={d.D}  onChange={set('D')} />
          <Num label="L — Floor live"      value={d.L}  onChange={set('L')} />
          <Num label="Lr — Roof live"      value={d.Lr} onChange={set('Lr')} />
          <Num label="W — Wind"            value={d.W}  onChange={set('W')} />
          <Num label="E — Earthquake"      value={d.E}  onChange={set('E')} />
          <p className="mt-2 text-xs text-slate-500">
            Any consistent unit (kN, kN/m, kPa, …). W and E enter as positive magnitudes;
            the ±W/±E sign is handled by each combination.
          </p>
        </Card>

        {/* ── RESULTS TABLE ── */}
        {r ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
              <span className="text-sm font-semibold text-slate-700">Factored Load Combinations</span>
              <span className="ml-3 text-xs text-slate-500">NSCP 2015 §203.3</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                  <th className="px-3 py-2 font-medium">No.</th>
                  <th className="px-3 py-2 font-medium">Combination</th>
                  <th className="px-3 py-2 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {r.combos.map(c => {
                  const isMax = c.id === r.maxCombo.id
                  const isMin = c.id === r.minCombo.id
                  const highlight = isMax
                    ? 'bg-green-50'
                    : isMin && r.minCombo.value < 0
                    ? 'bg-red-50'
                    : ''
                  return (
                    <tr key={c.id} className={`border-b border-slate-50 ${highlight}`}>
                      <td className="px-3 py-2 font-mono text-slate-500">{c.id}</td>
                      <td className="px-3 py-2 text-slate-700">{c.label}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {f2(c.value)}
                        {isMax && (
                          <span className="ml-1.5 rounded bg-green-100 px-1 py-0.5 text-[10px] font-semibold text-green-700">MAX</span>
                        )}
                        {isMin && r.minCombo.value < 0 && (
                          <span className="ml-1.5 rounded bg-red-100 px-1 py-0.5 text-[10px] font-semibold text-red-700">MIN</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="flex gap-6 border-t border-slate-100 bg-slate-50 px-4 py-3 text-sm">
              <div>
                <span className="text-slate-500">Max (governing):</span>
                <span className="ml-1.5 font-bold text-green-700">{f2(r.maxCombo.value)}</span>
                <span className="ml-1 text-slate-500 text-xs">combo {r.maxCombo.id}</span>
              </div>
              <div>
                <span className="text-slate-500">Min:</span>
                <span className="ml-1.5 font-bold text-slate-700">{f2(r.minCombo.value)}</span>
                <span className="ml-1 text-slate-500 text-xs">combo {r.minCombo.id}</span>
              </div>
            </div>
          </div>
        ) : (
          <p className="self-start rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            Fill in load values to see factored combinations.
          </p>
        )}
      </div>
    </div>
  )
}
