import { useMemo, useState } from 'react'
import { designPunchingShear, type PunchingInput, type ColPosition } from '../engine/punchingShear'
import { Num, Pick } from '../components/qty'
import { InputGroup, CheckCard } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { buildPunchingSolution } from '../lib/punchingSolution'
import { f0, f1, f2 } from '../lib/format'
import { PunchingPlan } from '../components/PunchingPlan'

interface FormState {
  c1: number; c2: number         // column dimensions, mm
  h: number                      // slab thickness, mm
  cover: number; barDia: number  // for effective depth
  fc: number
  lambda: '1' | '0.75'
  Vu: number
  position: ColPosition
}

const DEFAULTS: FormState = {
  c1: 500, c2: 500,
  h: 200, cover: 25, barDia: 16,
  fc: 28,
  lambda: '1',
  Vu: 500,
  position: 'interior',
}

const POS_OPTS: [ColPosition, string][] = [
  ['interior', 'Interior — αs = 40'],
  ['edge',     'Edge — αs = 30  (c1 ∥ free edge)'],
  ['corner',   'Corner — αs = 20'],
]

const REQUIRED: (keyof FormState)[] = ['c1', 'c2', 'h', 'cover', 'barDia', 'fc', 'Vu']

export default function PunchingShear() {
  const [f, setF] = useState<FormState>(DEFAULTS)
  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) =>
    setF((s) => ({ ...s, [k]: v }))

  const allFinite = REQUIRED.every((k) => Number.isFinite(f[k] as number))

  const d = f.h - f.cover - f.barDia / 2     // effective depth

  // `f` is a fresh object every render, so memoize on its VALUE identity
  const fKey = JSON.stringify(f)
  const r = useMemo((): ReturnType<typeof designPunchingShear> | null => {
    if (!allFinite || d <= 0) return null
    const inp: PunchingInput = {
      c1: f.c1, c2: f.c2,
      d,
      fc: f.fc,
      lambda: parseFloat(f.lambda),
      Vu: f.Vu,
      position: f.position,
    }
    return designPunchingShear(inp)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fKey, allFinite, d])

  const solution = r ? buildPunchingSolution({ c1: f.c1, c2: f.c2, d, fc: f.fc, lambda: parseFloat(f.lambda), Vu: f.Vu, position: f.position }, r) : null

  const report = r ? {
    docCode: 'S-PS',
    ok: r.ok,
    governing: `Vu/φVc = ${r.ratio.toFixed(2)} · b₀ = ${f0(r.b0)} mm · αs = ${r.alphaS}`,
    stats: [
      { label: 'φVc', value: f1(r.phiVc), unit: 'kN' },
      { label: 'Critical perimeter b₀', value: f0(r.b0), unit: 'mm' },
      { label: 'Effective depth d', value: f1(d), unit: 'mm' },
    ],
    checks: [{ name: 'Punching shear Vu/φVc', ratio: r.ratio, ok: r.ok }],
    data: [
      ['Column c₁ × c₂', `${f.c1} × ${f.c2} mm`],
      ['Slab thickness h', `${f.h} mm`],
      ['Clear cover', `${f.cover} mm`],
      ['Bar ⌀', `${f.barDia} mm`],
      ["Concrete f'c", `${f.fc} MPa`],
      ['λ (lightweight)', f.lambda],
      ['Factored shear Vu', `${f1(f.Vu)} kN`],
      ['Column position', f.position],
      ['βc (aspect)', r.betac.toFixed(2)],
      ['Vc governing', `${f1(r.Vc)} kN (min of ${f1(r.Vc1)} / ${f1(r.Vc2)} / ${f1(r.Vc3)})`],
    ] as [string, string][],
    steps: solution ?? undefined,
  } : undefined

  const gov = r ? (r.Vc === r.Vc3 ? 'a' : r.Vc === r.Vc1 ? 'b' : 'c') : ''
  return (
    <WorkspacePage title="Punching Shear" badges={['Concrete', 'ACI 318-14 §22.6 · NSCP 2015']}
      intro="Two-way shear around a column supporting a slab. The critical section sits d/2 from the column face, closed for an interior column and open at the free edge for edge and corner columns — which is why αs is 40, 30 or 20. Vc is the least of the three Table 22.6.5.2 expressions, with φ = 0.75."
      report={report}
      inputs={<>
        <InputGroup title="Column">
          <Num label="c₁ (∥ free edge / x)" unit="mm" value={f.c1} onChange={set('c1')} />
          <Num label="c₂ (⊥ free edge / y)" unit="mm" value={f.c2} onChange={set('c2')} />
          <div className="col-span-2">
            <Pick label="Position" value={f.position} onChange={set('position')} options={POS_OPTS} />
          </div>
        </InputGroup>
        <InputGroup title="Slab">
          <Num label="Thickness h" unit="mm" value={f.h} onChange={set('h')} />
          <Num label="Clear cover" unit="mm" value={f.cover} onChange={set('cover')} />
          <Num label="Bar ⌀" unit="mm" value={f.barDia} onChange={set('barDia')} />
          <Num label="f′c" unit="MPa" value={f.fc} onChange={set('fc')} />
          <div className="col-span-2">
            <Pick label="λ (lightweight)" value={f.lambda} onChange={set('lambda')}
              options={[['1', '1.0 normal weight'], ['0.75', '0.75 lightweight']]} />
          </div>
        </InputGroup>
        <InputGroup title="Demand">
          <Num label="Vu (factored)" unit="kN" value={f.Vu} onChange={set('Vu')} />
        </InputGroup>
      </>}
      checks={r ? <>
        <CheckCard title="Punching shear" basis="Vu ≤ φVc" status={r.ok ? 'pass' : 'fail'}
          value={f1(r.phiVc)} unit="kN" ratio={r.ratio} ratioLabel="Vu ÷ φVc"
          pairs={[{ label: 'Vu', value: `${f1(f.Vu)} kN` }, { label: 'Governs', value: `Table 22.6.5.2(${gov})` }]} />
        <CheckCard title="Critical section" basis="d/2 from the face" status="info"
          value={f0(r.b0)} unit="mm"
          pairs={[{ label: 'd', value: `${f1(d)} mm` }, { label: 'αs · βc', value: `${r.alphaS} · ${f2(r.betac)}` }]} />
      </> : <p className="text-sm text-muted">Fill in all inputs with an effective depth above zero to see results.</p>}
      summary={[
        { label: 'Column', value: `${f.c1} × ${f.c2} mm, ${f.position}` },
        { label: 'Slab', value: `h ${f.h} mm, cover ${f.cover} mm, ⌀${f.barDia}` },
        { label: 'Concrete', value: `f′c ${f.fc} MPa, λ ${f.lambda}` },
        { label: 'Demand', value: `Vu ${f1(f.Vu)} kN` },
      ]}
      drawing={r ? { title: 'Critical section', node: <div data-pdf-drawing>
        <PunchingPlan c1={f.c1} c2={f.c2} d={d} h={f.h} position={f.position} b0={r.b0} alphaS={r.alphaS} />
      </div> } : undefined}
      resultsCaption={r && !r.ok ? 'φVc < Vu: increase the slab thickness or the column, or add headed studs or closed stirrups (§22.6.7–22.6.8).' : undefined}
      results={r ? [
        { check: 'Effective depth', basis: 'h − cover − db/2', demand: `${f1(d)} mm`, status: 'info' as const },
        { check: 'Critical perimeter b₀', basis: `§22.6.4.1 · αs ${r.alphaS}`, demand: `${f0(r.b0)} mm`, status: 'info' as const },
        { check: 'Vc (a)', basis: '0.33λ√f′c·b₀d', demand: `${f1(r.Vc3)} kN`, status: 'info' as const },
        { check: 'Vc (b)', basis: `(0.17 + 0.33/βc)λ√f′c·b₀d · βc ${f2(r.betac)}`, demand: `${f1(r.Vc1)} kN`, status: 'info' as const },
        { check: 'Vc (c)', basis: '(0.083αs·d/b₀ + 0.17)λ√f′c·b₀d', demand: `${f1(r.Vc2)} kN`, status: 'info' as const },
        { check: 'Punching shear', basis: 'φ = 0.75, least Vc', demand: `${f1(f.Vu)} kN`, limit: `${f1(r.phiVc)} kN`, ratio: r.ratio, status: r.ok ? 'pass' as const : 'fail' as const },
      ] : []}
      steps={solution ?? []}
      references={[
        { topic: 'Critical section', basis: 'd/2 from the column face', source: 'ACI 318-14 §22.6.4.1 · NSCP 2015 §422.6.4.1' },
        { topic: 'Two-way shear strength', basis: 'least of three expressions; αs by position', source: 'ACI 318-14 Table 22.6.5.2' },
        { topic: 'Shear reinforcement', basis: 'stirrups or headed studs', source: 'ACI 318-14 §22.6.7–22.6.8' },
      ]}
    />
  )
}
