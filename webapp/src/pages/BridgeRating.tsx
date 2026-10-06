import { useState } from 'react'
import 'katex/dist/katex.min.css'
import {
  bridgeRating, GAMMA_DC, GAMMA_DW, GAMMA_LL_INVENTORY,
  type RatingResult,
} from '../engine/bridgeRating'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { DrawingFrame } from '../components/DrawingFrame'
import { DimBelow } from '../components/dims'
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

  const loadSample = () => { setL(30); setS(2.4); setGirder('interior'); setDF(0); setDC(12); setDW(2); setMn(6000); setVn(1400); setIM(33); setLLMode('hl93') }
  const st = (rf: number) => (rf >= 1 ? 'pass' as const : 'fail' as const)
  const report = r ? {
    docCode: 'BR-02',
    ok: r.flexure.RF_inventory >= 1 && r.shear.RF_inventory >= 1,
    governing: `${r.governing} governs · ${r.verdict}`,
    stats: [
      { label: 'Flexure RF inv.', value: f3(r.flexure.RF_inventory), unit: '' },
      { label: 'Shear RF inv.', value: f3(r.shear.RF_inventory), unit: '' },
      { label: 'DF', value: f2(r.DF), unit: DF > 0 ? 'override' : 'lever rule' },
    ],
    checks: [
      { name: 'Flexure RF inventory ≥ 1', ratio: r.flexure.RF_inventory > 0 ? 1 / r.flexure.RF_inventory : null, ok: r.flexure.RF_inventory >= 1 },
      { name: 'Flexure RF operating ≥ 1', ratio: r.flexure.RF_operating > 0 ? 1 / r.flexure.RF_operating : null, ok: r.flexure.RF_operating >= 1 },
      { name: 'Shear RF inventory ≥ 1', ratio: r.shear.RF_inventory > 0 ? 1 / r.shear.RF_inventory : null, ok: r.shear.RF_inventory >= 1 },
      { name: 'Shear RF operating ≥ 1', ratio: r.shear.RF_operating > 0 ? 1 / r.shear.RF_operating : null, ok: r.shear.RF_operating >= 1 },
    ],
    data: [
      ['Span L', `${f2(L)} m`], ['Girder', `${girder}, S ${f2(S)} m`],
      ['DC / DW per girder', `${f2(DC)} / ${f2(DW)} kN/m`], ['Mn / Vn', `${f2(Mn)} kN·m / ${f2(Vn)} kN`],
      ['IM', `${f2(IM)} %`], ['Live load', llMode === 'hl93' ? 'HL-93 span walk' : `static ${f2(LLm)} kN·m / ${f2(LLv)} kN`],
    ] as [string, string][],
    steps,
  } : undefined

  return (
    <WorkspacePage title="Bridge Rating" badges={['Bridges', 'AASHTO MBE design-load · HL-93']}
      intro="AASHTO MBE design-load rating of a simple span: the HL-93 live load (lever-rule distribution, truck / tandem walk, lane load) rated against the girder's nominal flexural and shear resistances at inventory (γLL = 1.75) and operating (γLL = 1.35). Supply static live-load effects from an FE model when one is available."
      report={report}
      actions={<button type="button" onClick={loadSample}
        className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
        Load the 30 m sample
      </button>}
      inputs={<>
        <InputGroup title="Span and deck">
          <Num label="Span L" unit="m" value={L} onChange={setL} min={3} max={80} step="1" />
          <Pick label="Girder row" value={girder} onChange={(v) => setGirder(v as 'interior' | 'exterior')}
            options={[['interior', 'Interior girder'], ['exterior', 'Exterior girder']]} />
          <Num label="Girder spacing S" unit="m" value={S} onChange={setS} min={1} max={6} step="0.1" />
          {girder === 'exterior' && (
            <Num label="Overhang d" unit="m" value={overhang} onChange={setOverhang} min={0} max={2.5} step="0.05" />
          )}
          <Num label="DF override" value={DF} onChange={setDF} min={0} max={3} step="0.05" hint="0 uses the lever rule" />
        </InputGroup>
        <InputGroup title="Loads and resistances">
          <Num label="DC per girder" unit="kN/m" value={DC} onChange={setDC} min={0} max={200} step="0.5" />
          <Num label="DW per girder" unit="kN/m" value={DW} onChange={setDW} min={0} max={100} step="0.5" />
          <Num label="Nominal Mn" unit="kN·m" value={Mn} onChange={setMn} min={10} max={100000} step="10" />
          <Num label="Nominal Vn" unit="kN" value={Vn} onChange={setVn} min={10} max={20000} step="10" />
          <Num label="Dynamic allowance IM" unit="%" value={IM} onChange={setIM} min={0} max={50} step="1" />
          <Pick label="Live load" value={llMode} onChange={(v) => setLLMode(v as LLMode)}
            options={[['hl93', 'HL-93 span walk'], ['override', 'Static LL from FE']]} />
          {llMode === 'override' && (<>
            <Num label="LL moment (static)" unit="kN·m" value={LLm} onChange={setLLm} min={1} max={100000} step="10" />
            <Num label="LL shear (static)" unit="kN" value={LLv} onChange={setLLv} min={1} max={20000} step="5" />
          </>)}
        </InputGroup>
      </>}
      checks={r ? <>
        <CheckCard title="Flexure" basis="RF at inventory" status={st(r.flexure.RF_inventory)} value={f3(r.flexure.RF_inventory)}
          ratio={r.flexure.RF_inventory > 0 ? 1 / r.flexure.RF_inventory : undefined} ratioLabel="1 ÷ RF"
          pairs={[{ label: 'Operating', value: f3(r.flexure.RF_operating) }, { label: 'LL + IM', value: `${f3(r.flexure.LLwithIM)} kN·m` }]} />
        <CheckCard title="Shear" basis="RF at inventory" status={st(r.shear.RF_inventory)} value={f3(r.shear.RF_inventory)}
          ratio={r.shear.RF_inventory > 0 ? 1 / r.shear.RF_inventory : undefined} ratioLabel="1 ÷ RF"
          pairs={[{ label: 'Operating', value: f3(r.shear.RF_operating) }, { label: 'LL + IM', value: `${f3(r.shear.LLwithIM)} kN` }]} />
        <CheckCard title="Governing" basis={r.governing} status="info" value={r.verdict} />
      </> : <p className="text-sm text-fail">Give a positive span, non-negative dead loads and positive nominal resistances. The exterior lever rule needs the deck overhang.</p>}
      summary={[
        { label: 'Span', value: `${f2(L)} m, ${girder} girder at ${f2(S)} m` },
        { label: 'Dead', value: `DC ${f2(DC)}, DW ${f2(DW)} kN/m` },
        { label: 'Resistance', value: `Mn ${f2(Mn)} kN·m, Vn ${f2(Vn)} kN` },
      ]}
      drawing={r ? { title: 'Factored moment against capacity', node: <div className="space-y-4">
        <div data-pdf-drawing><DrawingFrame label="Rating envelope"><RatingEnvelope r={r} /></DrawingFrame></div>
        <DrawingFrame label="Rating factors"><RatingBars flex={r.flexure} shear={r.shear} /></DrawingFrame>
      </div> } : undefined}
      resultsCaption={r && r.notes.length ? r.notes.join(' ') : undefined}
      results={r ? [
        { check: 'Dead-load moment', basis: 'wL²/8 each', demand: `${f2(r.Mdc)} + ${f2(r.Mdw)} kN·m`, status: 'info' as const },
        { check: 'Dead-load shear', basis: 'wL/2 each', demand: `${f2(r.Vdc)} + ${f2(r.Vdw)} kN`, status: 'info' as const },
        { check: 'LL moment', basis: `static ${f3(r.flexure.LLstatic)} · DF ${f2(r.DF)}`, demand: `${f3(r.flexure.LLwithIM)} kN·m with IM`, status: 'info' as const },
        { check: 'LL shear', basis: `static ${f3(r.shear.LLstatic)}`, demand: `${f3(r.shear.LLwithIM)} kN with IM`, status: 'info' as const },
        { check: 'Flexure RF', basis: 'inventory · operating', demand: `${f3(r.flexure.RF_inventory)} · ${f3(r.flexure.RF_operating)}`, limit: '≥ 1.0', status: st(r.flexure.RF_inventory) },
        { check: 'Shear RF', basis: 'inventory · operating', demand: `${f3(r.shear.RF_inventory)} · ${f3(r.shear.RF_operating)}`, limit: '≥ 1.0', status: st(r.shear.RF_inventory) },
      ] : []}
      steps={steps}
      references={[
        { topic: 'Rating equation', basis: 'RF = (φRn − γDC·DC − γDW·DW) / (γLL(1+IM)LL)', source: 'AASHTO MBE §6A.4.2.1' },
        { topic: 'Load factors', basis: 'γDC 1.25, γDW 1.50; γLL 1.75 / 1.35', source: 'AASHTO LRFD Table 3.4.1-2 · MBE Table 6A.4.3.2.1-1' },
        { topic: 'HL-93 and distribution', basis: 'truck / tandem walk; lever rule', source: 'AASHTO LRFD §3.6.1, §4.6.2.2' },
      ]}
    />
  )
}

