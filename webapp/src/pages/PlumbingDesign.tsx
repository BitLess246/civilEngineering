import { useMemo, useState } from 'react'
import { FIXTURE_LIST, type FixtureCount, type Occupancy, totalWSFU, totalDFU } from '../engine/plumbingFixtures'
import { GuidedTour } from '../components/GuidedTour'
import { TourButton } from '../components/TourButton'
import { PLUMBING_STEPS } from '../lib/plumbingTour'
import { useTour } from '../lib/useTour'
import { designWaterSupply, waterSupplySolution, HAZEN_C, V_MAX, type HunterSystem, type WaterSupplyInput } from '../engine/waterSupply'
import { designDrainage, drainageSolution } from '../engine/drainage'
import { designSepticTank, septicSolution, FREEBOARD_M } from '../engine/septicTank'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard, type ResultRow } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { PressureBudget, DwvDiagram, SepticSection } from '../components/plumbingSketches'

const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—')
const f1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '—')
const f0 = (n: number) => (Number.isFinite(n) ? Math.round(n).toString() : '—')
const st = (ok: boolean) => (ok ? 'pass' as const : 'fail' as const)
const PSI = 6.89476

type Tab = 'supply' | 'drainage' | 'septic'
const TABS: [Tab, string][] = [['supply', 'Water Supply'], ['drainage', 'Drainage (DWV)'], ['septic', 'Septic Tank']]

