import { useState } from 'react'
import { designMicropile } from '../engine/micropile'

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

export default function Micropile() {
  const [barDia, setBarDia] = useState(32)
  const [fyBar, setFyBar] = useState(520)
  const [groutDia, setGroutDia] = useState(150)
  const [fcGrout, setFcGrout] = useState(28)
  const [casing, setCasing] = useState(false)
  const [casingOD, setCasingOD] = useState(140)
  const [casingID, setCasingID] = useState(125)
  const [fyCasing, setFyCasing] = useState(552)
  const [mode, setMode] = useState<'compression' | 'tension'>('compression')
  const [bondDia, setBondDia] = useState(0.15)
  const [bondLength, setBondLength] = useState(8)
  const [alphaBond, setAlphaBond] = useState(150)
  const [P, setP] = useState(400)

  const r = designMicropile({
    section: { barDia, fyBar, groutDia, fcGrout, ...(casing ? { casingOD, casingID, fyCasing } : {}) },
    mode, bondDia, bondLength, alphaBond, FS: 2, P,
  })

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Geotechnical</p>
      <h1 className="mt-1 text-2xl font-bold text-[#0056b3]">Micropile — axial capacity</h1>
      <p className="mt-2 text-sm text-slate-600">
        FHWA-NHI-05-039 allowable-stress check: structural capacity of the bar/casing/grout vs the
        grout-ground bond capacity of the bonded zone. Governing allowable = the smaller of the two.
      </p>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Section</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Bar Ø" unit="mm" value={barDia} onChange={setBarDia} />
          <Field label="Fy bar" unit="MPa" value={fyBar} onChange={setFyBar} />
          <Field label="Grout Ø (drill)" unit="mm" value={groutDia} onChange={setGroutDia} />
          <Field label="f′c grout" unit="MPa" value={fcGrout} onChange={setFcGrout} />
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={casing} onChange={(e) => setCasing(e.target.checked)} />
          <span>Permanent steel casing</span>
        </label>
        {casing && (
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Casing OD" unit="mm" value={casingOD} onChange={setCasingOD} />
            <Field label="Casing ID" unit="mm" value={casingID} onChange={setCasingID} />
            <Field label="Fy casing" unit="MPa" value={fyCasing} onChange={setFyCasing} />
          </div>
        )}
        <h2 className="mb-3 mt-5 text-[1.05rem] font-bold text-[#0056b3]">Bond zone &amp; demand</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="flex flex-col text-sm">
            <span className="mb-1 font-medium text-slate-600">Load mode</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as 'compression' | 'tension')}
              className="rounded-md border border-slate-300 px-2.5 py-1.5">
              <option value="compression">Compression</option>
              <option value="tension">Tension</option>
            </select>
          </label>
          <Field label="Bond Ø" unit="m" value={bondDia} onChange={setBondDia} step="0.01" />
          <Field label="Bond length" unit="m" value={bondLength} onChange={setBondLength} />
          <Field label="αbond" unit="kPa" value={alphaBond} onChange={setAlphaBond} />
          <Field label="Axial demand P" unit="kN" value={P} onChange={setP} />
        </div>
      </section>

      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-[1.05rem] font-bold text-[#0056b3]">Results</h2>
        <Out label="Structural allowable" value={`${f0(r.structural)} kN`} />
        <Out label="Bond Qult / allowable (FS 2)" value={`${f0(r.Qult)} / ${f0(r.Qbond)} kN`} />
        <Out label={`Governing allowable (${r.governs})`} value={`${f0(r.allowable)} kN`} />
        <Out label="FS (allowable / demand)" value={f2(r.fs)} ok={r.ok} />
        <Out label="Bond length for FS = 2" value={`${f2(r.bondLengthReq)} m`} ok={bondLength >= r.bondLengthReq} />
        <p className="mt-2 text-[10px] text-slate-500">
          Structural: 0.40·f′c·Agrout + 0.47·Fy·As (compression), 0.55·Fy·As (tension). Bond:
          π·Dbond·Lbond·αbond / FS. Verify buckling in very soft soils and group/settlement effects separately.
        </p>
      </section>
    </main>
  )
}
