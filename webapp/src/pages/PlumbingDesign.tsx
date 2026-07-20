import { useMemo, useState } from 'react'
import { FIXTURE_LIST, type FixtureCount, type Occupancy, totalWSFU, totalDFU } from '../engine/plumbingFixtures'
import { designWaterSupply, waterSupplySolution, HAZEN_C, type HunterSystem, type WaterSupplyInput } from '../engine/waterSupply'
import { designDrainage, drainageSolution } from '../engine/drainage'
import { designSepticTank, septicSolution } from '../engine/septicTank'
import { WorkedSolution } from '../components/WorkedSolution'
import { ReportControls } from '../components/ReportControls'

function num(v: string, d = 0): number { const n = parseFloat(v); return Number.isFinite(n) ? n : d }
const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—')
const f1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '—')
const f0 = (n: number) => (Number.isFinite(n) ? Math.round(n).toString() : '—')

function Field({ label, value, onChange, unit, step = 'any', hint }: {
  label: string; value: number; onChange: (v: number) => void; unit?: string; step?: string; hint?: string
}) {
  return (
    <label className="flex flex-col text-sm">
      <span className="mb-1 font-medium text-slate-600">{label}{unit ? ` (${unit})` : ''}</span>
      <input type="number" step={step} value={value} onChange={(e) => onChange(num(e.target.value))}
        className="rounded-md border border-slate-300 px-2.5 py-1.5" />
      {hint && <span className="mt-0.5 text-[10px] text-slate-400">{hint}</span>}
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

type Tab = 'supply' | 'drainage' | 'septic'

export default function PlumbingDesign() {
  const [tab, setTab] = useState<Tab>('supply')
  const [occ, setOcc] = useState<Occupancy>('private')
  // Shared fixture schedule — feeds every tab. Defaults reproduce the Module 2
  // design problem (26 WSFU).
  const [counts, setCounts] = useState<Record<string, number>>({
    'water-closet': 2, 'shower': 2, 'lavatory': 2, 'hose-bibb': 4, 'kitchen-sink': 1,
  })
  const setCount = (id: string, v: number) => setCounts((c) => ({ ...c, [id]: Math.max(0, Math.round(v)) }))
  const items: FixtureCount[] = useMemo(
    () => FIXTURE_LIST.map((f) => ({ id: f.id, count: counts[f.id] ?? 0 })).filter((i) => i.count > 0),
    [counts])
  const wsfu = totalWSFU(items, occ)
  const dfu = totalDFU(items, occ)

  // Water-supply tab inputs (defaults = Module 2 design problem).
  const [Lpipe, setLpipe] = useState(21)
  const [fittingLength, setFittingLength] = useState(0)
  const [riseZ, setRiseZ] = useState(5)
  const [pMain, setPMain] = useState(206.85)     // 30 psi
  const [pMeter, setPMeter] = useState(6.9)
  const [pFixture, setPFixture] = useState(103.43) // 15 psi
  const [hunterSystem, setHunterSystem] = useState<HunterSystem>('tank')
  const [flowOverride, setFlowOverride] = useState(0)   // L/s; 0 ⇒ use Hunter's curve
  const [material, setMaterial] = useState<keyof typeof HAZEN_C>('copper')

  const supplyInput: WaterSupplyInput = {
    items, occupancy: occ, hunterSystem, designFlowLps: flowOverride > 0 ? flowOverride : undefined,
    Lpipe, fittingLength, riseZ, pMainKPa: pMain, pMeterKPa: pMeter, pFixtureKPa: pFixture, material,
  }
  const supply = useMemo(() => designWaterSupply(supplyInput), [supplyInput])
  const supplySteps = useMemo(() => waterSupplySolution(supplyInput, supply), [supplyInput, supply])

  // Drainage (DWV) tab inputs.
  const [slopePct, setSlopePct] = useState(2)
  const drainage = useMemo(() => designDrainage({ items, occupancy: occ, slopePct }), [items, occ, slopePct])
  const drainageSteps = useMemo(() => drainageSolution({ items, occupancy: occ }, drainage), [items, occ, drainage])

  // Septic tank (OSST) tab inputs.
  const [tankWidth, setTankWidth] = useState(2.0)
  const [liquidDepth, setLiquidDepth] = useState(1.2)
  const septic = useMemo(() => designSepticTank({ dfu, width: tankWidth, liquidDepth }), [dfu, tankWidth, liquidDepth])
  const septicSteps = useMemo(() => septicSolution(septic), [septic])

  const tabBtn = (id: Tab, label: string) => (
    <button type="button" onClick={() => setTab(id)}
      className={`border-b-2 px-1 pb-1.5 text-sm font-semibold ${tab === id ? 'border-[#0056b3] text-[#0056b3]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
      {label}
    </button>
  )

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Plumbing &amp; Sanitary</p>
      <h1 className="mt-1 text-2xl font-bold text-[#0056b3]">Plumbing System Design</h1>
      <ReportControls title="Plumbing Design Report" badges={['RNPCP 2000']} />
      <p className="mt-2 text-sm text-slate-600">
        Water supply, sanitary drainage (DWV) and on-site sewage treatment to the Revised National Plumbing Code
        of the Philippines (RNPCP 2000). Set the fixture schedule once; every tab reads from it.
      </p>

      {/* Shared fixture schedule */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[1.05rem] font-bold text-[#0056b3]">Fixture schedule</h2>
          <label className="flex items-center gap-2 text-sm">
            <span className="font-medium text-slate-600">Occupancy</span>
            <select value={occ} onChange={(e) => setOcc(e.target.value as Occupancy)}
              className="rounded-md border border-slate-300 px-2 py-1">
              <option value="private">Private</option>
              <option value="public">Public</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
          {FIXTURE_LIST.map((f) => (
            <label key={f.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-slate-600" title={`WSFU ${f.wsfu[occ]} · DFU ${f.dfu[occ]}`}>{f.label}</span>
              <input type="number" min={0} step={1} value={counts[f.id] ?? 0}
                onChange={(e) => setCount(f.id, num(e.target.value))}
                className="w-16 rounded-md border border-slate-300 px-2 py-1 text-right" />
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-100 pt-2 text-sm">
          <span className="text-slate-500">Total supply units <b className="font-mono text-slate-800">{f0(wsfu)} WSFU</b></span>
          <span className="text-slate-500">Total drainage units <b className="font-mono text-slate-800">{f0(dfu)} DFU</b></span>
        </div>
      </section>

      {/* Tabs */}
      <div className="mt-6 flex gap-5 border-b border-slate-200">
        {tabBtn('supply', 'Water Supply')}
        {tabBtn('drainage', 'Drainage (DWV)')}
        {tabBtn('septic', 'Septic Tank')}
      </div>

      {tab === 'supply' && (
        <>
          <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Supply run &amp; pressures</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Pipe length" unit="m" value={Lpipe} onChange={setLpipe} />
              <Field label="Fittings (equiv. L)" unit="m" value={fittingLength} onChange={setFittingLength} hint="Table A-2" />
              <Field label="Highest fixture rise Z" unit="m" value={riseZ} onChange={setRiseZ} />
              <label className="flex flex-col text-sm">
                <span className="mb-1 font-medium text-slate-600">System (Chart A-2/A-3)</span>
                <select value={hunterSystem} onChange={(e) => setHunterSystem(e.target.value as HunterSystem)}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5">
                  <option value="tank">Flush tanks (A-2)</option>
                  <option value="valve">Flush valves (A-3)</option>
                </select>
              </label>
              <Field label="Design flow override" unit="L/s" value={flowOverride} onChange={setFlowOverride} step="0.01" hint="0 = use Hunter's curve" />
              <Field label="Main pressure" unit="kPa" value={pMain} onChange={setPMain} hint={`${f0(pMain / 6.89476)} psi`} />
              <Field label="Meter drop" unit="kPa" value={pMeter} onChange={setPMeter} hint="Chart A-1" />
              <Field label="Residual (fixture)" unit="kPa" value={pFixture} onChange={setPFixture} hint={`${f0(pFixture / 6.89476)} psi`} />
              <label className="flex flex-col text-sm">
                <span className="mb-1 font-medium text-slate-600">Pipe material</span>
                <select value={material} onChange={(e) => setMaterial(e.target.value as keyof typeof HAZEN_C)}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5">
                  {Object.keys(HAZEN_C).map((m) => <option key={m} value={m}>{m} (C = {HAZEN_C[m]})</option>)}
                </select>
              </label>
            </div>
          </section>

          <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-[1.05rem] font-bold text-[#0056b3]">Results</h2>
            <Out label="Maximum demand (ΣFU×8)" value={`${f1(supply.demand.maxGpm)} gpm · ${f2(supply.demand.maxLps)} L/s`} />
            <Out label={`Design flow (${supply.flowSource === 'override' ? 'chart' : "Hunter's curve"})`} value={`${f1(supply.designFlowGpm)} gpm · ${f2(supply.designFlowLps)} L/s`} />
            <Out label="Static head (γw·Z)" value={`${f1(supply.staticKPa)} kPa`} />
            <Out label="Available for friction" value={`${f1(supply.availableForFriction)} kPa`} ok={supply.availableForFriction > 0} />
            <Out label="Developed length" value={`${f1(supply.developedLength)} m · allow ≈ ${f1(supply.allowablePer30m)} kPa/30.4 m`} />
            <Out label="Recommended pipe" value={supply.pipe.size ? `${supply.pipe.size.label} (${f1(supply.pipe.size.idMm)} mm ID)` : '—'} ok={!!supply.pipe.size && supply.ok} />
            <Out label="Velocity at size" value={`${f2(supply.pipe.velocity)} m/s`} ok={supply.pipe.velocityOK} />
            <Out label="Friction at size" value={`${f1(supply.pipe.frictionDrop)} kPa`} ok={supply.pipe.frictionOK} />
            <p className="mt-2 text-[10px] text-slate-500">
              Design flow from Hunter's curve (Charts A-2/A-3) — override with a chart-read flow if needed.
              Friction by Hazen-Williams (the physics behind Charts A-4…A-7). Minimum service pipe 19 mm (¾");
              velocity capped at 3 m/s.
            </p>
          </section>

          <div className="no-print">{supplySteps.length > 0 && <WorkedSolution steps={supplySteps} />}</div>
        </>
      )}

      {tab === 'drainage' && (
        <>
          <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Drainage run</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="flex flex-col text-sm">
                <span className="mb-1 font-medium text-slate-600">Sewer slope</span>
                <select value={slopePct} onChange={(e) => setSlopePct(num(e.target.value))}
                  className="rounded-md border border-slate-300 px-2.5 py-1.5">
                  <option value={2}>2% (21 mm/m)</option>
                  <option value={1}>1% (10.5 mm/m)</option>
                  <option value={0.5}>0.5% (5.3 mm/m)</option>
                </select>
              </label>
            </div>
          </section>
          <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-[1.05rem] font-bold text-[#0056b3]">Results</h2>
            <Out label="Drainage fixture units" value={`${f0(drainage.dfu)} DFU${slopePct <= 1 ? ` · design ${f1(drainage.effectiveDfu)} (1% ×1.25)` : ''}`} />
            <Out label="Drain (horizontal & vertical)" value={`${f0(drainage.drainMm)} mm`} ok={drainage.wcCount === 0 || drainage.drainMm >= 75} />
            <Out label="Vent" value={`${f0(drainage.ventMm)} mm`} ok={drainage.ventOK} />
            <Out label="Max developed length" value={`drain ${f0(drainage.maxDrainM)} m · vent ${f0(drainage.maxVentM)} m`} />
            <Out label="Building-sewer min slope" value={`${f1(drainage.sewer.minPct)}% (${f1(drainage.sewer.mmPerM)} mm/m)`} />
            {drainage.wcStackWarn && <p className="mt-1 text-[11px] text-amber-600">⚠ {drainage.wcCount} water closets on one stack — the code allows max 4 per stack; split the stack.</p>}
            <p className="mt-2 text-[10px] text-slate-500">
              Drain/vent size &amp; max length from Table 7-5; a vent is ≥ 32 mm and ≥ ½ the drain. No water closet
              into a drain &lt; 75 mm. Slope per §1206. Set the fixture schedule above.
            </p>
          </section>
          <div className="no-print">{drainageSteps.length > 0 && <WorkedSolution steps={drainageSteps} />}</div>
        </>
      )}
      {tab === 'septic' && (
        <>
          <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-[1.05rem] font-bold text-[#0056b3]">Tank geometry</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Plan width" unit="m" value={tankWidth} onChange={setTankWidth} step="0.1" hint="≥ 0.9 m" />
              <Field label="Liquid depth" unit="m" value={liquidDepth} onChange={setLiquidDepth} step="0.1" hint="0.6–1.8 m" />
            </div>
          </section>
          <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-[1.05rem] font-bold text-[#0056b3]">Results</h2>
            <Out label="Drainage fixture units" value={`${f0(septic.dfu)} DFU`} />
            <Out label="Min capacity (Table B-2)" value={`${f0(septic.capacityL)} L · ${f2(septic.capacityL / 1000)} m³`} />
            <Out label="Plan length" value={`${f2(septic.length)} m`} ok={septic.capacityOK} />
            <Out label="Overall height" value={`${f2(septic.totalHeight)} m (liquid ${f1(septic.liquidDepth)} + 0.23 freeboard)`} ok={septic.depthOK} />
            <Out label="Digestive chamber (2/3)" value={`${f2(tankWidth)} × ${f2(septic.inletLength)} × ${f2(septic.totalHeight)} m · ${f2(septic.inletVol)} m³`} ok={septic.inletVolOK && septic.inletDimOK} />
            <Out label="Leaching chamber (1/3)" value={`${f2(tankWidth)} × ${f2(septic.outletLength)} × ${f2(septic.totalHeight)} m · ${f2(septic.outletVol)} m³`} ok={septic.outletVolOK} />
            <Out label="Provided liquid volume" value={`${f2(septic.providedVol)} m³`} ok={septic.capacityOK} />
            <p className="mt-2 text-[10px] text-slate-500">
              Capacity from Table B-2 (by DFU). L = V/(w·d); inlet 2/3 (≥ 2 m³ &amp; ≥ 2/3 total), secondary 1/3
              (≥ 1 m³). Liquid depth 0.6–1.8 m; side walls 228.6 mm above liquid. Two 508 mm manholes required.
            </p>
          </section>
          <div className="no-print">{septicSteps.length > 0 && <WorkedSolution steps={septicSteps} />}</div>
        </>
      )}
    </main>
  )
}
