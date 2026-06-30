import { useState } from 'react'
import { designSoilNail } from '../engine/soilNail'

function num(v: string, d = 0): number { const n = parseFloat(v); return Number.isFinite(n) ? n : d }
const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—')

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

export default function SoilNail() {
  const [z, setZ] = useState(6)
  const [Sh, setSh] = useState(1.5)
  const [Sv, setSv] = useState(1.5)
  const [gamma, setGamma] = useState(18)
  const [phi, setPhi] = useState(30)
  const [q, setQ] = useState(10)
  const [barDia, setBarDia] = useState(25)
  const [fy, setFy] = useState(415)
  const [drillDia, setDrillDia] = useState(0.15)
  const [bondLength, setBondLength] = useState(6)
  const [qu, setQu] = useState(150)

  const r = designSoilNail({
    z, Sh, Sv, gamma, phiDeg: phi, surcharge: q, barDia, fy,
    drillDia, bondLength, qu, FSpullout: 2.0, FStensile: 1.8,
  })

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Geotechnical</p>
      <h1 className="mt-1 text-2xl font-bold text-[#0056b3]">Soil-nail wall — per-nail check</h1>
      <p className="mt-2 text-sm text-slate-600">
        Preliminary FHWA GEC-7 checks for a single nail: tributary active demand vs bar-tensile and
        grout-ground pullout capacities. Global (slip-surface) stability is separate — use the{' '}
        <a href="/geotech" className="text-[#0056b3] underline">slope-stability tool</a>.
      </p>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Geometry &amp; soil</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Nail depth z" unit="m" value={z} onChange={setZ} />
          <Field label="Horiz. spacing Sh" unit="m" value={Sh} onChange={setSh} />
          <Field label="Vert. spacing Sv" unit="m" value={Sv} onChange={setSv} />
          <Field label="γ" unit="kN/m³" value={gamma} onChange={setGamma} />
          <Field label="φ" unit="°" value={phi} onChange={setPhi} />
          <Field label="Surcharge q" unit="kPa" value={q} onChange={setQ} />
        </div>
        <h2 className="mb-3 mt-5 text-[1.05rem] font-bold text-[#0056b3]">Nail &amp; grout</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Bar Ø" unit="mm" value={barDia} onChange={setBarDia} />
          <Field label="fy" unit="MPa" value={fy} onChange={setFy} />
          <Field label="Drill hole DDH" unit="m" value={drillDia} onChange={setDrillDia} step="0.01" />
          <Field label="Bond length Le" unit="m" value={bondLength} onChange={setBondLength} />
          <Field label="Bond strength qu" unit="kPa" value={qu} onChange={setQu} />
        </div>
      </section>

      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-[1.05rem] font-bold text-[#0056b3]">Results</h2>
        <Out label="Ka (Rankine)" value={f2(r.Ka)} />
        <Out label="Demand Tmax = Ka·(γz+q)·Sh·Sv" value={`${f2(r.Tmax)} kN`} />
        <Out label="Bar tensile Tn = Ab·fy" value={`${f2(r.Tn)} kN`} />
        <Out label="FS tensile (Tn / Tmax ≥ 1.8)" value={f2(r.fsTensile)} ok={r.tensileOK} />
        <Out label="Pullout Qult = π·DDH·Le·qu" value={`${f2(r.Qult)} kN`} />
        <Out label="FS pullout (Qult / Tmax ≥ 2.0)" value={f2(r.fsPullout)} ok={r.pulloutOK} />
        <Out label="Bond length for FS = 2.0" value={`${f2(r.bondLengthReq)} m`} ok={bondLength >= r.bondLengthReq} />
        <p className="mt-2 text-[10px] text-slate-400">
          FHWA GEC-7. Tmax is the tributary active load on one nail at depth z. Allowable bar load Tn/1.8,
          allowable pullout Qult/2.0. Provide Le ≥ the required bond length beyond the slip surface.
          This is a preliminary component check — verify global stability separately.
        </p>
      </section>
    </main>
  )
}
