import { useState } from 'react'
import 'katex/dist/katex.min.css'
import { stoppingSightDistance, type SSDResult } from '../engine/geometricDesign'
import { Card, Num, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, f2, f3 } from '../lib/influenceStyle'

// SSD mode — reaction piece + braking piece with the grade correction.

export function GeometricSSDMode() {
  const [V, setV] = useState(100)
  const [t, setT] = useState(2.5)
  const [f, setF] = useState(0.35)
  const [gradePct, setGradePct] = useState(0)

  const res: SSDResult | null = (() => {
    try {
      return stoppingSightDistance({ V, t, f, grade: gradePct / 100 })
    } catch {
      return null
    }
  })()

  const steps: SolutionStep[] = res ? [
    {
      title: 'Perception–brake reaction distance',
      lines: [
        { tex: `d_r = 0.278\\,V\\,t = 0.278\\times ${f2(V)}\\times ${f2(t)} = ${f3(res.reaction)}\\text{ m}` },
        { text: '0.278 converts km/h to m/s; t = 2.5 s is the AASHTO design reaction time — about the 90th-percentile driver, not the average one.' },
      ],
    },
    {
      title: 'Braking distance',
      lines: [
        { tex: `d_b = \\frac{V^2}{254\\,(f \\pm G)} = \\frac{${f2(V)}^2}{254\\times(${f2(f)} ${gradePct >= 0 ? '+' : '−'} ${f2(Math.abs(gradePct) / 100)})} = ${f3(res.braking)}\\text{ m}` },
        { text: `Grade G = ${f2(gradePct)}% ${gradePct > 0 ? 'upgrade — gravity assists, the distance shortens' : gradePct < 0 ? 'downgrade — gravity works against the brakes, the distance lengthens' : '— level grade'}. The 254 folds 2g and the km/h²→m conversion into one constant.` },
      ],
    },
    {
      title: 'Stopping sight distance',
      lines: [
        { tex: `SSD = d_r + d_b = ${f3(res.reaction)} + ${f3(res.braking)} = ${f3(res.total)}\\text{ m}` },
        { text: `At ${f2(V)} km/h the driver needs ${f3(res.reaction)} m of sight just to react plus ${f3(res.braking)} m to brake — ${f3(res.total)} m of unobstructed road, the number every crest, sag and sight-line check is judged against.` },
      ],
    },
  ] : []

  // ── drawing: distance bar split into reaction + braking ──
  const W = 640, H = 190
  const x0 = 56, x1 = W - 56, y = H / 2 + 6
  const total = res ? res.total : 1
  const wr = res ? (res.reaction / total) * (x1 - x0) : 0
  const wb = res ? (x1 - x0) - wr : 0

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
      <ReportControls title="Stopping Sight Distance Report" badges={['AASHTO Green Book']} />
      <p className="mt-2 max-w-3xl text-sm text-muted">
        The distance a driver covers from seeing an object to a full stop: 2.5 s of reaction at
        design speed, then the braking distance governed by friction and grade. Vertical curves
        and horizontal sight lines are checked against this number.
      </p>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="Design conditions">
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="button"
                onClick={() => { setV(100); setT(2.5); setF(0.35); setGradePct(0) }}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                Load the sample — 100 km/h, level grade
              </button>
            </div>
            <Num label="Design speed V" unit="km/h" value={V} onChange={setV} min={20} max={130} step="5" />
            <Num label="Reaction time t" unit="s" value={t} onChange={setT} min={1} max={4} step="0.1" />
            <Num label="Friction f" value={f} onChange={setF} min={0.05} max={0.5} step="0.01" />
            <Num label="Grade G" unit="%" value={gradePct} onChange={setGradePct} min={-12} max={12} step="0.5" />
            <p className="text-[11px] text-faint sm:col-span-2 lg:col-span-3">
              f = 0.35 is the AASHTO design value (wet pavement, hard braking). Enter the grade
              positive for an upgrade, negative for a downgrade.
            </p>
          </Card>
        </div>

        <div className="space-y-5">
          {res ? (
            <>
              <ResultCard title="Stopping sight distance">
                <Row label="Reaction distance dr" value={`${f3(res.reaction)} m`} sub={`0.278 · ${f2(V)} km/h · ${f2(t)} s`} />
                <Row label="Braking distance db" value={`${f3(res.braking)} m`} sub={`V² / 254(f ${gradePct >= 0 ? '+' : '−'} G)`} />
                <Row label="Total SSD" value={`${f3(res.total)} m`} sub={`${f2(V)} km/h design speed`} />
              </ResultCard>

              <DrawingCard title="Distance composition" meta="reaction piece then braking piece">
                <DrawingFrame label="SSD composition bar">
                  <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="SSD composition">
                    <rect x={x0} y={y - 26} width={wr} height={40} fill="rgba(15,76,146,0.14)" stroke={INK} strokeWidth="1.4" />
                    <rect x={x0 + wr} y={y - 26} width={wb} height={40} fill="rgba(15,76,146,0.30)" stroke={INK} strokeWidth="1.4" />
                    <text x={x0 + wr / 2} y={y - 4} textAnchor="middle" fontSize="11" fill={INK} fontFamily="var(--font-mono, monospace)">
                      dr {f3(res.reaction)} m
                    </text>
                    <text x={x0 + wr + wb / 2} y={y - 4} textAnchor="middle" fontSize="11" fill={INK} fontFamily="var(--font-mono, monospace)">
                      db {f3(res.braking)} m
                    </text>
                    {/* dimension line */}
                    <line x1={x0} x2={x1} y1={y + 34} y2={y + 34} stroke={INK} strokeWidth="1" />
                    <line x1={x0} x2={x0} y1={y + 28} y2={y + 40} stroke={INK} strokeWidth="1" />
                    <line x1={x1} x2={x1} y1={y + 28} y2={y + 40} stroke={INK} strokeWidth="1" />
                    <text x={(x0 + x1) / 2} y={y + 52} textAnchor="middle" fontSize="11.5" fill={INK} fontFamily="var(--font-mono, monospace)">
                      SSD = {f3(res.total)} m
                    </text>
                    <text x={x0} y={26} fontSize="10.5" fill={INK} fontFamily="var(--font-mono, monospace)">
                      {f2(V)} km/h · t = {f2(t)} s · f = {f2(f)} · G = {f2(gradePct)}%
                    </text>
                  </svg>
                </DrawingFrame>
              </DrawingCard>

              <WorkedSolution steps={steps} title="SSD — step by step" />
            </>
          ) : (
            <ResultCard title="Check the inputs">
              <p className="text-sm text-fail">
                Give a positive speed and reaction time; f + G must stay positive — a grade steeper
                than the friction cannot be braked on.
              </p>
            </ResultCard>
          )}
        </div>
      </div>
    </div>
  )
}
