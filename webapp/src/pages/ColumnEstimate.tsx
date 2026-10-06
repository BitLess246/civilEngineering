import { useMemo, useState } from 'react'
import { estimateColumn, type ColumnInput, type ConcreteClass } from '../engine/quantities'
import { Num, ClassPick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { StockCutting } from '../components/estimateSketches'
import { barRow, barStep, concreteRows, concreteStep, takeoffStatus, tieStep, tieWireStep } from '../lib/estimateSolution'
import { kg, m3, m } from '../lib/format'

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
  const steel = r.mainSteel.weight + r.lateralTies.weight
  const counted = r.mainSteel.splice > 0 && r.lateralTies.cutsPer6m > 0

  const steps = [
    concreteStep(`${f.length} \\times ${f.width} \\times ${f.height} \\times ${f.numStructures}`, r.materials, f.concreteClass),
    barStep('Vertical bars', `${f.barLengthPerPiece} \\times ${f.numBars} \\times ${f.numStructures}`, r.mainSteel, f.spliceLength),
    tieStep('Lateral ties', f.tieLengthPerSet, f.numTieSets, f.numStructures, r.lateralTies),
    tieWireStep(`${f.numBars} \\times ${f.numTieSets}`, f.lengthPerCut, f.numStructures, r.tieWire),
  ]

  return (
    <WorkspacePage title="Column Estimate" badges={['Quantities', 'Concrete · rebar · tie wire']}
      intro="Concrete volume, cement / sand / gravel, vertical bars, lateral ties and tie wire for a run of identical columns. Bars are bought in 6 m lengths; each lap shortens the usable length, and ties are cut whole from each bar."
      report={{
        docCode: 'Q-CL',
        ok: counted,
        governing: `${f.numStructures} columns ${f.length} × ${f.width} × ${f.height} m · ${m3(r.volume)} · ${kg(steel)} steel`,
        stats: [
          { label: 'Concrete', value: r.volume.toFixed(2), unit: 'm³' },
          { label: 'Cement', value: String(r.materials.cement), unit: 'bags' },
          { label: 'Steel', value: steel.toFixed(1), unit: 'kg' },
        ],
        checks: [],
        data: [
          ['Column', `${f.length} × ${f.width} × ${f.height} m, ${f.numStructures} no.`],
          ['Concrete class', f.concreteClass === 'custom' ? `custom, ${f.customFactor} bags/m³` : f.concreteClass],
          ['Vertical bars', `${f.numBars} × ⌀${f.barDiaMm}, ${f.barLengthPerPiece} m each`],
          ['Lateral ties', `${f.numTieSets} × ⌀${f.tieDiaMm}, ${f.tieLengthPerSet} m each`],
          ['Splice / tie-wire cut', `${f.spliceLength} / ${f.lengthPerCut} m`],
          ['Vertical bars', `${r.mainSteel.pieces} pcs, ${kg(r.mainSteel.weight)}`],
          ['Lateral ties', `${r.lateralTies.pieces} pcs, ${kg(r.lateralTies.weight)}`],
          ['Tie wire', `${m(r.tieWire.netLength)}, ${r.tieWire.rolls} roll/s`],
        ] as [string, string][],
        steps,
      }}
      inputs={<>
        <InputGroup title="Geometry and mix">
          <Num label="Length" unit="m" value={f.length} onChange={set('length')} min={0} />
          <Num label="Width" unit="m" value={f.width} onChange={set('width')} min={0} />
          <Num label="Height" unit="m" value={f.height} onChange={set('height')} min={0} />
          <Num label="No. of columns" value={f.numStructures} onChange={set('numStructures')} min={0} step="1" />
          <ClassPick value={f.concreteClass} onChange={set('concreteClass') as (v: ConcreteClass) => void} />
          {f.concreteClass === 'custom' && <Num label="Cement factor" unit="bags/m³" value={f.customFactor ?? 0} onChange={set('customFactor')} min={0} />}
          <Num label="Splice length" unit="m" value={f.spliceLength} onChange={set('spliceLength')} min={0} />
        </InputGroup>
        <InputGroup title="Vertical bars">
          <Num label="Length / piece" unit="m" value={f.barLengthPerPiece} onChange={set('barLengthPerPiece')} min={0} />
          <Num label="Bars / column" value={f.numBars} onChange={set('numBars')} min={0} step="1" />
          <Num label="Bar ⌀" unit="mm" value={f.barDiaMm} onChange={set('barDiaMm')} min={1} />
        </InputGroup>
        <InputGroup title="Lateral ties and tie wire">
          <Num label="Length / tie" unit="m" value={f.tieLengthPerSet} onChange={set('tieLengthPerSet')} min={0} />
          <Num label="Ties / column" value={f.numTieSets} onChange={set('numTieSets')} min={0} step="1" />
          <Num label="Tie ⌀" unit="mm" value={f.tieDiaMm} onChange={set('tieDiaMm')} min={1} />
          <Num label="Wire / crossing" unit="m" value={f.lengthPerCut} onChange={set('lengthPerCut')} min={0} />
        </InputGroup>
      </>}
      checks={<>
        <CheckCard title="Concrete" basis={`class ${f.concreteClass} · ${r.materials.factor} bags/m³`} status="info" pillLabel="QUANTITY"
          value={r.volume.toFixed(2)} unit="m³"
          pairs={[{ label: 'Cement', value: `${r.materials.cement} bags` }, { label: 'Sand / gravel', value: `${r.materials.sand.toFixed(2)} / ${r.materials.gravel.toFixed(2)} m³` }]} />
        <CheckCard title="Reinforcing steel" basis="6 m commercial bars" status={takeoffStatus(counted)} pillLabel={counted ? 'QUANTITY' : 'CHECK INPUT'}
          value={steel.toFixed(1)} unit="kg"
          pairs={[{ label: `Vertical ⌀${f.barDiaMm}`, value: `${r.mainSteel.pieces} pcs` }, { label: `Ties ⌀${f.tieDiaMm}`, value: `${r.lateralTies.pieces} pcs` }]} />
        <CheckCard title="Tie wire" basis={`${f.numBars} bars × ${f.numTieSets} ties per column`} status="info" pillLabel="QUANTITY"
          value={String(r.tieWire.rolls)} unit="roll/s" pairs={[{ label: 'Net length', value: m(r.tieWire.netLength) }]} />
      </>}
      summary={[
        { label: 'Columns', value: `${f.numStructures} × ${f.length} × ${f.width} × ${f.height} m` },
        { label: 'Concrete', value: f.concreteClass === 'custom' ? `custom ${f.customFactor} bags/m³` : `class ${f.concreteClass}` },
        { label: 'Vertical bars', value: `${f.numBars} × ⌀${f.barDiaMm} @ ${f.barLengthPerPiece} m` },
        { label: 'Ties', value: `${f.numTieSets} × ⌀${f.tieDiaMm} @ ${f.tieLengthPerSet} m` },
      ]}
      drawing={{ title: 'Bars from 6 m stock', node: <div data-pdf-drawing>
        <StockCutting rows={[
          { label: `Vertical bars ⌀${f.barDiaMm}`, kind: 'lap', splice: f.spliceLength, bars: r.mainSteel.pieces },
          { label: `Lateral ties ⌀${f.tieDiaMm}`, kind: 'cuts', cut: f.tieLengthPerSet, bars: r.lateralTies.pieces },
        ]} />
      </div> }}
      resultsCaption="Steel at 7850 kg/m³, bought in 6 m lengths. Tie wire is one cut per bar crossing, 2385 m to a roll. Cement is rounded up to whole bags; sand and gravel are net of waste — add your own allowance."
      results={[
        ...concreteRows(r.materials),
        barRow('Vertical bars', r.mainSteel, f.barDiaMm),
        { ...barRow('Lateral ties', { ...r.lateralTies, netLength: r.lateralTies.totalCuts * f.tieLengthPerSet }, f.tieDiaMm), status: takeoffStatus(r.lateralTies.cutsPer6m > 0) },
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
