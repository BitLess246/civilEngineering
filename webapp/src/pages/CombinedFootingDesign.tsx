import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { designCombinedFooting, type CombinedFootingInput } from '../engine/combinedFooting'
import { designFlexibleCombinedFooting } from '../engine/flexibleCombinedFooting'
import { CombinedFootingSchematic } from '../components/CombinedFootingSchematic'
import { Diagram } from '../components/Diagram'
import { ReportControls } from '../components/ReportControls'
import { WorkedSolution } from '../components/WorkedSolution'
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
      <span className="mb-1 font-medium text-slate-600">
        {label}{unit ? <span className="text-slate-500"> ({unit})</span> : null}
      </span>
      <input
        type="number" inputMode="decimal" step={step} value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="rounded-md border border-slate-300 px-2.5 py-1.5 text-slate-800 focus:border-[#0056b3] focus:outline-none focus:ring-1 focus:ring-[#0056b3]"
      />
    </label>
  )
}

function Toggle({ label, value, onChange }: { label: ReactNode; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-[#0056b3] focus:ring-[#0056b3]" />
      <span className="font-medium text-slate-600">{label}</span>
    </label>
  )
}

function Select<T extends string>({ label, value, onChange, options }: {
  label: string; value: T; onChange: (v: T) => void; options: [T, string][]
}) {
  return (
    <label className="flex flex-col text-sm">
      <span className="mb-1 font-medium text-slate-600">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}
        className="rounded-md border border-slate-300 px-2.5 py-1.5 text-slate-800 focus:border-[#0056b3] focus:outline-none">
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <legend className="px-2 text-[1.02rem] font-bold text-[#0056b3]">{title}</legend>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  )
}

