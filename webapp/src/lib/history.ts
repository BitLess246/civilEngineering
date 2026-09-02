// ─────────────────────────────────────────────────────────────────────────
// UNDO / REDO — a past, a present and a future.
//
// The 3D model space had no undo at all: every edit went through one `save()`
// that replaced the whole model, and "Regenerate grid model" or a mis-aimed
// Delete threw the previous one away with nothing to get it back from. Because
// every edit already produces a COMPLETE model, the history is just the models
// that came before — no diffing, no command objects, no per-edit inverse.
//
// The present is NOT held here. It lives where it already lived (the page's
// `model` state) and is passed in on each call. Two copies of the current
// value drift; one does not.
//
// Pure and generic, so it can be tested without a renderer — which is the
// whole reason it is a module rather than three `useState`s in a component.
// ─────────────────────────────────────────────────────────────────────────

export interface History<T> {
  /** Older values, oldest first. The last one is what undo returns. */
  past: readonly T[]
  /** Values undone away, nearest first. The first is what redo returns. */
  future: readonly T[]
}

export const emptyHistory = <T>(): History<T> => ({ past: [], future: [] })

/**
 * How many steps back are kept.
 *
 * A step is a whole `StructuralModel`, so this is a memory bound rather than a
 * usability one — deep enough that undo is never the thing that runs out
 * first, shallow enough that a large model does not accumulate megabytes of
 * history in a tab left open all day.
 */
export const HISTORY_LIMIT = 25

/** Record `present` as the value to come back to, and drop any redo branch. */
export function recordHistory<T>(h: History<T>, present: T, limit = HISTORY_LIMIT): History<T> {
  // A new edit makes the redo branch unreachable — it described a future that
  // followed a different past. Keeping it would let redo jump to a value that
  // never followed the one on screen.
  return { past: [...h.past, present].slice(-limit), future: [] }
}

/**
 * Step back. Returns the value to restore and the history that follows, or
 * null when there is nothing to undo.
 *
 * `present` goes onto the future so redo can return to it — which is what makes
 * undo reversible rather than destructive in its own right.
 */
export function undoHistory<T>(h: History<T>, present: T): { value: T; history: History<T> } | null {
  if (h.past.length === 0) return null
  return {
    value: h.past[h.past.length - 1],
    history: { past: h.past.slice(0, -1), future: [present, ...h.future] },
  }
}

/** Step forward again. Null when there is nothing to redo. */
export function redoHistory<T>(h: History<T>, present: T): { value: T; history: History<T> } | null {
  if (h.future.length === 0) return null
  return {
    value: h.future[0],
    history: { past: [...h.past, present], future: h.future.slice(1) },
  }
}

/**
 * True when a keyboard event should be treated as typing rather than a shortcut.
 *
 * The page is mostly number fields, and inside one of those the browser's own
 * undo is what ⌘Z means. Stealing it there would make an edit to a bay width
 * impossible to take back one character at a time.
 *
 * Duck-typed rather than `instanceof HTMLElement`: this repo's tests run with
 * no DOM, so a real element check would make the one rule that decides whether
 * a keystroke is yours or the field's the one rule with no test on it.
 */
export function isTypingTarget(el: unknown): boolean {
  const t = el as { tagName?: unknown; isContentEditable?: unknown } | null | undefined
  if (!t || typeof t.tagName !== 'string') return false
  const tag = t.tagName.toUpperCase()
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable === true
}
