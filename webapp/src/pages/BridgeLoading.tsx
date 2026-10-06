import { useState } from 'react'
import 'katex/dist/katex.min.css'
import {
  hl93SimpleSpan, leverRule, type BridgeResult, type DeckInput,
} from '../engine/bridgeLoading'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { DrawingFrame } from '../components/DrawingFrame'
import { DimBelow } from '../components/dims'
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
        { tex: `\\sum P_i\\,y_i = ${res.moment.axles.map((a) => `${f2(a.p)}\\times${f3(a.ord)}`).join(' + ')} = ${f3(res.moment.axles.reduce((s, r) => s + r.contribution, 0))}\\text{ kN·m per lane}` },
        { text: `The design truck (35 + 145 + 145 kN, rear spacing swept ${'4.26–9.0 m'}) and the tandem (2×110 kN at 1.2 m) drive over the exact piecewise influence line of every section; the truck OR the tandem governs per section. IM = ${f2(imPct)}% applies to the vehicle only; the 9.3 kN/m lane load acts with it, full span.` },
      ],
    },
    {
      title: 'Governing moment',
      lines: [
        { tex: `M = DF\\,(1+IM)\\sum P_i y_i + DF\\,M_{\\text{lane}} = ${f3(DF)}\\times${f3(1 + res.IM)}\\times${f3(res.moment.axles.reduce((s, r) => s + r.contribution, 0))} + ${f3(DF)}\\times${f3(res.moment.lanePart / res.DF)} = ${f3(res.moment.vehPart * scaleBack)} + ${f3(res.moment.lanePart * scaleBack)} = ${f3(res.moment.value * scaleBack)}\\text{ kN·m}` },
        { text: `Governing ${res.moment.vehicle === 'truck' ? `truck (rear spacing ${f3(res.moment.spacing ?? 0)} m)` : 'tandem'} parked with its leading axle at x = ${f3(res.moment.position)} m; the section is at ${f3(res.moment.section)} m.` },
      ],
    },
    {
      title: 'Governing shear and reaction',
      lines: [
        { tex: `V = DF\\,(1+IM)\\sum P_i y_i + DF\\,V_{\\text{lane}} = ${f3(DF)}\\times${f3(1 + res.IM)}\\times${f3(res.shear.vehPart / (res.DF * (1 + res.IM)))} + ${f3(DF)}\\times${f3(Math.abs(res.shear.lanePart / res.DF))} = ${f3(Math.abs(res.shear.vehPart) * scaleBack)} + ${f3(Math.abs(res.shear.lanePart) * scaleBack)} = ${f3(Math.abs(res.shear.value) * scaleBack)}\\text{ kN at the ${res.shear.sectionLabel}}` },
        { tex: `R = DF\\,(1+IM)\\sum P_i y_i + DF\\,\\frac{wL}{2} = ${f3(DF)}\\times${f3(1 + res.IM)}\\times${f3(res.reaction.vehPart / (res.DF * (1 + res.IM)))} + ${f3(DF)}\\times\\frac{${f3(res.laneW)}\\times${f3(res.L)}}{2} = ${f3(res.reaction.vehPart * scaleBack)} + ${f3(res.reaction.lanePart * scaleBack)} = ${f3(res.reaction.value * scaleBack)}\\text{ kN}` },
        { text: `Reaction = vehicle ${f3(res.reaction.vehPart * scaleBack)} kN (IM included) + lane ${f3(res.reaction.lanePart * scaleBack)} kN (wL/2 per lane). The tandem never governs the reaction on this span.` },
      ],
    },
  ] : []

  const loadSample = () => { setL(30); setGirder('interior'); setS(2.4); setD(1.2); setImPct(33); setDfOverride(0) }
  const report = res ? {
    docCode: 'BR-01',
    ok: true,
    governing: `M ${f3(res.moment.value * scaleBack)} kN·m · V ${f3(Math.abs(res.shear.value) * scaleBack)} kN · R ${f3(res.reaction.value * scaleBack)} kN per girder (DF ${f3(DF)})`,
    stats: [
      { label: 'Moment', value: f3(res.moment.value * scaleBack), unit: 'kN·m' },
      { label: 'Shear', value: f3(Math.abs(res.shear.value) * scaleBack), unit: 'kN' },
      { label: 'DF', value: f3(DF), unit: dfOverride > 0 ? 'override' : 'lever rule' },
    ],
    data: [
      ['Span L', `${f2(L)} m`], ['Girder', girder], ['Spacing S', `${f2(S)} m`],
      ...(girder === 'exterior' ? [['Overhang d', `${f2(d)} m`] as [string, string]] : []),
      ['IM', `${f2(imPct)} %`], ['DF', dfOverride > 0 ? `${f3(dfOverride)} (override)` : `${f3(DF)} (lever rule)`],
    ] as [string, string][],
    steps,
  } : undefined

  return (
    <WorkspacePage title="Bridge Loading" badges={['Bridges', 'AASHTO HL-93 · lever rule']}
      intro="HL-93 on a simple span: the design truck and tandem drive over exact influence lines, the 9.3 kN/m lane load rides with them, and the lever rule shares the result across the deck to one girder. Hand-checkable statics at every step."
      report={report}
      actions={<button type="button" onClick={loadSample}
        className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
        Load the 30 m sample
      </button>}
      inputs={
        <InputGroup title="Span and deck" hint="DF override 0 uses the lever rule; type the AASHTO 4.6.2.2 equation value to use that instead — every combined number rescales.">
          <Num label="Span L" unit="m" value={L} onChange={setL} min={5} max={80} step="1" />
          <Pick label="Girder" value={girder} onChange={(v) => setGirder(v as GirderKind)}
            options={[['interior', 'Interior girder'], ['exterior', 'Exterior girder']]} />
          <Num label="Girder spacing S" unit="m" value={S} onChange={setS} min={0.6} max={6} step="0.1" />
          {girder === 'exterior' && (
            <Num label="Overhang d" unit="m" value={d} onChange={setD} min={0} max={3} step="0.1" />
          )}
          <Num label="Dynamic allowance IM" unit="%" value={imPct} onChange={setImPct} min={0} max={60} step="1" />
          <Num label="DF override" value={dfOverride} onChange={setDfOverride} min={0} max={3} step="0.05" />
        </InputGroup>
      }
      checks={res ? <>
        <CheckCard title="Distribution factor" basis={dfOverride > 0 ? 'override' : 'lever rule × multiple presence'} status="info" value={f3(DF)}
          pairs={[{ label: 'Lever g', value: f3(res.lever.governing.g) }, { label: 'm', value: `${f2(res.lever.governing.m)} (${res.lever.governing.m === 1.2 ? 'one lane' : 'two lanes'})` }]} />
        <CheckCard title="Governing moment" basis={res.moment.vehicle === 'truck' ? `truck, rear gap ${f3(res.moment.spacing ?? 0)} m` : 'tandem'} status="info"
          value={f3(res.moment.value * scaleBack)} unit="kN·m"
          pairs={[{ label: 'Vehicle + lane', value: `${f3(res.moment.vehPart * scaleBack)} + ${f3(res.moment.lanePart * scaleBack)}` }, { label: 'Section', value: `${f3(res.moment.section)} m` }]} />
        <CheckCard title="Governing shear" basis={`at the ${res.shear.sectionLabel}`} status="info" value={f3(Math.abs(res.shear.value) * scaleBack)} unit="kN" />
        <CheckCard title="Reaction" basis={`${res.reaction.vehicle === 'truck' ? 'truck' : 'tandem'} + lane`} status="info" value={f3(res.reaction.value * scaleBack)} unit="kN" />
      </> : <p className="text-sm text-fail">Give a positive span and girder spacing, and an overhang for the exterior case.</p>}
      summary={[
        { label: 'Span', value: `${f2(L)} m simple span` },
        { label: 'Girder', value: `${girder}, S ${f2(S)} m${girder === 'exterior' ? `, overhang ${f2(d)} m` : ''}` },
        { label: 'Loading', value: `HL-93, IM ${f2(imPct)} %` },
      ]}
      drawing={res ? { title: 'Envelope and governing parking', node: <div className="space-y-4">
        <div data-pdf-drawing>
          <DrawingFrame label="Moment envelope and governing load position"><EnvelopeDrawing res={res} scale={scaleBack} /></DrawingFrame>
        </div>
        <DrawingFrame label="Governing section influence line"><ILDrawing res={res} /></DrawingFrame>
      </div> } : undefined}
      results={res ? [
        { check: 'Distribution factor', basis: dfOverride > 0 ? 'override' : `lever ${f3(res.lever.governing.g)} × m ${f2(res.lever.governing.m)}`, demand: f3(DF), status: 'info' as const },
        { check: 'Governing moment', basis: `section ${f3(res.moment.section)} m, vehicle at ${f3(res.moment.position)} m`, demand: `${f3(res.moment.value * scaleBack)} kN·m`, status: 'info' as const },
        { check: 'Vehicle / lane share', basis: 'vehicle includes (1 + IM)', demand: `${f3(res.moment.vehPart * scaleBack)} + ${f3(res.moment.lanePart * scaleBack)} kN·m`, status: 'info' as const },
        { check: 'Governing shear', basis: `${res.shear.sectionLabel}, ${res.shear.sign > 0 ? 'positive' : 'negative'}`, demand: `${f3(Math.abs(res.shear.value) * scaleBack)} kN`, status: 'info' as const },
        { check: 'Reaction at support', basis: `${res.reaction.vehicle} + lane`, demand: `${f3(res.reaction.value * scaleBack)} kN`, status: 'info' as const },
      ] : []}
      steps={steps}
      references={[
        { topic: 'HL-93 live load', basis: 'design truck or tandem with the design lane', source: 'AASHTO LRFD Bridge Design Specifications §3.6.1' },
        { topic: 'Dynamic load allowance', basis: '33% on the vehicle, not the lane', source: 'AASHTO LRFD §3.6.2' },
        { topic: 'Distribution to girders', basis: 'lever rule; multiple presence factor', source: 'AASHTO LRFD §4.6.2.2, §3.6.1.1.2' },
      ]}
    />
  )
}

