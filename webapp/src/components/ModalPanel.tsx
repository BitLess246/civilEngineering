import type { ModalResult } from '../engine/modal'

const f3 = (v: number) => v.toFixed(3)
const f2 = (v: number) => v.toFixed(2)
const pct = (v: number) => `${(v * 100).toFixed(1)}%`

/** Cumulative-mass cell colour: green once the ≥90% NSCP threshold is reached. */
const cumCls = (v: number) => (v >= 0.9 ? 'text-emerald-600 font-semibold' : 'text-slate-500')

export function ModalPanel({ result, selectedMode, onSelectMode }: {
  result: ModalResult
  selectedMode?: number | null
  onSelectMode?: (idx: number | null) => void
}) {
  const { modes, totalMass, cumRatio } = result
  // running cumulative effective-mass ratio per direction, mode by mode
  const cum: [number, number, number] = [0, 0, 0]

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-1 text-[1.02rem] font-bold text-[#0056b3]">Modal Analysis — natural periods &amp; mass participation</h2>
      <p className="mb-3 text-[11px] text-slate-500">
        Lumped-mass free vibration. Effective modal mass per global direction; the cumulative column turns green at the
        NSCP 208.5.5 ≥90% threshold. Total mass {f2(totalMass[0])} t (X), {f2(totalMass[1])} t (Y), {f2(totalMass[2])} t (Z).
        {onSelectMode && <span className="ml-1">Click <span className="font-semibold text-violet-600">3D</span> to animate the mode shape in the canvas.</span>}
      </p>

      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="pb-1.5 pr-3 text-left font-semibold">Mode</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">T (s)</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">f (Hz)</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">ω (rad/s)</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">mₓ</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">m_y</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">m_z</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">Σmₓ</th>
              <th className="pb-1.5 pr-3 text-right font-semibold">Σm_y</th>
              <th className="pb-1.5 text-right font-semibold">Σm_z</th>
              {onSelectMode && <th className="pb-1.5 pl-2" />}
            </tr>
          </thead>
          <tbody>
            {modes.map((m, i) => {
              cum[0] += m.effMassRatio[0]; cum[1] += m.effMassRatio[1]; cum[2] += m.effMassRatio[2]
              const dom = m.effMassRatio.indexOf(Math.max(...m.effMassRatio))
              const domLabel = m.effMassRatio[dom] > 0.5 ? ['X', 'Y', 'Z'][dom] : ''
              const active = selectedMode === i
              return (
                <tr key={i} className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${active ? 'bg-violet-50' : ''}`}>
                  <td className="py-1 pr-3 font-mono text-slate-700">{i + 1}{domLabel && <span className="ml-1 text-[10px] text-slate-500">{domLabel}</span>}</td>
                  <td className="py-1 pr-3 text-right tabular-nums font-semibold text-slate-800">{f3(m.period)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums text-slate-600">{f2(m.freq)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums text-slate-600">{f2(m.omega)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums text-slate-700">{pct(m.effMassRatio[0])}</td>
                  <td className="py-1 pr-3 text-right tabular-nums text-slate-700">{pct(m.effMassRatio[1])}</td>
                  <td className="py-1 pr-3 text-right tabular-nums text-slate-700">{pct(m.effMassRatio[2])}</td>
                  <td className={`py-1 pr-3 text-right tabular-nums ${cumCls(cum[0])}`}>{pct(cum[0])}</td>
                  <td className={`py-1 pr-3 text-right tabular-nums ${cumCls(cum[1])}`}>{pct(cum[1])}</td>
                  <td className={`py-1 text-right tabular-nums ${cumCls(cum[2])}`}>{pct(cum[2])}</td>
                  {onSelectMode && (
                    <td className="py-1 pl-2">
                      <button type="button"
                        onClick={() => onSelectMode(active ? null : i)}
                        title={active ? 'Hide mode shape' : 'Animate mode shape in 3D view'}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition ${
                          active ? 'bg-violet-100 text-violet-700' : 'text-slate-500 hover:text-violet-600'
                        }`}>
                        {active ? '◉' : '◎'} 3D
                      </button>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {(cumRatio[0] < 0.9 || cumRatio[2] < 0.9) && (
        <p className="mt-2 text-[11px] text-amber-600">
          ⚠ Cumulative lateral mass is below 90% (X {pct(cumRatio[0])}, Z {pct(cumRatio[2])}) — request more modes for a code-compliant response-spectrum base.
        </p>
      )}
    </div>
  )
}