export default function PlumbingDesign() {
  const [tab, setTab] = useState<Tab>('supply')

  // The walkthrough. Advancing a step switches the tab too — see `useTour`.
  const tour = useTour(PLUMBING_STEPS, (t) => setTab(t as Tab))
  const [occ, setOcc] = useState<Occupancy>('private')
  // Shared fixture schedule — feeds every tab. Defaults reproduce the Module 2
  // design problem (26 WSFU).
  const [counts, setCounts] = useState<Record<string, number>>({
    'water-closet': 2, 'shower': 2, 'lavatory': 2, 'hose-bibb': 4, 'kitchen-sink': 1,
  })
  const setCount = (id: string, v: number) => setCounts((c) => ({ ...c, [id]: Math.max(0, Math.round(v || 0)) }))
  const items: FixtureCount[] = useMemo(
    () => FIXTURE_LIST.map((f) => ({ id: f.id, count: counts[f.id] ?? 0 })).filter((i) => i.count > 0),
    [counts])
  const wsfu = totalWSFU(items, occ)
  const dfu = totalDFU(items, occ)

  // Water-supply inputs (defaults = Module 2 design problem).
  const [Lpipe, setLpipe] = useState(21)
  const [fittingLength, setFittingLength] = useState(0)
  const [riseZ, setRiseZ] = useState(5)
  const [pMain, setPMain] = useState(206.85)     // 30 psi
  const [pMeter, setPMeter] = useState(6.9)
  const [pFixture, setPFixture] = useState(103.43) // 15 psi
  const [hunterSystem, setHunterSystem] = useState<HunterSystem>('tank')
  const [flowOverride, setFlowOverride] = useState(0)   // L/s; 0 ⇒ use Hunter's curve
  const [material, setMaterial] = useState<keyof typeof HAZEN_C>('copper')

  // memoized so the solves below don't re-run on every unrelated render
  const supplyInput: WaterSupplyInput = useMemo(() => ({
    items, occupancy: occ, hunterSystem, designFlowLps: flowOverride > 0 ? flowOverride : undefined,
    Lpipe, fittingLength, riseZ, pMainKPa: pMain, pMeterKPa: pMeter, pFixtureKPa: pFixture, material,
  }), [items, occ, hunterSystem, flowOverride, Lpipe, fittingLength, riseZ, pMain, pMeter, pFixture, material])
  const supply = useMemo(() => designWaterSupply(supplyInput), [supplyInput])
  const supplySteps = useMemo(() => waterSupplySolution(supplyInput, supply), [supplyInput, supply])

  // Drainage (DWV) inputs.
  const [slopePct, setSlopePct] = useState(2)
  const drainage = useMemo(() => designDrainage({ items, occupancy: occ, slopePct }), [items, occ, slopePct])
  const drainageSteps = useMemo(() => drainageSolution({ items, occupancy: occ }, drainage), [items, occ, drainage])

  // Septic tank (OSST) inputs.
  const [tankWidth, setTankWidth] = useState(2.0)
  const [liquidDepth, setLiquidDepth] = useState(1.2)
  const septic = useMemo(() => designSepticTank({ dfu, width: tankWidth, liquidDepth }), [dfu, tankWidth, liquidDepth])
  const septicSteps = useMemo(() => septicSolution(septic), [septic])

  const pipeLabel = supply.pipe.size ? `${supply.pipe.size.label} (${f1(supply.pipe.size.idMm)} mm ID)` : '—'
  const avail = Math.max(supply.availableForFriction, 0)
  const septicReqM3 = septic.capacityL / 1000
  const drainWcOK = drainage.wcCount === 0 || drainage.drainMm >= 75

  const report = {
    docCode: 'P-01',
    ok: supply.ok && drainage.ok && septic.ok,
    governing: `${f0(wsfu)} WSFU → ${pipeLabel} · ${f0(dfu)} DFU → drain ⌀${f0(drainage.drainMm)} · tank ${f2(septic.width)} × ${f2(septic.length)} m`,
    stats: [
      { label: 'Supply pipe', value: supply.pipe.size?.label ?? '—', unit: material },
      { label: 'Drain / vent', value: `${f0(drainage.drainMm)} / ${f0(drainage.ventMm)}`, unit: 'mm' },
      { label: 'Septic capacity', value: f2(septicReqM3), unit: 'm³' },
    ],
    checks: [
      { name: 'Supply friction / available', ratio: avail > 0 ? supply.pipe.frictionDrop / avail : Infinity, ok: supply.pipe.frictionOK },
      { name: `Supply velocity / ${V_MAX} m/s`, ratio: supply.pipe.velocity / V_MAX, ok: supply.pipe.velocityOK },
      { name: 'Septic required / provided volume', ratio: septic.providedVol > 0 ? septicReqM3 / septic.providedVol : Infinity, ok: septic.capacityOK },
    ],
    data: [
      ['Occupancy', occ],
      ['Fixtures', items.map((i) => `${i.count} ${FIXTURE_LIST.find((f) => f.id === i.id)?.label ?? i.id}`).join(', ') || '—'],
      ['Supply / drainage units', `${f0(wsfu)} WSFU / ${f0(dfu)} DFU`],
      ['Pipe length + fittings', `${f1(Lpipe)} + ${f1(fittingLength)} m`],
      ['Rise to highest fixture Z', `${f1(riseZ)} m`],
      ['Main / meter / residual', `${f1(pMain)} / ${f1(pMeter)} / ${f1(pFixture)} kPa`],
      ['Design flow', `${f2(supply.designFlowLps)} L/s (${supply.flowSource === 'override' ? 'override' : "Hunter's curve"})`],
      ['Supply pipe', `${pipeLabel}, v = ${f2(supply.pipe.velocity)} m/s`],
      ['Building drain', `⌀${f0(drainage.drainMm)} mm at ${slopePct}%, vent ⌀${f0(drainage.ventMm)} mm`],
      ['Septic tank (internal)', `${f2(septic.width)} × ${f2(septic.length)} × ${f2(septic.totalHeight)} m, liquid ${f2(septic.liquidDepth)} m`],
    ] as [string, string][],
    steps: [...supplySteps, ...drainageSteps, ...septicSteps],
  }

  const actions = (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5 rounded-md border border-field-line bg-field p-0.5" role="tablist" aria-label="Design">
        {TABS.map(([v, t]) => (
          <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => setTab(v)}
            className={`rounded px-3 py-1.5 text-[11.5px] font-semibold ${tab === v ? 'bg-brand text-on-solid' : 'text-muted hover:text-ink'}`}>
            {t}
          </button>
        ))}
      </div>
      <TourButton onClick={tour.start} label="Guide" />
    </div>
  )

  const fixtureGroup = (
    <div data-tour="fixture-schedule">
      <InputGroup title="Fixture schedule" hint={`Feeds every tab · ${f0(wsfu)} WSFU · ${f0(dfu)} DFU`}>
        <div className="col-span-2">
          <Pick label="Occupancy" value={occ} onChange={setOcc} options={[['private', 'Private'], ['public', 'Public']]} />
        </div>
        {FIXTURE_LIST.map((f) => (
          <Num key={f.id} label={f.label} value={counts[f.id] ?? 0} onChange={(v) => setCount(f.id, v)} step="1" min={0}
            hint={`WSFU ${f.wsfu[occ]} · DFU ${f.dfu[occ]}`} />
        ))}
      </InputGroup>
    </div>
  )

  const supplyInputs = (
      <div data-tour="supply-panel">
        <InputGroup title="Supply run and pressures">
          <Num label="Pipe length" unit="m" value={Lpipe} onChange={setLpipe} min={0} />
          <Num label="Fittings (equiv. L)" unit="m" value={fittingLength} onChange={setFittingLength} min={0} hint="Table A-2" />
          <Num label="Highest fixture rise Z" unit="m" value={riseZ} onChange={setRiseZ} />
          <Pick label="System (Chart A-2/A-3)" value={hunterSystem} onChange={setHunterSystem}
            options={[['tank', 'Flush tanks (A-2)'], ['valve', 'Flush valves (A-3)']]} />
          <Num label="Design flow override" unit="L/s" value={flowOverride} onChange={setFlowOverride} step="0.01" min={0} hint="0 = use Hunter's curve" />
          <Pick label="Pipe material" value={material} onChange={setMaterial}
            options={(Object.keys(HAZEN_C) as (keyof typeof HAZEN_C)[]).map((m) => [m, `${m} (C = ${HAZEN_C[m]})`])} />
          <Num label="Main pressure" unit="kPa" value={pMain} onChange={setPMain} min={0} hint={`${f0(pMain / PSI)} psi`} />
          <Num label="Meter drop" unit="kPa" value={pMeter} onChange={setPMeter} min={0} hint="Chart A-1" />
          <Num label="Residual (fixture)" unit="kPa" value={pFixture} onChange={setPFixture} min={0} hint={`${f0(pFixture / PSI)} psi`} />
        </InputGroup>
      </div>
  )
  const drainageInputs = (
      <div data-tour="drainage-panel">
        <InputGroup title="Drainage run">
          <div className="col-span-2">
            <Pick label="Sewer slope" value={String(slopePct)} onChange={(v) => setSlopePct(parseFloat(v))}
              options={[['2', '2% (21 mm/m)'], ['1', '1% (10.5 mm/m)'], ['0.5', '0.5% (5.3 mm/m)']]} />
          </div>
        </InputGroup>
      </div>
  )
  const septicInputs = (
      <div data-tour="septic-panel">
        <InputGroup title="Tank geometry">
          <Num label="Plan width" unit="m" value={tankWidth} onChange={setTankWidth} step="0.1" min={0.1} hint="≥ 0.9 m" />
          <Num label="Liquid depth" unit="m" value={liquidDepth} onChange={setLiquidDepth} step="0.1" min={0.1} hint="0.6–1.8 m" />
        </InputGroup>
      </div>
  )

  const view = tab === 'supply' ? {
    checks: <>
      <CheckCard title="Supply pipe" basis={`smallest size ≥ 19 mm meeting both limits · ${supply.pipe.governedBy}`} status={st(supply.ok)}
        value={supply.pipe.size?.label ?? '—'}
        pairs={[{ label: 'Design flow', value: `${f2(supply.designFlowLps)} L/s` }, { label: 'ID', value: supply.pipe.size ? `${f1(supply.pipe.size.idMm)} mm` : '—' }]} />
      <CheckCard title="Friction" basis="Hazen-Williams over the developed length" status={st(supply.pipe.frictionOK)}
        value={f1(supply.pipe.frictionDrop)} unit="kPa" ratio={avail > 0 ? supply.pipe.frictionDrop / avail : undefined} ratioLabel="drop ÷ available"
        pairs={[{ label: 'Available', value: `${f1(supply.availableForFriction)} kPa` }, { label: 'Length', value: `${f1(supply.developedLength)} m` }]} />
      <CheckCard title="Velocity" basis={`v ≤ ${V_MAX} m/s`} status={st(supply.pipe.velocityOK)}
        value={f2(supply.pipe.velocity)} unit="m/s" ratio={supply.pipe.velocity / V_MAX} ratioLabel={`v ÷ ${V_MAX}`} />
    </>,
    drawing: { title: 'Pressure budget', node: <div data-pdf-drawing>
      <PressureBudget pMain={pMain} pMeter={pMeter} pStatic={supply.staticKPa} pResidual={pFixture}
        friction={supply.pipe.frictionDrop} pipeLabel={pipeLabel} />
    </div> },
    caption: "Design flow from Hunter's curve (Charts A-2/A-3) — override with a chart-read flow if needed. Friction by Hazen-Williams, the physics behind Charts A-4…A-7. Minimum service pipe 19 mm (¾\"); velocity capped at 3 m/s.",
    results: [
      { check: 'Maximum demand', basis: 'ΣFU × 8', demand: `${f2(supply.demand.maxLps)} L/s`, status: 'info' as const },
      { check: 'Design flow', basis: supply.flowSource === 'override' ? 'chart-read override' : "Hunter's curve", demand: `${f2(supply.designFlowLps)} L/s`, status: 'info' as const },
      { check: 'Static head', basis: 'γw·Z', demand: `${f1(supply.staticKPa)} kPa`, status: 'info' as const },
      { check: 'Available for friction', basis: 'main − meter − static − residual', demand: `${f1(supply.availableForFriction)} kPa`, status: st(supply.availableForFriction > 0) },
      { check: 'Allowable gradient', basis: 'per 30.4 m of developed length', demand: `${f1(supply.allowablePer30m)} kPa`, status: 'info' as const },
      { check: 'Friction at size', basis: pipeLabel, demand: `${f1(supply.pipe.frictionDrop)} kPa`, limit: `${f1(avail)} kPa`, ratio: avail > 0 ? supply.pipe.frictionDrop / avail : undefined, status: st(supply.pipe.frictionOK) },
      { check: 'Velocity at size', basis: pipeLabel, demand: `${f2(supply.pipe.velocity)} m/s`, limit: `${V_MAX} m/s`, ratio: supply.pipe.velocity / V_MAX, status: st(supply.pipe.velocityOK) },
    ] as ResultRow[],
    steps: supplySteps,
  } : tab === 'drainage' ? {
    checks: <>
      <CheckCard title="Drain" basis="Table 7-5 · no WC into a drain < 75 mm" status={st(drainWcOK)}
        value={`⌀${f0(drainage.drainMm)}`} unit="mm"
        pairs={[{ label: 'DFU', value: slopePct <= 1 ? `${f0(drainage.dfu)} → ${f1(drainage.effectiveDfu)}` : f0(drainage.dfu) }, { label: 'Max length', value: `${f0(drainage.maxDrainM)} m` }]} />
      <CheckCard title="Vent" basis="≥ 32 mm and ≥ ½ the drain" status={st(drainage.ventOK)}
        value={`⌀${f0(drainage.ventMm)}`} unit="mm" pairs={[{ label: 'Max length', value: `${f0(drainage.maxVentM)} m` }]} />
      <CheckCard title="Water closets per stack" basis="max 4 on one stack" status={drainage.wcStackWarn ? 'warn' : 'pass'}
        value={f0(drainage.wcCount)} pairs={[{ label: 'Sewer min slope', value: `${f1(drainage.sewer.minPct)}%` }]} />
    </>,
    drawing: { title: 'Drainage and vent', node: <div data-pdf-drawing>
      <DwvDiagram drainMm={drainage.drainMm} ventMm={drainage.ventMm} slopePct={slopePct} dfu={drainage.dfu} wcCount={drainage.wcCount} />
    </div> },
    caption: 'Drain/vent size and maximum developed length from Table 7-5; a vent is ≥ 32 mm and ≥ ½ the drain. No water closet into a drain < 75 mm. Building-sewer slope per §1206. On a 1% run the table capacity is ×0.8.',
    results: [
      { check: 'Drainage fixture units', basis: slopePct <= 1 ? '1% run: DFU ÷ 0.8' : 'Σ DFU', demand: f1(drainage.effectiveDfu), status: 'info' as const },
      { check: 'Drain (horizontal and vertical)', basis: 'Table 7-5', demand: `⌀${f0(drainage.drainMm)} mm`, limit: drainage.wcCount ? '≥ 75 mm with a WC' : undefined, status: st(drainWcOK) },
      { check: 'Vent', basis: '≥ max(32, drain/2)', demand: `⌀${f0(drainage.ventMm)} mm`, status: st(drainage.ventOK) },
      { check: 'Max developed length', basis: 'Table 7-5', demand: `drain ${f0(drainage.maxDrainM)} m · vent ${f0(drainage.maxVentM)} m`, status: 'info' as const },
      { check: 'Building-sewer min slope', basis: '§1206', demand: `${f1(drainage.sewer.minPct)}% (${f1(drainage.sewer.mmPerM)} mm/m)`, status: st(slopePct >= drainage.sewer.minPct) },
      ...(drainage.wcStackWarn ? [{ check: 'Water closets on one stack', basis: 'max 4 — split the stack', demand: f0(drainage.wcCount), limit: '4', status: 'warn' as const }] : []),
    ] as ResultRow[],
    steps: drainageSteps,
  } : {
    checks: <>
      <CheckCard title="Capacity" basis="Table B-2 by DFU" status={st(septic.capacityOK)}
        value={f2(septic.providedVol)} unit="m³" ratio={septic.providedVol > 0 ? septicReqM3 / septic.providedVol : undefined} ratioLabel="required ÷ provided"
        pairs={[{ label: 'Required', value: `${f0(septic.capacityL)} L` }, { label: 'Length', value: `${f2(septic.length)} m` }]} />
      <CheckCard title="Liquid depth" basis="0.6 – 1.8 m" status={st(septic.depthOK)} value={f2(septic.liquidDepth)} unit="m"
        pairs={[{ label: 'Freeboard', value: `${f0(FREEBOARD_M * 1000)} mm` }, { label: 'Height', value: `${f2(septic.totalHeight)} m` }]} />
      <CheckCard title="Chambers" basis="digestive ≥ 2 m³, ≥ 2/3 · leaching ≥ 1 m³" status={st(septic.inletVolOK && septic.inletDimOK && septic.outletVolOK)}
        value={`${f2(septic.inletVol)} + ${f2(septic.outletVol)}`} unit="m³"
        pairs={[{ label: 'Digestive L', value: `${f2(septic.inletLength)} m` }, { label: 'Leaching L', value: `${f2(septic.outletLength)} m` }]} />
    </>,
    drawing: { title: 'Septic tank section', node: <div data-pdf-drawing>
      <SepticSection length={septic.length} inletLength={septic.inletLength} outletLength={septic.outletLength}
        liquidDepth={septic.liquidDepth} totalHeight={septic.totalHeight} width={septic.width} />
    </div> },
    caption: 'Capacity from Table B-2 (by DFU). L = V/(w·d); digestive chamber 2/3 (≥ 2 m³ and ≥ 2/3 of the total), leaching 1/3 (≥ 1 m³). Liquid depth 0.6–1.8 m; side walls 228.6 mm above the liquid. Two 508 mm manholes required.',
    results: [
      { check: 'Drainage fixture units', basis: 'Σ DFU', demand: f0(septic.dfu), status: 'info' as const },
      { check: 'Minimum capacity', basis: 'Table B-2', demand: `${f0(septic.capacityL)} L`, status: 'info' as const },
      { check: 'Plan length', basis: 'V / (w·d), up to 0.1 m', demand: `${f2(septic.length)} m`, status: st(septic.capacityOK) },
      { check: 'Overall height', basis: `liquid + ${FREEBOARD_M * 1000} mm`, demand: `${f2(septic.totalHeight)} m`, status: st(septic.depthOK) },
      { check: 'Digestive chamber', basis: '≥ 2 m³, ≥ 2/3 total', demand: `${f2(septic.inletVol)} m³`, limit: '2.00 m³', status: st(septic.inletVolOK && septic.inletDimOK) },
      { check: 'Leaching chamber', basis: '≥ 1 m³', demand: `${f2(septic.outletVol)} m³`, limit: '1.00 m³', status: st(septic.outletVolOK) },
      { check: 'Provided liquid volume', basis: 'w·L·d', demand: `${f2(septic.providedVol)} m³`, limit: `${f2(septicReqM3)} m³`, ratio: septic.providedVol > 0 ? septicReqM3 / septic.providedVol : undefined, status: st(septic.capacityOK) },
    ] as ResultRow[],
    steps: septicSteps,
  }

  return (
    <>
      <WorkspacePage title="Plumbing System" badges={['Plumbing', 'RNPCP 2000']}
        intro="Water supply, sanitary drainage (DWV) and on-site sewage treatment to the Revised National Plumbing Code of the Philippines (RNPCP 2000). Set the fixture schedule once; every tab reads from it."
        actions={actions}
        report={report}
        inputs={<>{fixtureGroup}{tab === 'supply' && supplyInputs}{tab === 'drainage' && drainageInputs}{tab === 'septic' && septicInputs}</>}
        checks={view.checks}
        summary={[
          { label: 'Occupancy', value: occ },
          { label: 'Fixture units', value: `${f0(wsfu)} WSFU · ${f0(dfu)} DFU` },
          { label: 'Supply run', value: `${f1(Lpipe)} m + ${f1(fittingLength)} m fittings, rise ${f1(riseZ)} m` },
          { label: 'Pressures', value: `main ${f1(pMain)}, meter ${f1(pMeter)}, residual ${f1(pFixture)} kPa` },
        ]}
        drawing={view.drawing}
        resultsCaption={view.caption}
        results={view.results}
        steps={view.steps}
        references={[
          { topic: 'Fixture units', basis: 'WSFU and DFU by fixture and occupancy', source: 'RNPCP 2000 fixture-unit tables' },
          { topic: 'Supply sizing', basis: "Hunter's curve, Method 1 pressure budget", source: 'RNPCP 2000 §609, Appendix A' },
          { topic: 'Drain and vent sizing', basis: 'size and developed length by DFU', source: 'RNPCP 2000 Table 7-5' },
          { topic: 'Building sewer', basis: 'minimum slope by diameter', source: 'RNPCP 2000 §1206' },
          { topic: 'Septic tank', basis: 'capacity by DFU, two compartments', source: 'RNPCP 2000 Appendix B, Table B-2' },
        ]}
      />
      {tour.on && (
        <GuidedTour step={tour.step} index={tour.at} total={tour.total}
          onNext={tour.next} onPrev={tour.prev} onClose={tour.close} />
      )}
    </>
  )
}
