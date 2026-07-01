import { useState } from 'react'
import { designFacing } from '../engine/shotcreteFacing'

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

export default function ShotcreteFacing() {
  const [SH, setSH] = useState(1.5)
  const [SV, setSV] = useState(1.5)
  const [hc, setHc] = useState(100)
  const [cover, setCover] = useState(30)
  const [AsVert, setAsVert] = useState(400)
  const [AsHoriz, setAsHoriz] = useState(400)
  const [fc, setFc] = useState(21)
  const [fy, setFy] = useState(415)
  const [bearingPlate, setBearingPlate] = useState(0.2)
  const [CF, setCF] = useState(2.0)
  const [nailHeadForce, setNailHeadForce] = useState(60)

  const r = designFacing({ SH, SV, hc, cover, AsVert, AsHoriz, fc, fy, bearingPlate, CF, nailHeadForce })

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Geotechnical</p>
      <h1 className="mt-1 text-2xl font-bold text-[#0056b3]">Soil-nail shotcrete facing</h1>
      <p className="mt-2 text-sm text-slate-600">
        FHWA GEC-7 facing check. The thin shotcrete panel spans <b>between</b> the nail heads, so earth
        pressure bends it like a two-way slab on point supports — hogging over each nail, sagging at
        midspan. This checks the facing flexural nail-head strength R<sub>FF</sub> and the punching-shear
        strength R<sub>FP</sub> against the nail-head force.
      </p>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Layout &amp; facing</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Horiz. spacing SH" unit="m" value={SH} onChange={setSH} />
          <Field label="Vert. spacing SV" unit="m" value={SV} onChange={setSV} />
          <Field label="Facing thickness hc" unit="mm" value={hc} onChange={setHc} />
          <Field label="Cover" unit="mm" value={cover} onChange={setCover} />
          <Field label="Vert. steel As" unit="mm²/m" value={AsVert} onChange={setAsVert} />
          <Field label="Horiz. steel As" unit="mm²/m" value={AsHoriz} onChange={setAsHoriz} />
          <Field label="Bearing plate" unit="m" value={bearingPlate} onChange={setBearingPlate} step="0.05" />
          <Field label="Pressure factor CF" value={CF} onChange={setCF} step="0.1" />
        </div>
        <h2 className="mb-3 mt-5 text-[1.05rem] font-bold text-[#0056b3]">Materials &amp; demand</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="f′c" unit="MPa" value={fc} onChange={setFc} />
          <Field label="fy" unit="MPa" value={fy} onChange={setFy} />
          <Field label="Nail-head force" unit="kN" value={nailHeadForce} onChange={setNailHeadForce} />
        </div>
      </section>

      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-[1.05rem] font-bold text-[#0056b3]">Results</h2>
        <Out label="Panel moment m (vert / horiz)" value={`${f2(r.mVert)} / ${f2(r.mHoriz)} kN·m/m`} />
        <Out label="Flexural R_FF (vert / horiz)" value={`${f0(r.RffVert)} / ${f0(r.RffHoriz)} kN`} />
        <Out label="Punching R_FP" value={`${f0(r.Rfp)} kN`} />
        <Out label={`Governing facing strength (${r.governs})`} value={`${f0(r.strength)} kN`} ok={r.ok} />
        <Out label="FS (strength / nail-head force)" value={f2(r.fs)} ok={r.ok} />
        <p className="mt-2 text-[10px] text-slate-400">
          R_FF = C_F·(m_neg + m_pos)·8·S_perp/S_span (fixed-strip mechanism). R_FP = φ·0.33·√f′c·bo·d
          around the bearing plate. C_F ≈ 2.0 thin → 1.0 thick facing (FHWA GEC-7 Table). Headed-stud
          tension (permanent facing) and temporary-vs-final facing stages are checked separately.
        </p>
      </section>
    </main>
  )
}
