import { useState } from 'react'
import { planeForce, GAMMA_W, type PlaneShape } from '../engine/hydrostatics'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { PlanePressureSketch } from '../components/fluidSketches'
import { f2, f3 } from '../lib/influenceStyle'

// Hydrostatic force on a plane surface — resultant F = γ·hc·A and the center
// of pressure yp = yc + Ixx,c/(yc·A) (engine/hydrostatics.ts · planeForce).

export default function HydrostaticForce() {
  const [shape, setShape] = useState<'rect' | 'circle'>('rect')
  const [b, setB] = useState(2)
  const [h, setH] = useState(3)
  const [dia, setDia] = useState(2)
  const [hc, setHc] = useState(1.5)
  const [theta, setTheta] = useState(90)
  const [gamma, setGamma] = useState(GAMMA_W)

  const plane: PlaneShape = shape === 'rect' ? { kind: 'rect', b, h } : { kind: 'circle', d: dia }
  const r = planeForce({ shape: plane, hc, thetaDeg: theta, gamma })
  const dim = shape === 'rect' ? `${f2(b)} × ${f2(h)} m rectangle` : `⌀${f2(dia)} m circle`

  return (
    <WorkspacePage title="Hydrostatic Force on Plane Surfaces" badges={['Hydrostatics', 'F = γhcA']}
      intro="The resultant of the water pressure on a submerged plane and where it acts — the center of pressure always sits below the centroid, by Ixx,c/(yc·A) along the plane."
      inputs={<>
        <InputGroup title="Plane surface">
          <Pick label="Shape" value={shape} onChange={(v) => setShape(v as typeof shape)} options={[['rect', 'Rectangle'], ['circle', 'Circle']]} />
          {shape === 'rect' ? <>
            <Num label="Width b" unit="m" value={b} onChange={setB} min={0.1} step="0.5" />
            <Num label="Height h (along the plane)" unit="m" value={h} onChange={setH} min={0.1} step="0.5" />
          </> : <Num label="Diameter d" unit="m" value={dia} onChange={setDia} min={0.1} step="0.5" />}
        </InputGroup>
        <InputGroup title="Position">
          <Num label="Centroid depth hc" unit="m" value={hc} onChange={setHc} min={0.05} step="0.1" />
          <Num label="Inclination θ" unit="°" value={theta} onChange={setTheta} min={1} max={90} step="5" />
        </InputGroup>
        <InputGroup title="Fluid">
          <Num label="Unit weight γ" unit="kN/m³" value={gamma} onChange={setGamma} min={0.1} step="0.1" />
        </InputGroup>
      </>}
      checks={<>
        <CheckCard title="Resultant force" basis={`${dim} · θ = ${f2(theta)}°`} status="info"
          value={f2(r.F)} unit="kN" formula={`F = γ·hc·A = ${f2(gamma)}·${f2(hc)}·${f3(r.A)}`}
          pairs={[{ label: 'Area A', value: `${f3(r.A)} m²` }, { label: 'Pressure at hc', value: `${f2(gamma * hc)} kPa` }]} />
        <CheckCard title="Center of pressure" basis="below the free surface" status="info"
          value={f3(r.hpVertical)} unit="m" formula="yp = yc + Ixx,c / (yc·A)"
          pairs={[{ label: 'Along the plane yp', value: `${f3(r.ypPlane)} m` }, { label: 'Below the centroid', value: `${f3(r.ypPlane - r.ycPlane)} m` }]} />
      </>}
      summary={[
        { label: 'Surface', value: dim }, { label: 'Centroid depth hc', value: `${f2(hc)} m` },
        { label: 'Inclination θ', value: `${f2(theta)}°` }, { label: 'Unit weight γ', value: `${f2(gamma)} kN/m³` },
        { label: 'Area A', value: `${f3(r.A)} m²` }, { label: 'Ixx,c', value: `${f3(r.Ixxc)} m⁴` },
      ]}
      drawing={{ title: 'Pressure on the plate', node: <PlanePressureSketch thetaDeg={theta} F={r.F} hp={r.hpVertical} /> }}
      results={[
        { check: 'Resultant force F', basis: 'γ·hc·A', demand: `${f2(r.F)} kN`, status: 'info' },
        { check: 'Centroid along the plane yc', basis: 'hc / sinθ', demand: `${f3(r.ycPlane)} m`, status: 'info' },
        { check: 'Center of pressure yp', basis: 'yc + Ixx,c/(yc·A)', demand: `${f3(r.ypPlane)} m`, status: 'info' },
        { check: 'Center of pressure depth hp', basis: 'yp·sinθ', demand: `${f3(r.hpVertical)} m`, status: 'info' },
      ]}
      steps={[
        { title: 'Area and centroidal inertia', lines: [
          { tex: shape === 'rect' ? `A = bh = ${f2(b)}\\times${f2(h)} = ${f3(r.A)}\\ \\text{m}^2 \\qquad I_{xx,c} = \\tfrac{bh^3}{12} = ${f3(r.Ixxc)}\\ \\text{m}^4`
            : `A = \\tfrac{\\pi d^2}{4} = ${f3(r.A)}\\ \\text{m}^2 \\qquad I_{xx,c} = \\tfrac{\\pi d^4}{64} = ${f3(r.Ixxc)}\\ \\text{m}^4` },
        ] },
        { title: 'Resultant', lines: [
          { tex: `F = \\gamma\\,h_c\\,A = ${f2(gamma)}\\times${f2(hc)}\\times${f3(r.A)} = ${f2(r.F)}\\ \\text{kN}` },
          { text: 'The magnitude depends only on the centroid depth — tilting the plate about its centroid does not change it.' },
        ] },
        { title: 'Center of pressure', lines: [
          { tex: `y_c = h_c/\\sin\\theta = ${f3(r.ycPlane)}\\ \\text{m} \\qquad y_p = y_c + \\frac{I_{xx,c}}{y_c A} = ${f3(r.ycPlane)} + \\frac{${f3(r.Ixxc)}}{${f3(r.ycPlane)}\\times${f3(r.A)}} = ${f3(r.ypPlane)}\\ \\text{m}` },
          { tex: `h_p = y_p\\sin\\theta = ${f3(r.hpVertical)}\\ \\text{m}` },
          { text: 'Pressure grows with depth, so the resultant strikes below the centroid; the gap shrinks as the plate goes deeper.' },
        ] },
      ]}
      references={[
        { topic: 'Resultant', basis: 'F = γ·hc·A', source: 'Hydrostatics — force on plane areas' },
        { topic: 'Center of pressure', basis: 'yp = yc + Ixx,c/(yc·A), measured along the plane', source: 'Hydrostatics — force on plane areas' },
      ]}
    />
  )
}
