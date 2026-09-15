import { useEffect, useId, useRef, useState } from 'react'
import type { CodeHintSpec } from '../lib/devLengthHints'

// ─────────────────────────────────────────────────────────────────────────
// A "?" button beside an input that opens the clause behind it.
//
// The page asks for a factor and shows the number it produced. The step in
// between — WHICH ROW of which table you are choosing, and why the table is
// shaped that way — was never on screen, so the page could only be used by
// someone who already knew the answer.
//
// Deliberately not a tooltip: the content is a table and a paragraph, it has
// to be readable long enough to compare rows, and it has to work on touch.
// So it is a click-to-open popover that closes on Escape, on outside click,
// and on a second click of its own button.
// ─────────────────────────────────────────────────────────────────────────

export function CodeHint({ spec }: { spec: CodeHintSpec }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLSpanElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  return (
    <span ref={wrap} className="no-print relative inline-block align-middle">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`Code guidance — ${spec.title}`}
        title={spec.clause}
        onClick={() => setOpen((v) => !v)}
        className={`ml-1 inline-flex h-[15px] w-[15px] items-center justify-center rounded-full border text-[10px] font-bold leading-none transition-colors ${
          open
            ? 'border-brand bg-brand text-on-solid'
            : 'border-faint bg-sheet text-faint hover:border-brand-hover hover:text-brand'
        }`}
      >?</button>

      {open && (
        <span id={id} role="dialog" aria-label={spec.title}
          // Anchored to the button but allowed to spill left near the right
          // edge of a card; the width is capped so a long clause statement
          // wraps instead of stretching the column.
          className="absolute left-0 top-[20px] z-50 block w-[min(21rem,78vw)] rounded-lg border border-field-line bg-sheet p-3 text-left shadow-[0_8px_24px_rgba(15,27,42,.16)]">
          <span className="mb-1 flex items-baseline gap-2">
            <span className="text-[12px] font-bold text-ink">{spec.title}</span>
            <button type="button" onClick={() => setOpen(false)}
              aria-label="Close" className="ml-auto text-[13px] leading-none text-faint hover:text-muted">×</button>
          </span>
          <span className="mb-2 block font-mono text-[10px] font-semibold text-brand">{spec.clause}</span>
          <span className="block text-[11.5px] leading-relaxed text-muted">{spec.statement}</span>

          {spec.table && (
            <span className="mt-2 block overflow-x-auto">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr>
                    {spec.table.head.map((h) => (
                      <th key={h} className="border-b border-field-line px-1.5 py-1 text-left font-semibold text-ink">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {spec.table.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j} className={`border-b border-hairline-2 px-1.5 py-1 align-top ${
                          j === row.length - 1 ? 'font-mono font-semibold text-ink' : 'text-muted'}`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </span>
          )}

          {spec.why && (
            <span className="mt-2 block border-t border-hairline-2 pt-2 text-[10.5px] leading-relaxed text-faint">
              {spec.why}
            </span>
          )}
        </span>
      )}
    </span>
  )
}
