import { useState } from 'react'
// Every page that renders worked-solution math carries its own KaTeX stylesheet
// — it stays out of the pages that never show an equation.
import 'katex/dist/katex.min.css'
import { solveRational, type RationalResult, type SubArea } from '../engine/rationalMethod'
import { Card, Num, Pick, ResultCard, Row } from '../components/qty'
import { DrawingCard } from '../components/calc'
import { DrawingFrame } from '../components/DrawingFrame'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
import type { SolutionStep } from '../lib/solution'
import { INK, MUTED, HAIR, f2, f3 } from '../lib/influenceStyle'

// Rational Method — the peak runoff of a small catchment: composite C from
// sub-areas, time of concentration (direct / Kirpich / FAA), intensity from
// a direct value or an i = a/(Tc+b)^c IDF, and Q = C·i·A/360
// (engine/rationalMethod.ts).

interface SubUI {
  name: string
  c: string
  a: string
}

const SAMPLE: SubUI[] = [
  { name: 'Roofs & pavement', c: '0.9', a: '1.0' },
  { name: 'Grass', c: '0.3', a: '1.5' },
]

const sNum = (s: string): number => (parseFloat(s) || 0)

export default function RationalMethod() {
  const [subs, setSubs] = useState<SubUI[]>(SAMPLE)
  const [intensityMode, setIntensityMode] = useState<'direct' | 'idf'>('direct')
  const [mmPerHour, setMmPerHour] = useState(100)
  const [idfA, setIdfA] = useState(760)
  const [idfB, setIdfB] = useState(10)
  const [idfC, setIdfC] = useState('')
  const [tcMode, setTcMode] = useState<'direct' | 'kirpich' | 'faa'>('kirpich')
  const [tcDirect, setTcDirect] = useState(12)
  const [lenM, setLenM] = useState(500)
  const [slope, setSlope] = useState(2)
  const [slopeIsPct, setSlopeIsPct] = useState(true)

  const setSub = (i: number, patch: Partial<SubUI>) =>
    setSubs((ss) => ss.map((s, k) => (k === i ? { ...s, ...patch } : s)))
  const addSub = () => setSubs((ss) => [...ss, { name: `Area ${ss.length + 1}`, c: '', a: '' }])
  const delSub = (i: number) => setSubs((ss) => ss.filter((_, k) => k !== i))
  const loadSample = () => {
    setSubs(SAMPLE.map((s) => ({ ...s })))
    setTcMode('kirpich'); setLenM(500); setSlope(2); setSlopeIsPct(true)
    setIntensityMode('idf'); setIdfA(760); setIdfB(10); setIdfC('')
  }

  const parsed: SubArea[] = subs.map((s, i) => ({
    name: s.name || `Area ${i + 1}`,
    c: sNum(s.c),
    a: sNum(s.a),
  }))

  // FAA takes the slope in percent; Kirpich in m/m — convert per method.
  const tc = tcMode === 'direct'
    ? { mode: 'direct' as const, minutes: tcDirect }
    : tcMode === 'kirpich'
      ? { mode: 'kirpich' as const, lengthM: lenM, slope: slopeIsPct ? slope / 100 : slope }
      : { mode: 'faa' as const, lengthM: lenM, slopePct: slopeIsPct ? slope : slope * 100 }

  const res: RationalResult | null = (() => {
    try {
      return solveRational({
        subAreas: parsed,
        intensity: intensityMode === 'direct'
          ? { mode: 'direct', mmPerHour }
          : { mode: 'idf', a: idfA, b: idfB, c: idfC.trim() === '' ? undefined : sNum(idfC) },
        tc,
      })
    } catch { return null }
  })()

  const steps: SolutionStep[] = res ? [
    {
      title: 'Composite runoff coefficient',
      lines: [
        ...res.subAreas.map((s) => ({ item: `${s.name}: C = ${f3(s.c)}, A = ${f3(s.a)} ha → C·A = ${f3(s.c * s.a)}` })),
        { tex: `C = \\frac{\\sum C_i A_i}{\\sum A_i} = \\frac{${res.subAreas.map((s) => `${f3(s.c)}\\times ${f3(s.a)}`).join(' + ')}}{${res.subAreas.map((s) => `${f3(s.a)}`).join(' + ')}} = \\frac{${f3(res.subAreas.reduce((s, x) => s + x.c * x.a, 0))}}{${f3(res.A)}} = ${f3(res.C)},\\qquad A = ${f3(res.A)}\\text{ ha}` },
        { text: 'The coefficient averages the surface character of the catchment, weighted by area — pavement drags it up, grass holds it down.' },
      ],
    },
    {
      title: `Time of concentration — ${res.tcMethod === 'direct' ? 'given directly' : res.tcMethod === 'kirpich' ? 'Kirpich' : 'FAA'}`,
      lines: res.tcMethod === 'kirpich'
        ? [
            { tex: `T_c = 0.01947\\,L^{0.77}S^{-0.385} = 0.01947\\times ${f3(lenM)}^{0.77}\\times ${f3(tc.mode === 'kirpich' ? tc.slope : 0)}^{-0.385} = ${f3(res.tcMin)}\\text{ min}` },
            { text: 'L is the hydraulically longest path (m) and S its slope in m/m. The whole catchment is assumed to contribute at the peak once the farthest drop has reached the outlet.' },
          ]
        : res.tcMethod === 'faa'
          ? [
              { tex: `T_c = \\frac{1.8\\,(1.1-C)\\,L_{ft}^{0.5}}{S_{\\%}^{0.333}} = \\frac{1.8\\times (1.1 - ${f3(res.C)})\\times ${f2(lenM * 3.28084)}^{0.5}}{${f2(slopeIsPct ? slope : slope * 100)}^{0.333}} = ${f3(res.tcMin)}\\text{ min}` },
              { text: 'The FAA overland-flow formula carries the rational C inside it — the same coefficient that feeds Q — with L in feet and the slope in percent.' },
            ]
          : [{ text: `Tc given directly as ${f3(res.tcMin)} min.` }],
    },
    {
      title: intensityMode === 'idf' ? 'Intensity from the IDF curve' : 'Design intensity',
      lines: intensityMode === 'idf'
        ? [
            { tex: `i = \\frac{a}{(T_c + b)^c} = \\frac{${f3(idfA)}}{(${f3(res.tcMin)} + ${f3(idfB)})^{${idfC.trim() === '' ? '1' : f3(sNum(idfC))}}} = ${f3(res.i)}\\text{ mm/h}` },
            { text: 'The classic textbook IDF form. A storm of duration Tc and some return period is read off the local curves — in the board room the coefficients come printed in the problem.' },
          ]
        : [
            { tex: `i = i_{given} = ${f3(mmPerHour)}\\text{ mm/h}` },
            { text: 'The intensity is read straight from the gauge or the problem statement — no IDF curve is fitted, so the given value is the design value.' },
          ],
    },
    {
      title: 'Peak flow',
      lines: [
        { tex: `Q = \\frac{C\\,i\\,A}{360} = \\frac{${f3(res.C)}\\times ${f3(res.i)}\\times ${f3(res.A)}}{360} = ${f3(res.Q)}\\text{ m}^3\\text{/s}` },
        { text: `${f3(res.Qls)} L/s = ${f3(res.Qcfs)} cfs. The 360 is the unit conversion: 1 mm/h over 1 ha is 10 m³/h = 1/360 m³/s.` },
        ...res.warnings.map((w) => ({ item: w })),
      ],
    },
  ] : []

  return (
    <div>
      <div className="mx-auto max-w-[1500px] px-5 py-5 sm:px-7">
        <ReportControls title="Rational Method Report" badges={['Q = CiA']} />
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Peak runoff for a small catchment: composite C across sub-areas, time of concentration by
          Kirpich or FAA, intensity straight or from an IDF curve, and the peak Q — the drainage
          inlet and culvert sizing flow.
        </p>

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          {/* ── inputs ── */}
          <div className="space-y-5">
            <Card title="Catchment sub-areas" hint="C in 0–1, A in hectares">
              <div className="sm:col-span-2 lg:col-span-3">
                <button type="button" onClick={loadSample}
                  className="rounded-md border border-field-line px-2.5 py-1 text-xs font-semibold text-brand hover:bg-brand-tint">
                  Load the sample — 2.5 ha mixed catchment, IDF i = 760/(Tc + 10)
                </button>
              </div>
              <div className="sm:col-span-2 lg:col-span-3 space-y-1.5">
                {subs.map((s, i) => (
                  <div key={i} className="grid grid-cols-[1fr_3rem_3rem_1.4rem] items-end gap-1.5">
                    <label className="flex flex-col text-sm">
                      <span className="mb-1 text-[11.5px] font-semibold text-muted">Sub-area {i + 1}</span>
                      <input value={s.name} onChange={(e) => setSub(i, { name: e.target.value })} className="text-[13px]" />
                    </label>
                    <Num label="C" value={sNum(s.c)} onChange={(v) => setSub(i, { c: String(v) })} step="0.05" />
                    <Num label="A" unit="ha" value={sNum(s.a)} onChange={(v) => setSub(i, { a: String(v) })} step="0.1" />
                    <button type="button" onClick={() => delSub(i)} disabled={subs.length <= 1}
                      className="mb-1.5 text-muted hover:text-fail disabled:opacity-30">✕</button>
                  </div>
                ))}
                <button type="button" onClick={addSub}
                  className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">+ Add sub-area</button>
              </div>
            </Card>

            <Card title="Time of concentration">
              <Pick label="Method" value={tcMode} onChange={(v) => setTcMode(v as 'direct' | 'kirpich' | 'faa')}
                options={[['kirpich', 'Kirpich — L^0.77 · S^−0.385'], ['faa', 'FAA — overland flow'], ['direct', 'Given directly']]} />
              {tcMode === 'direct'
                ? <Num label="Tc" unit="min" value={tcDirect} onChange={setTcDirect} min={1} max={120} step="1" />
                : (
                  <>
                    <Num label="Flow length L" unit="m" value={lenM} onChange={setLenM} min={10} max={20000} step="10" />
                    <Num label={slopeIsPct ? 'Slope S' : 'Slope S (m/m)'} unit={slopeIsPct ? '%' : 'm/m'} value={slope} onChange={setSlope} min={0.01} max={100} step="0.5" />
                    <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-3">
                      <input type="checkbox" checked={slopeIsPct} onChange={(e) => setSlopeIsPct(e.target.checked)} className="accent-brand" />
                      <span className="text-[12.5px] font-semibold text-muted">Slope entered in percent (uncheck for m/m)</span>
                    </label>
                  </>
                )}
            </Card>

            <Card title="Rainfall intensity">
              <Pick label="Source" value={intensityMode} onChange={(v) => setIntensityMode(v as 'direct' | 'idf')}
                options={[['direct', 'Given directly'], ['idf', 'IDF curve i = a/(Tc + b)^c']]} />
              {intensityMode === 'direct'
                ? <Num label="Intensity i" unit="mm/h" value={mmPerHour} onChange={setMmPerHour} min={1} max={500} step="5" />
                : (
                  <>
                    <Num label="IDF a" value={idfA} onChange={setIdfA} min={1} max={10000} step="10" />
                    <Num label="IDF b" value={idfB} onChange={setIdfB} min={0} max={120} step="1" />
                    <Num label="IDF c exponent (1 if blank)" value={idfC === '' ? 0 : sNum(idfC)} onChange={(v) => setIdfC(v === 0 ? '' : String(v))} step="0.05" />
                  </>
                )}
            </Card>
          </div>

          {/* ── results ── */}
          <div className="space-y-5">
            {res ? (
              <>
                <ResultCard title="Peak runoff">
                  <Row label="Composite C" value={f3(res.C)} sub={`${f3(res.A)} ha total`} />
                  <Row label="Tc used" value={`${f3(res.tcMin)} min`} sub={res.tcMethod === 'direct' ? 'given directly' : res.tcMethod === 'kirpich' ? 'Kirpich' : 'FAA overland flow'} />
                  <Row label={`Intensity i`} value={`${f3(res.i)} mm/h`} sub={intensityMode === 'idf' ? 'from the IDF curve' : 'given directly'} />
                  <Row label="Peak flow Q" value={`${f3(res.Q)} m³/s`} sub={`${f3(res.Qls)} L/s · ${f3(res.Qcfs)} cfs`} />
                </ResultCard>

                {res.warnings.length > 0 && (
                  <ResultCard title="Notes">
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                      {res.warnings.map((w) => <li key={w}>{w}</li>)}
                    </ul>
                  </ResultCard>
                )}

                <DrawingCard title="Catchment schematic" meta="sub-areas to scale · the outlet sits where Tc ends">
                  <DrawingFrame label="Catchment schematic">
                    <CatchmentSketch res={res} />
                  </DrawingFrame>
                </DrawingCard>
              </>
            ) : (
              <ResultCard title="Check the inputs">
                <p className="text-sm text-fail">
                  Sub-area coefficients must sit in 0–1 with at least one positive area; Tc inputs
                  must be positive; the IDF needs a &gt; 0.
                </p>
              </ResultCard>
            )}
          </div>
        </div>

        {res && (
          <div className="mt-6">
            <WorkedSolution steps={steps} title="Rational Method — step-by-step" />
          </div>
        )}
      </div>
    </div>
  )
}

