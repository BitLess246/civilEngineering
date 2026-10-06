import { useState } from 'react'
import {
  buildVerticalCurve, minCrestLength, minSagLength, minSagComfort,
  type VertCurveResult, type CurveLengthResult,
} from '../engine/geometricDesign'
import { Num } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { VerticalCurveProfile } from '../components/highwaySketches'
import type { SolutionStep } from '../lib/solution'
import { f2, f3 } from '../lib/influenceStyle'

// Vertical curves — parabolic geometry plus the crest/sag sight-distance
// length requirements against the AASHTO eye/object and headlight heights
// (engine/geometricDesign.ts). Grades in %, stations and elevations in m.

type CurveKind = 'crest' | 'sag'

export default function VerticalCurves() {
  const [g1, setG1] = useState(3)
  const [g2, setG2] = useState(-1)
  const [L, setL] = useState(300)
  const [pviSt, setPviSt] = useState(1500)
  const [pviEl, setPviEl] = useState(100)
  const [S, setS] = useState(200)
  const [designV, setDesignV] = useState(100)

  const kind: CurveKind = g1 >= g2 ? 'crest' : 'sag'
  const A = Math.abs(g2 - g1)
  let curve: VertCurveResult | null = null
  let err = ''
  try { curve = buildVerticalCurve({ g1, g2, L, PVIstation: pviSt, PVIelev: pviEl }) } catch (e) { err = (e as Error).message }
  const req: CurveLengthResult | null = (() => {
    try { return A > 0 ? (kind === 'crest' ? minCrestLength({ S, A }) : minSagLength({ S, A })) : null } catch { return null }
  })()
  const comfort: number | null = (() => {
    try { return A > 0 && kind === 'sag' ? minSagComfort(A, designV) : null } catch { return null }
  })()
  const adequate = req ? L >= req.Lmin - 1e-9 : true
  const comfortOk = comfort == null || L >= comfort - 1e-9

  const steps: SolutionStep[] = curve ? [
    {
      title: 'Curve parameters',
      lines: [
        { tex: `A = |g_2 - g_1| = |${f2(g2)} - ${f2(g1)}| = ${f3(A)}\\%, \\qquad K = \\frac{L}{A} = ${curve.K === Infinity ? '\\infty' : f3(curve.K)}\\,\\text{m/\\%}` },
        { tex: `\\text{BVC} = PVI - L/2 = ${f3(pviSt)} - ${f2(L)}/2 = ${f3(curve.BVCstation)}\\ (\\text{elev } ${f3(curve.BVCelev)}){,}\\quad \\text{EVC} = PVI + L/2 = ${f3(pviSt)} + ${f2(L)}/2 = ${f3(curve.EVCstation)}\\ (\\text{elev } ${f3(curve.EVCelev)})` },
      ],
    },
    {
      title: 'Elevation along the curve',
      lines: [
        { tex: `y(x) = y_{BVC} + \\frac{g_1}{100}\\,x + \\frac{g_2 - g_1}{200\\,L}\\,x^2` },
        { tex: `\\text{PVI external offset } e = \\frac{A L}{800} = \\frac{${f3(A)}\\times ${f2(L)}}{800} = ${f3(curve.PVIoffset)}\\text{ m}` },
        { tex: `r = \\frac{g_2 - g_1}{2L} = \\frac{${f2(g2)} - (${f2(g1)})}{2\\times ${f2(L)}} = ${f3(curve.r)}\\,\\%/\\text{m}` },
        { text: `The curve sits ${f3(curve.PVIoffset)} m ${kind === 'crest' ? 'below' : 'above'} the tangent PVI; the grade changes at r per metre of curve.` },
      ],
    },
    ...(curve.turnKind ? [{
      title: `${curve.turnKind === 'high' ? 'High' : 'Low'} point`,
      lines: [
        { tex: `x = \\frac{-g_1 L}{g_2 - g_1} = \\frac{-(${f2(g1)})\\times ${f2(L)}}{${f2(g2)} - (${f2(g1)})} = ${f3(curve.turnX ?? 0)}\\text{ m from BVC} \\;\\Rightarrow\\; y = ${f3(curve.turnElev ?? 0)}\\text{ m at station } ${f3(curve.turnStation ?? 0)}` },
      ],
    }] : []),
    ...(req ? [{
      title: `Sight-distance check — ${kind}, S = ${f2(S)} m`,
      lines: [
        kind === 'crest'
          ? { tex: `L_{\\min} = \\frac{A S^2}{100(\\sqrt{2h_1}+\\sqrt{2h_2})^2} = \\frac{${f3(A)}\\times ${f2(S)}^2}{658} = ${f3(req.Lmin)}\\text{ m} \\;\\; (${req.regime.replace('≤', '\\le').replace('>', '>')})` }
          : { tex: `L_{\\min} = \\frac{A S^2}{200h + 3.5S} = \\frac{${f3(A)}\\times ${f2(S)}^2}{120 + 3.5\\times ${f2(S)}} = ${f3(req.Lmin)}\\text{ m} \\;\\; (${req.regime.replace('≤', '\\le')})` },
        { text: `Metric AASHTO heights: eye 1.08 m and object 0.60 m on a crest; headlight 0.60 m with a 1° upward beam on a sag. Provided L = ${f2(L)} m — ${adequate ? 'ADEQUATE' : 'SHORT, lengthen the curve or flatten the grades'}.` },
        ...(comfort ? [
          { tex: `L \\ge \\frac{A V^2}{395} = \\frac{${f3(A)}\\times ${f2(designV)}^2}{395} = ${f3(comfort)}\\text{ m}` },
          { text: `Comfort criterion for a sag at ${f2(designV)} km/h — ${comfortOk ? 'satisfied' : 'NOT satisfied'}.` },
        ] : []),
      ],
      pass: adequate && comfortOk,
    }] : []),
  ] : [{ title: 'Check the inputs', lines: [{ text: err || 'Give a positive curve length; equal grades need no curve.' }] }]

  return (
    <WorkspacePage title="Vertical Curves" badges={['Highway design', kind === 'crest' ? 'Crest curve' : 'Sag curve']}
      intro="A parabolic curve joins two grades at a constant rate of change of slope. The same geometry answers the drainage question (K), the elevations along the curve, and the sight-distance question (length against S)."
      inputs={<>
        <InputGroup title="Grades and length" hint="The grades decide the type: g₁ ≥ g₂ is a crest, otherwise a sag.">
          <Num label="Entry grade g₁" unit="%" value={g1} onChange={setG1} min={-12} max={12} step="0.5" />
          <Num label="Exit grade g₂" unit="%" value={g2} onChange={setG2} min={-12} max={12} step="0.5" />
          <Num label="Curve length L" unit="m" value={L} onChange={setL} min={10} max={2000} step="10" />
        </InputGroup>
        <InputGroup title="PVI">
          <Num label="PVI station" unit="m" value={pviSt} onChange={setPviSt} min={0} max={100000} step="10" />
          <Num label="PVI elevation" unit="m" value={pviEl} onChange={setPviEl} min={-100} max={3000} step="0.5" />
        </InputGroup>
        <InputGroup title="Sight distance" hint={kind === 'crest' ? 'Crest: eye 1.08 m over a 0.60 m object.' : 'Sag: 0.60 m headlight with a 1° upward beam.'}>
          <Num label="Sight distance S" unit="m" value={S} onChange={setS} min={20} max={600} step="10" />
          {kind === 'sag' && <Num label="Design speed" unit="km/h" value={designV} onChange={setDesignV} min={30} max={130} step="10" />}
        </InputGroup>
      </>}
      checks={curve ? <>
        {req && (
          <CheckCard title="Sight-distance length" basis={`${kind}, S = ${f2(S)} m`} status={adequate ? 'pass' : 'fail'} pillLabel={adequate ? 'ADEQUATE' : 'SHORT'}
            value={f2(req.Lmin)} unit="m required" formula={kind === 'crest' ? 'Lmin = AS²/658' : 'Lmin = AS²/(120 + 3.5S)'}
            ratio={req.Lmin / L} ratioLabel="Lmin ÷ L"
            pairs={[{ label: 'Provided L', value: `${f2(L)} m` }, { label: 'Regime', value: req.regime }]} />
        )}
        {comfort != null && (
          <CheckCard title="Comfort (sag)" basis={`${f2(designV)} km/h`} status={comfortOk ? 'pass' : 'fail'} value={f2(comfort)} unit="m required" formula="L ≥ AV²/395"
            ratio={comfort / L} ratioLabel="required ÷ L" pairs={[{ label: 'Provided L', value: `${f2(L)} m` }, { label: 'A', value: `${f3(A)} %` }]} />
        )}
        <CheckCard title="Curve geometry" basis={`A = ${f3(A)}%`} status="info" value={curve.K === Infinity ? '—' : f2(curve.K)} unit="m per % (K)" formula="K = L / A; e = AL/800"
          pairs={[{ label: 'PVI offset e', value: `${f3(curve.PVIoffset)} m` },
            curve.turnKind ? { label: `${curve.turnKind === 'high' ? 'High' : 'Low'} point`, value: `${f2(curve.turnStation ?? 0)} m, el ${f3(curve.turnElev ?? 0)}` } : { label: 'Turning point', value: 'none on the curve' }]} />
      </> : (
        <CheckCard title="Check the inputs" basis="L > 0 and g₁ ≠ g₂" status="warn" pillLabel="CHECK" value="—" formula={err} />
      )}
      summary={[
        { label: 'Grades g₁ → g₂', value: `${f2(g1)}% → ${f2(g2)}%` }, { label: 'Curve length L', value: `${f2(L)} m` },
        { label: 'PVI', value: `${f2(pviSt)} m, el ${f3(pviEl)} m` }, { label: 'Sight distance S', value: `${f2(S)} m` },
      ]}
      drawing={curve ? { title: 'Profile', node: <div data-pdf-drawing><VerticalCurveProfile curve={curve} g1={g1} g2={g2} L={L} pviSt={pviSt} pviEl={pviEl} /></div> } : undefined}
      results={curve ? [
        { check: 'BVC', basis: 'PVI − L/2', demand: `${f2(curve.BVCstation)} m, el ${f3(curve.BVCelev)}`, status: 'info' },
        { check: 'EVC', basis: 'PVI + L/2', demand: `${f2(curve.EVCstation)} m, el ${f3(curve.EVCelev)}`, status: 'info' },
        { check: 'PVI external offset', basis: 'AL/800', demand: `${f3(curve.PVIoffset)} m`, status: 'info' },
        ...(curve.turnKind ? [{ check: `${curve.turnKind === 'high' ? 'High' : 'Low'} point`, basis: 'x = −g₁L/(g₂ − g₁)', demand: `${f2(curve.turnStation ?? 0)} m, el ${f3(curve.turnElev ?? 0)}`, status: 'info' as const }] : []),
        ...(req ? [{ check: 'Length for sight distance', basis: kind === 'crest' ? 'AS²/658' : 'AS²/(120 + 3.5S)', demand: `${f2(L)} m`, limit: `≥ ${f2(req.Lmin)} m`, ratio: req.Lmin / L, status: adequate ? 'pass' as const : 'fail' as const }] : []),
        ...(comfort != null ? [{ check: 'Comfort length (sag)', basis: 'AV²/395', demand: `${f2(L)} m`, limit: `≥ ${f2(comfort)} m`, ratio: comfort / L, status: comfortOk ? 'pass' as const : 'fail' as const }] : []),
      ] : [{ check: 'Curve', basis: err, demand: '—', status: 'warn' }]}
      steps={steps}
      references={[
        { topic: 'Parabolic curve', basis: 'y = y_BVC + g₁x/100 + (g₂ − g₁)x²/200L; e = AL/800; K = L/A', source: 'AASHTO Green Book §3.4.6' },
        { topic: 'Crest length', basis: 'S ≤ L: L = AS²/658; S > L: L = 2S − 658/A (h₁ = 1.08 m, h₂ = 0.60 m)', source: 'AASHTO Green Book §3.4.6.2' },
        { topic: 'Sag length', basis: 'S ≤ L: L = AS²/(120 + 3.5S); S > L: L = 2S − (120 + 3.5S)/A', source: 'AASHTO Green Book §3.4.6.3' },
        { topic: 'Comfort', basis: 'L ≥ AV²/395', source: 'AASHTO Green Book §3.4.6.3' },
      ]}
    />
  )
}
