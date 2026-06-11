import { useMemo, useState } from 'react'
import { estimateBeam, type BeamInput, type BeamBarGroup, type ConcreteClass } from '../engine/quantities'
import { Num, ClassPick, Card, ResultCard, Row, QtyPage, kg, m3, m } from '../components/qty'
import { WorkedSolution } from '../components/WorkedSolution'
import { beamQtySolution } from '../lib/quantitySolution'

const g = (lengthPerPiece: number, numPieces: number, diaMm: number): BeamBarGroup => ({ lengthPerPiece, numPieces, diaMm })

const DEFAULTS: BeamInput = {
  length: 6, width: 0.25, height: 0.5, numStructures: 1, concreteClass: 'B', customFactor: 7.5, spliceLength: 0.3,
  topSupport: g(3, 2, 16), topMidspan: g(6, 2, 12),
  bottomSupport: g(3, 2, 12), bottomMidspan: g(6, 3, 20),
  stirrupLengthPerSet: 1.2, numStirrupSets: 30, stirrupDiaMm: 10,
  lengthPerCut: 0.3,
}

export default function BeamEstimate() {
  const [f, setF] = useState<BeamInput>(DEFAULTS)
  const set = <K extends keyof BeamInput>(k: K) => (v: BeamInput[K]) => setF((s) => ({ ...s, [k]: v }))
  const setG = (grp: 'topSupport' | 'topMidspan' | 'bottomSupport' | 'bottomMidspan', key: keyof BeamBarGroup) =>
    (v: number) => setF((s) => ({ ...s, [grp]: { ...s[grp], [key]: v } }))
  const r = useMemo(() => estimateBeam(f), [f])
  const solution = useMemo(() => beamQtySolution(f, r), [f, r])

  const barCard = (title: string, grp: 'topSupport' | 'topMidspan' | 'bottomSupport' | 'bottomMidspan') => (
    <Card title={title}>
      <Num label="Length / piece" unit="m" value={f[grp].lengthPerPiece} onChange={setG(grp, 'lengthPerPiece')} />
      <Num label="No. of pieces" value={f[grp].numPieces} onChange={setG(grp, 'numPieces')} />
      <Num label="Bar Ø" unit="mm" value={f[grp].diaMm} onChange={setG(grp, 'diaMm')} />
    </Card>
  )

  return (
    <QtyPage title="Beam — Material Estimate" reportTitle="Beam Material Estimate"
      intro="Concrete volume, materials, top/bottom bars at support & midspan, stirrups and tie wire for beams."
      after={<WorkedSolution steps={solution} title="Solution — calculation breakdown" />}>
      <div className="space-y-5">
        <Card title="Geometry & mix">
          <Num label="Length" unit="m" value={f.length} onChange={set('length')} />
          <Num label="Width" unit="m" value={f.width} onChange={set('width')} />
          <Num label="Height" unit="m" value={f.height} onChange={set('height')} />
          <Num label="No. of beams" value={f.numStructures} onChange={set('numStructures')} />
          <ClassPick value={f.concreteClass} onChange={set('concreteClass') as (v: ConcreteClass) => void} />
          {f.concreteClass === 'custom' && <Num label="Cement factor" unit="bags/m³" value={f.customFactor ?? 0} onChange={set('customFactor')} />}
          <Num label="Splice length" unit="m" value={f.spliceLength} onChange={set('spliceLength')} />
        </Card>
        {barCard('Top bars @ support', 'topSupport')}
        {barCard('Top bars @ midspan', 'topMidspan')}
        {barCard('Bottom bars @ support', 'bottomSupport')}
        {barCard('Bottom bars @ midspan', 'bottomMidspan')}
        <Card title="Stirrups & tie wire">
          <Num label="Length / stirrup" unit="m" value={f.stirrupLengthPerSet} onChange={set('stirrupLengthPerSet')} />
          <Num label="Stirrups / beam" value={f.numStirrupSets} onChange={set('numStirrupSets')} />
          <Num label="Stirrup Ø" unit="mm" value={f.stirrupDiaMm} onChange={set('stirrupDiaMm')} />
          <Num label="Tie wire length / cut" unit="m" value={f.lengthPerCut} onChange={set('lengthPerCut')} />
        </Card>
      </div>

      <div className="space-y-5">
        <ResultCard title="Concrete">
          <Row label="Volume" value={m3(r.volume)} />
          <Row label="Cement" value={`${r.materials.cement} bags`} sub={`factor ${r.materials.factor}`} />
          <Row label="Sand" value={m3(r.materials.sand)} />
          <Row label="Gravel" value={m3(r.materials.gravel)} />
        </ResultCard>
        <ResultCard title="Main reinforcement">
          {r.mainBars.map((b) => (
            <Row key={b.label} label={`${b.label} (Ø${b.takeoff.diaMm})`} value={kg(b.takeoff.weight)}
              sub={`${b.takeoff.pieces} bars · ${m(b.takeoff.netLength)}`} />
          ))}
          <Row label="Total main steel" value={kg(r.totalMainWeight)} />
        </ResultCard>
        <ResultCard title="Stirrups & tie wire">
          <Row label={`Stirrups (Ø${f.stirrupDiaMm})`} value={kg(r.stirrups.weight)} sub={`${r.stirrups.pieces} bars · ${r.stirrups.totalCuts} ties`} />
          <Row label="Tie wire intersections" value={`${r.tieWire.intersections}`} sub="long. bars × stirrups" />
          <Row label="Tie wire" value={`${r.tieWire.rolls} roll/s`} sub={m(r.tieWire.netLength)} />
        </ResultCard>
      </div>
    </QtyPage>
  )
}