// ── envelope drawing ─────────────────────────────────────────────────────

function RatingEnvelope({ r }: { r: RatingResult }) {
  // What the rating actually weighs, at INVENTORY: the factored dead-load
  // moment γDC·MDC + γDW·MDW along the span, with γLL·(1+IM)·LL stacked on
  // top, against φMn. Where the stack meets the capacity line, RF = 1. The
  // drawing used to set the live-load envelope alone against φMn, which
  // left out the dead load the rating subtracts first.
  const W = 640, Hh = 300
  const x0 = 56, x1 = W - 40
  const baseY = Hh - 66
  const topY = 34
  const L = r.L
  const wD = GAMMA_DC * (r.Mdc * 8 / (L * L)) + GAMMA_DW * (r.Mdw * 8 / (L * L))    // kN/m, factored
  const dead = (x: number) => (wD * x * (L - x)) / 2
  // envelope SHAPE from the HL-93 walk, MAGNITUDE scaled to the rated LL
  const k = r.hl.moment.value > 0 ? r.flexure.LLwithIM / r.hl.moment.value : 0
  const pts = r.hl.envelope.map((e) => ({ x: e.x, d: dead(e.x), l: GAMMA_LL_INVENTORY * k * e.M }))
  const cap = r.flexure.phiRn
  const top = Math.max(cap, ...pts.map((p) => p.d + p.l), 1)
  const scale = (baseY - topY) / (top * 1.08)
  const px = (x: number) => x0 + ((x1 - x0) * x) / L
  const py = (M: number) => baseY - M * scale
  const deadPoly = `${px(0)},${baseY} ${pts.map((p) => `${px(p.x)},${py(p.d)}`).join(' ')} ${px(L)},${baseY}`
  const stackTop = pts.map((p) => `${px(p.x)},${py(p.d + p.l)}`).join(' ')
  const stackPoly = `${stackTop} ${[...pts].reverse().map((p) => `${px(p.x)},${py(p.d)}`).join(' ')}`
  const gov = r.hl.moment.section
  const govTot = dead(gov) + GAMMA_LL_INVENTORY * k * r.hl.moment.value
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full" role="img" aria-label="Factored moment against capacity">
      <line x1={x0} x2={x1} y1={baseY} y2={baseY} stroke={INK} strokeWidth="1.4" />
      <path d={`M ${x0} ${baseY} l -6 11 h 12 z`} fill={INK} />
      <circle cx={x1} cy={baseY + 5.5} r={5.5} fill="none" stroke={INK} strokeWidth="1.3" />
      <polygon points={deadPoly} fill="rgba(120,113,108,0.28)" stroke="none" />
      <polygon points={stackPoly} fill="rgba(15,76,146,0.22)" stroke="none" />
      <polyline points={stackTop} fill="none" stroke="rgba(15,76,146,0.9)" strokeWidth="1.8" />
      <line x1={x0} x2={x1} y1={py(cap)} y2={py(cap)} stroke="#b45309" strokeWidth="1.6" strokeDasharray="7 4" />
      <text x={x1} y={py(cap) - 6} textAnchor="end" fontSize="10" fill="#b45309" fontFamily="var(--font-mono, monospace)">φMn = {f3(cap)} kN·m</text>
      <line x1={px(gov)} x2={px(gov)} y1={baseY} y2={py(govTot)} stroke={MUTED} strokeWidth="1" strokeDasharray="3 3" />
      <text x={px(gov)} y={py(govTot) - 6} textAnchor="middle" fontSize="10" fill="rgba(15,76,146,0.95)" fontFamily="var(--font-mono, monospace)"
        paintOrder="stroke" stroke="var(--sheet, #fff)" strokeWidth={2.6}>{f3(govTot)} kN·m at {f2(gov)} m</text>
      <g fontSize="9.5" fontFamily="var(--font-mono, monospace)">
        <rect x={x0} y={12} width={10} height={8} fill="rgba(120,113,108,0.28)" />
        <text x={x0 + 14} y={19} fill={INK}>γDC·MDC + γDW·MDW</text>
        <rect x={x0 + 170} y={12} width={10} height={8} fill="rgba(15,76,146,0.22)" />
        <text x={x0 + 184} y={19} fill={INK}>+ γLL·(1+IM)·LL, inventory</text>
      </g>
      <DimBelow xA={x0} xB={x1} featY={baseY + 12} dY={baseY + 34} label={`L = ${f2(L)} m`} />
      <text x={W / 2} y={Hh - 6} textAnchor="middle" fontSize="9" fill={MUTED} fontFamily="var(--font-mono, monospace)">
        sagging drawn up · live-load shape from the HL-93 walk, scaled to the rated LL · where the stack meets φMn, RF = 1
      </text>
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
