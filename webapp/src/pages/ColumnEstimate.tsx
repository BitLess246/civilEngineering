import { useMemo, useState } from 'react'
import { estimateColumn, type ColumnInput, type ConcreteClass } from '../engine/quantities'
import { Num, ClassPick, Card, ResultCard, Row, QtyPage, kg, m3, m } from '../components/qty'

const DEFAULTS: ColumnInput = {
  length: 0.4, width: 0.4, height: 3, numStructures: 4, concreteClass: 'A', customFactor: 9, spliceLength: 0.3,
  barLengthPerPiece: 3.5, numBars: 8, barDiaMm: 16,
  tieLengthPerSet: 1.4, numTieSets: 16, tieDiaMm: 10,
  lengthPerCut: 0.3,
}

export default function ColumnEstimate() {
  const [f, setF] = useState<ColumnInput>(DEFAULTS)
  const set = <K extends keyof ColumnInput>(k: K) => (v: ColumnInput[K]) => setF((s) => ({ ...s, [k]: v }))
  const r = useMemo(() => estimateColumn(f), [f])

  return (
    <QtyPage title="Column — Material Estimate" reportTitle="Column Material Estimate"
      intro="Concrete volume, cement / sand / gravel, vertical bars, lateral ties and tie wire for columns.">
      <div className="space-y-5">
        <Card title="Geometry & mix">
          <Num label="Length" unit="m" value={f.length} onChange={set('length')} />
          <Num label="Width" unit="m" value={f.width} onChange={set('width')} />
          <Num label="Height" unit="m" value={f.height} onChange={set('height')} />
          <Num label="No. of columns" value={f.numStructures} onChange={set('numStructures')} />
          <ClassPick value={f.concreteClass} onChange={set('concreteClass') as (v: ConcreteClass) => void} />
          {f.concreteClass === 'custom' && <Num label="Cement factor" unit="bags/m³" value={f.customFactor ?? 0} onChange={set('customFactor')} />}
          <Num label="Splice length" unit="m" value={f.spliceLength} onChange={set('spliceLength')} />
        </Card>
        <Card title="Vertical bars">
          <Num label="Length / piece" unit="m" value={f.barLengthPerPiece} onChange={set('barLengthPerPiece')} />
          <Num label="Bars / column" value={f.numBars} onChange={set('numBars')} />
          <Num label="Bar Ø" unit="mm" value={f.barDiaMm} onChange={set('barDiaMm')} />
        </Card>
        <Card title="Lateral ties">
          <Num label="Length / tie" unit="m" value={f.tieLengthPerSet} onChange={set('tieLengthPerSet')} />
          <Num label="Ties / column" value={f.numTieSets} onChange={set('numTieSets')} />
          <Num label="Tie Ø" unit="mm" value={f.tieDiaMm} onChange={set('tieDiaMm')} />
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
          <Row label={`Vertical bars (Ø${f.barDiaMm})`} value={kg(r.mainSteel.weight)} sub={`${r.mainSteel.pieces} bars · ${m(r.mainSteel.netLength)}`} />
          <Row label={`Lateral ties (Ø${f.tieDiaMm})`} value={kg(r.lateralTies.weight)} sub={`${r.lateralTies.pieces} bars · ${r.lateralTies.totalCuts} ties`} />
        </ResultCard>
        <ResultCard title="Tie wire">
          <Row label="Intersections" value={`${r.tieWire.intersections}`} sub={`${f.numBars} bars × ${f.numTieSets} ties`} />
          <Row label="Net length" value={m(r.tieWire.netLength)} />
          <Row label="Rolls" value={`${r.tieWire.rolls} roll/s`} />
        </ResultCard>
      </div>
    </QtyPage>
  )
}
