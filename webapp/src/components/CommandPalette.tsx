import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ALL_TOOLS } from '../lib/tools'
import { useToolPrefs } from '../lib/useToolPrefs'
import { isHidden } from '../lib/toolPrefs'

// ⌘K command palette — fuzzy tool finder over the registry. Opened by the
// sidebar / home search boxes or Ctrl/⌘+K anywhere; arrow keys + Enter
// navigate, Escape closes. Pure UI on top of lib/tools.
//
// Mount it CONDITIONALLY (`{open && <CommandPalette … />}`) rather than passing
// an `open` prop: a fresh mount gives fresh query/selection state, so the reset
// does not need an effect that sets state on every open.
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  // Selection resets when the query changes. Adjusting state during render (the
  // pattern React documents for derived state) rather than in an effect avoids
  // rendering one frame with a stale, possibly out-of-range index.
  const [prevQ, setPrevQ] = useState(q)
  if (q !== prevQ) { setPrevQ(q); setSel(0) }
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // THE PALETTE SEARCHES EVERYTHING, INCLUDING HIDDEN GROUPS.
  //
  // Hiding a discipline trims navigation; it does not take the tools away. This
  // is the escape hatch that makes that true — somebody who hid Geotechnical
  // and now needs bearing capacity once should find it by typing, not by going
  // to their profile to re-enable a whole discipline first.
  //
  // Hidden hits sort AFTER visible ones, so the ranking still reflects the
  // stated preference, and they are tagged so the result is not confusing.
  const prefs = useToolPrefs()
  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const matched = !needle ? ALL_TOOLS : ALL_TOOLS.filter((t) =>
      `${t.name} ${t.sub} ${t.groupLabel}`.toLowerCase().includes(needle))
    const marked = matched.map((t) => ({ ...t, hidden: isHidden(t.groupLabel, prefs) }))
    return [...marked.filter((t) => !t.hidden), ...marked.filter((t) => t.hidden)]
  }, [q, prefs])

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const go = (to: string) => { onClose(); nav(to) }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter' && hits[sel]) { e.preventDefault(); go(hits[sel].to) }
    else if (e.key === 'Escape') onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-[#0f1b2a]/45 p-4 pt-[12vh]" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label="Find a tool">
      <div className="w-full max-w-xl overflow-hidden rounded-lg border border-[#e3e1da] bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-[#eeece5] px-4 py-3">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#a39d8d" strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder={`Search ${ALL_TOOLS.length} tools — try "footing", "W-shape", "seismic"…`}
            className="flex-1 !border-0 !bg-transparent !p-0 text-sm !shadow-none placeholder:text-[#a39d8d] focus:!shadow-none" />
          <kbd className="rounded border border-[#d6d3c9] px-1.5 py-0.5 font-mono text-[10px] text-[#a39d8d]">esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[46vh] overflow-y-auto py-1.5">
          {hits.length === 0 && <p className="px-4 py-6 text-center text-sm text-[#a39d8d]">No tool matches “{q}”.</p>}
          {hits.map((t, i) => (
            <button key={t.to + t.name} type="button" data-selected={i === sel}
              onMouseEnter={() => setSel(i)} onClick={() => go(t.to)}
              className={`flex w-full items-baseline gap-3 px-4 py-2 text-left ${i === sel ? 'bg-[#eaf1f9]' : ''}`}>
              <span className={`text-[13px] font-semibold ${i === sel ? 'text-[#0f4c92]' : 'text-[#0f1b2a]'}`}>{t.name}</span>
              <span className="font-mono text-[10.5px] text-[#8b8574]">{t.sub}</span>
              {t.hidden && (
                <span className="rounded border border-[#e3e1da] bg-[#f7f5ef] px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-[#a39d8d]"
                  title="Not in your sidebar — still works">hidden</span>
              )}
              <span className="ml-auto font-mono text-[9.5px] uppercase tracking-widest text-[#a39d8d]">{t.groupLabel}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
