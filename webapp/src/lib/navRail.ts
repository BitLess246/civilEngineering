// ─────────────────────────────────────────────────────────────────────────
// IS THE SIDEBAR COLLAPSED TO ITS ICON RAIL?
//
// Separate from `navCollapse`, which stores WHICH GROUPS are shut. They are
// different questions with different defaults and different consequences, and
// folding them into one key would mean a user who collapsed the rail once can
// never see a group list again without also losing their per-group state.
//
// STORES THE POSITIVE. Unlike the group set, the safe default here is EXPANDED:
// the rail is the denser, more expert view, and someone who has never asked for
// it should get the sidebar that names its tools in words. An unreadable or
// absent value therefore reads as "not collapsed".
//
// Per browser, like `navCollapse` — a view preference, not account state.
// ─────────────────────────────────────────────────────────────────────────

const KEY = 'civeng-nav-rail'

type Store = Pick<Storage, 'getItem' | 'setItem'>

const defaultStore = (): Store | null => {
  try { return window.localStorage } catch { return null }
}

/** True when the sidebar should render as the icon rail. Never throws. */
export function loadRailCollapsed(store: Store | null = defaultStore()): boolean {
  try { return store?.getItem(KEY) === '1' } catch { return false }
}

/** Persist. Silent on failure — private mode must not break the nav. */
export function saveRailCollapsed(v: boolean, store: Store | null = defaultStore()): void {
  try { store?.setItem(KEY, v ? '1' : '0') } catch { /* storage unavailable */ }
}

/**
 * Rail width in px, for the layout to reserve.
 *
 * 60 px is the smallest that still clears the 44 px pointer target the rest of
 * this app holds itself to (WCAG 2.5.8 asks 24; the audit set 44 for the
 * sidebar) with a gutter either side. Narrower looks tidier in a mock and
 * makes every group a 36 px target in use.
 */
export const RAIL_W = 60
export const FULL_W = 230
