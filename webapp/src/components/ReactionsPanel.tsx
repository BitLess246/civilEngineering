import { useState } from 'react'
import type { F3Analysis, F3Reaction } from '../engine/frame3d'
import { appliedResultant } from '../engine/frame3d'

const f1 = (v: number) => v.toFixed(1)
const f2 = (v: number) => v.toFixed(2)

/** Sum reactions over each global axis → [ΣFx, ΣFy, ΣFz, ΣMx, ΣMy, ΣMz]. */
function reactionTotals(reactions: F3Reaction[]) {
  return reactions.reduce(
    (a, r) => {
      a.Fx += r.F[0]; a.Fy += r.F[1]; a.Fz += r.F[2]
      a.Mx += r.M[0]; a.My += r.M[1]; a.Mz += r.M[2]
      return a
    },
    { Fx: 0, Fy: 0, Fz: 0, Mx: 0, My: 0, Mz: 0 }
  )
}

export function ReactionsPanel({
  analysis,
  memberLen,
}: {
  analysis: F3Analysis
  memberLen: (memberId: string) => number
}) {
  const validCombos = analysis.perCombo.map((run, i) => ({ run, i })).filter(({ run }) => !!run.result)
  const [active, setActive] = useState<number>(analysis.govIdx)
  const sel = analysis.perCombo[active]?.result ? active : (validCombos[0]?.i ?? analysis.govIdx)

  const run = analysis.perCombo[sel]
  const res = run?.result
  if (!res) return null

  const reactions = [...res.reactions].sort((a, b) => a.node.localeCompare(b.node))
  const rt = reactionTotals(reactions)

  // Statics self-check: applied resultant should balance the reaction resultant.
  const applied = appliedResultant(run.factored, memberLen)
  const resid: [number, number, number] = [applied[0] + rt.Fx, applied[1] + rt.Fy, applied[2] + rt.Fz]
  const scale = Math.max(Math.abs(rt.Fx), Math.abs(rt.Fy), Math.abs(rt.Fz), Math.abs(applied[1]), 1e-9)
  const residPct = (Math.max(...resid.map(Math.abs)) / scale) * 100
  const ok = residPct < 1

  const tabCls = (on: boolean) =>
    `rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
      on ? 'bg-[#0056b3] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    }`

  const axes: [string, 0 | 1 | 2][] = [['X', 0], ['Y', 1], ['Z', 2]]

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-[1.02rem] font-bold text-[#0056b3]">Support Reactions &amp; Statics Check</h2>

      <div className="mb-3 flex flex-wrap gap-1">
        {validCombos.map(({ run: r, i }) => (
          <button
            key={i}
            type="button"
            onClick={() => setActive(i)}
            className={`${tabCls(sel === i)} ${i === analysis.govIdx ? 'ring-1 ring-[#0056b3] ring-offset-1' : ''}`}
          >
            {r.combo.name}{i === analysis.govIdx ? ' ★' : ''}
          </button>
        ))}
      </div>

      {/* Statics self-check — STAAD-style ΣApplied vs ΣReactions */}
      <div className={`mb-3 rounded-lg border p-2.5 text-xs ${ok ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
        <div className={`mb-1 font-bold ${ok ? 'text-emerald-700' : 'text-red-700'}`}>
          {ok ? '✓ Equilibrium satisfied' : '✗ Equilibrium residual high'} — max residual {residPct.toExponential(1)}% of load
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-slate-500">
              <th className="text-left font-medium">Axis</th>
              <th className="text-right font-medium">ΣApplied (kN)</th>
              <th className="text-right font-medium">ΣReactions (kN)</th>
              <th className="text-right font-medium">Residual (kN)</th>
            </tr>
          </thead>
          <tbody>
            {axes.map(([name, k]) => (
              <tr key={name} className="text-slate-700">
                <td className="text-left font-mono">{name}</td>
                <td className="text-right tabular-nums">{f2(applied[k])}</td>
                <td className="text-right tabular-nums">{f2([rt.Fx, rt.Fy, rt.Fz][k])}</td>
                <td className="text-right tabular-nums">{f2(resid[k])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="pb-1.5 pr-3 text-left font-semibold">Node</th>
              <th className="pb-1.5 pr-3 text-left font-semibold">Fixity</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">Fx (kN)</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">Fy (kN)</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">Fz (kN)</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">Mx (kN·m)</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">My (kN·m)</th>
              <th className="pb-1.5 text-right font-semibold">Mz (kN·m)</th>
            </tr>
          </thead>
          <tbody>
            {reactions.map((r) => (
              <tr key={r.node} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="py-1 pr-3 font-mono text-slate-700">{r.node}</td>
                <td className="py-1 pr-3 capitalize text-slate-500">{r.fixity}</td>
                <td className="py-1 pr-3 text-right tabular-nums text-slate-800">{f1(r.F[0])}</td>
                <td className="py-1 pr-3 text-right tabular-nums text-slate-800">{f1(r.F[1])}</td>
                <td className="py-1 pr-3 text-right tabular-nums text-slate-800">{f1(r.F[2])}</td>
                <td className="py-1 pr-3 text-right tabular-nums text-slate-800">{f1(r.M[0])}</td>
                <td className="py-1 pr-3 text-right tabular-nums text-slate-800">{f1(r.M[1])}</td>
                <td className="py-1 text-right tabular-nums text-slate-800">{f1(r.M[2])}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
              <td className="py-1.5 pr-3 text-slate-700" colSpan={2}>Σ</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-[#0056b3]">{f1(rt.Fx)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-[#0056b3]">{f1(rt.Fy)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-[#0056b3]">{f1(rt.Fz)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-[#0056b3]">{f1(rt.Mx)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums text-[#0056b3]">{f1(rt.My)}</td>
              <td className="py-1.5 text-right tabular-nums text-[#0056b3]">{f1(rt.Mz)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
