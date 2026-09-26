// Pending calculator inputs — the "prefill" half of navigate + prefill.
//
// The assistant proposes `open_calculator(route, inputs)`; the widget saves it
// here and navigates. The TARGET page reads it through
// `usePendingCalculatorInputs` and the entry is discarded on mount.
//
// Why peek-then-discard, not read-and-clear in the state initializer: the app
// runs in StrictMode, which double-invokes initializers in dev. A consuming
// read would hand the inputs to the first invocation and nothing to the one
// whose value is kept. The initializer only PEEKS (a pure read — safe to run
// twice with the same answer) and a mount effect discards (idempotent).
//
// sessionStorage, not localStorage: a prefill is for the tab that asked, and
// it dies with the tab. Anything older than an hour is stale intent and is
// ignored rather than applied to a calculator opened much later.
import { useEffect, useState } from 'react'

export interface PendingCalculatorInputs {
  route: string
  inputs: Record<string, unknown>
  savedAt: number
}

const STORAGE_KEY = 'ai-assistant.pending-inputs'
export const PENDING_TTL_MS = 60 * 60 * 1000

export function savePendingCalculatorInputs(route: string, inputs: Record<string, unknown>): void {
  try {
    const pending: PendingCalculatorInputs = { route, inputs, savedAt: Date.now() }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending))
  } catch {
    // Storage full or blocked (private mode): navigation still works, the page
    // simply opens with its defaults. Never break the click for a prefill.
  }
}

function readPending(now = Date.now()): PendingCalculatorInputs | null {
  let raw: string | null
  try {
    raw = sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const pending = JSON.parse(raw) as Partial<PendingCalculatorInputs>
    if (typeof pending.route !== 'string' || typeof pending.inputs !== 'object' || pending.inputs === null) {
      return null
    }
    if (typeof pending.savedAt !== 'number' || now - pending.savedAt > PENDING_TTL_MS) return null
    return pending as PendingCalculatorInputs
  } catch {
    return null
  }
}

/** The pending inputs for this route, if any. Pure read — safe to call twice. Exported for tests. */
export function peekPendingCalculatorInputs(route: string, now = Date.now()): Record<string, unknown> | null {
  const pending = readPending(now)
  return pending && pending.route === route ? pending.inputs : null
}

/** Forget any pending inputs. Idempotent — safe under StrictMode's double effects. */
export function discardPendingCalculatorInputs(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Already gone or storage blocked: nothing to forget.
  }
}

/**
 * Initial state for a calculator page that accepts assistant prefills:
 * `const [d, setD] = useState(usePendingCalculatorInputs('/load-combinations', DEFAULTS))`.
 * Pages then sanitize the values themselves (they know their own fields).
 */
export function usePendingCalculatorInputs<T extends object>(
  route: string,
  defaults: T,
): () => T {
  const [initial] = useState<T>(() => {
    const peeked = peekPendingCalculatorInputs(route)
    // The peeked record is unchecked by construction — the page sanitizes it
    // against its own fields before use.
    return peeked ? { ...defaults, ...peeked } as unknown as T : defaults
  })
  // Discard AFTER the initializer above has peeked — effects run after the
  // first render, so the peek always sees the entry. No setState here.
  useEffect(() => {
    discardPendingCalculatorInputs()
  }, [])
  return () => initial
}
