import { useMemo, useState } from 'react'
import {
  searchCriticalCircle, surfaceY,
  type Pt, type SlopeSoil, type WaterModel,
} from '../engine/slopeStability'
import { buildSlopeSolution } from '../lib/slopeSolution'
import { infiniteSlopeFS } from '../engine/geotech'
import { buildInfiniteSlopeSolution } from '../lib/geotechPageSolutions'
import { SoilLayerPicker } from '../components/SoilLayerPicker'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { SlopeSection } from '../components/geotechSketches'

const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—')
const f0 = (n: number) => (Number.isFinite(n) ? Math.round(n).toString() : '—')

/** Build the ground polyline (left→right) from a simple slope geometry:
 *  crest plateau at height H, a face at angle β, then a toe plateau. */
function groundOf(H: number, betaDeg: number, crestW: number, toeW: number): Pt[] {
  const run = betaDeg > 0 && betaDeg < 90 ? H / Math.tan((betaDeg * Math.PI) / 180) : H
  return [{ x: 0, y: H }, { x: crestW, y: H }, { x: crestW + run, y: 0 }, { x: crestW + run + toeW, y: 0 }]
}

export default function SlopeStability() {
  const [H, setH] = useState(10)
  const [beta, setBeta] = useState(30)
  const [crestW, setCrestW] = useState(8)
  const [toeW, setToeW] = useState(12)
  const [c, setC] = useState(20)
  const [phi, setPhi] = useState(25)
  const [gamma, setGamma] = useState(18)
  const [ru, setRu] = useState(0)
  const [method, setMethod] = useState<'bishop' | 'fellenius' | 'janbu'>('bishop')
  // Infinite slope — moved here from the combined "Geotechnical toolkit" page.
  // It is a slope-stability method, so it belongs beside the method of slices
  // rather than three screens away next to bearing capacity.
  const [infZ, setInfZ] = useState(3)
  const [infSeepage, setInfSeepage] = useState(false)
  const [infGammaSat, setInfGammaSat] = useState(20)
  const infFS = useMemo(
    () => infiniteSlopeFS({ c, phiDeg: phi, gamma, z: infZ, betaDeg: beta, seepage: infSeepage, gammaSat: infGammaSat }),
    [c, phi, gamma, infZ, beta, infSeepage, infGammaSat])
  const infSteps = useMemo(
    () => buildInfiniteSlopeSolution({ c, phiDeg: phi, gamma, z: infZ, betaDeg: beta, seepage: infSeepage, gammaSat: infGammaSat }, infFS),
    [c, phi, gamma, infZ, beta, infSeepage, infGammaSat, infFS])

  const ground = useMemo(() => groundOf(H, beta, crestW, toeW), [H, beta, crestW, toeW])
  const soil: SlopeSoil = { c, phiDeg: phi, gamma }
  const water: WaterModel | undefined = ru > 0 ? { ru } : undefined

  const res = useMemo(() => searchCriticalCircle(ground, soil, { water, n: 30 }),
    [ground, c, phi, gamma, ru]) // eslint-disable-line react-hooks/exhaustive-deps
  const crit = res?.critical ?? null
  const FS = crit ? { bishop: crit.bishop.FS, fellenius: crit.fellenius.FS, janbu: crit.janbu.FS }[method] : NaN
  const govOK = FS >= 1.5

  // Utilisation from the factor of safety: 1.5 is the conventional long-term
  // requirement for a permanent slope, so FS_required / FS_achieved is ≤ 1
  // exactly when it passes.
  const slopeSteps = crit && res ? buildSlopeSolution({ H, beta, crestW, toeW, soil, ru, method }, res, crit) : []
  const METHOD_LABEL = { bishop: 'Bishop simplified', fellenius: 'Fellenius / OMS', janbu: 'Janbu simplified' } as const
  return (
    <WorkspacePage title="Slope Stability" badges={['Geotechnical', 'Bishop · Fellenius · Janbu']}
      intro="Circular-failure factor of safety by the method of slices — Fellenius/OMS, Bishop's simplified and Janbu's simplified — with a grid search for the critical circle (minimum Bishop FS), pore pressure via ru, and the infinite-slope check for a planar slide in a shallow mantle."
      inputs={<>
        <InputGroup title="Slope geometry">
          <Num label="Height H" unit="m" value={H} onChange={setH} />
          <Num label="Face angle β" unit="°" value={beta} onChange={setBeta} />
          <Num label="Crest width" unit="m" value={crestW} onChange={setCrestW} />
          <Num label="Toe width" unit="m" value={toeW} onChange={setToeW} />
        </InputGroup>
        <InputGroup title="Soil and water">
          <div className="col-span-2">
            <SoilLayerPicker want={['c', 'phiDeg', 'gamma']} onApply={(f) => {
              if (f.c != null) setC(f.c)
              if (f.phiDeg != null) setPhi(f.phiDeg)
              if (f.gamma != null) setGamma(f.gamma)
            }} />
          </div>
          <Num label="Cohesion c′" unit="kPa" value={c} onChange={setC} />
          <Num label="Friction φ′" unit="°" value={phi} onChange={setPhi} />
          <Num label="Unit weight γ" unit="kN/m³" value={gamma} onChange={setGamma} />
          <Num label="Pore ratio ru" value={ru} onChange={setRu} step="0.05" />
        </InputGroup>
        <InputGroup title="Reported method" hint="The circle is the minimum-Bishop circle; the method sets which FS is reported on it.">
          <div className="col-span-2">
            <Pick label="Method" value={method} onChange={(v) => setMethod(v as typeof method)}
              options={[['bishop', METHOD_LABEL.bishop], ['fellenius', METHOD_LABEL.fellenius], ['janbu', METHOD_LABEL.janbu]]} />
          </div>
        </InputGroup>
        <InputGroup title="Infinite slope" hint="A shallow mantle sliding parallel to the ground; uses c, φ, γ and β above.">
          <Num label="Failure depth z" unit="m" value={infZ} onChange={setInfZ} step="0.5" />
          {infSeepage ? <Num label="γ saturated" unit="kN/m³" value={infGammaSat} onChange={setInfGammaSat} step="0.5" /> : <div />}
          <label className="col-span-2 flex items-center gap-2 text-[12.5px] font-semibold text-ink">
            <input type="checkbox" checked={infSeepage} onChange={(e) => setInfSeepage(e.target.checked)} className="accent-brand" />
            Seepage parallel to the slope
          </label>
        </InputGroup>
      </>}
      checks={<>
        {crit ? <CheckCard title="Critical circle" basis={`${METHOD_LABEL[method]}, FS ≥ 1.5`} status={govOK ? 'pass' : FS >= 1 ? 'warn' : 'fail'}
          value={f2(FS)} unit="FS" formula="FS = Σ[(c b + (W − u b) tanφ) / mα] / Σ W sinα"
          ratio={FS > 0 ? 1.5 / FS : undefined} ratioLabel="Required 1.5 ÷ FS"
          pairs={[{ label: 'Bishop · Fellenius · Janbu', value: `${f2(crit.bishop.FS)} · ${f2(crit.fellenius.FS)} · ${f2(crit.janbu.FS)}` }, { label: 'R', value: `${f2(crit.circle.R)} m` }]} />
          : <CheckCard title="Critical circle" basis="grid search" status="warn" pillLabel="NONE" value="—" formula="No valid slip circle for this geometry — check the height, angle and plateau widths." />}
        <CheckCard title="Infinite slope" basis={infSeepage ? 'seepage parallel to slope' : 'dry'} status={infFS >= 1.5 ? 'pass' : infFS >= 1 ? 'warn' : 'fail'}
          value={Number.isFinite(infFS) ? f2(infFS) : '—'} unit="FS" ratio={infFS > 0 ? 1.5 / infFS : undefined} ratioLabel="Required 1.5 ÷ FS"
          pairs={[{ label: 'Depth z', value: `${f2(infZ)} m` }, { label: 'β', value: `${f2(beta)}°` }]} />
      </>}
      summary={[
        { label: 'Geometry', value: `H ${f2(H)} m, β ${f2(beta)}°` },
        { label: 'Plateaus', value: `crest ${f2(crestW)} m, toe ${f2(toeW)} m` },
        { label: 'Soil', value: `c′ ${f2(c)} kPa, φ′ ${f2(phi)}°, γ ${f2(gamma)} kN/m³` },
        { label: 'Pore pressure', value: `ru ${f2(ru)}` },
      ]}
      drawing={{ title: 'Slope and critical circle', node: <div data-pdf-drawing><SlopeSection ground={ground} circle={crit?.circle ?? null} slices={crit?.slices ?? []}
        FS={FS} method={METHOD_LABEL[method]} H={H} betaDeg={beta} surface={(x) => surfaceY(ground, x)} /></div> }}
      resultsCaption={crit ? `Bishop ${crit.bishop.converged ? 'converged' : 'did NOT converge'} in ${crit.bishop.iterations} iterations; ${crit.slices.length} slices; Janbu f₀ ${f2(crit.f0)}. FS < 1.5 is generally inadequate for a permanent slope — check the target for your load case.` : undefined}
      results={crit ? [
        { check: 'Bishop simplified', basis: 'moment equilibrium, iterated', demand: f2(crit.bishop.FS), limit: '1.50', ratio: 1.5 / crit.bishop.FS, status: crit.bishop.FS >= 1.5 ? 'pass' as const : 'fail' as const },
        { check: 'Fellenius / OMS', basis: 'no inter-slice forces', demand: f2(crit.fellenius.FS), limit: '1.50', ratio: 1.5 / crit.fellenius.FS, status: crit.fellenius.FS >= 1.5 ? 'pass' as const : 'fail' as const },
        { check: 'Janbu simplified', basis: `force equilibrium × f₀ ${f2(crit.f0)}`, demand: f2(crit.janbu.FS), limit: '1.50', ratio: 1.5 / crit.janbu.FS, status: crit.janbu.FS >= 1.5 ? 'pass' as const : 'fail' as const },
        { check: 'Critical circle', basis: '(xc, yc, R)', demand: `(${f2(crit.circle.xc)}, ${f2(crit.circle.yc)}, ${f2(crit.circle.R)}) m`, status: 'info' as const },
        { check: 'Driving / resisting', basis: 'Bishop', demand: `${f0(crit.bishop.driving)} / ${f0(crit.bishop.resisting)} kN·m/m`, status: 'info' as const },
        { check: 'Infinite slope', basis: `z ${f2(infZ)} m`, demand: f2(infFS), limit: '1.50', ratio: infFS > 0 ? 1.5 / infFS : undefined, status: infFS >= 1.5 ? 'pass' as const : 'fail' as const },
      ] : [{ check: 'Infinite slope', basis: `z ${f2(infZ)} m`, demand: f2(infFS), status: infFS >= 1.5 ? 'pass' as const : 'fail' as const }]}
      steps={[...slopeSteps, ...infSteps]}
      references={[
        { topic: 'Method of slices', basis: 'Fellenius (OMS), Bishop simplified, Janbu simplified', source: 'Bishop (1955); Janbu (1954); Abramson et al., Slope Stability and Stabilization' },
        { topic: 'Pore pressure', basis: 'ru = u / γh', source: 'Bishop & Morgenstern (1960)' },
        { topic: 'Infinite slope', basis: 'planar slide parallel to the ground', source: 'Das, Principles of Geotechnical Engineering' },
      ]}
    />
  )
}
