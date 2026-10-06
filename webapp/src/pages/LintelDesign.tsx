import { useState } from 'react'
import { designLintel } from '../engine/lintel'
import { LintelElevation } from '../components/LintelElevation'
import { BeamSchematic } from '../components/BeamSchematic'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { buildLintelSolution } from '../lib/lintelSolution'

const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—')
const f0 = (n: number) => (Number.isFinite(n) ? Math.round(n).toString() : '—')

export default function LintelDesign() {
  const [opening, setOpening] = useState(2.0)
  const [bearing, setBearing] = useState(200)
  const [b, setB] = useState(200)
  const [h, setH] = useState(300)
  const [cover, setCover] = useState(40)
  const [barDia, setBarDia] = useState(12)
  const [stirrupDia, setStirrupDia] = useState(10)
  const [fc, setFc] = useState(21)
  const [fy, setFy] = useState(415)
  const [wallThickness, setWallThickness] = useState(150)
  const [wallHeightAbove, setWallHeightAbove] = useState(2.4)
  const [wallUnitWeight, setWallUnitWeight] = useState(21)
  const [archAngleDeg, setArchAngleDeg] = useState(60)
  const [udlAbove, setUdlAbove] = useState(0)
  const [live, setLive] = useState(0)

  const input = {
    opening, bearing, b, h, cover, barDia, stirrupDia, fc, fy,
    wallThickness, wallHeightAbove, wallUnitWeight, archAngleDeg, udlAbove, live,
  }
  const r = designLintel(input)
  const d = r.design
  const bars = `${d.bars}-⌀${barDia}`
  // §409.6.3.1: below φVc/2 the code asks for no shear steel at all. Printing
  // "⌀10 @ 0 mm" for that is a spacing nobody can build; say what the check
  // actually found, and say what practice does about it.
  const stirrups = d.sAdopt > 0
    ? `⌀${stirrupDia} @ ${f0(d.sAdopt)} mm`
    : 'not required (Vu ≤ φVc/2)'

  const report = {
    docCode: 'S-LT',
    ok: r.ok,
    governing: r.loads.arching
      ? `arching triangle · ${f2(r.loads.masonry)} kN of wall over a ${f2(r.span)} m span`
      : `NO arch — the whole rectangle, ${f2(r.loads.masonry)} kN over a ${f2(r.span)} m span`,
    stats: [
      { label: 'Main steel', value: bars, unit: '' },
      { label: 'Design moment', value: f2(r.Mu), unit: 'kN·m' },
      { label: 'Stirrups', value: d.sAdopt > 0 ? `⌀${stirrupDia} @${f0(d.sAdopt)}` : 'none req.', unit: d.sAdopt > 0 ? 'mm' : '' },
    ],
    checks: [
      { name: 'Flexure Mu/φMn', ratio: d.phiMnMax > 0 ? r.Mu / d.phiMnMax : 0, ok: d.flexOK },
      { name: 'Bearing on jamb', ratio: r.bearingLimit > 0 ? r.bearingStress / r.bearingLimit : 0, ok: r.bearingOK },
    ],
    data: [
      ['Clear opening', `${f2(opening)} m`],
      ['Bearing each end', `${bearing} mm`],
      ['Effective span (§6.3.2.1)', `${f2(r.span)} m`],
      ['Lintel section', `${b} × ${h} mm`],
      ['Wall thickness / height above', `${wallThickness} mm / ${f2(wallHeightAbove)} m`],
      ['Masonry unit weight', `${f2(wallUnitWeight)} kN/m³`],
      ['Arch base angle', `${f0(archAngleDeg)}°`],
      ['Arch forms?', r.loads.arching ? `yes — triangle ${f2(r.loads.triangleHeight)} m tall` : 'no — wall too short'],
      ['Masonry on the lintel', `${f2(r.loads.masonry)} kN`],
      ['Lintel self weight', `${f2(r.loads.selfWeight)} kN/m`],
      ...(r.loads.udlArched > 0
        ? [['Load carried round by the arch', `${f2(r.loads.udlArched)} kN/m`] as [string, string]]
        : []),
      ['Design moment Mu', `${f2(r.Mu)} kN·m`],
      ['Design shear Vu', `${f2(r.Vu)} kN`],
      ['As required', `${f0(d.As)} mm²`],
      ['Bearing stress', `${f2(r.bearingStress)} / ${f2(r.bearingLimit)} MPa`],
    ] as [string, string][],
    steps: buildLintelSolution(input, r),
  }

  const flexRatio = d.phiMnMax > 0 ? r.Mu / d.phiMnMax : 0
  const brgRatio = r.bearingLimit > 0 ? r.bearingStress / r.bearingLimit : 0
  return (
    <WorkspacePage title="Lintel Beam" badges={['Concrete', 'NSCP 2015 · ACI 318-14']}
      intro="A lintel is an ordinary RC beam; what makes it its own calculation is the load. Masonry over an opening arches: a triangle of wall bears on the lintel and the rest is carried round to the jambs — unless the wall above is too short for the arch to close, when the whole rectangle comes down instead. That case is decided here from the geometry."
      report={report}
      inputs={<>
        <InputGroup title="Opening and lintel">
          <Num label="Clear opening" unit="m" value={opening} onChange={setOpening} />
          <Num label="Bearing each end" unit="mm" value={bearing} onChange={setBearing} />
          <Num label="Width b" unit="mm" value={b} onChange={setB} />
          <Num label="Depth h" unit="mm" value={h} onChange={setH} />
        </InputGroup>
        <InputGroup title="The wall it carries">
          <Num label="Wall thickness" unit="mm" value={wallThickness} onChange={setWallThickness} />
          <Num label="Height above" unit="m" value={wallHeightAbove} onChange={setWallHeightAbove} />
          <Num label="Masonry unit wt" unit="kN/m³" value={wallUnitWeight} onChange={setWallUnitWeight} />
          <Num label="Arch base angle" unit="°" value={archAngleDeg} onChange={setArchAngleDeg} />
          <Num label="Other dead load" unit="kN/m" value={udlAbove} onChange={setUdlAbove} />
          <Num label="Live line load" unit="kN/m" value={live} onChange={setLive} />
        </InputGroup>
        <InputGroup title="Materials">
          <Num label="f′c" unit="MPa" value={fc} onChange={setFc} />
          <Num label="fy" unit="MPa" value={fy} onChange={setFy} />
          <Num label="Main bar ⌀" unit="mm" value={barDia} onChange={setBarDia} />
          <Num label="Stirrup ⌀" unit="mm" value={stirrupDia} onChange={setStirrupDia} />
          <Num label="Cover" unit="mm" value={cover} onChange={setCover} />
        </InputGroup>
      </>}
      checks={<>
        <CheckCard title="Load path" basis={r.loads.arching ? 'masonry arches' : 'no arch — whole rectangle'} status={r.loads.arching ? 'pass' : 'warn'}
          pillLabel={r.loads.arching ? 'ARCHING' : 'NO ARCH'} value={f2(r.loads.masonry)} unit="kN on the lintel"
          pairs={[{ label: 'Triangle height', value: r.loads.arching ? `${f2(r.loads.triangleHeight)} m` : '—' }, { label: 'Span', value: `${f2(r.span)} m` }]} />
        <CheckCard title="Flexure" basis="Mu ≤ φMn" status={d.flexOK ? 'pass' : 'fail'} value={bars} ratio={flexRatio} ratioLabel="Mu ÷ φMn"
          pairs={[{ label: 'Mu', value: `${f2(r.Mu)} kN·m` }, { label: 'Stirrups', value: stirrups }]} />
        <CheckCard title="Bearing on the jamb" basis="φ(0.85f′c)" status={r.bearingOK ? 'pass' : 'fail'} value={f2(r.bearingStress)} unit="MPa"
          ratio={brgRatio} ratioLabel="Stress ÷ limit" pairs={[{ label: 'Limit', value: `${f2(r.bearingLimit)} MPa` }, { label: 'Vu', value: `${f2(r.Vu)} kN` }]} />
      </>}
      summary={[
        { label: 'Opening', value: `${f2(opening)} m clear, ${bearing} mm bearings` },
        { label: 'Lintel', value: `${b} × ${h} mm, cover ${cover} mm` },
        { label: 'Wall above', value: `${wallThickness} mm × ${f2(wallHeightAbove)} m, ${f2(wallUnitWeight)} kN/m³` },
        { label: 'Materials', value: `f′c ${fc}, fy ${fy} MPa; ⌀${barDia} bars, ⌀${stirrupDia} stirrups` },
      ]}
      drawing={{ title: 'Elevation — what reaches the lintel', node: <div data-pdf-drawing className="space-y-3">
        <LintelElevation
          opening={opening} span={r.span} bearing={bearing} b={b} h={h}
          wallHeightAbove={wallHeightAbove} triangleHeight={r.loads.triangleHeight}
          arching={r.loads.arching} masonry={r.loads.masonry}
          bars={d.sAdopt > 0 ? `${bars} · ⌀${stirrupDia} @${f0(d.sAdopt)}` : bars} />
        <div className="border-t border-hairline-2 pt-3">
          <p className="mb-1 text-[11px] font-semibold text-brand">SECTION</p>
          <BeamSchematic b={b} h={h} cover={cover} barDia={barDia} stirrupDia={stirrupDia}
            bars={d.bars} d={d.d} layers={d.layers} comprLayers={d.comprLayers}
            comprBars={d.comprBars} comprBarDia={16} naDepth={d.cNA} flexOK={d.flexOK} flexReason={d.flexNotes[0]} />
        </div>
      </div> }}
      resultsCaption={[...(d.sAdopt === 0 ? ['The shear is under half the concrete’s own capacity, so §409.6.3.1 requires no stirrups; a lintel is normally given nominal ties for the cage — a practice decision, not this check.'] : []), ...r.notes].join(' ') || undefined}
      results={[
        { check: 'Effective span', basis: '§6.3.2.1', demand: `${f2(r.span)} m`, status: 'info' as const },
        { check: 'Masonry on the lintel', basis: r.loads.arching ? `triangle ${f2(r.loads.triangleHeight)} m` : 'whole rectangle', demand: `${f2(r.loads.masonry)} kN`, status: 'info' as const },
        { check: 'Design moment / shear', basis: 'factored', demand: `${f2(r.Mu)} kN·m / ${f2(r.Vu)} kN`, status: 'info' as const },
        { check: 'Flexure', basis: `As req ${f0(d.As)} mm²`, demand: bars, limit: `φMn ${f2(d.phiMnMax)} kN·m`, ratio: flexRatio, status: d.flexOK ? 'pass' as const : 'fail' as const },
        { check: 'Stirrups', basis: '§409.6.3.1', demand: stirrups, status: 'info' as const },
        { check: 'Bearing', basis: 'φ(0.85f′c)', demand: `${f2(r.bearingStress)} MPa`, limit: `${f2(r.bearingLimit)} MPa`, ratio: brgRatio, status: r.bearingOK ? 'pass' as const : 'fail' as const },
      ]}
      steps={report.steps}
      references={[
        { topic: 'Arching over openings', basis: 'triangle of masonry at the base angle', source: 'BS 5977-1 (lintel loading); Hendry, Structural Masonry' },
        { topic: 'Effective span', basis: 'clear span + h, ≤ support centres', source: 'ACI 318-14 §6.3.2.1' },
        { topic: 'Flexure and shear', basis: 'RC beam design', source: 'ACI 318-14 §22.2, §22.5; NSCP 2015 §409.6.3.1' },
        { topic: 'Bearing', basis: 'φ 0.85 f′c A1', source: 'ACI 318-14 §22.8' },
      ]}
    />
  )
}
