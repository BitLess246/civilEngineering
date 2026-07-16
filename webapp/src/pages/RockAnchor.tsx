import { useState } from 'react'
import { designRockAnchor } from '../engine/rockAnchor'
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

export default function RockAnchor() {
  const [fpu, setFpu] = useState(1860)
  const [Aps, setAps] = useState(1000)
  const [holeDia, setHoleDia] = useState(0.115)
  const [bondLength, setBondLength] = useState(6)
  const [tauUlt, setTauUlt] = useState(700)
  const [T, setT] = useState(600)

  const r = designRockAnchor({ fpu, Aps, holeDia, bondLength, tauUlt, FS: 2, T })

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Geotechnical</p>
      <h1 className="mt-1 text-2xl font-bold text-[#0056b3]">Rock / ground anchor</h1>
      <ReportControls title="Rock Anchor Report" badges={['PTI DC35.1']} />
      <p className="mt-2 text-sm text-slate-600">
        PTI DC35.1 / FHWA-IF-99-015 check: prestressing-tendon design load (0.60·GUTS) and grout-ground
        (rock socket) bond capacity vs the applied anchor tension. Governing allowable = the smaller.
      </p>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Tendon &amp; bond zone</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="fpu" unit="MPa" value={fpu} onChange={setFpu} />
          <Field label="Tendon area Aps" unit="mm²" value={Aps} onChange={setAps} />
          <Field label="Axial demand T" unit="kN" value={T} onChange={setT} />
          <Field label="Hole Ø" unit="m" value={holeDia} onChange={setHoleDia} step="0.005" />
          <Field label="Bond length" unit="m" value={bondLength} onChange={setBondLength} />
          <Field label="Bond τult" unit="kPa" value={tauUlt} onChange={setTauUlt} />
        </div>
      </section>

      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-[1.05rem] font-bold text-[#0056b3]">Results</h2>
        <Out label="GUTS = fpu·Aps" value={`${f0(r.GUTS)} kN`} />
        <Out label="Tendon design load (0.60·GUTS)" value={`${f0(r.Td)} kN`} ok={r.tendonOK} />
        <Out label="Bond Qult / allowable (FS 2)" value={`${f0(r.Qult)} / ${f0(r.Qall)} kN`} ok={r.bondOK} />
        <Out label={`Governing allowable (${r.governs})`} value={`${f0(r.allowable)} kN`} ok={r.ok} />
        <Out label="FS (allowable / demand)" value={f2(r.fs)} ok={r.ok} />
        <Out label="Proof/test load" value={`${f0(r.testLoad)} kN`} />
        <Out label="Bond length for FS = 2" value={`${f2(r.bondLengthReq)} m`} ok={bondLength >= r.bondLengthReq} />
        <p className="mt-2 text-[10px] text-slate-500">
          Td = 0.60·GUTS (PTI permanent max). Bond Qult = π·Dhole·Lbond·τult / FS. Proof load
          min(1.33·T, 0.80·GUTS). Provide the unbonded (free) length and corrosion protection separately.
        </p>
      </section>
    </main>
  )
}
