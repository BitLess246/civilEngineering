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

// ─────────────────────────────────────────────────────────────────────────
// IS THE SIDEBAR PINNED?
//
// The desktop sidebar AUTO-HIDES by default: it is out of the page flow, so a
// calculator gets the whole width, and it slides in over the page when the
// pointer reaches the left edge (or focus enters it, or the header button is
// pressed). Pinning docks it as before — the full list, or the icon rail.
//
// STORES THE POSITIVE, and the default is UNPINNED — what was asked for: an
// unreadable or absent value reads as "auto-hide". Per browser, like the rail.
// ─────────────────────────────────────────────────────────────────────────

const PIN_KEY = 'civeng-nav-pinned'

/** True when the sidebar is docked rather than auto-hiding. Never throws. */
export function loadSidebarPinned(store: Store | null = defaultStore()): boolean {
  try { return store?.getItem(PIN_KEY) === '1' } catch { return false }
}

/** Persist. Silent on failure. */
export function saveSidebarPinned(v: boolean, store: Store | null = defaultStore()): void {
  try { store?.setItem(PIN_KEY, v ? '1' : '0') } catch { /* storage unavailable */ }
}

/**
 * The reveal zone at the left edge, px. Wide enough to land on without
 * aiming — a 2 px strip needs a pointer slammed against the bezel — and
 * narrow enough not to steal the clicks a page puts near its edge.
 */
export const EDGE_ZONE_W = 8

/** How long the sidebar stays after the pointer leaves it, ms — long enough
 *  to forgive a cut corner on the way to a flyout, short enough not to linger. */
export const HIDE_DELAY_MS = 280
