import { useState } from 'react'
import { designSoilNail } from '../engine/soilNail'
import { buildSoilNailSolution } from '../lib/geotechSolutions'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { SoilNailDrawing } from '../components/groundSupportSketches'

const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—')

export default function SoilNail() {
  const [z, setZ] = useState(6)
  const [Sh, setSh] = useState(1.5)
  const [Sv, setSv] = useState(1.5)
  const [gamma, setGamma] = useState(18)
  const [phi, setPhi] = useState(30)
  const [q, setQ] = useState(10)
  const [barDia, setBarDia] = useState(25)
  const [fy, setFy] = useState(415)
  const [drillDia, setDrillDia] = useState(0.15)
  const [bondLength, setBondLength] = useState(6)
  const [qu, setQu] = useState(150)

  const r = designSoilNail({
    z, Sh, Sv, gamma, phiDeg: phi, surcharge: q, barDia, fy,
    drillDia, bondLength, qu, FSpullout: 2.0, FStensile: 1.8,
  })

  // A geotechnical check states a FACTOR OF SAFETY, not a demand/capacity
  // ratio, so the report's utilisation is FS_required / FS_achieved — which is
  // ≤ 1 exactly when the design passes, matching every other check in the app.
  const solution = buildSoilNailSolution({ z, Sh, Sv, gamma, phiDeg: phi, surcharge: q, barDia, fy, drillDia, bondLength, qu, FSpullout: 2.0, FStensile: 1.8 }, r)

  const lenOK = bondLength >= r.bondLengthReq
  return (
    <WorkspacePage title="Soil Nail" badges={['Geotechnical', 'FHWA GEC-7']}
      intro="Preliminary FHWA GEC-7 checks for a single nail: the tributary active demand against the bar's tensile and the grout-to-ground pullout capacities. Global (slip-surface) stability is separate — use the slope-stability tool."
      inputs={<>
        <InputGroup title="Geometry and soil">
          <Num label="Nail depth z" unit="m" value={z} onChange={setZ} />
          <Num label="Surcharge q" unit="kPa" value={q} onChange={setQ} />
          <Num label="Spacing Sh" unit="m" value={Sh} onChange={setSh} />
          <Num label="Spacing Sv" unit="m" value={Sv} onChange={setSv} />
          <Num label="Unit weight γ" unit="kN/m³" value={gamma} onChange={setGamma} />
          <Num label="Friction φ" unit="°" value={phi} onChange={setPhi} />
        </InputGroup>
        <InputGroup title="Nail and grout">
          <Num label="Bar ⌀" unit="mm" value={barDia} onChange={setBarDia} />
          <Num label="Bar fy" unit="MPa" value={fy} onChange={setFy} />
          <Num label="Drill hole DDH" unit="m" value={drillDia} onChange={setDrillDia} step="0.01" />
          <Num label="Bond length Le" unit="m" value={bondLength} onChange={setBondLength} />
          <Num label="Bond strength qu" unit="kPa" value={qu} onChange={setQu} />
        </InputGroup>
      </>}
      checks={<>
        <CheckCard title="Bar tensile" basis="FS ≥ 1.8" status={r.tensileOK ? 'pass' : 'fail'} value={f2(r.fsTensile)} unit="FS"
          formula="Tn = Ab fy" ratio={r.fsTensile > 0 ? 1.8 / r.fsTensile : undefined} ratioLabel="Required 1.8 ÷ FS"
          pairs={[{ label: 'Tn', value: `${f2(r.Tn)} kN` }, { label: 'Tmax', value: `${f2(r.Tmax)} kN` }]} />
        <CheckCard title="Pullout" basis="FS ≥ 2.0" status={r.pulloutOK ? 'pass' : 'fail'} value={f2(r.fsPullout)} unit="FS"
          formula="Qult = π DDH Le qu" ratio={r.fsPullout > 0 ? 2 / r.fsPullout : undefined} ratioLabel="Required 2.0 ÷ FS"
          pairs={[{ label: 'Qult', value: `${f2(r.Qult)} kN` }, { label: 'Le required', value: `${f2(r.bondLengthReq)} m` }]} />
      </>}
      summary={[
        { label: 'Nail', value: `z ${f2(z)} m, ${f2(Sh)} × ${f2(Sv)} m grid` },
        { label: 'Soil', value: `γ ${f2(gamma)} kN/m³, φ ${f2(phi)}°, q ${f2(q)} kPa` },
        { label: 'Bar', value: `⌀${barDia} mm, fy ${fy} MPa` },
        { label: 'Grout', value: `DDH ${f2(drillDia)} m, Le ${f2(bondLength)} m, qu ${f2(qu)} kPa` },
      ]}
      drawing={{ title: 'Nail tributary area and section', node: <div data-pdf-drawing><SoilNailDrawing z={z} Sh={Sh} Sv={Sv} bondLength={bondLength} drillDia={drillDia} Ka={r.Ka} gamma={gamma} q={q} Tmax={r.Tmax} /></div> }}
      resultsCaption="Tmax is the tributary active load on one nail at depth z. Provide Le beyond the slip surface; this is a preliminary component check — verify global stability separately."
      results={[
        { check: 'Active coefficient', basis: 'Rankine', demand: f2(r.Ka), status: 'info' as const },
        { check: 'Nail demand Tmax', basis: 'Ka (γz + q) Sh Sv', demand: `${f2(r.Tmax)} kN`, status: 'info' as const },
        { check: 'Bar tensile', basis: 'Tn / Tmax ≥ 1.8', demand: `${f2(r.Tmax)} kN`, limit: `${f2(r.Tn / 1.8)} kN`, ratio: r.fsTensile > 0 ? 1.8 / r.fsTensile : undefined, status: r.tensileOK ? 'pass' as const : 'fail' as const },
        { check: 'Pullout', basis: 'Qult / Tmax ≥ 2.0', demand: `${f2(r.Tmax)} kN`, limit: `${f2(r.Qult / 2)} kN`, ratio: r.fsPullout > 0 ? 2 / r.fsPullout : undefined, status: r.pulloutOK ? 'pass' as const : 'fail' as const },
        { check: 'Bond length', basis: 'for FS 2.0', demand: `${f2(r.bondLengthReq)} m`, limit: `${f2(bondLength)} m`, status: lenOK ? 'pass' as const : 'fail' as const },
      ]}
      steps={solution}
      references={[
        { topic: 'Soil nail walls', basis: 'nail tensile and pullout checks, FS 1.8 and 2.0', source: 'FHWA-NHI-14-007, GEC No. 7 Soil Nail Walls' },
        { topic: 'Bond strength', basis: 'qu by soil type and drilling method', source: 'FHWA GEC-7' },
      ]}
    />
  )
}
