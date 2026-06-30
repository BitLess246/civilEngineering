import { useState } from 'react'
import { activeThrust, passiveThrust, bearingCapacity, infiniteSlopeFS, type FootingShape } from '../engine/geotech'

function num(v: string, d = 0): number { const n = parseFloat(v); return Number.isFinite(n) ? n : d }

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

function Card({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-[1.05rem] font-bold text-[#0056b3]">{title}</h2>
      <p className="mb-3 text-[11px] text-slate-400">{sub}</p>
      {children}
    </section>
  )
}

function Out({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-t border-slate-100 py-1 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-mono font-medium text-slate-800">{value}</span>
    </div>
  )
}

const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—')

function EarthPressure() {
  const [gamma, setGamma] = useState(18)
  const [H, setH] = useState(5)
  const [phi, setPhi] = useState(30)
  const [q, setQ] = useState(10)
  const a = activeThrust({ gamma, H, phiDeg: phi, surcharge: q })
  const p = passiveThrust({ gamma, H, phiDeg: phi })
  return (
    <Card title="Lateral earth pressure — Rankine" sub="Level cohesionless backfill, smooth vertical wall.">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="γ" unit="kN/m³" value={gamma} onChange={setGamma} />
        <Field label="Wall height H" unit="m" value={H} onChange={setH} />
        <Field label="φ" unit="°" value={phi} onChange={setPhi} />
        <Field label="Surcharge q" unit="kPa" value={q} onChange={setQ} />
      </div>
      <div className="mt-3">
        <Out label="Ka" value={f2(a.K)} />
        <Out label="Active thrust Pa" value={`${f2(a.P)} kN/m`} />
        <Out label="Acts at (above base)" value={`${f2(a.lineOfAction)} m`} />
        <Out label="Kp" value={f2(p.K)} />
        <Out label="Passive thrust Pp" value={`${f2(p.P)} kN/m`} />
      </div>
    </Card>
  )
}

function Bearing() {
  const [c, setC] = useState(20)
  const [phi, setPhi] = useState(30)
  const [gamma, setGamma] = useState(18)
  const [B, setB] = useState(2)
  const [Df, setDf] = useState(1.5)
  const [shape, setShape] = useState<FootingShape>('strip')
  const [FS, setFS] = useState(3)
  const r = bearingCapacity({ c, phiDeg: phi, gamma, B, Df, shape, FS })
  return (
    <Card title="Bearing capacity — Terzaghi/Meyerhof (Vesić Nγ)" sub="qult = c·Nc·sc + q·Nq + ½·γ·B·Nγ·sγ,  q = γ·Df.">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Cohesion c" unit="kPa" value={c} onChange={setC} />
        <Field label="φ" unit="°" value={phi} onChange={setPhi} />
        <Field label="γ" unit="kN/m³" value={gamma} onChange={setGamma} />
        <Field label="Width B" unit="m" value={B} onChange={setB} />
        <Field label="Depth Df" unit="m" value={Df} onChange={setDf} />
        <label className="flex flex-col text-sm">
          <span className="mb-1 font-medium text-slate-600">Shape</span>
          <select value={shape} onChange={(e) => setShape(e.target.value as FootingShape)}
            className="rounded-md border border-slate-300 px-2.5 py-1.5">
            <option value="strip">Strip</option>
            <option value="square">Square</option>
            <option value="circular">Circular</option>
          </select>
        </label>
        <Field label="FS" value={FS} onChange={setFS} />
      </div>
      <div className="mt-3">
        <Out label="Nc / Nq / Nγ" value={`${f2(r.Nc)} / ${f2(r.Nq)} / ${f2(r.Ngamma)}`} />
        <Out label="Ultimate qult" value={`${f2(r.qult)} kPa`} />
        <Out label="Net ultimate qnet" value={`${f2(r.qnet)} kPa`} />
        <Out label={`Allowable qallow (FS ${f2(FS)})`} value={`${f2(r.qallow)} kPa`} />
      </div>
    </Card>
  )
}

function Slope() {
  const [c, setC] = useState(5)
  const [phi, setPhi] = useState(30)
  const [gamma, setGamma] = useState(18)
  const [z, setZ] = useState(3)
  const [beta, setBeta] = useState(20)
  const [seepage, setSeepage] = useState(false)
  const [gammaSat, setGammaSat] = useState(20)
  const fs = infiniteSlopeFS({ c, phiDeg: phi, gamma, z, betaDeg: beta, seepage, gammaSat })
  return (
    <Card title="Slope stability — infinite slope" sub="Planar failure at depth z; optional seepage parallel to the slope.">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Cohesion c" unit="kPa" value={c} onChange={setC} />
        <Field label="φ" unit="°" value={phi} onChange={setPhi} />
        <Field label="γ" unit="kN/m³" value={gamma} onChange={setGamma} />
        <Field label="Depth z" unit="m" value={z} onChange={setZ} />
        <Field label="Slope β" unit="°" value={beta} onChange={setBeta} />
        {seepage && <Field label="γsat" unit="kN/m³" value={gammaSat} onChange={setGammaSat} />}
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={seepage} onChange={(e) => setSeepage(e.target.checked)} />
        <span>Seepage parallel to slope (water table at surface)</span>
      </label>
      <div className="mt-2">
        <Out label="Factor of safety" value={f2(fs)} />
        <Out label="Assessment" value={fs >= 1.5 ? '✓ Stable (FS ≥ 1.5)' : fs >= 1 ? '⚠ Marginal' : '✗ Unstable'} />
      </div>
    </Card>
  )
}

export default function Geotech() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Geotechnical</p>
      <h1 className="mt-1 text-2xl font-bold text-[#0056b3]">Geotechnical toolkit</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">
        Classic soil-mechanics checks — Rankine lateral earth pressure, shallow-foundation bearing
        capacity, and infinite-slope stability. All formulas are closed-form and cross-checked against
        the <a href="/validation" className="text-[#0056b3] underline">validation benchmarks</a>.
      </p>
      <div className="mt-6 space-y-5">
        <EarthPressure />
        <Bearing />
        <Slope />
      </div>
      <p className="mt-6 text-[11px] text-slate-400">
        Bearing factors: Nq, Nc per Prandtl/Reissner; Nγ per Vesić (2(Nq+1)tanφ). Shape factors per Meyerhof.
        Use engineering judgement and site-specific investigation; these are preliminary checks.
      </p>
    </main>
  )
}
