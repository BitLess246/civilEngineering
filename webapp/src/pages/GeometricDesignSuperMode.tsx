import { useState } from 'react'
import 'katex/dist/katex.min.css'
import { superelevation, type SuperResult } from '../engine/geometricDesign'
import { Card, Num, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, MUTED, f2, f3 } from '../lib/influenceStyle'

// Superelevation mode — the point-mass balance e + f = V²/(127R), split
// between banking and side friction, with the minimum radius and the
// degree of curve reported alongside.

export function GeometricSuperMode() {
  const [V, setV] = useState(80)
  const [R, setR] = useState(230)
  const [eMax, setEMax] = useState(8) // percent
  const [fMax, setFMax] = useState(0.15)

  const res: SuperResult | null = (() => {
    try {
      return superelevation({ V, R, eMax: eMax / 100, fMax })
    } catch {
      return null
    }
  })()

  const steps: SolutionStep[] = res ? [
    {
      title: 'Centripetal demand',
      lines: [
        { tex: `e + f = \\frac{V^2}{127\\,R} = \\frac{${f2(V)}^2}{127\\times ${f2(R)}} = ${f3(res.demand)} \\;\\left(${f2(res.demand * 100)}\\%\\right)` },
        { text: 'The point-mass balance: the bank angle supplies e, tyre friction supplies f. The 127 folds g and unit conversions into one constant (V in km/h, R in m).' },
      ],
    },
    {
      title: 'Split between superelevation and friction',
      lines: [
        { tex: `e = \\max\\left(0,\\; \\frac{V^2}{127R} - f_{\\max}\\right) = ${f3(res.e)} \\;\\left(${f2(res.e * 100)}\\%\\right), \\qquad f = ${f3(res.f)}` },
        { text: `The friction allowance ${f2(fMax)} acts first; whatever demand it cannot carry becomes banking, capped at eMax = ${f2(eMax)}%.` },
      ],
    },
    {
      title: 'Minimum radius and degree of curve',
      lines: [
        { tex: `R_{\\min} = \\frac{V^2}{127\\,(e_{\\max}+f_{\\max})} = \\frac{${f2(V)}^2}{127\\times ${f3(eMax / 100 + fMax)}} = ${f3(res.Rmin)}\\text{ m}` },
        { tex: `D = \\frac{5729.578}{R} = ${f3(res.D)}^\\circ\\text{ per 100 m of arc}` },
        { text: res.warning ?? `R = ${f2(R)} m ≥ Rmin — the curve can carry the design speed.` },
      ],
      pass: res.ok,
    },
  ] : []

  // ── cross-section drawing: deck rotated at atan(e) with the force triangle ──
  const W = 640, H = 300
  const angle = res ? Math.atan(res.e) : 0
  const cx = W / 2, cy = H / 2 + 26
  const half = 170
  const dx = Math.cos(angle) * half, dy = Math.sin(angle) * half

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
      <ReportControls title="Superelevation Report" badges={['e + f = V²/127R']} />
      <p className="mt-2 max-w-3xl text-sm text-muted">
        How much a curve must bank to carry the design speed: the centripetal demand is shared
        between superelevation (banking) and side friction, with the minimum radius set by the
        two limits together.
      </p>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="Curve and design limits">
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="button"
                onClick={() => { setV(80); setR(230); setEMax(8); setFMax(0.15) }}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                Load the sample — 80 km/h on R = 230 m
              </button>
            </div>
            <Num label="Design speed V" unit="km/h" value={V} onChange={setV} min={20} max={130} step="5" />
            <Num label="Radius R" unit="m" value={R} onChange={setR} min={20} max={5000} step="10" />
            <Num label="Max superelevation e" unit="%" value={eMax} onChange={setEMax} min={0} max={12} step="0.5" />
            <Num label="Side friction f" value={fMax} onChange={setFMax} min={0.05} max={0.3} step="0.01" />
            <p className="text-[11px] text-faint sm:col-span-2 lg:col-span-3">
              eMax = 8% and f = 0.15 are the common highway defaults; urban ice-conditioned
              designs drop eMax to 4–6%.
            </p>
          </Card>
        </div>

        <div className="space-y-5">
          {res ? (
            <>
              <ResultCard title="Balance and radius">
                <Row label="Demand e + f" value={`${f3(res.demand)} (${f2(res.demand * 100)}%)`} sub={`V²/127R at ${f2(V)} km/h`} />
                <Row label="Superelevation e" value={`${f2(res.e * 100)}%`} sub={res.e >= eMax / 100 - 1e-9 ? 'at the cap' : 'from the friction-first split'} />
                <Row label="Side friction f" value={`${f3(res.f)}`} sub={`allowance ${f2(fMax)}`} alert={res.f > fMax + 1e-9} />
                <Row label="Minimum radius Rmin" value={`${f3(res.Rmin)} m`} sub={res.ok ? `R = ${f2(R)} m ≥ Rmin — OK` : 'R < Rmin — cannot carry the speed'} alert={!res.ok} />
                <Row label="Degree of curve D" value={`${f3(res.D)}° per 100 m`} sub="arc definition" />
              </ResultCard>

              {res.warning && (
                <ResultCard title="Note">
                  <p className="text-sm text-fail">{res.warning}</p>
                </ResultCard>
              )}

              <DrawingCard title="Cross section" meta={`banked at ${f2(res.e * 100)}% with the force triangle`}>
                <DrawingFrame label="Superelevated cross section">
                  <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Superelevated cross section">
                    {/* road deck, rotated by atan(e) */}
                    <line x1={cx - dx} y1={cy + dy} x2={cx + dx} y2={cy - dy} stroke={INK} strokeWidth="3" />
                    {/* pavement hatching */}
                    {Array.from({ length: 12 }, (_, i) => {
                      const t = (i + 0.5) / 12
                      const bx = cx - dx + 2 * dx * t, by = cy + dy - 2 * dy * t
                      return <line key={i} x1={bx} y1={by} x2={bx} y2={by + 9} stroke={MUTED} strokeWidth="0.8" />
                    })}
                    {/* inner edge / outer edge labels */}
                    <text x={cx - dx} y={cy + dy + 22} textAnchor="middle" fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">inside</text>
                    <text x={cx + dx} y={cy - dy - 12} textAnchor="middle" fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">outside</text>
                    {/* bank angle annotation */}
                    <line x1={cx - dx} y1={cy + dy} x2={cx + dx} y2={cy + dy} stroke={MUTED} strokeWidth="0.9" strokeDasharray="4 3" />
                    <text x={cx - dx + 26} y={cy + dy - 6} fontSize="10.5" fill={INK} fontFamily="var(--font-mono, monospace)">
                      e = {f2(res.e * 100)}%
                    </text>
                    {/* force triangle at mid-deck */}
                    <g transform={`translate(${cx}, ${cy - 8})`}>
                      <line x1={0} y1={0} x2={0} y2={-52} stroke={INK} strokeWidth="1.6" />
                      <text x={6} y={-40} fontSize="10" fill={INK} fontFamily="var(--font-mono, monospace)">W</text>
                      <line x1={0} y1={-52} x2={44} y2={-52} stroke={INK} strokeWidth="1.6" />
                      <text x={30} y={-58} fontSize="10" fill={INK} fontFamily="var(--font-mono, monospace)">F = Wv²/gR</text>
                      <line x1={0} y1={0} x2={44} y2={-52} stroke={MUTED} strokeWidth="1.1" strokeDasharray="4 3" />
                      <text x={44} y={-6} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">resultant ⊥ deck at balance</text>
                    </g>
                    <text x={24} y={H - 12} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
                      R = {f2(R)} m · Rmin = {f3(res.Rmin)} m · D = {f3(res.D)}°/100 m
                    </text>
                  </svg>
                </DrawingFrame>
              </DrawingCard>

              <WorkedSolution steps={steps} title="Superelevation — step by step" />
            </>
          ) : (
            <ResultCard title="Check the inputs">
              <p className="text-sm text-fail">
                Give a positive speed and radius; keep eMax below 14% and the friction factor
                between 0.05 and 0.30.
              </p>
            </ResultCard>
          )}
        </div>
      </div>
    </div>
  )
}
