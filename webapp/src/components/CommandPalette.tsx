import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ALL_TOOLS, PALETTE_EXAMPLES, isGatedRoute } from '../lib/tools'
import { useFocusTrap } from '../lib/useFocusTrap'
import { useToolPrefs } from '../lib/useToolPrefs'
import { isHidden } from '../lib/toolPrefs'

// ⌘K command palette — fuzzy tool finder over the registry. Opened by the
// sidebar / home search boxes or Ctrl/⌘+K anywhere; arrow keys + Enter
// navigate, Escape closes. Pure UI on top of lib/tools. Recents lead on empty
// query; typed queries use subsequence-fuzzy ranking over name + sub + group.
//
// Mount it CONDITIONALLY (`{open && <CommandPalette … />}`) rather than passing
// an `open` prop: a fresh mount gives fresh query/selection state, so the reset
// does not need an effect that sets state on every open.
const RECENT_KEY = 'palette-recent'
function loadRecents(): string[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(RECENT_KEY) : null
    const v: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 5) : []
  } catch { return [] }
}
function saveRecent(to: string): void {
  try {
    if (typeof localStorage === 'undefined') return
    const next = [to, ...loadRecents().filter((x) => x !== to)].slice(0, 5)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch { /* quota, or blocked */ }
}
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
  const panelRef = useRef<HTMLDivElement>(null)
  // Trapped + return-focus: an untrapped palette lets Tab walk out into the
  // dimmed page that aria-modal hides from screen readers.
  useFocusTrap(panelRef, true, onClose)

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
  // Recents first on empty query; subsequence-fuzzy on typed query so `bem`
  // still finds `beam`. Typo tolerance without a dependency: score rewards
  // compact early matches, hidden hits still sort after visible ones.
  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const hay = (t: (typeof ALL_TOOLS)[number]) =>
      `${t.name} ${t.sub} ${t.groupLabel}`.toLowerCase()
    const fuzzy = (h: string, n: string): number => {
      if (!n) return 0
      let hi = 0, score = 0, last = -1
      for (let ni = 0; ni < n.length; ni++) {
        const c = n[ni]
        const at = h.indexOf(c, hi)
        if (at < 0) return -1
        score += 1 / (1 + (at - last - 1) + at * 0.05)
        last = at; hi = at + 1
      }
      return score
    }
    const marked = ALL_TOOLS.map((t) => ({ ...t, hidden: isHidden(t.groupLabel, prefs) }))
    if (!needle) {
      const order = new Map(loadRecents().map((to, i) => [to, i] as const))
      const rank = (t: { to: string; hidden: boolean }) =>
        (order.has(t.to) ? order.get(t.to)! - 100 : 0) + (t.hidden ? 50 : 0)
      return [...marked].sort((a, b) => rank(a) - rank(b))
    }
    return marked
      .map((t) => ({ ...t, score: fuzzy(hay(t), needle) }))
      .filter((t) => t.score >= 0)
      .sort((a, b) => (a.hidden ? 1 : 0) - (b.hidden ? 1 : 0) || b.score - a.score)
  }, [q, prefs])

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const go = (to: string) => { saveRecent(to); onClose(); nav(to) }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter' && hits[sel]) { e.preventDefault(); go(hits[sel].to) }
    else if (e.key === 'Escape') onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-rail/45 p-4 pt-[12vh]" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label="Find a tool">
      <div ref={panelRef} tabIndex={-1} className="w-full max-w-xl overflow-hidden rounded-lg border border-hairline bg-sheet shadow-2xl outline-none" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-hairline-2 px-4 py-3">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" className="text-faint"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></svg>
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder={`Search ${ALL_TOOLS.length} tools — ${PALETTE_EXAMPLES}`}
            className="flex-1 !border-0 !bg-transparent !p-0 text-sm !shadow-none placeholder:text-faint focus:!shadow-none" />
          <kbd className="rounded border border-field-line px-1.5 py-0.5 font-mono text-[10px] text-faint">esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[46vh] overflow-y-auto py-1.5">
          {hits.length === 0 && <p className="px-4 py-6 text-center text-sm text-faint">No tool matches “{q}”.</p>}
          {hits.map((t, i) => (
            <button key={t.to + t.name} type="button" data-selected={i === sel}
              onMouseEnter={() => setSel(i)} onClick={() => go(t.to)}
              className={`flex w-full items-baseline gap-3 px-4 py-2 text-left ${i === sel ? 'bg-brand-tint' : ''}`}>
              <span className={`text-[13px] font-semibold ${i === sel ? 'text-brand' : 'text-ink'}`}>{t.name}</span>
              <span className="font-mono text-[10.5px] text-faint">{t.sub}</span>
              {isGatedRoute(t.to) && (
                <span className="rounded border border-hairline px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-muted"
                  title="Needs an account — sign in to open">Sign in</span>
              )}
              {t.hidden && (
                <span className="rounded border border-hairline bg-sheet-2 px-1.5 py-px font-mono text-[9px] uppercase tracking-wider text-faint"
                  title="Not in your sidebar — still works">hidden</span>
              )}
              <span className="ml-auto font-mono text-[9.5px] uppercase tracking-widest text-faint">{t.groupLabel}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
