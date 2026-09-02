// ─────────────────────────────────────────────────────────────────────────
// WHICH PANEL SECTIONS ARE FOLDED AWAY.
//
// A tab in the control rail can carry ten sections and several screens of
// fields, and most of the time you are working in one of them. Folding the
// rest is the difference between scrolling to a field and looking at it.
//
// The state lives HERE rather than in each `Sec`, for two reasons. Component
// state dies with the component, so a section would spring open again every
// time you left the tab and came back — the fold would not survive the thing
// it exists to survive. And a page-level `useState` threaded through 46 call
// sites is the same store with more wiring.
//
// STORED IN localStorage, not the sessionStorage this page uses for its model
// and inputs. Those are one document's contents; this is how somebody likes
// their panel arranged, and a preference that resets whenever a tab is closed
// is not a preference — it is a chore repeated daily. The section title stays
// visible with its chevron either way, so nothing is ever hidden without a
// label saying where it went.
//
// The functions are pure and the store is a thin shell over them, so what is
// worth testing can be tested without a DOM.
// ─────────────────────────────────────────────────────────────────────────

/** Section id → collapsed. Absent means open: sections start expanded. */
export type SectionState = Readonly<Record<string, boolean>>

export const SECTIONS_KEY = 'model-space-sections'

export const isCollapsed = (s: SectionState, id: string): boolean => s[id] === true

/**
 * Fold or unfold one section.
 *
 * Returns a new object — the store hands this to `useSyncExternalStore`, which
 * compares snapshots by identity and would not re-render on a mutation.
 */
export function toggleSection(s: SectionState, id: string): SectionState {
  const next = { ...s }
  if (next[id]) delete next[id]      // open is the default, so open is absence
  else next[id] = true
  return next
}

/**
 * Read stored state, tolerating anything.
 *
 * A corrupt or hand-edited value means every section opens — which is the
 * state the page had before this existed, and the safe direction to fail in:
 * nobody loses a control they cannot find.
 */
export function parseSectionState(raw: string | null | undefined): SectionState {
  if (!raw) return {}
  try {
    const v: unknown = JSON.parse(raw)
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    const out: Record<string, boolean> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val === true) out[k] = true          // anything else reads as open
    }
    return out
  } catch { return {} }
}

// ── the store ─────────────────────────────────────────────────────────────

const storage = (): Storage | undefined => {
  try {
    return typeof globalThis !== 'undefined'
      ? (globalThis as { localStorage?: Storage }).localStorage : undefined
  } catch { return undefined }               // a browser set to block site data
}

let state: SectionState = parseSectionState(storage()?.getItem(SECTIONS_KEY) ?? null)
const listeners = new Set<() => void>()

export function subscribeSections(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export const sectionsSnapshot = (): SectionState => state

export function toggleSectionInStore(id: string): void {
  state = toggleSection(state, id)
  try { storage()?.setItem(SECTIONS_KEY, JSON.stringify(state)) } catch { /* quota, or blocked */ }
  for (const fn of listeners) fn()
}

/** Test seam: drop everything back to open. */
export function resetSectionsForTest(): void {
  state = {}
  for (const fn of listeners) fn()
}
