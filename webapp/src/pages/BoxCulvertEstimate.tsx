import { useMemo, useState } from 'react'
import { estimateBoxCulvert, type BoxCulvertInput, type ConcreteClass } from '../engine/quantities'
import { Num, ClassPick, Card, ResultCard, Row, QtyPage, kg, m3, m } from '../components/qty'

const DEFAULTS: BoxCulvertInput = {
  grossArea: 6, holeArea: 2, length: 5, concreteClass: 'A', customFactor: 9, spliceLength: 0.3,
  numLongTop: 6, longTopDiaMm: 16, numLongU: 6, longUDiaMm: 16,
  rsbSpacing: 0.2, topBarLength: 2.5, topBarDiaMm: 12, uBarLength: 3.5, uBarDiaMm: 12,
  lengthPerCut: 0.3,
}

export default function BoxCulvertEstimate() {
  const [f, setF] = useState<BoxCulvertInput>(DEFAULTS)
  const set = <K extends keyof BoxCulvertInput>(k: K) => (v: BoxCulvertInput[K]) => setF((s) => ({ ...s, [k]: v }))
  const r = useMemo(() => estimateBoxCulvert(f), [f])
  const rsbWeight = r.rsb.top.weight + r.rsb.u.weight

  return (
    <QtyPage title="Box Culvert — Material Estimate" reportTitle="Box Culvert Material Estimate"
      intro="Concrete volume from net cross-section, materials, longitudinal bars, reinforcing rings (top + U bars) and tie wire.">
      <div className="space-y-5">
        <Card title="Section & mix">
          <Num label="Gross x-section area" unit="m²" value={f.grossArea} onChange={set('grossArea')} />
          <Num label="Opening area" unit="m²" value={f.holeArea} onChange={set('holeArea')} />
          <Num label="Length" unit="m" value={f.length} onChange={set('length')} />
          <ClassPick value={f.concreteClass} onChange={set('concreteClass') as (v: ConcreteClass) => void} />
          {f.concreteClass === 'custom' && <Num label="Cement factor" unit="bags/m³" value={f.customFactor ?? 0} onChange={set('customFactor')} />}
          <Num label="Splice length" unit="m" value={f.spliceLength} onChange={set('spliceLength')} />
        </Card>
        <Card title="Longitudinal bars">
          <Num label="No. top bars" value={f.numLongTop} onChange={set('numLongTop')} />
          <Num label="Top bar Ø" unit="mm" value={f.longTopDiaMm} onChange={set('longTopDiaMm')} />
          <Num label="No. U-bars" value={f.numLongU} onChange={set('numLongU')} />
          <Num label="U-bar Ø" unit="mm" value={f.longUDiaMm} onChange={set('longUDiaMm')} />
        </Card>
        <Card title="Reinforcing rings (RSB)">
          <Num label="Spacing" unit="m" value={f.rsbSpacing} onChange={set('rsbSpacing')} />
          <Num label="Top bar length" unit="m" value={f.topBarLength} onChange={set('topBarLength')} />
          <Num label="Top bar Ø" unit="mm" value={f.topBarDiaMm} onChange={set('topBarDiaMm')} />
          <Num label="U-bar length" unit="m" value={f.uBarLength} onChange={set('uBarLength')} />
          <Num label="U-bar Ø" unit="mm" value={f.uBarDiaMm} onChange={set('uBarDiaMm')} />
          <Num label="Tie wire length / cut" unit="m" value={f.lengthPerCut} onChange={set('lengthPerCut')} />
        </Card>
      </div>

      <div className="space-y-5">
        <ResultCard title="Concrete">
          <Row label="Net x-section" value={m3(r.netArea).replace('m³', 'm²')} />
          <Row label="Volume" value={m3(r.volume)} />
          <Row label="Cement" value={`${r.materials.cement} bags`} sub={`factor ${r.materials.factor}`} />
          <Row label="Sand" value={m3(r.materials.sand)} />
          <Row label="Gravel" value={m3(r.materials.gravel)} />
        </ResultCard>
        <ResultCard title="Longitudinal steel">
          <Row label={`Top bars (Ø${f.longTopDiaMm})`} value={kg(r.longTop.weight)} sub={`${r.longTop.pieces} bars`} />
          <Row label={`U-bars (Ø${f.longUDiaMm})`} value={kg(r.longU.weight)} sub={`${r.longU.pieces} bars`} />
        </ResultCard>
        <ResultCard title="Reinforcing rings">
          <Row label="No. of RSB" value={`${r.rsb.count} pcs`} />
          <Row label={`Top bars (Ø${f.topBarDiaMm})`} value={kg(r.rsb.top.weight)} sub={`${r.rsb.top.pieces} bars · ${m(r.rsb.top.netLength)}`} />
          <Row label={`U-bars (Ø${f.uBarDiaMm})`} value={kg(r.rsb.u.weight)} sub={`${r.rsb.u.pieces} bars · ${m(r.rsb.u.netLength)}`} />
          <Row label="RSB total" value={kg(rsbWeight)} />
        </ResultCard>
        <ResultCard title="Tie wire">
          <Row label="Intersections" value={`${r.tieWire.intersections}`} />
          <Row label="Net length" value={m(r.tieWire.netLength)} />
          <Row label="Rolls" value={`${r.tieWire.rolls} roll/s`} />
        </ResultCard>
      </div>
    </QtyPage>
  )
}
