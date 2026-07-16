import { useState } from 'react'
import { designStair, type StairSupport } from '../engine/stair'
import { ReportControls } from '../components/ReportControls'

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

export default function StairDesign() {
  const [span, setSpan] = useState(3.5)
  const [t, setT] = useState(150)
  const [R, setR] = useState(150)
  const [G, setG] = useState(300)
  const [fc, setFc] = useState(28)
  const [fy, setFy] = useState(415)
  const [barDia, setBarDia] = useState(12)
  const [cover, setCover] = useState(20)
  const [finishes, setFinishes] = useState(1.5)
  const [live, setLive] = useState(4.8)
  const [support, setSupport] = useState<StairSupport>('simple')

  const r = designStair({ span, t, R, G, fc, fy, barDia, cover, finishes, live, support })

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Structural</p>
      <h1 className="mt-1 text-2xl font-bold text-[#0056b3]">RC stair flight — waist slab</h1>
      <ReportControls title="Stair Design Report" badges={['NSCP 2015', 'ACI 318-14']} />
      <p className="mt-2 text-sm text-slate-600">
        One-way waist-slab stair to NSCP 2015 / ACI 318-14. Self-weight of the inclined waist plus
        triangular treads, finishes, and the NSCP 205 stair live load (4.8 kPa), designed per metre width.
      </p>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Geometry &amp; loads</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Flight span" unit="m" value={span} onChange={setSpan} />
          <Field label="Waist t" unit="mm" value={t} onChange={setT} />
          <Field label="Riser R" unit="mm" value={R} onChange={setR} />
          <Field label="Going G" unit="mm" value={G} onChange={setG} />
          <Field label="Finishes" unit="kPa" value={finishes} onChange={setFinishes} />
          <Field label="Live load" unit="kPa" value={live} onChange={setLive} />
          <label className="flex flex-col text-sm">
            <span className="mb-1 font-medium text-slate-600">Support</span>
            <select value={support} onChange={(e) => setSupport(e.target.value as StairSupport)}
              className="rounded-md border border-slate-300 px-2.5 py-1.5">
              <option value="simple">Simply supported</option>
              <option value="one-end">One end continuous</option>
              <option value="both-ends">Both ends continuous</option>
            </select>
          </label>
        </div>
        <h2 className="mb-3 mt-5 text-[1.05rem] font-bold text-[#0056b3]">Materials</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="f′c" unit="MPa" value={fc} onChange={setFc} />
          <Field label="fy" unit="MPa" value={fy} onChange={setFy} />
          <Field label="Main bar Ø" unit="mm" value={barDia} onChange={setBarDia} />
          <Field label="Cover" unit="mm" value={cover} onChange={setCover} />
        </div>
      </section>

      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-[1.05rem] font-bold text-[#0056b3]">Results</h2>
        <Out label="Slope θ" value={`${f2(r.geom.thetaDeg)}°`} />
        <Out label="Dead / Live" value={`${f2(r.loads.dead)} / ${f2(r.loads.live)} kPa`} />
        <Out label="Factored wu" value={`${f2(r.loads.wu)} kPa`} />
        <Out label="Design Mu" value={`${f2(r.Mu)} kN·m/m`} />
        <Out label="Effective depth d" value={`${f0(r.d)} mm`} />
        <Out label="Main steel As" value={`${f0(r.AsMain)} mm²/m`} />
        <Out label="Main bars" value={`⌀${barDia} @ ${f0(r.mainSpacing)} mm`} />
        <Out label="Distribution steel" value={`${f0(r.AsDist)} mm²/m — ⌀10 @ ${f0(r.distSpacing)} mm`} />
        <Out label="Min. waist (ℓ/20…ℓ/28)" value={`${f0(r.tMin)} mm`} ok={r.tMinOK} />
        <p className="mt-2 text-[10px] text-slate-500">
          Mu = wu·ℓ²/k (k = 8/9/11 by support). Distribution steel 0.0018·b·t (§424.4.3.2); spacing capped
          at min(3t, 450). Verify the landing and support detailing separately.
        </p>
      </section>
    </main>
  )
}
