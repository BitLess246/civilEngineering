import { useState } from 'react'
import 'katex/dist/katex.min.css'
import {
  esals, requiredSN, layerSN, checkLayers, TYPICAL_A,
  type EsalsResult, type SnResult, type LayerRow,
} from '../engine/pavement'
import { Card, Num, Pick, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, MUTED, f2, f3 } from '../lib/influenceStyle'

// Flexible Pavement — AASHTO 1993: traffic as design ESALs, the required
// structural number from the design equation, and the layer-thickness
// check that closes SN = a1·D1 + a2·D2·m2 + a3·D3·m3.

interface EsalOut { res: EsalsResult | null }
interface SnOut { res: SnResult | null }
interface LayerOut { sn: number; ok: boolean; shortfall: number; rows: { name: string; contribution: number; m: number }[] | null }

const LAYER_PRESETS: [string, string][] = [
  ['typical', 'Typical: AC · crushed stone · granular subbase'],
  ['stabilized', 'Stabilized base (a2 = 0.20/in) · subbase 0.11/in'],
]

export default function Pavement() {
  const [preset, setPreset] = useState('typical')
  // — traffic —
  const [adt, setAdt] = useState(3000)
  const [truckPct, setTruckPct] = useState(15)
  const [truckFactor, setTruckFactor] = useState(1.2)
  const [directional, setDirectional] = useState(0.6)
  const [laneFactor, setLaneFactor] = useState(0.9)
  const [growthPct, setGrowthPct] = useState(4)
  const [years, setYears] = useState(20)
  const [useTraffic, setUseTraffic] = useState<'calc' | 'direct'>('calc')
  const [W18direct, setW18direct] = useState(5e6)
  // — design —
  const [reliability, setReliability] = useState(90)
  const [S0, setS0] = useState(0.45)
  const [pt, setPt] = useState(2.2)
  const [MR, setMR] = useState(50) // MPa
  // — layers —
  const [a1, setA1] = useState(TYPICAL_A.asphalt)
  const [D1, setD1] = useState(100)
  const [a2, setA2] = useState(TYPICAL_A.base)
  const [D2, setD2] = useState(200)
  const [m2, setM2] = useState(1.0)
  const [a3, setA3] = useState(TYPICAL_A.subbase)
  const [D3, setD3] = useState(300)
  const [m3, setM3] = useState(1.0)

  const es: EsalOut = (() => {
    try {
      return { res: esals({ adt, truckPct, truckFactor, directional, laneFactor, growthPct, years }) }
    } catch { return { res: null } }
  })()
  const W18 = useTraffic === 'calc' ? (es.res?.W18 ?? NaN) : W18direct
  const sn: SnOut = (() => {
    try {
      return { res: requiredSN({ W18, reliability, S0, pt, MR_MPa: MR }) }
    } catch { return { res: null } }
  })()
  const layers: LayerOut = (() => {
    try {
      const rowsIn: LayerRow[] = [
        { name: 'Asphalt', a: a1, D: D1 },
        { name: 'Base', a: a2, D: D2, m: m2 },
        { name: 'Subbase', a: a3, D: D3, m: m3 },
      ]
      const r = layerSN(rowsIn)
      const chk = checkLayers(sn.res?.SN ?? NaN, r.SNprovided)
      return { sn: r.SNprovided, ok: chk.ok, shortfall: chk.shortfall, rows: r.rows }
    } catch { return { sn: NaN, ok: false, shortfall: NaN, rows: null } }
  })()

  const applyPreset = (p: string) => {
    setPreset(p)
    if (p === 'typical') { setA1(TYPICAL_A.asphalt); setA2(TYPICAL_A.base); setA3(TYPICAL_A.subbase) }
    else { setA1(TYPICAL_A.asphalt); setA2(0.2 / 25.4); setA3(TYPICAL_A.subbase) }
  }

  const dims = [
    { a: a1, D: D1, m: 1 },
    { a: a2, D: D2, m: m2 },
    { a: a3, D: D3, m: m3 },
  ]
  const steps: SolutionStep[] = sn.res && es.res && useTraffic === 'calc' ? [
    {
      title: 'Traffic → design ESALs',
      lines: [
        { tex: 'W_{18} = ADT \\cdot T\\% \\cdot TF \\cdot D \\cdot L \\cdot 365 \\cdot G \\quad\\quad G = \\frac{(1+r)^n - 1}{r}' },
        { tex: `W_{18} = ${adt} \\times ${f2(truckPct / 100)} \\times ${f2(truckFactor)} \\times ${f2(directional)} \\times ${f2(laneFactor)} \\times 365 \\times ${f2(es.res.growthFactor)} = ${(es.res.W18 / 1e6).toFixed(3)}\\,10^{6}` },
        { text: `Daily trucks ${f3(es.res.dailyTrucks)} carry ${f2(truckFactor)} ESALs each on the design lane (${(directional * 100).toFixed(0)} % directional, ${(laneFactor * 100).toFixed(0)} % lane factor), grown at ${f2(growthPct)} %/yr for ${years} years. First year: ${f3(es.res.firstYear)} ESALs.` },
      ],
    },
    ...snSteps(sn, reliability, S0, pt, layers, W18, dims),
  ] : sn.res ? snSteps(sn, reliability, S0, pt, layers, W18, dims) : []

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
      <ReportControls title="Flexible Pavement Report" badges={['AASHTO 1993']} />
      <p className="mt-2 max-w-3xl text-sm text-muted">
        The AASHTO Guide for Design of Pavement Structures (1993) flexible workflow:
        forecast the design-lane ESALs from AADT, truck percentage and truck factor,
        solve the required structural number SN from the design equation, then close
        the layer equation a1·D1 + a2·D2·m2 + a3·D3·m3 against it.
      </p>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="Traffic (design ESALs)">
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="button"
                onClick={() => { setUseTraffic('calc'); setAdt(3000); setTruckPct(15); setTruckFactor(1.2); setDirectional(0.6); setLaneFactor(0.9); setGrowthPct(4); setYears(20); setMR(50); setReliability(90); setPt(2.2) }}
                className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                Load the sample — 3 000 AADT · 15 % trucks · 4 % growth · 20 yr
              </button>
            </div>
            <Pick label="Design ESALs" value={useTraffic} onChange={(v) => setUseTraffic(v as 'calc' | 'direct')}
              options={[['calc', 'Forecast from traffic'], ['direct', 'Enter W18 directly']]} />
            {useTraffic === 'calc' ? (
              <>
                <Num label="Two-way AADT" unit="veh/day" value={adt} onChange={setAdt} min={50} max={200000} step="50" />
                <Num label="Trucks T" unit="%" value={truckPct} onChange={setTruckPct} min={0} max={100} step="0.5" />
                <Num label="Truck factor TF" unit="ESAL/truck" value={truckFactor} onChange={setTruckFactor} min={0.05} max={10} step="0.05" />
                <Num label="Directional split D" value={directional} onChange={setDirectional} min={0.1} max={0.9} step="0.05" />
                <Num label="Design-lane factor L" value={laneFactor} onChange={setLaneFactor} min={0.5} max={1.0} step="0.05" />
                <Num label="Growth r" unit="%/yr" value={growthPct} onChange={setGrowthPct} min={0} max={15} step="0.5" />
                <Num label="Design period" unit="yr" value={years} onChange={setYears} min={1} max={50} step="1" />
              </>
            ) : (
              <Num label="Design ESALs W18" value={W18direct} onChange={setW18direct} min={1000} max={1e9} step="100000" />
            )}
          </Card>

          <Card title="Performance & subgrade">
            <Num label="Reliability R" unit="%" value={reliability} onChange={setReliability} min={50} max={99.99} step="1" />
            <Num label="Overall std dev S0" value={S0} onChange={setS0} min={0.3} max={0.55} step="0.01" />
            <Num label="Terminal serviceability pt" value={pt} onChange={setPt} min={1.5} max={3.0} step="0.1" />
            <Num label="Subgrade MR" unit="MPa" value={MR} onChange={setMR} min={10} max={300} step="5" />
          </Card>

          <Card title="Layer equation (SN check)">
            <Pick label="Coefficient preset" value={preset} onChange={applyPreset} options={LAYER_PRESETS} />
            <Num label="a1 (asphalt, per mm)" value={a1} onChange={setA1} min={0.001} max={0.05} step="0.0005" />
            <Num label="D1 asphalt" unit="mm" value={D1} onChange={setD1} min={25} max={400} step="5" />
            <Num label="a2 (base, per mm)" value={a2} onChange={setA2} min={0.001} max={0.03} step="0.0005" />
            <Num label="D2 base" unit="mm" value={D2} onChange={setD2} min={0} max={600} step="10" />
            <Num label="m2 drainage (base)" value={m2} onChange={setM2} min={0.8} max={1.5} step="0.05" />
            <Num label="a3 (subbase, per mm)" value={a3} onChange={setA3} min={0.001} max={0.02} step="0.0005" />
            <Num label="D3 subbase" unit="mm" value={D3} onChange={setD3} min={0} max={900} step="10" />
            <Num label="m3 drainage (subbase)" value={m3} onChange={setM3} min={0.8} max={1.5} step="0.05" />
          </Card>
        </div>

        <div className="space-y-5">
          {es.res && useTraffic === 'calc' && (
            <ResultCard title="Design ESALs">
              <Row label="W18 (design lane)" value={`${(es.res.W18 / 1e6).toFixed(3)} × 10⁶`}
                sub={`${f3(es.res.W18)} ESALs over ${years} years`} />
              <Row label="Growth factor G" value={f3(es.res.growthFactor)} sub={`uniform ${f2(growthPct)} %/yr`} />
              <Row label="First-year ESALs" value={f3(es.res.firstYear)} sub={`${f3(es.res.dailyTrucks)} trucks/day × TF`} />
            </ResultCard>
          )}

          {sn.res ? (
            <>
              <ResultCard title="Required structural number">
                <Row label="SN required" value={f2(sn.res.SN)}
                  sub={`W18 = ${useTraffic === 'calc' ? (es.res ? f3(es.res.W18) : '—') : f3(W18direct)} · R = ${f2(reliability)} % · S0 = ${f2(S0)}`} />
                <Row label="Standard normal deviate ZR" value={f3(sn.res.ZR)} sub="exact inverse normal CDF" />
                <Row label="ΔPSI" value={f2(sn.res.dPSI)} sub={`4.2 → ${f2(pt)} (flexible)`} />
                <Row label="Subgrade MR" value={`${f3(sn.res.MRpsi)} psi`} sub={`${f2(MR)} MPa`} />
              </ResultCard>

              <ResultCard title="Layer check">
                <Row label="SN provided" value={f2(layers.sn)}
                  sub={Number.isFinite(layers.sn) ? 'a1·D1 + a2·D2·m2 + a3·D3·m3' : ''} />
                <Row label="Verdict" value={Number.isFinite(layers.sn) ? (layers.ok ? 'Section adequate' : `Short by ${f2(layers.shortfall)}`) : '—'}
                  sub={Number.isFinite(layers.sn) ? (layers.ok ? 'SN provided ≥ SN required' : 'thicken a layer or raise a coefficient') : 'enter the layers above'} />
              </ResultCard>

              <DrawingCard title="Pavement cross-section" meta="thickness to scale · SN contributions labelled">
                <DrawingFrame label="Flexible pavement section">
                  <PavementSection rows={(layers.rows ?? []).map((r, i) => ({ ...r, D: [D1, D2, D3][i], m: r.m }))} />
                </DrawingFrame>
              </DrawingCard>

              <WorkedSolution steps={steps} title="AASHTO 1993 — step by step" />
            </>
          ) : (
            <ResultCard title="Check the inputs">
              <p className="text-sm text-fail">
                Give a positive W18 (from traffic or directly), a subgrade resilient modulus,
                and keep ΔPSI positive (pt below 4.2).
              </p>
            </ResultCard>
          )}
        </div>
      </div>
    </div>
  )
}

