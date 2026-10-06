import { useState } from 'react'
import {
  esals, requiredSN, layerSN, checkLayers, TYPICAL_A,
  type EsalsResult, type SnResult, type LayerRow,
} from '../engine/pavement'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { FlexibleSection } from '../components/pavementSketches'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// Flexible Pavement — AASHTO 1993: traffic as design ESALs, the required
// structural number from the design equation, and the layer-thickness
// check that closes SN = a1·D1 + a2·D2·m2 + a3·D3·m3.

interface EsalOut { res: EsalsResult | null }
interface SnOut { res: SnResult | null }
interface LayerOut { sn: number; ok: boolean; shortfall: number; rows: { name: string; contribution: number; m: number }[] | null }

const LAYER_PRESETS: [string, string][] = [
  ['typical', 'Typical: AC · crushed stone · granular subbase'],
  ['stabilized', 'Stabilized base (a2 = 0.20/in) · subbase 0.11/in'],
]

export default function Pavement() {
  const [preset, setPreset] = useState('typical')
  // — traffic —
  const [adt, setAdt] = useState(3000)
  const [truckPct, setTruckPct] = useState(15)
  const [truckFactor, setTruckFactor] = useState(1.2)
  const [directional, setDirectional] = useState(0.6)
  const [laneFactor, setLaneFactor] = useState(0.9)
  const [growthPct, setGrowthPct] = useState(4)
  const [years, setYears] = useState(20)
  const [useTraffic, setUseTraffic] = useState<'calc' | 'direct'>('calc')
  const [W18direct, setW18direct] = useState(5e6)
  // — design —
  const [reliability, setReliability] = useState(90)
  const [S0, setS0] = useState(0.45)
  const [pt, setPt] = useState(2.2)
  const [MR, setMR] = useState(50) // MPa
  // — layers —
  const [a1, setA1] = useState(TYPICAL_A.asphalt)
  const [D1, setD1] = useState(100)
  const [a2, setA2] = useState(TYPICAL_A.base)
  const [D2, setD2] = useState(200)
  const [m2, setM2] = useState(1.0)
  const [a3, setA3] = useState(TYPICAL_A.subbase)
  const [D3, setD3] = useState(300)
  const [m3, setM3] = useState(1.0)

  const es: EsalOut = (() => {
    try {
      return { res: esals({ adt, truckPct, truckFactor, directional, laneFactor, growthPct, years }) }
    } catch { return { res: null } }
  })()
  const W18 = useTraffic === 'calc' ? (es.res?.W18 ?? NaN) : W18direct
  const sn: SnOut = (() => {
    try {
      return { res: requiredSN({ W18, reliability, S0, pt, MR_MPa: MR }) }
    } catch { return { res: null } }
  })()
  const layers: LayerOut = (() => {
    try {
      const rowsIn: LayerRow[] = [
        { name: 'Asphalt', a: a1, D: D1 },
        { name: 'Base', a: a2, D: D2, m: m2 },
        { name: 'Subbase', a: a3, D: D3, m: m3 },
      ]
      const r = layerSN(rowsIn)
      const chk = checkLayers(sn.res?.SN ?? NaN, r.SNprovided)
      return { sn: r.SNprovided, ok: chk.ok, shortfall: chk.shortfall, rows: r.rows }
    } catch { return { sn: NaN, ok: false, shortfall: NaN, rows: null } }
  })()

  const applyPreset = (p: string) => {
    setPreset(p)
    if (p === 'typical') { setA1(TYPICAL_A.asphalt); setA2(TYPICAL_A.base); setA3(TYPICAL_A.subbase) }
    else { setA1(TYPICAL_A.asphalt); setA2(0.2 / 25.4); setA3(TYPICAL_A.subbase) }
  }

  const dims = [
    { a: a1, D: D1, m: 1 },
    { a: a2, D: D2, m: m2 },
    { a: a3, D: D3, m: m3 },
  ]
  const steps: SolutionStep[] = sn.res && es.res && useTraffic === 'calc' ? [
    {
      title: 'Traffic → design ESALs',
      lines: [
        { tex: 'W_{18} = ADT \\cdot T\\% \\cdot TF \\cdot D \\cdot L \\cdot 365 \\cdot G \\quad\\quad G = \\frac{(1+r)^n - 1}{r}' },
        { tex: `W_{18} = ${adt} \\times ${f2(truckPct / 100)} \\times ${f2(truckFactor)} \\times ${f2(directional)} \\times ${f2(laneFactor)} \\times 365 \\times ${f2(es.res.growthFactor)} = ${(es.res.W18 / 1e6).toFixed(3)}\\,10^{6}` },
        { text: `Daily trucks ${f3(es.res.dailyTrucks)} carry ${f2(truckFactor)} ESALs each on the design lane (${(directional * 100).toFixed(0)} % directional, ${(laneFactor * 100).toFixed(0)} % lane factor), grown at ${f2(growthPct)} %/yr for ${years} years. First year: ${f3(es.res.firstYear)} ESALs.` },
      ],
    },
    ...snSteps(sn, reliability, S0, pt, layers, W18, dims),
  ] : sn.res ? snSteps(sn, reliability, S0, pt, layers, W18, dims) : [{ title: 'Check the inputs', lines: [{ text: 'Give a positive W18 (from traffic or directly), a subgrade resilient modulus, and keep ΔPSI positive (pt below 4.2).' }] }]

  const loadSample = () => { setUseTraffic('calc'); setAdt(3000); setTruckPct(15); setTruckFactor(1.2); setDirectional(0.6); setLaneFactor(0.9); setGrowthPct(4); setYears(20); setMR(50); setReliability(90); setPt(2.2) }
  const snOk = Number.isFinite(layers.sn) && layers.ok
  const w18Text = Number.isFinite(W18) ? `${(W18 / 1e6).toFixed(3)} × 10⁶` : '—'
  return (
    <WorkspacePage title="Flexible Pavement" badges={['Pavement', 'AASHTO 1993']}
      intro="The AASHTO 1993 flexible workflow: forecast the design-lane ESALs from AADT, truck percentage and truck factor, solve the required structural number from the design equation, then close the layer equation a₁D₁ + a₂D₂m₂ + a₃D₃m₃ against it."
      inputs={<>
        <InputGroup title="Traffic (design ESALs)">
          <div className="col-span-2">
            <Pick label="Design ESALs" value={useTraffic} onChange={(v) => setUseTraffic(v as 'calc' | 'direct')}
              options={[['calc', 'Forecast from traffic'], ['direct', 'Enter W18 directly']]} />
          </div>
          {useTraffic === 'calc' ? <>
            <Num label="Two-way AADT" unit="veh/day" value={adt} onChange={setAdt} min={50} max={200000} step="50" />
            <Num label="Trucks T" unit="%" value={truckPct} onChange={setTruckPct} min={0} max={100} step="0.5" />
            <Num label="Truck factor" unit="ESAL/truck" value={truckFactor} onChange={setTruckFactor} min={0.05} max={10} step="0.05" />
            <Num label="Directional D" value={directional} onChange={setDirectional} min={0.1} max={0.9} step="0.05" />
            <Num label="Lane factor L" value={laneFactor} onChange={setLaneFactor} min={0.5} max={1.0} step="0.05" />
            <Num label="Growth r" unit="%/yr" value={growthPct} onChange={setGrowthPct} min={0} max={15} step="0.5" />
            <Num label="Design period" unit="yr" value={years} onChange={setYears} min={1} max={50} step="1" />
          </> : (
            <div className="col-span-2"><Num label="Design ESALs W18" value={W18direct} onChange={setW18direct} min={1000} max={1e9} step="100000" /></div>
          )}
        </InputGroup>
        <InputGroup title="Performance and subgrade">
          <Num label="Reliability R" unit="%" value={reliability} onChange={setReliability} min={50} max={99.99} step="1" />
          <Num label="Std dev S₀" value={S0} onChange={setS0} min={0.3} max={0.55} step="0.01" />
          <Num label="Terminal pt" value={pt} onChange={setPt} min={1.5} max={3.0} step="0.1" />
          <Num label="Subgrade MR" unit="MPa" value={MR} onChange={setMR} min={10} max={300} step="5" />
        </InputGroup>
        <InputGroup title="Layers" hint="Coefficients per mm; m = drainage coefficient.">
          <div className="col-span-2"><Pick label="Coefficient preset" value={preset} onChange={applyPreset} options={LAYER_PRESETS} /></div>
          <Num label="Asphalt a₁" unit="/mm" value={a1} onChange={setA1} min={0.001} max={0.05} step="0.0005" />
          <Num label="Asphalt D₁" unit="mm" value={D1} onChange={setD1} min={25} max={400} step="5" />
          <Num label="Base a₂" unit="/mm" value={a2} onChange={setA2} min={0.001} max={0.03} step="0.0005" />
          <Num label="Base D₂" unit="mm" value={D2} onChange={setD2} min={0} max={600} step="10" />
          <Num label="Base m₂" value={m2} onChange={setM2} min={0.8} max={1.5} step="0.05" />
          <Num label="Subbase a₃" unit="/mm" value={a3} onChange={setA3} min={0.001} max={0.02} step="0.0005" />
          <Num label="Subbase D₃" unit="mm" value={D3} onChange={setD3} min={0} max={900} step="10" />
          <Num label="Subbase m₃" value={m3} onChange={setM3} min={0.8} max={1.5} step="0.05" />
          <div className="col-span-2">
            <button type="button" onClick={loadSample}
              className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">Sample: 3 000 AADT, 15 % trucks, 4 %, 20 yr</button>
          </div>
        </InputGroup>
      </>}
      checks={sn.res ? <>
        <CheckCard title="Structural number" basis="SN provided ≥ SN required" status={snOk ? 'pass' : 'fail'}
          value={f2(layers.sn)} unit="provided" formula="SN = a₁D₁ + a₂D₂m₂ + a₃D₃m₃"
          ratio={Number.isFinite(layers.sn) && layers.sn > 0 ? sn.res.SN / layers.sn : undefined} ratioLabel="Required ÷ provided"
          pairs={[{ label: 'Required', value: f2(sn.res.SN) }, { label: snOk ? 'Margin' : 'Short by', value: f2(Math.abs(layers.sn - sn.res.SN)) }]} />
        <CheckCard title="Design ESALs" basis={useTraffic === 'calc' ? `${years} yr at ${f2(growthPct)} %` : 'entered'} status="info" value={w18Text}
          pairs={useTraffic === 'calc' && es.res ? [{ label: 'Growth G', value: f3(es.res.growthFactor) }, { label: 'First year', value: f2(es.res.firstYear) }] : [{ label: 'W18', value: f2(W18) }]} />
        <CheckCard title="Design inputs" basis="AASHTO 1993" status="info" value={f3(sn.res.ZR)} unit="Z_R"
          pairs={[{ label: 'ΔPSI', value: f2(sn.res.dPSI) }, { label: 'MR', value: `${f2(sn.res.MRpsi)} psi` }]} />
      </> : (
        <CheckCard title="Check the inputs" basis="AASHTO 1993" status="warn" pillLabel="CHECK" value="—" formula="Positive W18 and MR; pt below 4.2." />
      )}
      summary={[
        { label: 'W18', value: w18Text },
        { label: 'Reliability', value: `${f2(reliability)} %, S₀ ${f2(S0)}` },
        { label: 'Serviceability', value: `4.2 → ${f2(pt)}` },
        { label: 'Subgrade MR', value: `${f2(MR)} MPa` },
      ]}
      drawing={sn.res && layers.rows ? { title: 'Pavement section', node: <div data-pdf-drawing><FlexibleSection rows={layers.rows.map((r, i) => ({ name: r.name, D: [D1, D2, D3][i], contribution: r.contribution }))} MR={MR} SNreq={sn.res.SN} SNprov={layers.sn} /></div> } : undefined}
      results={sn.res ? [
        { check: 'Design ESALs W18', basis: useTraffic === 'calc' ? 'forecast' : 'entered', demand: w18Text, status: 'info' as const },
        { check: 'Required SN', basis: `R ${f2(reliability)} %, ΔPSI ${f2(sn.res.dPSI)}`, demand: f2(sn.res.SN), status: 'info' as const },
        ...(layers.rows ?? []).map((r, i) => ({ check: r.name, basis: `a ${f3(dims[i].a)}/mm × ${f2(dims[i].D)} mm × m ${f2(r.m)}`, demand: f3(r.contribution), status: 'info' as const })),
        { check: 'SN provided', basis: '≥ required', demand: f2(layers.sn), limit: f2(sn.res.SN), ratio: layers.sn > 0 ? sn.res.SN / layers.sn : undefined, status: snOk ? 'pass' as const : 'fail' as const },
      ] : [{ check: 'Design', basis: 'invalid input', demand: '—', status: 'warn' as const }]}
      steps={steps}
      references={[
        { topic: 'Design equation', basis: 'flexible log W18 equation in SN', source: 'AASHTO Guide for Design of Pavement Structures (1993), Part II' },
        { topic: 'Layer coefficients', basis: 'a₁, a₂, a₃ and drainage m', source: 'AASHTO 1993, Part II (material properties)' },
        { topic: 'Traffic', basis: 'ESALs from AADT, truck %, truck factor, D and L', source: 'AASHTO 1993, Part II (traffic)' },
      ]}
    />
  )
}

