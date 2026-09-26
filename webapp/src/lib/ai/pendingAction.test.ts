import { describe, it, expect, beforeEach } from 'vitest'
import {
  savePendingCalculatorInputs, peekPendingCalculatorInputs,
  discardPendingCalculatorInputs, PENDING_TTL_MS,
} from './pendingAction'

// Node has no sessionStorage; a Map-backed fake is enough — the module only
// ever calls getItem/setItem/removeItem (see modelSpaceSession.test.ts).
const fake = () => {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  }
}
const storage = fake()
;(globalThis as { sessionStorage?: Storage }).sessionStorage = storage as unknown as Storage

const KEY = 'ai-assistant.pending-inputs'

beforeEach(() => storage.clear())

describe('pending calculator inputs', () => {
  it('peeks the same inputs twice, then discards once', () => {
    savePendingCalculatorInputs('/load-combinations', { D: 10, L: 5 })
    // StrictMode double-invokes the initializer: both peeks must agree.
    expect(peekPendingCalculatorInputs('/load-combinations')).toEqual({ D: 10, L: 5 })
    expect(peekPendingCalculatorInputs('/load-combinations')).toEqual({ D: 10, L: 5 })
    discardPendingCalculatorInputs()
    expect(peekPendingCalculatorInputs('/load-combinations')).toBeNull()
  })

  it('ignores a prefill meant for another page', () => {
    savePendingCalculatorInputs('/beam-design', { L: 6 })
    expect(peekPendingCalculatorInputs('/load-combinations')).toBeNull()
  })

  it('ignores stale and malformed payloads', () => {
    savePendingCalculatorInputs('/load-combinations', { D: 1 })
    const raw = JSON.parse(storage.getItem(KEY)!)
    raw.savedAt -= PENDING_TTL_MS + 1
    storage.setItem(KEY, JSON.stringify(raw))
    expect(peekPendingCalculatorInputs('/load-combinations')).toBeNull()

    storage.setItem(KEY, '{not json')
    expect(peekPendingCalculatorInputs('/load-combinations')).toBeNull()
  })
})
