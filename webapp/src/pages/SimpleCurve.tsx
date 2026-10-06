import { useState } from 'react'
import { solveCurve, type CurveResult } from '../engine/circularCurve'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { DrawingFrame } from '../components/DrawingFrame'
import { CurveFigure } from '../components/surveyingSketches'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// Simple circular curve — R and Δ (plus the PI station) give every classical
// element and the deflection-angle staking table at full-station intervals
// (engine/circularCurve.ts). Lengths and stations in m, angles in degrees.

export default function SimpleCurve() {
  const [R, setR] = useState(400)
  const [delta, setDelta] = useState(30)
  const [pi, setPi] = useState(3000)
  const [interval, setInterval] = useState(20)

  let res: CurveResult | null = null
  let err = ''
  try { res = solveCurve({ R, deltaDeg: delta, piStation: pi, interval }) } catch (e) { err = (e as Error).message }
  const el = res?.el
  const exStake = (res?.stakes[1] ?? res?.stakes[0])!
  const steps: SolutionStep[] = el ? [
    {
      title: 'The classical elements from R and Δ',
      lines: [
        { tex: `T = R\\tan\\tfrac{\\Delta}{2} = ${f3(R)}\\tan\\tfrac{${f2(delta)}^\\circ}{2} = ${f3(el.T)}\\text{ m}` },
        { tex: `L = R\\Delta_{\\text{rad}} = ${f3(R)} \\times ${f3(el.deltaRad)} = ${f3(el.L)}\\text{ m},\\qquad LC = 2R\\sin\\tfrac{\\Delta}{2} = ${f3(el.LC)}\\text{ m}` },
        { tex: `M = R(1-\\cos\\tfrac{\\Delta}{2}) = ${f3(el.M)}\\text{ m},\\qquad E = R(\\sec\\tfrac{\\Delta}{2}-1) = ${f3(el.E)}\\text{ m}` },
        { text: `Degree of curve, arc basis: a ${f2(interval)} m arc subtends D = ${f3(el.D20)}° — equivalently ${f3(el.D100ft)}° per 100 ft arc in US practice.` },
      ],
    },
    {
      title: 'Stationing',
      lines: [
        { tex: `PC = PI - T = ${f3(pi)} - ${f3(el.T)} = ${f3(el.pc)}` },
        { tex: `PT = PC + L = ${f3(el.pc)} + ${f3(el.L)} = ${f3(el.pt)}` },
        { text: 'The first and last stakes are sub-chords: everything between runs at the full staking interval.' },
      ],
    },
    {
      title: 'Deflection-angle staking',
      lines: [
        { tex: `\\delta_i = \\frac{c_i}{2R}\\text{ rad},\\qquad c_i = 2R\\sin\\!\\left(\\frac{\\text{arc}}{2R}\\right)` },
        { tex: `\\text{STA }${f2(exStake.station)}:\\ c = 2\\times${f3(R)}\\sin\\!\\left(\\frac{${f3(exStake.arcFromPc)}}{2\\times${f3(R)}}\\right) = ${f3(exStake.chord)}\\text{ m},\\quad \\delta = \\frac{${f3(exStake.chord)}}{2\\times${f3(R)}} = ${f3(exStake.incDef)}^\\circ\\ (\\text{total }${f3(exStake.totDef)}^\\circ)` },
        { text: `Each chord from the PC deflects by its own incremental angle, and the deflections accumulate — the total at the PT is exactly Δ/2 = ${f3(delta / 2)}°, the field check on the table below.` },
      ],
    },
  ] : [{ title: 'Check the givens', lines: [{ text: err }] }]

  const last = res ? res.stakes[res.stakes.length - 1] : undefined
  const closes = !!el && !!last && Math.abs(last.totDef - delta / 2) < 1e-6

  return (
    <WorkspacePage title="Simple Curve" badges={['Surveying', 'Circular curve']}
      intro="Every element of a simple circular curve from its radius and central angle, and the deflection-angle staking table the crew tapes out from the PC — sub-chords, incremental and total deflections, and the Δ/2 field check."
      inputs={<>
        <InputGroup title="Curve">
          <Num label="Radius R" unit="m" value={R} onChange={setR} min={10} max={20000} step="10" />
          <Num label="Central angle Δ" unit="°" value={delta} onChange={setDelta} min={1} max={179} step="0.5" />
        </InputGroup>
        <InputGroup title="Stationing">
          <Num label="PI station" unit="m" value={pi} onChange={setPi} min={0} max={100000} step="10" />
          <Num label="Staking interval" unit="m" value={interval} onChange={setInterval} min={5} max={50} step="5" />
        </InputGroup>
      </>}
      checks={el && res ? <>
        <CheckCard title="Tangent and arc" basis={`R ${f2(R)} m, Δ ${f2(delta)}°`} status="info" value={f3(el.T)} unit="m tangent" formula="T = R tan(Δ/2); L = RΔ"
          pairs={[{ label: 'Arc length L', value: `${f3(el.L)} m` }, { label: 'Long chord LC', value: `${f3(el.LC)} m` }]} />
        <CheckCard title="Stations" basis={`PI at ${f2(pi)} m`} status="info" value={`${f2(el.pc)} → ${f2(el.pt)}`} unit="m" formula="PC = PI − T; PT = PC + L"
          pairs={[{ label: 'External E', value: `${f3(el.E)} m` }, { label: 'Middle ordinate M', value: `${f3(el.M)} m` }]} />
        <CheckCard title="Deflection check" basis="total at the PT" status={closes ? 'pass' : 'fail'} pillLabel={closes ? 'CLOSES' : 'CHECK'}
          value={`${f3(last!.totDef)}°`} formula="Σδ = Δ/2"
          pairs={[{ label: 'Δ/2', value: `${f3(delta / 2)}°` }, { label: 'Stakes', value: `${res.stakes.length}` }]} />
      </> : (
        <CheckCard title="Check the givens" basis="R > 0, 0° < Δ < 180°" status="warn" pillLabel="CHECK" value="—" formula={err} />
      )}
      summary={[
        { label: 'Radius R', value: `${f2(R)} m` }, { label: 'Central angle Δ', value: `${f2(delta)}°` },
        { label: 'PI station', value: `${f2(pi)} m` }, { label: 'Staking interval', value: `${f2(interval)} m` },
      ]}
      drawing={el && res ? { title: 'Curve layout and staking table', node: <>
        <div data-pdf-drawing className="mx-auto max-w-[680px]">
          <DrawingFrame label="Circular curve layout"><CurveFigure el={el} /></DrawingFrame>
        </div>
        <div className="mt-3 overflow-x-auto rounded-md border border-hairline bg-sheet">
          <table className="w-full min-w-[480px] border-collapse text-[11.5px]">
            <thead><tr className="bg-sheet-2 text-left text-[10.5px] font-bold uppercase tracking-wide text-muted">
              {['Station', 'Arc from PC', 'Chord', 'Incremental δ', 'Total deflection'].map((h, k) => (
                <th key={h} className={`px-2.5 py-1.5 ${k ? 'text-right' : ''}`}>{h}</th>
              ))}
            </tr></thead>
            <tbody className="font-mono">
              {res.stakes.map((s, k) => (
                <tr key={k} className={`border-t border-hairline-2 ${k === 0 || k === res!.stakes.length - 1 ? 'bg-brand-tint' : ''}`}>
                  <td className="px-2.5 py-1 font-semibold">{f2(s.station)}</td>
                  <td className="px-2.5 py-1 text-right">{f3(s.arcFromPc)}</td>
                  <td className="px-2.5 py-1 text-right">{f3(s.chord)}</td>
                  <td className="px-2.5 py-1 text-right">{f3(s.incDef)}°</td>
                  <td className="px-2.5 py-1 text-right font-semibold">{f3(s.totDef)}°</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[10.5px] text-faint">Stations and lengths in metres. First sub-chord {f3(res.firstSub)} m, last sub-chord {f3(res.lastSub)} m.</p>
      </> } : undefined}
      results={el && res ? [
        { check: 'Tangent T', basis: 'R tan(Δ/2)', demand: `${f3(el.T)} m`, status: 'info' },
        { check: 'Arc length L', basis: 'RΔ (rad)', demand: `${f3(el.L)} m`, status: 'info' },
        { check: 'Long chord LC', basis: '2R sin(Δ/2)', demand: `${f3(el.LC)} m`, status: 'info' },
        { check: 'External E', basis: 'R(sec(Δ/2) − 1)', demand: `${f3(el.E)} m`, status: 'info' },
        { check: 'Middle ordinate M', basis: 'R(1 − cos(Δ/2))', demand: `${f3(el.M)} m`, status: 'info' },
        { check: 'Degree of curve', basis: `${f2(interval)} m arc`, demand: `${f3(el.D20)}°`, status: 'info' },
        { check: 'Total deflection at PT', basis: 'Σδ = Δ/2', demand: `${f3(last!.totDef)}°`, limit: `${f3(delta / 2)}°`, status: closes ? 'pass' : 'fail' },
      ] : [{ check: 'Curve', basis: err, demand: '—', status: 'warn' }]}
      steps={steps}
      references={[
        { topic: 'Curve elements', basis: 'T = R tan(Δ/2), L = RΔ, LC = 2R sin(Δ/2), E = R(sec(Δ/2) − 1), M = R(1 − cos(Δ/2))', source: 'Route surveying — simple curves' },
        { topic: 'Stationing', basis: 'PC = PI − T; PT = PC + L', source: 'Route surveying — simple curves' },
        { topic: 'Deflection angles', basis: 'δ = c/2R (rad) per chord from the PC; Σδ at the PT = Δ/2', source: 'Route surveying — curve layout' },
      ]}
    />
  )
}
