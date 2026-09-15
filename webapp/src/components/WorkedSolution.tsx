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
      className={`pb-0.5 text-[11.5px] font-semibold ${mode === id ? 'border-b-2 border-brand text-brand' : 'text-faint hover:text-muted'}`}>
      {label}
    </button>
  )
  return (
    <div className="mt-6 rounded-lg border border-hairline bg-sheet print-avoid-break">
      <div className="flex items-center gap-2.5 border-b border-hairline-2 px-4 py-3">
        <span className="font-mono text-[10.5px] font-semibold text-faint">05</span>
        <h2 className="text-[13.5px] font-bold text-ink">{title}</h2>
        <span className="no-print ml-auto inline-flex gap-3.5">{tab('worked', 'Worked solution')}{tab('summary', 'Summary only')}</span>
      </div>
      <ol className="px-1 py-1.5">
        {steps.map((s, i) => (
          // minmax(0,…) on the wide track, not 1fr: a grid track's automatic
          // minimum is its CONTENT, so one long equation stretched the column
          // past the card instead of scrolling inside it, and carried the
          // clause margin out over the border with it. `min-w-0` says the same
          // thing to the child, which is what actually lets `overflow-x-auto`
          // below take effect.
          <li key={i} className="print-avoid-break grid grid-cols-[minmax(0,1fr)_120px] gap-4 border-b border-hairline-2 px-3 py-3 last:border-0">
            <div className="min-w-0">
              <h3 className="text-[12.5px] font-bold text-ink">
                <span className="mr-1.5 font-mono font-semibold text-faint">{i + 1}</span>{s.title}
              </h3>
              {mode === 'worked' && (
                <div className="mt-1.5 space-y-1.5 pl-4">
                  {s.lines.map((ln, j) => (
                    'text' in ln
                      ? <p key={j} className="text-[12px] leading-relaxed text-muted">{ln.text}</p>
                      : <div key={j} className="overflow-x-auto rounded-md border border-hairline-2 bg-sheet-2 px-3 py-1 text-[0.92rem] text-ink-2"><Math block tex={ln.tex} /></div>
                  ))}
                </div>
              )}
              {s.note && <p className="mt-1.5 pl-4 text-[10.5px] text-faint">{s.note}</p>}
            </div>
            <div className="pt-0.5">
              {s.pass !== undefined && (
                <span className={`inline-block rounded px-1.5 py-px font-mono text-[10px] font-semibold ${s.pass ? 'bg-ok-tint text-ok' : 'bg-fail-tint text-fail'}`}>
                  {s.pass ? 'PASS' : 'FAIL'}
                </span>
              )}
              {s.clause && <p className="mt-1.5 text-[10.5px] leading-snug text-faint">{s.clause}</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
