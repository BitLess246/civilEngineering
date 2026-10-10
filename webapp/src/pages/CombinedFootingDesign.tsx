import { useMemo, useState, type ReactNode } from 'react'
import { designCombinedFooting, type CombinedFootingInput } from '../engine/combinedFooting'
import { designFlexibleCombinedFooting } from '../engine/flexibleCombinedFooting'
import { CombinedFootingSchematic } from '../components/CombinedFootingSchematic'
import { ModelMemberResults } from '../components/ModelMemberResults'
import type { MemberLoadRequest } from '../lib/modelMemberResults'
import { InputGroup, CheckCard, type ResultRow } from '../components/workspace'
import { WorkspacePage } from '../components/WorkspacePage'
import { Diagram } from '../components/Diagram'
import { DIAGRAM_GRID } from '../lib/diagramLabel'
import { buildCombinedFootingSolution } from '../lib/combinedFootingSolution'
import { Math } from '../lib/math'
import { f0, f2, f3 } from '../lib/format'
import 'katex/dist/katex.min.css'

type Method = 'rigid' | 'flexible'

interface FormState {
  method: Method
  ksubgrade: number
  col1Width: number
  col2Width: number
  spacing: number
  dl1: number; ll1: number
  dl2: number; ll2: number
  leftRestrict: boolean
  rightRestrict: boolean
  leftOverhang: number
  rightOverhang: number
  fc: number
  fy: number
  qAllow: number
  gammaSoil: number
  gammaConc: number
  surcharge: number
  H: number
  barDia: number
  cover: number
}

const DEFAULTS: FormState = {
  method: 'rigid',
  ksubgrade: 40000,
  col1Width: 400,
  col2Width: 400,
  spacing: 4.0,
  dl1: 600, ll1: 400,
  dl2: 500, ll2: 300,
  leftRestrict: true,
  rightRestrict: false,
  leftOverhang: 0,
  rightOverhang: 0,
  fc: 28,
  fy: 415,
  qAllow: 200,
  gammaSoil: 18,
  gammaConc: 24,
  surcharge: 0,
  H: 1.6,
  barDia: 20,
  cover: 75,
}

function NumField({ label, unit, value, onChange, step = 'any' }: {
  label: ReactNode; unit?: string; value: number; onChange: (v: number) => void; step?: string
}) {
  return (
    <label className="flex flex-col text-sm">
      <span className="mb-1 font-medium text-muted">
        {label}{unit ? <span className="text-muted"> ({unit})</span> : null}
      </span>
      <input
        type="number" inputMode="decimal" step={step} value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="rounded-md border border-field-line px-2.5 py-1.5 text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
      />
    </label>
  )
}

function Toggle({ label, value, onChange }: { label: ReactNode; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-field-line text-brand focus:ring-brand" />
      <span className="font-medium text-muted">{label}</span>
    </label>
  )
}

function Select<T extends string>({ label, value, onChange, options }: {
  label: string; value: T; onChange: (v: T) => void; options: [T, string][]
}) {
  return (
    <label className="flex flex-col text-sm">
      <span className="mb-1 font-medium text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}
        className="rounded-md border border-field-line px-2.5 py-1.5 text-ink focus:border-brand focus:outline-none">
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  )
}

/** Result row. `check` is a third column the shared `Row` calls `sub`; the name
 *  differs but the palette must not — this matches `components/qty`. */
