import { useState } from 'react'
import { reduceLeveling, accuracyClass, type LevelInput, type LevelResult } from '../engine/leveling'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { LevelProfile } from '../components/surveyingSketches'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// Differential leveling — the user edits a field book (station, BS, FS and an
// optional intermediate sight per row); the engine reduces it by HI and rise
// & fall, page-checks it, distributes any misclosure over the setups and
// rates the run's order of accuracy (engine/leveling.ts). Elevations in m.

interface BookRow { sta: string; bs: string; fs: string; ifs: string }

const SAMPLE_ROWS: BookRow[] = [
  { sta: 'BM1', bs: '1.50', fs: '', ifs: '' },
  { sta: 'TP1', bs: '1.20', fs: '0.90', ifs: '' },
  { sta: 'STA 0+020', bs: '', fs: '', ifs: '2.30' },
  { sta: 'BM2', bs: '', fs: '2.05', ifs: '' },
]

const num = (s: string): number | undefined => (s.trim() === '' ? undefined : parseFloat(s))
const cell = (s: string) => (s === '' ? 0 : parseFloat(s))
const blankIfZero = (v: number) => (v === 0 ? '' : String(v))
const signed = (v: number) => `${v > 0 ? '+' : ''}${f3(v)}`

export default function DifferentialLeveling() {
  const [rows, setRows] = useState<BookRow[]>(SAMPLE_ROWS)
  const [startElev, setStartElev] = useState(100)
  const [endElev, setEndElev] = useState('99.78')
  const [distanceKm, setDistanceKm] = useState('0.4')

  const setRow = (i: number, patch: Partial<BookRow>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  const loadSample = () => { setRows(SAMPLE_ROWS.map((r) => ({ ...r }))); setStartElev(100); setEndElev('99.78'); setDistanceKm('0.4') }

  const input: LevelInput = {
    rows: rows.map((r) => ({ sta: r.sta || '?', bs: num(r.bs), fs: num(r.fs), ifs: r.ifs.trim() === '' ? [] : [parseFloat(r.ifs)] })),
    startElev,
    endElev: num(endElev),
    distanceKm: num(distanceKm),
  }
  let res: LevelResult | null = null
  let err = ''
  try { res = reduceLeveling(input) } catch (e) { err = (e as Error).message }

  const closed = !!res && res.misclosure !== null
  const rated = !!res && res.tolerance !== null && res.misclosureMm !== null
  const within = rated && res!.misclosureMm! <= res!.tolerance!.third
  const order = rated ? accuracyClass(res!).split(' (')[0] : ''
  const balanced = !!res && Math.abs(res.pageCheck.bsFs - res.pageCheck.riseFall) < 5e-4 && Math.abs(res.pageCheck.bsFs - res.pageCheck.delta) < 5e-4

  const steps: SolutionStep[] = res ? [
    { title: 'Page check — the book must balance before anything else', pass: balanced, lines: [
      { tex: `\\Sigma BS - \\Sigma FS = ${f3(res.sumBS)} - ${f3(res.sumFS)} = ${f3(res.pageCheck.bsFs)}\\text{ m}` },
      { tex: `\\Sigma\\text{rise} - \\Sigma\\text{fall} = ${f3(res.sumRise)} - ${f3(res.sumFall)} = ${f3(res.pageCheck.riseFall)}\\text{ m}` },
      { text: `Both equal the measured Δelev = ${f3(res.pageCheck.delta)} m over ${res.setups} setup${res.setups === 1 ? '' : 's'} — the reduction is arithmetically sound.` },
    ] },
    ...(res.misclosure !== null ? [
      { title: 'Misclosure and its distribution', lines: [
        { tex: `\\varepsilon = \\text{measured} - \\text{known} = ${f3(res.measured)} - ${f3(input.endElev!)} = ${f3(res.misclosure)}\\text{ m}` },
        { tex: `c_{\\text{per setup}} = -\\varepsilon / n = -(${f3(res.misclosure)})/${res.setups} = ${f3(res.perSetup!)}\\text{ m}` },
        { text: `Each point takes one correction per setup elapsed: point k after k setups moves ${f3(res.perSetup!)}·k m. The starting benchmark never moves.` },
      ] } satisfies SolutionStep,
      { title: `Order of accuracy — ${accuracyClass(res)}`, pass: rated ? within : undefined, lines: [
        { text: 'Conventional limits scale with the square root of the path length K (km): first order 4√K, second 8√K, third 12√K, all in millimetres.' },
        ...(res.tolerance ? [
          { tex: `4\\sqrt{K} = ${f2(res.tolerance.first)}\\text{ mm},\\quad 8\\sqrt{K} = ${f2(res.tolerance.second)}\\text{ mm},\\quad 12\\sqrt{K} = ${f2(res.tolerance.third)}\\text{ mm} \\quad (K = ${f2(input.distanceKm!)}\\text{ km})` },
          { text: `This run closed ${f2(res.misclosureMm!)} mm over ${f2(input.distanceKm!)} km.` },
        ] : [{ text: 'Give the path length to rate the run.' }]),
      ] } satisfies SolutionStep,
    ] : []),
  ] : [{ title: 'The book does not reduce', lines: [{ text: err }] }]

  return (
    <WorkspacePage title="Differential Leveling" badges={['Surveying', 'HI · rise & fall']}
      intro="Reduce a level run the way the field book was kept: HI and rise & fall side by side, the page check that proves the arithmetic, and the misclosure handed back to the points in proportion to the setups elapsed."
      inputs={<>
        <InputGroup title="Field book" hint="BS + FS on turning points; an IFS alone is a profile point. 0 leaves a cell blank.">
          <div className="col-span-2 space-y-1.5">
            {rows.map((r, i) => (
              <div key={i} className="space-y-1 rounded-md border border-hairline-2 p-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 shrink-0 font-mono text-[10.5px] text-faint">{i + 1}</span>
                  <input value={r.sta} onChange={(e) => setRow(i, { sta: e.target.value })} aria-label={`Station ${i + 1} name`} className="min-w-0 flex-1 text-[13px]" />
                  <button type="button" aria-label={`Remove station ${i + 1}`} onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))} disabled={rows.length <= 2}
                    className="text-muted hover:text-fail disabled:opacity-30">✕</button>
                </div>
                <div className="grid grid-cols-3 gap-1.5 [&_input]:!px-2">
                  <Num label="BS (m)" value={cell(r.bs)} onChange={(v) => setRow(i, { bs: blankIfZero(v) })} step="0.001" />
                  <Num label="FS (m)" value={cell(r.fs)} onChange={(v) => setRow(i, { fs: blankIfZero(v) })} step="0.001" />
                  <Num label="IFS (m)" value={cell(r.ifs)} onChange={(v) => setRow(i, { ifs: blankIfZero(v) })} step="0.001" />
                </div>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setRows((rs) => [...rs, { sta: `TP${rs.length}`, bs: '', fs: '', ifs: '' }])}
                className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">+ Add row</button>
              <button type="button" onClick={loadSample}
                className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">Sample: BM1 → TP1 → 0+020 → BM2</button>
            </div>
          </div>
        </InputGroup>
        <InputGroup title="Datum and closure" hint="Known end elevation 0 treats the run as open.">
          <Num label="Start elevation" unit="m" value={startElev} onChange={setStartElev} step="0.001" />
          <Num label="Known end elevation" unit="m" value={cell(endElev)} onChange={(v) => setEndElev(blankIfZero(v))} step="0.001" />
          <Num label="Path length K" unit="km" value={cell(distanceKm)} onChange={(v) => setDistanceKm(blankIfZero(v))} step="0.05" />
        </InputGroup>
      </>}
      checks={res ? <>
        <CheckCard title="Page check" basis={`${res.setups} setups`} status={balanced ? 'pass' : 'fail'} pillLabel={balanced ? 'BALANCED' : 'CHECK'}
          value={signed(res.pageCheck.bsFs)} unit="m" formula="ΣBS − ΣFS = Σrise − Σfall = Δelev"
          pairs={[{ label: 'Σrise − Σfall', value: `${signed(res.pageCheck.riseFall)} m` }, { label: 'Measured Δelev', value: `${signed(res.measured)} m` }]} />
        {closed ? (
          <CheckCard title="Misclosure" basis={rated ? order : 'path length not given'} status={!rated ? 'info' : within ? 'pass' : 'fail'}
            pillLabel={!rated ? undefined : within ? order.toUpperCase() : 'RE-RUN'}
            value={f2(res.misclosureMm ?? Math.abs(res.misclosure!) * 1000)} unit="mm" formula="ε = measured − known"
            ratio={rated ? res.misclosureMm! / res.tolerance!.third : undefined} ratioLabel="|ε| ÷ 12√K"
            pairs={[{ label: 'ε (signed)', value: `${signed(res.misclosure!)} m` }, { label: 'Correction per setup', value: `${signed(res.perSetup!)} m` }]} />
        ) : (
          <CheckCard title="Misclosure" basis="open run" status="info" value="—" formula="Give a known end elevation to close the run." />
        )}
        <CheckCard title="End elevation" basis={`${res.points[res.points.length - 1].sta}, adjusted`} status="info"
          value={f3(res.points[res.points.length - 1].adj)} unit="m"
          pairs={[{ label: 'Unadjusted', value: `${f3(res.points[res.points.length - 1].elev)} m` }, { label: 'Start', value: `${f3(startElev)} m` }]} />
      </> : (
        <CheckCard title="The book does not reduce" basis="check the rows" status="warn" pillLabel="CHECK" value="—" formula={err} />
      )}
      summary={[
        { label: 'Stations', value: `${rows.length}` }, { label: 'Start elevation', value: `${f3(startElev)} m` },
        { label: 'Known end elevation', value: endElev === '' ? 'open run' : `${f3(cell(endElev))} m` },
        { label: 'Path length K', value: distanceKm === '' ? '—' : `${f2(cell(distanceKm))} km` },
      ]}
      drawing={res ? { title: 'Profile and reduced level book', node: <>
        <div data-pdf-drawing>
          <LevelProfile res={res} startElev={startElev} />
        </div>
        <p className="mt-1 text-[10.5px] text-faint">Elevations to scale · dashed = height of instrument · dots = intermediate sights.</p>
        <div className="mt-3 overflow-x-auto rounded-md border border-hairline bg-sheet">
          <table className="w-full min-w-[560px] border-collapse text-[11.5px]">
            <thead><tr className="bg-sheet-2 text-left text-[10.5px] font-bold uppercase tracking-wide text-muted">
              {['Station', 'BS', 'HI', 'IFS', 'FS', 'Rise/fall', 'Elev', 'Adjusted'].map((h, k) => (
                <th key={h} className={`px-2.5 py-1.5 ${k ? 'text-right' : ''}`}>{h}</th>
              ))}
            </tr></thead>
            <tbody className="font-mono">
              {res.points.map((p, k) => (
                <tr key={k} className="border-t border-hairline-2">
                  <td className="px-2.5 py-1 font-sans text-ink">{p.sta}</td>
                  <td className="px-2.5 py-1 text-right">{p.bs === null ? '—' : f3(p.bs)}</td>
                  <td className="px-2.5 py-1 text-right">{p.hi === null ? '—' : f3(p.hi)}</td>
                  <td className="px-2.5 py-1 text-right text-muted">{p.ifs.length === 0 ? '—' : p.ifs.map((z) => f3(z)).join(', ')}</td>
                  <td className="px-2.5 py-1 text-right">{p.fs === null ? '—' : f3(p.fs)}</td>
                  <td className={`px-2.5 py-1 text-right ${p.riseFall === null ? 'text-faint' : p.riseFall >= 0 ? 'text-brand' : 'text-fail'}`}>{p.riseFall === null ? '—' : signed(p.riseFall)}</td>
                  <td className="px-2.5 py-1 text-right">{f3(p.elev)}</td>
                  <td className="px-2.5 py-1 text-right font-semibold">{f3(p.adj)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </> } : undefined}
      results={res ? [
        { check: 'Page check', basis: 'ΣBS − ΣFS = Σrise − Σfall', demand: `${signed(res.pageCheck.bsFs)} m`, limit: `${signed(res.pageCheck.riseFall)} m`, status: balanced ? 'pass' : 'fail' },
        { check: 'Misclosure', basis: closed ? 'measured − known' : 'open run', demand: closed ? `${signed(res.misclosure!)} m` : '—',
          limit: rated ? `±${f2(res.tolerance!.third)} mm` : undefined, ratio: rated ? res.misclosureMm! / res.tolerance!.third : undefined,
          status: !rated ? 'info' : within ? 'pass' : 'fail' },
        { check: 'Order of accuracy', basis: '4√K / 8√K / 12√K mm', demand: rated ? order : '—', status: !rated ? 'info' : within ? 'pass' : 'fail' },
      ] : [{ check: 'Reduction', basis: err, demand: '—', status: 'warn' }]}
      steps={steps}
      references={[
        { topic: 'Height of instrument', basis: 'HI = elev + BS; elev = HI − FS (or − IFS)', source: 'Plane surveying — differential leveling' },
        { topic: 'Rise and fall', basis: 'rise/fall = previous reading − current reading; Σrise − Σfall = ΣBS − ΣFS', source: 'Plane surveying — level book reduction' },
        { topic: 'Adjustment', basis: 'correction −ε/n per setup, cumulative along the run', source: 'Plane surveying — misclosure distribution' },
        { topic: 'Order of accuracy', basis: '4√K, 8√K, 12√K mm for first, second and third order (K in km)', source: 'Geodetic leveling standards' },
      ]}
    />
  )
}
