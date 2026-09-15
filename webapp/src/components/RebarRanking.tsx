import { useState } from 'react'
import {
  PRIORITY_WEIGHTS, blockingGates,
  type RebarLayout, type RebarSelection, type ScoredLayout,
} from '../engine/rebarScore'
import { nameCage } from '../lib/rebarLabel'

// ─────────────────────────────────────────────────────────────────────────
// The reinforcement selection, shown rather than asserted.
//
// The optimiser's answer is only worth trusting if the working is visible:
// what was adopted, what it beat, by how much, and — when nothing complies —
// which clause did the rejecting. This renders that for a beam cage, a column
// cage or a slab mat alike; the only thing that differs is how a layout is
// named, which the caller supplies.
// ─────────────────────────────────────────────────────────────────────────

const pct = (v: number) => `${(v * 100).toFixed(0)}`

/** Column headers carry their weight, so the ranking can be argued with. */
const DIMS = [
  ['Serv', 'serviceability'],
  ['Const', 'constructability'],
  ['Econ', 'economy'],
  ['Simp', 'simplicity'],
] as const

function ScoreRow({ s, adopted, name }: {
  s: ScoredLayout; adopted: boolean; name: (l: RebarLayout) => string
}) {
  return (
    <tr className={adopted ? 'bg-brand-tint' : ''}>
      <td className="py-1 pr-2 font-mono text-[11.5px] font-semibold text-ink">
        {adopted && <span className="mr-1 text-brand">▸</span>}
        {name(s.layout)}
      </td>
      {DIMS.map(([, k]) => (
        <td key={k} className="py-1 pr-2 text-right font-mono text-[11px] text-muted">
          {pct(s.scores[k])}
        </td>
      ))}
      <td className="py-1 text-right font-mono text-[11.5px] font-semibold text-ink">
        {s.total.toFixed(3)}
      </td>
    </tr>
  )
}

export function RebarRanking({
  selection, title = 'Bar selection', name = nameCage, limit = 6,
}: {
  selection: RebarSelection
  title?: string
  /** How to name a layout — a cage counts bars, a mat quotes a spacing. */
  name?: (l: RebarLayout) => string
  /** Ranked rows to show before the "show all" toggle. */
  limit?: number
}) {
  const [all, setAll] = useState(false)
  const [showRejected, setShowRejected] = useState(false)
  const { best, ranked, rejected, margin } = selection
  const gates = blockingGates(selection)
  const shown = all ? ranked : ranked.slice(0, limit)

  return (
    <div className="rail-card print-avoid-break rounded-lg border border-hairline bg-sheet p-4">
      <h2 className="mb-2 text-[13.5px] font-bold text-ink">{title}</h2>

      {best ? (
        <>
          <div className="mb-2 rounded border border-brand-line bg-brand-tint px-3 py-2">
            <div className="font-mono text-[15px] font-bold text-brand">{name(best.layout)}</div>
            <div className="mt-0.5 text-[11.5px] text-ink-2">{best.reason}</div>
          </div>
          <p className="mb-2 text-[11px] text-muted">{margin}</p>
        </>
      ) : (
        <div className="mb-2 rounded border border-fail-line bg-fail-tint px-3 py-2">
          <div className="text-[12.5px] font-bold text-fail">No compliant layout</div>
          {/* The gates ARE the diagnosis — more than one usually fires, and
              the combination is what says "the section, not the bars". */}
          <ul className="mt-1 space-y-0.5">
            {gates.map((g) => (
              <li key={g.check.id} className="text-[11.5px] text-fail">
                <span className="font-mono">{g.n}×</span> {g.check.label}
                <span className="text-fail"> · {g.check.clause}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ranked.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-[12px]">
            <thead>
              <tr className="border-b border-hairline-2 text-left text-[10.5px] text-faint">
                <th className="pb-1 pr-2 font-semibold">Layout</th>
                {DIMS.map(([label, k]) => (
                  <th key={k} className="pb-1 pr-2 text-right font-semibold">
                    {label}
                    <span className="ml-0.5 font-mono font-normal">·{PRIORITY_WEIGHTS[k].toFixed(2)}</span>
                  </th>
                ))}
                <th className="pb-1 text-right font-semibold">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline-2">
              {shown.map((s) => (
                <ScoreRow key={`${s.layout.db}-${s.layout.bars}-${s.layout.spacing}`}
                  s={s} adopted={s === best} name={name} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ranked.length > 0 && (
        <p className="mt-1.5 text-[10px] text-faint">
          Each column is scored 0–100 <em>relative to the candidates generated here</em>, then
          weighted by the figure beside its heading. Compliance is a gate, never a score.
        </p>
      )}

      <div className="no-print mt-2 flex flex-wrap gap-3 text-[11px]">
        {ranked.length > limit && (
          <button type="button" onClick={() => setAll((v) => !v)}
            className="!bg-transparent !p-0 !text-[11px] font-semibold text-brand underline">
            {all ? 'Show fewer' : `Show all ${ranked.length} compliant`}
          </button>
        )}
        {rejected.length > 0 && (
          <button type="button" onClick={() => setShowRejected((v) => !v)}
            className="!bg-transparent !p-0 !text-[11px] font-semibold text-muted underline">
            {showRejected ? 'Hide' : `${rejected.length} rejected`}
          </button>
        )}
      </div>

      {showRejected && (
        <ul className="mt-2 space-y-1 border-t border-hairline-2 pt-2">
          {rejected.map((r) => (
            <li key={`${r.layout.db}-${r.layout.bars}-${r.layout.spacing}`}
              className="flex flex-wrap items-baseline gap-x-2 text-[11px]">
              <span className="font-mono font-semibold text-muted">{name(r.layout)}</span>
              <span className="text-fail">{r.failedGate?.label}</span>
              <span className="text-faint">{r.failedGate?.clause}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
