import { useState } from 'react'
import { solveEarthwork, type EarthworkInput, type EarthworkResult, type Section } from '../engine/earthwork'
import { Card, Num, Pick, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, BRAND, FAIL, MUTED, HAIR, f2, f3, signed } from '../lib/influenceStyle'

// Surveying toolbox — EARTHWORK mode. One cross-section per station (cut and
// fill areas in m²); the engine integrates end-area volumes, applies the
// prismoidal check where a middle area is supplied, and accumulates the
// mass-haul ordinates (engine/earthwork.ts).

interface RowUI {
  station: string
  cut: string
  fill: string
  midCut: string
  midFill: string
}

const SAMPLE: RowUI[] = [
  { station: '0', cut: '0', fill: '10', midCut: '', midFill: '' },
  { station: '20', cut: '12', fill: '0', midCut: '4', midFill: '3' },
  { station: '40', cut: '8', fill: '2', midCut: '', midFill: '' },
]

const sNum = (s: string): number | undefined => (s.trim() === '' ? undefined : parseFloat(s))

export function EarthworkMode() {
  const [rows, setRows] = useState<RowUI[]>(SAMPLE)
  const [cutFactor, setCutFactor] = useState(1)
  const [fillFactor, setFillFactor] = useState(1)
  const [intervalMode, setIntervalMode] = useState<'from-stations' | 'fixed'>('from-stations')
  const [fixedInterval, setFixedInterval] = useState(20)

  const setRow = (i: number, patch: Partial<RowUI>) =>
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  const addRow = () => {
    const last = parseFloat(rows[rows.length - 1]?.station || '0') || 0
    setRows((rs) => [...rs, { station: String(last + 20), cut: '', fill: '', midCut: '', midFill: '' }])
  }
  const delRow = (i: number) => setRows((rs) => rs.filter((_, k) => k !== i))
  const loadSample = () => setRows(SAMPLE.map((r) => ({ ...r })))

  const sections: Section[] = rows.map((r, i) => ({
    station: parseFloat(r.station) || i * 20,
    cut: sNum(r.cut) ?? 0,
    fill: sNum(r.fill) ?? 0,
    midCut: sNum(r.midCut),
    midFill: sNum(r.midFill),
  }))
  const input: EarthworkInput = {
    sections,
    interval: intervalMode === 'fixed' ? fixedInterval : undefined,
    cutFactor,
    fillFactor,
  }
  const res: EarthworkResult | null = (() => { try { return solveEarthwork(input) } catch { return null } })()

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
  ] : []

  return (
    <div>
      <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
        <ReportControls title="Earthwork Report" badges={['End area · prismoidal']} />
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Cut-and-fill from cross-section areas: end-area volumes between stations, the prismoidal
          correction wherever a middle section is known, and the mass-haul curve that answers the
          borrow/waste question at a glance.
        </p>

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          {/* ── inputs ── */}
          <div className="space-y-5">
            <Card title="Cross-sections" hint="areas in m²; middle areas feed the prismoidal check">
              <div className="sm:col-span-2 lg:col-span-3">
                <button type="button" onClick={loadSample}
                  className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                  Load the sample strip — three sections at 20 m
                </button>
              </div>
              <div className="sm:col-span-2 lg:col-span-3 space-y-1.5">
                {rows.map((r, i) => (
                  <div key={i} className="grid grid-cols-[1fr_2.6rem_2.6rem_2.6rem_2.6rem_1.4rem] items-end gap-1">
                    <Num label={`STA ${i + 1}`} unit="m" value={parseFloat(r.station) || 0} onChange={(v) => setRow(i, { station: String(v) })} step="10" />
                    <Num label="Cut" unit="m²" value={sNum(r.cut) ?? 0} onChange={(v) => setRow(i, { cut: String(v) })} step="0.5" />
                    <Num label="Fill" unit="m²" value={sNum(r.fill) ?? 0} onChange={(v) => setRow(i, { fill: String(v) })} step="0.5" />
                    <Num label="Mid C" unit="m²" value={sNum(r.midCut) ?? 0} onChange={(v) => setRow(i, { midCut: String(v) })} step="0.5" />
                    <Num label="Mid F" unit="m²" value={sNum(r.midFill) ?? 0} onChange={(v) => setRow(i, { midFill: String(v) })} step="0.5" />
                    <button type="button" onClick={() => delRow(i)} disabled={rows.length <= 2}
                      className="mb-1.5 text-muted hover:text-fail disabled:opacity-30">✕</button>
                  </div>
                ))}
                <button type="button" onClick={addRow}
                  className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">+ Add section</button>
              </div>
            </Card>

            <Card title="Factors & spacing">
              <Num label="Cut shrinkage factor" value={cutFactor} onChange={setCutFactor} min={0.5} max={1.5} step="0.01" />
              <Num label="Fill bulking factor" value={fillFactor} onChange={setFillFactor} min={0.5} max={1.5} step="0.01" />
              <Pick label="Interval" value={intervalMode} onChange={(v) => setIntervalMode(v as 'from-stations' | 'fixed')}
                options={[['from-stations', 'Derived from the station column'], ['fixed', 'Fixed spacing']]} />
              {intervalMode === 'fixed' && (
                <Num label="Fixed interval d" unit="m" value={fixedInterval} onChange={setFixedInterval} min={1} max={100} step="5" />
              )}
            </Card>
          </div>

          {/* ── results ── */}
          <div className="space-y-5">
            {res ? (
              <>
                <ResultCard title="Volume summary">
                  <Row label="Total cut" value={`${f3(res.totalCut)} m³`} sub={`shrinkage ×${f2(res.cutFactor)}`} />
                  <Row label="Total fill" value={`${f3(res.totalFill)} m³`} sub={`bulking ×${f2(res.fillFactor)}`} />
                  <Row label="Balance (cut − fill)" value={`${signed(res.balance)} m³`} sub={res.balance >= 0 ? 'surplus → waste' : 'deficit → borrow'} alert={Math.abs(res.balance) > 1e-9} />
                  <Row label="Haul (upper bound)" value={`${f2(res.totalHaulUpper / 1000)} ×10³ m³·m`} sub={`peak ordinate ${f3(res.maxOrdinate)} m³ at ${f2(res.maxOrdinateStation)} m`} />
                </ResultCard>

                <DrawingCard title="Mass-haul diagram" meta="rising = cut surplus · falling = fill demand · zero line = balance">
                  <DrawingFrame label="Mass-haul diagram">
                    <MassDiagram res={res} />
                  </DrawingFrame>
                </DrawingCard>

                <ResultCard title="Interval volumes">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-muted">
                        <tr className="text-left">
                          <th className="py-1 pr-2 font-semibold">Stations</th>
                          <th className="pr-2 text-right font-semibold">d (m)</th>
                          <th className="pr-2 text-right font-semibold">Cut (m³)</th>
                          <th className="pr-2 text-right font-semibold">Fill (m³)</th>
                          <th className="pr-2 text-right font-semibold">Prism. cut</th>
                          <th className="pr-2 text-right font-semibold">Corr. (m³)</th>
                          <th className="pr-2 text-right font-semibold">Net</th>
                          <th className="text-right font-semibold">Mass ord.</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono">
                        {res.rows.map((r, k) => (
                          <tr key={k} className="border-t border-hairline-2">
                            <td className="py-1 pr-2">{f2(r.from)} → {f2(r.to)}</td>
                            <td className="pr-2 text-right">{f2(r.distance)}</td>
                            <td className="pr-2 text-right">{f3(r.cutVol)}</td>
                            <td className="pr-2 text-right">{f3(r.fillVol)}</td>
                            <td className="pr-2 text-right text-muted">{r.cutPrism === null ? '—' : f3(r.cutPrism)}</td>
                            <td className="pr-2 text-right text-muted">{r.cutCorrection === null ? '—' : f3(r.cutCorrection)}</td>
                            <td className={`pr-2 text-right ${r.net >= 0 ? 'text-brand' : 'text-fail'}`}>{signed(r.net)}</td>
                            <td className="text-right font-semibold">{f3(r.massOrdinate)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ResultCard>
              </>
            ) : (
              <ResultCard title="The strip will not integrate">
                <p className="text-sm text-fail">
                  Give at least two sections with rising stations and positive spacing — cut and fill
                  areas in m², middle areas optional.
                </p>
              </ResultCard>
            )}
          </div>
        </div>

        {res && (
          <div className="mt-6">
            <WorkedSolution steps={steps} title="Earthwork — step-by-step" />
          </div>
        )}
      </div>
    </div>
  )
}

// ── mass diagram ──────────────────────────────────────────────────────────

function MassDiagram({ res }: { res: EarthworkResult }) {
  const W = 760
  const H = 320
  const padL = 62
  const padR = 20
  const padT = 22
  const padB = 38

  const stations = [res.rows[0].from, ...res.rows.map((r) => r.to)]
  const ordinates = [0, ...res.rows.map((r) => r.massOrdinate)]
  const sMin = Math.min(...stations); const sMax = Math.max(...stations)
  const oMin = Math.min(...ordinates, 0); const oMax = Math.max(...ordinates, 0)
  const spanO = Math.max(oMax - oMin, 1e-6)

  const x = (s: number) => padL + ((s - sMin) / Math.max(sMax - sMin, 1e-6)) * (W - padL - padR)
  const y = (o: number) => padT + ((oMax - o) / spanO) * (H - padT - padB)

  const pts = stations.map((s, i) => `${x(s)},${y(ordinates[i])}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Mass-haul diagram">
      {/* zero balance line */}
      <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke={INK} strokeWidth="1.4" />
      <text x={padL - 6} y={y(0) + 3.5} textAnchor="end" fontSize="10" fill={INK} fontFamily="var(--font-mono, monospace)">0</text>

      {/* other gridlines */}
      {ordinates.filter((o) => Math.abs(o) > 1e-9).map((o) => (
        <g key={o}>
          <line x1={padL} x2={W - padR} y1={y(o)} y2={y(o)} stroke={HAIR} />
          <text x={padL - 6} y={y(o) + 3.5} textAnchor="end" fontSize="9" fill={MUTED} fontFamily="var(--font-mono, monospace)">{f2(o)}</text>
        </g>
      ))}

      {/* the curve */}
      <polyline points={pts} fill="none" stroke={BRAND} strokeWidth="2.4" />

      {/* dots + station labels */}
      {stations.map((s, i) => (
        <g key={i}>
          <circle cx={x(s)} cy={y(ordinates[i])} r="2.6" fill={INK} />
          <text x={x(s)} y={H - padB + 14} textAnchor="middle" fontSize="9.5" fill={INK} fontFamily="var(--font-mono, monospace)">{f2(s)}</text>
        </g>
      ))}

      {/* peak annotation */}
      {res.maxOrdinate > 1e-9 && (
        <text x={x(res.maxOrdinateStation)} y={y(res.maxOrdinate) - 8} textAnchor="middle" fontSize="10" fill={BRAND} fontFamily="var(--font-mono, monospace)">
          peak {f2(res.maxOrdinate)} m³
        </text>
      )}
      {res.balance < -1e-9 && (
        <text x={W - padR} y={padT - 6} textAnchor="end" fontSize="10" fill={FAIL} fontFamily="var(--font-mono, monospace)">
          borrow {f2(-res.balance)} m³
        </text>
      )}
      <text x={padL} y={padT - 6} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">ordinate (m³)</text>
    </svg>
  )
}
