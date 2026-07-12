import { useState } from 'react'
import { solveWeldedConnection, type WeldSegment } from '../engine/weldedConnection'

function num(v: string, d = 0): number { const n = parseFloat(v); return Number.isFinite(n) ? n : d }
const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—')

// Bracket plate: two vertical fillet lines 200 apart, 250 mm tall.
const DEFAULT_SEGS: WeldSegment[] = [
  { id: 'L', x1: 0, y1: 0, x2: 0, y2: 250 },
  { id: 'R', x1: 200, y1: 0, x2: 200, y2: 250 },
]

function WeldPlot({ r, segs, px, py }: { r: ReturnType<typeof solveWeldedConnection>; segs: WeldSegment[]; px: number; py: number }) {
  const xs = segs.flatMap((s) => [s.x1, s.x2]).concat([r.Cx, px])
  const ys = segs.flatMap((s) => [s.y1, s.y2]).concat([r.Cy, py])
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  const pad = 40, w = 380, h = 300
  const sx = (maxX - minX) || 1, sy = (maxY - minY) || 1
  const sc = Math.min((w - 2 * pad) / sx, (h - 2 * pad) / sy)
  const X = (x: number) => pad + (x - minX) * sc
  const Y = (y: number) => h - pad - (y - minY) * sc   // flip Y up
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      {segs.map((s) => (
        <line key={s.id} x1={X(s.x1)} y1={Y(s.y1)} x2={X(s.x2)} y2={Y(s.y2)} stroke="#0056b3" strokeWidth={4} strokeLinecap="round" />
      ))}
      {r.points.map((p, i) => (
        <circle key={i} cx={X(p.x)} cy={Y(p.y)} r={i === r.criticalIndex ? 6 : 3}
          fill={i === r.criticalIndex ? '#dc2626' : '#94a3b8'} />
      ))}
      {/* centroid */}
      <circle cx={X(r.Cx)} cy={Y(r.Cy)} r={4} fill="none" stroke="#059669" strokeWidth={1.5} />
      <line x1={X(r.Cx) - 8} y1={Y(r.Cy)} x2={X(r.Cx) + 8} y2={Y(r.Cy)} stroke="#059669" strokeWidth={1} />
      <line x1={X(r.Cx)} y1={Y(r.Cy) - 8} x2={X(r.Cx)} y2={Y(r.Cy) + 8} stroke="#059669" strokeWidth={1} />
      {/* load point + vector */}
      <circle cx={X(px)} cy={Y(py)} r={4} fill="#f59e0b" />
      <line x1={X(px)} y1={Y(py)} x2={X(r.Cx)} y2={Y(r.Cy)} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1} />
    </svg>
  )
}

