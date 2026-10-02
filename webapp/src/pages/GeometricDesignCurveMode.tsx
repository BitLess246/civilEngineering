import { useState } from 'react'
import 'katex/dist/katex.min.css'
import {
  buildVerticalCurve, minCrestLength, minSagLength, minSagComfort,
  type VertCurveResult, type CurveLengthResult,
} from '../engine/geometricDesign'
import { Card, Num, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, MUTED, f2, f3 } from '../lib/influenceStyle'

// Vertical curve mode — parabolic geometry plus the crest/sag sight-distance
// length requirements, against the AASHTO eye/object and headlight heights.

type CurveKind = 'crest' | 'sag'

export function GeometricCurveMode() {
  const [g1, setG1] = useState(3)
  const [g2, setG2] = useState(-1)
  const [L, setL] = useState(300)
  const [pviSt, setPviSt] = useState(1500)
  const [pviEl, setPviEl] = useState(100)
  const [S, setS] = useState(200)
  const [designV, setDesignV] = useState(100)

  const kind: CurveKind = g1 >= g2 ? 'crest' : 'sag'
  const A = Math.abs(g2 - g1)

  const curve: VertCurveResult | null = (() => {
    try {
      return buildVerticalCurve({ g1, g2, L, PVIstation: pviSt, PVIelev: pviEl })
    } catch {
      return null
    }
  })()

  const req: CurveLengthResult | null = (() => {
    try {
      if (A <= 0) return null
      return kind === 'crest' ? minCrestLength({ S, A }) : minSagLength({ S, A })
    } catch {
      return null
    }
  })()

  const comfort = (() => {
    try { return A > 0 && kind === 'sag' ? minSagComfort(A, designV) : null } catch { return null }
  })()

  const adequate = req ? L >= req.Lmin - 1e-9 : true
  const comfortOk = comfort == null || L >= comfort - 1e-9

  const steps: SolutionStep[] = curve ? [
    {
      title: 'Curve parameters',
      lines: [
        { tex: `A = |g_2 - g_1| = |${f2(g2)} - ${f2(g1)}| = ${f3(A)}\\%, \\qquad K = \\frac{L}{A} = ${curve.K === Infinity ? '\\infty' : f3(curve.K)}\\,\\text{m/\\%}` },
        { tex: `\\text{BVC} = ${f3(curve.BVCstation)}\\ (\\text{elev } ${f3(curve.BVCelev)}){,}\\quad \\text{EVC} = ${f3(curve.EVCstation)}\\ (\\text{elev } ${f3(curve.EVCelev)})` },
      ],
    },
    {
      title: 'Elevation along the curve',
      lines: [
        { tex: `y(x) = y_{BVC} + \\frac{g_1}{100}\\,x + \\frac{g_2 - g_1}{200\\,L}\\,x^2` },
        { tex: `\\text{PVI external offset } e = \\frac{A L}{800} = \\frac{${f3(A)}\\times ${f2(L)}}{800} = ${f3(curve.PVIoffset)}\\text{ m}` },
        { text: `The curve sits ${f3(curve.PVIoffset)} m ${kind === 'crest' ? 'below' : 'above'} the tangent PVI; the grade rate is r = (g₂−g₁)/2L = ${f3(curve.r)} %/m.` },
      ],
    },
    ...(curve.turnKind ? [{
      title: `${curve.turnKind === 'high' ? 'High' : 'Low'} point`,
      lines: [
        { tex: `x = \\frac{-g_1 L}{g_2 - g_1} = ${f3(curve.turnX ?? 0)}\\text{ m from BVC} \\;\\Rightarrow\\; y = ${f3(curve.turnElev ?? 0)}\\text{ m at station } ${f3(curve.turnStation ?? 0)}` },
      ],
    }] : []),
    ...(req ? [{
      title: `Sight-distance check — ${kind}, S = ${f2(S)} m`,
      lines: [
        kind === 'crest'
          ? { tex: `L_{\\min} = \\frac{A S^2}{100(\\sqrt{2h_1}+\\sqrt{2h_2})^2} = \\frac{A S^2}{658} = ${f3(req.Lmin)}\\text{ m} \\;\\; (${req.regime.replace('≤', '\\le').replace('>', '>')})` }
          : { tex: `L_{\\min} = \\frac{A S^2}{200h + 3.5S} = \\frac{A S^2}{120 + 3.5S} = ${f3(req.Lmin)}\\text{ m} \\;\\; (${req.regime.replace('≤', '\\le')})` },
        { text: `Metric AASHTO heights: eye 1.08 m and object 0.60 m on a crest; headlight 0.60 m with a 1° upward beam on a sag. Provided L = ${f2(L)} m — ${adequate ? 'ADEQUATE' : 'SHORT, lengthen the curve or flatten the grades'}.` },
        ...(comfort ? [{ text: `Comfort criterion for a sag at ${f2(designV)} km/h: L ≥ A·V²/395 = ${f3(comfort)} m — ${comfortOk ? 'satisfied' : 'NOT satisfied'}.` }] : []),
      ],
      pass: adequate && comfortOk,
    }] : []),
  ] : []

  // ── profile drawing ──
  const W = 680, H = 330
  const pad = 52
  const px0 = pad, px1 = W - pad
  if (curve) {
    const stSpan = curve.EVCstation - curve.BVCstation
    const toX = (st: number) => px0 + ((st - curve.BVCstation) / stSpan) * (px1 - px0)
    const ext = 40 * stSpan / (px1 - px0) // 40 px of tangent extension, in station units
    const elevs: number[] = []
    for (let i = 0; i <= 60; i++) {
      const x = stSpan * i / 60
      elevs.push(curve.elevAt(x), curve.tangentAt(x))
    }
    elevs.push(pviEl, curve.BVCelev - (g1 / 100) * ext, curve.EVCelev + (g2 / 100) * ext)
    const eMin = Math.min(...elevs), eMax = Math.max(...elevs)
    const span = Math.max(eMax - eMin, 0.5)
    const scaleY = (H - 2 * pad - 20) / (span * 1.15)
    const toY = (e: number) => H - pad - (e - eMin + span * 0.075) * scaleY
    const profile: string[] = []
    for (let i = 0; i <= 60; i++) {
      const x = stSpan * i / 60
      profile.push(`${toX(curve.BVCstation + x)},${toY(curve.elevAt(x))}`)
    }
    const turnPt = curve.turnStation != null
      ? { x: toX(curve.turnStation), y: toY(curve.turnElev ?? 0) }
      : null

    return (
      <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
        <ReportControls title="Vertical Curve Report" badges={[kind === 'crest' ? 'Crest curve' : 'Sag curve', `A = ${f3(A)}%`]} />
        <p className="mt-2 max-w-3xl text-sm text-muted">
          A parabolic curve joins the two grades at a constant rate of change of slope. The same
          geometry answers the drainage question (K), the appearance question, and the
          sight-distance question (length vs S).
        </p>

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="space-y-5">
            <Card title="Grades and length">
              <div className="sm:col-span-2 lg:col-span-3">
                <button type="button"
                  onClick={() => { setG1(3); setG2(-1); setL(300); setPviSt(1500); setPviEl(100); setS(200); setDesignV(100) }}
                  className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                  Load the sample — +3% into −1%, L = 300 m
                </button>
              </div>
              <Num label="Entry grade g₁" unit="%" value={g1} onChange={setG1} min={-12} max={12} step="0.5" />
              <Num label="Exit grade g₂" unit="%" value={g2} onChange={setG2} min={-12} max={12} step="0.5" />
              <Num label="Curve length L" unit="m" value={L} onChange={setL} min={10} max={2000} step="10" />
              <Num label="PVI station" unit="m" value={pviSt} onChange={setPviSt} min={0} max={100000} step="10" />
              <Num label="PVI elevation" unit="m" value={pviEl} onChange={setPviEl} min={-100} max={3000} step="0.5" />
            </Card>

            <Card title="Sight-distance check">
              <p className="text-[12px] text-muted sm:col-span-2 lg:col-span-3">
                The grades make this a <b>{kind}</b> curve — {kind === 'crest'
                  ? 'the sight line passes over the curve (eye 1.08 m, object 0.60 m).'
                  : 'the headlight beam (0.60 m, 1° upward) must reach the road surface.'}
              </p>
              <Num label="Sight distance S" unit="m" value={S} onChange={setS} min={20} max={600} step="10" />
              <Num label="Design speed (comfort)" unit="km/h" value={designV} onChange={setDesignV} min={30} max={130} step="10" />
              <p className="text-[11px] text-faint sm:col-span-2 lg:col-span-3">
                S = SSD for a crest (1.08 m eye over 0.60 m object) and for the sag headlight
                check (0.60 m lamp, 1° beam). The mode follows the grades: g₁ ≥ g₂ is a crest.
              </p>
            </Card>
          </div>

          <div className="space-y-5">
            <ResultCard title={`Curve geometry — ${kind === 'crest' ? 'crest' : 'sag'}`}>
              <Row label="A · K · r" value={`${f3(A)}% · ${curve.K === Infinity ? '—' : f3(curve.K)} m/% · ${f3(curve.r)} %/m`} sub="K = L/A is the design shorthand" />
              <Row label="BVC → EVC" value={`${f3(curve.BVCstation)} → ${f3(curve.EVCstation)} m`} sub={`elev ${f3(curve.BVCelev)} → ${f3(curve.EVCelev)} m`} />
              <Row label="PVI offset e" value={`${f3(curve.PVIoffset)} m`} sub={kind === 'crest' ? 'curve below the tangent PVI' : 'curve above the tangent PVI'} />
              {curve.turnKind && (
                <Row label={`${curve.turnKind === 'high' ? 'High' : 'Low'} point`} value={`${f3(curve.turnStation ?? 0)} m · elev ${f3(curve.turnElev ?? 0)}`} sub={`${f3(curve.turnX ?? 0)} m from the BVC`} />
              )}
            </ResultCard>

            {req && (
              <ResultCard title={`Sight-distance requirement (${kind}, S = ${f2(S)} m)`}>
                <Row label="Minimum length Lmin" value={`${f3(req.Lmin)} m`} sub={`regime ${req.regime} · Kreq = ${f3(req.K)} m/%`} />
                <Row label="Provided L" value={`${f2(L)} m`} sub={adequate ? 'adequate' : 'SHORT — lengthen the curve'} alert={!adequate} />
                {comfort && (
                  <Row label="Comfort check (sag)" value={`L ≥ ${f3(comfort)} m`} sub={`A·V²/395 at ${f2(designV)} km/h — ${comfortOk ? 'satisfied' : 'not satisfied'}`} alert={!comfortOk} />
                )}
              </ResultCard>
            )}

            <DrawingCard title="Profile" meta="tangent grade line, parabola, turning point">
              <DrawingFrame label="Vertical curve profile">
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Vertical curve profile">
                  <line x1={px0 - 14} x2={px1 + 14} y1={H - pad + 16} y2={H - pad + 16} stroke={INK} strokeWidth="1.2" />
                  {/* tangents extended past BVC and EVC */}
                  <line x1={toX(curve.BVCstation - ext)} y1={toY(curve.tangentAt(-ext))}
                    x2={toX(curve.BVCstation)} y2={toY(curve.BVCelev)} stroke={MUTED} strokeWidth="1.1" strokeDasharray="5 3" />
                  <line x1={toX(curve.EVCstation)} y1={toY(curve.EVCelev)}
                    x2={toX(curve.EVCstation + ext)} y2={toY(curve.tangentAt(stSpan + ext))} stroke={MUTED} strokeWidth="1.1" strokeDasharray="5 3" />
                  {/* the curve */}
                  <polyline points={profile.join(' ')} fill="none" stroke={INK} strokeWidth="2" />
                  {/* PVI and its offset */}
                  <circle cx={toX(pviSt)} cy={toY(pviEl)} r={2.6} fill={INK} />
                  <line x1={toX(pviSt)} y1={toY(pviEl)} x2={toX(pviSt)} y2={toY(curve.elevAt(L / 2))} stroke={MUTED} strokeWidth="1" />
                  <text x={toX(pviSt) + 6} y={toY(pviEl) - 6} fontSize="10.5" fill={INK} fontFamily="var(--font-mono, monospace)">
                    PVI {f3(pviEl)}
                  </text>
                  <text x={toX(pviSt) + 6} y={(toY(pviEl) + toY(curve.elevAt(L / 2))) / 2 + 3} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
                    e = {f3(curve.PVIoffset)}
                  </text>
                  {/* BVC / EVC */}
                  <circle cx={toX(curve.BVCstation)} cy={toY(curve.BVCelev)} r={2.6} fill={INK} />
                  <text x={toX(curve.BVCstation)} y={toY(curve.BVCelev) - 8} fontSize="10" fill={INK} fontFamily="var(--font-mono, monospace)">BVC</text>
                  <circle cx={toX(curve.EVCstation)} cy={toY(curve.EVCelev)} r={2.6} fill={INK} />
                  <text x={toX(curve.EVCstation)} y={toY(curve.EVCelev) - 8} fontSize="10" fill={INK} fontFamily="var(--font-mono, monospace)">EVC</text>
                  {/* turning point */}
                  {turnPt && (
                    <>
                      <circle cx={turnPt.x} cy={turnPt.y} r={2.6} fill={INK} />
                      <text x={turnPt.x} y={turnPt.y + (curve.turnKind === 'high' ? -8 : 15)} textAnchor="middle" fontSize="10" fill={INK} fontFamily="var(--font-mono, monospace)">
                        {curve.turnKind === 'high' ? 'high' : 'low'} {f3(curve.turnElev ?? 0)}
                      </text>
                    </>
                  )}
                  <text x={px0} y={H - 8} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
                    L = {f2(L)} m · A = {f3(A)}% · K = {curve.K === Infinity ? '—' : f3(curve.K)} m/%
                  </text>
                </svg>
              </DrawingFrame>
            </DrawingCard>

            <WorkedSolution steps={steps} title="Vertical curve — step by step" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
      <ReportControls title="Vertical Curve Report" />
      <ResultCard title="Check the inputs">
        <p className="text-sm text-fail">Give a positive curve length; equal grades (A = 0) need no curve at all.</p>
      </ResultCard>
    </div>
  )
}
