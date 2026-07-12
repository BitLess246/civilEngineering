import { useMemo, useState } from 'react'
import {
  nscpSeismicParams, baseShearCoeff, STRUCTURAL_SYSTEMS,
  type SoilProfile, type SeismicSource, type SeismicZone, type Occupancy,
} from '../engine/nscpSeismic'

const f3 = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '—')

function Choice<T extends string | number>({ value, set, options }: {
  value: T; set: (v: T) => void; options: { v: T; label: string; sub?: string }[]
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options.map((o) => (
        <button key={String(o.v)} type="button" onClick={() => set(o.v)}
          className={`rounded-lg border px-3 py-2 text-left text-sm transition ${value === o.v
            ? 'border-[#0056b3] bg-blue-50 font-semibold text-[#0056b3]'
            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}>
          {o.label}{o.sub ? <span className="block text-[11px] font-normal text-slate-500">{o.sub}</span> : null}
        </button>
      ))}
    </div>
  )
}

export default function SeismicWizard() {
  const [zone, setZone] = useState<SeismicZone>(4)
  const [soil, setSoil] = useState<SoilProfile>('SD')
  const [source, setSource] = useState<SeismicSource>('B')
  const [distance, setDistance] = useState(10)
  const [occupancy, setOccupancy] = useState<Occupancy>('standard')
  const [systemId, setSystemId] = useState('smrf-concrete')
  const [T, setT] = useState(0.5)
  const [step, setStep] = useState(0)

  const R = STRUCTURAL_SYSTEMS.find((s) => s.id === systemId)!.R
  const params = useMemo(
    () => nscpSeismicParams({ zone, soil, occupancy, R, source, distanceKm: distance }),
    [zone, soil, occupancy, R, source, distance],
  )
  const cs = useMemo(
    () => baseShearCoeff({ Ca: params.Ca, Cv: params.Cv, I: params.I, R: params.R, T, Z: params.Z, Nv: params.Nv }),
    [params, T],
  )

  // Build the step list (near-source step only for Zone 4).
  const steps = [
    { key: 'zone', label: 'Seismic zone' },
    { key: 'soil', label: 'Soil profile' },
    ...(zone === 4 ? [{ key: 'source', label: 'Near-source' }] : []),
    { key: 'occupancy', label: 'Occupancy' },
    { key: 'system', label: 'Structural system' },
    { key: 'result', label: 'Period & result' },
  ]
  const cur = steps[Math.min(step, steps.length - 1)]

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Structural</p>
      <h1 className="mt-1 text-2xl font-bold text-[#0056b3]">NSCP 208 Seismic Wizard</h1>
      <p className="mt-2 text-sm text-slate-600">
        Walk through the NSCP 2015 §208 static lateral-force tables — zone, soil, near-source, occupancy and
        structural system — to get Ca, Cv, I, R and the design base-shear coefficient Cs = V/W.
      </p>

      {/* stepper */}
      <div className="mt-5 flex flex-wrap gap-1.5">
        {steps.map((s, i) => (
          <button key={s.key} type="button" onClick={() => setStep(i)}
            className={`rounded-full px-3 py-1 text-[11px] font-medium ${i === step
              ? 'bg-[#0056b3] text-white' : i < step ? 'bg-blue-100 text-[#0056b3]' : 'bg-slate-100 text-slate-500'}`}>
            {i + 1}. {s.label}
          </button>
        ))}
      </div>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {cur.key === 'zone' && (
          <>
            <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Seismic zone (§208.4.4.1)</h2>
            <Choice<SeismicZone> value={zone} set={setZone} options={[
              { v: 2, label: 'Zone 2', sub: 'Z = 0.20 — Palawan, Sulu, Tawi-Tawi' },
              { v: 4, label: 'Zone 4', sub: 'Z = 0.40 — most of the Philippines' },
            ]} />
          </>
        )}
        {cur.key === 'soil' && (
          <>
            <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Soil profile type (Table 208-2)</h2>
            <Choice<SoilProfile> value={soil} set={setSoil} options={[
              { v: 'SA', label: 'SA — Hard rock' },
              { v: 'SB', label: 'SB — Rock' },
              { v: 'SC', label: 'SC — Very dense soil / soft rock' },
              { v: 'SD', label: 'SD — Stiff soil (default)' },
              { v: 'SE', label: 'SE — Soft soil' },
            ]} />
          </>
        )}
        {cur.key === 'source' && (
          <>
            <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Near-source (Tables 208-3…208-5)</h2>
            <Choice<SeismicSource> value={source} set={setSource} options={[
              { v: 'A', label: 'Type A', sub: 'M ≥ 7.0, high slip rate' },
              { v: 'B', label: 'Type B', sub: 'most active faults' },
              { v: 'C', label: 'Type C', sub: 'M < 6.5, low slip rate' },
            ]} />
            <label className="mt-3 flex flex-col text-sm">
              <span className="mb-1 font-medium text-slate-600">Closest distance to the source (km)</span>
              <input type="number" step="0.5" value={distance}
                onChange={(e) => setDistance(parseFloat(e.target.value) || 0)}
                className="w-40 rounded-md border border-slate-300 px-2.5 py-1.5" />
            </label>
            <p className="mt-2 text-[11px] text-slate-500">Na = {f3(params.Na)}, Nv = {f3(params.Nv)}</p>
          </>
        )}
        {cur.key === 'occupancy' && (
          <>
            <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Occupancy category (Table 208-1)</h2>
            <Choice<Occupancy> value={occupancy} set={setOccupancy} options={[
              { v: 'essential', label: 'Essential facility', sub: 'I = 1.50 — hospitals, fire/police' },
              { v: 'hazardous', label: 'Hazardous facility', sub: 'I = 1.50' },
              { v: 'special', label: 'Special occupancy', sub: 'I = 1.25 — assembly > 300' },
              { v: 'standard', label: 'Standard occupancy', sub: 'I = 1.00' },
            ]} />
          </>
        )}
        {cur.key === 'system' && (
          <>
            <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Structural system (Table 208-11)</h2>
            <select value={systemId} onChange={(e) => setSystemId(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm">
              {STRUCTURAL_SYSTEMS.map((s) => <option key={s.id} value={s.id}>{s.name} — R = {s.R}</option>)}
            </select>
          </>
        )}
        {cur.key === 'result' && (
          <>
            <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Fundamental period &amp; base shear</h2>
            <label className="flex flex-col text-sm">
              <span className="mb-1 font-medium text-slate-600">Fundamental period T (s) — Method A: Ct·hn^¾</span>
              <input type="number" step="0.05" value={T}
                onChange={(e) => setT(parseFloat(e.target.value) || 0.01)}
                className="w-40 rounded-md border border-slate-300 px-2.5 py-1.5" />
            </label>
          </>
        )}

        <div className="mt-5 flex justify-between">
          <button type="button" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-semibold text-slate-600 disabled:opacity-40">Back</button>
          <button type="button" disabled={step >= steps.length - 1} onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
            className="rounded-lg bg-[#0056b3] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40">Next</button>
        </div>
      </section>

      {/* live results summary */}
      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-2 text-[1.05rem] font-bold text-[#0056b3]">Seismic parameters</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
          {[['Z', params.Z], ['Na', params.Na], ['Nv', params.Nv], ['Ca', params.Ca],
            ['Cv', params.Cv], ['I', params.I], ['R', params.R], ['T (s)', T]].map(([k, v]) => (
            <div key={k as string} className="flex justify-between border-b border-slate-100 py-1">
              <span className="text-slate-500">{k}</span><span className="font-mono font-medium">{f3(v as number)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg bg-blue-50 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-[#0056b3]">Design base-shear coefficient Cs = V/W</span>
            <span className="font-mono text-lg font-bold text-[#0056b3]">{f3(cs.Cs)}</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Governing: <b>{cs.governs}</b> · basic {f3(cs.Csraw)} · cap 2.5Ca·I/R {f3(cs.Csmax)} ·
            floor 0.11Ca·I {f3(cs.Csmin)}{params.Z >= 0.4 ? ` · Zone-4 0.8Z·Nv·I/R ${f3(cs.Cszone4)}` : ''}
          </p>
        </div>
        <p className="mt-2 text-[10px] text-slate-500">
          V = Cs·W (§208.5.2.1). Feed Ca, Cv, I, R into the 3D model space seismic generator for the
          full storey-force distribution. Verify the soil profile with a geotechnical investigation.
        </p>
      </section>
    </main>
  )
}
