// ─────────────────────────────────────────────────────────────────────────
// WRITING TO STORAGE, WITH THE FAILURE VISIBLE. Layer 1.
//
// `localStorage.setItem` throws when the origin's quota is full — typically
// 5 MB, which a schedule with a few hundred activities and a handful of
// baselines reaches. Neither store caught it, so the throw travelled out of
// `store.save`, out of the hook's `persist`, and into a React event handler,
// where it became an uncaught error: `setProject(next)` never ran, the edit
// vanished from the screen, and nothing said why. The user retypes it, and it
// vanishes again.
//
// TWO RULES COME OUT OF THAT, AND THEY ARE THE POINT OF THIS MODULE.
//
// 1. A FAILED WRITE MUST NOT DESTROY THE EDIT. Persisting and displaying are
//    separate concerns, and the in-memory copy is the only one the user can
//    still act on — copy it out, export it, delete something and retry. The
//    callers therefore keep the new state and mark it unsaved, rather than
//    reverting to the last thing that happened to fit on disk.
//
// 2. QUOTA IS NOT AN EXCEPTION, IT IS AN ANSWER. A full disk is an ordinary,
//    expected outcome of saving, not a bug, so `writeItem` returns it rather
//    than throwing. That way a caller cannot forget to handle it — the type
//    makes them look.
//
// DETECTING IT IS BROWSER-SPECIFIC and worth doing properly. Chrome and Safari
// throw a DOMException named `QuotaExceededError` with code 22; Firefox throws
// `NS_ERROR_DOM_QUOTA_REACHED` with code 1014; older WebKit used code 22 with a
// different name. Matching on the message text is what most code does and it
// breaks under localisation. All four signals are checked here, once.
//
// A quota error can ALSO mean "Safari private browsing", where the quota is
// zero and every write fails. Same verdict, same message: the work is not
// being saved and the user needs to know.
// ─────────────────────────────────────────────────────────────────────────

/** What a write attempt did. Never throws; the failure is the return value. */
export type WriteOutcome =
  | { ok: true }
  /** The origin's storage is full, or the browser refuses to persist at all. */
  | { ok: false; reason: 'quota'; message: string }
  /** Anything else — storage disabled, a serialisation failure, a DOM error. */
  | { ok: false; reason: 'failed'; message: string }

const QUOTA_NAMES = new Set(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'])
const QUOTA_CODES = new Set([22, 1014])

/**
 * Is this the storage-is-full error, whatever the browser calls it?
 *
 * Exported for its own test: getting this wrong in the false direction shows a
 * generic "could not save" for a full disk (unhelpful but harmless), and in the
 * true direction tells someone to free up space when the real problem is
 * something else entirely.
 */
export function isQuotaError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false
  const err = e as { name?: unknown; code?: unknown }
  if (typeof err.name === 'string' && QUOTA_NAMES.has(err.name)) return true
  // Firefox reports code 1014 with its own name; some WebKit builds report
  // code 22 with a name that is not `QuotaExceededError`. Checking the code
  // separately catches both without matching on message text, which is
  // localised and therefore not a contract.
  return typeof err.code === 'number' && QUOTA_CODES.has(err.code)
}

/** Human-readable, and specific enough to act on. */
export const QUOTA_MESSAGE =
  'This browser’s storage is full, so the change could not be saved. '
  + 'Your work is still on screen — export it, or delete a project you no longer '
  + 'need, then make the change again.'

/**
 * Write one key, reporting rather than throwing.
 *
 * `serialise` is taken as a thunk so a `JSON.stringify` that throws — a
 * circular reference, a BigInt — is reported the same way rather than escaping
 * past the caller's error handling.
 */
export function writeItem(
  setItem: (key: string, value: string) => void,
  key: string,
  serialise: () => string,
): WriteOutcome {
  let payload: string
  try {
    payload = serialise()
  } catch (e) {
    return { ok: false, reason: 'failed', message: describe(e, 'The change could not be prepared for saving.') }
  }
  try {
    setItem(key, payload)
    return { ok: true }
  } catch (e) {
    if (isQuotaError(e)) return { ok: false, reason: 'quota', message: QUOTA_MESSAGE }
    return { ok: false, reason: 'failed', message: describe(e, 'The change could not be saved.') }
  }
}

function describe(e: unknown, fallback: string): string {
  const m = e instanceof Error ? e.message.trim() : ''
  return m ? `${fallback} (${m})` : fallback
}
