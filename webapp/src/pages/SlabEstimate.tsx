import { useMemo, useState } from 'react'
import { estimateSlab, type SlabInput, type ConcreteClass } from '../engine/quantities'
import { Num, ClassPick, Card, ResultCard, Row, QtyPage, kg, m3, m } from '../components/qty'
import { WorkedSolution } from '../components/WorkedSolution'
import { slabSolution } from '../lib/quantitySolution'

const DEFAULTS: SlabInput = {
  slabArea: 20, thickness: 0.125, numStructures: 1, concreteClass: 'A', customFactor: 9, spliceLength: 0.3,
  longSpanLength: 5, numLongPieces: 12, longDiaMm: 12,
  shortSpanLength: 4, numShortPieces: 14, shortDiaMm: 12,
  lengthPerCut: 0.3,
}

export default function SlabEstimate() {
  const [f, setF] = useState<SlabInput>(DEFAULTS)
  const set = <K extends keyof SlabInput>(k: K) => (v: SlabInput[K]) => setF((s) => ({ ...s, [k]: v }))
  const r = useMemo(() => estimateSlab(f), [f])
  const solution = useMemo(() => slabSolution(f, r), [f, r])

  return (
    <QtyPage title="Slab — Material Estimate" reportTitle="Slab Material Estimate"
      intro="Concrete volume, cement / sand / gravel, main steel (both spans) and tie wire for a slab."
      after={<WorkedSolution steps={solution} title="Solution — calculation breakdown" />}>
      <div className="space-y-5">
        <Card title="Geometry & mix">
          <Num label="Slab area" unit="m²" value={f.slabArea} onChange={set('slabArea')} />
          <Num label="Thickness" unit="m" value={f.thickness} onChange={set('thickness')} />
          <Num label="No. of structures" value={f.numStructures} onChange={set('numStructures')} />
          <ClassPick value={f.concreteClass} onChange={set('concreteClass') as (v: ConcreteClass) => void} />
          {f.concreteClass === 'custom' && <Num label="Cement factor" unit="bags/m³" value={f.customFactor ?? 0} onChange={set('customFactor')} />}
          <Num label="Splice length" unit="m" value={f.spliceLength} onChange={set('spliceLength')} />
        </Card>
        <Card title="Long-span bars">
          <Num label="Length / piece" unit="m" value={f.longSpanLength} onChange={set('longSpanLength')} />
          <Num label="No. of pieces" value={f.numLongPieces} onChange={set('numLongPieces')} />
          <Num label="Bar Ø" unit="mm" value={f.longDiaMm} onChange={set('longDiaMm')} />
        </Card>
        <Card title="Short-span bars">
          <Num label="Length / piece" unit="m" value={f.shortSpanLength} onChange={set('shortSpanLength')} />
          <Num label="No. of pieces" value={f.numShortPieces} onChange={set('numShortPieces')} />
          <Num label="Bar Ø" unit="mm" value={f.shortDiaMm} onChange={set('shortDiaMm')} />
        </Card>
        <Card title="Tie wire">
          <Num label="Length / cut" unit="m" value={f.lengthPerCut} onChange={set('lengthPerCut')} />
        </Card>
      </div>

      <div className="space-y-5">
        <ResultCard title="Concrete">
          <Row label="Volume" value={m3(r.volume)} />
          <Row label="Cement" value={`${r.materials.cement} bags`} sub={`factor ${r.materials.factor}`} />
          <Row label="Sand" value={m3(r.materials.sand)} />
          <Row label="Gravel" value={m3(r.materials.gravel)} />
        </ResultCard>
        <ResultCard title="Reinforcing steel">
          <Row label={`Long span (Ø${f.longDiaMm})`} value={kg(r.longSteel.weight)} sub={`${r.longSteel.pieces} bars · ${m(r.longSteel.netLength)}`} />
          <Row label={`Short span (Ø${f.shortDiaMm})`} value={kg(r.shortSteel.weight)} sub={`${r.shortSteel.pieces} bars · ${m(r.shortSteel.netLength)}`} />
          <Row label="Total steel weight" value={kg(r.totalSteelWeight)} />
        </ResultCard>
        <ResultCard title="Tie wire">
          <Row label="Intersections" value={`${r.tieWire.intersections}`} sub={`${f.numLongPieces}×${f.numShortPieces} grid`} />
          <Row label="Net length" value={m(r.tieWire.netLength)} />
          <Row label="Rolls" value={`${r.tieWire.rolls} roll/s`} />
        </ResultCard>
      </div>
    </QtyPage>
  )
}