export default function CombinedFootingDesign() {
  const [form, setForm] = useState<FormState>(DEFAULTS)
  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) => setForm((s) => ({ ...s, [k]: v }))

  const valid = useMemo(() => {
    const nums: (keyof FormState)[] = [
      'col1Width', 'col2Width', 'spacing', 'dl1', 'll1', 'dl2', 'll2',
      'leftOverhang', 'rightOverhang', 'fc', 'fy', 'qAllow', 'gammaSoil', 'gammaConc', 'surcharge', 'H', 'barDia', 'cover',
    ]
    if (!nums.every((k) => Number.isFinite(form[k] as number))) return false
    return form.spacing > 0 && form.qAllow > 0 && form.fc > 0 && form.fy > 0
  }, [form])

  const result = useMemo(() => {
    if (!valid) return null
    const input: CombinedFootingInput = { ...form }
    try {
      const r = designCombinedFooting(input)
      return r.qNet > 0 ? r : null
    } catch {
      return null
    }
  }, [form, valid])

  const flex = useMemo(() => {
    if (!valid || form.method !== 'flexible' || !(form.ksubgrade > 0)) return null
    try {
      const r = designFlexibleCombinedFooting({ ...form, ksubgrade: form.ksubgrade })
      return r.qNet > 0 ? r : null
    } catch {
      return null
    }
  }, [form, valid])

  const solutionSteps = useMemo(
    () => (result ? buildCombinedFootingSolution({ ...form }, result) : null),
    [form, result],
  )

  const flexible = form.method === 'flexible'
  // Diagrams & longitudinal steel come from the active method; geometry/plan/transverse from rigid.
  const samples = flexible && flex ? flex.samples : result?.samples
  const longSections = flexible && flex ? flex.longSections : result?.longSections
  const vlines = result
    ? [{ x: result.x1, label: 'C1' }, { x: result.x2, label: 'C2' }]
    : []

  /** Saved-model pad → the page's own fields. Column service loads, spacing
   *  and the mat's diameter are the schedule's own facts; the column widths,
   *  materials and soil come from the model and the project's inputs. The
   *  page's rigid-method solution then re-derives the schedule's checks. */
  const loadSaved = (req: MemberLoadRequest) => {
    const c = req.design.combined.find((x) => x.nodes.join(' + ') === req.id)
    if (!c) return
    setForm((s) => ({
      ...s,
      method: 'rigid',
      col1Width: req.section?.b ?? s.col1Width,
      col2Width: req.section2?.b ?? s.col2Width,
      spacing: c.spacing,
      dl1: c.dl1, ll1: c.ll1, dl2: c.dl2, ll2: c.ll2,
      fc: req.section?.fc ?? s.fc, fy: req.section?.fy ?? s.fy,
      qAllow: req.soil.qAllow, gammaSoil: req.soil.gammaSoil, gammaConc: req.soil.gammaConc, H: req.soil.H,
      barDia: c.design.barDia > 0 ? c.design.barDia : s.barDia,
    }))
  }

  const trap = result?.shape[0] === 'T'
  const plan = result ? (trap ? `${f2(result.Bx)} × (${f2(result.By1)}→${f2(result.By2)}) m` : `${f2(result.Bx)} × ${f2(result.By)} m`) : ''
  const flexBearingOK = flexible ? !!flex && flex.bearingOK : true

  // ── The plan's bars, quoted from the schedule the results table prints ──
  // The longitudinal groups are the governing section of each sign (the
  // active method's — the Winkler solution designs its own); the transverse
  // bands are the rigid method's, banded at c + 2d about each column with
  // the transverse strip's own effective depth dT.
  const longAll = longSections ?? result?.longSections ?? []
  const governing = (top: boolean) =>
    [...longAll].filter((sec) => sec.top === top).sort((a, b) => b.bars - a.bars)[0] ?? null
  const dT = result ? result.Dc - form.cover - 1.5 * form.barDia : 0
  const barSpec = result ? {
    db: form.barDia,
    cover: form.cover,
    bottom: (() => { const g = governing(false); return g ? { bars: g.bars, spacing: g.spacing } : null })(),
    top: (() => { const g = governing(true); return g ? { bars: g.bars, spacing: g.spacing } : null })(),
    transverse: result.transverse.map((t, i) => ({
      label: i === 0 ? 'C1' : 'C2',
      xc: i === 0 ? result.x1 : result.x2,
      c: (i === 0 ? form.col1Width : form.col2Width) / 1000,
      spacing: t.spacing,
      d: dT,
    })),
  } : null

  const report = result && solutionSteps ? {
    docCode: 'F-02',
    ok: result.qNet > 0 && flexBearingOK,
    governing: flexible
      ? `Flexible (Winkler) method — q soil,max ${flex ? f2(flex.qSoilMax) : '—'} kPa vs q net ${f2(result.qNet)} kPa`
      : 'Rigid (conventional) method — resultant matched to factored column loads',
    stats: [
      { label: 'Plan', value: trap ? `${f2(result.Bx)} × ${f2(result.By1)}→${f2(result.By2)}` : `${f2(result.Bx)} × ${f2(result.By)}`, unit: 'm' },
      { label: 'Thickness Dc', value: f0(result.Dc), unit: 'mm' },
      { label: 'q net', value: f2(result.qNet), unit: 'kPa' },
    ],
    checks: flexible && flex ? [{ name: 'Soil pressure q soil,max / q net (Winkler)', ratio: flex.qSoilMax / result.qNet, ok: flex.bearingOK }] : [],
    data: [
      ['Column 1 DL / LL', `${f0(form.dl1)} / ${f0(form.ll1)} kN`], ['Column 2 DL / LL', `${f0(form.dl2)} / ${f0(form.ll2)} kN`],
      ['Column spacing', `${f2(form.spacing)} m`], ["Concrete f'c", `${form.fc} MPa`],
      ['Steel fy', `${form.fy} MPa`], ['Allowable qa', `${form.qAllow} kPa`],
      ['Total depth H', `${f2(form.H)} m`], ['Bar ⌀', `${form.barDia} mm`],
      ['Method', flexible ? `flexible, ks ${form.ksubgrade} kN/m³` : 'rigid'],
    ] as [string, string][],
    steps: solutionSteps,
    drawingTitle: 'Combined Footing Plan',
  } : undefined

  const rows: ResultRow[] = result ? [
    { check: 'Shape', basis: result.widened ? 'widened for containment' : 'sized about the service resultant', demand: result.shape, status: 'info' },
    { check: 'Net bearing', basis: 'qa − overburden − surcharge', demand: `${f3(result.qNet)} kPa`, status: 'info' },
    { check: 'Plan size', basis: trap ? 'Bx × (By1 → By2)' : 'Bx × By', demand: plan, status: 'info' },
    { check: 'Factored loads', basis: 'Pu1 / Pu2', demand: `${f0(result.Pu1)} / ${f0(result.Pu2)} kN`, status: 'info' },
    { check: 'Thickness', basis: `d punching ${f0(result.dPunch)} · beam ${f0(result.dBeam)} mm`, demand: `Dc ${f0(result.Dc)} mm`, status: 'info' },
    ...(!flexible ? [{ check: 'Peak moment', basis: `at x = ${f2(result.xPeak)} m`, demand: `${f0(result.mPeak)} kN·m`, status: 'info' as const }] : []),
    ...(flexible && flex ? [
      { check: 'Section EI', basis: `Ec ${f0(flex.Ec)} MPa`, demand: `${f0(flex.EI / 1000)}×10³ kN·m²`, status: 'info' as const },
      { check: 'Relative rigidity βBx', basis: flex.betaBx < 1 ? 'short → about rigid' : flex.betaBx > 3 ? 'long → flexible' : 'intermediate', demand: f2(flex.betaBx), status: 'info' as const },
      { check: 'Settlement', basis: flex.yMin < -1e-3 ? `uplift ${f2(flex.yMin)} mm` : 'full contact', demand: `${f2(flex.yMax)} mm max`, status: flex.yMin < -1e-3 ? 'warn' as const : 'info' as const },
      { check: 'Soil pressure', basis: 'Winkler, vs q net', demand: `${f3(flex.qSoilMax)} kPa`, limit: `${f3(result.qNet)} kPa`, ratio: flex.qSoilMax / result.qNet, status: flex.bearingOK ? 'pass' as const : 'fail' as const },
      { check: 'Peak |M|', basis: `at x = ${f2(flex.xPeak)} m`, demand: `${f0(flex.mPeak)} kN·m`, status: 'info' as const },
    ] : []),
    ...(longSections ?? result.longSections).map((sec) => ({ check: `Longitudinal — ${sec.label}`, basis: `Mu ${f0(sec.Mu)} kN·m · ${sec.top ? 'top' : 'bottom'}`, demand: `${sec.bars} ⌀${form.barDia} @ ${f0(sec.spacing)} mm`, status: 'info' as const })),
    ...result.transverse.map((t) => ({ check: `Transverse — ${t.label}`, basis: `As ${f0(t.AsPerM)} mm²/m`, demand: `⌀${form.barDia} @ ${f0(t.spacing)} mm`, status: 'info' as const })),
  ] : []

  return (
    <WorkspacePage title="Combined Footing" badges={['Foundations', 'ACI 318-14 · NSCP 2015']}
      intro="Two columns on one footing. The rigid method sizes the plan about the service resultant so bearing is uniform (rectangular), or tapers it when both ends are restricted (trapezoidal), then integrates shear and moment along the length. The flexible method re-solves the same footing as a beam on Winkler springs."
      report={report}
      inputs={<>
        <div className="no-print"><ModelMemberResults kind="combined" onLoad={loadSaved} /></div>

          <InputGroup title="Analysis method">
            <Select label="Method" value={form.method} onChange={set('method')}
              options={[['rigid', 'Rigid (conventional)'], ['flexible', 'Flexible (Winkler)']]} />
            {flexible && (
              <NumField label={<>Subgrade <Math tex="k_s" /></>} unit="kN/m³" value={form.ksubgrade} onChange={set('ksubgrade')} />
            )}
            {flexible && (
              <p className="col-span-full text-xs text-muted">
                Beam-on-elastic-foundation FEM (Hermitian elements + consistent Winkler springs). Soil reaction
                q(x) = k_s·B·y(x). Typical k_s: loose sand ~10–25, dense sand / stiff clay ~40–120 MN/m³.
              </p>
            )}
          </InputGroup>

          <InputGroup title="Geometry">
            <NumField label={<>Column 1 <Math tex="c_1" /></>} unit="mm" value={form.col1Width} onChange={set('col1Width')} />
            <NumField label={<>Column 2 <Math tex="c_2" /></>} unit="mm" value={form.col2Width} onChange={set('col2Width')} />
            <NumField label="C/C spacing" unit="m" value={form.spacing} onChange={set('spacing')} />
            <div className="col-span-full grid grid-cols-2 gap-4">
              <Toggle label="Left edge restricted" value={form.leftRestrict} onChange={set('leftRestrict')} />
              <Toggle label="Right edge restricted" value={form.rightRestrict} onChange={set('rightRestrict')} />
            </div>
            {form.leftRestrict && (
              <NumField label="Left overhang" unit="mm" value={form.leftOverhang} onChange={set('leftOverhang')} />
            )}
            {form.rightRestrict && (
              <NumField label="Right overhang" unit="mm" value={form.rightOverhang} onChange={set('rightOverhang')} />
            )}
            <p className="col-span-full text-xs text-muted">
              Both edges restricted → trapezoidal (CTF). Otherwise the slab is rectangular (CRF) and sized about the
              service-load resultant so bearing is uniform.
            </p>
          </InputGroup>

          <InputGroup title="Loads">
            <NumField label={<>Col 1 dead <Math tex="D_1" /></>} unit="kN" value={form.dl1} onChange={set('dl1')} />
            <NumField label={<>Col 1 live <Math tex="L_1" /></>} unit="kN" value={form.ll1} onChange={set('ll1')} />
            <NumField label={<>Col 2 dead <Math tex="D_2" /></>} unit="kN" value={form.dl2} onChange={set('dl2')} />
            <NumField label={<>Col 2 live <Math tex="L_2" /></>} unit="kN" value={form.ll2} onChange={set('ll2')} />
          </InputGroup>

          <InputGroup title="Materials">
            <NumField label={<Math tex="f'_c" />} unit="MPa" value={form.fc} onChange={set('fc')} />
            <NumField label={<Math tex="f_y" />} unit="MPa" value={form.fy} onChange={set('fy')} />
            <NumField label={<>Bar <Math tex="d_b" /></>} unit="mm" value={form.barDia} onChange={set('barDia')} />
            <NumField label="Clear cover" unit="mm" value={form.cover} onChange={set('cover')} />
          </InputGroup>

          <InputGroup title="Soil & Geometry">
            <NumField label={<Math tex="q_a" />} unit="kPa" value={form.qAllow} onChange={set('qAllow')} />
            <NumField label={<Math tex="\gamma_{soil}" />} unit="kN/m³" value={form.gammaSoil} onChange={set('gammaSoil')} />
            <NumField label={<Math tex="\gamma_{conc}" />} unit="kN/m³" value={form.gammaConc} onChange={set('gammaConc')} />
            <NumField label={<>Total depth <Math tex="H" /></>} unit="m" value={form.H} onChange={set('H')} />
            <NumField label="Surcharge" unit="kPa" value={form.surcharge} onChange={set('surcharge')} />
          </InputGroup>
              </>}
      checks={result ? <>
        <CheckCard title="Plan" basis={result.shape} status="info" value={plan}
          pairs={[{ label: 'q net', value: `${f2(result.qNet)} kPa` }, { label: 'Pu1 / Pu2', value: `${f0(result.Pu1)} / ${f0(result.Pu2)} kN` }]} />
        <CheckCard title="Thickness" basis="d from two-way and one-way shear" status="info" value={f0(result.Dc)} unit="mm"
          pairs={[{ label: 'd punching', value: `${f0(result.dPunch)} mm` }, { label: 'd beam', value: `${f0(result.dBeam)} mm` }]} />
        {flexible && (flex
          ? <CheckCard title="Soil pressure (Winkler)" basis="q soil,max ≤ q net" status={flex.bearingOK ? 'pass' : 'fail'}
              value={f2(flex.qSoilMax)} unit="kPa" ratio={flex.qSoilMax / result.qNet} ratioLabel="q ÷ q net"
              pairs={[{ label: 'Max settlement', value: `${f2(flex.yMax)} mm` }, { label: 'βBx', value: f2(flex.betaBx) }]} />
          : <CheckCard title="Flexible solve" basis="needs ks > 0" status="info" pillLabel="NOT RUN" value="—" />)}
        <CheckCard title="Peak moment" basis={flexible ? 'from the Winkler solution' : 'rigid method'} status="info"
          value={f0(flexible && flex ? flex.mPeak : result.mPeak)} unit="kN·m"
          pairs={[{ label: 'at x', value: `${f2(flexible && flex ? flex.xPeak : result.xPeak)} m` }]} />
      </> : <p className="text-sm text-muted">Enter valid inputs — the net bearing must be positive.</p>}
      summary={[
        { label: 'Columns', value: `${form.col1Width} / ${form.col2Width} mm at ${f2(form.spacing)} m` },
        { label: 'Loads', value: `D/L ${f0(form.dl1)}/${f0(form.ll1)} and ${f0(form.dl2)}/${f0(form.ll2)} kN` },
        { label: 'Soil', value: `qa ${form.qAllow} kPa, H ${f2(form.H)} m` },
        { label: 'Method', value: flexible ? `flexible, ks ${form.ksubgrade} kN/m³` : 'rigid' },
      ]}
      drawing={result ? { title: 'Plan', node: <div data-pdf-drawing>
        <CombinedFootingSchematic
          shape={result.shape} Bx={result.Bx} By={result.By} By1={result.By1} By2={result.By2}
          x1={result.x1} x2={result.x2} col1Width={form.col1Width} col2Width={form.col2Width}
          bars={barSpec} />
      </div> } : undefined}
      resultsCaption={flexible
        ? 'Flexible (Winkler) method: EI·y⁗ + ks·B·y = column loads, solved with Hermitian beam elements and consistent foundation springs; geometry and thickness are inherited from the rigid sizing. φ: shear 0.75, flexure 0.90.'
        : 'Rigid (conventional) method: the line load varies linearly so its resultant matches the factored column loads; V(x) and M(x) are integrated along the footing. φ: shear 0.75, flexure 0.90.'}
      results={rows}
      extraSections={samples ? [{ title: 'Soil reaction, shear and moment', node: (
        <div className={`gap-6 ${DIAGRAM_GRID}`}>
          {/* data-pdf-figure: the export button lifts each diagram into the
              PDF as its own figure, captioned by the data-figure-title. */}
          <div data-pdf-figure data-figure-title="SOIL REACTION (w)">
            <Diagram xs={samples.x} ys={samples.w} title="SOIL REACTION (w)" unit="kN/m" color="#16a34a" vlines={vlines} markExtrema={!flexible} decimals={1} />
          </div>
          <div data-pdf-figure data-figure-title="SHEAR (Vu)">
            <Diagram xs={samples.x} ys={samples.V} title="SHEAR (Vu)" unit="kN" color="#dc2626" vlines={vlines} decimals={0} />
          </div>
          <div data-pdf-figure data-figure-title="MOMENT (Mu)">
            <Diagram xs={samples.x} ys={samples.M} title="MOMENT (Mu)" unit="kN·m" color="#0056b3" vlines={vlines} decimals={0} />
          </div>
          {flexible && flex && (
            <div data-pdf-figure data-figure-title="SETTLEMENT (y, + down)">
              <Diagram xs={flex.samples.x} ys={flex.samples.y} title="SETTLEMENT (y, + down)" unit="mm" color="#7c3aed" vlines={vlines} decimals={2} />
            </div>
          )}
        </div>
      ) }] : []}
      steps={solutionSteps ?? []}
      references={[
        { topic: 'Net bearing and factored loads', basis: 'q net = qa − γs·Ds − γc·Dc − q; Pu = max(1.4D, 1.2D + 1.6L)', source: 'NSCP 2015 §203 · ACI 318-14 Ch. 13' },
        { topic: 'Combined footings', basis: 'rigid method; trapezoidal for two restricted ends', source: 'Das, Principles of Foundation Engineering' },
        { topic: 'Beam on elastic foundation', basis: 'Winkler springs', source: 'Hetényi, Beams on Elastic Foundation' },
      ]}
    />
  )
}