// ── catchment sketch ──────────────────────────────────────────────────────

function CatchmentSketch({ res }: { res: RationalResult }) {
  const W = 640
  const H = 360
  const pad = 40

  // sub-area rectangles proportional to their share of A, feeding a channel
  // to the outlet square. Pure schematic — the proportions carry the message.
  const list = res.subAreas
  const totalA = res.A
  const chartW = W - 2 * pad - 90
  const chartH = H - 2 * pad - 46

  const rectW = (s: { a: number }) => Math.max((s.a / totalA) * chartW, 26)
  const rects = list.map((s, i) => {
    // x-offset = sum of the widths (plus gaps) of everything before this one
    const offset = list.slice(0, i).reduce((sum, q) => sum + rectW(q) + 10, 0)
    const w = rectW(s)
    const h = chartH * (0.42 + 0.5 * s.c)
    return { x: pad + offset, y: pad + chartH + 24 - h, w, h, c: s.c, a: s.a, name: s.name }
  })

  const outletX = W - pad - 52
  const outletY = pad + chartH + 24 - 30

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Catchment schematic">
      {/* ground line */}
      <line x1={pad} x2={W - pad} y1={pad + chartH + 24} y2={pad + chartH + 24} stroke={INK} strokeWidth="1.6" />

      {rects.map((r, i) => {
        const tint = `rgba(15,76,146,${0.10 + 0.5 * r.c})`
        return (
          <g key={i}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={tint} stroke={INK} strokeWidth="1.2" />
            <text x={r.x + r.w / 2} y={r.y - 6} textAnchor="middle" fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
              C={f2(r.c)} · {f2(r.a)} ha
            </text>
            {/* flow arrow to the outlet */}
            <line x1={r.x + r.w} x2={outletX} y1={r.y + r.h / 2} y2={outletY + 15} stroke={HAIR} strokeWidth="1" strokeDasharray="3 3" />
          </g>
        )
      })}

      {/* outlet */}
      <rect x={outletX} y={outletY} width="52" height="34" fill="rgba(15,76,146,0.9)" />
      <text x={outletX + 26} y={outletY + 15} textAnchor="middle" fontSize="9.5" fill="#ffffff" fontFamily="var(--font-mono, monospace)">outlet</text>
      <text x={outletX + 26} y={outletY + 27} textAnchor="middle" fontSize="9" fill="#dce8f5" fontFamily="var(--font-mono, monospace)">
        Q = {f2(res.Q)} m³/s
      </text>

      <text x={pad} y={pad + 6} fontSize="10.5" fill={INK} fontFamily="var(--font-mono, monospace)">
        {list.length} sub-area{list.length === 1 ? '' : 's'} · C = {f3(res.C)} · A = {f3(res.A)} ha · Tc = {f3(res.tcMin)} min · i = {f3(res.i)} mm/h
      </text>
      <text x={pad} y={H - 10} fontSize="10" fill={MUTED} fontFamily="var(--font-mono, monospace)">
        Q = C·i·A/360 — rectangle height tracks its coefficient; area tracks its share of A
      </text>
    </svg>
  )
}
