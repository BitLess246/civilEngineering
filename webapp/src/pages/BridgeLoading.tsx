import { useState } from 'react'
import 'katex/dist/katex.min.css'
import {
  hl93SimpleSpan, leverRule, type BridgeResult, type DeckInput,
} from '../engine/bridgeLoading'
import { Card, Num, Pick, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, MUTED, BRAND, TINT_T, f2, f3 } from '../lib/influenceStyle'

// Bridge Loading — AASHTO HL-93 on a simple span: design truck / tandem
// walked over exact influence lines (engine/bridgeLoading.ts on the
// influenceBeam machinery), dynamic load allowance, lane load, and the
// lever rule bringing it all to one girder.

type GirderKind = 'interior' | 'exterior'

export default function BridgeLoading() {
  const [L, setL] = useState(30)
  const [girder, setGirder] = useState<GirderKind>('interior')
  const [S, setS] = useState(2.4)
  const [d, setD] = useState(1.2)
  const [imPct, setImPct] = useState(33)
  const [dfOverride, setDfOverride] = useState(0) // 0 = auto

  const deck: DeckInput | null = (() => {
    if (!(S > 0)) return null
    if (girder === 'exterior' && !(d >= 0)) return null
    return { S, girder, d }
  })()

  const res: BridgeResult | null = (() => {
    try {
      if (!deck) return null
      return hl93SimpleSpan({ L, deck, IM: imPct / 100 })
    } catch {
      return null
    }
  })()

  const DF = dfOverride > 0 ? dfOverride : (res?.DF ?? 0)
  const scaleBack = res && dfOverride > 0 ? dfOverride / res.DF : 1 // manual DF rescales every combined number

  const lever = res ? leverRule({ ...deck!, lanes: res.lever.governing.m === 1.0 ? 2 : 1 }) : null

  const steps: SolutionStep[] = res && lever ? [
    {
      title: 'Transverse distribution — lever rule',
      lines: [
        { tex: `g = \\frac{\\sum r_i}{2} = \\frac{${f3(lever.sumR)}}{2} = ${f3(lever.g)}, \\qquad m = ${f2(lever.m)} \\;\\Rightarrow\\; DF = g\\cdot m = ${f3(DF)}\\text{ per lane}` },
        { text: lever.wheels.map((w, i) => `wheel ${i + 1} at ${f3(w.x)} m → r = ${f3(w.r)}`).join('; ') + `. The deck strip reacts as a simple beam ${girder === 'exterior' ? `with a ${f3(d ?? 0)} m overhang to the edge` : 'between adjacent girders'}; the multiple presence factor m = ${f2(lever.m)} (${lever.m === 1.2 ? 'one' : 'two'} design lanes).` },
      ],
    },
    {
      title: 'Longitudinal extremes — the vehicle walk',
      lines: [
        { tex: `M = DF\\left[(1+IM)\\max_{x}\\sum_i P_i\\,\\mathrm{IL}(x+o_i) + w\\,\\frac{a(L-a)}{2}\\right]` },
        { text: `The design truck (35 + 145 + 145 kN, rear spacing swept ${'4.26–9.0 m'}) and the tandem (2×110 kN at 1.2 m) drive over the exact piecewise influence line of every section; the truck OR the tandem governs per section. IM = ${f2(imPct)}% applies to the vehicle only; the 9.3 kN/m lane load acts with it, full span.` },
      ],
    },
    {
      title: 'Governing moment',
      lines: [
        { tex: `M = DF\\,(1+IM)\\,M_{${res.moment.vehicle === 'truck' ? `\\text{truck},\\,s=${f3(res.moment.spacing ?? 0)}` : '\\text{tandem}'}} + DF\\,M_{\\text{lane}} = ${f3(res.moment.vehPart * scaleBack)} + ${f3(res.moment.lanePart * scaleBack)} = ${f3(res.moment.value * scaleBack)}\\text{ kN·m}` },
        { text: `Governing vehicle parked with its leading axle at x = ${f3(res.moment.position)} m; the section is at ${f3(res.moment.section)} m.` },
      ],
    },
    {
      title: 'Governing shear and reaction',
      lines: [
        { tex: `V = ${f3(Math.abs(res.shear.value) * scaleBack)}\\text{ kN at the ${res.shear.sectionLabel}}; \\qquad R = ${f3(res.reaction.value * scaleBack)}\\text{ kN}` },
        { text: `Reaction = vehicle ${f3(res.reaction.vehPart * scaleBack)} kN (IM included) + lane ${f3(res.reaction.lanePart * scaleBack)} kN (wL/2 per lane). The tandem never governs the reaction on this span.` },
      ],
    },
  ] : []

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
      <ReportControls title="Bridge Loading Report" badges={['AASHTO HL-93', 'Lever rule']} />
      <p className="mt-2 max-w-3xl text-sm text-muted">
        HL-93 on a simple span: the design truck and tandem drive over exact influence lines,
        the 9.3 kN/m lane load rides with them, and the lever rule shares the result across the
        deck to one girder. Hand-checkable statics at every step.
      </p>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="Span and deck">
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="button"
                onClick={() => { setL(30); setGirder('interior'); setS(2.4); setD(1.2); setImPct(33); setDfOverride(0) }}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                Load the sample — 30 m span, girders at 2.4 m
              </button>
            </div>
            <Num label="Span L" unit="m" value={L} onChange={setL} min={5} max={80} step="1" />
            <Pick label="Girder" value={girder} onChange={(v) => setGirder(v as GirderKind)}
              options={[['interior', 'Interior girder'], ['exterior', 'Exterior girder']]} />
            <Num label="Girder spacing S" unit="m" value={S} onChange={setS} min={0.6} max={6} step="0.1" />
            {girder === 'exterior' && (
              <Num label="Overhang d (edge → girder)" unit="m" value={d} onChange={setD} min={0} max={3} step="0.1" />
            )}
            <Num label="Dynamic allowance IM" unit="%" value={imPct} onChange={setImPct} min={0} max={60} step="1" />
            <Num label="DF override" value={dfOverride} onChange={setDfOverride} min={0} max={3} step="0.05" />
            <p className="text-[11px] text-faint sm:col-span-2 lg:col-span-3">
              DF override 0 = use the lever rule. Type the specification equation value
              (AASHTO 4.6.2.2) if you prefer it — every combined number rescales.
            </p>
          </Card>
        </div>

        <div className="space-y-5">
          {res ? (
            <>
              <ResultCard title="Distribution and governing effects">
                <Row label="Distribution factor DF" value={`${f3(DF)}`} sub={`lever ${f3(res.lever.governing.g)} × m ${f2(res.lever.governing.m)} (${res.lever.governing.m === 1.2 ? 'one' : 'two'} lane${res.lever.governing.m === 1.2 ? '' : 's'} loaded)`} />
                <Row label="Governing moment" value={`${f3(res.moment.value * scaleBack)} kN·m`} sub={`${res.moment.vehicle === 'truck' ? `truck, rear spacing ${f3(res.moment.spacing ?? 0)} m` : 'tandem'} at x = ${f3(res.moment.position)} m · section ${f3(res.moment.section)} m`} />
                <Row label="Vehicle / lane share" value={`${f3(res.moment.vehPart * scaleBack)} + ${f3(res.moment.lanePart * scaleBack)} kN·m`} sub="vehicle includes (1 + IM)" />
                <Row label={`Governing shear`} value={`${f3(Math.abs(res.shear.value) * scaleBack)} kN`} sub={`at the ${res.shear.sectionLabel}, ${res.shear.sign > 0 ? 'positive' : 'negative'}`} />
                <Row label="Reaction at support" value={`${f3(res.reaction.value * scaleBack)} kN`} sub={`${res.reaction.vehicle === 'truck' ? 'truck' : 'tandem'} + lane`} />
              </ResultCard>

              <DrawingCard title="Envelope and governing parking" meta="moment envelope along the span with the truck at its worst spot">
                <DrawingFrame label="Moment envelope and governing load position">
                  <EnvelopeDrawing res={res} scale={scaleBack} />
                </DrawingFrame>
              </DrawingCard>

              <DrawingCard title="Influence line of the governing section" meta="with the parked axles and their ordinates">
                <DrawingFrame label="Governing section influence line">
                  <ILDrawing res={res} />
                </DrawingFrame>
              </DrawingCard>

              <WorkedSolution steps={steps} title="HL-93 — step by step" />
            </>
          ) : (
            <ResultCard title="Check the inputs">
              <p className="text-sm text-fail">
                Give a positive span and girder spacing (and an overhang for the exterior case).
              </p>
            </ResultCard>
          )}
        </div>
      </div>
    </div>
  )
}

