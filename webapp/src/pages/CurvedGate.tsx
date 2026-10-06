import { useState } from 'react'
import { curvedGateForce, GAMMA_W } from '../engine/hydrostatics'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { CurvedGateSketch } from '../components/fluidSketches'
import { f2, f3 } from '../lib/influenceStyle'

// Quarter-circular gate with water on its concave side — Fh on the vertical
// projection, Fv the weight of water above the arc (engine/hydrostatics.ts).

export default function CurvedGate() {
  const [R, setR] = useState(2)
  const [W, setW] = useState(3)
  const [h0, setH0] = useState(0)
  const [gamma, setGamma] = useState(GAMMA_W)
  const hc = h0 + R / 2
  const g = curvedGateForce({ R, W, hc, gamma })
  const vol = (R * h0 + (Math.PI * R * R) / 4) * W

  return (
    <WorkspacePage title="Curved Gate" badges={['Hydrostatics', 'Quarter circle']}
      intro="A quarter-circular gate holding water on its concave side: the horizontal push on its vertical projection, the weight of water standing on it, and the resultant — which always passes through the arc's center."
      inputs={<>
        <InputGroup title="Gate">
          <Num label="Radius R" unit="m" value={R} onChange={setR} min={0.1} step="0.5" />
          <Num label="Width W" unit="m" value={W} onChange={setW} min={0.1} step="0.5" />
        </InputGroup>
        <InputGroup title="Water">
          <Num label="Water above gate top h₀" unit="m" value={h0} onChange={setH0} min={0} step="0.1" />
          <Num label="Unit weight γ" unit="kN/m³" value={gamma} onChange={setGamma} min={0.1} step="0.1" />
        </InputGroup>
      </>}
      checks={<>
        <CheckCard title="Resultant" basis={`R ${f2(R)} m · W ${f2(W)} m · h₀ ${f2(h0)} m`} status="info"
          value={f2(g.R)} unit="kN" formula={`R = √(Fh² + Fv²) at ${f2(g.thetaDeg)}°, through the center`}
          pairs={[{ label: 'Angle above horizontal', value: `${f2(g.thetaDeg)}°` }, { label: 'Line of action', value: 'through O' }]} />
        <CheckCard title="Horizontal component" basis="force on the vertical projection" status="info"
          value={f2(g.Fh)} unit="kN" formula="Fh = γ·hc·(R·W)"
          pairs={[{ label: 'Projection centroid hc', value: `${f3(hc)} m` }, { label: 'Projection area', value: `${f3(R * W)} m²` }]} />
        <CheckCard title="Vertical component" basis="weight of water above the arc" status="info"
          value={f2(g.Fv)} unit="kN" formula="Fv = γ·W·(R·h₀ + πR²/4)"
          pairs={[{ label: 'Water volume', value: `${f3(vol)} m³` }, { label: 'Quarter circle', value: `${f3((Math.PI * R * R) / 4)} m²` }]} />
      </>}
      summary={[
        { label: 'Radius R', value: `${f2(R)} m` }, { label: 'Width W', value: `${f2(W)} m` },
        { label: 'Water over gate h₀', value: `${f2(h0)} m` }, { label: 'Unit weight γ', value: `${f2(gamma)} kN/m³` },
      ]}
      drawing={{ title: 'Gate and resultant', node: <CurvedGateSketch R={R} h0={h0} Fh={g.Fh} Fv={g.Fv} theta={g.thetaDeg} /> }}
      results={[
        { check: 'Horizontal Fh', basis: 'γ·hc·(R·W)', demand: `${f2(g.Fh)} kN`, status: 'info' },
        { check: 'Vertical Fv', basis: 'γ·W·(R·h₀ + πR²/4)', demand: `${f2(g.Fv)} kN`, status: 'info' },
        { check: 'Resultant R', basis: '√(Fh² + Fv²)', demand: `${f2(g.R)} kN`, status: 'info' },
        { check: 'Direction θ', basis: 'tan⁻¹(Fv/Fh)', demand: `${f2(g.thetaDeg)}°`, status: 'info' },
      ]}
      steps={[
        { title: 'Horizontal component', lines: [
          { tex: `h_c = h_0 + \\tfrac{R}{2} = ${f2(h0)} + ${f2(R / 2)} = ${f3(hc)}\\ \\text{m}` },
          { tex: `F_h = \\gamma\\,h_c\\,(R\\,W) = ${f2(gamma)}\\times${f3(hc)}\\times${f3(R * W)} = ${f2(g.Fh)}\\ \\text{kN}` },
        ] },
        { title: 'Vertical component', lines: [
          { tex: `F_v = \\gamma\\,W\\left(R\\,h_0 + \\tfrac{\\pi R^2}{4}\\right) = ${f2(gamma)}\\times${f2(W)}\\times${f3(R * h0 + (Math.PI * R * R) / 4)} = ${f2(g.Fv)}\\ \\text{kN}` },
          { text: 'The vertical push is the weight of all the water standing vertically above the arc: the quarter circle plus the block of depth h₀ over it.' },
        ] },
        { title: 'Resultant', lines: [
          { tex: `R = \\sqrt{F_h^2 + F_v^2} = ${f2(g.R)}\\ \\text{kN} \\qquad \\theta = \\tan^{-1}\\frac{F_v}{F_h} = ${f2(g.thetaDeg)}^\\circ` },
          { text: 'Pressure acts normal to the skin everywhere, and every normal to a circular arc passes through its center — so does the resultant.' },
        ] },
      ]}
      references={[
        { topic: 'Horizontal component', basis: 'Force on the vertical projection of the curved surface', source: 'Hydrostatics — curved surfaces' },
        { topic: 'Vertical component', basis: 'Weight of the fluid vertically above the surface', source: 'Hydrostatics — curved surfaces' },
      ]}
    />
  )
}