function Row({ label, value, check }: { label: ReactNode; value: ReactNode; check?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1.5 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-right text-sm font-semibold text-slate-800">{value}</span>
      {check ? <span className="w-36 text-right text-xs text-slate-500">{check}</span> : null}
    </div>
  )
}

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

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Link to="/" className="no-print text-sm text-[#0056b3] hover:underline">← Home</Link>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#0056b3]">Combined Footing Design</h1>
      <p className="no-print mt-1 text-slate-600">
        Two-column combined footing. Rectangular when one edge is free, trapezoidal when both are property-restricted.
        Choose the <b>rigid</b> (linear-pressure) or <b>flexible</b> (Winkler beam-on-elastic-foundation) method —
        geometry is shared; the flexible method recomputes V/M from the settlement field. Results update live.
      </p>
      <ReportControls title="Combined Footing Design Report" />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* ── Inputs ── */}
        <div className="space-y-5">
          <Card title="Analysis method">
            <Select label="Method" value={form.method} onChange={set('method')}
              options={[['rigid', 'Rigid (conventional)'], ['flexible', 'Flexible (Winkler)']]} />
            {flexible && (
              <NumField label={<>Subgrade <Math tex="k_s" /></>} unit="kN/m³" value={form.ksubgrade} onChange={set('ksubgrade')} />
            )}
            {flexible && (
              <p className="col-span-full text-xs text-slate-500">
                Beam-on-elastic-foundation FEM (Hermitian elements + consistent Winkler springs). Soil reaction
                q(x) = k_s·B·y(x). Typical k_s: loose sand ~10–25, dense sand / stiff clay ~40–120 MN/m³.
              </p>
            )}
          </Card>

          <Card title="Geometry">
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
            <p className="col-span-full text-xs text-slate-500">
              Both edges restricted → trapezoidal (CTF). Otherwise the slab is rectangular (CRF) and sized about the
              service-load resultant so bearing is uniform.
            </p>
          </Card>

          <Card title="Loads">
            <NumField label={<>Col 1 dead <Math tex="D_1" /></>} unit="kN" value={form.dl1} onChange={set('dl1')} />
            <NumField label={<>Col 1 live <Math tex="L_1" /></>} unit="kN" value={form.ll1} onChange={set('ll1')} />
            <div className="hidden lg:block" />
            <NumField label={<>Col 2 dead <Math tex="D_2" /></>} unit="kN" value={form.dl2} onChange={set('dl2')} />
            <NumField label={<>Col 2 live <Math tex="L_2" /></>} unit="kN" value={form.ll2} onChange={set('ll2')} />
          </Card>

          <Card title="Materials">
            <NumField label={<Math tex="f'_c" />} unit="MPa" value={form.fc} onChange={set('fc')} />
            <NumField label={<Math tex="f_y" />} unit="MPa" value={form.fy} onChange={set('fy')} />
            <NumField label={<>Bar <Math tex="d_b" /></>} unit="mm" value={form.barDia} onChange={set('barDia')} />
            <NumField label="Clear cover" unit="mm" value={form.cover} onChange={set('cover')} />
          </Card>

          <Card title="Soil & Geometry">
            <NumField label={<Math tex="q_a" />} unit="kPa" value={form.qAllow} onChange={set('qAllow')} />
            <NumField label={<Math tex="\gamma_{soil}" />} unit="kN/m³" value={form.gammaSoil} onChange={set('gammaSoil')} />
            <NumField label={<Math tex="\gamma_{conc}" />} unit="kN/m³" value={form.gammaConc} onChange={set('gammaConc')} />
            <NumField label={<>Total depth <Math tex="H" /></>} unit="m" value={form.H} onChange={set('H')} />
            <NumField label="Surcharge" unit="kPa" value={form.surcharge} onChange={set('surcharge')} />
          </Card>
        </div>

        {/* ── Results ── */}
        <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">Plan</h2>
            {result ? (
              <CombinedFootingSchematic
                shape={result.shape} Bx={result.Bx} By={result.By} By1={result.By1} By2={result.By2}
                x1={result.x1} x2={result.x2} col1Width={form.col1Width} col2Width={form.col2Width}
              />
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">Enter valid inputs — net bearing must be positive.</p>
            )}
          </div>

          {result && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">Results</h2>
              <Row label="Shape" value={result.shape} />
              <Row label={<Math tex="q_{net}" />} value={`${f3(result.qNet)} kPa`} />
              <Row label="Plan size"
                value={result.shape[0] === 'T'
                  ? `${f2(result.Bx)} m × (${f2(result.By1)}→${f2(result.By2)}) m`
                  : `${f2(result.Bx)} × ${f2(result.By)} m`}
                check={result.widened ? 'widened for containment' : undefined} />
              <Row label={<>Factored loads <Math tex="P_{u1}/P_{u2}" /></>} value={`${f0(result.Pu1)} / ${f0(result.Pu2)} kN`} />
              <Row label="Slab thickness Dc" value={`${f0(result.Dc)} mm`}
                check={`d punch ${f0(result.dPunch)} · beam ${f0(result.dBeam)} mm`} />
              {!flexible && (
                <Row label={<>Peak +M <Math tex="M_u" /></>} value={`${f0(result.mPeak)} kN·m`} check={`at x = ${f2(result.xPeak)} m`} />
              )}
              {flexible && flex && (
                <>
                  <Row label={<>Section <Math tex="EI" /></>} value={`${f0(flex.EI / 1000)}×10³ kN·m²`} check={`Ec ${f0(flex.Ec)} MPa`} />
                  <Row label={<>Rigidity <Math tex="\beta B_x" /></>} value={f2(flex.betaBx)}
                    check={flex.betaBx < 1 ? 'short → ~rigid' : flex.betaBx > 3 ? 'long → flexible' : 'intermediate'} />
                  <Row label="Max settlement" value={`${f2(flex.yMax)} mm`}
                    check={flex.yMin < -1e-3 ? `uplift ${f2(flex.yMin)} mm` : 'full contact'} />
                  <Row label={<Math tex="q_{soil,max}" />} value={`${f3(flex.qSoilMax)} kPa`}
                    check={flex.bearingOK ? '✓ ≤ q_net' : '✗ > q_net'} />
                  <Row label={<>Peak |M| <Math tex="M_u" /></>} value={`${f0(flex.mPeak)} kN·m`} check={`at x = ${f2(flex.xPeak)} m`} />
                </>
              )}
              {flexible && !flex && (
                <Row label="Flexible solve" value="—" check="check k_s > 0" />
              )}
            </div>
          )}

          {result && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">
                Longitudinal flexure {flexible && <span className="text-xs font-normal text-slate-500">(from BEF moments)</span>}
              </h2>
              {(longSections ?? result.longSections).map((s) => (
                <Row key={s.label} label={s.label}
                  value={`${s.bars} ⌀${form.barDia} @ ${f0(s.spacing)} mm`}
                  check={`Mu=${f0(s.Mu)} kN·m · ${s.top ? 'top' : 'bottom'}`} />
              ))}
              <h2 className="mb-2 mt-4 text-[1.02rem] font-bold text-[#0056b3]">Transverse (under columns)</h2>
              {result.transverse.map((t) => (
                <Row key={t.label} label={t.label}
                  value={`⌀${form.barDia} @ ${f0(t.spacing)} mm`}
                  check={`As=${f0(t.AsPerM)} mm²/m`} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Diagrams (full width) ── */}
      {samples && (
        <div className={`mt-6 grid grid-cols-1 gap-6 ${flexible && flex ? 'lg:grid-cols-2' : 'lg:grid-cols-3'}`}>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <Diagram xs={samples.x} ys={samples.w} title="SOIL REACTION (w)" unit="kN/m"
              color="#16a34a" vlines={vlines} markExtrema={!flexible} decimals={1} />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <Diagram xs={samples.x} ys={samples.V} title="SHEAR (Vu)" unit="kN"
              color="#dc2626" vlines={vlines} decimals={0} />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <Diagram xs={samples.x} ys={samples.M} title="MOMENT (Mu)" unit="kN·m"
              color="#0056b3" vlines={vlines} decimals={0} />
          </div>
          {flexible && flex && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <Diagram xs={flex.samples.x} ys={flex.samples.y} title="SETTLEMENT (y, + down)" unit="mm"
                color="#7c3aed" vlines={vlines} decimals={2} />
            </div>
          )}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
        <h2 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">Basis</h2>
        <Math block tex={String.raw`q_{net} = q_a - \gamma_s D_s - \gamma_c D_c - q,\qquad P_u = \max(1.4D,\ 1.2D + 1.6L)`} />
        {flexible ? (
          <p className="mt-1 text-xs text-slate-500">
            Flexible (Winkler) method: footing modelled as a beam on elastic foundation, EI·y'''' + k_s·B·y = column
            loads, solved with Hermitian beam elements and consistent foundation springs. Soil pressure and internal
            V/M follow the settlement field rather than an assumed linear pressure. Geometry/thickness are inherited
            from the rigid sizing. NSCP 2015 / ACI 318-14. φ: shear 0.75, flexure 0.90.
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-500">
            Rigid (conventional) method: equivalent line load varies linearly so its resultant matches the factored
            column loads; V(x)/M(x) integrated along the footing. NSCP 2015 / ACI 318-14. φ: shear 0.75, flexure 0.90.
          </p>
        )}
      </div>

      {solutionSteps && (
        <WorkedSolution steps={solutionSteps} title="Combined footing — worked solution (rigid method)" />
      )}
    </div>
  )
}
