import { useState } from 'react'
import { designStair, type StairSupport } from '../engine/stair'
import { buildStairSolution } from '../lib/stairSolution'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { StairFlight } from '../components/stairSketches'

const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—')
const f0 = (n: number) => (Number.isFinite(n) ? Math.round(n).toString() : '—')

const SUPPORT: [StairSupport, string][] = [
  ['simple', 'Simply supported'], ['one-end', 'One end continuous'], ['both-ends', 'Both ends continuous'],
]
const K: Record<StairSupport, number> = { simple: 8, 'one-end': 9, 'both-ends': 11 }

export default function StairDesign() {
  const [span, setSpan] = useState(3.5)
  const [t, setT] = useState(150)
  const [R, setR] = useState(150)
  const [G, setG] = useState(300)
  const [fc, setFc] = useState(28)
  const [fy, setFy] = useState(415)
  const [barDia, setBarDia] = useState(12)
  const [distBarDia, setDistBarDia] = useState(10)
  const [cover, setCover] = useState(20)
  const [finishes, setFinishes] = useState(1.5)
  const [live, setLive] = useState(4.8)
  const [support, setSupport] = useState<StairSupport>('simple')

  const input = { span, t, R, G, fc, fy, barDia, distBarDia, cover, finishes, live, support }
  const r = designStair(input)
  const solution = buildStairSolution(input, r)
  const tRatio = t > 0 ? r.tMin / t : 0

  const report = {
    docCode: 'S-ST',
    ok: r.ok,
    governing: `Mu = ${f2(r.Mu)} kN·m/m · waist ${t} mm at ${f2(r.geom.thetaDeg)}°`,
    stats: [
      { label: 'Main steel', value: `⌀${barDia} @${f0(r.mainSpacing)}`, unit: 'mm' },
      // the distribution bar is its own diameter — this used to print the main ⌀
      { label: 'Distribution', value: `⌀${distBarDia} @${f0(r.distSpacing)}`, unit: 'mm' },
      { label: 'Effective depth d', value: f0(r.d), unit: 'mm' },
    ],
    checks: [
      { name: 'Waist thickness tmin/t', ratio: tRatio, ok: r.tMinOK },
    ],
    data: [
      ['Span (plan)', `${f2(span)} m`],
      ['Waist thickness t', `${t} mm`],
      ['Riser / going', `${R} / ${G} mm`],
      ['Inclination θ', `${f2(r.geom.thetaDeg)}°`],
      ["Concrete f'c", `${fc} MPa`],
      ['Steel fy', `${fy} MPa`],
      ['Cover / main ⌀ / distribution ⌀', `${cover} / ${barDia} / ${distBarDia} mm`],
      ['Finishes', `${f2(finishes)} kPa`],
      ['Live load', `${f2(live)} kPa`],
      ['Support', SUPPORT.find(([k]) => k === support)?.[1] ?? support],
      ['Design moment Mu', `${f2(r.Mu)} kN·m/m`],
      ['As main / distribution', `${f0(r.AsMain)} / ${f0(r.AsDist)} mm²/m`],
      ['Minimum waist tmin', `${f0(r.tMin)} mm`],
    ] as [string, string][],
    steps: solution,
  }

  return (
    <WorkspacePage title="Stair Flight" badges={['Concrete', 'NSCP 2015 · ACI 318-14']}
      intro="A waist-slab stair designed as a one-way slab per metre width. The inclined waist weighs γc·t/cosθ per plan area, the triangular treads add γc·R/2, and the moment is taken on the PLAN span — so the span here is horizontal, between the bearings."
      report={report}
      inputs={<>
        <InputGroup title="Flight geometry">
          {/* PLAN, not along the slope: the load is kPa of plan area, so the
              moment is w·L_plan²/k — and the drawing's span is horizontal. */}
          <Num label="Flight span (plan)" unit="m" value={span} onChange={setSpan} min={0.1} step="0.1" />
          <Num label="Waist t" unit="mm" value={t} onChange={setT} min={1} />
          <Num label="Riser R" unit="mm" value={R} onChange={setR} min={1} />
          <Num label="Going G" unit="mm" value={G} onChange={setG} min={1} />
          <div className="col-span-2">
            <Pick label="Support" value={support} onChange={setSupport} options={SUPPORT} />
          </div>
        </InputGroup>
        <InputGroup title="Loads" hint="NSCP Table 205-1 gives 4.8 kPa for stairs and exits.">
          <Num label="Finishes" unit="kPa" value={finishes} onChange={setFinishes} min={0} />
          <Num label="Live load" unit="kPa" value={live} onChange={setLive} min={0} />
        </InputGroup>
        <InputGroup title="Materials and bars">
          <Num label="f′c" unit="MPa" value={fc} onChange={setFc} min={1} />
          <Num label="fy" unit="MPa" value={fy} onChange={setFy} min={1} />
          <Num label="Main bar ⌀" unit="mm" value={barDia} onChange={setBarDia} min={1} />
          <Num label="Distribution ⌀" unit="mm" value={distBarDia} onChange={setDistBarDia} min={1} />
          <Num label="Cover" unit="mm" value={cover} onChange={setCover} min={0} />
        </InputGroup>
      </>}
      checks={<>
        <CheckCard title="Main steel" basis={`Mu = wu·L²/${K[support]}`} status={r.ok ? 'pass' : 'fail'}
          value={`⌀${barDia} @ ${f0(r.mainSpacing)}`} unit="mm"
          pairs={[{ label: 'Mu', value: `${f2(r.Mu)} kN·m/m` }, { label: 'As', value: `${f0(r.AsMain)} mm²/m` }]} />
        <CheckCard title="Waist thickness" basis={`t ≥ L/${support === 'simple' ? 20 : support === 'one-end' ? 24 : 28}`} status={r.tMinOK ? 'pass' : 'fail'}
          value={`${t}`} unit="mm" ratio={tRatio} ratioLabel="tmin ÷ t"
          pairs={[{ label: 'tmin', value: `${f0(r.tMin)} mm` }, { label: 'd', value: `${f0(r.d)} mm` }]} />
        <CheckCard title="Distribution steel" basis="0.0018·b·t" status="info"
          value={`⌀${distBarDia} @ ${f0(r.distSpacing)}`} unit="mm"
          pairs={[{ label: 'As', value: `${f0(r.AsDist)} mm²/m` }, { label: 'Cap', value: `${f0(Math.min(3 * t, 450))} mm` }]} />
      </>}
      summary={[
        { label: 'Flight', value: `${f2(span)} m plan, R ${R} × G ${G} mm, θ ${f2(r.geom.thetaDeg)}°` },
        { label: 'Waist', value: `${t} mm, cover ${cover} mm` },
        { label: 'Loads', value: `finishes ${f2(finishes)} kPa, live ${f2(live)} kPa` },
        { label: 'Materials', value: `f′c ${fc}, fy ${fy} MPa` },
      ]}
      drawing={{ title: 'Longitudinal section', node: <div data-pdf-drawing>
        <StairFlight span={span} t={t} R={R} G={G} cover={cover} barDia={barDia} distDia={distBarDia}
          mainSpacing={r.mainSpacing} distSpacing={r.distSpacing} support={support} />
      </div> }}
      resultsCaption={[
        ...r.inputNotes,
        'The landing and support detailing are checked separately; a continuous end also needs top steel this page does not size.',
      ].join(' ')}
      results={[
        { check: 'Slope', basis: 'θ = atan(R/G)', demand: `${f2(r.geom.thetaDeg)}°`, status: 'info' as const },
        { check: 'Dead load', basis: `waist ${f2(r.loads.waist)} + steps ${f2(r.loads.steps)} + finishes ${f2(r.loads.finishes)}`, demand: `${f2(r.loads.dead)} kPa`, status: 'info' as const },
        { check: 'Factored load', basis: '1.2D + 1.6L', demand: `${f2(r.loads.wu)} kPa`, status: 'info' as const },
        { check: 'Design moment', basis: `wu·L²/${K[support]}`, demand: `${f2(r.Mu)} kN·m/m`, status: 'info' as const },
        { check: 'Main steel', basis: `d = ${f0(r.d)} mm`, demand: `${f0(r.AsMain)} mm²/m`, limit: `⌀${barDia} @ ${f0(r.mainSpacing)}`, status: r.ok ? 'pass' as const : 'fail' as const },
        { check: 'Distribution steel', basis: '0.0018·b·t (§424.4.3.2)', demand: `${f0(r.AsDist)} mm²/m`, limit: `⌀${distBarDia} @ ${f0(r.distSpacing)}`, status: 'info' as const },
        { check: 'Minimum waist', basis: 'Table 409.3.1.1', demand: `${t} mm`, limit: `${f0(r.tMin)} mm`, ratio: tRatio, status: r.tMinOK ? 'pass' as const : 'fail' as const },
      ]}
      steps={solution}
      references={[
        { topic: 'Stair live load', basis: '4.8 kPa for stairs and exits', source: 'NSCP 2015 Table 205-1' },
        { topic: 'One-way slab thickness', basis: 'L/20, L/24, L/28 by continuity', source: 'NSCP 2015 Table 409.3.1.1 · ACI 318-14 Table 7.3.1.1' },
        { topic: 'Shrinkage and temperature steel', basis: '0.0018·Ag, spacing ≤ min(3t, 450)', source: 'NSCP 2015 §424.4.3 · ACI 318-14 §24.4.3' },
      ]}
    />
  )
}
