import { useMemo, useState } from 'react'
import { estimateBeam, type BeamInput, type BeamBarGroup, type ConcreteClass } from '../engine/quantities'
import { Num, ClassPick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { StockCutting } from '../components/estimateSketches'
import { barRow, barStep, concreteRows, concreteStep, takeoffStatus, tieStep, tieWireStep } from '../lib/estimateSolution'
import { kg, m3, m } from '../lib/format'

const g = (lengthPerPiece: number, numPieces: number, diaMm: number): BeamBarGroup => ({ lengthPerPiece, numPieces, diaMm })

const DEFAULTS: BeamInput = {
  length: 6, width: 0.25, height: 0.5, numStructures: 1, concreteClass: 'B', customFactor: 7.5, spliceLength: 0.3,
  topSupport: g(3, 2, 16), topMidspan: g(6, 2, 12),
  bottomSupport: g(3, 2, 12), bottomMidspan: g(6, 3, 20),
  stirrupLengthPerSet: 1.2, numStirrupSets: 30, stirrupDiaMm: 10,
  lengthPerCut: 0.3,
}

type Grp = 'topSupport' | 'topMidspan' | 'bottomSupport' | 'bottomMidspan'
const GROUPS: [Grp, string][] = [
  ['topSupport', 'Top bars at support'], ['topMidspan', 'Top bars at midspan'],
  ['bottomSupport', 'Bottom bars at support'], ['bottomMidspan', 'Bottom bars at midspan'],
]

export default function BeamEstimate() {
  const [f, setF] = useState<BeamInput>(DEFAULTS)
  const set = <K extends keyof BeamInput>(k: K) => (v: BeamInput[K]) => setF((s) => ({ ...s, [k]: v }))
  const setG = (grp: Grp, key: keyof BeamBarGroup) => (v: number) => setF((s) => ({ ...s, [grp]: { ...s[grp], [key]: v } }))
  const r = useMemo(() => estimateBeam(f), [f])
  const steel = r.totalMainWeight + r.stirrups.weight
  const mainPieces = r.mainBars.reduce((s, b) => s + b.takeoff.pieces, 0)
  const splice = r.mainBars[0]?.takeoff.splice ?? 0
  const counted = splice > 0 && r.stirrups.cutsPer6m > 0
  const topN = Math.max(f.topSupport.numPieces, f.topMidspan.numPieces)
  const botN = Math.max(f.bottomSupport.numPieces, f.bottomMidspan.numPieces)

  const steps = [
    concreteStep(`${f.length} \\times ${f.width} \\times ${f.height} \\times ${f.numStructures}`, r.materials, f.concreteClass),
    ...r.mainBars.map((b, i) => {
      const grp = f[GROUPS[i][0]]
      return barStep(b.label, `${grp.lengthPerPiece} \\times ${grp.numPieces} \\times ${f.numStructures}`, b.takeoff, f.spliceLength)
    }),
    tieStep('Stirrups', f.stirrupLengthPerSet, f.numStirrupSets, f.numStructures, r.stirrups),
    tieWireStep(`(${topN} + ${botN}) \\times ${f.numStirrupSets}`, f.lengthPerCut, f.numStructures, r.tieWire),
  ]

  return (
    <WorkspacePage title="Beam Estimate" badges={['Quantities', 'Concrete · rebar · tie wire']}
      intro="Concrete volume, materials, top and bottom bars at support and midspan, stirrups and tie wire for a run of identical beams. Bars are bought in 6 m lengths; each lap shortens the usable length, and stirrups are cut whole from each bar."
      report={{
        docCode: 'Q-BM',
        ok: counted,
        governing: `${f.numStructures} beam/s ${f.length} × ${f.width} × ${f.height} m · ${m3(r.volume)} · ${kg(steel)} steel`,
        stats: [
          { label: 'Concrete', value: r.volume.toFixed(2), unit: 'm³' },
          { label: 'Cement', value: String(r.materials.cement), unit: 'bags' },
          { label: 'Steel', value: steel.toFixed(1), unit: 'kg' },
        ],
        checks: [],
        data: [
          ['Beam', `${f.length} × ${f.width} × ${f.height} m, ${f.numStructures} no.`],
          ['Concrete class', f.concreteClass === 'custom' ? `custom, ${f.customFactor} bags/m³` : f.concreteClass],
          ...GROUPS.map(([k, label]) => [label, `${f[k].numPieces} × ⌀${f[k].diaMm}, ${f[k].lengthPerPiece} m each`] as [string, string]),
          ['Stirrups', `${f.numStirrupSets} × ⌀${f.stirrupDiaMm}, ${f.stirrupLengthPerSet} m each`],
          ['Main steel', `${mainPieces} pcs, ${kg(r.totalMainWeight)}`],
          ['Stirrups', `${r.stirrups.pieces} pcs, ${kg(r.stirrups.weight)}`],
          ['Tie wire', `${m(r.tieWire.netLength)}, ${r.tieWire.rolls} roll/s`],
        ] as [string, string][],
        steps,
      }}
      inputs={<>
        <InputGroup title="Geometry and mix">
          <Num label="Length" unit="m" value={f.length} onChange={set('length')} min={0} />
          <Num label="Width" unit="m" value={f.width} onChange={set('width')} min={0} />
          <Num label="Height" unit="m" value={f.height} onChange={set('height')} min={0} />
          <Num label="No. of beams" value={f.numStructures} onChange={set('numStructures')} min={0} step="1" />
          <ClassPick value={f.concreteClass} onChange={set('concreteClass') as (v: ConcreteClass) => void} />
          {f.concreteClass === 'custom' && <Num label="Cement factor" unit="bags/m³" value={f.customFactor ?? 0} onChange={set('customFactor')} min={0} />}
          <Num label="Splice length" unit="m" value={f.spliceLength} onChange={set('spliceLength')} min={0} />
        </InputGroup>
        {GROUPS.map(([k, label]) => (
          <InputGroup key={k} title={label}>
            <Num label="Length / piece" unit="m" value={f[k].lengthPerPiece} onChange={setG(k, 'lengthPerPiece')} min={0} />
            <Num label="No. of pieces" value={f[k].numPieces} onChange={setG(k, 'numPieces')} min={0} step="1" />
            <Num label="Bar ⌀" unit="mm" value={f[k].diaMm} onChange={setG(k, 'diaMm')} min={1} />
          </InputGroup>
        ))}
        <InputGroup title="Stirrups and tie wire">
          <Num label="Length / stirrup" unit="m" value={f.stirrupLengthPerSet} onChange={set('stirrupLengthPerSet')} min={0} />
          <Num label="Stirrups / beam" value={f.numStirrupSets} onChange={set('numStirrupSets')} min={0} step="1" />
          <Num label="Stirrup ⌀" unit="mm" value={f.stirrupDiaMm} onChange={set('stirrupDiaMm')} min={1} />
          <Num label="Wire / crossing" unit="m" value={f.lengthPerCut} onChange={set('lengthPerCut')} min={0} />
        </InputGroup>
      </>}
      checks={<>
        <CheckCard title="Concrete" basis={`class ${f.concreteClass} · ${r.materials.factor} bags/m³`} status="info" pillLabel="QUANTITY"
          value={r.volume.toFixed(2)} unit="m³"
          pairs={[{ label: 'Cement', value: `${r.materials.cement} bags` }, { label: 'Sand / gravel', value: `${r.materials.sand.toFixed(2)} / ${r.materials.gravel.toFixed(2)} m³` }]} />
        <CheckCard title="Reinforcing steel" basis="6 m commercial bars" status={takeoffStatus(counted)} pillLabel={counted ? 'QUANTITY' : 'CHECK INPUT'}
          value={steel.toFixed(1)} unit="kg"
          pairs={[{ label: 'Main bars', value: `${mainPieces} pcs · ${r.totalMainWeight.toFixed(1)} kg` }, { label: `Stirrups ⌀${f.stirrupDiaMm}`, value: `${r.stirrups.pieces} pcs` }]} />
        <CheckCard title="Tie wire" basis={`${topN + botN} bars × ${f.numStirrupSets} stirrups per beam`} status="info" pillLabel="QUANTITY"
          value={String(r.tieWire.rolls)} unit="roll/s" pairs={[{ label: 'Net length', value: m(r.tieWire.netLength) }]} />
      </>}
      summary={[
        { label: 'Beams', value: `${f.numStructures} × ${f.length} × ${f.width} × ${f.height} m` },
        { label: 'Concrete', value: f.concreteClass === 'custom' ? `custom ${f.customFactor} bags/m³` : `class ${f.concreteClass}` },
        { label: 'Top bars', value: `${f.topSupport.numPieces}⌀${f.topSupport.diaMm} support, ${f.topMidspan.numPieces}⌀${f.topMidspan.diaMm} midspan` },
        { label: 'Bottom bars', value: `${f.bottomSupport.numPieces}⌀${f.bottomSupport.diaMm} support, ${f.bottomMidspan.numPieces}⌀${f.bottomMidspan.diaMm} midspan` },
        { label: 'Stirrups', value: `${f.numStirrupSets} × ⌀${f.stirrupDiaMm} @ ${f.stirrupLengthPerSet} m` },
      ]}
      drawing={{ title: 'Bars from 6 m stock', node: <div data-pdf-drawing>
        <StockCutting rows={[
          { label: 'Main bars, all four groups', kind: 'lap', splice: f.spliceLength, bars: mainPieces },
          { label: `Stirrups ⌀${f.stirrupDiaMm}`, kind: 'cuts', cut: f.stirrupLengthPerSet, bars: r.stirrups.pieces },
        ]} />
      </div> }}
      resultsCaption="Steel at 7850 kg/m³, bought in 6 m lengths. Tie wire is one cut per crossing of a stirrup with the governing top + bottom bar count, 2385 m to a roll. Cement is rounded up to whole bags; sand and gravel are net of waste."
      results={[
        ...concreteRows(r.materials),
        ...r.mainBars.map((b) => barRow(b.label.replace(' @ ', ' at '), b.takeoff, b.takeoff.diaMm)),
        { ...barRow('Stirrups', { ...r.stirrups, netLength: r.stirrups.totalCuts * f.stirrupLengthPerSet }, f.stirrupDiaMm), status: takeoffStatus(r.stirrups.cutsPer6m > 0) },
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
