import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { designSquareFooting } from '../engine/isolatedFooting'
import { designRectangularFooting } from '../engine/rectangularFooting'
import { designEccentricSquareFooting } from '../engine/eccentricFooting'
import { netBearing } from '../engine/bearing'
import type { ColumnPosition } from '../engine/shear'
import { FootingSchematic } from '../components/FootingSchematic'
import { ReportControls } from '../components/ReportControls'
import { Math } from '../lib/math'
import { f0, f2, f3 } from '../lib/format'
import 'katex/dist/katex.min.css'

type FootingType = 'square' | 'rectangular'
type SizingMode = 'ratio' | 'fixedWidth'
type LoadingType = 'concentric' | 'eccentric'

interface FormState {
  footingType: FootingType
  loadingType: LoadingType
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
  Bx: number; By: number; Dc: number; qNet: number; qu: number
  dPunch: number; dBeamLong: number; dBeamShort: number
  long: DirSteel
  short: (DirSteel & { bandBars: number; bandFraction: number }) | null
  ecc: { e: number; qMax: number; qMin: number; kernOK: boolean } | null
}

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
  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) => setForm((s) => ({ ...s, [k]: v }))
  const ecc = form.loadingType === 'eccentric'
  const rect = form.footingType === 'rectangular' && !ecc   // eccentric pilot is square-only

  const qNetTrial = useMemo(
    () => netBearing({ qAllow: form.qAllow, gammaSoil: form.gammaSoil, gammaConc: form.gammaConc, H: form.H, Dc: 0.25, surcharge: form.surcharge }),
    [form.qAllow, form.gammaSoil, form.gammaConc, form.H, form.surcharge],
  )
  const sizingOk = !rect || (form.sizingMode === 'ratio' ? form.ratio >= 1 : form.fixedBy > 0)
  const valid = Object.values(form).every((v) => typeof v === 'string' || Number.isFinite(v as number)) && qNetTrial > 0 && sizingOk

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
        type: 'square', loading: 'eccentric', Bx: r.B, By: r.B, Dc: r.Dc, qNet: r.qNet, qu: r.quMax,
        dPunch: r.dPunch, dBeamLong: r.dBeam, dBeamShort: r.dBeam,
        long: { As: r.steelArea, bars: r.bars, spacing: r.barSpacing, usedMin: r.usedMinSteel, rho: r.rho },
        short: null,
        ecc: { e: r.e, qMax: r.qMaxService, qMin: r.qMinService, kernOK: r.kernOK },
      }
    }
    if (!rect) {
      const r = designSquareFooting(common)
      return {
        type: 'square', loading: 'concentric', Bx: r.B, By: r.B, Dc: r.Dc, qNet: r.qNet, qu: r.qu,
        dPunch: r.dPunch, dBeamLong: r.dBeam, dBeamShort: r.dBeam,
        long: { As: r.steelArea, bars: r.bars, spacing: r.barSpacing, usedMin: r.usedMinSteel, rho: r.rho },
        short: null, ecc: null,
      }
    }
    const sizing = form.sizingMode === 'ratio'
      ? { mode: 'ratio' as const, ratio: form.ratio }
      : { mode: 'fixedWidth' as const, By: form.fixedBy }
    const r = designRectangularFooting({ ...common, sizing })
    return {
      type: 'rectangular', loading: 'concentric', Bx: r.Bx, By: r.By, Dc: r.Dc, qNet: r.qNet, qu: r.qu,
      dPunch: r.dPunch, dBeamLong: r.dBeamLong, dBeamShort: r.dBeamShort,
      long: r.long, short: r.short, ecc: null,
    }
  }, [form, valid, rect, ecc])

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Link to="/" className="no-print text-sm text-[#0056b3] hover:underline">← Home</Link>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#0056b3]">Foundation Design</h1>
      <p className="no-print mt-1 text-slate-600">Isolated footing (square / rectangular, concentric / eccentric) — React + typed engine. Results update live.</p>
      <ReportControls title="Foundation Design Report" />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* ── Inputs ── */}
        <div className="space-y-5">
          <Card title="Footing">
            <Select label="Type" value={form.footingType} onChange={set('footingType')}
              options={[['square', 'Isolated Square'], ['rectangular', 'Isolated Rectangular']]} />
            <Select label="Loading" value={form.loadingType} onChange={set('loadingType')}
              options={[['concentric', 'Concentric'], ['eccentric', 'Eccentric (uniaxial)']]} />
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
    </div>
  )
}
