import { useMemo, useState } from 'react'
import { ReportControls } from '../components/ReportControls'
import {
  consolidationSettlement, elasticSettlement, schmertmannSettlement,
  effectiveStress, stressUnderRect, stress2to1,
  timeToConsolidation, consolidationAfter, drainagePath,
  type SoilLayer,
} from '../engine/settlement'
import { buildSettlementSolution } from '../lib/settlementSolution'
import { WorkedSolution } from '../components/WorkedSolution'
import { SoilProfile } from '../components/SoilProfile'

function num(v: string, d = 0): number { const n = parseFloat(v); return Number.isFinite(n) ? n : d }
const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—')
const f1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '—')
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

function Out({ label, value, ok, sub }: { label: string; value: string; ok?: boolean; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between border-t border-slate-100 py-1 text-sm">
      <span className="text-slate-500">{label}{sub && <span className="ml-1 text-[11px] text-slate-400">{sub}</span>}</span>
      <span className={`font-mono font-medium ${ok === undefined ? 'text-slate-800' : ok ? 'text-emerald-600' : 'text-red-600'}`}>{value}</span>
    </div>
  )
}

/** Stress-bulb profile: Δσ against depth, Boussinesq vs the 2:1 hand rule. */
function StressProfile({ q, B, L, Df, zMax }: { q: number; B: number; L: number; Df: number; zMax: number }) {
  const W = 460, H = 260, padL = 46, padR = 90, padT = 12, padB = 34
  const n = 60
  const pts = Array.from({ length: n + 1 }, (_, k) => {
    const z = (zMax * k) / n
    return { z, b: stressUnderRect(q, B, L, z), t: stress2to1(q, B, L, z) }
  })
  const sMax = Math.max(q, 1e-9)
  const X = (s: number) => padL + ((W - padL - padR) * s) / sMax
  const Y = (z: number) => padT + ((H - padT - padB) * z) / Math.max(zMax, 1e-9)
  const path = (key: 'b' | 't') =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[key]).toFixed(1)},${Y(p.z).toFixed(1)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg border border-slate-200 bg-white" style={{ maxHeight: 280 }}>
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="#475569" strokeWidth={1.2} />
      <line x1={padL} y1={padT} x2={W - padR} y2={padT} stroke="#475569" strokeWidth={1.2} />
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <text x={X(sMax * f)} y={padT - 3} fontSize={9} fill="#64748b" textAnchor="middle">{f0(sMax * f)}</text>
          <line x1={X(sMax * f)} y1={padT} x2={X(sMax * f)} y2={H - padB} stroke="#e2e8f0" strokeWidth={0.7} />
        </g>
      ))}
      {[0, 0.5, 1].map((f) => (
        <text key={`z${f}`} x={padL - 5} y={Y(zMax * f) + 3} fontSize={9} fill="#64748b" textAnchor="end">{f1(zMax * f)}</text>
      ))}
      {Df > 0 && Df < zMax && (
        <g>
          <line x1={padL} y1={Y(Df)} x2={W - padR} y2={Y(Df)} stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 3" />
          <text x={W - padR + 4} y={Y(Df) + 3} fontSize={8.5} fill="#b45309">founding level</text>
        </g>
      )}
      <path d={path('t')} fill="none" stroke="#94a3b8" strokeWidth={1.6} strokeDasharray="5 3" />
      <path d={path('b')} fill="none" stroke="#0056b3" strokeWidth={2} />
      <g fontSize={9}>
        <rect x={W - padR + 4} y={padT + 10} width={10} height={2.5} fill="#0056b3" />
        <text x={W - padR + 18} y={padT + 15} fill="#334155">Boussinesq</text>
        <rect x={W - padR + 4} y={padT + 26} width={10} height={2.5} fill="#94a3b8" />
        <text x={W - padR + 18} y={padT + 31} fill="#334155">2:1 spread</text>
      </g>
      <text x={(padL + W - padR) / 2} y={H - 6} fontSize={9.5} fill="#334155" textAnchor="middle" fontWeight={700}>
        Δσ (kPa)
      </text>
      <text x={11} y={H / 2} fontSize={9.5} fill="#334155" textAnchor="middle" fontWeight={700}
        transform={`rotate(-90 11 ${H / 2})`}>depth below base (m)</text>
    </svg>
  )
}

