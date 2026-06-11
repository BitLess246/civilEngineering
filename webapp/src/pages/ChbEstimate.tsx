import { useMemo, useState } from 'react'
import { estimateChb, type ChbInput, type ChbSize } from '../engine/quantities'
import { Num, Pick, Card, ResultCard, Row, QtyPage, m3 } from '../components/qty'
import { WorkedSolution } from '../components/WorkedSolution'
import { chbSolution } from '../lib/quantitySolution'

const DEFAULTS: ChbInput = { wallArea: 30, holeArea: 4, size: '6' }

export default function ChbEstimate() {
  const [f, setF] = useState<ChbInput>(DEFAULTS)
  const set = <K extends keyof ChbInput>(k: K) => (v: ChbInput[K]) => setF((s) => ({ ...s, [k]: v }))
  const r = useMemo(() => estimateChb(f), [f])
  const solution = useMemo(() => chbSolution(f, r), [f, r])

  return (
    <QtyPage title="CHB Wall — Material Estimate" reportTitle="CHB Wall Material Estimate"
      intro="Concrete hollow block count, mortar and plaster (cement + sand) for a masonry wall."
      after={<WorkedSolution steps={solution} title="Solution — calculation breakdown" />}>
      <div className="space-y-5">
        <Card title="Wall">
          <Num label="Gross wall area" unit="m²" value={f.wallArea} onChange={set('wallArea')} />
          <Num label="Openings area" unit="m²" value={f.holeArea} onChange={set('holeArea')} />
          <Pick label="CHB size" value={f.size} onChange={set('size') as (v: ChbSize) => void}
            options={[['4', '4 in'], ['6', '6 in'], ['8', '8 in']]} />
        </Card>
      </div>

      <div className="space-y-5">
        <ResultCard title="Blocks">
          <Row label="Net area" value={m3(r.netArea).replace('m³', 'm²')} />
          <Row label={`No. of CHB (${f.size}")`} value={`${r.pieces} pcs`} />
        </ResultCard>
        <ResultCard title="Mortar">
          <Row label="Cement" value={`${r.mortar.cement} bags`} />
          <Row label="Sand" value={m3(r.mortar.sand)} />
        </ResultCard>
        <ResultCard title="Plaster">
          <Row label="Cement" value={`${r.plaster.cement} bags`} />
          <Row label="Sand" value={m3(r.plaster.sand)} />
        </ResultCard>
        <ResultCard title="Total cement & sand">
          <Row label="Cement" value={`${r.totalCement} bags`} />
          <Row label="Sand" value={m3(r.totalSand)} />
        </ResultCard>
      </div>
    </QtyPage>
  )
}
