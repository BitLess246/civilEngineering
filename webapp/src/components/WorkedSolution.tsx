import { useState, type JSX } from 'react'
import type { SolutionStep } from '../lib/solution'
import { Math } from '../lib/math'

/** Calculation-report panel (docs/design/uiux-2026-07): numbered steps with a
 *  code-clause margin column and PASS chips, with Worked solution / Summary
 *  tabs — the summary keeps only titles, chips and notes. Print-friendly. */
export function WorkedSolution({ steps, title = 'Calculation report — worked solution' }: {
  steps: SolutionStep[]; title?: string
}): JSX.Element {
  const [mode, setMode] = useState<'worked' | 'summary'>('worked')
  const tab = (id: 'worked' | 'summary', label: string) => (
    <button type="button" onClick={() => setMode(id)}
      className={`pb-0.5 text-[11.5px] font-semibold ${mode === id ? 'border-b-2 border-[#0f4c92] text-[#0f4c92]' : 'text-[#a39d8d] hover:text-[#5c6675]'}`}>
      {label}
    </button>
  )
  return (
    <div className="mt-6 rounded-lg border border-[#e3e1da] bg-white print-avoid-break">
      <div className="flex items-center gap-2.5 border-b border-[#eeece5] px-4 py-3">
        <span className="font-mono text-[10.5px] font-semibold text-[#a39d8d]">05</span>
        <h2 className="text-[13.5px] font-bold text-[#0f1b2a]">{title}</h2>
        <span className="no-print ml-auto inline-flex gap-3.5">{tab('worked', 'Worked solution')}{tab('summary', 'Summary only')}</span>
      </div>
      <ol className="px-1 py-1.5">
        {steps.map((s, i) => (
          <li key={i} className="print-avoid-break grid grid-cols-[1fr_120px] gap-4 border-b border-[#f3f1ea] px-3 py-3 last:border-0">
            <div>
              <h3 className="text-[12.5px] font-bold text-[#0f1b2a]">
                <span className="mr-1.5 font-mono font-semibold text-[#a39d8d]">{i + 1}</span>{s.title}
              </h3>
              {mode === 'worked' && (
                <div className="mt-1.5 space-y-1.5 pl-4">
                  {s.lines.map((ln, j) => (
                    'text' in ln
                      ? <p key={j} className="text-[12px] leading-relaxed text-[#5c6675]">{ln.text}</p>
                      : <div key={j} className="overflow-x-auto rounded-md border border-[#eeece5] bg-[#f9f8f4] px-3 py-1 text-[0.92rem] text-[#1e2c3d]"><Math block tex={ln.tex} /></div>
                  ))}
                </div>
              )}
              {s.note && <p className="mt-1.5 pl-4 text-[10.5px] text-[#a39d8d]">{s.note}</p>}
            </div>
            <div className="pt-0.5">
              {s.pass !== undefined && (
                <span className={`inline-block rounded px-1.5 py-px font-mono text-[10px] font-semibold ${s.pass ? 'bg-[#ddefe3] text-[#14603a]' : 'bg-[#fbeeea] text-[#c2402a]'}`}>
                  {s.pass ? 'PASS' : 'FAIL'}
                </span>
              )}
              {s.clause && <p className="mt-1.5 text-[10.5px] leading-snug text-[#a39d8d]">{s.clause}</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