function snSteps(
  sn: SnOut, reliability: number, S0: number, pt: number,
  layers: LayerOut, W18: number, dims: { a: number; D: number; m: number }[],
): SolutionStep[] {
  if (!sn.res) return []
  return [
    {
      title: 'The 1993 flexible design equation',
      lines: [
        { tex: '\\log_{10}W_{18} = Z_R S_0 + 9.36\\log_{10}(SN+1) - 0.20 + \\frac{\\log_{10}\\left(\\frac{\\Delta PSI}{4.2-1.5}\\right)}{0.40+\\frac{1094}{(SN+1)^{5.19}}} + 2.32\\log_{10}MR - 8.07' },
        { tex: `\\log_{10}W_{18} = \\log_{10}(${f3(W18)}) = ${f3(sn.res.logW18)}` },
        { text: `ZR = ${f3(sn.res.ZR)} from R = ${f2(reliability)} %, S0 = ${f2(S0)} (flexible 0.40–0.50), ΔPSI = 4.2 − ${f2(pt)} = ${f2(sn.res.dPSI)}, MR = ${f3(sn.res.MRpsi)} psi. The RHS is strictly increasing in SN, so the required SN comes from a bracketed bisection on [0.3, 20].` },
        { tex: `SN_{req} = ${f2(sn.res.SN)}` },
      ],
    },
    {
      title: 'Layer equation',
      lines: [
        { tex: 'SN = a_1D_1 + a_2D_2m_2 + a_3D_3m_3' },
        ...(layers.rows ?? []).map((r, k) => ({ text: `${r.name}: ${f3(dims[k]?.a ?? 0)}×${f2(dims[k]?.D ?? 0)}${(dims[k]?.m ?? 1) !== 1 ? `×${f2(dims[k]?.m ?? 1)}` : ''} = ${f3(r.contribution)} (drainage m = ${f2(r.m)})` })),
        { tex: `SN_{prov} = ${f2(layers.sn)} \\;\\ge\\; SN_{req} = ${f2(sn.res.SN)} \\;\\; ${layers.ok ? '\\checkmark' : '\\times'}` },
        ...(!layers.ok && Number.isFinite(layers.shortfall) ? [{ text: `Short by ${f3(layers.shortfall)} — thicken the base or subbase, or improve the drainage coefficients.` }] : []),
      ],
    },
  ]
}

