import { useState } from 'react'
import { designRockAnchor } from '../engine/rockAnchor'
import { buildRockAnchorSolution } from '../lib/geotechSolutions'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { AnchorDrawing } from '../components/groundSupportSketches'

const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—')
const f0 = (n: number) => (Number.isFinite(n) ? Math.round(n).toString() : '—')

export default function RockAnchor() {
  const [fpu, setFpu] = useState(1860)
  const [Aps, setAps] = useState(1000)
  const [holeDia, setHoleDia] = useState(0.115)
  const [bondLength, setBondLength] = useState(6)
  const [tauUlt, setTauUlt] = useState(700)
  const [T, setT] = useState(600)

  const r = designRockAnchor({ fpu, Aps, holeDia, bondLength, tauUlt, FS: 2, T })

  // Utilisation from the factor of safety, as in the other geotechnical pages.
  const solution = buildRockAnchorSolution({ fpu, Aps, holeDia, bondLength, tauUlt, FS: 2, T }, r)

  return (
    <WorkspacePage title="Rock Anchor" badges={['Geotechnical', 'PTI DC35.1']}
      intro="PTI DC35.1 / FHWA-IF-99-015 check: the prestressing tendon's design load (0.60·GUTS) and the grout-to-ground (rock socket) bond capacity against the applied anchor tension; the governing allowable is the smaller."
      inputs={<>
        <InputGroup title="Tendon">
          <Num label="Tendon fpu" unit="MPa" value={fpu} onChange={setFpu} />
          <Num label="Tendon area Aps" unit="mm²" value={Aps} onChange={setAps} />
          <Num label="Anchor tension T" unit="kN" value={T} onChange={setT} />
        </InputGroup>
        <InputGroup title="Bond zone">
          <Num label="Hole ⌀" unit="m" value={holeDia} onChange={setHoleDia} step="0.005" />
          <Num label="Bond length" unit="m" value={bondLength} onChange={setBondLength} />
          <Num label="Bond τult" unit="kPa" value={tauUlt} onChange={setTauUlt} />
        </InputGroup>
      </>}
      checks={<>
        <CheckCard title="Governing capacity" basis={`${r.governs === 'tendon' ? 'tendon' : 'ground bond'} governs`} status={r.ok ? 'pass' : 'fail'}
          value={f0(r.allowable)} unit="kN allowable" ratio={r.allowable > 0 ? T / r.allowable : undefined} ratioLabel="T ÷ allowable"
          pairs={[{ label: 'Tendon Td', value: `${f0(r.Td)} kN` }, { label: 'Bond (FS 2)', value: `${f0(r.Qall)} kN` }]} />
        <CheckCard title="Bond length" basis="for FS 2 on the bond" status={bondLength >= r.bondLengthReq ? 'pass' : 'fail'} value={f2(r.bondLengthReq)} unit="m required"
          pairs={[{ label: 'Provided', value: `${f2(bondLength)} m` }, { label: 'Proof load', value: `${f0(r.testLoad)} kN` }]} />
      </>}
      summary={[
        { label: 'Tendon', value: `fpu ${f2(fpu)} MPa, Aps ${f2(Aps)} mm²` },
        { label: 'Bond zone', value: `⌀${f2(holeDia)} m × ${f2(bondLength)} m, τ ${f2(tauUlt)} kPa` },
        { label: 'Tension', value: `${f2(T)} kN` },
      ]}
      drawing={{ title: 'Anchor bond zone', node: <div data-pdf-drawing><AnchorDrawing holeDia={holeDia} bondLength={bondLength} T={T} testLoad={r.testLoad} /></div> }}
      resultsCaption="Td = 0.60·GUTS (PTI permanent maximum). Proof load min(1.33·T, 0.80·GUTS). Provide the free length and corrosion protection separately."
      results={[
        { check: 'GUTS', basis: 'fpu Aps', demand: `${f0(r.GUTS)} kN`, status: 'info' as const },
        { check: 'Tendon design load', basis: '0.60 GUTS', demand: `${f0(T)} kN`, limit: `${f0(r.Td)} kN`, ratio: r.Td > 0 ? T / r.Td : undefined, status: r.tendonOK ? 'pass' as const : 'fail' as const },
        { check: 'Ground bond', basis: 'π D L τ / 2', demand: `${f0(T)} kN`, limit: `${f0(r.Qall)} kN`, ratio: r.Qall > 0 ? T / r.Qall : undefined, status: r.bondOK ? 'pass' as const : 'fail' as const },
        { check: 'Bond length', basis: 'for FS 2', demand: `${f2(r.bondLengthReq)} m`, limit: `${f2(bondLength)} m`, status: bondLength >= r.bondLengthReq ? 'pass' as const : 'fail' as const },
      ]}
      steps={solution}
      references={[
        { topic: 'Tendon', basis: '0.60 GUTS design, 0.80 GUTS test ceiling', source: 'PTI DC35.1, Recommendations for Prestressed Rock and Soil Anchors' },
        { topic: 'Bond', basis: 'π D L τult / FS', source: 'FHWA-IF-99-015, Ground Anchors and Anchored Systems (GEC-4)' },
      ]}
    />
  )
}
