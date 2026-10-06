import { useMemo, useState } from 'react'
import {
  consolidationSettlement, elasticSettlement, schmertmannSettlement,
  effectiveStress, stressUnderRect, stress2to1,
  timeToConsolidation, consolidationAfter, drainagePath,
  type SoilLayer,
} from '../engine/settlement'
import { buildSettlementSolution } from '../lib/settlementSolution'
import { SoilProfile } from '../components/SoilProfile'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { StressDepth } from '../components/geotechSketches'

const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—')
const f1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '—')
const f0 = (n: number) => (Number.isFinite(n) ? Math.round(n).toString() : '—')

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
  // the serviceability limit is the engineer's project decision, entered here
  // rather than asserted: 25 mm is common for an isolated footing
  const [limit, setLimit] = useState(25)
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

  const zMax = Math.max(totalDepth, 2 * B)
  const stressCurve = Array.from({ length: 61 }, (_, i) => {
    const z = (zMax * i) / 60
    return { z, b: stressUnderRect(q, B, L, z), t: stress2to1(q, B, L, z) }
  })
  const LAYER_FIELDS = [
    ['H', 'Thickness H', 'm'], ['gamma', 'γ', 'kN/m³'], ['gammaSat', 'γ sat', 'kN/m³'], ['e0', 'e₀', ''],
    ['Cc', 'Cc', ''], ['sigmaP', "σ′p", 'kPa'], ['cv', 'cv', 'm²/yr'],
  ] as const
  return (
    <WorkspacePage title="Foundation Settlement" badges={['Geotechnical', 'Boussinesq · Terzaghi · Schmertmann']}
      intro="Immediate (elastic and Schmertmann) plus primary consolidation settlement of a rectangular footing on a layered profile. Stress increase by Boussinesq; consolidation layer by layer with the overconsolidated branch handled separately, so a stiff crust is not charged virgin compression it will never see."
      inputs={<>
        <InputGroup title="Footing and groundwater">
          <Num label="Pressure q" unit="kPa" value={q} onChange={setQ} />
          <Num label="Founding depth Df" unit="m" value={Df} onChange={setDf} step="0.1" />
          <Num label="Width B" unit="m" value={B} onChange={setB} step="0.1" />
          <Num label="Length L" unit="m" value={L} onChange={setL} step="0.1" />
          <Num label="Water table" unit="m" value={wt} onChange={setWt} step="0.5" />
          <Num label="Time horizon" unit="yr" value={years} onChange={setYears} step="1" />
        </InputGroup>
        <InputGroup title="Immediate settlement">
          <Num label="Modulus Es" unit="kPa" value={Es} onChange={setEs} step="1000" />
          <Num label="Poisson ν" value={nu} onChange={setNu} step="0.05" />
        </InputGroup>
        {layers.map((l, i) => (
          <InputGroup key={i} title={l.name ?? `Layer ${i + 1}`} hint={i === 0 ? 'e₀ or Cc at 0: the layer carries overburden only. σ′p at 0: normally consolidated. Cr defaults to Cc/6.' : undefined}>
            {LAYER_FIELDS.map(([key, label, unit]) => (
              <Num key={key} label={label} unit={unit || undefined}
                value={key === 'gammaSat' ? (l.gammaSat ?? l.gamma) : (l[key] ?? 0)}
                onChange={(v) => setLayer(i, { [key]: v } as Partial<SoilLayer>)} step="any" />
            ))}
          </InputGroup>
        ))}
        <InputGroup title="Serviceability">
          <Num label="Settlement limit" unit="mm" value={limit} onChange={setLimit} step="5" hint="a project decision" />
        </InputGroup>
      </>}
      checks={<>
        <CheckCard title="Total settlement" basis={`against the ${f0(limit)} mm limit entered`} status={total <= limit ? 'pass' : 'fail'}
          value={f1(total)} unit="mm" formula="S = S_elastic + S_consolidation" ratio={limit > 0 ? total / limit : undefined} ratioLabel="Total ÷ limit"
          pairs={[{ label: 'Immediate', value: `${f1(elastic)} mm` }, { label: 'Consolidation', value: `${f1(cons.total)} mm` }]} />
        <CheckCard title="Time rate" basis={govSoil ? `governed by ${govSoil.name ?? `layer ${govLayer + 1}`}` : 'no consolidating layer'} status="info"
          value={`${f0(Uat * 100)} %`} unit={`at ${f0(years)} yr`}
          pairs={[{ label: 't₉₀', value: Number.isFinite(t90) ? `${f1(t90)} yr` : 'cv not given' }, { label: 'Drainage path', value: govSoil ? `${f2(drainagePath(govSoil))} m` : '—' }]} />
        <CheckCard title="Schmertmann" basis="strain-influence method" status="info" value={f1(schmert.settlement)} unit="mm"
          pairs={[{ label: 'C₁ · C₂', value: `${f2(schmert.C1)} · ${f2(schmert.C2)}` }, { label: 'Izp', value: f2(schmert.Izp) }]} />
      </>}
      summary={[
        { label: 'Footing', value: `${f2(B)} × ${f2(L)} m at ${f2(Df)} m, q ${f1(q)} kPa` },
        { label: 'Water table', value: `${f2(wt)} m` },
        { label: 'Elastic', value: `Es ${f0(Es)} kPa, ν ${f2(nu)}` },
        { label: 'Profile', value: `${f2(totalDepth)} m in ${layers.length} layers` },
      ]}
      drawing={{ title: 'Soil profile and stress decay', node: <div data-pdf-drawing className="space-y-4">
        <SoilProfile
          layers={cons.layers.map((l, i) => ({ name: l.name || `Layer ${i + 1}`, zTop: l.zTop, H: l.H, dSigma: l.dSigma, sigma0: l.sigma0, settlement: l.settlement }))}
          Df={Df} B={B} waterTable={wt} q={q} governing={govLayer} />
        <StressDepth q={q} zMax={zMax} curve={stressCurve} />
      </div> }}
      resultsCaption="Sc = Cc·H/(1+e₀)·log₁₀(σ′f/σ′₀) on the virgin branch, Cr while σ′f stays below σ′p, both terms when the increment crosses σ′p; each layer is sliced 20 ways so Δσ is integrated rather than sampled at mid-height."
      results={[
        ...cons.layers.map((l) => ({ check: l.name, basis: `z ${f2(l.zMid)} m · σ′₀ ${f1(l.sigma0)} · Δσ ${f1(l.dSigma)} kPa · ${l.branch}`, demand: `${f1(l.settlement)} mm`, status: 'info' as const })),
        { check: 'Immediate (elastic)', basis: 'q B (1 − ν²) If / Es', demand: `${f1(elastic)} mm`, status: 'info' as const },
        { check: 'Total', basis: `limit ${f0(limit)} mm`, demand: `${f1(total)} mm`, limit: `${f0(limit)} mm`, ratio: limit > 0 ? total / limit : undefined, status: total <= limit ? 'pass' as const : 'fail' as const },
      ]}
      steps={solution}
      references={[
        { topic: 'Stress increase', basis: 'Boussinesq under a rectangle; 2:1 spread', source: 'Boussinesq (1885); Das, Principles of Foundation Engineering' },
        { topic: 'Consolidation', basis: 'Cc/Cr branches about σ′p; Terzaghi time factor', source: 'Terzaghi (1925); Das, Ch. 11' },
        { topic: 'Immediate settlement', basis: 'elastic and Schmertmann strain influence', source: 'Schmertmann et al. (1978)' },
      ]}
    />
  )
}
