import { useState, type JSX } from 'react'
import type { SolutionStep } from '../lib/solution'
import { Math } from '../lib/math'

/** Collapsible step-by-step worked-solution panel (KaTeX, print-friendly). */
export function WorkedSolution({ steps, title = 'Solution — step by step' }: {
  steps: SolutionStep[]; title?: string
}): JSX.Element {
  const [open, setOpen] = useState(true)
  return (
    <div className="mt-6 rounded-lg border border-[#e3e1da] bg-white print-avoid-break">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left">
        <span className="font-mono text-[10.5px] font-semibold text-[#a39d8d]">05</span>
        <h2 className="text-[13.5px] font-bold text-[#0f1b2a]">{title}</h2>
        <span className="no-print ml-auto text-xs text-[#a39d8d]">{open ? 'Hide ▲' : 'Show ▼'}</span>
      </button>

      {open && (
        <ol className="space-y-4 border-t border-[#eeece5] px-4 py-4">
          {steps.map((s, i) => (
            <li key={i} className="print-avoid-break">
              <h3 className="mb-1.5 text-[12.5px] font-bold text-[#0f1b2a]">
                <span className="mr-1.5 font-mono font-semibold text-[#a39d8d]">{i + 1}</span>{s.title}
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
