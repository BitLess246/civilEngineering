// ─────────────────────────────────────────────────────────────────────────
// WHICH DISCIPLINES THIS PERSON ACTUALLY WORKS IN.
//
// The catalog spans 11 groups and 50-odd tools, from RC beams to septic sizing.
// Almost nobody uses all of it: a geotechnical engineer scrolls past ten
// concrete calculators on every navigation, and a building designer never opens
// the soil-nail wall. First run asks which families they want, and the home
// directory and the sidebar drop the rest.
//
// ── FOUR RULES THIS MODULE EXISTS TO ENFORCE ────────────────────────────────
//
// 1. IT STORES WHAT IS HIDDEN, NOT WHAT IS CHOSEN. When a new group ships, it
//    must appear for people who already answered. Storing the chosen set would
//    make every future module invisible to every existing user — a launch that
//    silently reaches nobody. Storing the negative means an unknown label is
//    shown, which is the direction that fails safe.
//
// 2. HIDING IS NOT REMOVING. Nothing here touches routing. A hidden tool's URL,
//    bookmark, deep link and report link all keep working, and ⌘K still finds
//    it. This trims navigation; it does not take features away, and a
//    preference that could strand a bookmark would be a bug, not a setting.
//
// 3. AN EMPTY APP IS NEVER A VALID STATE. Hiding every group would leave a
//    sidebar with nothing in it and no way back except this setting, which is
//    no longer reachable from a nav that renders nothing. `visibleGroups`
//    therefore ignores a preference that would hide everything.
//
// 4. PINNED GROUPS ARE NOT NEGOTIABLE. Reference carries Documentation,
//    Validation and Plans — app pages, not a discipline. Letting somebody hide
//    the docs and the pricing page serves nobody.
//
// Per browser, like `auth/profile`: a view preference, not account state.
// ─────────────────────────────────────────────────────────────────────────

import { SIDEBAR_GROUPS } from './tools'

const KEY = 'civeng-tool-prefs'

/** Groups that can never be hidden, whatever is stored. See rule 4. */
export const PINNED_GROUPS: readonly string[] = ['Reference']

/**
 * The groups the user is actually offered, in catalog order.
 *
 * Derived from `SIDEBAR_GROUPS` rather than listed by hand, so a group added to
 * the catalog is offered in the picker without a second edit here — the failure
 * mode of a hand-written list is a new discipline nobody can ever turn off.
 */
export const CHOOSABLE_GROUPS: readonly string[] = SIDEBAR_GROUPS
  .map((g) => g.label)
  .filter((l) => !PINNED_GROUPS.includes(l))

export interface ToolPrefs {
  /** Sidebar group labels the user does not want to see. */
  hidden: readonly string[]
}

/** No preference expressed — everything shows, and first run should ask. */
export const NO_PREFS: ToolPrefs = { hidden: [] }

type Store = Pick<Storage, 'getItem' | 'setItem'>

const defaultStore = (): Store | null => {
  try { return window.localStorage } catch { return null }
}

/**
 * Read the stored preference, or `null` when the question has never been
 * answered.
 *
 * `null` and `{ hidden: [] }` are DIFFERENT and the difference drives the
 * first-run dialog: "never asked" must show it, "asked, and wants everything"
 * must not. Collapsing them would re-ask on every visit anyone who chose to
 * keep the full catalog.
 */
export function loadPrefs(store: Store | null = defaultStore()): ToolPrefs | null {
  try {
    const raw = store?.getItem(KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const hidden = (parsed as { hidden?: unknown }).hidden
    if (!Array.isArray(hidden)) return null
    return { hidden: hidden.filter((v): v is string => typeof v === 'string') }
  } catch {
    return null
  }
}

/** Persist. Silent on failure — private mode must not break the nav. */
export function savePrefs(p: ToolPrefs, store: Store | null = defaultStore()): void {
  try { store?.setItem(KEY, JSON.stringify({ hidden: [...p.hidden] })) } catch { /* unavailable */ }
}

/** Has this browser answered the question yet? Drives the first-run dialog. */
export const hasAnswered = (p: ToolPrefs | null): p is ToolPrefs => p !== null

/**
 * Turn the checkbox state (what they ticked) into what gets stored (what to
 * hide), against the catalog as it stands right now.
 *
 * Pinned groups are dropped from the hidden list even if a caller passes them
 * unticked, so the storage layer cannot be talked into an unreachable app.
 */
export function prefsFromChosen(chosen: Iterable<string>, allGroups: readonly string[]): ToolPrefs {
  const keep = new Set(chosen)
  return { hidden: allGroups.filter((g) => !keep.has(g) && !PINNED_GROUPS.includes(g)) }
}

/** The inverse, for rendering the checkboxes from what is stored. */
export function chosenFromPrefs(p: ToolPrefs | null, allGroups: readonly string[]): Set<string> {
  if (!p) return new Set(allGroups)          // never asked — everything ticked
  const hidden = new Set(p.hidden)
  return new Set(allGroups.filter((g) => !hidden.has(g)))
}

/**
 * Apply the preference to a list of groups.
 *
 * Generic over the group shape so the sidebar and the home directory — which
 * carry different extras on each group — can both use it without a cast.
 *
 * Returns everything unchanged when the preference would leave nothing, per
 * rule 3: a nav rendering zero groups has no route back to the setting that
 * emptied it.
 */
export function visibleGroups<T extends { label: string }>(
  groups: readonly T[],
  p: ToolPrefs | null,
): readonly T[] {
  if (!p || p.hidden.length === 0) return groups
  const hidden = new Set(p.hidden)
  const kept = groups.filter((g) => !hidden.has(g.label) || PINNED_GROUPS.includes(g.label))
  // Nothing survived, or only the pinned groups did: the preference is
  // unusable, so it is ignored rather than honoured into a dead end.
  return kept.some((g) => !PINNED_GROUPS.includes(g.label)) ? kept : groups
}

/** Whether a group is currently hidden — the ⌘K palette tags these. */
export function isHidden(label: string, p: ToolPrefs | null): boolean {
  if (!p || PINNED_GROUPS.includes(label)) return false
  return p.hidden.includes(label)
}
