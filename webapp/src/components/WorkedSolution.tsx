import { useState, type JSX } from 'react'
import type { SolutionStep } from '../lib/solution'
import { Math } from '../lib/math'

/** Collapsible step-by-step worked-solution panel (KaTeX, print-friendly). */
export function WorkedSolution({ steps, title = 'Solution — step by step' }: {
  steps: SolutionStep[]; title?: string
}): JSX.Element {
  const [open, setOpen] = useState(true)
  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm print-avoid-break">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <h2 className="text-[1.02rem] font-bold text-[#0056b3]">{title}</h2>
        <span className="no-print text-sm text-slate-400">{open ? 'Hide ▲' : 'Show ▼'}</span>
      </button>

      {open && (
        <ol className="space-y-4 border-t border-slate-100 px-4 py-4">
          {steps.map((s, i) => (
            <li key={i} className="print-avoid-break">
              <h3 className="mb-1.5 text-sm font-semibold text-slate-800">
                <span className="text-slate-400">{i + 1}.</span> {s.title}
              </h3>
              <div className="space-y-1.5 pl-4">
                {s.lines.map((ln, j) => (
                  'text' in ln
                    ? <p key={j} className="text-sm leading-relaxed text-slate-600">{ln.text}</p>
                    : <div key={j} className="overflow-x-auto text-[0.95rem] text-slate-700"><Math block tex={ln.tex} /></div>
                ))}
              </div>
              {s.note && <p className="mt-1 pl-4 text-xs text-slate-500">{s.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
