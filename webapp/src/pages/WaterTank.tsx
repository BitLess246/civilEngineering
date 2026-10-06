import { useState } from 'react'
import { designCircularTank } from '../engine/waterTank'
import { buildWaterTankSolution } from '../lib/waterTankSolution'
import { TankSection } from '../components/TankSection'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'

const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—')
const f0 = (n: number) => (Number.isFinite(n) ? Math.round(n).toString() : '—')

export default function WaterTank() {
  const [H, setH] = useState(4)
  const [D, setD] = useState(10)
  const [t, setT] = useState(250)
  const [freeboard, setFreeboard] = useState(0.3)
  const [fc, setFc] = useState(28)
  const [sigmaSt, setSigmaSt] = useState(130)
  const [sigmaCt, setSigmaCt] = useState(1.3)
  const [cover, setCover] = useState(40)
  const [barDia, setBarDia] = useState(16)

  const r = designCircularTank({ H, D, t, freeboard, fc, sigmaSt, sigmaCt, cover, barDia })

  const solution = buildWaterTankSolution({ H, D, t, freeboard, fc, sigmaSt, sigmaCt, cover, barDia }, r)

  const report = {
    docCode: 'S-WT',
    ok: r.thicknessOK && r.freeboardOK,
    governing: `Hoop tension T = ${f2(r.T)} kN/m at base · concrete tensile stress ${f2(r.fct)} MPa`,
    stats: [
      { label: 'Hoop steel', value: `⌀${barDia} @${f0(r.hoopSpacing)}`, unit: 'mm' },
      { label: 'Vertical steel', value: `⌀${barDia} @${f0(r.vertSpacing)}`, unit: 'mm' },
      { label: 'Hoop tension T', value: f2(r.T), unit: 'kN/m' },
    ],
    checks: [
      // Serviceability governs a liquid-retaining wall: the wall is sized so
      // uncracked concrete carries the ring tension, not so steel yields late.
      { name: 'Concrete tensile stress fct/σct', ratio: sigmaCt > 0 ? r.fct / sigmaCt : 0, ok: r.thicknessOK },
    ],
    data: [
      ['Water depth H', `${f2(H)} m`],
      ['Internal diameter D', `${f2(D)} m`],
      ['Wall thickness t', `${t} mm`],
      ['Freeboard', `${f2(freeboard)} m${r.freeboardOK ? '' : ' — below recommended'}`],
      ["Concrete f'c", `${fc} MPa`],
      ['Permissible steel stress σst', `${sigmaSt} MPa`],
      ['Permissible concrete tension σct', `${sigmaCt} MPa`],
      ['Cover / bar ⌀', `${cover} / ${barDia} mm`],
      ['Effective depth d', `${f0(r.d)} mm`],
      ['Base moment M', `${f2(r.M)} kN·m/m`],
      ['Hoop As', `${f0(r.hoopAs)} mm²/m`],
      ['Vertical As', `${f0(r.vertAs)} mm²/m`],
      ['Concrete tensile stress fct', `${f2(r.fct)} MPa`],
    ] as [string, string][],
    steps: solution,
  }

  const fctRatio = sigmaCt > 0 ? r.fct / sigmaCt : undefined
  return (
    <WorkspacePage title="Circular Water Tank" badges={['Concrete', 'IS 3370 · ACI 350']}
      intro="Working-stress design of a circular liquid-retaining wall, following the crack-control approach of IS 3370 and ACI 350. Ring tension sets the horizontal steel, the base cantilever moment the vertical steel, and the wall is checked so that uncracked concrete can carry the ring tension."
      report={report}
      inputs={<>
        <InputGroup title="Geometry">
          <Num label="Water depth H" unit="m" value={H} onChange={setH} min={0.1} />
          <Num label="Internal diameter D" unit="m" value={D} onChange={setD} min={0.1} />
          <Num label="Wall thickness t" unit="mm" value={t} onChange={setT} min={1} />
          <Num label="Freeboard" unit="m" value={freeboard} onChange={setFreeboard} step="0.05" min={0} />
        </InputGroup>
        <InputGroup title="Materials and permissible stresses" hint="σst of about 115–150 MPa controls crack width.">
          <Num label="f′c" unit="MPa" value={fc} onChange={setFc} min={1} />
          <Num label="σst (steel)" unit="MPa" value={sigmaSt} onChange={setSigmaSt} min={1} />
          <Num label="σct (concrete)" unit="MPa" value={sigmaCt} onChange={setSigmaCt} step="0.1" min={0.1} />
          <Num label="Bar ⌀" unit="mm" value={barDia} onChange={setBarDia} min={1} />
          <Num label="Cover" unit="mm" value={cover} onChange={setCover} min={0} />
        </InputGroup>
      </>}
      checks={<>
        <CheckCard title="Wall thickness" basis="fct = T / (Ac + (n − 1)As) ≤ σct" status={r.thicknessOK ? 'pass' : 'fail'}
          value={f2(r.fct)} unit="MPa" ratio={fctRatio} ratioLabel="fct ÷ σct"
          pairs={[{ label: 'σct', value: `${f2(sigmaCt)} MPa` }, { label: 'T at base', value: `${f2(r.T)} kN/m` }]} />
        <CheckCard title="Ring steel" basis="As = T / σst" status="info"
          value={`⌀${barDia} @ ${f0(r.hoopSpacing)}`} unit="mm"
          pairs={[{ label: 'As', value: `${f0(r.hoopAs)} mm²/m` }, { label: 'Placed', value: 'total, both faces' }]} />
        <CheckCard title="Vertical steel" basis="As = M / (σst·j·d)" status="info"
          value={`⌀${barDia} @ ${f0(r.vertSpacing)}`} unit="mm"
          pairs={[{ label: 'M at base', value: `${f2(r.M)} kN·m/m` }, { label: 'As', value: `${f0(r.vertAs)} mm²/m` }]} />
        <CheckCard title="Freeboard" basis="≥ 300 mm" status={r.freeboardOK ? 'pass' : 'warn'}
          value={f2(freeboard)} unit="m" />
      </>}
      summary={[
        { label: 'Tank', value: `⌀${f2(D)} m internal, ${f2(H)} m water, ${f2(freeboard)} m freeboard` },
        { label: 'Wall', value: `${t} mm, cover ${cover} mm, ⌀${barDia} bars` },
        { label: 'Stresses', value: `σst ${sigmaSt} MPa, σct ${f2(sigmaCt)} MPa, f′c ${fc} MPa` },
      ]}
      drawing={{ title: 'Wall section and ring plan', node: <div data-pdf-drawing>
        <TankSection H={H} D={D} t={t} freeboard={freeboard} T={r.T}
          hoopBars={`⌀${barDia} @ ${f0(r.hoopSpacing)} mm (total)`}
          vertBars={`⌀${barDia} @ ${f0(r.vertSpacing)} mm`} />
      </div> }}
      resultsCaption={[
        ...r.inputNotes,
        'The ring-steel spacing carries the WHOLE As = T/σst; split between the two faces, each face is at twice that spacing. Ring steel may be reduced up the wall as T = γw·z·D/2 falls. The base slab, roof and wall–base joint are designed separately.',
      ].join(' ')}
      results={[
        { check: 'Ring tension at base', basis: 'T = γw·H·D/2', demand: `${f2(r.T)} kN/m`, status: 'info' as const },
        { check: 'Ring steel', basis: `T/σst · ⌀${barDia}`, demand: `${f0(r.hoopAs)} mm²/m`, limit: `@ ${f0(r.hoopSpacing)} mm total`, status: 'info' as const },
        { check: 'Base cantilever moment', basis: 'M = γw·H³/6', demand: `${f2(r.M)} kN·m/m`, status: 'info' as const },
        { check: 'Vertical steel', basis: `M/(σst·j·d), d ${f0(r.d)} mm`, demand: `${f0(r.vertAs)} mm²/m`, limit: `@ ${f0(r.vertSpacing)} mm`, status: 'info' as const },
        { check: 'Concrete tension', basis: 'uncracked ring', demand: `${f2(r.fct)} MPa`, limit: `${f2(sigmaCt)} MPa`, ratio: fctRatio, status: r.thicknessOK ? 'pass' as const : 'fail' as const },
        { check: 'Freeboard', basis: '≥ 0.30 m', demand: `${f2(freeboard)} m`, limit: '0.30 m', status: r.freeboardOK ? 'pass' as const : 'warn' as const },
      ]}
      steps={solution}
      references={[
        { topic: 'Liquid-retaining structures', basis: 'working stress, crack control', source: 'IS 3370-2 · ACI 350' },
        { topic: 'Ring tension', basis: 'membrane hoop force γw·z·D/2', source: 'Timoshenko, Theory of Plates and Shells' },
      ]}
    />
  )
}