export default function WeldedConnection() {
  const [segs, setSegs] = useState<WeldSegment[]>(DEFAULT_SEGS)
  const [size, setSize] = useState(6)
  const [P, setP] = useState(120)
  const [angle, setAngle] = useState(90)
  const [px, setPx] = useState(400)
  const [py, setPy] = useState(125)
  const [FEXX, setFEXX] = useState(480)
  const [phi, setPhi] = useState(0.75)

  const r = solveWeldedConnection({ segments: segs, size, FEXX, phi, load: { P, angleDeg: angle, px, py } })

  const setSeg = (i: number, k: keyof Omit<WeldSegment, 'id'>, v: number) =>
    setSegs((ss) => ss.map((s, j) => (j === i ? { ...s, [k]: v } : s)))
  const addSeg = () => setSegs((ss) => [...ss, { id: `W${ss.length + 1}`, x1: 0, y1: 0, x2: 100, y2: 0 }])
  const delSeg = (i: number) => setSegs((ss) => ss.filter((_, j) => j !== i).map((s, k) => ({ ...s, id: `W${k + 1}` })))

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Structural · Steel</p>
      <h1 className="mt-1 text-2xl font-bold text-[#0056b3]">Eccentric weld group</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        Elastic (weld-as-a-line) method for an eccentrically-loaded fillet weld group. Each unit length
        carries the direct share P/L_w plus a torsional share T·ρ/(J/t), T = Pᵧ·eₓ − Pₓ·e_y and
        J/t = Σ[L³/12 + L·ρ_c²]. The fillet throat is 0.707·w (NSCP 510.2.2 / AISC J2.2), so the design
        strength per unit length is φ·0.60·F_EXX·0.707·w. Add straight segments anywhere.
      </p>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[1.05rem] font-bold text-[#0056b3]">Weld segments (mm)</h2>
            <button type="button" onClick={addSeg} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-[#0056b3] hover:bg-blue-50">+ Add segment</button>
          </div>
          <div className="max-h-56 overflow-auto">
            <table className="w-full text-xs">
              <thead className="text-slate-500"><tr className="text-left"><th className="pr-2 py-1">Weld</th><th className="pr-2">x₁</th><th className="pr-2">y₁</th><th className="pr-2">x₂</th><th className="pr-2">y₂</th><th className="pr-2 text-right">L</th><th /></tr></thead>
              <tbody>
                {segs.map((s, i) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="pr-2 py-1 font-medium">{s.id}</td>
                    {(['x1', 'y1', 'x2', 'y2'] as const).map((k) => (
                      <td key={k} className="pr-2"><input type="number" value={s[k]} onChange={(e) => setSeg(i, k, num(e.target.value))} className="w-14 rounded border border-slate-200 px-1 py-0.5" /></td>
                    ))}
                    <td className="pr-2 text-right font-mono">{f2(Math.hypot(s.x2 - s.x1, s.y2 - s.y1))}</td>
                    <td className="text-right"><button type="button" onClick={() => delSeg(i)} className="text-slate-500 hover:text-red-600">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="mb-2 mt-4 text-[1.05rem] font-bold text-[#0056b3]">Load &amp; weld</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {([['Load P (kN)', P, setP], ['Angle (° from +X)', angle, setAngle], ['Fillet leg w (mm)', size, setSize],
              ['Load at x (mm)', px, setPx], ['Load at y (mm)', py, setPy], ['F_EXX (MPa)', FEXX, setFEXX],
              ['φ (LRFD)', phi, setPhi]] as const).map(([lbl, val, set]) => (
              <label key={lbl} className="flex flex-col text-sm">
                <span className="mb-1 text-slate-600">{lbl}</span>
                <input type="number" value={val} onChange={(e) => set(num(e.target.value))} className="rounded-md border border-slate-300 px-2.5 py-1.5" />
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <WeldPlot r={r} segs={segs} px={px} py={py} />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm text-sm">
            <h2 className="mb-1 text-[1.05rem] font-bold text-[#0056b3]">Results</h2>
            {[['Total weld length L_w', `${f2(r.Lw)} mm`],
              ['Centroid C', `(${f2(r.Cx)}, ${f2(r.Cy)}) mm`],
              ['Load components Pₓ / Pᵧ', `${f2(r.Px)} / ${f2(r.Py)} kN`],
              ['Eccentricity eₓ / e_y', `${f2(r.ex)} / ${f2(r.ey)} mm`],
              ['Torsion T = Pᵧ·eₓ − Pₓ·e_y', `${f2(r.T / 1000)} kN·m`],
              ['Polar inertia J/t = Σ[L³/12 + Lρ²]', `${f2(r.Jt / 1e6)} ×10⁶ mm³`],
              ['Effective throat 0.707·w', `${f2(r.throat)} mm`],
              ['Design strength / length', `${f2(r.capacityPerLen)} N/mm`]].map(([k, v]) => (
              <div key={k} className="flex justify-between border-t border-slate-100 py-1"><span className="text-slate-500">{k}</span><span className="font-mono">{v}</span></div>
            ))}
            <div className="flex justify-between border-t border-slate-100 py-1">
              <span className="text-slate-500">Peak force / length f_max (≤ {f2(r.capacityPerLen)})</span>
              <span className={`font-mono font-semibold ${r.ok ? 'text-emerald-600' : 'text-red-600'}`}>{f2(r.fMax)} N/mm {r.ok ? '✓' : '✗'}</span>
            </div>
            <div className="flex justify-between border-t border-slate-100 py-1">
              <span className="text-slate-500">Required fillet leg</span>
              <span className="font-mono">{f2(r.reqSize)} mm</span>
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
