/**
 * Undo/redo history over immutable snapshots — the Drafting3D project is
 * already edited copy-on-write, so each committed edit IS a snapshot and the
 * history is three plain fields. Pure; unit-tested.
 */

export interface History<T> {
  past: T[]
  present: T
  future: T[]
}

/** Steps kept — a drafting session, not an archive. */
export const HISTORY_LIMIT = 100

export function initHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] }
}

/** Record an edit. Re-committing the present is a no-op (React re-renders
 *  must not flood the stack); any new edit discards the redo branch. */
export function pushHistory<T>(h: History<T>, next: T, limit = HISTORY_LIMIT): History<T> {
  if (next === h.present) return h
  const past = [...h.past, h.present]
  if (past.length > limit) past.splice(0, past.length - limit)
  return { past, present: next, future: [] }
}

export function undoHistory<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h
  const prev = h.past[h.past.length - 1]
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] }
}

export function redoHistory<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h
  const [next, ...rest] = h.future
  return { past: [...h.past, h.present], present: next, future: rest }
}