// ── envelope + parked truck drawing ──────────────────────────────────────

function EnvelopeDrawing({ res, scale }: { res: BridgeResult; scale: number }) {
  const W = 680, H = 320
  const pad = 46
  const x0 = pad, x1 = W - pad
  const baseY = H - 40
  const topY = pad + 8
  const maxM = Math.max(...res.envelope.map((e) => e.M)) * scale || 1
  const toX = (x: number) => x0 + (x / res.L) * (x1 - x0)
  const toY = (m: number) => baseY - (m / (maxM * 1.12)) * (baseY - topY)
  const envPts = res.envelope.map((e) => `${toX(e.x)},${toY(e.M * scale)}`).join(' ')
  const gov = res.moment
  // parked axles from the governing case, re-derived from the parked detail
  const axX = gov.axles.map((a) => toX(Math.min(Math.max(a.x, -3), res.L + 3)))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Moment envelope">
      {/* span deck line */}
      <line x1={x0 - 16} x2={x1 + 16} y1={baseY} y2={baseY} stroke={INK} strokeWidth="1.6" />
      {/* supports */}
      <path d={`M ${x0} ${baseY} l -7 12 h 14 z`} fill={INK} />
      <path d={`M ${x1} ${baseY} l -7 12 h 14 z`} fill={INK} />
      {/* envelope fill */}
      <polygon points={`${x0},${baseY} ${envPts} ${x1},${baseY}`} fill={TINT_T} stroke="none" />
      <polyline points={envPts} fill="none" stroke={BRAND} strokeWidth="1.8" />
      {/* parked axles */}
      {gov.axles.map((a, i) => (
        <g key={i}>
          <line x1={axX[i]} x2={axX[i]} y1={toY(gov.value * scale) - 7} y2={baseY} stroke={INK} strokeWidth="1" />
          <rect x={axX[i] - 9} y={toY(gov.value * scale) - 16} width={18} height={9} fill={INK} />
          <text x={axX[i]} y={toY(gov.value * scale) - 20} textAnchor="middle" fontSize="9.5" fill={INK} fontFamily="var(--font-mono, monospace)">
            {f2(a.p)} kN
          </text>
        </g>
      ))}
      {/* vehicle connecting line */}
      {axX.length > 1 && (
        <line x1={axX[0]} y1={toY(gov.value * scale) - 11} x2={axX[axX.length - 1]} y2={toY(gov.value * scale) - 11} stroke={INK} strokeWidth="1.4" />
      )}
      {/* governing marker */}
      <line x1={toX(gov.section)} x2={toX(gov.section)} y1={topY} y2={baseY} stroke={MUTED} strokeWidth="0.9" strokeDasharray="4 3" />
      <text x={toX(gov.section) + 6} y={(topY + baseY) / 2} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
        section {f3(gov.section)} m
      </text>
      <text x={x0} y={H - 8} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
        M max = {f3(gov.value * scale)} kN·m at DF = {f3(res.DF)} · veh + {f3(res.IM)} IM + lane
      </text>
      <text x={x1} y={H - 8} textAnchor="end" fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
        L = {f3(res.L)} m
      </text>
    </svg>
  )
}

