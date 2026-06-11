import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { designSquareFooting } from '../engine/isolatedFooting'
import { designRectangularFooting } from '../engine/rectangularFooting'
import { designEccentricSquareFooting } from '../engine/eccentricFooting'
import { netBearing } from '../engine/bearing'
import type { ColumnPosition } from '../engine/shear'
import { FootingSchematic } from '../components/FootingSchematic'
import { ReportControls } from '../components/ReportControls'
import { ExcelImport } from '../components/ExcelImport'
import type { BatchResult } from '../lib/foundationExcel'
import { WorkedSolution } from '../components/WorkedSolution'
import { buildFoundationSolution, type SolutionCtx } from '../lib/foundationSolution'
import { Math } from '../lib/math'
import { f0, f2, f3 } from '../lib/format'
import 'katex/dist/katex.min.css'

type FootingType = 'square' | 'rectangular'
type SizingMode = 'ratio' | 'fixedWidth'
type LoadingType = 'concentric' | 'eccentric'
type AnalysisMethod = 'design' | 'analyze'
type SolutionMethod = 'iteration' | 'approximate'

interface FormState {
  footingType: FootingType
  loadingType: LoadingType
  analysisMethod: AnalysisMethod
  solutionMethod: SolutionMethod
  givenB: number
  givenDc: number
  sizingMode: SizingMode
  ratio: number
  fixedBy: number
  serviceLoad: number
  ultimateLoad: number
  serviceMoment: number
  ultimateMoment: number
  columnWidth: number
  fc: number
  fy: number
  qAllow: number
  gammaSoil: number
  gammaConc: number
  H: number
  barDia: number
  cover: number
  surcharge: number
  position: ColumnPosition
}

const DEFAULTS: FormState = {
  footingType: 'square',
  loadingType: 'concentric',
  analysisMethod: 'design',
  solutionMethod: 'iteration',
  givenB: 2,
  givenDc: 500,
  sizingMode: 'ratio',
  ratio: 1.5,
  fixedBy: 2,
  serviceLoad: 1000,
  ultimateLoad: 1400,
  serviceMoment: 150,
  ultimateMoment: 210,
  columnWidth: 400,
  fc: 28,
  fy: 415,
  qAllow: 200,
  gammaSoil: 18,
  gammaConc: 24,
  H: 1.5,
  barDia: 20,
  cover: 75,
  surcharge: 0,
  position: 'interior',
}

interface DirSteel { As: number; bars: number; spacing: number; usedMin: boolean; rho: number }
interface View {
  type: FootingType
  loading: LoadingType
  analysis: AnalysisMethod; method: SolutionMethod
  Bx: number; By: number; Dc: number; qNet: number; qu: number
  dPunch: number; dBeamLong: number; dBeamShort: number; dProvided: number
  punchOK: boolean; beamOK: boolean
  long: DirSteel
  short: (DirSteel & { bandBars: number; bandFraction: number }) | null
  ecc: { e: number; qMax: number; qMin: number; kernOK: boolean } | null
}

const designDefaults = { analysis: 'design' as const, method: 'iteration' as const, punchOK: true, beamOK: true }

function NumField({ label, unit, value, onChange, step = 'any' }: {
  label: ReactNode; unit?: string; value: number; onChange: (v: number) => void; step?: string
}) {
  return (
    <label className="flex flex-col text-sm">
      <span className="mb-1 font-medium text-slate-600">
        {label}{unit ? <span className="text-slate-400"> ({unit})</span> : null}
      </span>
      <input
        type="number" inputMode="decimal" step={step} value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="rounded-md border border-slate-300 px-2.5 py-1.5 text-slate-800 focus:border-[#0056b3] focus:outline-none focus:ring-1 focus:ring-[#0056b3]"
      />
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
      {check ? <span className="w-32 text-right text-xs text-slate-500">{check}</span> : null}
    </div>
  )
}

function steelRow(label: ReactNode, s: DirSteel, db: number) {
  return (
    <Row label={label} value={`${s.bars} ⌀${db} mm @ ${f0(s.spacing)} mm`}
      check={`As=${f0(s.As)} mm² · ${s.usedMin ? 'ρ_min' : `ρ=${s.rho.toFixed(4)}`}`} />
  )
}

