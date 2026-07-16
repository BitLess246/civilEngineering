import { useState } from 'react'
import { designCircularTank } from '../engine/waterTank'
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

export default function WaterTank() {
  const [H, setH] = useState(4)
  const [D, setD] = useState(10)
  const [t, setT] = useState(250)
  const [freeboard, setFreeboard] = useState(0.3)
  const [fc, setFc] = useState(28)
  const [sigmaSt, setSigmaSt] = useState(130)
  const [sigmaCt, setSigmaCt] = useState(1.3)
  const [cover, setCover] = useState(40)
  const [barDia, setBarDia] = useState(16)

  const r = designCircularTank({ H, D, t, freeboard, fc, sigmaSt, sigmaCt, cover, barDia })

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Structural</p>
      <h1 className="mt-1 text-2xl font-bold text-[#0056b3]">Circular RC water tank — wall</h1>
      <ReportControls title="Water Tank Design Report" badges={['IS 3370', 'ACI 350']} />
      <p className="mt-2 text-sm text-slate-600">
        Permissible-stress (working-stress) wall design for a circular liquid-retaining tank, following the
        crack-control philosophy of IS 3370 / ACI 350. Hoop (ring) tension governs the horizontal steel;
        the base cantilever moment governs the vertical steel; the wall is checked against concrete cracking.
      </p>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Geometry</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Water depth H" unit="m" value={H} onChange={setH} />
          <Field label="Diameter D" unit="m" value={D} onChange={setD} />
          <Field label="Wall thickness t" unit="mm" value={t} onChange={setT} />
          <Field label="Freeboard" unit="m" value={freeboard} onChange={setFreeboard} step="0.05" />
        </div>
        <h2 className="mb-3 mt-5 text-[1.05rem] font-bold text-[#0056b3]">Materials &amp; permissible stresses</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="f′c" unit="MPa" value={fc} onChange={setFc} />
          <Field label="σst (steel)" unit="MPa" value={sigmaSt} onChange={setSigmaSt} />
          <Field label="σct (concrete)" unit="MPa" value={sigmaCt} onChange={setSigmaCt} step="0.1" />
          <Field label="Bar Ø" unit="mm" value={barDia} onChange={setBarDia} />
          <Field label="Cover" unit="mm" value={cover} onChange={setCover} />
        </div>
      </section>

      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-[1.05rem] font-bold text-[#0056b3]">Results</h2>
        <Out label="Max hoop tension T = γw·H·D/2" value={`${f2(r.T)} kN/m`} />
        <Out label="Ring (hoop) steel As" value={`${f0(r.hoopAs)} mm²/m — ⌀${barDia} @ ${f0(r.hoopSpacing)} mm (each face)`} />
        <Out label="Base cantilever moment M = γw·H³/6" value={`${f2(r.M)} kN·m/m`} />
        <Out label="Vertical steel As" value={`${f0(r.vertAs)} mm²/m — ⌀${barDia} @ ${f0(r.vertSpacing)} mm`} />
        <Out label={`Concrete tension fct (≤ ${f2(sigmaCt)})`} value={`${f2(r.fct)} MPa`} ok={r.thicknessOK} />
        <Out label="Freeboard ≥ 300 mm" value={`${f2(freeboard)} m`} ok={r.freeboardOK} />
        <p className="mt-2 text-[10px] text-slate-500">
          Provide ring steel on both faces near the base where hoop tension peaks; reduce up the wall as
          T = γw·z·D/2 falls. σst ≈ 115–150 MPa controls crack width (IS 3370 / ACI 350). Base slab, roof,
          and the wall-base joint (fixed vs hinged) are designed separately.
        </p>
      </section>
    </main>
  )
}
