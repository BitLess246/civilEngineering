import { useMemo, useState } from 'react'
import { designTorsion, type TorsionInput } from '../engine/torsionDesign'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { buildTorsionSolution } from '../lib/torsionSolution'
import { TorsionSection } from '../components/TorsionSection'
import { f1, f2, f3 } from '../lib/format'

interface FormState extends Omit<TorsionInput, 'legs' | 'lambda'> {
  legs: 2 | 4
  lambda: 1 | 0.75
}

const DEFAULTS: FormState = {
  b: 400, h: 600, cover: 40, stirrupDia: 12, barDia: 20,
  fc: 28, fy: 415, fyt: 415,
  Tu: 80, Vu: 200,
  legs: 2, lambda: 1,
}

const REQUIRED: (keyof FormState)[] = [
  'b', 'h', 'cover', 'stirrupDia', 'barDia', 'fc', 'fy', 'fyt', 'Tu', 'Vu',
]

export default function TorsionDesign() {
  const [f, setF] = useState<FormState>(DEFAULTS)
  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) =>
    setF((s) => ({ ...s, [k]: v }))

  const allFinite = REQUIRED.every((k) => Number.isFinite(f[k] as number))

  // `f` is a fresh object every render, so memoize on its VALUE identity
  const fKey = JSON.stringify(f)
  const r = useMemo(
    () => (allFinite ? designTorsion(f) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fKey, allFinite],
  )

  const solution = r ? buildTorsionSolution(f, r) : null

  const report = r ? {
    docCode: 'S-TO',
    ok: r.interactionOK,
    governing: r.torsionNeeded
      ? `Section interaction ${(r.lhs / r.rhs).toFixed(2)} · torsion required (Tu ≥ Tu,th)`
      : `Torsion negligible — Tu < Tu,th = ${f1(r.Tu_th)} kN·m`,
    stats: [
      { label: 'Stirrups (Av+2At)/s', value: f3(r.AvPlus2At), unit: 'mm²/mm' },
      { label: 'Spacing adopted', value: f1(r.sAdopt), unit: 'mm' },
      { label: 'Long. steel Al', value: f1(r.Al_design), unit: 'mm²' },
    ],
    checks: [
      // §22.7.7.1 is a stress-interaction limit, so the "ratio" is lhs/rhs.
      { name: 'Section interaction √[(Vu/bwd)²+(Tuph/1.7Aoh²)²] ≤ φ(Vc/bwd+⅔√f′c)',
        ratio: r.rhs > 0 ? r.lhs / r.rhs : 0, ok: r.interactionOK },
    ],
    data: [
      ['Section b × h', `${f.b} × ${f.h} mm`],
      ['Clear cover', `${f.cover} mm`],
      ['Stirrup ⌀ / bar ⌀', `${f.stirrupDia} / ${f.barDia} mm`],
      ["Concrete f'c", `${f.fc} MPa`],
      ['Steel fy / fyt', `${f.fy} / ${f.fyt} MPa`],
      ['Torsion Tu', `${f1(f.Tu)} kN·m`],
      ['Shear Vu', `${f1(f.Vu)} kN`],
      ['Stirrup legs', String(f.legs)],
      ['Effective depth d', `${f1(r.d)} mm`],
      ['Acp / pcp', `${f1(r.Acp)} mm² / ${f1(r.pcp)} mm`],
      ['Aoh / ph', `${f1(r.Aoh)} mm² / ${f1(r.ph)} mm`],
      ['Ao = 0.85·Aoh', `${f1(r.Ao)} mm²`],
      ['Threshold Tu,th', `${f1(r.Tu_th)} kN·m`],
      ['Cracking torsion Tcr', `${f1(r.Tcr)} kN·m`],
      ['φVc', `${f1(r.phiVc)} kN`],
      ['Max spacing', `${f1(r.sMax)} mm`],
    ] as [string, string][],
    steps: solution ?? undefined,
  } : undefined

  const ratio = r && r.rhs > 0 ? r.lhs / r.rhs : undefined
  const stirrup = r ? `closed ⌀${f.stirrupDia} @ ${Math.round(r.sAdopt)} mm` : '—'
  return (
    <WorkspacePage title="Torsion Design" badges={['Concrete', 'ACI 318-14 §22.7 · NSCP 2015']}
      intro="Combined shear and torsion on a rectangular RC section. §22.7 treats the solid section as a thin-walled tube bounded by the closed stirrup: below the threshold torque it is ignored, above it the stirrups carry At/s on every leg and longitudinal steel Al is spread around the stirrup perimeter."
      report={report}
      inputs={<>
        <InputGroup title="Section">
          <Num label="Width b" unit="mm" value={f.b} onChange={set('b')} min={1} />
          <Num label="Height h" unit="mm" value={f.h} onChange={set('h')} min={1} />
          <Num label="Clear cover" unit="mm" value={f.cover} onChange={set('cover')} min={0} />
          <Pick label="Stirrup legs" value={String(f.legs) as '2' | '4'}
            onChange={(v) => set('legs')(Number(v) as 2 | 4)}
            options={[['2', '2 legs'], ['4', '4 legs']]} />
          <Num label="Stirrup ⌀ dₛ" unit="mm" value={f.stirrupDia} onChange={set('stirrupDia')} min={1} />
          <Num label="Main bar ⌀ db" unit="mm" value={f.barDia} onChange={set('barDia')} min={1} />
        </InputGroup>
        <InputGroup title="Materials">
          <Num label="f′c" unit="MPa" value={f.fc} onChange={set('fc')} min={1} />
          <Pick label="λ (lightweight)" value={String(f.lambda) as '1' | '0.75'}
            onChange={(v) => set('lambda')(Number(v) as 1 | 0.75)}
            options={[['1', '1.0 normal weight'], ['0.75', '0.75 lightweight']]} />
          <Num label="fy (main)" unit="MPa" value={f.fy} onChange={set('fy')} min={1} />
          <Num label="fyt (stirrup)" unit="MPa" value={f.fyt} onChange={set('fyt')} min={1} />
        </InputGroup>
        <InputGroup title="Factored demands">
          <Num label="Torsion Tu" unit="kN·m" value={f.Tu} onChange={set('Tu')} min={0} />
          <Num label="Shear Vu" unit="kN" value={f.Vu} onChange={set('Vu')} min={0} />
        </InputGroup>
      </>}
      checks={r ? <>
        <CheckCard title="Threshold torsion" basis="§22.7.4.1" status="info"
          pillLabel={r.torsionNeeded ? 'REQUIRED' : 'NEGLIGIBLE'} value={f2(r.Tu_th)} unit="kN·m"
          pairs={[{ label: 'Tu', value: `${f2(f.Tu)} kN·m` }, { label: 'Tcr', value: `${f2(r.Tcr)} kN·m` }]} />
        <CheckCard title="Section interaction" basis="§22.7.7.1" status={r.interactionOK ? 'pass' : 'fail'}
          value={f3(r.lhs)} unit="MPa" ratio={ratio} ratioLabel="Stress ÷ limit"
          formula="√[(Vu/bw·d)² + (Tu·ph/1.7Aoh²)²] ≤ φ(Vc/bw·d + ⅔√f′c)"
          pairs={[{ label: 'Limit', value: `${f3(r.rhs)} MPa` }, { label: 'φVc', value: `${f1(r.phiVc)} kN` }]} />
        <CheckCard title="Closed stirrups" basis="(Av + 2At)/s" status={r.interactionOK ? 'pass' : 'fail'}
          value={`⌀${f.stirrupDia} @ ${Math.round(r.sAdopt)}`} unit="mm"
          pairs={[{ label: 'Required', value: Number.isFinite(r.sReq) ? `${f1(r.sReq)} mm` : 'none' }, { label: 'Max', value: `${f1(r.sMax)} mm` }]} />
        <CheckCard title="Longitudinal steel" basis="§22.7.5" status="info"
          value={f1(r.Al_design)} unit="mm²"
          pairs={[{ label: 'Al formula', value: `${f1(r.Al)} mm²` }, { label: 'Al min', value: `${f1(r.Al_min)} mm²` }]} />
      </> : <p className="text-sm text-muted">Fill in all inputs to see results.</p>}
      summary={[
        { label: 'Section', value: `${f.b} × ${f.h} mm, cover ${f.cover} mm` },
        { label: 'Bars', value: `⌀${f.barDia} main, ⌀${f.stirrupDia} × ${f.legs}-leg stirrups` },
        { label: 'Materials', value: `f′c ${f.fc}, fy ${f.fy}, fyt ${f.fyt} MPa, λ ${f.lambda}` },
        { label: 'Demands', value: `Tu ${f1(f.Tu)} kN·m, Vu ${f1(f.Vu)} kN` },
      ]}
      drawing={r ? { title: 'Section — the torsion tube', node: <div data-pdf-drawing>
        <TorsionSection b={f.b} h={f.h} x1={r.x1} y1={r.y1} barDia={f.barDia}
          stirrupDia={f.stirrupDia} Aoh={r.Aoh} ph={r.ph} Ao={r.Ao} Al={r.Al_design}
          stirrupNote={stirrup} />
      </div> } : undefined}
      resultsCaption={r ? [
        ...r.inputNotes,
        r.torsionNeeded ? '' : 'Tu is below the threshold, so §22.7.1.1 lets torsion be neglected; the stirrups shown are for shear alone.',
      ].filter(Boolean).join(' ') || undefined : undefined}
      results={r ? [
        { check: 'Effective depth', basis: 'single layer', demand: `${f1(r.d)} mm`, status: 'info' as const },
        { check: 'Gross section', basis: 'Acp / pcp', demand: `${f1(r.Acp)} mm² / ${f1(r.pcp)} mm`, status: 'info' as const },
        { check: 'Stirrup centreline', basis: 'x₁ × y₁ · Aoh / ph', demand: `${f1(r.x1)} × ${f1(r.y1)} · ${f1(r.Aoh)} mm² / ${f1(r.ph)} mm`, status: 'info' as const },
        { check: 'Shear-flow area', basis: 'Ao = 0.85·Aoh', demand: `${f1(r.Ao)} mm²`, status: 'info' as const },
        { check: 'Threshold torsion', basis: '§22.7.4.1', demand: `${f2(f.Tu)} kN·m`, limit: `${f2(r.Tu_th)} kN·m`, status: 'info' as const },
        { check: 'Shear', basis: 'φVc · Vs required', demand: `${f1(r.Vs)} kN`, limit: `φVc ${f1(r.phiVc)} kN`, status: 'info' as const },
        { check: 'Section interaction', basis: '§22.7.7.1', demand: `${f3(r.lhs)} MPa`, limit: `${f3(r.rhs)} MPa`, ratio, status: r.interactionOK ? 'pass' as const : 'fail' as const },
        { check: 'At/s per leg', basis: '§22.7.6.1 · min', demand: `${f3(r.AtPerS)} mm²/mm`, limit: `min ${f3(r.AtPerS_min)} · design ${f3(r.AtPerS_design)}`, status: 'info' as const },
        { check: '(Av + 2At)/s', basis: '§9.6.4.2 minimum', demand: `${f3(r.AvPlus2At)} mm²/mm`, limit: `min ${f3(r.AvPlus2At_min)}`, status: 'info' as const },
        { check: 'Stirrup spacing', basis: 'min(ph/8, 300, d/2)', demand: Number.isFinite(r.sReq) ? `${f1(r.sReq)} mm req.` : 'none req.', limit: `${f1(r.sMax)} mm`, status: 'info' as const },
        { check: 'Longitudinal Al', basis: '§22.7.5 · §9.6.4.3', demand: `${f1(r.Al)} mm²`, limit: `min ${f1(r.Al_min)} · design ${f1(r.Al_design)} mm²`, status: 'info' as const },
      ] : []}
      steps={solution ?? []}
      references={[
        { topic: 'Threshold and cracking torsion', basis: 'φλ√f′c·Acp²/12pcp', source: 'ACI 318-14 §22.7.4 · NSCP 2015 §422.7' },
        { topic: 'Section limit', basis: 'combined shear and torsion stress', source: 'ACI 318-14 §22.7.7.1' },
        { topic: 'Torsional reinforcement', basis: 'At/s, Al and their minimums; spacing', source: 'ACI 318-14 §22.7.6, §9.6.4, §9.7.5–9.7.6' },
      ]}
    />
  )
}
