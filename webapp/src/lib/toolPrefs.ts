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
// 1. IT STORES WHAT IS CHOSEN, SO A GROUP THAT SHIPS LATER STAYS HIDDEN.
//    A product decision, taken deliberately: somebody who said "I do concrete"
//    should not find a masonry section in their sidebar next month because we
//    shipped one. The selection is a standing instruction, not a snapshot.
//
//    The cost is real and is paid for elsewhere: a new module does NOT announce
//    itself in the nav of anyone who has answered. It is still discoverable —
//    it appears unticked in the profile picker, and ⌘K finds it tagged HIDDEN —
//    but nothing pushes it at them. If a launch ever needs to reach existing
//    users, that is a job for a release note, not for silently overriding a
//    preference they set.
//
//    "EVERYTHING" IS STORED AS `null`, NOT AS THE LIST OF TODAY'S GROUPS.
//    Someone who ticks every box, or clicks "show me everything", is expressing
//    "all of it", not "these eleven". Freezing that into a list would quietly
//    turn the answer into a filter the day the twelfth group ships, and the
//    button they clicked would have lied to them.
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
  /**
   * Sidebar group labels the user wants, or `null` for "everything, including
   * whatever ships later".
   *
   * The `null` is not an optimisation. A list means "exactly these", so a group
   * added tomorrow is not in it and stays hidden — which is the point of rule 1.
   * That makes a stored list of today's eleven groups the wrong way to record
   * "I want it all", because it would silently become a filter the moment a
   * twelfth appears.
   */
  chosen: readonly string[] | null
}

/** "Show me everything" — an answer, and one that survives the catalog growing. */
export const ALL_PREFS: ToolPrefs = { chosen: null }

type Store = Pick<Storage, 'getItem' | 'setItem'>

const defaultStore = (): Store | null => {
  try { return window.localStorage } catch { return null }
}

/**
 * Read the stored preference, or `null` when the question has never been
 * answered.
 *
 * A missing key and `{ chosen: null }` are DIFFERENT, and the difference drives
 * the first-run dialog: "never asked" must show it, "asked, and wants
 * everything" must not. Collapsing them would re-ask, on every visit, anyone
 * who chose to keep the full catalog.
 */
export function loadPrefs(store: Store | null = defaultStore()): ToolPrefs | null {
  try {
    const raw = store?.getItem(KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const chosen = (parsed as { chosen?: unknown }).chosen
    if (chosen === null) return ALL_PREFS
    if (!Array.isArray(chosen)) return null
    return { chosen: chosen.filter((v): v is string => typeof v === 'string') }
  } catch {
    return null
  }
}

/** Persist. Silent on failure — private mode must not break the nav. */
export function savePrefs(p: ToolPrefs, store: Store | null = defaultStore()): void {
  const value = { chosen: p.chosen === null ? null : [...p.chosen] }
  try { store?.setItem(KEY, JSON.stringify(value)) } catch { /* unavailable */ }
}

/** Has this browser answered the question yet? Drives the first-run dialog. */
export const hasAnswered = (p: ToolPrefs | null): p is ToolPrefs => p !== null

/**
 * Turn the checkbox state into what gets stored, against the catalog as it
 * stands right now.
 *
 * TICKING EVERY BOX STORES `null`, not the list. "All of them" and "exactly
 * these eleven" look identical on screen today and mean different things
 * tomorrow, and the one the user meant by ticking everything is the former.
 */
export function prefsFromChosen(chosen: Iterable<string>, allGroups: readonly string[]): ToolPrefs {
  const keep = new Set(chosen)
  const offered = allGroups.filter((g) => !PINNED_GROUPS.includes(g))
  if (offered.every((g) => keep.has(g))) return ALL_PREFS
  return { chosen: offered.filter((g) => keep.has(g)) }
}

/** The inverse, for rendering the checkboxes from what is stored. */
export function chosenFromPrefs(p: ToolPrefs | null, allGroups: readonly string[]): Set<string> {
  // Never asked, or asked and wants everything: every box ticked. A group added
  // since is ticked too in the `null` case, which is the whole point of it.
  if (!p || p.chosen === null) return new Set(allGroups)
  const keep = new Set(p.chosen)
  // Pinned groups are deliberately never written into `chosen` — rule 4 keeps
  // them out so nothing stored can drop them — so they have to be added back
  // here, or the picker renders "Reference" unticked and looks like it is off.
  return new Set(allGroups.filter((g) => keep.has(g) || PINNED_GROUPS.includes(g)))
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
  if (!p || p.chosen === null) return groups
  const keep = new Set(p.chosen)
  const kept = groups.filter((g) => keep.has(g.label) || PINNED_GROUPS.includes(g.label))
  // Nothing survived, or only the pinned groups did: the preference is
  // unusable, so it is ignored rather than honoured into a dead end.
  return kept.some((g) => !PINNED_GROUPS.includes(g.label)) ? kept : groups
}

/** Whether a group is currently hidden — the ⌘K palette tags these. */
export function isHidden(label: string, p: ToolPrefs | null): boolean {
  if (!p || p.chosen === null || PINNED_GROUPS.includes(label)) return false
  // A preference that hides everything is ignored by `visibleGroups`, so it
  // must be ignored here too — otherwise the palette tags results as hidden
  // while the sidebar is showing every one of them.
  if (!p.chosen.some((l) => !PINNED_GROUPS.includes(l))) return false
  return !p.chosen.includes(label)
}
