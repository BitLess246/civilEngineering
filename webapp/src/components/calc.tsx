import type { ReactNode } from 'react'

// Calculator-template building blocks (docs/design/uiux-2026-07, Foundation /
// Beam mockups): numbered input sections on the left, a sticky verdict panel
// on the right — pass/fail banner, key outputs in mono, utilization bars with
// the amber ≥ 0.95 warning band. Presentation only; pages feed engine results.

export function PageHeader({ title, badges, actions }: { title: string; badges: string[]; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[#e3e1da] bg-white px-5 py-3.5 sm:px-7">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <h1 className="text-[21px] font-extrabold tracking-tight text-[#0f1b2a]">{title}</h1>
        {badges.map((b) => (
          <span key={b} className="whitespace-nowrap rounded border border-[#cddcf0] bg-[#eaf1f9] px-1.5 py-px font-mono text-[10px] font-medium text-[#0f4c92]">{b}</span>
        ))}
      </div>
      {actions && <div className="no-print ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function CalcSection({ num, title, hint, children, grid = true }: {
  num: string; title: string; hint?: string; children: ReactNode; grid?: boolean
}) {
  return (
    <section className="rounded-lg border border-[#e3e1da] bg-white print-avoid-break">
      <div className="flex items-baseline gap-2.5 border-b border-[#eeece5] px-4 py-3">
        <span className="font-mono text-[10.5px] font-semibold text-[#a39d8d]">{num}</span>
        <h2 className="text-[13.5px] font-bold text-[#0f1b2a]">{title}</h2>
        {hint && <span className="ml-auto text-[11px] text-[#a39d8d]">{hint}</span>}
      </div>
      <div className={grid ? 'grid grid-cols-1 gap-3.5 p-4 sm:grid-cols-2 lg:grid-cols-3' : 'p-4'}>{children}</div>
    </section>
  )
}

export interface VerdictStat { label: string; value: string; unit?: string }
export interface VerdictCheck { name: string; ratio: number }

const barColor = (r: number) => (r > 1.0001 ? '#c2402a' : r >= 0.95 ? '#b97d10' : '#1a7f4b')

export function UtilBar({ c }: { c: VerdictCheck }) {
  const color = barColor(c.ratio)
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11.5px] font-semibold text-[#3d4a5c]">{c.name}</span>
        <span className="font-mono text-[11px]" style={{ color }}>{c.ratio.toFixed(2)}</span>
      </div>
      <div className="mt-1 h-[5px] overflow-hidden rounded-[3px] bg-[#eeece5]">
        <div className="h-full rounded-[3px]" style={{ background: color, width: `${Math.min(100, c.ratio * 100)}%` }} />
      </div>
    </div>
  )
}

export function VerdictPanel({ ok, headline, governing, stats, checks, footnote }: {
  ok: boolean; headline: string; governing?: string
  stats: VerdictStat[]; checks: VerdictCheck[]; footnote?: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#e3e1da] bg-white print-avoid-break">
      <div className={`flex items-center gap-2.5 border-b px-4 py-3 ${ok ? 'border-[#d3e8da] bg-[#ecf6ef]' : 'border-[#efd4cc] bg-[#fbeeea]'}`}>
        <span className={`flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full text-white ${ok ? 'bg-[#1a7f4b]' : 'bg-[#c2402a]'}`}>
          {ok
            ? <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            : <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>}
        </span>
        <div className="min-w-0">
          <p className={`text-[13px] font-extrabold tracking-wide ${ok ? 'text-[#14603a]' : 'text-[#8f2f1e]'}`}>{headline}</p>
          {governing && <p className={`mt-px truncate text-[11px] ${ok ? 'text-[#4d7a5f]' : 'text-[#a95b47]'}`}>{governing}</p>}
        </div>
      </div>
      {stats.length > 0 && (
        <div className="grid border-b border-[#eeece5]" style={{ gridTemplateColumns: `repeat(${stats.length}, 1fr)` }}>
          {stats.map((s, i) => (
            <div key={s.label} className={`px-3.5 py-3 ${i < stats.length - 1 ? 'border-r border-[#eeece5]' : ''}`}>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a39d8d]">{s.label}</p>
              <p className="mt-0.5 truncate font-mono text-[15px] font-semibold text-[#0f1b2a]">
                {s.value}{s.unit && <span className="text-[11px] text-[#a39d8d]"> {s.unit}</span>}
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2.5 px-4 py-3.5">
        {checks.map((c) => <UtilBar key={c.name} c={c} />)}
        {footnote && <p className="mt-0.5 text-[10.5px] text-[#a39d8d]">{footnote}</p>}
      </div>
    </section>
  )
}

/** Right-rail card with the drawing-sheet grid backdrop. */
export function DrawingCard({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-[#e3e1da] bg-white print-avoid-break">
      <div className="flex items-center justify-between border-b border-[#eeece5] px-4 py-3">
        <h2 className="text-[13.5px] font-bold text-[#0f1b2a]">{title}</h2>
        {meta && <span className="font-mono text-[10px] text-[#a39d8d]">{meta}</span>}
      </div>
      <div className="p-3 [background-image:linear-gradient(#f0eee7_1px,transparent_1px),linear-gradient(90deg,#f0eee7_1px,transparent_1px)] [background-size:22px_22px]">
        {children}
      </div>
    </section>
  )
}
