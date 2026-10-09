import { useState } from 'react'
import { solveRational, type RationalResult, type SubArea } from '../engine/rationalMethod'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { RationalBars } from '../components/waterCharts'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

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
  ] : [{ title: 'Check the inputs', lines: [{ text: 'Coefficients must lie in 0–1 with at least one positive area; Tc inputs must be positive; the IDF needs a > 0.' }] }]

  return (
    <WorkspacePage title="Rational Method" badges={['Hydrology', 'Q = CiA/360']}
      intro="Peak runoff from a small catchment: a composite C over the sub-areas, the time of concentration by Kirpich or FAA, the intensity given or read from an IDF curve, and the peak Q that sizes inlets and culverts."
      inputs={<>
        <InputGroup title="Sub-areas" hint="C between 0 and 1, A in hectares.">
          <div className="col-span-2 space-y-1.5">
            {subs.map((s, i) => (
              <div key={i} className="space-y-1 rounded-md border border-hairline-2 p-2">
                <div className="flex items-center gap-2">
                  <input value={s.name} onChange={(e) => setSub(i, { name: e.target.value })} aria-label={`Sub-area ${i + 1} name`} className="min-w-0 flex-1 text-[13px]" />
                  <button type="button" aria-label={`Remove sub-area ${i + 1}`} onClick={() => delSub(i)} disabled={subs.length <= 1} className="text-muted hover:text-fail disabled:opacity-30">✕</button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <Num label="C" value={sNum(s.c)} onChange={(v) => setSub(i, { c: String(v) })} min={0} max={1} step="0.05" />
                  <Num label="A" unit="ha" value={sNum(s.a)} onChange={(v) => setSub(i, { a: String(v) })} min={0} step="0.1" />
                </div>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={addSub} className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">+ Add sub-area</button>
              <button type="button" onClick={loadSample} className="rounded-md border border-field-line px-2 py-0.5 text-[11px] font-semibold text-brand hover:bg-brand-tint">Sample: 2.5 ha, IDF 760/(Tc + 10)</button>
            </div>
          </div>
        </InputGroup>
        <InputGroup title="Time of concentration">
          <div className="col-span-2">
            <Pick label="Method" value={tcMode} onChange={(v) => setTcMode(v as 'direct' | 'kirpich' | 'faa')}
              options={[['kirpich', 'Kirpich — L^0.77 · S^−0.385'], ['faa', 'FAA — overland flow'], ['direct', 'Given directly']]} />
          </div>
          {tcMode === 'direct'
            ? <Num label="Tc" unit="min" value={tcDirect} onChange={setTcDirect} min={1} max={120} step="1" />
            : <>
                <Num label="Flow length L" unit="m" value={lenM} onChange={setLenM} min={10} max={20000} step="10" />
                <Num label="Slope S" unit={slopeIsPct ? '%' : 'm/m'} value={slope} onChange={setSlope} min={0.01} max={100} step="0.5" />
                <label className="col-span-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={slopeIsPct} onChange={(e) => setSlopeIsPct(e.target.checked)} className="accent-brand" />
                  <span className="text-[12px] font-semibold text-muted">Slope in percent (uncheck for m/m)</span>
                </label>
              </>}
        </InputGroup>
        <InputGroup title="Rainfall intensity">
          <div className="col-span-2">
            <Pick label="Source" value={intensityMode} onChange={(v) => setIntensityMode(v as 'direct' | 'idf')}
              options={[['direct', 'Given directly'], ['idf', 'IDF curve i = a/(Tc + b)^c']]} />
          </div>
          {intensityMode === 'direct'
            ? <Num label="Intensity i" unit="mm/h" value={mmPerHour} onChange={setMmPerHour} min={1} max={500} step="5" />
            : <>
                <Num label="IDF a" value={idfA} onChange={setIdfA} min={1} max={10000} step="10" />
                <Num label="IDF b" value={idfB} onChange={setIdfB} min={0} max={120} step="1" />
                <Num label="IDF c" value={idfC === '' ? 0 : sNum(idfC)} onChange={(v) => setIdfC(v === 0 ? '' : String(v))} step="0.05" hint="0 or blank = 1" />
              </>}
        </InputGroup>
      </>}
      checks={res ? <>
        <CheckCard title="Peak flow" basis={`${f3(res.A)} ha catchment`} status="info" value={f3(res.Q)} unit="m³/s" formula="Q = C·i·A / 360"
          pairs={[{ label: 'In litres', value: `${f2(res.Qls)} L/s` }, { label: 'In cfs', value: f2(res.Qcfs) }]} />
        <CheckCard title="Composite C" basis="area-weighted" status="info" value={f3(res.C)} formula="C = Σ CᵢAᵢ / Σ Aᵢ"
          pairs={[{ label: 'Effective area C·A', value: `${f3(res.C * res.A)} ha` }, { label: 'Sub-areas', value: `${res.subAreas.length}` }]} />
        <CheckCard title="Storm" basis={res.tcMethod === 'direct' ? 'Tc given' : res.tcMethod === 'kirpich' ? 'Kirpich Tc' : 'FAA Tc'} status="info" value={f2(res.i)} unit="mm/h"
          formula={intensityMode === 'idf' ? 'i = a / (Tc + b)^c' : 'given'}
          pairs={[{ label: 'Duration = Tc', value: `${f2(res.tcMin)} min` }, { label: 'Source', value: intensityMode === 'idf' ? 'IDF curve' : 'direct' }]} />
      </> : (
        <CheckCard title="Check the inputs" basis="C in 0–1, positive areas" status="warn" pillLabel="CHECK" value="—" formula="At least one sub-area with a positive area; positive Tc inputs; IDF a > 0." />
      )}
      summary={[
        { label: 'Sub-areas', value: `${subs.length}` }, { label: 'Tc method', value: tcMode },
        ...(tcMode === 'direct' ? [{ label: 'Tc', value: `${f2(tcDirect)} min` }] : [{ label: 'Flow path', value: `${f2(lenM)} m at ${f2(slope)}${slopeIsPct ? ' %' : ' m/m'}` }]),
        { label: 'Intensity', value: intensityMode === 'direct' ? `${f2(mmPerHour)} mm/h` : `IDF ${f2(idfA)}/(Tc + ${f2(idfB)})^${idfC === '' ? 1 : idfC}` },
      ]}
      drawing={res ? { title: 'Area and effective area', node: <div data-pdf-drawing><RationalBars res={res} /></div> } : undefined}
      resultsCaption={res && res.warnings.length ? res.warnings.join(' ') : undefined}
      results={res ? [
        { check: 'Composite C', basis: 'Σ CᵢAᵢ / Σ Aᵢ', demand: f3(res.C), status: 'info' },
        { check: 'Time of concentration', basis: res.tcMethod, demand: `${f2(res.tcMin)} min`, status: 'info' },
        { check: 'Intensity', basis: intensityMode === 'idf' ? 'IDF at Tc' : 'given', demand: `${f2(res.i)} mm/h`, status: 'info' },
        { check: 'Peak flow Q', basis: 'C·i·A/360', demand: `${f3(res.Q)} m³/s`, status: 'info' },
      ] : [{ check: 'Peak flow', basis: 'inputs out of range', demand: '—', status: 'warn' }]}
      steps={steps}
      references={[
        { topic: 'Rational formula', basis: 'Q = C·i·A/360 (Q m³/s, i mm/h, A ha)', source: 'Kuichling (1889); DPWH Design Guidelines' },
        { topic: 'Kirpich', basis: 'Tc = 0.01947 L^0.77 S^−0.385 (min, L in m, S in m/m)', source: 'Kirpich (1940)' },
        { topic: 'FAA', basis: 'Tc = 1.8(1.1 − C)L^0.5 / S^0.333 (L in ft, S in %)', source: 'FAA AC 150/5320-5' },
      ]}
    />
  )
}
