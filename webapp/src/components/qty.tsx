import type { ReactNode } from 'react'
import type { ConcreteClass } from '../engine/quantities'
import { ReportControls } from './ReportControls'

/** Numeric input. */
export function Num({ label, unit, value, onChange, step = 'any', hint }: {
  label: ReactNode; unit?: string; value: number; onChange: (v: number) => void; step?: string; hint?: string
}) {
  return (
    <label className="flex flex-col text-sm">
      <span className="mb-1 text-[11.5px] font-semibold text-[#5c6675]">{label}</span>
      <span className="flex overflow-hidden rounded-md border border-[#d6d3c9] bg-[#fcfbf8] focus-within:border-[#0f4c92] focus-within:shadow-[0_0_0_3px_rgba(15,76,146,.14)]">
        <input type="number" inputMode="decimal" step={step} value={Number.isFinite(value) ? value : ''}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="min-w-0 flex-1 !rounded-none !border-0 !bg-transparent text-[13px] !shadow-none" />
        {unit && <span className="flex items-center border-l border-[#eeece5] bg-[#f7f6f1] px-2.5 font-mono text-[10.5px] text-[#a39d8d]">{unit}</span>}
      </span>
      {hint ? <span className="mt-0.5 text-[10px] text-[#a39d8d]">{hint}</span> : null}
    </label>
  )
}

export function Pick<T extends string>({ label, value, onChange, options }: {
  label: string; value: T; onChange: (v: T) => void; options: [T, string][]
}) {
  return (
    <label className="flex flex-col text-sm">
      <span className="mb-1 text-[11.5px] font-semibold text-[#5c6675]">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="text-[13px]">
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

/** Numbered input card (Foundation mockup): mono counter + title header row,
 *  hairline divider, field grid. Numbers auto-increment in DOM order via the
 *  `calc-card` CSS counter in index.css — no per-page wiring. */
export function Card({ title, hint, children }: { title: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="calc-card print-avoid-break rounded-lg border border-[#e3e1da] bg-white">
      <div className="flex items-baseline gap-2.5 border-b border-[#eeece5] px-4 py-3">
        <span aria-hidden className="calc-card-num font-mono text-[10.5px] font-semibold text-[#a39d8d]" />
        <h2 className="text-[13.5px] font-bold text-[#0f1b2a]">{title}</h2>
        {hint && <span className="ml-auto text-[11px] text-[#a39d8d]">{hint}</span>}
      </div>
      <div className="grid grid-cols-1 gap-3.5 p-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  )
}

export function ResultCard({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="print-avoid-break rounded-lg border border-[#e3e1da] bg-white p-4">
      <h2 className="mb-2 text-[13.5px] font-bold text-[#0f1b2a]">{title}</h2>
      {children}
    </div>
  )
}

export function Row({ label, value, sub, alert }: {
  label: ReactNode; value: ReactNode; sub?: ReactNode; alert?: boolean
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 border-b py-1.5 last:border-0 ${
      alert ? 'border-[#efd4cc] bg-[#fbeeea] px-2 -mx-2 rounded' : 'border-[#f3f1ea]'}`}>
      <span className={`text-[12px] ${alert ? 'text-[#8f2f1e]' : 'text-[#5c6675]'}`}>{label}</span>
      <span className={`text-right font-mono text-[12.5px] font-semibold ${alert ? 'text-[#c2402a]' : 'text-[#0f1b2a]'}`}>{value}</span>
      {sub ? <span className={`w-32 text-right text-[10.5px] ${alert ? 'text-[#c2402a]' : 'text-[#a39d8d]'}`}>{sub}</span> : null}
    </div>
  )
}

/** Standard page shell: back link, title, intro, report bar. */
export function QtyPage({ title, reportTitle, intro, children }: {
  title: string; reportTitle: string; intro: ReactNode; children: ReactNode
}) {
  return (
    <div className="mx-auto max-w-6xl px-5 py-5 sm:px-7">
      <h1 className="text-[21px] font-extrabold tracking-tight text-[#0f1b2a]">{title}</h1>
      <p className="no-print mt-1 text-[13px] text-[#5c6675]">{intro}</p>
      <ReportControls title={reportTitle} />
      <div className="mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)]">{children}</div>
    </div>
  )
}

export const kg = (v: number) => (Number.isFinite(v) ? `${v.toFixed(1)} kg` : '—')
export const m3 = (v: number) => (Number.isFinite(v) ? `${v.toFixed(2)} m³` : '—')
export const m = (v: number) => (Number.isFinite(v) ? `${v.toFixed(2)} m` : '—')
