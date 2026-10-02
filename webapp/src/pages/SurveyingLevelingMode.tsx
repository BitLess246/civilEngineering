import { useState } from 'react'
import { reduceLeveling, accuracyClass, type LevelInput, type LevelResult } from '../engine/leveling'
import { Card, Num, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, BRAND, FAIL, MUTED, HAIR, f2, f3, signed } from '../lib/influenceStyle'

// Surveying toolbox — LEVELING mode. The user edits a field book (station,
// BS, FS and an optional intermediate sight per row); the engine reduces it
// by HI and rise & fall, page-checks it, distributes any misclosure over the
// setups and rates the loop's order of accuracy (engine/leveling.ts).

interface Row {
  sta: string
  bs: string
  fs: string
  ifs: string
}

const SAMPLE_ROWS: Row[] = [
  { sta: 'BM1', bs: '1.50', fs: '', ifs: '' },
  { sta: 'TP1', bs: '1.20', fs: '0.90', ifs: '' },
  { sta: 'STA 0+020', bs: '', fs: '', ifs: '2.30' },
  { sta: 'BM2', bs: '', fs: '2.05', ifs: '' },
]

const num = (s: string): number | undefined => (s.trim() === '' ? undefined : parseFloat(s))

export function LevelingMode() {
  const [rows, setRows] = useState<Row[]>(SAMPLE_ROWS)
  const [startElev, setStartElev] = useState(100)
  const [endElev, setEndElev] = useState('99.78')
  const [distanceKm, setDistanceKm] = useState('0.4')

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  const addRow = () => setRows((rs) => [...rs, { sta: `TP${rs.length}`, bs: '', fs: '', ifs: '' }])
  const delRow = (i: number) => setRows((rs) => rs.filter((_, k) => k !== i))
  const loadSample = () => { setRows(SAMPLE_ROWS.map((r) => ({ ...r }))); setStartElev(100); setEndElev('99.78'); setDistanceKm('0.4') }

  const input: LevelInput = {
    rows: rows.map((r) => ({ sta: r.sta || '?', bs: num(r.bs), fs: num(r.fs), ifs: r.ifs.trim() === '' ? [] : [parseFloat(r.ifs)] })),
    startElev,
    endElev: num(endElev),
    distanceKm: num(distanceKm),
  }

  const res: LevelResult | null = (() => { try { return reduceLeveling(input) } catch { return null } })()

  const steps: SolutionStep[] = res ? [
    {
      title: 'Page check — the book must balance before anything else',
      lines: [
        { tex: `\\Sigma BS - \\Sigma FS = ${f3(res.sumBS)} - ${f3(res.sumFS)} = ${f3(res.pageCheck.bsFs)}\\text{ m}` },
        { tex: `\\Sigma\\text{rise} - \\Sigma\\text{fall} = ${f3(res.sumRise)} - ${f3(res.sumFall)} = ${f3(res.pageCheck.riseFall)}\\text{ m}` },
        { text: `Both equal the measured Δelev = ${f3(res.pageCheck.delta)} m over ${res.setups} setup${res.setups === 1 ? '' : 's'} — the reduction is arithmetically sound.` },
      ],
    },
    ...(res.misclosure !== null ? [
      {
        title: 'Misclosure and its distribution',
        lines: [
          { tex: `\\varepsilon = \\text{measured} - \\text{known} = ${f3(res.measured!)} - ${f3(input.endElev!)} = ${f3(res.misclosure)}\\text{ m}` },
          { tex: `c_{\\text{per setup}} = -\\varepsilon / n = ${f3(res.perSetup!)}\\text{ m}` },
          { text: `Each intermediate point takes one correction per setup elapsed: point k after k setups moves ${f3(res.perSetup!)}·k m. The starting benchmark never moves.` },
        ],
      } satisfies SolutionStep,
      {
        title: `Order of accuracy — ${accuracyClass(res)}`,
        lines: [
          { text: 'Conventional geodetic limits scale with the square root of the path length K (km): first order 4√K, second 8√K, third 12√K, all in millimetres.' },
          ...(res.tolerance ? [
            { tex: `4\\sqrt{K} = ${f2(res.tolerance.first)}\\text{ mm},\\quad 8\\sqrt{K} = ${f2(res.tolerance.second)}\\text{ mm},\\quad 12\\sqrt{K} = ${f2(res.tolerance.third)}\\text{ mm}` },
            { text: `This loop closed ${f2(res.misclosureMm!)} mm over ${f2(input.distanceKm!)} km.` },
          ] : [{ text: 'Give the path length to rate the loop.' }]),
        ],
      } satisfies SolutionStep,
    ] : []),
  ] : []

  return (
    <div>
      <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
        <ReportControls title="Differential Leveling Report" badges={['Level book']} />
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Reduce a level run the way the field book was kept: HI and rise &amp; fall side by side,
          the page check that proves the arithmetic, and the misclosure handed back to the points
          in proportion to the setups elapsed.
        </p>

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          {/* ── inputs ── */}
          <div className="space-y-5">
            <Card title="Field book" hint="BS + FS on turning points; IFS alone = profile point">
              <div className="sm:col-span-2 lg:col-span-3">
                <button type="button" onClick={loadSample}
                  className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                  Load the sample book — BM1 → TP1 → 0+020 → BM2
                </button>
              </div>
              <div className="sm:col-span-2 lg:col-span-3 space-y-1.5">
                {rows.map((r, i) => (
                  <div key={i} className="grid grid-cols-[1fr_3rem_3rem_3rem_1.4rem] items-end gap-1.5">
                    <label className="flex flex-col text-sm">
                      <span className="mb-1 text-[11.5px] font-semibold text-muted">Station {i + 1}</span>
                      <input value={r.sta} onChange={(e) => setRow(i, { sta: e.target.value })} className="text-[13px]" />
                    </label>
                    <Num label="BS" unit="m" value={r.bs === '' ? 0 : parseFloat(r.bs)} onChange={(v) => setRow(i, { bs: v === 0 ? '' : String(v) })} step="0.001" />
                    <Num label="FS" unit="m" value={r.fs === '' ? 0 : parseFloat(r.fs)} onChange={(v) => setRow(i, { fs: v === 0 ? '' : String(v) })} step="0.001" />
                    <Num label="IFS" unit="m" value={r.ifs === '' ? 0 : parseFloat(r.ifs)} onChange={(v) => setRow(i, { ifs: v === 0 ? '' : String(v) })} step="0.001" />
                    <button type="button" onClick={() => delRow(i)} disabled={rows.length <= 2}
                      className="mb-1.5 text-muted hover:text-fail disabled:opacity-30">✕</button>
                  </div>
                ))}
                <button type="button" onClick={addRow}
                  className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">+ Add row</button>
                <p className="text-[10px] text-faint">Leave a cell at 0 to leave it blank. A row with only an IFS is a profile point off the running HI.</p>
              </div>
            </Card>

            <Card title="Datum & closure">
              <Num label="Start elevation (BM1)" unit="m" value={startElev} onChange={setStartElev} step="0.001" />
              <Num label="Known end elevation" unit="m" value={endElev === '' ? 0 : parseFloat(endElev)} onChange={(v) => setEndElev(v === 0 ? '' : String(v))} step="0.001" />
              <Num label="Path length K" unit="km" value={distanceKm === '' ? 0 : parseFloat(distanceKm)} onChange={(v) => setDistanceKm(v === 0 ? '' : String(v))} step="0.05" />
              <p className="text-[10px] text-faint sm:col-span-2 lg:col-span-3">
                Leave the known elevation at 0 to treat the run as open. K rates the misclosure against the 4√K / 8√K / 12√K order-of-accuracy bands.
              </p>
            </Card>
          </div>

          {/* ── results ── */}
          <div className="space-y-5">
            {res ? (
              <>
                <ResultCard title="Closure summary">
                  <Row label="ΣBS − ΣFS" value={`${f3(res.pageCheck.bsFs)} m`} sub={`ΣBS ${f3(res.sumBS)} · ΣFS ${f3(res.sumFS)}`} />
                  <Row label="Σrise − Σfall" value={`${f3(res.pageCheck.riseFall)} m`} sub={`${f3(res.sumRise)} rise · ${f3(res.sumFall)} fall`} />
                  <Row label="Measured Δelev" value={`${f3(res.measured)} m`} sub={`${res.setups} setups`} />
                  {res.misclosure !== null && (
                    <Row label="Misclosure ε" value={`${signed(res.misclosure)} m`} sub={`${f2(res.misclosureMm!)} mm · correction ${signed(res.perSetup!)} m/setup`} alert={Math.abs(res.misclosure) > 1e-9} />
                  )}
                  {res.tolerance !== null && (
                    <Row label="Order of accuracy" value={accuracyClass(res).split(' (')[0]} sub={accuracyClass(res)} alert={accuracyClass(res).includes('below')} />
                  )}
                </ResultCard>

                <DrawingCard title="Profile of the run" meta="elevations to scale · dashed = height of instrument">
                  <DrawingFrame label="Leveling profile with instrument heights">
                    <LevelProfile res={res} startElev={input.startElev} />
                  </DrawingFrame>
                </DrawingCard>

                <ResultCard title="Level book — reduced">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-muted">
                        <tr className="text-left">
                          <th className="py-1 pr-2 font-semibold">Station</th>
                          <th className="pr-2 text-right font-semibold">BS (m)</th>
                          <th className="pr-2 text-right font-semibold">HI (m)</th>
                          <th className="pr-2 text-right font-semibold">IFS (m)</th>
                          <th className="pr-2 text-right font-semibold">FS (m)</th>
                          <th className="pr-2 text-right font-semibold">R/F (m)</th>
                          <th className="pr-2 text-right font-semibold">Elev (m)</th>
                          <th className="text-right font-semibold">Adjusted (m)</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono">
                        {res.points.map((p, k) => (
                          <tr key={k} className="border-t border-hairline-2">
                            <td className="py-1 pr-2">{p.sta}</td>
                            <td className="pr-2 text-right">{p.bs === null ? '—' : f3(p.bs)}</td>
                            <td className="pr-2 text-right">{p.hi === null ? '—' : f3(p.hi)}</td>
                            <td className="pr-2 text-right text-muted">{p.ifs.length === 0 ? '—' : p.ifs.map((z) => f3(z)).join(', ')}</td>
                            <td className="pr-2 text-right">{p.fs === null ? '—' : f3(p.fs)}</td>
                            <td className={`pr-2 text-right ${p.riseFall === null ? 'text-faint' : p.riseFall >= 0 ? 'text-brand' : 'text-fail'}`}>
                              {p.riseFall === null ? '—' : signed(p.riseFall)}
                            </td>
                            <td className="pr-2 text-right font-semibold">{f3(p.elev)}</td>
                            <td className="text-right font-semibold">{f3(p.adj)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ResultCard>
              </>
            ) : (
              <ResultCard title="The book does not reduce">
                <p className="text-sm text-fail">
                  Check the rows: the first row needs a BS, the last closes with an FS, and every
                  foresight needs a backsight in progress. Blank cells count as 0.
                </p>
              </ResultCard>
            )}
          </div>
        </div>

        {res && (
          <div className="mt-6">
            <WorkedSolution steps={steps} title="Differential Leveling — step-by-step" />
          </div>
        )}
      </div>
    </div>
  )
}

// ── profile drawing ───────────────────────────────────────────────────────

function LevelProfile({ res, startElev }: { res: LevelResult; startElev: number }) {
  const W = 860
  const H = 300
  const padL = 46
  const padR = 18
  const padT = 24
  const padB = 40

  // Turning-point elevations only, IFS shots drawn as ticks off the profile.
  const tps = res.points
  const allElevs = tps.flatMap((p) => [p.elev, ...p.ifs])
  const eMin = Math.min(...allElevs) - 1
  const eMax = Math.max(...allElevs, res.points[0].hi ?? startElev) + 1

  const x = (i: number) => padL + (i / Math.max(tps.length - 1, 1)) * (W - padL - padR)
  const y = (e: number) => padT + ((eMax - e) / Math.max(eMax - eMin, 1e-9)) * (H - padT - padB)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Leveling profile">
      {/* elevation grid */}
      {gridTicks(eMin, eMax, 5).map((e) => (
        <g key={e}>
          <line x1={padL} x2={W - padR} y1={y(e)} y2={y(e)} stroke={HAIR} strokeWidth="1" />
          <text x={padL - 6} y={y(e) + 3.5} textAnchor="end" fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">{f2(e)}</text>
        </g>
      ))}

      {/* HI lines: dashed horizontal at each setup's HI, spanning its two points */}
      {res.points.map((p, i) => {
        if (p.hi === null || p.bs === null) return null
        const x1 = x(i)
        const x2 = x(Math.min(i + 1, res.points.length - 1))
        return <line key={`hi${i}`} x1={x1} x2={x2} y1={y(p.hi)} y2={y(p.hi)} stroke={BRAND} strokeWidth="1" strokeDasharray="4 3" opacity="0.65" />
      })}

      {/* ground profile through the turning points */}
      <polyline
        points={res.points.map((p, i) => `${x(i)},${y(p.elev)}`).join(' ')}
        fill="none" stroke={INK} strokeWidth="2"
      />
      {/* IFS shots as small ticks below/above their row */}
      {res.points.map((p, i) =>
        p.ifs.map((z, k) => (
          <g key={`ifs${i}-${k}`}>
            <circle cx={x(i)} cy={y(z)} r="2.6" fill={BRAND} />
            <text x={x(i) + 5} y={y(z) - 4} fontSize="9" fill={MUTED} fontFamily="var(--font-mono, monospace)">{f2(z)}</text>
          </g>
        )),
      )}

      {/* station marks + names */}
      {res.points.map((p, i) => (
        <g key={`st${i}`}>
          <line x1={x(i)} x2={x(i)} y1={y(p.elev) - 4} y2={y(p.elev) + 4} stroke={INK} strokeWidth="1.5" />
          <circle cx={x(i)} cy={y(p.elev)} r="2.5" fill={INK} />
          <text x={x(i)} y={H - padB + 14} textAnchor="middle" fontSize="9.5" fill={INK} fontFamily="var(--font-mono, monospace)">{p.sta}</text>
          <text x={x(i)} y={y(p.elev) + 16} textAnchor="middle" fontSize="9.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">{f2(p.adj)}</text>
        </g>
      ))}

      {/* misclosure flag on the last point */}
      {res.misclosure !== null && Math.abs(res.misclosure) > 1e-9 && (
        <text x={x(res.points.length - 1)} y={padT - 8} textAnchor="end" fontSize="10" fill={FAIL} fontFamily="var(--font-mono, monospace)">
          ε = {f3(res.misclosure)} m
        </text>
      )}
    </svg>
  )
}

const gridTicks = (lo: number, hi: number, n: number): number[] => {
  const step = (hi - lo) / n
  return Array.from({ length: n + 1 }, (_, i) => lo + i * step)
}