export default function FoundationDesign() {
  const [form, setForm] = useState<FormState>(DEFAULTS)
  const [batch, setBatch] = useState<BatchResult | null>(null)
  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) => setForm((s) => ({ ...s, [k]: v }))
  const ecc = form.loadingType === 'eccentric'
  const rect = form.footingType === 'rectangular' && !ecc   // eccentric pilot is square-only
  const sq = form.footingType === 'square' && !ecc          // analysis/solution methods apply here
  const analyze = sq && form.analysisMethod === 'analyze'

  const qNetTrial = useMemo(
    () => netBearing({ qAllow: form.qAllow, gammaSoil: form.gammaSoil, gammaConc: form.gammaConc, H: form.H, Dc: 0.25, surcharge: form.surcharge }),
    [form.qAllow, form.gammaSoil, form.gammaConc, form.H, form.surcharge],
  )
  const sizingOk = !rect || (form.sizingMode === 'ratio' ? form.ratio >= 1 : form.fixedBy > 0)
  const analyzeOk = !analyze || (form.givenB > 0 && form.givenDc > 0)
  const valid = Object.values(form).every((v) => typeof v === 'string' || Number.isFinite(v as number)) && qNetTrial > 0 && sizingOk && analyzeOk

  const view: View | null = useMemo(() => {
    if (!valid) return null
    const common = {
      serviceLoad: form.serviceLoad, ultimateLoad: form.ultimateLoad, columnWidth: form.columnWidth,
      fc: form.fc, fy: form.fy, qAllow: form.qAllow, gammaSoil: form.gammaSoil, gammaConc: form.gammaConc,
      H: form.H, barDia: form.barDia, cover: form.cover, surcharge: form.surcharge, position: form.position,
    }
    if (ecc) {
      const r = designEccentricSquareFooting({ ...common, serviceMoment: form.serviceMoment, ultimateMoment: form.ultimateMoment })
      return {
        type: 'square', loading: 'eccentric', ...designDefaults, Bx: r.B, By: r.B, Dc: r.Dc, qNet: r.qNet, qu: r.quMax,
        dPunch: r.dPunch, dBeamLong: r.dBeam, dBeamShort: r.dBeam, dProvided: r.Dc - form.cover - form.barDia,
        long: { As: r.steelArea, bars: r.bars, spacing: r.barSpacing, usedMin: r.usedMinSteel, rho: r.rho },
        short: null,
        ecc: { e: r.e, qMax: r.qMaxService, qMin: r.qMinService, kernOK: r.kernOK },
      }
    }
    if (!rect) {
      const r = designSquareFooting({
        ...common, analysis: form.analysisMethod, solutionMethod: form.solutionMethod,
        givenB: form.givenB, givenDc: form.givenDc,
      })
      return {
        type: 'square', loading: 'concentric', analysis: r.analysis, method: r.method,
        Bx: r.B, By: r.B, Dc: r.Dc, qNet: r.qNet, qu: r.qu,
        dPunch: r.dPunch, dBeamLong: r.dBeam, dBeamShort: r.dBeam, dProvided: r.dProvided,
        punchOK: r.punchOK, beamOK: r.beamOK,
        long: { As: r.steelArea, bars: r.bars, spacing: r.barSpacing, usedMin: r.usedMinSteel, rho: r.rho },
        short: null, ecc: null,
      }
    }
    const sizing = form.sizingMode === 'ratio'
      ? { mode: 'ratio' as const, ratio: form.ratio }
      : { mode: 'fixedWidth' as const, By: form.fixedBy }
    const r = designRectangularFooting({ ...common, sizing })
    return {
      type: 'rectangular', loading: 'concentric', ...designDefaults, Bx: r.Bx, By: r.By, Dc: r.Dc, qNet: r.qNet, qu: r.qu,
      dPunch: r.dPunch, dBeamLong: r.dBeamLong, dBeamShort: r.dBeamShort, dProvided: r.Dc - form.cover - form.barDia,
      long: r.long, short: r.short, ecc: null,
    }
  }, [form, valid, rect, ecc])

  const solutionSteps = useMemo(() => {
    if (!view) return null
    const ctx: SolutionCtx = {
      type: view.type, loading: view.loading, analysis: view.analysis, method: view.method,
      serviceLoad: form.serviceLoad, ultimateLoad: form.ultimateLoad,
      serviceMoment: form.serviceMoment, ultimateMoment: form.ultimateMoment,
      columnWidth: form.columnWidth, fc: form.fc, fy: form.fy,
      qAllow: form.qAllow, gammaSoil: form.gammaSoil, gammaConc: form.gammaConc, H: form.H,
      barDia: form.barDia, cover: form.cover, surcharge: form.surcharge, position: form.position,
      Bx: view.Bx, By: view.By, Dc: view.Dc, qNet: view.qNet, qu: view.qu,
      dPunch: view.dPunch, dBeamLong: view.dBeamLong, dBeamShort: view.dBeamShort, dProvided: view.dProvided,
      punchOK: view.punchOK, beamOK: view.beamOK,
      long: view.long, short: view.short, ecc: view.ecc,
    }
    return buildFoundationSolution(ctx)
  }, [view, form])

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Link to="/" className="no-print text-sm text-[#0056b3] hover:underline">← Home</Link>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#0056b3]">Foundation Design</h1>
      <p className="no-print mt-1 text-slate-600">Isolated footing (square / rectangular, concentric / eccentric) — React + typed engine. Results update live.</p>
      <ReportControls title="Foundation Design Report" />
      <ExcelImport onResult={setBatch} />

      {batch && (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm print-avoid-break">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
            <h2 className="text-[1.02rem] font-bold text-[#0056b3]">
              Batch schedule <span className="text-sm font-normal text-slate-500">({batch.designed}/{batch.rows.length} designed)</span>
            </h2>
            <button type="button" onClick={() => setBatch(null)} className="no-print text-xs text-slate-500 hover:text-slate-700 hover:underline">Clear</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2 font-semibold">Label</th>
                  <th className="px-4 py-2 font-semibold">Type</th>
                  <th className="px-4 py-2 font-semibold">Plan</th>
                  <th className="px-4 py-2 font-semibold">Dc</th>
                  <th className="px-4 py-2 font-semibold">Reinforcement</th>
                  <th className="px-4 py-2 font-semibold">Note</th>
                </tr>
              </thead>
              <tbody>
                {batch.rows.map((r, i) => (
                  <tr key={i} className={`border-t border-slate-100 ${r.ok ? '' : 'bg-red-50/60'}`}>
                    <td className="px-4 py-2 font-medium text-slate-700">{r.ok ? '✓' : '✗'} {r.label}</td>
                    <td className="px-4 py-2 text-slate-600">{r.type}</td>
                    <td className="px-4 py-2 text-slate-800">{r.size}</td>
                    <td className="px-4 py-2 text-slate-800">{r.thickness}</td>
                    <td className="px-4 py-2 text-slate-800">{r.steel}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {batch.unknownHeaders.length > 0 && (
            <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
              Ignored headers: {batch.unknownHeaders.join(', ')}
            </p>
          )}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* ── Inputs ── */}
        <div className="space-y-5">
          <Card title="Footing">
            <Select label="Type" value={form.footingType} onChange={set('footingType')}
              options={[['square', 'Isolated Square'], ['rectangular', 'Isolated Rectangular']]} />
            <Select label="Loading" value={form.loadingType} onChange={set('loadingType')}
              options={[['concentric', 'Concentric'], ['eccentric', 'Eccentric (uniaxial)']]} />
            {sq && (
              <Select label="Analysis method" value={form.analysisMethod} onChange={set('analysisMethod')}
                options={[['design', 'Detailed design'], ['analyze', 'Analyze given dimensions']]} />
            )}
            {sq && !analyze && (
              <Select label="Solution method" value={form.solutionMethod} onChange={set('solutionMethod')}
                options={[['iteration', 'Iteration'], ['approximate', 'Approximate (initial Dc)']]} />
            )}
            {analyze && (
              <NumField label="Given B" unit="m" value={form.givenB} onChange={set('givenB')} />
            )}
            {analyze && (
              <NumField label="Given Dc" unit="mm" value={form.givenDc} onChange={set('givenDc')} />
            )}
            {rect && (
              <Select label="Sizing" value={form.sizingMode} onChange={set('sizingMode')}
                options={[['ratio', 'By aspect ratio (Bx/By)'], ['fixedWidth', 'Fixed width By']]} />
            )}
            {rect && form.sizingMode === 'ratio' && (
              <NumField label="Aspect Bx/By" value={form.ratio} onChange={set('ratio')} />
            )}
            {rect && form.sizingMode === 'fixedWidth' && (
              <NumField label="Width By" unit="m" value={form.fixedBy} onChange={set('fixedBy')} />
            )}
            {ecc && (
              <p className="col-span-full text-xs text-slate-400">Eccentric is square-only in this pilot; the footing is sized to keep the load in the kern (no uplift).</p>
            )}
          </Card>

          <Card title="Loads & Column">
            <NumField label={<Math tex="P" />} unit="kN" value={form.serviceLoad} onChange={set('serviceLoad')} />
            <NumField label={<Math tex="P_u" />} unit="kN" value={form.ultimateLoad} onChange={set('ultimateLoad')} />
            {ecc && <NumField label={<Math tex="M" />} unit="kN·m" value={form.serviceMoment} onChange={set('serviceMoment')} />}
            {ecc && <NumField label={<Math tex="M_u" />} unit="kN·m" value={form.ultimateMoment} onChange={set('ultimateMoment')} />}
            <NumField label={<>Column <Math tex="c" /> (square)</>} unit="mm" value={form.columnWidth} onChange={set('columnWidth')} />
            <Select label="Column position" value={form.position} onChange={set('position')}
              options={[['interior', 'Interior'], ['edge', 'Edge'], ['corner', 'Corner']]} />
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
            <h2 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">Design preview</h2>
            {view ? (
              <FootingSchematic Bx={view.Bx} By={view.By} Dc={view.Dc} columnWidth={form.columnWidth} H={form.H} />
            ) : (
              <p className="py-8 text-center text-sm text-slate-400">Enter valid inputs — net bearing must be positive.</p>
            )}
          </div>

          {view && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">Results</h2>
              {view.analysis === 'analyze' && (
                <Row label="Adequacy" value={view.punchOK && view.beamOK ? '✓ section OK' : '✗ inadequate in shear'}
                  check={`punching ${view.punchOK ? '✓' : '✗'} · beam ${view.beamOK ? '✓' : '✗'}`} />
              )}
              {view.analysis === 'design' && view.type === 'square' && view.loading === 'concentric' && (
                <Row label="Method" value={view.method === 'iteration' ? 'Iteration' : 'Approximate'} />
              )}
              <Row label={<Math tex="q_{net}" />} value={`${f3(view.qNet)} kPa`} />
              <Row label="Footing size"
                value={view.type === 'square' ? `B = ${f2(view.Bx)} m` : `${f2(view.Bx)} × ${f2(view.By)} m`} />
              {view.ecc && (
                <>
                  <Row label={<>Eccentricity <Math tex="e = M/P" /></>} value={`${f3(view.ecc.e)} m`} check={`kern B/6 = ${f3(view.Bx / 6)} m`} />
                  <Row label={<Math tex="q_{max}/q_{min}" />} value={`${f2(view.ecc.qMax)} / ${f2(view.ecc.qMin)} kPa`}
                    check={view.ecc.kernOK ? '✓ no uplift, ≤ q_net' : '✗ check uplift'} />
                </>
              )}
              <Row label={view.ecc ? <Math tex="q_{u,max}" /> : <Math tex="q_u" />} value={`${f3(view.qu)} kPa`} />
              <Row label="Slab thickness Dc" value={`${f0(view.Dc)} mm`} />
              <Row label="d — punching"
                value={`${f0(view.dPunch)} mm`}
                check={view.type === 'square' ? `beam ${f0(view.dBeamLong)} mm` : `beam x/y ${f0(view.dBeamLong)}/${f0(view.dBeamShort)} mm`} />
              {view.type === 'square'
                ? steelRow('Steel (each way)', view.long, form.barDia)
                : (
                  <>
                    {steelRow('Steel — long (x)', view.long, form.barDia)}
                    {view.short && steelRow('Steel — short (y)', view.short, form.barDia)}
                    {view.short && (
                      <Row label="Central band (short)"
                        value={`${view.short.bandBars} of ${view.short.bars} bars`}
                        check={`band ≈ ${(view.short.bandFraction * 100).toFixed(0)}% in By`} />
                    )}
                  </>
                )}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
            <h2 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">Basis</h2>
            <Math block tex={String.raw`q_{net} = q_a - \gamma_s D_s - \gamma_c D_c - q,\quad P_u = \max(1.4D,\ 1.2D + 1.6L)`} />
            <p className="mt-1 text-xs text-slate-400">NSCP 2015 / ACI 318-14. φ: shear 0.75, flexure 0.90. Short-direction band per §413.3.3.3.</p>
          </div>
        </div>
      </div>

      {solutionSteps && <WorkedSolution steps={solutionSteps} />}
    </div>
  )
}