function snSteps(
  sn: SnOut, reliability: number, S0: number, pt: number,
  layers: LayerOut, W18: number, dims: { a: number; D: number; m: number }[],
): SolutionStep[] {
  if (!sn.res) return []
  return [
    {
      title: 'The 1993 flexible design equation',
      lines: [
        { tex: '\\log_{10}W_{18} = Z_R S_0 + 9.36\\log_{10}(SN+1) - 0.20 + \\frac{\\log_{10}\\left(\\frac{\\Delta PSI}{4.2-1.5}\\right)}{0.40+\\frac{1094}{(SN+1)^{5.19}}} + 2.32\\log_{10}MR - 8.07' },
        { tex: `\\log_{10}W_{18} = \\log_{10}(${f3(W18)}) = ${f3(sn.res.logW18)}` },
        { text: `ZR = ${f3(sn.res.ZR)} from R = ${f2(reliability)} %, S0 = ${f2(S0)} (flexible 0.40–0.50), ΔPSI = 4.2 − ${f2(pt)} = ${f2(sn.res.dPSI)}, MR = ${f3(sn.res.MRpsi)} psi. The RHS is strictly increasing in SN, so the required SN comes from a bracketed bisection on [0.3, 20].` },
        { tex: `SN_{req} = ${f2(sn.res.SN)}` },
      ],
    },
    {
      title: 'Layer equation',
      lines: [
        { tex: 'SN = a_1D_1 + a_2D_2m_2 + a_3D_3m_3' },
        ...(layers.rows ?? []).map((r, k) => ({ text: `${r.name}: ${f3(dims[k]?.a ?? 0)}×${f2(dims[k]?.D ?? 0)}${(dims[k]?.m ?? 1) !== 1 ? `×${f2(dims[k]?.m ?? 1)}` : ''} = ${f3(r.contribution)} (drainage m = ${f2(r.m)})` })),
        { tex: `SN_{prov} = ${f2(layers.sn)} \\;\\ge\\; SN_{req} = ${f2(sn.res.SN)} \\;\\; ${layers.ok ? '\\checkmark' : '\\times'}` },
        ...(!layers.ok && Number.isFinite(layers.shortfall) ? [{ text: `Short by ${f3(layers.shortfall)} — thicken the base or subbase, or improve the drainage coefficients.` }] : []),
      ],
    },
  ]
}

