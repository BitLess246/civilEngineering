import { useState } from 'react'
import { solveEarthwork, type EarthworkInput, type EarthworkResult, type Section } from '../engine/earthwork'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { MassDiagram } from '../components/surveyingSketches'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// Earthwork — one cross-section per station (cut and fill areas in m²); the
// engine integrates end-area volumes, applies the prismoidal check where a
// middle area is supplied, and accumulates the mass-haul ordinates
// (engine/earthwork.ts). Stations in m, volumes in m³.

interface RowUI { station: string; cut: string; fill: string; midCut: string; midFill: string }

const SAMPLE: RowUI[] = [
  { station: '0', cut: '0', fill: '10', midCut: '', midFill: '' },
  { station: '20', cut: '12', fill: '0', midCut: '4', midFill: '3' },
  { station: '40', cut: '8', fill: '2', midCut: '', midFill: '' },
]

const sNum = (s: string): number | undefined => (s.trim() === '' ? undefined : parseFloat(s))
const signed = (v: number) => `${v > 0 ? '+' : ''}${f3(v)}`

export default function Earthwork() {
  const [rows, setRows] = useState<RowUI[]>(SAMPLE)
  const [cutFactor, setCutFactor] = useState(1)
  const [fillFactor, setFillFactor] = useState(1)
  const [intervalMode, setIntervalMode] = useState<'from-stations' | 'fixed'>('from-stations')
  const [fixedInterval, setFixedInterval] = useState(20)

  const setRow = (i: number, patch: Partial<RowUI>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  const addRow = () => {
    const last = parseFloat(rows[rows.length - 1]?.station || '0') || 0
    setRows((rs) => [...rs, { station: String(last + 20), cut: '', fill: '', midCut: '', midFill: '' }])
  }

  const sections: Section[] = rows.map((r, i) => ({
    station: parseFloat(r.station) || i * 20,
    cut: sNum(r.cut) ?? 0,
    fill: sNum(r.fill) ?? 0,
    midCut: sNum(r.midCut),
    midFill: sNum(r.midFill),
  }))
  const input: EarthworkInput = { sections, interval: intervalMode === 'fixed' ? fixedInterval : undefined, cutFactor, fillFactor }
  let res: EarthworkResult | null = null
  let err = ''
  try { res = solveEarthwork(input) } catch (e) { err = (e as Error).message }

  const steps: SolutionStep[] = res ? [
    {
      title: 'Volumes by the average end-area method',
      lines: [
        { tex: `V = \\frac{A_1 + A_2}{2}\\cdot d` },
        { tex: `V_{\\text{cut},1} = \\frac{${f2(res.rows[0].cutA1)} + ${f2(res.rows[0].cutA2)}}{2}\\times ${f2(res.rows[0].distance)} = ${f3(res.rows[0].cutVol)}\\text{ m}^3,\\quad V_{\\text{fill},1} = \\frac{${f2(res.rows[0].fillA1)} + ${f2(res.rows[0].fillA2)}}{2}\\times ${f2(res.rows[0].distance)} = ${f3(res.rows[0].fillVol)}\\text{ m}^3` },
        { text: 'Cut and fill are integrated separately between each pair of sections — the areas come from the cross-section sheets, the spacing d from the station column (or the fixed interval).', },
        { tex: `\\Sigma\\text{cut} = ${f3(res.totalCut)}\\text{ m}^3,\\qquad \\Sigma\\text{fill} = ${f3(res.totalFill)}\\text{ m}^3` },
        { text: `Balance = ${signed(res.balance)} m³: ${res.balance >= 0 ? 'surplus cut to waste' : 'borrow needed'}.` },
      ],
    },
    ...(res.rows.some((r) => r.cutPrism !== null) ? [{
      title: 'Prismoidal check where a middle area was supplied',
      lines: [
        { tex: `V_{\\text{prism}} = \\frac{d}{6}\\left(A_1 + 4A_m + A_2\\right)` },
        ...res.rows.map((r, k) => ({ r, k })).filter(({ r }) => r.cutCorrection !== null).map(({ r, k }) => {
          const am = sections[k]?.midCut ?? sections[k + 1]?.midCut ?? 0
          return { item: `${f2(r.from)} → ${f2(r.to)} m: (${f2(r.cutA1)} + 4×${f2(am)} + ${f2(r.cutA2)})/6×${f2(r.distance)} = ${f3(r.cutPrism!)} m³ — end-area ${f3(r.cutVol)} m³, correction ${f3(r.cutCorrection!)} m³` }
        }),
        { text: 'The end-area value over-estimates on curved ground; the correction is the number the board problem asks for.' },
      ],
    } satisfies SolutionStep] : []),
    {
      title: 'Mass-haul reading',
      lines: [
        { tex: `M_1 = 0 + (${signed(res.rows[0].cutVol)} - ${signed(res.rows[0].fillVol)}) = ${f3(res.rows[0].massOrdinate)}\\text{ m}^3${res.rows.length > 1 ? `,\\quad M_2 = ${f3(res.rows[0].massOrdinate)} + (${signed(res.rows[1].cutVol)} - ${signed(res.rows[1].fillVol)}) = ${f3(res.rows[1].massOrdinate)}\\text{ m}^3` : ''}` },
        { text: `Ordinates accumulate net (cut − fill): +${f3(res.maxOrdinate)} m³ at station ${f2(res.maxOrdinateStation)}${res.minOrdinate < -1e-9 ? `, lowest −${f3(-res.minOrdinate)} m³ at ${f2(res.minOrdinateStation)}` : ''}.` },
        { text: `The upper bound on haul is Σ|ordinate|·interval = ${f2(res.totalHaulUpper / 1000)} ×10³ m³·m — the balance point on the diagram is where borrow or waste is decided.` },
      ],
    },
  ] : [{ title: 'The strip will not integrate', lines: [{ text: err }] }]

  const surplus = !!res && res.balance >= 0

  return (
    <WorkspacePage title="Earthwork" badges={['Surveying', 'End area · mass haul']}
      intro="Cut and fill from cross-section areas: end-area volumes between stations, the prismoidal correction wherever a middle section is known, and the mass-haul curve that answers the borrow-or-waste question at a glance."
      inputs={<>
        <InputGroup title="Cross-sections" hint="Areas in m². Middle areas are optional and switch on the prismoidal check for that interval.">
          <div className="col-span-2 space-y-1.5">
            {rows.map((r, i) => (
              <div key={i} className="space-y-1 rounded-md border border-hairline-2 p-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11.5px] font-semibold text-muted">STA</span>
                  <input value={r.station} onChange={(e) => setRow(i, { station: e.target.value })} inputMode="decimal" aria-label={`Section ${i + 1} station`} className="w-24 min-w-0 text-[13px]" />
                  <span className="text-[11px] text-faint">m</span>
                  <span className="flex-1" />
                  <button type="button" aria-label={`Remove section ${i + 1}`} onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))} disabled={rows.length <= 2}
                    className="text-muted hover:text-fail disabled:opacity-30">✕</button>
                </div>
                <div className="grid grid-cols-4 gap-1.5 [&_input]:!px-1.5">
                  <Num label="Cut" value={sNum(r.cut) ?? 0} onChange={(v) => setRow(i, { cut: String(v) })} min={0} step="0.5" />
                  <Num label="Fill" value={sNum(r.fill) ?? 0} onChange={(v) => setRow(i, { fill: String(v) })} min={0} step="0.5" />
                  <Num label="Mid cut" value={sNum(r.midCut) ?? 0} onChange={(v) => setRow(i, { midCut: v === 0 ? '' : String(v) })} min={0} step="0.5" />
                  <Num label="Mid fill" value={sNum(r.midFill) ?? 0} onChange={(v) => setRow(i, { midFill: v === 0 ? '' : String(v) })} min={0} step="0.5" />
                </div>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={addRow}
                className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">+ Add section</button>
              <button type="button" onClick={() => setRows(SAMPLE.map((r) => ({ ...r })))}
                className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">Sample: three sections</button>
            </div>
          </div>
        </InputGroup>
        <InputGroup title="Factors and spacing">
          <Num label="Cut shrinkage" value={cutFactor} onChange={setCutFactor} min={0.5} max={1.5} step="0.01" />
          <Num label="Fill bulking" value={fillFactor} onChange={setFillFactor} min={0.5} max={1.5} step="0.01" />
          <div className="col-span-2">
            <Pick label="Interval" value={intervalMode} onChange={(v) => setIntervalMode(v as 'from-stations' | 'fixed')}
              options={[['from-stations', 'From the station column'], ['fixed', 'Fixed spacing']]} />
          </div>
          {intervalMode === 'fixed' && <Num label="Fixed interval d" unit="m" value={fixedInterval} onChange={setFixedInterval} min={1} max={100} step="5" />}
        </InputGroup>
      </>}
      checks={res ? <>
        <CheckCard title="Balance" basis="cut − fill over the strip" status={Math.abs(res.balance) < 1e-9 ? 'pass' : 'info'} pillLabel={Math.abs(res.balance) < 1e-9 ? 'BALANCED' : surplus ? 'WASTE' : 'BORROW'}
          value={signed(res.balance)} unit="m³" formula="Σ cut − Σ fill"
          pairs={[{ label: 'Total cut', value: `${f3(res.totalCut)} m³` }, { label: 'Total fill', value: `${f3(res.totalFill)} m³` }]} />
        <CheckCard title="Mass haul" basis="peak ordinate" status="info" value={f3(res.maxOrdinate)} unit="m³" formula="M = Σ (cut − fill)"
          pairs={[{ label: 'At station', value: `${f2(res.maxOrdinateStation)} m` }, { label: 'Haul, upper bound', value: `${f2(res.totalHaulUpper / 1000)} ×10³ m³·m` }]} />
        <CheckCard title="Factors" basis="applied before accumulating" status="info" value={`×${f2(res.cutFactor)} / ×${f2(res.fillFactor)}`} formula="cut shrinkage / fill bulking"
          pairs={[{ label: 'Intervals', value: `${res.rows.length}` }, { label: 'Prismoidal checks', value: `${res.rows.filter((r) => r.cutPrism !== null).length}` }]} />
      </> : (
        <CheckCard title="The strip will not integrate" basis="check the sections" status="warn" pillLabel="CHECK" value="—" formula={err} />
      )}
      summary={[
        { label: 'Sections', value: `${rows.length}` },
        { label: 'Interval', value: intervalMode === 'fixed' ? `${f2(fixedInterval)} m fixed` : 'from stations' },
        { label: 'Cut shrinkage', value: `×${f2(cutFactor)}` }, { label: 'Fill bulking', value: `×${f2(fillFactor)}` },
      ]}
      drawing={res ? { title: 'Mass-haul diagram and interval volumes', node: <>
        <div data-pdf-drawing>
          <MassDiagram res={res} />
        </div>
        <p className="mt-1 text-[10.5px] text-faint">Rising = cut surplus · falling = fill demand · zero line = balance.</p>
        <div className="mt-3 overflow-x-auto rounded-md border border-hairline bg-sheet">
          <table className="w-full min-w-[620px] border-collapse text-[11.5px]">
            <thead><tr className="bg-sheet-2 text-left text-[10.5px] font-bold uppercase tracking-wide text-muted">
              {['Stations', 'd (m)', 'Cut (m³)', 'Fill (m³)', 'Prism. cut', 'Corr. (m³)', 'Net', 'Mass ord.'].map((h, k) => (
                <th key={h} className={`px-2.5 py-1.5 ${k ? 'text-right' : ''}`}>{h}</th>
              ))}
            </tr></thead>
            <tbody className="font-mono">
              {res.rows.map((r, k) => (
                <tr key={k} className="border-t border-hairline-2">
                  <td className="px-2.5 py-1">{f2(r.from)} → {f2(r.to)}</td>
                  <td className="px-2.5 py-1 text-right">{f2(r.distance)}</td>
                  <td className="px-2.5 py-1 text-right">{f3(r.cutVol)}</td>
                  <td className="px-2.5 py-1 text-right">{f3(r.fillVol)}</td>
                  <td className="px-2.5 py-1 text-right text-muted">{r.cutPrism === null ? '—' : f3(r.cutPrism)}</td>
                  <td className="px-2.5 py-1 text-right text-muted">{r.cutCorrection === null ? '—' : f3(r.cutCorrection)}</td>
                  <td className={`px-2.5 py-1 text-right ${r.net >= 0 ? 'text-brand' : 'text-fail'}`}>{signed(r.net)}</td>
                  <td className="px-2.5 py-1 text-right font-semibold">{f3(r.massOrdinate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </> } : undefined}
      results={res ? [
        { check: 'Total cut', basis: 'Σ (A₁ + A₂)/2 · d × shrinkage', demand: `${f3(res.totalCut)} m³`, status: 'info' },
        { check: 'Total fill', basis: 'Σ (A₁ + A₂)/2 · d × bulking', demand: `${f3(res.totalFill)} m³`, status: 'info' },
        { check: 'Balance', basis: 'cut − fill', demand: `${signed(res.balance)} m³`, status: 'info' },
        { check: 'Peak mass ordinate', basis: `at ${f2(res.maxOrdinateStation)} m`, demand: `${f3(res.maxOrdinate)} m³`, status: 'info' },
      ] : [{ check: 'Volumes', basis: err, demand: '—', status: 'warn' }]}
      steps={steps}
      references={[
        { topic: 'Average end area', basis: 'V = (A₁ + A₂)/2 · d', source: 'Route surveying — earthwork' },
        { topic: 'Prismoidal formula', basis: 'V = d/6 · (A₁ + 4Aₘ + A₂); correction = end-area − prismoidal', source: 'Route surveying — earthwork' },
        { topic: 'Mass diagram', basis: 'ordinate = cumulative (cut × shrinkage − fill × bulking)', source: 'Route surveying — mass haul' },
      ]}
    />
  )
}
