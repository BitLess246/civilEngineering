import { useMemo, useState } from 'react'
import { calcLoadCombinations, type LoadDemands } from '../engine/loadCombinations'
import { Num, Card } from '../components/qty'
import { ReportControls } from '../components/ReportControls'
import { f2 } from '../lib/format'
import { PageHeader } from '../components/calc'
import { usePendingCalculatorInputs } from '../lib/ai/pendingAction'
import { usePublishPageSnapshot, type PageSnapshot } from '../lib/ai/pageContext'

const DEFAULTS: LoadDemands = { D: 0, L: 0, Lr: 0, W: 0, E: 0 }

/** Keep only finite numbers the page knows — the assistant must never set a field to a string. */
function sanitiseLoads(raw: Partial<LoadDemands> | null): Partial<LoadDemands> {
  if (!raw) return {}
  const out: Partial<LoadDemands> = {}
  for (const k of ['D', 'L', 'Lr', 'W', 'E'] as const) {
    const v: unknown = raw[k]
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
  }
  return out
}

export default function LoadCombinations() {
  // Assistant prefill pilot: `open_calculator('/load-combinations', {D, L, …})`
  // lands here via sessionStorage and becomes the initial state (consumed once).
  const initialLoads = usePendingCalculatorInputs('/load-combinations', DEFAULTS)
  const [d, setD] = useState<LoadDemands>(() => ({ ...DEFAULTS, ...sanitiseLoads(initialLoads()) }))
  const set = <K extends keyof LoadDemands>(k: K) => (v: number) =>
    setD(s => ({ ...s, [k]: v }))

  const allFinite = Object.values(d).every(Number.isFinite)
  // `d` is a fresh object every render, so memoize on its VALUE identity
  const dKey = JSON.stringify(d)
  const r = useMemo(
    () => (allFinite ? calcLoadCombinations(d) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dKey, allFinite],
  )

  // Assistant snapshot — `d` is state and `r` is memoised, so both deps are
  // stable and this republishes only when the numbers actually change.
  const comboSnapshot = useMemo<PageSnapshot>(() => ({
    route: '/load-combinations',
    tool: 'Load Combinations',
    inputs: (['D', 'L', 'Lr', 'W', 'E'] as const).map((k) => ({ label: k, value: f2(d[k]) })),
    results: r
      ? [
          { label: 'governing max', value: `${r.maxCombo.id} = ${f2(r.maxCombo.value)}` },
          { label: 'governing min', value: `${r.minCombo.id} = ${f2(r.minCombo.value)}` },
        ]
      : [{ label: 'results', value: 'enter finite loads' }],
    notes: ['NSCP 2015 §203.3 LRFD, any consistent unit'],
  }), [d, r])
  usePublishPageSnapshot('/load-combinations', comboSnapshot)

  return (
        <div>
      <PageHeader title="Load Combinations" badges={['NSCP 2015', 'ACI 318-14']} />
      <div className="mx-auto max-w-[1200px] p-6">
      <p className="no-print mt-1 text-muted">
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
          <p className="mt-2 text-xs text-muted">
            Any consistent unit (kN, kN/m, kPa, …). W and E enter as positive magnitudes;
            the ±W/±E sign is handled by each combination.
          </p>
        </Card>

        {/* ── RESULTS TABLE ── */}
        {r ? (
          <div className="overflow-x-auto rounded-xl border border-hairline bg-sheet shadow-sm">
            <div className="border-b border-hairline-2 bg-sheet-2 px-4 py-2.5">
              <span className="text-sm font-semibold text-ink-2">Factored Load Combinations</span>
              <span className="ml-3 text-xs text-muted">NSCP 2015 §203.3</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline-2 text-left text-xs text-muted">
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
                    ? 'bg-ok-tint'
                    : isMin && r.minCombo.value < 0
                    ? 'bg-fail-tint'
                    : ''
                  return (
                    <tr key={c.id} className={`border-b border-hairline-2 ${highlight}`}>
                      <td className="px-3 py-2 font-mono text-muted">{c.id}</td>
                      <td className="px-3 py-2 text-ink-2">{c.label}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {f2(c.value)}
                        {isMax && (
                          <span className="ml-1.5 rounded bg-ok-tint px-1 py-0.5 text-[10px] font-semibold text-ok">MAX</span>
                        )}
                        {isMin && r.minCombo.value < 0 && (
                          <span className="ml-1.5 rounded bg-fail-tint px-1 py-0.5 text-[10px] font-semibold text-fail">MIN</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="flex gap-6 border-t border-hairline-2 bg-sheet-2 px-4 py-3 text-sm">
              <div>
                <span className="text-muted">Max (governing):</span>
                <span className="ml-1.5 font-bold text-ok">{f2(r.maxCombo.value)}</span>
                <span className="ml-1 text-muted text-xs">combo {r.maxCombo.id}</span>
              </div>
              <div>
                <span className="text-muted">Min:</span>
                <span className="ml-1.5 font-bold text-ink-2">{f2(r.minCombo.value)}</span>
                <span className="ml-1 text-muted text-xs">combo {r.minCombo.id}</span>
              </div>
            </div>
          </div>
        ) : (
          <p className="self-start rounded-xl border border-hairline bg-sheet p-6 text-sm text-muted">
            Fill in load values to see factored combinations.
          </p>
        )}
      </div>
    </div>
    </div>
  )
}
