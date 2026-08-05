import { useMemo, useState } from 'react'
import { designTorsion, type TorsionInput } from '../engine/torsionDesign'
import { Num, Pick, Card, ResultCard, Row } from '../components/qty'
import { ReportControls } from '../components/ReportControls'
import { buildTorsionSolution } from '../lib/torsionSolution'
import { TorsionSection } from '../components/TorsionSection'
import { WorkedSolution } from '../components/WorkedSolution'
import { f1, f2, f3 } from '../lib/format'
import { PageHeader } from '../components/calc'

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

  return (
        <div>
      <PageHeader title="Torsion Design" badges={['ACI 318-14 §22.7', 'NSCP 2015']} />
      <div className="mx-auto max-w-[1500px] p-6">
      <p className="no-print mt-1 text-slate-600">
        Rectangular RC section — ACI 318-14 §22.7 combined shear + torsion. SI units (mm, kN, MPa).
      </p>
      <ReportControls title="Torsion Design" badges={['ACI 318-14 §22.7', 'NSCP 2015']} report={report} />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* ── INPUTS ── */}
        <div className="flex flex-col gap-6">
          <Card title="Section">
            <Num label="Width b" unit="mm"    value={f.b}    onChange={set('b')} />
            <Num label="Height h" unit="mm"   value={f.h}    onChange={set('h')} />
            <Num label="Clear cover" unit="mm" value={f.cover} onChange={set('cover')} />
            <Num label="Stirrup ⌀ dₛ" unit="mm" value={f.stirrupDia} onChange={set('stirrupDia')} />
            <Num label="Main bar ⌀ db" unit="mm" value={f.barDia}    onChange={set('barDia')} />
            <Pick label="Stirrup legs" value={String(f.legs) as '2'|'4'}
              onChange={(v) => set('legs')(Number(v) as 2 | 4)}
              options={[['2', '2 legs'], ['4', '4 legs']]} />
          </Card>

          <Card title="Materials">
            <Num label="f'c" unit="MPa" value={f.fc}  onChange={set('fc')} />
            <Num label="fy (main)"  unit="MPa" value={f.fy}  onChange={set('fy')} />
            <Num label="fyt (stirrup)" unit="MPa" value={f.fyt} onChange={set('fyt')} />
            <Pick label="λ (lightweight)" value={String(f.lambda) as '1'|'0.75'}
              onChange={(v) => set('lambda')(Number(v) as 1 | 0.75)}
              options={[['1', '1.0 (normal weight)'], ['0.75', '0.75 (lightweight)']]} />
          </Card>

          <Card title="Demands">
            <Num label="Tu (factored torsion)" unit="kN·m" value={f.Tu} onChange={set('Tu')} />
            <Num label="Vu (factored shear)"  unit="kN"   value={f.Vu}  onChange={set('Vu')} />
          </Card>
        </div>

        {/* ── RESULTS ── */}
        {r ? (
          <div className="flex flex-col gap-6">
            <section data-pdf-drawing className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm
              [background-image:linear-gradient(#f0eee7_1px,transparent_1px),linear-gradient(90deg,#f0eee7_1px,transparent_1px)] [background-size:22px_22px]">
              <h2 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">Section — torsion tube</h2>
              <TorsionSection b={f.b} h={f.h} x1={r.x1} y1={r.y1} barDia={f.barDia}
                stirrupDia={f.stirrupDia} Aoh={r.Aoh} ph={r.ph} Ao={r.Ao} Al={r.Al_design}
                stirrupNote={`closed ⌀${f.stirrupDia} @ ${Math.round(r.sAdopt)} mm`} />
            </section>

            <ResultCard title="Section Geometry">
              <Row label="Effective depth d"          value={`${f1(r.d)} mm`} />
              <Row label="Gross area Acp"             value={`${f1(r.Acp)} mm²`}   sub={`pcp = ${f1(r.pcp)} mm`} />
              <Row label="Cover to stirrup CL cSt"   value={`${f1(r.cSt)} mm`} />
              <Row label="Inner dims x₁ × y₁"        value={`${f1(r.x1)} × ${f1(r.y1)} mm`} />
              <Row label="Aoh (enclosed area)"        value={`${f1(r.Aoh)} mm²`} />
              <Row label="ph (perimeter Aoh)"         value={`${f1(r.ph)} mm`} />
              <Row label="Ao = 0.85·Aoh"             value={`${f1(r.Ao)} mm²`} />
            </ResultCard>

            <ResultCard title="Torsion Thresholds §22.7">
              <Row label="Threshold Tu,th"
                value={`${f2(r.Tu_th)} kN·m`}
                sub={`Tu = ${f2(f.Tu)} kN·m`}
                alert={!r.torsionNeeded && false} />
              <Row label="Cracking Tcr"               value={`${f2(r.Tcr)} kN·m`} />
              <Row label="Torsion reinforcement"
                value={r.torsionNeeded ? 'Required' : 'Not required'}
                alert={!r.torsionNeeded} />
            </ResultCard>

            <ResultCard title="Shear Capacity">
              <Row label="φVc"  value={`${f1(r.phiVc)} kN`} sub={`Vc = ${f1(r.Vc)} kN`} />
              <Row label="Vs required" value={`${f1(r.Vs)} kN`} />
            </ResultCard>

            <ResultCard title="Section Interaction §22.7.7.1">
              <Row label="LHS √[(Vu/bwd)² + (Tu·ph/1.7Aoh²)²]"
                value={`${f3(r.lhs)} MPa`} />
              <Row label="RHS φ·(Vc/bwd + ⅔√f'c)"
                value={`${f3(r.rhs)} MPa`} />
              <Row label="Interaction check"
                value={r.interactionOK ? 'OK ✓' : 'FAIL ✗'}
                alert={!r.interactionOK} />
            </ResultCard>

            <ResultCard title="Transverse Steel At/s §22.7.6.1">
              <Row label="At/s (torsion)"          value={`${f3(r.AtPerS)} mm²/mm`} />
              <Row label="At/s minimum"            value={`${f3(r.AtPerS_min)} mm²/mm`} />
              <Row label="At/s design"             value={`${f3(r.AtPerS_design)} mm²/mm`} />
            </ResultCard>

            <ResultCard title="Longitudinal Steel Al §22.7.5">
              <Row label="Al (formula)"            value={`${f1(r.Al)} mm²`} />
              <Row label="Al minimum"              value={`${f1(r.Al_min)} mm²`} />
              <Row label="Al design"               value={`${f1(r.Al_design)} mm²`} />
            </ResultCard>

            <ResultCard title="Combined Stirrup Design">
              <Row label="Av/s (shear legs)"       value={`${f3(r.AvPerS)} mm²/mm`} />
              <Row label="(Av+2At)/s required"     value={`${f3(r.AvPlus2At)} mm²/mm`} />
              <Row label="(Av+2At)/s minimum"      value={`${f3(r.AvPlus2At_min)} mm²/mm`} />
              <Row label="s required"              value={`${f1(r.sReq)} mm`} />
              <Row label="s max (§9.7.6)"          value={`${f1(r.sMax)} mm`}
                sub={`ph/8=${f1(r.ph/8)} · d/2=${f1(r.d/2)}`} />
              <Row label="s adopted"
                value={`${f1(r.sAdopt)} mm`}
                alert={!r.interactionOK} />
            </ResultCard>
          </div>
        ) : (
          <p className="self-start rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
            Fill in all inputs to see results.
          </p>
        )}
      </div>

      {/* The step-by-step already existed and only ever reached the PDF. */}
      {solution && solution.length > 0 && (
        <div className="mt-5">
          <WorkedSolution steps={solution} title="Calculation report — worked solution" />
        </div>
      )}
    </div>
    </div>
  )
}
