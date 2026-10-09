import { useMemo, useState } from 'react'
import { estimateBoxCulvert, type BoxCulvertInput, type ConcreteClass } from '../engine/quantities'
import { Num, ClassPick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { StockCutting } from '../components/estimateSketches'
import { barRow, barStep, concreteRows, concreteStep, takeoffStatus, tieWireStep } from '../lib/estimateSolution'
import { sn2, type SolutionStep } from '../lib/solution'
import { kg, m3, m } from '../lib/format'

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
  const steel = r.longTop.weight + r.longU.weight + rsbWeight
  const counted = r.longTop.splice > 0 && f.rsbSpacing > 0

  const rsbStep: SolutionStep = {
    title: 'Reinforcing rings (RSB)',
    lines: [
      { tex: `n = \\lceil ${f.length} / ${f.rsbSpacing} \\rceil + 1 = ${r.rsb.count}\\ \\text{rings}` },
      { tex: `\\text{top: } ${r.rsb.count} \\times ${f.topBarLength} = ${sn2(r.rsb.top.netLength)}\\ \\text{m} \\Rightarrow \\lceil \\cdot / 6 \\rceil = ${r.rsb.top.pieces}\\ \\text{bars, } ${sn2(r.rsb.top.weight)}\\ \\text{kg}` },
      { tex: `\\text{U: } ${r.rsb.count} \\times ${f.uBarLength} = ${sn2(r.rsb.u.netLength)}\\ \\text{m} \\Rightarrow \\lceil \\cdot / 6 \\rceil = ${r.rsb.u.pieces}\\ \\text{bars, } ${sn2(r.rsb.u.weight)}\\ \\text{kg}` },
    ],
    note: 'Rings are counted on net length over 6 m bars, so offcuts are taken as reused.',
  }
  const steps = [
    concreteStep(`(${f.grossArea} - ${f.holeArea}) \\times ${f.length}`, r.materials, f.concreteClass),
    barStep('Longitudinal top bars', `${f.length} \\times ${f.numLongTop}`, r.longTop, f.spliceLength),
    barStep('Longitudinal U-bars', `${f.length} \\times ${f.numLongU}`, r.longU, f.spliceLength),
    rsbStep,
    tieWireStep(`${r.rsb.count} \\times (${f.numLongTop} + ${f.numLongU})`, f.lengthPerCut, 1, r.tieWire),
  ]

  return (
    <WorkspacePage title="Box Culvert Estimate" badges={['Quantities', 'Concrete · rebar · tie wire']}
      intro="Concrete volume from the net cross-section, materials, longitudinal bars, reinforcing rings (top and U bars) and tie wire for a box culvert."
      report={{
        docCode: 'Q-BC',
        ok: counted,
        governing: `${sn2(r.netArea)} m² net × ${f.length} m · ${m3(r.volume)} · ${kg(steel)} steel`,
        stats: [
          { label: 'Concrete', value: r.volume.toFixed(2), unit: 'm³' },
          { label: 'Cement', value: String(r.materials.cement), unit: 'bags' },
          { label: 'Steel', value: steel.toFixed(1), unit: 'kg' },
        ],
        checks: [],
        data: [
          ['Gross / opening area', `${f.grossArea} / ${f.holeArea} m²`],
          ['Length', `${f.length} m`],
          ['Concrete class', f.concreteClass === 'custom' ? `custom, ${f.customFactor} bags/m³` : f.concreteClass],
          ['Longitudinal', `${f.numLongTop} × ⌀${f.longTopDiaMm} top, ${f.numLongU} × ⌀${f.longUDiaMm} U`],
          ['Rings', `${r.rsb.count} @ ${f.rsbSpacing} m: top ${f.topBarLength} m ⌀${f.topBarDiaMm}, U ${f.uBarLength} m ⌀${f.uBarDiaMm}`],
          ['Steel', `${kg(steel)}`],
          ['Tie wire', `${m(r.tieWire.netLength)}, ${r.tieWire.rolls} roll/s`],
        ] as [string, string][],
        steps,
      }}
      inputs={<>
        <InputGroup title="Section and mix">
          <Num label="Gross x-section area" unit="m²" value={f.grossArea} onChange={set('grossArea')} min={0} />
          <Num label="Opening area" unit="m²" value={f.holeArea} onChange={set('holeArea')} min={0} />
          <Num label="Length" unit="m" value={f.length} onChange={set('length')} min={0} />
          <ClassPick value={f.concreteClass} onChange={set('concreteClass') as (v: ConcreteClass) => void} />
          {f.concreteClass === 'custom' && <Num label="Cement factor" unit="bags/m³" value={f.customFactor ?? 0} onChange={set('customFactor')} min={0} />}
          <Num label="Splice length" unit="m" value={f.spliceLength} onChange={set('spliceLength')} min={0} />
        </InputGroup>
        <InputGroup title="Longitudinal bars">
          <Num label="No. top bars" value={f.numLongTop} onChange={set('numLongTop')} min={0} step="1" />
          <Num label="Top bar ⌀" unit="mm" value={f.longTopDiaMm} onChange={set('longTopDiaMm')} min={1} />
          <Num label="No. U-bars" value={f.numLongU} onChange={set('numLongU')} min={0} step="1" />
          <Num label="U-bar ⌀" unit="mm" value={f.longUDiaMm} onChange={set('longUDiaMm')} min={1} />
        </InputGroup>
        <InputGroup title="Reinforcing rings (RSB)">
          <Num label="Spacing" unit="m" value={f.rsbSpacing} onChange={set('rsbSpacing')} min={0.01} />
          <Num label="Wire / crossing" unit="m" value={f.lengthPerCut} onChange={set('lengthPerCut')} min={0} />
          <Num label="Top bar length" unit="m" value={f.topBarLength} onChange={set('topBarLength')} min={0} />
          <Num label="Top bar ⌀" unit="mm" value={f.topBarDiaMm} onChange={set('topBarDiaMm')} min={1} />
          <Num label="U-bar length" unit="m" value={f.uBarLength} onChange={set('uBarLength')} min={0} />
          <Num label="U-bar ⌀" unit="mm" value={f.uBarDiaMm} onChange={set('uBarDiaMm')} min={1} />
        </InputGroup>
      </>}
      checks={<>
        <CheckCard title="Concrete" basis={`${sn2(r.netArea)} m² net × ${f.length} m`} status="info" pillLabel="QUANTITY"
          value={r.volume.toFixed(2)} unit="m³"
          pairs={[{ label: 'Cement', value: `${r.materials.cement} bags` }, { label: 'Sand / gravel', value: `${r.materials.sand.toFixed(2)} / ${r.materials.gravel.toFixed(2)} m³` }]} />
        <CheckCard title="Reinforcing steel" basis="6 m commercial bars" status={takeoffStatus(counted)} pillLabel={counted ? 'QUANTITY' : 'CHECK INPUT'}
          value={steel.toFixed(1)} unit="kg"
          pairs={[{ label: 'Longitudinal', value: `${(r.longTop.weight + r.longU.weight).toFixed(1)} kg` }, { label: `${r.rsb.count} rings`, value: `${rsbWeight.toFixed(1)} kg` }]} />
        <CheckCard title="Tie wire" basis={`${r.rsb.count} rings × ${f.numLongTop + f.numLongU} bars`} status="info" pillLabel="QUANTITY"
          value={String(r.tieWire.rolls)} unit="roll/s" pairs={[{ label: 'Net length', value: m(r.tieWire.netLength) }]} />
      </>}
      summary={[
        { label: 'Section', value: `${f.grossArea} m² gross − ${f.holeArea} m² opening, ${f.length} m long` },
        { label: 'Concrete', value: f.concreteClass === 'custom' ? `custom ${f.customFactor} bags/m³` : `class ${f.concreteClass}` },
        { label: 'Longitudinal', value: `${f.numLongTop}⌀${f.longTopDiaMm} top + ${f.numLongU}⌀${f.longUDiaMm} U` },
        { label: 'Rings', value: `@ ${f.rsbSpacing} m, top ${f.topBarLength} m + U ${f.uBarLength} m` },
      ]}
      drawing={{ title: 'Longitudinal bars from 6 m stock', node: <div data-pdf-drawing>
        <StockCutting rows={[
          { label: `Top bars ⌀${f.longTopDiaMm}`, kind: 'lap', splice: f.spliceLength, bars: r.longTop.pieces },
          { label: `U-bars ⌀${f.longUDiaMm}`, kind: 'lap', splice: f.spliceLength, bars: r.longU.pieces },
        ]} />
      </div> }}
      resultsCaption="Steel at 7850 kg/m³, bought in 6 m lengths. Rings are counted on net length over 6 m bars (offcuts taken as reused). Tie wire is one cut per ring crossing a longitudinal bar, 2385 m to a roll."
      results={[
        { check: 'Net cross-section', basis: 'gross − opening', demand: `${sn2(r.netArea)} m²`, status: 'info' },
        ...concreteRows(r.materials),
        barRow('Longitudinal top', r.longTop, f.longTopDiaMm),
        barRow('Longitudinal U', r.longU, f.longUDiaMm),
        barRow(`Ring top bars (${r.rsb.count})`, r.rsb.top, f.topBarDiaMm),
        barRow(`Ring U-bars (${r.rsb.count})`, r.rsb.u, f.uBarDiaMm),
        { check: 'Tie wire', basis: `${r.tieWire.intersections} crossings`, demand: m(r.tieWire.netLength), limit: `${r.tieWire.rolls} roll/s`, status: 'info' },
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
