import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { ConcreteClass } from '../engine/quantities'
import { ReportControls } from './ReportControls'

/** Numeric input. */
export function Num({ label, unit, value, onChange, step = 'any' }: {
  label: ReactNode; unit?: string; value: number; onChange: (v: number) => void; step?: string
}) {
  return (
    <label className="flex flex-col text-sm">
      <span className="mb-1 font-medium text-slate-600">
        {label}{unit ? <span className="text-slate-400"> ({unit})</span> : null}
      </span>
      <input type="number" inputMode="decimal" step={step} value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="rounded-md border border-slate-300 px-2.5 py-1.5 text-slate-800 focus:border-[#0056b3] focus:outline-none focus:ring-1 focus:ring-[#0056b3]" />
    </label>
  )
}

export function Pick<T extends string>({ label, value, onChange, options }: {
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

export function ClassPick({ value, onChange }: { value: ConcreteClass; onChange: (v: ConcreteClass) => void }) {
  return (
    <Pick label="Concrete class" value={value} onChange={onChange}
      options={[['AA', 'AA (12 bags/m³)'], ['A', 'A (9)'], ['B', 'B (7.5)'], ['C', 'C (6)'], ['custom', 'Custom factor']]} />
  )
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="print-avoid-break rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <legend className="px-2 text-[1.02rem] font-bold text-[#0056b3]">{title}</legend>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </fieldset>
  )
}

export function ResultCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="print-avoid-break rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-[1.02rem] font-bold text-[#0056b3]">{title}</h2>
      {children}
    </div>
  )
}

export function Row({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1.5 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-right text-sm font-semibold text-slate-800">{value}</span>
      {sub ? <span className="w-32 text-right text-xs text-slate-500">{sub}</span> : null}
    </div>
  )
}

/** Standard page shell: back link, title, intro, report bar. `after` renders
 *  full-width below the two-column grid (e.g. a worked-solution panel). */
export function QtyPage({ title, reportTitle, intro, children, after }: {
  title: string; reportTitle: string; intro: ReactNode; children: ReactNode; after?: ReactNode
}) {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <Link to="/" className="no-print text-sm text-[#0056b3] hover:underline">← Home</Link>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#0056b3]">{title}</h1>
      <p className="no-print mt-1 text-slate-600">{intro}</p>
      <ReportControls title={reportTitle} />
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">{children}</div>
      {after}
    </div>
  )
}

export const kg = (v: number) => (Number.isFinite(v) ? `${v.toFixed(1)} kg` : '—')
export const m3 = (v: number) => (Number.isFinite(v) ? `${v.toFixed(2)} m³` : '—')
export const m = (v: number) => (Number.isFinite(v) ? `${v.toFixed(2)} m` : '—')
