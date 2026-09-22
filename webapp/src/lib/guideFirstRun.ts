// ─────────────────────────────────────────────────────────────────────────
// SHOULD THE WALKTHROUGH OPEN BY ITSELF?
//
// The 3D Model Space is the one page in this app nobody can use by looking at
// it. Twelve tabs in a sequence, a viewport that starts empty, and a pipeline
// that has to run in order — it has a walkthrough for exactly that reason, and
// the walkthrough was behind a button labelled "Guide" that a first-time
// visitor has no reason to press. So it opens itself, once.
//
// THE THREE WAYS IT MUST NOT FIRE, each of which is a real path through the
// page rather than a hypothetical:
//
//   · NOT TWICE. A guide that reappears is a guide people learn to dismiss
//     without reading — `WelcomeDialog`'s own note makes the same point about
//     its one-time question, and stores an answer even when skipped for
//     exactly this reason. Marked seen when it STARTS, not when it finishes,
//     so dismissing it at step one still counts: the visitor has met it and
//     said no, which is an answer.
//   · NOT IN THE EMBED PREVIEW. `?embed=1` is the landing page's poster. It
//     locks pointer events across the page and bootstraps its own demo frame;
//     an overlay opening on top of a poster is a bug, and the visitor never
//     asked for a tour.
//   · NOT WHEN SOMETHING ELSE ALREADY STARTED IT. `?tour=1` is the landing
//     page's "Run it yourself, guided" link, which starts the tour on arrival.
//     Autostarting alongside it would run the start hooks twice — and those
//     hooks GENERATE A DEMO MODEL, so twice is not harmless.
//
// The state is per browser, in `localStorage`, like `toolPrefs` and
// `sectionState`: "I have seen this" is a fact about a person, not about a
// document, and one that should survive closing the tab. Storage being
// unavailable (blocked site data, SSR, a test) reads as NOT SEEN, which shows
// the guide to someone who may have seen it — the safe direction for a
// dismissible overlay, where the other way round hides the only explanation
// the page has.
// ─────────────────────────────────────────────────────────────────────────

type Store = Pick<Storage, 'getItem' | 'setItem'>

const defaultStore = (): Store | null => {
  try { return window.localStorage } catch { return null }   // blocked site data
}

export const GUIDE_SEEN_KEY = 'civeng-guide-seen'

/**
 * Has this browser met the named walkthrough?
 *
 * Keyed by tour name rather than a single flag, so a second page's guide can
 * use this without one page's visit suppressing the other's.
 */
export function hasSeenGuide(name: string, store: Store | null = defaultStore()): boolean {
  try {
    const raw = store?.getItem(GUIDE_SEEN_KEY)
    if (!raw) return false
    const v: unknown = JSON.parse(raw)
    return !!v && typeof v === 'object' && !Array.isArray(v)
      && (v as Record<string, unknown>)[name] === true
  } catch { return false }                    // corrupt value ⇒ show it again
}

/** Record that it has been met. Merges, so one page cannot clear another's. */
export function markGuideSeen(name: string, store: Store | null = defaultStore()): void {
  // THE READ IS ITS OWN try, and that is the fix for a bug this shipped with
  // for one commit. With the parse inside the same block as the write, a
  // corrupt stored value threw on `JSON.parse` and skipped `setItem` with it —
  // so the flag could never be overwritten, and the guide would reopen on
  // every visit forever. Measured in Chromium: seeded with `{oops`, the value
  // was still `{oops` after the guide ran.
  let base: Record<string, unknown> = {}
  try {
    const raw = store?.getItem(GUIDE_SEEN_KEY)
    const prev: unknown = raw ? JSON.parse(raw) : null
    if (prev && typeof prev === 'object' && !Array.isArray(prev)) {
      base = prev as Record<string, unknown>
    }
  } catch { /* corrupt — start a fresh map rather than refusing to write */ }
  try {
    store?.setItem(GUIDE_SEEN_KEY, JSON.stringify({ ...base, [name]: true }))
  } catch { /* quota, or blocked — the guide simply shows again */ }
}

export interface AutoStartConditions {
  /** `hasSeenGuide(...)` for this page's tour. */
  seen: boolean
  /** `?embed=1` — the landing page's poster. */
  embed: boolean
  /** `?tour=1`, or any other path that is starting the tour itself. */
  explicit: boolean
  /**
   * Whether the page is ready to be toured at all.
   *
   * The tour's own start hook generates a demo model when there is none, so it
   * does not need a model — but it does need the page mounted and past the
   * gate. The caller decides what ready means; this keeps the decision in one
   * boolean so the rule below stays readable.
   */
  ready: boolean
}

/**
 * The whole rule, in one place, as a function of facts rather than of effects.
 *
 * Written as data so the four ways it must not fire can be tested without a
 * browser, a router or a mounted page — which is the difference between a rule
 * and four `if (...) return` lines scattered through an effect.
 */
export function shouldAutoStartGuide(c: AutoStartConditions): boolean {
  return c.ready && !c.seen && !c.embed && !c.explicit
}

/**
 * The Model Space walkthrough's name in the seen map.
 *
 * A constant rather than a string literal at the call site, because the read
 * and the write have to agree and a typo in one of them is a guide that either
 * never fires or fires forever. `guideAutostart.test.ts` asserts the page uses
 * this rather than a literal.
 */
export const MODEL_GUIDE = 'model-space'
