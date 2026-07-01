import { useState } from 'react'
import { solveBoltedConnection } from '../engine/boltedConnection'
import { ConnectionDrawing } from '../components/ConnectionDrawing'
import type { BoltPos } from '../engine/steelDesign'

function num(v: string, d = 0): number { const n = parseFloat(v); return Number.isFinite(n) ? n : d }
const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—')

const DEFAULT_BOLTS: BoltPos[] = [
  { id: 'B1', x: 40, y: 180 }, { id: 'B2', x: 110, y: 180 },
  { id: 'B3', x: 40, y: 110 }, { id: 'B4', x: 110, y: 110 },
  { id: 'B5', x: 40, y: 40 }, { id: 'B6', x: 110, y: 40 },
]

export default function BoltedConnection() {
  const [bolts, setBolts] = useState<BoltPos[]>(DEFAULT_BOLTS)
  const [dia, setDia] = useState(22)
  const [P, setP] = useState(80)
  const [angle, setAngle] = useState(-40)
  const [px, setPx] = useState(280)
  const [py, setPy] = useState(180)
  const [allow, setAllow] = useState(150)
  const [nShear, setNShear] = useState(1)

  const r = solveBoltedConnection({ bolts, dia, allowableStress: allow, nShear, load: { P, angleDeg: angle, px, py } })

  const setBolt = (i: number, k: 'x' | 'y', v: number) =>
    setBolts((bs) => bs.map((b, j) => (j === i ? { ...b, [k]: v } : b)))
  const addBolt = () => setBolts((bs) => [...bs, { id: `B${bs.length + 1}`, x: 40, y: 40 }])
  const delBolt = (i: number) => setBolts((bs) => bs.filter((_, j) => j !== i).map((b, k) => ({ ...b, id: `B${k + 1}` })))

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Structural · Steel</p>
      <h1 className="mt-1 text-2xl font-bold text-[#0056b3]">Eccentric bolted connection</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        Elastic (vector) method for an eccentrically-loaded bolt group. Each bolt carries the direct
        share P/N plus a torsional share T·ρ/J (T = Pᵧ·eₓ − Pₓ·e_y, J = Σ(x²+y²)). Place bolts anywhere —
        the solver finds the most/least-loaded bolt, the peak shear stress, and the maximum load P.
      </p>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[1.05rem] font-bold text-[#0056b3]">Bolt pattern (mm)</h2>
            <button type="button" onClick={addBolt} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-[#0056b3] hover:bg-blue-50">+ Add bolt</button>
          </div>
          <div className="max-h-60 overflow-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-500"><tr className="text-left"><th className="pr-2 py-1">Bolt</th><th className="pr-2">x</th><th className="pr-2">y</th><th className="pr-2 text-right">R (kN)</th><th /></tr></thead>
              <tbody>
                {bolts.map((b, i) => {
                  const force = r.bolts.find((f) => f.id === b.id)
                  const crit = b.id === r.criticalId, least = b.id === r.leastId
                  return (
                    <tr key={b.id} className={`border-t border-slate-100 ${crit ? 'bg-red-50' : least ? 'bg-emerald-50' : ''}`}>
                      <td className="pr-2 py-1 font-medium">{b.id}{crit ? ' ▲' : least ? ' ▽' : ''}</td>
                      <td className="pr-2"><input type="number" value={b.x} onChange={(e) => setBolt(i, 'x', num(e.target.value))} className="w-16 rounded border border-slate-200 px-1 py-0.5" /></td>
                      <td className="pr-2"><input type="number" value={b.y} onChange={(e) => setBolt(i, 'y', num(e.target.value))} className="w-16 rounded border border-slate-200 px-1 py-0.5" /></td>
                      <td className="pr-2 text-right font-mono">{force ? f2(force.R) : '—'}</td>
                      <td className="text-right"><button type="button" onClick={() => delBolt(i)} className="text-slate-400 hover:text-red-600">✕</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <h2 className="mb-2 mt-4 text-[1.05rem] font-bold text-[#0056b3]">Load &amp; bolts</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {([['Load P (kN)', P, setP], ['Angle (° from +X)', angle, setAngle], ['Bolt Ø (mm)', dia, setDia],
              ['Load at x (mm)', px, setPx], ['Load at y (mm)', py, setPy], ['Allow. τ (MPa)', allow, setAllow]] as const).map(([lbl, val, set]) => (
              <label key={lbl} className="flex flex-col text-sm">
                <span className="mb-1 text-slate-600">{lbl}</span>
                <input type="number" value={val} onChange={(e) => set(num(e.target.value))} className="rounded-md border border-slate-300 px-2.5 py-1.5" />
              </label>
            ))}
            <label className="flex flex-col text-sm">
              <span className="mb-1 text-slate-600">Shear planes</span>
              <select value={nShear} onChange={(e) => setNShear(parseInt(e.target.value))} className="rounded-md border border-slate-300 px-2.5 py-1.5">
                <option value={1}>Single (1)</option><option value={2}>Double (2)</option>
              </select>
            </label>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <ConnectionDrawing geom={r.geom} db={dia} boltForces={r.bolts} critical={r.criticalId}
              Vu={r.Py} Hu={r.Px} ex_load={r.ex} ey_load={r.ey} />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-sm">
            <h2 className="mb-1 text-[1.05rem] font-bold text-[#0056b3]">Results</h2>
            {[['Load components Pₓ / Pᵧ', `${f2(r.Px)} / ${f2(r.Py)} kN`],
              ['Eccentricity eₓ / e_y', `${f2(r.ex)} / ${f2(r.ey)} mm`],
              ['Torsion T = Pᵧ·eₓ − Pₓ·e_y', `${f2(r.T / 1000)} kN·m`],
              ['Polar inertia J = Σ(x²+y²)', `${f2(r.J / 1e6)} ×10⁶ mm²`],
              ['Most-loaded bolt', `${r.criticalId} — ${f2(r.Rmax)} kN`],
              ['Least-loaded bolt', `${r.leastId} — ${f2(r.Rmin)} kN`]].map(([k, v]) => (
              <div key={k} className="flex justify-between border-t border-slate-100 py-1"><span className="text-slate-500">{k}</span><span className="font-mono">{v}</span></div>
            ))}
            <div className="flex justify-between border-t border-slate-100 py-1">
              <span className="text-slate-500">Max shear stress τ (≤ {f2(allow)})</span>
              <span className={`font-mono font-semibold ${r.ok ? 'text-emerald-600' : 'text-red-600'}`}>{f2(r.tauMax)} MPa {r.ok ? '✓' : '✗'}</span>
            </div>
            <div className="mt-2 flex items-baseline justify-between rounded-lg bg-blue-50 p-2">
              <span className="text-sm font-semibold text-[#0056b3]">Max allowable load P</span>
              <span className="font-mono text-lg font-bold text-[#0056b3]">{f2(r.maxP)} kN</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
