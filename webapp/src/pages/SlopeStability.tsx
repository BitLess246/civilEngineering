import { useMemo, useState } from 'react'
import { ReportControls } from '../components/ReportControls'
import {
  searchCriticalCircle, surfaceY,
  type Pt, type SlopeSoil, type WaterModel, type CircleResult,
} from '../engine/slopeStability'
import { buildSlopeSolution } from '../lib/slopeSolution'
import { SoilLayerPicker } from '../components/SoilLayerPicker'

function num(v: string, d = 0): number { const n = parseFloat(v); return Number.isFinite(n) ? n : d }
const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—')
const f0 = (n: number) => (Number.isFinite(n) ? Math.round(n).toString() : '—')

function Field({ label, value, onChange, unit, step = 'any' }: {
  label: string; value: number; onChange: (v: number) => void; unit?: string; step?: string
}) {
  return (
    <label className="flex flex-col text-sm">
      <span className="mb-1 font-medium text-slate-600">{label}{unit ? ` (${unit})` : ''}</span>
      <input type="number" step={step} value={value} onChange={(e) => onChange(num(e.target.value))}
        className="rounded-md border border-slate-300 px-2.5 py-1.5" />
    </label>
  )
}

function Out({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-baseline justify-between border-t border-slate-100 py-1 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`font-mono font-medium ${ok === undefined ? 'text-slate-800' : ok ? 'text-emerald-600' : 'text-red-600'}`}>{value}</span>
    </div>
  )
}

/** Build the ground polyline (left→right) from a simple slope geometry:
 *  crest plateau at height H, a face at angle β, then a toe plateau. */
function groundOf(H: number, betaDeg: number, crestW: number, toeW: number): Pt[] {
  const run = betaDeg > 0 && betaDeg < 90 ? H / Math.tan((betaDeg * Math.PI) / 180) : H
  return [{ x: 0, y: H }, { x: crestW, y: H }, { x: crestW + run, y: 0 }, { x: crestW + run + toeW, y: 0 }]
}

/** Vector slope + critical-circle drawing (world m → px, y up). */
function SlopeSvg({ ground, res, water }: { ground: Pt[]; res: CircleResult | null; water?: Pt[] }) {
  const W = 640, Hpx = 320, pad = 30
  const xs = ground.map((p) => p.x), ys = ground.map((p) => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  let minY = Math.min(...ys), maxY = Math.max(...ys)
  if (res) { minY = Math.min(minY, res.circle.yc - res.circle.R); maxY = Math.max(maxY, res.circle.yc) }
  const sx = (W - 2 * pad) / Math.max(1e-6, maxX - minX)
  const sy = (Hpx - 2 * pad) / Math.max(1e-6, maxY - minY)
  const s = Math.min(sx, sy)
  const X = (x: number) => pad + (x - minX) * s
  const Y = (y: number) => Hpx - pad - (y - minY) * s

  const groundPath = ground.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')
  const slicePts: string[] = []
  let arcPath = '', massPath = '', center = null as null | { cx: number; cy: number }
  if (res) {
    const sl = res.slices, { xc, yc, R } = res.circle
    const yArc = (x: number) => yc - Math.sqrt(Math.max(0, R * R - (x - xc) ** 2))
    const x0 = sl[0].x - sl[0].b / 2, x1 = sl[sl.length - 1].x + sl[sl.length - 1].b / 2
    const nSample = 60
    const arc: Pt[] = []
    for (let i = 0; i <= nSample; i++) { const x = x0 + ((x1 - x0) * i) / nSample; arc.push({ x, y: yArc(x) }) }
    arcPath = arc.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')
    // sliding mass = ground surface (x0→x1) then back along the arc
    const top: Pt[] = arc.map((p) => ({ x: p.x, y: surfaceY(ground, p.x) }))
    massPath = 'M' + top.map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' L') +
      ' L' + [...arc].reverse().map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' L') + ' Z'
    // interior slice boundaries
    for (let i = 1; i < sl.length; i++) {
      const xb = sl[i].x - sl[i].b / 2
      slicePts.push(`M${X(xb).toFixed(1)},${Y(surfaceY(ground, xb)).toFixed(1)} L${X(xb).toFixed(1)},${Y(yArc(xb)).toFixed(1)}`)
    }
    center = { cx: X(xc), cy: Y(yc) }
  }
  const waterPath = water && water.length > 1
    ? water.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ') : ''

  return (
    <svg viewBox={`0 0 ${W} ${Hpx}`} className="w-full rounded-lg border border-slate-200 bg-white" style={{ maxHeight: 340 }}>
      <rect x={0} y={0} width={W} height={Hpx} fill="#fff" />
      {massPath && <path d={massPath} fill="#fca5a5" fillOpacity={0.28} stroke="none" />}
      {slicePts.map((d, i) => <path key={i} d={d} stroke="#94a3b8" strokeWidth={0.5} fill="none" />)}
      <path d={groundPath} stroke="#78350f" strokeWidth={2} fill="none" />
      {arcPath && <path d={arcPath} stroke="#dc2626" strokeWidth={2} fill="none" />}
      {waterPath && <path d={waterPath} stroke="#0ea5e9" strokeWidth={1.2} strokeDasharray="5,3" fill="none" />}
      {center && <>
        <line x1={center.cx} y1={center.cy} x2={X(res!.circle.xc + res!.circle.R)} y2={center.cy} stroke="#dc2626" strokeWidth={0.6} strokeDasharray="3,3" />
        <circle cx={center.cx} cy={center.cy} r={3} fill="#dc2626" />
      </>}
    </svg>
  )
}

