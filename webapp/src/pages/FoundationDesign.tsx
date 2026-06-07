import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { designSquareFooting } from '../engine/isolatedFooting'
import { netBearing } from '../engine/bearing'
import type { ColumnPosition } from '../engine/shear'
import { FootingSchematic } from '../components/FootingSchematic'
import { Math } from '../lib/math'
import { f0, f2, f3 } from '../lib/format'
import 'katex/dist/katex.min.css'

interface FormState {
  serviceLoad: number
  ultimateLoad: number
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
  serviceLoad: 1000,
  ultimateLoad: 1400,
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
      {check ? <span className="w-28 text-right text-xs text-slate-500">{check}</span> : null}
    </div>
  )
}

export default function FoundationDesign() {
  const [form, setForm] = useState<FormState>(DEFAULTS)
  const set = <K extends keyof FormState>(k: K) => (v: FormState[K]) => setForm((s) => ({ ...s, [k]: v }))

  const qNetTrial = useMemo(
    () => netBearing({ qAllow: form.qAllow, gammaSoil: form.gammaSoil, gammaConc: form.gammaConc, H: form.H, Dc: 0.25, surcharge: form.surcharge }),
    [form.qAllow, form.gammaSoil, form.gammaConc, form.H, form.surcharge],
  )

  const valid = Object.values(form).every((v) => typeof v === 'string' || Number.isFinite(v as number)) && qNetTrial > 0
  const result = useMemo(() => (valid ? designSquareFooting(form) : null), [form, valid])

  return (
    <div className="mx-auto max-w-6xl p-6">
      <Link to="/" className="text-sm text-[#0056b3] hover:underline">← Home</Link>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#0056b3]">Foundation Design</h1>
      <p className="mt-1 text-slate-600">Isolated square footing, concentric load — React + typed engine pilot. Results update live.</p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* ── Inputs ── */}
        <div className="space-y-5">
          <Card title="Loads & Column">
            <NumField label={<Math tex="P" />} unit="kN" value={form.serviceLoad} onChange={set('serviceLoad')} />
            <NumField label={<Math tex="P_u" />} unit="kN" value={form.ultimateLoad} onChange={set('ultimateLoad')} />
            <NumField label={<>Column <Math tex="c" /> (square)</>} unit="mm" value={form.columnWidth} onChange={set('columnWidth')} />
            <label className="flex flex-col text-sm">
              <span className="mb-1 font-medium text-slate-600">Column position</span>
              <select value={form.position} onChange={(e) => set('position')(e.target.value as FormState['position'])}
                className="rounded-md border border-slate-300 px-2.5 py-1.5 text-slate-800 focus:border-[#0056b3] focus:outline-none">
                <option value="interior">Interior</option>
                <option value="edge">Edge</option>
                <option value="corner">Corner</option>
              </select>
            </label>
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
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">Design preview</h2>
            {result ? (
              <FootingSchematic B={result.B} Dc={result.Dc} columnWidth={form.columnWidth} H={form.H} />
            ) : (
              <p className="py-8 text-center text-sm text-slate-400">Enter valid inputs — net bearing must be positive.</p>
            )}
          </div>

          {result && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">Results</h2>
              <Row label={<Math tex="q_{net}" />} value={`${f3(result.qNet)} kPa`} />
              <Row label="Footing size B" value={`${f2(result.B)} m`} />
              <Row label={<Math tex="q_u = P_u/B^2" />} value={`${f3(result.qu)} kPa`} />
              <Row label="Slab thickness Dc" value={`${f0(result.Dc)} mm`} check={`d≈${f0(result.dFlex)} mm`} />
              <Row label="d — punching / beam" value={`${f0(result.dPunch)} / ${f0(result.dBeam)} mm`} />
              <Row label="Steel As" value={`${f0(result.steelArea)} mm²`} check={result.usedMinSteel ? 'ρ_min governs' : `ρ=${result.rho.toFixed(4)}`} />
              <Row label="Reinforcement" value={`${result.bars} ⌀${form.barDia} mm`} check={`@ ${f0(result.barSpacing)} mm o.c.`} />
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
            <h2 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">Basis</h2>
            <Math block tex={String.raw`q_{net} = q_a - \gamma_s D_s - \gamma_c D_c - q`} />
            <Math block tex={String.raw`P_u = \max(1.4D,\ 1.2D + 1.6L),\quad B = \sqrt{P/q_{net}}`} />
            <p className="mt-1 text-xs text-slate-400">NSCP 2015 / ACI 318-14. φ: shear 0.75, flexure 0.90.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
