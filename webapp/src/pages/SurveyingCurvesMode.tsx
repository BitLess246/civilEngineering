import { useState } from 'react'
import { solveCurve, type CurveResult } from '../engine/circularCurve'
import { Card, Num, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, BRAND, MUTED, HAIR, f2, f3 } from '../lib/influenceStyle'

// Surveying toolbox — SIMPLE CIRCULAR CURVE mode. R and Δ (plus the PI
// station) give every classical element and the deflection-angle staking
// table at full-station intervals (engine/circularCurve.ts).

export function CurvesMode() {
  const [R, setR] = useState(400)
  const [delta, setDelta] = useState(30)
  const [pi, setPi] = useState(3000)
  const [interval, setInterval] = useState(20)

  const res: CurveResult | null = (() => {
    try { return solveCurve({ R, deltaDeg: delta, piStation: pi, interval }) } catch { return null }
  })()

  const el = res?.el
  const exStake = (res?.stakes[1] ?? res?.stakes[0])!
  const steps: SolutionStep[] = el ? [
    {
      title: 'The classical elements from R and Δ',
      lines: [
        { tex: `T = R\\tan\\tfrac{\\Delta}{2} = ${f3(R)}\\tan\\tfrac{${f2(delta)}^\\circ}{2} = ${f3(el.T)}\\text{ m}` },
        { tex: `L = R\\Delta_{\\text{rad}} = ${f3(R)} \\times ${f3(el.deltaRad)} = ${f3(el.L)}\\text{ m},\\qquad LC = 2R\\sin\\tfrac{\\Delta}{2} = ${f3(el.LC)}\\text{ m}` },
        { tex: `M = R(1-\\cos\\tfrac{\\Delta}{2}) = ${f3(el.M)}\\text{ m},\\qquad E = R(\\sec\\tfrac{\\Delta}{2}-1) = ${f3(el.E)}\\text{ m}` },
        { text: `Degree of curve, arc basis: a ${f2(interval)} m arc subtends D = ${f3(el.D20)}° — equivalently ${f3(el.D100ft)}° per 100 ft arc in US practice.` },
      ],
    },
    {
      title: 'Stationing',
      lines: [
        { tex: `PC = PI - T = ${f3(pi)} - ${f3(el.T)} = ${f3(el.pc)}` },
        { tex: `PT = PC + L = ${f3(el.pc)} + ${f3(el.L)} = ${f3(el.pt)}` },
        { text: 'The first and last stakes are sub-chords: everything between runs at the full staking interval.' },
      ],
    },
    {
      title: 'Deflection-angle staking',
      lines: [
        { tex: `\\delta_i = \\frac{c_i}{2R}\\text{ rad},\\qquad c_i = 2R\\sin\\!\\left(\\frac{\\text{arc}}{2R}\\right)` },
        { tex: `\\text{STA }${f2(exStake.station)}:\\ c = 2\\times${f3(R)}\\sin\\!\\left(\\frac{${f3(exStake.arcFromPc)}}{2\\times${f3(R)}}\\right) = ${f3(exStake.chord)}\\text{ m},\\quad \\delta = \\frac{${f3(exStake.chord)}}{2\\times${f3(R)}} = ${f3(exStake.incDef)}^\\circ\\ (\\text{total }${f3(exStake.totDef)}^\\circ)` },
        { text: `Each chord from the PC deflects by its own incremental angle, and the deflections accumulate — the total at the PT is exactly Δ/2 = ${f3(delta / 2)}°, the field check on the table below.` },
      ],
    },
  ] : []

  return (
    <div>
      <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
        <ReportControls title="Circular Curve Report" badges={['Curve elements']} />
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Every element of a simple circular curve from the two classical givens, plus the
          deflection-angle staking table the crew tapes out from the PC — sub-chords, incremental
          and total deflections, and the Δ/2 field check.
        </p>

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          {/* ── inputs ── */}
          <div className="space-y-5">
            <Card title="Curve givens">
              <Num label="Radius R" unit="m" value={R} onChange={setR} min={10} max={20000} step="10" />
              <Num label="Central angle Δ" unit="°" value={delta} onChange={setDelta} min={1} max={179} step="0.5" />
              <Num label="PI station" unit="m" value={pi} onChange={setPi} min={0} max={100000} step="10" />
              <Num label="Staking interval" unit="m" value={interval} onChange={setInterval} min={5} max={50} step="5" />
            </Card>

            {el && (
              <ResultCard title="Elements">
                <Row label="Tangent T" value={`${f3(el.T)} m`} sub="PC = PI − T" />
                <Row label="Arc length L" value={`${f3(el.L)} m`} sub="PT = PC + L" />
                <Row label="Long chord LC" value={`${f3(el.LC)} m`} sub={`middle ordinate M = ${f3(el.M)} m`} />
                <Row label="External E" value={`${f3(el.E)} m`} sub="PI to mid-curve" />
                <Row label="PC / PT stations" value={`${f3(el.pc)} / ${f3(el.pt)} m`} sub="metric stations" />
              </ResultCard>
            )}
          </div>

          {/* ── results ── */}
          <div className="space-y-5">
            {el && res ? (
              <>
                <DrawingCard title="Curve geometry" meta="tangents, long chord and the deflection to mid-curve">
                  <DrawingFrame label="Circular curve layout">
                    <CurveFigure el={el} />
                  </DrawingFrame>
                </DrawingCard>

                <ResultCard title={`Staking table — ${f2(interval)} m interval, chords from the PC`}>
                  <div className="max-h-[420px] overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="text-muted sticky top-0 bg-sheet">
                        <tr className="text-left">
                          <th className="py-1 pr-2 font-semibold">Station (m)</th>
                          <th className="pr-2 text-right font-semibold">Arc from PC</th>
                          <th className="pr-2 text-right font-semibold">Chord c (m)</th>
                          <th className="pr-2 text-right font-semibold">Incremental δ</th>
                          <th className="text-right font-semibold">Total deflection</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono">
                        {res.stakes.map((s, k) => (
                          <tr key={k} className={`border-t border-hairline-2 ${k === 0 || k === res.stakes.length - 1 ? 'bg-brand-tint/40' : ''}`}>
                            <td className="py-1 pr-2 font-semibold">{f2(s.station)}</td>
                            <td className="pr-2 text-right">{f3(s.arcFromPc)}</td>
                            <td className="pr-2 text-right">{f3(s.chord)}</td>
                            <td className="pr-2 text-right">{f3(s.incDef)}°</td>
                            <td className="text-right font-semibold">{f3(s.totDef)}°</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-[10px] text-faint">
                    First sub-chord {f3(res.firstSub)} m · last sub-chord {f3(res.lastSub)} m · the total deflection at the PT equals Δ/2 = {f3(el.deltaDeg / 2)}°.
                  </p>
                </ResultCard>
              </>
            ) : (
              <ResultCard title="Check the givens">
                <p className="text-sm text-fail">
                  R must be positive and Δ strictly between 0° and 180°. If the PC lands before
                  station 0, push the PI station forward.
                </p>
              </ResultCard>
            )}
          </div>
        </div>

        {el && (
          <div className="mt-6">
            <WorkedSolution steps={steps} title="Circular Curve — step-by-step" />
          </div>
        )}
      </div>
    </div>
  )
}

// ── curve figure ──────────────────────────────────────────────────────────

function CurveFigure({ el }: { el: CurveResult['el'] }) {
  const W = 640
  const H = 460
  const pad = 30

  // Screen construction (y down). PI at top centre; the tangents leave it at
  // 90°−Δ/2 from the downward bisector (the angle at PI in the right triangle
  // tangent–radius is 90°−h, h = Δ/2); the centre sits on the bisector at
  // R·sec(h), the mid-curve point at E, both below the PI.
  const h = el.deltaRad / 2
  const k = Math.min(
    (W - 2 * pad) / (2 * el.T * Math.cos(h) + 40),
    (H - 2 * pad - 30) / (el.R / Math.cos(h)),
  )

  const piX = W / 2
  const piY = pad + 12
  const pcX = piX - el.T * k * Math.cos(h)
  const pcY = piY + el.T * k * Math.sin(h)
  const ptX = piX + el.T * k * Math.cos(h)
  const ptY = pcY
  const Rk = el.R * k
  const midX = piX
  const midY = piY + el.E * k          // mid-curve point (on the circle)
  const chordMidY = pcY                // chord midpoint shares the chord line

  const path = `M ${pcX} ${pcY} A ${Rk} ${Rk} 0 0 1 ${ptX} ${ptY}`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Circular curve layout">
      {/* tangents */}
      <line x1={pcX} y1={pcY} x2={piX} y2={piY} stroke={INK} strokeWidth="1.6" />
      <line x1={piX} y1={piY} x2={ptX} y2={ptY} stroke={INK} strokeWidth="1.6" />
      {/* long chord */}
      <line x1={pcX} y1={pcY} x2={ptX} y2={ptY} stroke={BRAND} strokeWidth="1.1" strokeDasharray="6 3" />
      {/* bisector PI → mid-curve */}
      <line x1={piX} y1={piY} x2={midX} y2={midY} stroke={HAIR} strokeWidth="1" strokeDasharray="3 3" />
      {/* the curve */}
      <path d={path} fill="none" stroke={BRAND} strokeWidth="2.6" />

      {/* points */}
      <circle cx={piX} cy={piY} r="3.2" fill={INK} />
      <circle cx={pcX} cy={pcY} r="3.2" fill={BRAND} />
      <circle cx={ptX} cy={ptY} r="3.2" fill={BRAND} />
      <circle cx={midX} cy={midY} r="2.6" fill={MUTED} />

      <text x={piX + 8} y={piY + 2} fontSize="11" fontWeight="700" fill={INK} fontFamily="var(--font-mono, monospace)">PI</text>
      <text x={pcX - 6} y={pcY + 18} textAnchor="end" fontSize="11" fontWeight="700" fill={BRAND} fontFamily="var(--font-mono, monospace)">PC</text>
      <text x={ptX + 6} y={ptY + 18} fontSize="11" fontWeight="700" fill={BRAND} fontFamily="var(--font-mono, monospace)">PT</text>
      <text x={midX + 7} y={midY + 3} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">E = {f3(el.E)} m</text>
      <text x={piX + 8} y={chordMidY + 14} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">M = {f3(el.M)} m</text>

      {/* tangent labels, set along each tangent */}
      <text x={(piX + pcX) / 2 - 10} y={(piY + pcY) / 2 + 4} textAnchor="end" fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">T = {f3(el.T)} m</text>
      <text x={(piX + ptX) / 2 + 10} y={(piY + ptY) / 2 + 4} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">T</text>
      {/* long chord label, below the chord */}
      <text x={(pcX + ptX) / 2} y={pcY + 30} textAnchor="middle" fontSize="10" fill={BRAND} fontFamily="var(--font-mono, monospace)">LC = {f3(el.LC)} m</text>
      {/* delta at the PI */}
      <text x={piX - 12} y={piY + 26} textAnchor="end" fontSize="10" fill={INK} fontFamily="var(--font-mono, monospace)">Δ = {f2(el.deltaDeg)}°</text>
    </svg>
  )
}