export default function SlopeStability() {
  const [H, setH] = useState(10)
  const [beta, setBeta] = useState(30)
  const [crestW, setCrestW] = useState(8)
  const [toeW, setToeW] = useState(12)
  const [c, setC] = useState(20)
  const [phi, setPhi] = useState(25)
  const [gamma, setGamma] = useState(18)
  const [ru, setRu] = useState(0)
  const [method, setMethod] = useState<'bishop' | 'fellenius' | 'janbu'>('bishop')

  const ground = useMemo(() => groundOf(H, beta, crestW, toeW), [H, beta, crestW, toeW])
  const soil: SlopeSoil = { c, phiDeg: phi, gamma }
  const water: WaterModel | undefined = ru > 0 ? { ru } : undefined

  const res = useMemo(() => searchCriticalCircle(ground, soil, { water, n: 30 }),
    [ground, c, phi, gamma, ru]) // eslint-disable-line react-hooks/exhaustive-deps
  const crit = res?.critical ?? null
  const FS = crit ? { bishop: crit.bishop.FS, fellenius: crit.fellenius.FS, janbu: crit.janbu.FS }[method] : NaN
  const govOK = FS >= 1.5

  // Utilisation from the factor of safety: 1.5 is the conventional long-term
  // requirement for a permanent slope, so FS_required / FS_achieved is ≤ 1
  // exactly when it passes.
  const report = crit ? {
    docCode: 'G-SS',
    ok: govOK,
    governing: `${method} FS = ${f2(FS)} on the critical circle (target 1.5)`,
    stats: [
      { label: `FS (${method})`, value: f2(FS) },
      { label: 'Circle radius R', value: f2(crit.circle.R), unit: 'm' },
      { label: 'Centre (x, y)', value: `${f2(crit.circle.xc)}, ${f2(crit.circle.yc)}` },
    ],
    checks: [
      { name: 'Factor of safety vs 1.5', ratio: FS > 0 ? 1.5 / FS : 0, ok: govOK },
    ],
    data: [
      ['Slope height H', `${f2(H)} m`],
      ['Face angle β', `${f2(beta)}°`],
      ['Crest / toe width', `${f2(crestW)} / ${f2(toeW)} m`],
      ['Cohesion c', `${f2(c)} kPa`],
      ['Friction angle φ', `${f2(phi)}°`],
      ['Unit weight γ', `${f2(gamma)} kN/m³`],
      ['Pore pressure ru', f2(ru)],
      ['Reported method', method],
      ['FS Bishop', f2(crit.bishop.FS)],
      ['FS Fellenius', f2(crit.fellenius.FS)],
      ['FS Janbu', f2(crit.janbu.FS)],
      ['Driving ΣW·sinα', `${f2(crit.bishop.driving)} kN`],
      ['Resisting Σ', `${f2(crit.bishop.resisting)} kN`],
      ['Bishop converged', `${crit.bishop.converged ? 'yes' : 'NO'} (${crit.bishop.iterations} iterations)`],
    ] as [string, string][],
    steps: buildSlopeSolution(
      { H, beta, crestW, toeW, soil, ru, method }, res!, crit,
    ),
  } : undefined

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Geotechnical</p>
      <h1 className="mt-1 text-2xl font-bold text-[#0056b3]">Slope stability — method of slices</h1>
      <ReportControls title="Slope Stability" badges={['Bishop', 'Fellenius', 'Janbu']} report={report} />
      <p className="mt-2 text-sm text-slate-600">
        Circular-failure factor of safety by the method of slices — Fellenius/OMS, Bishop&rsquo;s simplified and
        Janbu&rsquo;s simplified — with a grid search for the critical (minimum-FS) circle. Pore pressure via ru.
      </p>

      <section className="mt-6">
        <SoilLayerPicker
          want={['c', 'phiDeg', 'gamma']}
          onApply={(f) => {
            if (f.c != null) setC(f.c)
            if (f.phiDeg != null) setPhi(f.phiDeg)
            if (f.gamma != null) setGamma(f.gamma)
          }} />
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Slope geometry</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Height H" unit="m" value={H} onChange={setH} />
          <Field label="Face angle β" unit="°" value={beta} onChange={setBeta} />
          <Field label="Crest width" unit="m" value={crestW} onChange={setCrestW} />
          <Field label="Toe width" unit="m" value={toeW} onChange={setToeW} />
        </div>
        <h2 className="mb-3 mt-5 text-[1.05rem] font-bold text-[#0056b3]">Soil &amp; water</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Cohesion c′" unit="kPa" value={c} onChange={setC} />
          <Field label="Friction φ′" unit="°" value={phi} onChange={setPhi} />
          <Field label="Unit weight γ" unit="kN/m³" value={gamma} onChange={setGamma} />
          <Field label="Pore ratio ru" value={ru} onChange={setRu} step="0.05" />
        </div>
      </section>

      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[1.05rem] font-bold text-[#0056b3]">Critical circle</h2>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Governing method</span>
            <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}
              className="rounded-md border border-slate-300 px-2 py-1">
              <option value="bishop">Bishop simplified</option>
              <option value="fellenius">Fellenius / OMS</option>
              <option value="janbu">Janbu simplified</option>
            </select>
          </label>
        </div>
        <SlopeSvg ground={ground} res={crit} />
        {crit ? (
          <div className="mt-3">
            <Out label={`Factor of safety — ${method}`} value={f2(FS)} ok={govOK} />
            <Out label="FS — Bishop / Fellenius / Janbu" value={`${f2(crit.bishop.FS)} / ${f2(crit.fellenius.FS)} / ${f2(crit.janbu.FS)}`} />
            <Out label="Critical circle (xc, yc, R)" value={`(${f2(crit.circle.xc)}, ${f2(crit.circle.yc)}, ${f2(crit.circle.R)}) m`} />
            <Out label="Janbu correction f₀ · slices" value={`${f2(crit.f0)} · ${crit.slices.length}`} />
            <Out label="Σ driving / Σ resisting (Bishop)" value={`${f0(crit.bishop.driving)} / ${f0(crit.bishop.resisting)} kN·m/m`} />
            <p className="mt-2 text-[11px] text-slate-500">
              FS &lt; 1.5 (static) is generally inadequate for a permanent slope; check the target FS for your load
              case. Search covers a centre/radius grid — refine the geometry for site-specific circles.
            </p>
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
            No valid slip circle found for this geometry — check the slope height, angle and plateau widths.
          </p>
        )}
      </section>

      {crit && (
        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-[1.05rem] font-bold text-[#0056b3]">Slices (critical circle)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-[12px]">
              <thead className="text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="py-1 pr-3 text-left">#</th><th className="py-1 pr-3">x (m)</th><th className="py-1 pr-3">b (m)</th>
                  <th className="py-1 pr-3">h (m)</th><th className="py-1 pr-3">α (°)</th><th className="py-1 pr-3">W (kN/m)</th><th className="py-1 pr-3">u (kPa)</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {crit.slices.map((sl, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-0.5 pr-3 text-left">{i + 1}</td>
                    <td className="py-0.5 pr-3">{f2(sl.x)}</td><td className="py-0.5 pr-3">{f2(sl.b)}</td>
                    <td className="py-0.5 pr-3">{f2(sl.h)}</td><td className="py-0.5 pr-3">{f2((sl.alpha * 180) / Math.PI)}</td>
                    <td className="py-0.5 pr-3">{f0(sl.W)}</td><td className="py-0.5 pr-3">{f0(sl.u)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-slate-500">
            Bishop: FS = Σ[(c·b + (W − u·b)·tanφ)/mα] / Σ[W·sinα], mα = cosα + sinα·tanφ/FS (iterated).
            Fellenius drops the inter-slice terms; Janbu uses force equilibrium × f₀.
          </p>
        </section>
      )}
    </main>
  )
}
