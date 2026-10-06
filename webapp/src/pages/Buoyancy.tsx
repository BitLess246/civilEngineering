import { useState } from 'react'
import { floatingStability, GAMMA_W } from '../engine/hydrostatics'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { BargeSketch } from '../components/fluidSketches'
import { f2, f3 } from '../lib/influenceStyle'

// Buoyancy and transverse stability of a box barge — Fb = γV, GM = KB + BM − KG
// (engine/hydrostatics.ts · floatingStability).

export default function Buoyancy() {
  const [L, setL] = useState(10)
  const [B, setB] = useState(4)
  const [draft, setDraft] = useState(1.5)
  const [KG, setKG] = useState(1.2)
  const [gamma, setGamma] = useState(GAMMA_W)
  const r = floatingStability({ L, B, draft, KG, gamma })
  const KM = r.KB + r.BM

  return (
    <WorkspacePage title="Buoyancy & Stability" badges={['Hydrostatics', 'Metacentric height']}
      intro="A floating box hull: the buoyant force from the displaced volume, and its transverse stability — positive metacentric height GM means a heel sets up a righting couple."
      inputs={<>
        <InputGroup title="Hull">
          <Num label="Length L" unit="m" value={L} onChange={setL} min={0.5} step="1" />
          <Num label="Beam B" unit="m" value={B} onChange={setB} min={0.2} step="0.5" />
          <Num label="Draft d" unit="m" value={draft} onChange={setDraft} min={0.05} step="0.1" />
          <Num label="KG above keel" unit="m" value={KG} onChange={setKG} min={0} step="0.1" />
        </InputGroup>
        <InputGroup title="Fluid">
          <Num label="Unit weight γ" unit="kN/m³" value={gamma} onChange={setGamma} min={0.1} step="0.1" />
        </InputGroup>
      </>}
      checks={<>
        <CheckCard title="Transverse stability" basis={`${f2(L)} × ${f2(B)} m hull · draft ${f2(draft)} m`}
          status={r.stable ? 'pass' : 'fail'} pillLabel={r.stable ? 'STABLE' : 'UNSTABLE'}
          value={f3(r.GM)} unit="m" formula="GM = KB + BM − KG  (> 0 rights itself)"
          pairs={[{ label: 'KM = KB + BM', value: `${f3(KM)} m` }, { label: 'KG', value: `${f3(KG)} m` }]} />
        <CheckCard title="Buoyant force" basis="weight of the displaced fluid" status="info"
          value={f2(r.Fb)} unit="kN" formula="Fb = γ·L·B·d"
          pairs={[{ label: 'Displaced volume', value: `${f2(r.V)} m³` }, { label: 'Supported mass', value: `${f2(r.Fb / 9.81)} t` }]} />
        <CheckCard title="Metacentric radius" basis="about the rolling axis" status="info"
          value={f3(r.BM)} unit="m" formula="BM = I / V = L·B³ / (12·V)"
          pairs={[{ label: 'I about axis', value: `${f3((L * B ** 3) / 12)} m⁴` }, { label: 'KB = d / 2', value: `${f3(r.KB)} m` }]} />
      </>}
      summary={[
        { label: 'Length L', value: `${f2(L)} m` }, { label: 'Beam B', value: `${f2(B)} m` },
        { label: 'Draft d', value: `${f2(draft)} m` }, { label: 'KG', value: `${f2(KG)} m` },
        { label: 'Unit weight γ', value: `${f2(gamma)} kN/m³` },
      ]}
      drawing={{ title: 'Section — K, B, G and M', node: <BargeSketch B={B} draft={draft} KG={KG} KB={r.KB} KM={KM} /> }}
      results={[
        { check: 'Buoyant force Fb', basis: 'γ·V', demand: `${f2(r.Fb)} kN`, status: 'info' },
        { check: 'Metacentric radius BM', basis: 'I / V', demand: `${f3(r.BM)} m`, status: 'info' },
        { check: 'Metacentric height GM', basis: 'KB + BM − KG', demand: `${f3(r.GM)} m`, limit: '> 0', status: r.stable ? 'pass' : 'fail' },
      ]}
      resultsCaption="GM is the one pass/fail check: a positive GM puts the metacenter above the center of gravity."
      steps={[
        { title: 'Displacement and buoyancy', lines: [
          { tex: `V = L\\,B\\,d = ${f2(L)}\\times${f2(B)}\\times${f2(draft)} = ${f2(r.V)}\\ \\text{m}^3 \\qquad F_b = \\gamma V = ${f2(r.Fb)}\\ \\text{kN}` },
        ] },
        { title: 'Metacentric height', lines: [
          { tex: `KB = d/2 = ${f3(r.KB)}\\ \\text{m} \\qquad BM = \\frac{L B^3/12}{V} = \\frac{${f3((L * B ** 3) / 12)}}{${f2(r.V)}} = ${f3(r.BM)}\\ \\text{m}` },
          { tex: `GM = KB + BM - KG = ${f3(r.KB)} + ${f3(r.BM)} - ${f2(KG)} = ${f3(r.GM)}\\ \\text{m}` },
          { text: r.stable
            ? 'GM > 0 — the metacenter is above the center of gravity, so a heel sets up a righting couple. Widen the beam or lower KG to grow it.'
            : 'GM ≤ 0 — no righting couple. Widen the beam, lighten the topsides, or ballast low.' },
        ] },
      ]}
      references={[
        { topic: 'Buoyancy', basis: 'Fb = γ·V (Archimedes)', source: 'Buoyancy and flotation' },
        { topic: 'Stability', basis: 'GM = KB + BM − KG, BM = I/V; stable for GM > 0', source: 'Metacentric stability' },
      ]}
    />
  )
}
