import { useState } from 'react'
import { activeThrust, passiveThrust, infiniteSlopeFS } from '../engine/geotech'
import {
  generalBearingCapacity, compareMethods, BEARING_METHOD_LABEL, type BearingMethod,
} from '../engine/bearingGeneral'
import { ReportControls } from '../components/ReportControls'
import { SoilLayerPicker } from '../components/SoilLayerPicker'

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
      <p className="mb-3 text-[11px] text-slate-500">{sub}</p>
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
  const [gammaSat, setGammaSat] = useState(20)
  const [B, setB] = useState(2)
  const [L, setL] = useState(2)
  const [strip, setStrip] = useState(false)
  const [Df, setDf] = useState(1.5)
  const [dw, setDw] = useState<number | ''>('')
  const [eB, setEB] = useState(0)
  const [incl, setIncl] = useState(0)
  const [method, setMethod] = useState<BearingMethod>('vesic')
  const [FS, setFS] = useState(3)

  const input = {
    c, phiDeg: phi, gamma, gammaSat, B, L: strip ? Infinity : L, Df,
    waterTable: dw === '' ? undefined : dw,
    eB, loadInclination: incl, FS,
  }

  let r: ReturnType<typeof generalBearingCapacity> | null = null
  let error: string | null = null
  try {
    r = generalBearingCapacity({ ...input, method })
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }
  const all = r ? compareMethods(input) : null

  return (
    <Card
      title="Bearing capacity — general equation"
      sub="qu = c·Nc·sc·dc·ic + q·Nq·sq·dq·iq + ½·γ′·B′·Nγ·sγ·dγ·iγ.  Method chosen explicitly; the three differ on Nγ and on their shape/depth factors.">
      <div className="mb-3">
        <SoilLayerPicker
          want={['c', 'phiDeg', 'gamma', 'gammaSat']}
          onApply={(f) => {
            if (f.c != null) setC(f.c)
            if (f.phiDeg != null) setPhi(f.phiDeg)
            if (f.gamma != null) setGamma(f.gamma)
            if (f.gammaSat != null) setGammaSat(f.gammaSat)
          }} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Cohesion c" unit="kPa" value={c} onChange={setC} />
        <Field label="φ" unit="°" value={phi} onChange={setPhi} />
        <Field label="γ" unit="kN/m³" value={gamma} onChange={setGamma} />
        <Field label="γsat" unit="kN/m³" value={gammaSat} onChange={setGammaSat} />
        <Field label="Width B" unit="m" value={B} onChange={setB} />
        {!strip && <Field label="Length L" unit="m" value={L} onChange={setL} />}
        <Field label="Depth Df" unit="m" value={Df} onChange={setDf} />
        <label className="flex flex-col text-sm">
          <span className="mb-1 font-medium text-slate-600">Water table (m)</span>
          <input type="number" step="0.5" value={dw} placeholder="none"
            onChange={(e) => setDw(e.target.value === '' ? '' : parseFloat(e.target.value))}
            className="rounded-md border border-slate-300 px-2.5 py-1.5" />
        </label>
        <Field label="Eccentricity eB" unit="m" value={eB} onChange={setEB} />
        <Field label="Load inclination β" unit="°" value={incl} onChange={setIncl} />
        <label className="flex flex-col text-sm">
          <span className="mb-1 font-medium text-slate-600">Method</span>
          <select value={method} onChange={(e) => setMethod(e.target.value as BearingMethod)}
            className="rounded-md border border-slate-300 px-2.5 py-1.5">
            {(['meyerhof', 'hansen', 'vesic'] as BearingMethod[]).map((m) => (
              <option key={m} value={m}>{BEARING_METHOD_LABEL[m]}</option>
            ))}
          </select>
        </label>
        <Field label="FS" value={FS} onChange={setFS} />
      </div>

      <label className="mt-2 flex items-center gap-2 text-[12px] text-slate-600">
        <input type="checkbox" checked={strip} onChange={(e) => setStrip(e.target.checked)} />
        Strip footing (L → ∞)
      </label>

      {error && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">{error}</p>
      )}

      {r && (
        <>
          <div className="mt-3">
            <Out label="Nc / Nq / Nγ" value={`${f2(r.Nc)} / ${f2(r.Nq)} / ${f2(r.Ngamma)}`} />
            <Out label="Shape sc / sq / sγ" value={`${f2(r.sc)} / ${f2(r.sq)} / ${f2(r.sgamma)}`} />
            <Out label="Depth dc / dq / dγ" value={`${f2(r.dc)} / ${f2(r.dq)} / ${f2(r.dgamma)}`} />
            <Out label="Inclination ic / iq / iγ" value={`${f2(r.ic)} / ${f2(r.iq)} / ${f2(r.igamma)}`} />
            <Out label="Effective B′" value={`${f2(r.effectiveB)} m`} />
            <Out label="Surcharge q" value={`${f2(r.surcharge)} kPa`} />
            <Out label="γ in the Nγ term" value={`${f2(r.gammaEffective)} kN/m³`} />
            <Out label="Ultimate qult" value={`${f2(r.qult)} kPa`} />
            <Out label="Net ultimate qnet" value={`${f2(r.qnet)} kPa`} />
            <Out label={`Allowable NET (FS ${f2(FS)})`} value={`${f2(r.qallowNet)} kPa`} />
            <Out label="Allowable gross" value={`${f2(r.qallowGross)} kPa`} />
          </div>

          {all && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-1 text-[11px] font-semibold text-slate-700">All three methods, same footing</p>
              <div className="flex flex-wrap gap-3 text-[12px]">
                {(['meyerhof', 'hansen', 'vesic'] as BearingMethod[]).map((m) => (
                  <span key={m} className={`font-mono ${m === method ? 'font-bold text-[#0056b3]' : 'text-slate-600'}`}>
                    {BEARING_METHOD_LABEL[m].split(' ')[0]}: {f2(all[m].qult)} kPa
                  </span>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                They disagree by design. A bearing pressure quoted without naming its method is not reproducible.
              </p>
            </div>
          )}

          <ul className="mt-3 space-y-1">
            {r.notes.map((n, k) => (
              <li key={k} className="text-[11px] text-amber-900">{n}</li>
            ))}
          </ul>
        </>
      )}
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
      <div className="mb-3">
        <SoilLayerPicker
          want={['c', 'phiDeg', 'gamma', 'gammaSat']}
          onApply={(f) => {
            if (f.c != null) setC(f.c)
            if (f.phiDeg != null) setPhi(f.phiDeg)
            if (f.gamma != null) setGamma(f.gamma)
            if (f.gammaSat != null) setGammaSat(f.gammaSat)
          }} />
      </div>
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
    <main className="mx-auto max-w-[1400px] px-5 py-10">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Geotechnical</p>
      <h1 className="mt-1 text-2xl font-bold text-[#0056b3]">Geotechnical toolkit</h1>
      <ReportControls title="Geotechnical Report" badges={['NSCP 2015']} />
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
      <p className="mt-6 text-[11px] text-slate-500">
        Bearing factors: Nq, Nc per Prandtl/Reissner; Nγ per Vesić (2(Nq+1)tanφ). Shape factors per Meyerhof.
        Use engineering judgement and site-specific investigation; these are preliminary checks.
      </p>
    </main>
  )
}
