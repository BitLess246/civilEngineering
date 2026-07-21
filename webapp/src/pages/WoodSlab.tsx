import { useState } from 'react'
import { designWoodSlab, type DeckMaterial, type SlabSupport } from '../engine/woodSlab'
import { speciesList, gradesOf, resolveWoodSpecies } from '../engine/woodDesign'
import type { LoadDuration } from '../engine/woodDesign'
import { ReportControls } from '../components/ReportControls'

function num(v: string, d = 0): number { const n = parseFloat(v); return Number.isFinite(n) ? n : d }
const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—')
const f0 = (n: number) => (Number.isFinite(n) ? Math.round(n).toString() : '—')
const f3 = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '—')

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

/** One flexural member's utilisation block (deck or joist). */
function CheckCard({ title, sub, c }: {
  title: string; sub: string
  c: ReturnType<typeof designWoodSlab>['joist']
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-slate-700">{title}</h3>
        <span className={`rounded px-2 py-0.5 text-xs font-bold ${c.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {c.ok ? 'PASS' : 'FAIL'} · {f2(c.ratio)}
        </span>
      </div>
      <p className="mb-1 text-[11px] text-slate-500">{sub}</p>
      <Out label="Line load w" value={`${f2(c.w)} kN/m`} />
      <Out label="Moment M / Shear V" value={`${f3(c.M)} kN·m / ${f2(c.V)} kN`} />
      <Out label="Bending f_b / F′b" value={`${f2(c.fb)} / ${f2(c.FbPrime)} MPa`} ok={c.bendingRatio <= 1} />
      <Out label="Shear f_v / F′v" value={`${f2(c.fv)} / ${f2(c.FvPrime)} MPa`} ok={c.shearRatio <= 1} />
      <Out label="Δ live / L/360" value={`${f2(c.deflLive)} / ${f2(c.deflLiveAllow)} mm`} ok={c.deflLiveRatio <= 1} />
      <Out label="Δ total / L/240" value={`${f2(c.deflTotal)} / ${f2(c.deflTotalAllow)} mm`} ok={c.deflTotalRatio <= 1} />
    </div>
  )
}

export default function WoodSlab() {
  // plan
  const [Lx, setLx] = useState(3.0)
  const [Ly, setLy] = useState(3.6)
  // joist material
  const [species, setSpecies] = useState('DFL')
  const [grade, setGrade] = useState('2')
  // joist section
  const [joistB, setJoistB] = useState(50)
  const [joistD, setJoistD] = useState(200)
  const [joistSpacing, setJoistSpacing] = useState(400)
  const [joistSupport, setJoistSupport] = useState<SlabSupport>('simple')
  // deck
  const [deckMaterial, setDeckMaterial] = useState<DeckMaterial>('plank')
  const [deckThickness, setDeckThickness] = useState(25)
  const [deckWidth, setDeckWidth] = useState(140)
  const [deckSupport, setDeckSupport] = useState<SlabSupport>('continuous')
  // loads
  const [deadKpa, setDeadKpa] = useState(0.5)
  const [liveKpa, setLiveKpa] = useState(1.9)
  // options
  const [duration, setDuration] = useState<LoadDuration>('ten-year')
  const [wet, setWet] = useState(false)

  const sp = resolveWoodSpecies(species, grade)
  const joistRef = sp?.ref
  const speciesOptions = speciesList()
  const gradeOptions = gradesOf(species)

  const r = joistRef ? designWoodSlab({
    Lx, Ly, joistRef, joistKind: sp!.kind, joistB, joistD, joistSpacing, joistSupport,
    deckMaterial, deckThickness, deckWidth, deckSupport,
    deadKpa, liveKpa, opts: { duration, wet },
  }) : null

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Structural · Timber</p>
      <h1 className="mt-1 text-2xl font-bold text-[#0056b3]">Wood slab — deck on joists</h1>
      <ReportControls title="Wood Slab Design Report" badges={['NDS 2018 §3', 'NSCP 2015 §6']} />
      <p className="mt-2 text-sm text-slate-600">
        ASD design of a wood floor slab: decking (planks or bamboo slats) spanning between repetitive
        joists. Both are checked for bending, horizontal shear and service deflection (L/360 live,
        L/240 total); the joist gets the repetitive-member factor Cr and continuous lateral support
        from the decking (C_L = 1). Bamboo values are preliminary (ISO 22156 / published).
      </p>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Plan &amp; loads</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Lx (joist span)" unit="m" value={Lx} onChange={setLx} />
          <Field label="Ly (joists repeat)" unit="m" value={Ly} onChange={setLy} />
          <Field label="Superimposed dead" unit="kPa" value={deadKpa} onChange={setDeadKpa} />
          <Field label="Live load" unit="kPa" value={liveKpa} onChange={setLiveKpa} />
        </div>

        <h2 className="mb-3 mt-5 text-[1.05rem] font-bold text-[#0056b3]">Joists</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="flex flex-col text-sm">
            <span className="mb-1 font-medium text-slate-600">Species</span>
            <select value={species} onChange={(e) => { setSpecies(e.target.value); const g = gradesOf(e.target.value); if (g.length) setGrade(g[0].grade) }}
              className="rounded-md border border-slate-300 px-2.5 py-1.5">
              {speciesOptions.map((s) => <option key={s.species} value={s.species}>{s.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col text-sm">
            <span className="mb-1 font-medium text-slate-600">Grade</span>
            <select value={grade} onChange={(e) => setGrade(e.target.value)}
              className="rounded-md border border-slate-300 px-2.5 py-1.5">
              {gradeOptions.map((g) => <option key={g.grade} value={g.grade}>{g.gradeLabel}</option>)}
            </select>
          </label>
          <Field label="Width b" unit="mm" value={joistB} onChange={setJoistB} />
          <Field label="Depth d" unit="mm" value={joistD} onChange={setJoistD} />
          <Field label="Spacing" unit="mm" value={joistSpacing} onChange={setJoistSpacing} />
          <label className="flex flex-col text-sm">
            <span className="mb-1 font-medium text-slate-600">Support</span>
            <select value={joistSupport} onChange={(e) => setJoistSupport(e.target.value as SlabSupport)}
              className="rounded-md border border-slate-300 px-2.5 py-1.5">
              <option value="simple">Simple span</option>
              <option value="continuous">Continuous (≥3)</option>
            </select>
          </label>
        </div>

        <h2 className="mb-3 mt-5 text-[1.05rem] font-bold text-[#0056b3]">Decking</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="flex flex-col text-sm">
            <span className="mb-1 font-medium text-slate-600">Material</span>
            <select value={deckMaterial} onChange={(e) => { const m = e.target.value as DeckMaterial; setDeckMaterial(m); setDeckWidth(m === 'bamboo-slat' ? 50 : 140) }}
              className="rounded-md border border-slate-300 px-2.5 py-1.5">
              <option value="plank">Plank (sawn)</option>
              <option value="bamboo-slat">Bamboo slat</option>
            </select>
          </label>
          <Field label="Thickness t" unit="mm" value={deckThickness} onChange={setDeckThickness} />
          <Field label="Board/slat width" unit="mm" value={deckWidth} onChange={setDeckWidth} />
          <label className="flex flex-col text-sm">
            <span className="mb-1 font-medium text-slate-600">Support</span>
            <select value={deckSupport} onChange={(e) => setDeckSupport(e.target.value as SlabSupport)}
              className="rounded-md border border-slate-300 px-2.5 py-1.5">
              <option value="continuous">Continuous (≥3)</option>
              <option value="simple">Simple span</option>
            </select>
          </label>
        </div>

        <h2 className="mb-3 mt-5 text-[1.05rem] font-bold text-[#0056b3]">Service conditions</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="flex flex-col text-sm">
            <span className="mb-1 font-medium text-slate-600">Load duration (C_D)</span>
            <select value={duration} onChange={(e) => setDuration(e.target.value as LoadDuration)}
              className="rounded-md border border-slate-300 px-2.5 py-1.5">
              <option value="permanent">Permanent (0.9)</option>
              <option value="ten-year">Occupancy live (1.0)</option>
              <option value="two-month">Snow (1.15)</option>
              <option value="seven-day">Construction (1.25)</option>
              <option value="ten-minute">Wind/seismic (1.6)</option>
            </select>
          </label>
          <label className="flex flex-col text-sm">
            <span className="mb-1 font-medium text-slate-600">Moisture</span>
            <select value={wet ? 'wet' : 'dry'} onChange={(e) => setWet(e.target.value === 'wet')}
              className="rounded-md border border-slate-300 px-2.5 py-1.5">
              <option value="dry">Dry (MC ≤ 19%)</option>
              <option value="wet">Wet service (C_M)</option>
            </select>
          </label>
        </div>
      </section>

      {r && (
        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[1.05rem] font-bold text-[#0056b3]">Results</h2>
            <span className={`rounded px-2.5 py-1 text-sm font-bold ${r.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {r.ok ? 'SLAB OK' : 'INADEQUATE'} · governing {f2(r.ratio)}
            </span>
          </div>
          <div className="mb-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Out label="Deck self-wt" value={`${f2(r.loads.deckSelfKpa)} kPa`} />
            <Out label="Joist self-wt" value={`${f2(r.loads.joistSelfKpa)} kPa`} />
            <Out label="Total pressure" value={`${f2(r.loads.totalKpa)} kPa`} />
            <Out label="Joists" value={`${f0(r.takeoff.joistCount)} @ ${f0(joistSpacing)}`} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <CheckCard title="Decking" sub={`spans the ${f0(joistSpacing)} mm joist spacing`} c={r.deck} />
            <CheckCard title="Joist" sub={`${f0(joistB)}×${f0(joistD)} over ${f2(Lx)} m`} c={r.joist} />
          </div>

          <h3 className="mb-1 mt-5 text-sm font-bold text-slate-700">Bill of materials</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-1 pr-3 font-medium">Item</th>
                  <th className="py-1 pr-3 font-medium">Qty</th>
                  <th className="py-1 font-medium">Board feet</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr className="border-b border-slate-100">
                  <td className="py-1 pr-3">Joists {f0(joistB)}×{f0(joistD)} ({sp?.label})</td>
                  <td className="py-1 pr-3">{f0(r.takeoff.joistCount)} pc · {f2(r.takeoff.joistLengthM)} m · {f3(r.takeoff.joistM3)} m³</td>
                  <td className="py-1">{f0(r.takeoff.joistBoardFeet)}</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-1 pr-3">Decking — {deckMaterial === 'bamboo-slat' ? 'bamboo slats' : 'planks'} ({f0(deckThickness)} mm)</td>
                  <td className="py-1 pr-3">
                    {f2(r.takeoff.deckAreaM2)} m² · {f3(r.takeoff.deckM3)} m³
                    {r.takeoff.bambooSlatCount != null ? ` · ${f0(r.takeoff.bambooSlatCount)} slats` : ''}
                  </td>
                  <td className="py-1">{f0(r.takeoff.deckBoardFeet)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-slate-500">
            Demands wL²/8 (simple) or wL²/10 (continuous ≥3 spans); deflection on the service modulus E′.
            Board feet = m³ × {`423.776`}. Verify joist-to-support bearing, fastener schedule and diaphragm
            action separately.
          </p>
        </section>
      )}
    </main>
  )
}
