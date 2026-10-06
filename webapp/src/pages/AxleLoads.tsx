import { useState } from 'react'
import { esalFromAxles, TYPICAL_AXLES, AXLES_IN, type AxleRow, type AxleKind } from '../engine/axleLoads'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { LefCurves } from '../components/pavementSketches'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// Axle Load ESALs — the generalized fourth-power law over an editable
// axle-load census: LEF per row, daily ESALs, and the design-period W18.

const SAMPLE: AxleRow[] = TYPICAL_AXLES.slice(2, 5).map((t) => ({ ...t, perDay: 120 }))

export default function AxleLoads() {
  const [rows, setRows] = useState<AxleRow[]>(SAMPLE)
  const [exponent, setExponent] = useState(4)
  const [directional, setDirectional] = useState(0.5)
  const [laneFactor, setLaneFactor] = useState(1)
  const [growthPct, setGrowthPct] = useState(2)
  const [years, setYears] = useState(20)

  const out: { r: ReturnType<typeof esalFromAxles> | null; err: string | null } = (() => {
    try {
      return { r: esalFromAxles({ rows, exponent, directional, laneFactor, growthPct, years }), err: null }
    } catch (e) {
      return { r: null, err: e instanceof Error ? e.message : 'Check the inputs' }
    }
  })()
  const { r, err } = out

  const setRow = (i: number, patch: Partial<AxleRow>) =>
    setRows((rs) => rs.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const steps: SolutionStep[] = r ? [
    {
      title: 'The generalized fourth-power law',
      lines: [
        { tex: `\\text{LEF} = \\left(\\frac{P}{80\\ \\text{kN}}\\right)^{${f2(exponent)}}` },
        ...r.rows.map((row) => ({
          item: `${row.name}: ${AXLES_IN[row.kind]}·(${f2(row.loadK)}/${AXLES_IN[row.kind]}/80)^${f2(exponent)} = ${AXLES_IN[row.kind]}·(${f2(row.axleK)}/80)^${f2(exponent)} = ${f2(row.lef)} ESALs/veh`,
        })),
        { text: 'The AASHO Road Test digested: pavement life consumed scales with roughly the fourth power of the load ratio to the standard 80 kN (18-kip) single axle. The exponent is editable — thin or heavily loaded pavements behave closer to 4.5, thick flexible sections closer to 3.5.' },
      ],
    },
    {
      title: 'Per-axle treatment of axle groups',
      lines: [
        { tex: `\\text{group} = n_{\\text{axles}}\\cdot\\left(\\frac{P_{\\text{group}}}{n_{\\text{axles}} \\cdot 80}\\right)^{4}` },
        { text: `A tandem/tridem spreads its load: a 150 kN tandem is 2 × (75/80)⁴ = ${f2(2 * (75 / 80) ** 4)} ESALs — far less than the ${f2((150 / 80) ** 4)} a lone 150 kN axle would cost, and the reason tandem bogies dominate heavy fleets.` },
      ],
    },
    {
      title: 'Daily ESALs → design W18',
      lines: [
        { tex: `W_{18} = 365 \\cdot G \\cdot \\sum_i \\text{ADT}_i \\cdot \\text{LEF}_i \\cdot D \\cdot L` },
        { tex: `\\sum_i \\text{ADT}_i\\cdot\\text{LEF}_i\\cdot D\\cdot L = (${rows.map((row, i) => `${row.perDay}\\times${f2(r.rows[i]?.lef ?? 0)}`).join('+')})\\times ${f2(directional)}\\times ${f2(laneFactor)} = ${f2(r.dailyEsal)}\\ \\text{ESALs/day (design lane)}` },
        { tex: `W_{18} = 365\\times ${f2(r.growthFactor)}\\times ${f2(r.dailyEsal)} = ${f3(r.W18 / 1e6)}\\times 10^6 \\ \\text{ESALs}` },
        { text: `Directional split ${f2(directional)} · design-lane factor ${f2(laneFactor)} · growth ${f2(growthPct)} %/yr over ${years} yr (G = ${f2(r.growthFactor)}). Each row's daily ESALs already carry the D·L split — the census sum is the design lane directly.` },
        { text: 'Feed this W18 to /pavement (flexible SN) or /rigid-pavement (slab D) — the two design tools take it as their traffic input.' },
      ],
    },
  ] : [{ title: 'Check the inputs', lines: [{ text: err ?? 'Check the inputs.' }] }]

  const btn = 'rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint'
  const sel = 'w-full rounded-md border border-field-line bg-surface px-2 py-1.5 text-sm font-normal'
  return (
    <WorkspacePage title="Axle Load ESALs" badges={['Pavement', 'Fourth-power law']}
      intro="Convert a weighed axle-load census into design ESALs: the fourth-power law prices every axle against the 80 kN standard, groups share the load across their axles, and the traffic side grows the result across the design period."
      inputs={<>
        <InputGroup title="Traffic and growth">
          <Num label="Load exponent n" value={exponent} onChange={setExponent} min={2} max={6} step="0.1" />
          <Num label="Directional split" value={directional} onChange={setDirectional} min={0.1} max={0.9} step="0.05" />
          <Num label="Lane factor" value={laneFactor} onChange={setLaneFactor} min={0.3} max={1} step="0.05" />
          <Num label="Growth" unit="%" value={growthPct} onChange={setGrowthPct} min={0} max={10} step="0.5" />
          <Num label="Design period" unit="yr" value={years} onChange={setYears} min={1} max={50} step="1" />
        </InputGroup>
        {rows.map((row, i) => (
          <InputGroup key={i} title={`Axle group ${i + 1}`} hint={i === 0 ? 'Group load = all axles of the group together.' : undefined}>
            <label className="col-span-2 flex flex-col gap-1 text-[12.5px] font-semibold text-ink">
              Name
              <input value={row.name} onChange={(e) => setRow(i, { name: e.target.value })} className={sel} aria-label={`Row ${i + 1} name`} />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-[12.5px] font-semibold text-ink">
              Axle type
              <select value={row.kind} onChange={(e) => setRow(i, { kind: e.target.value as AxleKind })} className={sel} aria-label={`Row ${i + 1} axle kind`}>
                {(Object.keys(AXLES_IN) as AxleKind[]).map((kd) => <option key={kd} value={kd}>{kd} ({AXLES_IN[kd]} axle{AXLES_IN[kd] > 1 ? 's' : ''})</option>)}
              </select>
            </label>
            <Num label="Group load" unit="kN" value={row.loadK} onChange={(v) => setRow(i, { loadK: v })} min={1} step="5" />
            <Num label="Count" unit="veh/day" value={row.perDay} onChange={(v) => setRow(i, { perDay: v })} min={0} step="10" />
            {rows.length > 1 && <div className="col-span-2"><button type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className={btn}>Remove group {i + 1}</button></div>}
          </InputGroup>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setRows((rs) => [...rs, { name: 'New axle group', kind: 'single', loadK: 80, perDay: 50 }])} className={btn}>+ Add axle group</button>
          <button type="button" onClick={() => { setRows(SAMPLE.map((x) => ({ ...x }))); setExponent(4); setDirectional(0.5); setLaneFactor(1); setGrowthPct(2); setYears(20) }} className={btn}>Sample: legal loads, 2 % growth</button>
        </div>
      </>}
      checks={r ? <>
        <CheckCard title="Design ESALs" basis={`${years} yr at ${f2(growthPct)} %`} status="info" value={`${f3(r.W18 / 1e6)} × 10⁶`}
          formula="W18 = 365 G Σ ADTᵢ LEFᵢ D L"
          pairs={[{ label: 'Daily (design lane)', value: f2(r.dailyEsal) }, { label: 'Growth G', value: f2(r.growthFactor) }]} />
        <CheckCard title="Heaviest contributor" basis="share of daily ESALs" status="info"
          value={(() => { const top = [...r.rows].sort((a, b) => b.daily - a.daily)[0]; return top ? top.name : '—' })()}
          pairs={(() => { const top = [...r.rows].sort((a, b) => b.daily - a.daily)[0]; return top ? [{ label: 'LEF', value: f2(top.lef) }, { label: 'Share', value: `${f2((top.daily / Math.max(r.dailyEsal, 1e-9)) * 100)} %` }] : [] })()} />
      </> : (
        <CheckCard title="Check the inputs" basis="axle census" status="warn" pillLabel="CHECK" value="—" formula={err ?? 'Check the inputs.'} />
      )}
      summary={[
        { label: 'Exponent', value: f2(exponent) },
        { label: 'D × L', value: `${f2(directional)} × ${f2(laneFactor)}` },
        { label: 'Growth', value: `${f2(growthPct)} %/yr, ${years} yr` },
        { label: 'Axle groups', value: `${rows.length}` },
      ]}
      drawing={r ? { title: 'Load equivalency', node: <div data-pdf-drawing><LefCurves exponent={exponent} rows={r.rows} /></div> } : undefined}
      results={r ? [
        ...r.rows.map((row) => ({ check: row.name, basis: `${row.kind}, ${f2(row.loadK)} kN (${f2(row.axleK)} kN/axle)`, demand: `LEF ${f2(row.lef)}`, limit: `${f2(row.daily)} ESAL/day`, status: 'info' as const })),
        { check: 'Design W18', basis: `365 × G ${f2(r.growthFactor)} × ${f2(r.dailyEsal)}/day`, demand: `${f3(r.W18 / 1e6)} × 10⁶`, status: 'info' as const },
      ] : [{ check: 'Census', basis: err ?? 'invalid input', demand: '—', status: 'warn' as const }]}
      steps={steps}
      references={[
        { topic: 'Fourth-power law', basis: 'LEF = (P/80 kN)^n per axle', source: 'AASHO Road Test (1962); AASHTO 1993, Appendix on ESAL factors' },
        { topic: 'Axle groups', basis: 'group load shared equally per axle', source: 'Huang, Pavement Analysis and Design' },
        { topic: 'Growth', basis: 'G = ((1 + r)ⁿ − 1)/r', source: 'AASHTO 1993, Part II (traffic)' },
      ]}
    />
  )
}
