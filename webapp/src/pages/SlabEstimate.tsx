import { useMemo, useState } from 'react'
import { estimateSlab, type SlabInput, type ConcreteClass } from '../engine/quantities'
import { Num, ClassPick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { StockCutting } from '../components/estimateSketches'
import { barRow, barStep, concreteRows, concreteStep, takeoffStatus, tieWireStep } from '../lib/estimateSolution'
import { kg, m3, m } from '../lib/format'

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
  const counted = r.longSteel.splice > 0

  const steps = [
    concreteStep(`${f.slabArea} \\times ${f.thickness} \\times ${f.numStructures}`, r.materials, f.concreteClass),
    barStep('Long-span bars', `${f.longSpanLength} \\times ${f.numLongPieces} \\times ${f.numStructures}`, r.longSteel, f.spliceLength),
    barStep('Short-span bars', `${f.shortSpanLength} \\times ${f.numShortPieces} \\times ${f.numStructures}`, r.shortSteel, f.spliceLength),
    tieWireStep(`${f.numLongPieces} \\times ${f.numShortPieces}`, f.lengthPerCut, f.numStructures, r.tieWire),
  ]

  return (
    <WorkspacePage title="Slab Estimate" badges={['Quantities', 'Concrete · rebar · tie wire']}
      intro="Concrete volume, cement / sand / gravel, the bar mat in both directions and tie wire for a slab. Bars are bought in 6 m lengths and each lap shortens the usable length; tie wire ties every crossing of the mat."
      report={{
        docCode: 'Q-SL',
        ok: counted,
        governing: `${f.slabArea} m² × ${f.thickness} m · ${m3(r.volume)} · ${kg(r.totalSteelWeight)} steel`,
        stats: [
          { label: 'Concrete', value: r.volume.toFixed(2), unit: 'm³' },
          { label: 'Cement', value: String(r.materials.cement), unit: 'bags' },
          { label: 'Steel', value: r.totalSteelWeight.toFixed(1), unit: 'kg' },
        ],
        checks: [],
        data: [
          ['Slab', `${f.slabArea} m² × ${f.thickness} m, ${f.numStructures} no.`],
          ['Concrete class', f.concreteClass === 'custom' ? `custom, ${f.customFactor} bags/m³` : f.concreteClass],
          ['Long-span bars', `${f.numLongPieces} × ⌀${f.longDiaMm}, ${f.longSpanLength} m each`],
          ['Short-span bars', `${f.numShortPieces} × ⌀${f.shortDiaMm}, ${f.shortSpanLength} m each`],
          ['Long / short steel', `${r.longSteel.pieces} + ${r.shortSteel.pieces} pcs, ${kg(r.totalSteelWeight)}`],
          ['Tie wire', `${m(r.tieWire.netLength)}, ${r.tieWire.rolls} roll/s`],
        ] as [string, string][],
        steps,
      }}
      inputs={<>
        <InputGroup title="Geometry and mix">
          <Num label="Slab area" unit="m²" value={f.slabArea} onChange={set('slabArea')} min={0} />
          <Num label="Thickness" unit="m" value={f.thickness} onChange={set('thickness')} min={0} />
          <Num label="No. of slabs" value={f.numStructures} onChange={set('numStructures')} min={0} step="1" />
          <ClassPick value={f.concreteClass} onChange={set('concreteClass') as (v: ConcreteClass) => void} />
          {f.concreteClass === 'custom' && <Num label="Cement factor" unit="bags/m³" value={f.customFactor ?? 0} onChange={set('customFactor')} min={0} />}
          <Num label="Splice length" unit="m" value={f.spliceLength} onChange={set('spliceLength')} min={0} />
        </InputGroup>
        <InputGroup title="Long-span bars">
          <Num label="Length / piece" unit="m" value={f.longSpanLength} onChange={set('longSpanLength')} min={0} />
          <Num label="No. of pieces" value={f.numLongPieces} onChange={set('numLongPieces')} min={0} step="1" />
          <Num label="Bar ⌀" unit="mm" value={f.longDiaMm} onChange={set('longDiaMm')} min={1} />
        </InputGroup>
        <InputGroup title="Short-span bars">
          <Num label="Length / piece" unit="m" value={f.shortSpanLength} onChange={set('shortSpanLength')} min={0} />
          <Num label="No. of pieces" value={f.numShortPieces} onChange={set('numShortPieces')} min={0} step="1" />
          <Num label="Bar ⌀" unit="mm" value={f.shortDiaMm} onChange={set('shortDiaMm')} min={1} />
        </InputGroup>
        <InputGroup title="Tie wire">
          <Num label="Wire / crossing" unit="m" value={f.lengthPerCut} onChange={set('lengthPerCut')} min={0} />
        </InputGroup>
      </>}
      checks={<>
        <CheckCard title="Concrete" basis={`class ${f.concreteClass} · ${r.materials.factor} bags/m³`} status="info" pillLabel="QUANTITY"
          value={r.volume.toFixed(2)} unit="m³"
          pairs={[{ label: 'Cement', value: `${r.materials.cement} bags` }, { label: 'Sand / gravel', value: `${r.materials.sand.toFixed(2)} / ${r.materials.gravel.toFixed(2)} m³` }]} />
        <CheckCard title="Reinforcing steel" basis="6 m commercial bars" status={takeoffStatus(counted)} pillLabel={counted ? 'QUANTITY' : 'CHECK INPUT'}
          value={r.totalSteelWeight.toFixed(1)} unit="kg"
          pairs={[{ label: `Long ⌀${f.longDiaMm}`, value: `${r.longSteel.pieces} pcs` }, { label: `Short ⌀${f.shortDiaMm}`, value: `${r.shortSteel.pieces} pcs` }]} />
        <CheckCard title="Tie wire" basis={`${f.numLongPieces} × ${f.numShortPieces} crossings`} status="info" pillLabel="QUANTITY"
          value={String(r.tieWire.rolls)} unit="roll/s" pairs={[{ label: 'Net length', value: m(r.tieWire.netLength) }]} />
      </>}
      summary={[
        { label: 'Slab', value: `${f.numStructures} × ${f.slabArea} m², ${f.thickness} m thick` },
        { label: 'Concrete', value: f.concreteClass === 'custom' ? `custom ${f.customFactor} bags/m³` : `class ${f.concreteClass}` },
        { label: 'Long span', value: `${f.numLongPieces} × ⌀${f.longDiaMm} @ ${f.longSpanLength} m` },
        { label: 'Short span', value: `${f.numShortPieces} × ⌀${f.shortDiaMm} @ ${f.shortSpanLength} m` },
      ]}
      drawing={{ title: 'Bars from 6 m stock', node: <div data-pdf-drawing>
        <StockCutting rows={[
          { label: `Long-span bars ⌀${f.longDiaMm}`, kind: 'lap', splice: f.spliceLength, bars: r.longSteel.pieces },
          { label: `Short-span bars ⌀${f.shortDiaMm}`, kind: 'lap', splice: f.spliceLength, bars: r.shortSteel.pieces },
        ]} />
      </div> }}
      resultsCaption="Steel at 7850 kg/m³, bought in 6 m lengths; the bar mat is counted from the pieces entered, not laid out from the slab area. Tie wire is one cut per crossing, 2385 m to a roll."
      results={[
        ...concreteRows(r.materials),
        barRow('Long-span bars', r.longSteel, f.longDiaMm),
        barRow('Short-span bars', r.shortSteel, f.shortDiaMm),
        { check: 'Tie wire', basis: `${r.tieWire.intersections} crossings × ${f.numStructures}`, demand: m(r.tieWire.netLength), limit: `${r.tieWire.rolls} roll/s`, status: 'info' },
      ]}
      steps={steps}
      references={[
        { topic: 'Concrete proportions', basis: 'cement bags, 0.5 sand, 1.0 gravel per m³ by class', source: 'Standard class mixes (AA/A/B/C)' },
        { topic: 'Steel weight', basis: 'π/4·d²·L·7850 kg/m³', source: 'Unit weight of steel' },
        { topic: 'Commercial bars', basis: '6.0 m stock, lap shortens usable length', source: 'Local supply practice' },
      ]}
    />
  )
}
