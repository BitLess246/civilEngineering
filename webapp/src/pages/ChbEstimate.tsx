import { useMemo, useState } from 'react'
import { estimateChb, MORTAR_CEMENT, MORTAR_SAND, type ChbInput, type ChbSize } from '../engine/quantities'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { sn2, sn3, type SolutionStep } from '../lib/solution'

const DEFAULTS: ChbInput = { wallArea: 30, holeArea: 4, size: '6' }

export default function ChbEstimate() {
  const [f, setF] = useState<ChbInput>(DEFAULTS)
  const set = <K extends keyof ChbInput>(k: K) => (v: ChbInput[K]) => setF((s) => ({ ...s, [k]: v }))
  const r = useMemo(() => estimateChb(f), [f])
  const A = sn2(r.netArea)

  const steps: SolutionStep[] = [
    { title: 'Net wall area and blocks', lines: [
      { tex: `A = ${sn2(f.wallArea)} - ${sn2(f.holeArea)} = ${A}\\ \\text{m}^2` },
      { tex: `\\text{CHB} = \\lceil ${A} \\times 12.5 \\rceil = ${r.pieces}\\ \\text{pcs}` },
    ], note: '12.5 blocks of 400 × 200 mm face per m² of wall, joints included.' },
    { title: `Mortar for ${f.size}" blocks`, lines: [
      { tex: `\\text{cement} = \\lceil ${A} \\times ${MORTAR_CEMENT[f.size]} \\rceil = ${r.mortar.cement}\\ \\text{bags}` },
      { tex: `\\text{sand} = ${A} \\times ${MORTAR_SAND[f.size]} = ${sn3(r.mortar.sand)}\\ \\text{m}^3` },
    ] },
    { title: 'Plaster', lines: [
      { tex: `\\text{cement} = \\lceil ${A} \\times 0.3 \\rceil = ${r.plaster.cement}\\ \\text{bags}` },
      { tex: `\\text{sand} = ${A} \\times 0.025 = ${sn3(r.plaster.sand)}\\ \\text{m}^3` },
    ] },
    { title: 'Totals', lines: [
      { tex: `\\text{cement} = ${r.mortar.cement} + ${r.plaster.cement} = ${r.totalCement}\\ \\text{bags}` },
      { tex: `\\text{sand} = ${sn3(r.mortar.sand)} + ${sn3(r.plaster.sand)} = ${sn3(r.totalSand)}\\ \\text{m}^3` },
    ] },
  ]

  return (
    <WorkspacePage title="CHB Wall Estimate" badges={['Quantities', 'Masonry']}
      intro="Concrete hollow block count, mortar and plaster (cement and sand) for a masonry wall, from its gross area less the openings."
      report={{
        docCode: 'Q-CHB',
        ok: r.netArea > 0,
        governing: `${A} m² of ${f.size}" CHB · ${r.pieces} pcs · ${r.totalCement} bags cement`,
        stats: [
          { label: 'Blocks', value: String(r.pieces), unit: 'pcs' },
          { label: 'Cement', value: String(r.totalCement), unit: 'bags' },
          { label: 'Sand', value: r.totalSand.toFixed(2), unit: 'm³' },
        ],
        checks: [],
        data: [
          ['Gross / openings', `${sn2(f.wallArea)} / ${sn2(f.holeArea)} m²`],
          ['Net area', `${A} m²`],
          ['Block size', `${f.size} in`],
          ['Mortar', `${r.mortar.cement} bags, ${sn2(r.mortar.sand)} m³ sand`],
          ['Plaster', `${r.plaster.cement} bags, ${sn2(r.plaster.sand)} m³ sand`],
        ] as [string, string][],
        steps,
      }}
      inputs={
        <InputGroup title="Wall">
          <Num label="Gross wall area" unit="m²" value={f.wallArea} onChange={set('wallArea')} min={0} />
          <Num label="Openings area" unit="m²" value={f.holeArea} onChange={set('holeArea')} min={0} />
          <div className="col-span-2">
            <Pick label="CHB size" value={f.size} onChange={set('size') as (v: ChbSize) => void}
              options={[['4', '4 in'], ['6', '6 in'], ['8', '8 in']]} />
          </div>
        </InputGroup>
      }
      checks={<>
        <CheckCard title="Blocks" basis={`12.5 per m² · ${A} m² net`} status={r.netArea > 0 ? 'info' : 'warn'} pillLabel={r.netArea > 0 ? 'QUANTITY' : 'CHECK INPUT'}
          value={String(r.pieces)} unit="pcs" />
        <CheckCard title="Cement" basis="mortar + plaster" status="info" pillLabel="QUANTITY" value={String(r.totalCement)} unit="bags"
          pairs={[{ label: 'Mortar', value: `${r.mortar.cement} bags` }, { label: 'Plaster', value: `${r.plaster.cement} bags` }]} />
        <CheckCard title="Sand" basis="mortar + plaster" status="info" pillLabel="QUANTITY" value={r.totalSand.toFixed(2)} unit="m³"
          pairs={[{ label: 'Mortar', value: `${sn2(r.mortar.sand)} m³` }, { label: 'Plaster', value: `${sn2(r.plaster.sand)} m³` }]} />
      </>}
      summary={[
        { label: 'Wall', value: `${sn2(f.wallArea)} m² gross, ${sn2(f.holeArea)} m² openings` },
        { label: 'Block', value: `${f.size} in CHB` },
      ]}
      resultsCaption="Cement is rounded up to whole bags; sand is net of waste — add your own allowance. Plaster is taken over the net wall area at the factor shown."
      results={[
        { check: 'Net wall area', basis: 'gross − openings', demand: `${A} m²`, status: r.netArea > 0 ? 'info' : 'warn' },
        { check: `CHB ${f.size}"`, basis: '⌈A × 12.5⌉', demand: `${r.pieces} pcs`, status: 'info' },
        { check: 'Mortar cement', basis: `⌈A × ${MORTAR_CEMENT[f.size]}⌉`, demand: `${r.mortar.cement} bags`, status: 'info' },
        { check: 'Mortar sand', basis: `A × ${MORTAR_SAND[f.size]}`, demand: `${sn2(r.mortar.sand)} m³`, status: 'info' },
        { check: 'Plaster cement', basis: '⌈A × 0.3⌉', demand: `${r.plaster.cement} bags`, status: 'info' },
        { check: 'Plaster sand', basis: 'A × 0.025', demand: `${sn2(r.plaster.sand)} m³`, status: 'info' },
        { check: 'Total cement', basis: 'mortar + plaster', demand: `${r.totalCement} bags`, status: 'info' },
        { check: 'Total sand', basis: 'mortar + plaster', demand: `${sn2(r.totalSand)} m³`, status: 'info' },
      ]}
      steps={steps}
      references={[
        { topic: 'Block count', basis: '12.5 CHB (400 × 200 mm face) per m²', source: 'Standard masonry take-off' },
        { topic: 'Mortar and plaster', basis: 'cement bags and sand per m² by block size', source: 'Standard masonry take-off factors' },
      ]}
    />
  )
}
