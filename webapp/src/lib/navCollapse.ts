// ─────────────────────────────────────────────────────────────────────────
// WHICH SIDEBAR GROUPS THE USER HAS COLLAPSED.
//
// The sidebar carries every group in the catalog. Nobody works in all of them
// at once — a geotechnical engineer scrolls past ten concrete tools on every
// navigation — so each group header is a toggle, and what you shut stays shut.
//
// STORES THE COLLAPSED SET, NOT THE OPEN SET. The default has to be "open":
// a new group added to `SIDEBAR_GROUPS` must appear for people who already have
// a stored preference, and storing the open set would hide every future group
// behind a setting nobody knows to change. Storing the negative means an
// unknown label is open, which is the safe direction.
//
// Per browser, like `auth/profile` — this is a view preference, not account
// state, and syncing it would buy a round trip and a conflict case for nothing.
// ─────────────────────────────────────────────────────────────────────────

const KEY = 'civeng-nav-collapsed'

type Store = Pick<Storage, 'getItem' | 'setItem'>

const defaultStore = (): Store | null => {
  try { return window.localStorage } catch { return null }
}

/**
 * The group labels currently collapsed. Never throws: a corrupt or absent
 * value reads as "nothing collapsed", which renders the full sidebar.
 */
export function loadCollapsed(store: Store | null = defaultStore()): Set<string> {
  try {
    const raw = store?.getItem(KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    // Filtered to strings so a hand-edited value cannot put objects into a set
    // that is compared against labels with `.has`.
    return new Set(parsed.filter((v): v is string => typeof v === 'string'))
  } catch {
    return new Set()
  }
}

/** Persist. Silent on failure — private mode must not break the nav. */
export function saveCollapsed(set: ReadonlySet<string>, store: Store | null = defaultStore()): void {
  try { store?.setItem(KEY, JSON.stringify([...set])) } catch { /* storage unavailable */ }
}

/** Flip one group. Returns a NEW set, so React sees a changed reference. */
export function toggleCollapsed(set: ReadonlySet<string>, label: string): Set<string> {
  const next = new Set(set)
  if (!next.delete(label)) next.add(label)
  return next
}

// NOTE — there is deliberately no `revealGroup`. Force-opening the group that
// holds the current route means an ordinary navigation silently undoes the
// user's own collapse, and they have to redo it every time. The sidebar marks
// a collapsed group that holds the active route instead, which solves the only
// problem force-opening was for: not being able to see where you are.