// ── pavement section drawing ─────────────────────────────────────────────

function PavementSection({ rows }: { rows: { name: string; contribution: number; D: number }[] }) {
  const W = 640, Hh = 260
  const x0 = 130, x1 = W - 70
  const surfaceY = 64
  const pixPerMm = 0.32
  const fills = ['rgba(31,41,55,0.75)', 'rgba(146,120,80,0.45)', 'rgba(180,170,150,0.4)']
  const heights = rows.map((r) => Math.max(10, r.D * pixPerMm))
  const bands = rows.map((r, i) => ({
    y: surfaceY + heights.slice(0, i).reduce((s, h) => s + h, 0),
    h: heights[i],
    fill: fills[i % fills.length],
    r,
  }))
  const totalPix = heights.reduce((s, h) => s + h, 0)
  const scale = totalPix > Hh - 110 ? (Hh - 110) / totalPix : 1

  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full" role="img" aria-label="Pavement section">
      <rect x={x0} y={surfaceY - 14} width={x1 - x0} height={14} fill="rgba(120,113,108,0.25)" stroke={INK} strokeWidth="1" />
      <text x={x1 - 8} y={surfaceY - 3} textAnchor="end" fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">subgrade · MR</text>
      {bands.map((b) => {
        const h = b.h * scale
        const yy = surfaceY + (b.y - surfaceY) * scale
        return (
          <g key={b.r.name}>
            <rect x={x0} y={yy} width={x1 - x0} height={h} fill={b.fill} stroke={INK} strokeWidth="1.2" />
            <text x={x0 + 12} y={yy + h / 2 + 4} fontSize="11" fill={INK} fontFamily="var(--font-mono, monospace)">
              {b.r.name} {Math.round(b.r.D)} mm
            </text>
            <text x={x1 - 12} y={yy + h / 2 + 4} textAnchor="end" fontSize="11" fill={INK} fontFamily="var(--font-mono, monospace)">
              a·D = {f2(b.r.contribution)}
            </text>
          </g>
        )
      })}
      {/* SN bracket */}
      <line x1={x0 - 18} x2={x0 - 18} y1={surfaceY} y2={surfaceY + totalPix * scale} stroke={INK} strokeWidth="1" />
      <text x={x0 - 26} y={surfaceY + (totalPix * scale) / 2} textAnchor="end" fontSize="11" fill={INK} fontFamily="var(--font-mono, monospace)">
        SN = {f2(bands.reduce((s, b) => s + b.r.contribution, 0))}
      </text>
    </svg>
  )
}
