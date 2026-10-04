import { useState } from 'react'
import 'katex/dist/katex.min.css'
import {
  bridgeRating,
  type RatingResult,
} from '../engine/bridgeRating'
import { Card, Num, Pick, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, MUTED, f2, f3 } from '../lib/influenceStyle'

// Bridge Rating — the AASHTO MBE design-load rating factor of a simple
// span on the wave-3 HL-93 machinery: RF = (φ·Rn − γDC·DC − γDW·DW) /
// (γLL·(1+IM)·LL), rated at inventory (γLL = 1.75) and operating (1.35),
// in flexure and shear, with the HL-93 envelope drawn against capacity.

type LLMode = 'hl93' | 'override'

export default function BridgeRating() {
  const [L, setL] = useState(30)
  const [S, setS] = useState(2.4)
  const [girder, setGirder] = useState<'interior' | 'exterior'>('interior')
  const [overhang, setOverhang] = useState(1.05)
  const [DF, setDF] = useState(0)
  const [DC, setDC] = useState(12)
  const [DW, setDW] = useState(2)
  const [Mn, setMn] = useState(6000)
  const [Vn, setVn] = useState(1400)
  const [IM, setIM] = useState(33)
  const [llMode, setLLMode] = useState<LLMode>('hl93')
  const [LLm, setLLm] = useState(1500)
  const [LLv, setLLv] = useState(220)

  const out: { r: RatingResult | null } = (() => {
    try {
      return {
        r: bridgeRating({
          L,
          deck: { S, girder, ...(girder === 'exterior' ? { d: overhang } : {}) },
          DC, DW, Mn, Vn, IM: IM / 100,
          ...(DF > 0 ? { DF } : {}),
          ...(llMode === 'override' ? { LLm, LLv } : {}),
        }),
      }
    } catch { return { r: null } }
  })()
  const r = out.r

  const steps: SolutionStep[] = r ? [
    {
      title: 'The MBE rating equation',
      lines: [
        { tex: 'RF = \\frac{\\varphi R_n - \\gamma_{DC} DC - \\gamma_{DW} DW}{\\gamma_{LL}(1+IM)\\,LL}' },
        { text: `Design-load rating on Strength-I: γDC = 1.25, γDW = 1.50 (LRFD Table 3.4.1-2), φ = 1.0 for RC flexure and shear (MBE Table 6A.4.2.3-1), IM = ${f2(r.IM)} and γLL = 1.75 at inventory / 1.35 at operating (MBE Table 6A.4.3.2.1-1).` },
      ],
    },
    {
      title: 'Live load — ' + (llMode === 'hl93' ? `the HL-93 walk (DF = ${f2(r.DF)})` : 'user-supplied static effects'),
      lines: llMode === 'hl93' ? [
        { text: `The lever rule on ${girder} girders at ${f2(S)} m gives DF = ${f2(r.DF)} including multiple presence; the HL-93 truck/tandem plus lane load walk the span's influence lines. Governing per girder: LL(M) = ${f3(r.flexure.LLstatic)} kN·m static, LL(V) = ${f3(r.shear.LLstatic)} kN static, both ×(1+IM) in the denominator.` },
        { tex: `DF = g\\cdot m = ${f2(r.hl.lever.governing.g)}\\times${f2(r.hl.lever.governing.m)} = ${f2(r.hl.DF)}${r.DF !== r.hl.DF ? `\\;\\Rightarrow\\; DF_{used} = ${f2(r.DF)}` : ''}` },
        { tex: `\\sum P_i\\,y_i = ${r.hl.moment.axles.map((a) => `${f2(a.p)}\\times${f3(a.ord)}`).join(' + ')} = ${f3(r.hl.moment.axles.reduce((s, q) => s + q.contribution, 0))}\\text{ kN·m per lane}` },
        { tex: `LL_{M} = DF\\,(\\sum P_i y_i + M_{lane}) = ${f2(r.DF)}\\times(${f3(r.hl.moment.axles.reduce((s, q) => s + q.contribution, 0))} + ${f3(r.hl.moment.lanePart / r.hl.DF)}) = ${f3(r.flexure.LLstatic)}\\text{ kN·m static}` },
        { tex: `LL_M^{(1+IM)} = ${f3(r.flexure.LLstatic)}\\times${f3(1 + r.IM)} = ${f3(r.flexure.LLwithIM)}\\ \\text{kN·m}` },
      ] : [
        { text: `Static per-girder effects supplied directly (e.g. from an FE model): LL(M) = ${f3(LLm)} kN·m, LL(V) = ${f3(LLv)} kN — the engine applies (1+IM) and γLL.` },
      ],
    },
    {
      title: 'Flexure',
      lines: [
        { tex: `M_{DC} = \\frac{w_{DC}L^2}{8} = \\frac{${f2(DC)}\\times${f2(L)}^2}{8} = ${f2(r.Mdc)}\\ \\text{kN·m}, \\quad M_{DW} = \\frac{w_{DW}L^2}{8} = \\frac{${f2(DW)}\\times${f2(L)}^2}{8} = ${f2(r.Mdw)}\\ \\text{kN·m}` },
        { tex: `RF_M = \\frac{1.0\\times${f3(Mn)} - 1.25\\times${f2(r.Mdc)} - 1.50\\times${f2(r.Mdw)}}{1.75\\times${f3(r.flexure.LLwithIM)}} = ${f3(r.flexure.RF_inventory)}` },
        { text: `Operating: RF = ${f3(r.flexure.RF_operating)} (γLL = 1.35). Utilisation at inventory ${(r.flexure.util_inventory * 100).toFixed(1)} %.` },
      ],
    },
    {
      title: 'Shear',
      lines: [
        { tex: `V_{DC} = \\frac{w_{DC}L}{2} = \\frac{${f2(DC)}\\times${f2(L)}}{2} = ${f2(r.Vdc)}\\ \\text{kN}, \\quad V_{DW} = \\frac{w_{DW}L}{2} = \\frac{${f2(DW)}\\times${f2(L)}}{2} = ${f2(r.Vdw)}\\ \\text{kN}` },
        { tex: `RF_V = \\frac{1.0\\times${f3(Vn)} - 1.25\\times${f2(r.Vdc)} - 1.50\\times${f2(r.Vdw)}}{1.75\\times${f3(r.shear.LLwithIM)}} = ${f3(r.shear.RF_inventory)}` },
        { text: `Operating: RF = ${f3(r.shear.RF_operating)}. Governing effect: ${r.governing}.` },
      ],
    },
    { title: 'Verdict', lines: [{ text: r.verdict }, ...r.notes.map((nt) => ({ text: nt }))] },
  ] : []

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
      <ReportControls title="Bridge Rating Report" badges={['MBE design-load · HL-93']} />
      <p className="mt-2 max-w-3xl text-sm text-muted">
        AASHTO MBE design-load rating of a simple span: the HL-93 live load from the
        wave-3 influence-line machinery (lever-rule distribution, truck/tandem walk,
        lane load) rated against the girder's nominal flexural and shear resistances
        at inventory (γLL = 1.75) and operating (γLL = 1.35) levels. Supply your own
        static live-load effects when an FE model is available.
      </p>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="Span and deck">
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="button"
                onClick={() => { setL(30); setS(2.4); setGirder('interior'); setDF(0); setDC(12); setDW(2); setMn(6000); setVn(1400); setIM(33); setLLMode('hl93') }}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                Load the sample — 30 m span, interior girders at 2.4 m
              </button>
            </div>
            <Num label="Span L" unit="m" value={L} onChange={setL} min={3} max={80} step="1" />
            <Pick label="Girder row" value={girder} onChange={(v) => setGirder(v as 'interior' | 'exterior')}
              options={[['interior', 'Interior girder'], ['exterior', 'Exterior girder']]} />
            <Num label="Girder spacing S" unit="m" value={S} onChange={setS} min={1} max={6} step="0.1" />
            {girder === 'exterior' && (
              <Num label="Overhang d (edge → girder)" unit="m" value={overhang} onChange={setOverhang} min={0} max={2.5} step="0.05" />
            )}
            <Num label="DF override (0 = lever rule)" value={DF} onChange={setDF} min={0} max={3} step="0.05" />
          </Card>

          <Card title="Loads and resistances">
            <Num label="DC per girder" unit="kN/m" value={DC} onChange={setDC} min={0} max={200} step="0.5" />
            <Num label="DW per girder" unit="kN/m" value={DW} onChange={setDW} min={0} max={100} step="0.5" />
            <Num label="Nominal Mn" unit="kN·m" value={Mn} onChange={setMn} min={10} max={100000} step="10" />
            <Num label="Nominal Vn" unit="kN" value={Vn} onChange={setVn} min={10} max={20000} step="10" />
            <Num label="Dynamic allowance IM" unit="%" value={IM} onChange={setIM} min={0} max={50} step="1" />
            <Pick label="Live load" value={llMode} onChange={(v) => setLLMode(v as LLMode)}
              options={[['hl93', 'HL-93 span walk'], ['override', 'Static LL from FE']]} />
            {llMode === 'override' && (
              <>
                <Num label="LL moment (static)" unit="kN·m" value={LLm} onChange={setLLm} min={1} max={100000} step="10" />
                <Num label="LL shear (static)" unit="kN" value={LLv} onChange={setLLv} min={1} max={20000} step="5" />
              </>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          {r ? (
            <>
              <ResultCard title="Rating factors (governing)">
                <Row label="Flexure RF" value={f3(r.flexure.RF_inventory)}
                  sub={`inventory · operating ${f3(r.flexure.RF_operating)}`} />
                <Row label="Shear RF" value={f3(r.shear.RF_inventory)}
                  sub={`inventory · operating ${f3(r.shear.RF_operating)}`} />
                <Row label="Governing effect" value={r.governing} sub={r.verdict} />
              </ResultCard>

              <ResultCard title="Load breakdown per girder">
                <Row label="LL with IM — moment" value={`${f3(r.flexure.LLwithIM)} kN·m`}
                  sub={`static ${f3(r.flexure.LLstatic)} · DF ${f2(r.DF)}`} />
                <Row label="LL with IM — shear" value={`${f3(r.shear.LLwithIM)} kN`}
                  sub={`static ${f3(r.shear.LLstatic)}`} />
                <Row label="M DC + DW" value={`${f2(r.Mdc)} + ${f2(r.Mdw)} kN·m`} sub="wL²/8 each" />
                <Row label="V DC + DW" value={`${f2(r.Vdc)} + ${f2(r.Vdw)} kN`} sub="wL/2 each" />
              </ResultCard>

              <DrawingCard title="Moment envelope vs capacity" meta="HL-93 per girder against φMn">
                <DrawingFrame label="Rating envelope">
                  <RatingEnvelope r={r} Mn={Mn} />
                </DrawingFrame>
              </DrawingCard>

              <DrawingCard title="Rating bars" meta="RF at both levels — 1.0 is the pass line">
                <DrawingFrame label="Rating factors">
                  <RatingBars flex={r.flexure} shear={r.shear} />
                </DrawingFrame>
              </DrawingCard>

              <WorkedSolution steps={steps} title="MBE rating — step by step" />
            </>
          ) : (
            <ResultCard title="Check the inputs">
              <p className="text-sm text-fail">
                Give a positive span, non-negative dead loads and positive nominal
                resistances. The exterior lever rule needs the deck overhang.
              </p>
            </ResultCard>
          )}
        </div>
      </div>
    </div>
  )
}

// ── envelope drawing ─────────────────────────────────────────────────────

function RatingEnvelope({ r, Mn }: { r: RatingResult; Mn: number }) {
  const W = 640, Hh = 280
  const x0 = 56, x1 = W - 40
  const baseY = Hh - 46
  const topY = 40
  const Mmax = Math.max(r.hl.moment.value, 1)
  const cap = 1.0 * Mn
  const yPix = Math.min(baseY - topY - 30, 170)
  const scale = yPix / Math.max(Mmax, cap)
  const px = (x: number) => x0 + ((x1 - x0) * x) / r.L
  const py = (M: number) => baseY - M * scale

  const path = r.hl.envelope.map((e, i) => `${i === 0 ? 'M' : 'L'} ${px(e.x).toFixed(1)} ${py(e.M).toFixed(1)}`).join(' ')
  const capY = py(cap)
  const govX = px(r.hl.moment.section)

  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full" role="img" aria-label="Moment envelope vs capacity">
      {/* span outline */}
      <line x1={x0} x2={x1} y1={baseY} y2={baseY} stroke={INK} strokeWidth="1.2" />
      <circle cx={x0} cy={baseY} r={3} fill={INK} />
      <circle cx={x1} cy={baseY} r={3} fill={INK} />
      {/* capacity */}
      <line x1={x0} x2={x1} y1={capY} y2={capY} stroke="#b45309" strokeWidth="1.6" strokeDasharray="7 4" />
      <text x={x1} y={capY - 6} textAnchor="end" fontSize="10" fill="#b45309" fontFamily="var(--font-mono, monospace)">
        φMn = {f3(cap)} kN·m
      </text>
      {/* envelope */}
      <path d={path} fill="none" stroke="rgba(15,76,146,0.9)" strokeWidth="2" />
      <text x={x0 + 8} y={py(Mmax) + 14} fontSize="10" fill="rgba(15,76,146,0.9)" fontFamily="var(--font-mono, monospace)">
        HL-93 per girder · γ-side LL+IM = {f3(Mmax)} kN·m at {f2(r.hl.moment.section)} m
      </text>
      {/* governing section marker */}
      <line x1={govX} x2={govX} y1={baseY} y2={py(Mmax)} stroke={MUTED} strokeWidth="1" strokeDasharray="3 3" />
      <text x={govX + 6} y={baseY - 6} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
        section {f2(r.hl.moment.section)} m
      </text>
      <text x={x0} y={baseY + 18} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">x = 0</text>
      <text x={x1} y={baseY + 18} textAnchor="end" fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">x = {f2(r.L)} m</text>
    </svg>
  )
}