// ── IL of the governing section with the parked ordinates ────────────────

function ILDrawing({ res }: { res: BridgeResult }) {
  const W = 680, H = 300
  const pad = 46
  const x0 = pad, x1 = W - pad
  const zeroY = H - 56
  const topY = pad
  const gov = res.moment
  const a = gov.section
  const L = res.L
  const peak = (a * (L - a)) / L || 1
  const toX = (x: number) => x0 + (x / L) * (x1 - x0)
  const toY = (v: number) => zeroY - (v / (peak * 1.18)) * (zeroY - topY)

  // truck axles of the governing case with their ordinates
  const ax = gov.axles.map((axl) => ({ x: axl.x, p: axl.p, ord: axl.ord }))
  const vehLabel = gov.vehicle === 'truck' ? `design truck (rear gap ${f3(gov.spacing ?? 0)} m)` : 'design tandem'

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Influence line of governing section">
      {/* zero axis + span */}
      <line x1={x0 - 16} x2={x1 + 16} y1={zeroY} y2={zeroY} stroke={INK} strokeWidth="1.2" />
      <line x1={x0 - 16} x2={x1 + 16} y1={H - 26} y2={H - 26} stroke={INK} strokeWidth="1.4" />
      <path d={`M ${x0} ${H - 26} l -6 10 h 12 z`} fill={INK} />
      <path d={`M ${x1} ${H - 26} l -6 10 h 12 z`} fill={INK} />
      {/* IL triangle */}
      <polygon points={`${x0},${zeroY} ${toX(a)},${toY(peak)} ${x1},${zeroY}`} fill={TINT_T} stroke="none" />
      <polyline points={`${x0},${zeroY} ${toX(a)},${toY(peak)} ${x1},${zeroY}`} fill="none" stroke={BRAND} strokeWidth="1.8" />
      {/* section marker */}
      <line x1={toX(a)} x2={toX(a)} y1={toY(peak) - 6} y2={zeroY} stroke={MUTED} strokeWidth="0.9" strokeDasharray="4 3" />
      {/* axles parked with their ordinates */}
      {ax.map((axl, i) => {
        const xi = toX(Math.min(Math.max(axl.x, -2), L + 2))
        const yi = toY(axl.ord)
        return (
          <g key={i}>
            <line x1={xi} x2={xi} y1={zeroY} y2={yi} stroke={INK} strokeWidth="1.3" />
            <circle cx={xi} cy={yi} r={2.8} fill={INK} />
            <text x={xi} y={yi - 7} textAnchor="middle" fontSize="9.5" fill={INK} fontFamily="var(--font-mono, monospace)">
              {f2(axl.ord)}
            </text>
            <rect x={xi - 8} y={H - 26 - 15} width={16} height={8} fill={INK} />
          </g>
        )
      })}
      {ax.length > 1 && (
        <line x1={toX(Math.min(Math.max(ax[0].x, -2), L + 2))} y1={H - 26 - 11}
          x2={toX(Math.min(Math.max(ax[ax.length - 1].x, -2), L + 2))} y2={H - 26 - 11} stroke={INK} strokeWidth="1.3" />
      )}
      <text x={x0} y={topY + 4} fontSize="10.5" fill={INK} fontFamily="var(--font-mono, monospace)">
        IL of M at {f3(a)} m — peak {f3(peak)} m·m/kN — {vehLabel}
      </text>
      <text x={x0} y={H - 8} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
        axle ordinates × wheel loads = Σ P·IL = {f3(gov.axles.reduce((s, r) => s + r.contribution, 0))} kN·m per lane
      </text>
    </svg>
  )
}