const LAYER_DEFAULTS: SoilLayer[] = [
  { name: 'Sand fill', H: 3, gamma: 18, gammaSat: 20 },
  { name: 'Soft clay', H: 6, gamma: 17, gammaSat: 18, e0: 1.1, Cc: 0.35, cv: 1.5, sigmaP: 90 },
  { name: 'Stiff clay', H: 5, gamma: 19, gammaSat: 20, e0: 0.7, Cc: 0.18, cv: 4, sigmaP: 300 },
]

export default function Settlement() {
  const [q, setQ] = useState(120)
  const [B, setB] = useState(2.5)
  const [L, setL] = useState(3.5)
  const [Df, setDf] = useState(1.5)
  const [wt, setWt] = useState(3)
  const [Es, setEs] = useState(25000)
  const [nu, setNu] = useState(0.3)
  const [years, setYears] = useState(10)
  const [layers, setLayers] = useState<SoilLayer[]>(LAYER_DEFAULTS)

  const setLayer = (i: number, patch: Partial<SoilLayer>) =>
    setLayers((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)))

  const cons = useMemo(
    () => consolidationSettlement({ layers, q, B, L, Df, waterTable: wt, slices: 20 }),
    [layers, q, B, L, Df, wt],
  )
  const elastic = useMemo(() => elasticSettlement({ q, B, L, Es, nu }), [q, B, L, Es, nu])
  const schmert = useMemo(() => schmertmannSettlement({
    dp: q, B, L, sigma0: effectiveStress(layers, Df, wt), gamma: layers[0]?.gamma ?? 18,
    layers: Array.from({ length: 40 }, () => ({ H: 0.2, Es })), years,
  }), [q, B, L, Df, wt, layers, Es, years])

  const totalDepth = layers.reduce((a, l) => a + l.H, 0)
  const total = elastic + cons.total
  // the layer that dominates primary consolidation drives the time estimate
  const govLayer = cons.layers.reduce(
    (best, l, i) => (l.settlement > (cons.layers[best]?.settlement ?? -1) ? i : best), 0)
  const govSoil = layers[govLayer]
  const t90 = govSoil ? timeToConsolidation(govSoil, 0.9) : Infinity
  const Uat = govSoil ? consolidationAfter(govSoil, years) : 0

  // Settlement is a PREDICTION, not a code check — there is no capacity to
  // divide by — so this report carries no pass/fail. The verdict line states
  // the total instead. A 25 mm serviceability limit is common but is a project
  // decision, not something to assert on the engineer's behalf.
  const solution = buildSettlementSolution(
    { q, B, L, Df, waterTable: wt, Es, nu, years, layers },
    { cons, elastic, schmert, total, govLayer, t90, Uat, sigma0: effectiveStress(layers, Df, wt) },
  )

  const report = {
    docCode: 'G-ST',
    ok: true,
    governing: `Total ${f1(total)} mm — ${f1(elastic)} immediate + ${f1(cons.total)} consolidation`,
    stats: [
      { label: 'Total settlement', value: f1(total), unit: 'mm' },
      { label: 'Immediate (elastic)', value: f1(elastic), unit: 'mm' },
      { label: 'Primary consolidation', value: f1(cons.total), unit: 'mm' },
    ],
    data: [
      ['Applied pressure q', `${f1(q)} kPa`],
      ['Footing B × L', `${f2(B)} × ${f2(L)} m`],
      ['Founding depth Df', `${f2(Df)} m`],
      ['Water table', `${f2(wt)} m`],
      ['Elastic modulus Es', `${f0(Es)} kPa`],
      ["Poisson's ratio ν", f2(nu)],
      ['Profile depth', `${f2(totalDepth)} m in ${layers.length} layers`],
      ['Elastic settlement', `${f1(elastic)} mm`],
      ['Consolidation settlement', `${f1(cons.total)} mm`],
      [`Schmertmann at ${years} y`, `${f1(schmert.settlement)} mm (C₁ ${f2(schmert.C1)}, C₂ ${f2(schmert.C2)})`],
      ['Governing layer', `#${govLayer + 1} — ${f1(cons.layers[govLayer]?.settlement ?? 0)} mm`],
      ['t₉₀ (governing layer)', Number.isFinite(t90) ? `${f2(t90)} years` : '—'],
      ['U at ' + years + ' years', `${f0(Uat * 100)} %`],
    ] as [string, string][],
    steps: solution,
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Geotechnical</p>
      <h1 className="mt-1 text-2xl font-bold text-[#0056b3]">Foundation settlement</h1>
      <ReportControls title="Foundation Settlement" badges={['Boussinesq', 'Terzaghi', 'Schmertmann']} report={report} />
      <p className="mt-2 text-sm text-slate-600">
        Immediate (elastic and Schmertmann) plus primary consolidation settlement of a rectangular footing on a
        layered profile. Stress increase by Boussinesq; consolidation layer by layer with the overconsolidated
        branch handled separately, so a stiff crust is not charged virgin compression it will never see.
      </p>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Footing &amp; groundwater</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Bearing pressure q" unit="kPa" value={q} onChange={setQ} />
          <Field label="Width B" unit="m" value={B} onChange={setB} step="0.1" />
          <Field label="Length L" unit="m" value={L} onChange={setL} step="0.1" />
          <Field label="Founding depth Df" unit="m" value={Df} onChange={setDf} step="0.1" />
          <Field label="Water table" unit="m" value={wt} onChange={setWt} step="0.5" />
          <Field label="Soil modulus Es" unit="kPa" value={Es} onChange={setEs} step="1000" />
          <Field label="Poisson ν" value={nu} onChange={setNu} step="0.05" />
          <Field label="Time horizon" unit="yr" value={years} onChange={setYears} step="1" />
        </div>
      </section>

      <section data-pdf-drawing className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm
        [background-image:linear-gradient(#f0eee7_1px,transparent_1px),linear-gradient(90deg,#f0eee7_1px,transparent_1px)] [background-size:22px_22px]">
        <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Soil profile</h2>
        <SoilProfile
          layers={cons.layers.map((l, i) => ({
            name: l.name || `Layer ${i + 1}`, zTop: l.zTop, H: l.H,
            dSigma: l.dSigma, sigma0: l.sigma0, settlement: l.settlement,
          }))}
          Df={Df} B={B} waterTable={wt} q={q} governing={govLayer} />
      </section>

      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Soil profile</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-[12px]">
            <thead className="text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="py-1 pr-2 text-left">Layer</th>
                <th className="py-1 pr-2">H (m)</th><th className="py-1 pr-2">γ</th><th className="py-1 pr-2">γsat</th>
                <th className="py-1 pr-2">e₀</th><th className="py-1 pr-2">Cc</th>
                <th className="py-1 pr-2">σ′p (kPa)</th><th className="py-1 pr-2">cv (m²/yr)</th>
              </tr>
            </thead>
            <tbody>
              {layers.map((l, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-1 pr-2 text-left text-slate-700">{l.name ?? `Layer ${i + 1}`}</td>
                  {([
                    ['H', l.H], ['gamma', l.gamma], ['gammaSat', l.gammaSat ?? l.gamma],
                    ['e0', l.e0 ?? 0], ['Cc', l.Cc ?? 0], ['sigmaP', l.sigmaP ?? 0], ['cv', l.cv ?? 0],
                  ] as const).map(([key, v]) => (
                    <td key={key} className="py-0.5 pr-2">
                      <input type="number" step="any" value={v}
                        onChange={(e) => setLayer(i, { [key]: num(e.target.value) } as Partial<SoilLayer>)}
                        className="w-16 rounded border border-slate-200 px-1 py-0.5 text-right font-mono" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Leave e₀ or Cc at zero for a layer that does not consolidate (granular fill, rock) — it is then carried
          for overburden only. σ′p at zero means normally consolidated. Cr defaults to Cc/6 unless you set it.
        </p>
      </section>

      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Stress increase below the footing</h2>
        <StressProfile q={q} B={B} L={L} Df={Df} zMax={Math.max(totalDepth, 2 * B)} />
        <p className="mt-2 text-[11px] text-slate-500">
          Boussinesq at the footing CENTRE, where the stress and therefore the settlement peak. The 2:1 rule is the
          average over the spread area, so it sits below the centre value and the two converge with depth.
        </p>
      </section>

      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-2 text-[1.05rem] font-bold text-[#0056b3]">Settlement</h2>
        <Out label="Immediate — elastic" value={`${f1(elastic)} mm`} sub="q·B·(1−ν²)·If/Es" />
        <Out label="Immediate — Schmertmann" value={`${f1(schmert.settlement)} mm`}
          sub={`C₁ ${f2(schmert.C1)} · C₂ ${f2(schmert.C2)} · Izp ${f2(schmert.Izp)}`} />
        <Out label="Primary consolidation" value={`${f1(cons.total)} mm`} sub={`${layers.length} layers`} />
        <Out label="Total (elastic + consolidation)" value={`${f1(total)} mm`}
          ok={total <= 25} sub="25 mm is the usual limit for an isolated footing" />
        <Out label={`Degree of consolidation at ${f0(years)} yr`} value={`${f0(Uat * 100)} %`}
          sub={govSoil ? `governed by ${govSoil.name ?? 'the thickest contributor'}` : undefined} />
        <Out label="Time to 90% consolidation"
          value={Number.isFinite(t90) ? `${f1(t90)} yr` : 'cv not given'}
          sub={govSoil ? `drainage path ${f2(drainagePath(govSoil))} m` : undefined} />
      </section>

      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-2 text-[1.05rem] font-bold text-[#0056b3]">Consolidation by layer</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-[12px]">
            <thead className="text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="py-1 pr-3 text-left">Layer</th><th className="py-1 pr-3">z mid (m)</th>
                <th className="py-1 pr-3">σ′₀ (kPa)</th><th className="py-1 pr-3">Δσ (kPa)</th>
                <th className="py-1 pr-3">σ′p (kPa)</th><th className="py-1 pr-3 text-left">Branch</th>
                <th className="py-1 pr-3">Sc (mm)</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {cons.layers.map((l) => (
                <tr key={l.name} className="border-b border-slate-100">
                  <td className="py-0.5 pr-3 text-left">{l.name}</td>
                  <td className="py-0.5 pr-3">{f2(l.zMid)}</td>
                  <td className="py-0.5 pr-3">{f1(l.sigma0)}</td>
                  <td className="py-0.5 pr-3">{f1(l.dSigma)}</td>
                  <td className="py-0.5 pr-3">{f1(l.sigmaP)}</td>
                  <td className={`py-0.5 pr-3 text-left ${l.branch === 'none' ? 'text-slate-400' : 'text-slate-600'}`}>
                    {l.branch}
                  </td>
                  <td className="py-0.5 pr-3 font-semibold">{f1(l.settlement)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-slate-500">
          Sc = Cc·H/(1+e₀)·log₁₀(σ′f/σ′₀) on the virgin branch, Cr in place of Cc while σ′f stays below σ′p, and
          both terms when the increment crosses σ′p. Each layer is sliced 20 ways so Δσ is integrated rather than
          sampled at mid-height. Time factors are the standard closed-form fits to Terzaghi&rsquo;s series, good to
          about 1% — not the series itself.
        </p>
      </section>
      {/* The step-by-step already existed and only ever reached the PDF. */}
      <div className="mt-5">
        <WorkedSolution steps={solution} title="Calculation report — worked solution" />
      </div>
    </main>
  )
}