// ── rating bars drawing ──────────────────────────────────────────────────

function RatingBars({ flex, shear }: { flex: RatingResult['flexure']; shear: RatingResult['shear'] }) {
  const W = 640, Hh = 210
  const x0 = 130
  const barW = W - x0 - 90
  const rows: { label: string; rf: number }[] = [
    { label: 'Flexure · inventory', rf: flex.RF_inventory },
    { label: 'Flexure · operating', rf: flex.RF_operating },
    { label: 'Shear · inventory', rf: shear.RF_inventory },
    { label: 'Shear · operating', rf: shear.RF_operating },
  ]
  const rfMax = Math.max(1.6, ...rows.map((r) => r.rf))
  const rowY0 = 36
  const rowH = 38
  const oneX = x0 + (barW * 1.0) / rfMax

  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full" role="img" aria-label="Rating factor bars">
      {rows.map((r, i) => {
        const y = rowY0 + i * rowH
        const w = Math.max(2, (barW * Math.min(r.rf, rfMax)) / rfMax)
        const pass = r.rf >= 1
        return (
          <g key={r.label}>
            <text x={x0 - 8} y={y + 14} textAnchor="end" fontSize="10.5" fill={INK} fontFamily="var(--font-mono, monospace)">{r.label}</text>
            <rect x={x0} y={y} width={barW} height={18} fill="rgba(120,113,108,0.12)" />
            <rect x={x0} y={y} width={w} height={18} fill={pass ? 'rgba(22,101,52,0.55)' : 'rgba(153,27,27,0.5)'} />
            <text x={x0 + w + 6} y={y + 14} fontSize="10.5" fill={INK} fontFamily="var(--font-mono, monospace)">{f3(r.rf)}</text>
          </g>
        )
      })}
      <line x1={oneX} x2={oneX} y1={rowY0 - 8} y2={rowY0 + rows.length * rowH} stroke="#b45309" strokeWidth="1.4" strokeDasharray="5 4" />
      <text x={oneX} y={rowY0 - 12} fontSize="10" fill="#b45309" fontFamily="var(--font-mono, monospace)">RF = 1.0</text>
      <text x={x0} y={rowY0 + rows.length * rowH + 14} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
        green ≥ 1.0 passes · red falls short
      </text>
    </svg>
  )
}