// ── envelope + parked truck drawing ──────────────────────────────────────

function EnvelopeDrawing({ res, scale }: { res: BridgeResult; scale: number }) {
  // Two bands on one horizontal scale: the deck with the governing vehicle
  // PARKED ON IT (axle arrows landing on the deck), and below it the moment
  // envelope on its own zero datum, sagging downward. The vehicle used to
  // float in mid-air at the height of the moment peak, on the same baseline
  // as the envelope — load and moment drawn as if they were one quantity.
  const W = 680, H = 330
  const pad = 46
  const x0 = pad, x1 = W - pad
  const deckY = 86
  const zeroY = 150, depth = 110
  const maxM = Math.max(...res.envelope.map((e) => e.M)) * scale || 1
  const toX = (x: number) => x0 + (x / res.L) * (x1 - x0)
  const toY = (m: number) => zeroY + (m / maxM) * depth
  const envPts = res.envelope.map((e) => `${toX(e.x)},${toY(e.M * scale)}`).join(' ')
  const gov = res.moment
  const onDeck = gov.axles.filter((a) => a.x >= -1e-6 && a.x <= res.L + 1e-6)
  const dimY = zeroY + depth + 34
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Moment envelope">
      {/* deck on its bearings */}
      <line x1={x0} x2={x1} y1={deckY} y2={deckY} stroke={INK} strokeWidth="2.4" />
      <path d={`M ${x0} ${deckY} l -7 12 h 14 z`} fill={INK} />
      <circle cx={x1} cy={deckY + 6} r={6} fill="none" stroke={INK} strokeWidth="1.4" />
      {/* the governing vehicle, axle loads landing on the deck */}
      {onDeck.map((a, i) => (
        <g key={i}>
          <line x1={toX(a.x)} x2={toX(a.x)} y1={deckY - 34} y2={deckY - 6} stroke={INK} strokeWidth="1.3" />
          <path d={`M ${toX(a.x) - 4} ${deckY - 7} L ${toX(a.x)} ${deckY - 1} L ${toX(a.x) + 4} ${deckY - 7} z`} fill={INK} />
          <text x={toX(a.x)} y={deckY - 39} textAnchor="middle" fontSize="9.5" fill={INK} fontFamily="var(--font-mono, monospace)">{f2(a.p)} kN</text>
        </g>
      ))}
      <text x={x0} y={20} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
        {gov.vehicle === 'truck' ? `design truck, rear gap ${f3(gov.spacing ?? 0)} m` : 'design tandem'} + {f3(res.laneW)} kN/m lane, parked for the governing section
      </text>
      {/* moment envelope below its own datum */}
      <line x1={x0} x2={x1} y1={zeroY} y2={zeroY} stroke={MUTED} strokeWidth="0.9" />
      <text x={x0 - 6} y={zeroY + 3} fontSize="9" fill={MUTED} textAnchor="end">0</text>
      <polygon points={`${x0},${zeroY} ${envPts} ${x1},${zeroY}`} fill={TINT_T} stroke="none" />
      <polyline points={envPts} fill="none" stroke={BRAND} strokeWidth="1.8" />
      <text x={x0 + 8} y={zeroY - 5} fontSize="9.5" fill={BRAND}>M envelope (sagging drawn down)</text>
      {/* governing section through both bands */}
      <line x1={toX(gov.section)} x2={toX(gov.section)} y1={deckY + 14} y2={toY(gov.value * scale)} stroke={MUTED} strokeWidth="0.9" strokeDasharray="4 3" />
      <circle cx={toX(gov.section)} cy={toY(gov.value * scale)} r={3} fill={BRAND} />
      <text x={toX(gov.section)} y={toY(gov.value * scale) + 16} fontSize="10" fill={BRAND} fontFamily="var(--font-mono, monospace)"
        textAnchor="middle" paintOrder="stroke" stroke="var(--sheet, #fff)" strokeWidth={2.6}>
        M max {f3(gov.value * scale)} kN·m at {f3(gov.section)} m
      </text>
      {/* the span, between the bearings */}
      <DimBelow xA={x0} xB={x1} featY={zeroY + depth + 6} dY={dimY} label={`L = ${f3(res.L)} m`} />
      <line x1={x0} x2={x0} y1={deckY + 14} y2={zeroY + depth + 10} stroke="#1f77b4" strokeWidth={0.6} />
      <line x1={x1} x2={x1} y1={deckY + 14} y2={zeroY + depth + 10} stroke="#1f77b4" strokeWidth={0.6} />
      <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="9.5" fill={MUTED} fontFamily="var(--font-mono, monospace)">
        DF = {f3(res.DF * scale)} · vehicle × (1 + {f3(res.IM)}) + lane
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
