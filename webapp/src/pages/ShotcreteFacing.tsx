import { useState } from 'react'
import { designFacing } from '../engine/shotcreteFacing'
import { buildFacingSolution } from '../lib/geotechSolutions'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { FacingDrawing } from '../components/groundSupportSketches'

const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—')
const f0 = (n: number) => (Number.isFinite(n) ? Math.round(n).toString() : '—')

export default function ShotcreteFacing() {
  const [SH, setSH] = useState(1.5)
  const [SV, setSV] = useState(1.5)
  const [hc, setHc] = useState(100)
  const [cover, setCover] = useState(30)
  const [AsVert, setAsVert] = useState(400)
  const [AsHoriz, setAsHoriz] = useState(400)
  const [fc, setFc] = useState(21)
  const [fy, setFy] = useState(415)
  const [bearingPlate, setBearingPlate] = useState(0.2)
  const [CF, setCF] = useState(2.0)
  const [nailHeadForce, setNailHeadForce] = useState(60)

  const r = designFacing({ SH, SV, hc, cover, AsVert, AsHoriz, fc, fy, bearingPlate, CF, nailHeadForce })

  const solution = buildFacingSolution({ SH, SV, hc, cover, AsVert, AsHoriz, fc, fy, bearingPlate, CF, nailHeadForce }, r)

  return (
    <WorkspacePage title="Shotcrete Facing" badges={['Geotechnical', 'FHWA GEC-7']}
      intro="FHWA GEC-7 facing check. The thin shotcrete panel spans between the nail heads, so earth pressure bends it like a two-way slab on point supports — hogging over each nail, sagging at midspan. This checks the facing flexural strength R_FF and the punching strength R_FP against the nail-head force."
      inputs={<>
        <InputGroup title="Layout and facing">
          <Num label="Spacing SH" unit="m" value={SH} onChange={setSH} />
          <Num label="Spacing SV" unit="m" value={SV} onChange={setSV} />
          <Num label="Thickness hc" unit="mm" value={hc} onChange={setHc} />
          <Num label="Cover" unit="mm" value={cover} onChange={setCover} />
          <Num label="Vertical As" unit="mm²/m" value={AsVert} onChange={setAsVert} />
          <Num label="Horizontal As" unit="mm²/m" value={AsHoriz} onChange={setAsHoriz} />
          <Num label="Bearing plate" unit="m" value={bearingPlate} onChange={setBearingPlate} step="0.05" />
          <Num label="Pressure factor CF" value={CF} onChange={setCF} step="0.1" />
        </InputGroup>
        <InputGroup title="Materials and demand">
          <Num label="Shotcrete f′c" unit="MPa" value={fc} onChange={setFc} />
          <Num label="Steel fy" unit="MPa" value={fy} onChange={setFy} />
          <Num label="Nail-head force" unit="kN" value={nailHeadForce} onChange={setNailHeadForce} />
        </InputGroup>
      </>}
      checks={<>
        <CheckCard title="Facing strength" basis={`${r.governs} governs`} status={r.ok ? 'pass' : 'fail'} value={f0(r.strength)} unit="kN"
          ratio={r.strength > 0 ? nailHeadForce / r.strength : undefined} ratioLabel="Nail-head force ÷ strength"
          pairs={[{ label: 'Flexure R_FF', value: `${f0(r.Rff)} kN` }, { label: 'Punching R_FP', value: `${f0(r.Rfp)} kN` }]} />
        <CheckCard title="Panel moments" basis="vertical · horizontal" status="info" value={`${f2(r.mVert)} · ${f2(r.mHoriz)}`} unit="kN·m/m"
          pairs={[{ label: 'Effective depth d', value: `${f2(r.d)} mm` }, { label: 'FS', value: f2(r.fs) }]} />
      </>}
      summary={[
        { label: 'Layout', value: `${f2(SH)} × ${f2(SV)} m` },
        { label: 'Facing', value: `${hc} mm, cover ${cover} mm, f′c ${fc} MPa` },
        { label: 'Steel', value: `${f2(AsVert)} / ${f2(AsHoriz)} mm²/m, fy ${fy} MPa` },
        { label: 'Nail head', value: `${f2(nailHeadForce)} kN, plate ${f2(bearingPlate)} m` },
      ]}
      drawing={{ title: 'Facing panel and section', node: <div data-pdf-drawing><FacingDrawing SH={SH} SV={SV} hc={hc} cover={cover} d={r.d} plate={bearingPlate} /></div> }}
      resultsCaption="R_FF = C_F·(m_neg + m_pos)·8·S_perp/S_span (fixed-strip mechanism); R_FP = 0.33·√f′c·bo·d around the bearing plate. C_F ≈ 2.0 for a thin facing, 1.0 for a thick one. The engine passes the facing at strength ≥ nail-head force; apply the GEC-7 facing factor of safety for your case."
      results={[
        { check: 'Flexure, vertical', basis: 'R_FF,v', demand: `${f0(r.RffVert)} kN`, status: 'info' as const },
        { check: 'Flexure, horizontal', basis: 'R_FF,h', demand: `${f0(r.RffHoriz)} kN`, status: 'info' as const },
        { check: 'Punching', basis: '0.33 √f′c bo d', demand: `${f0(r.Rfp)} kN`, status: 'info' as const },
        { check: 'Nail-head force', basis: `${r.governs} governs`, demand: `${f0(nailHeadForce)} kN`, limit: `${f0(r.strength)} kN`, ratio: r.strength > 0 ? nailHeadForce / r.strength : undefined, status: r.ok ? 'pass' as const : 'fail' as const },
      ]}
      steps={solution}
      references={[
        { topic: 'Facing flexure', basis: 'fixed-strip yield-line mechanism with CF', source: 'FHWA GEC-7, facing design' },
        { topic: 'Punching shear', basis: 'around the bearing plate', source: 'FHWA GEC-7; ACI 318-14 §22.6' },
      ]}
    />
  )
}
