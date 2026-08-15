// The failure nobody saw. `localStorage.setItem` throws when the origin is
// full, and neither store caught it, so the throw escaped through `store.save`
// and the hook's `persist` into a React event handler: `setProject` never ran,
// the edit vanished from the screen, and nothing said why.
//
// These tests cover the two halves of the fix — recognising the error whatever
// the browser calls it, and never throwing it back at the caller.

import { describe, it, expect } from 'vitest'
import { isQuotaError, writeItem, QUOTA_MESSAGE } from './storageWrite'

/** A DOMException as each browser actually reports a full quota. */
const quotaError = (name: string, code: number) =>
  Object.assign(new Error('persistent storage maximum size reached'), { name, code })

describe('isQuotaError', () => {
  it('recognises Chrome and Safari', () => {
    expect(isQuotaError(quotaError('QuotaExceededError', 22))).toBe(true)
  })

  it('recognises Firefox, which uses a different name AND a different code', () => {
    expect(isQuotaError(quotaError('NS_ERROR_DOM_QUOTA_REACHED', 1014))).toBe(true)
  })

  it('recognises an old WebKit build: right code, unhelpful name', () => {
    // The reason the code is checked separately from the name. Matching only
    // the name misses this one, and it is the case that shows up on old iPads.
    expect(isQuotaError(quotaError('Error', 22))).toBe(true)
  })

  it('does NOT match on the message text', () => {
    // Message text is localised, so it is not a contract. A browser in Filipino
    // or German reports the same condition with different words, and matching
    // on them means the check silently stops working for those users.
    expect(isQuotaError(new Error('persistent storage maximum size reached'))).toBe(false)
  })

  it('leaves unrelated failures alone', () => {
    // The dangerous false positive: telling somebody to free up disk space when
    // the real problem is something else entirely.
    expect(isQuotaError(new TypeError('cannot read properties of null'))).toBe(false)
    expect(isQuotaError(Object.assign(new Error('denied'), { name: 'SecurityError', code: 18 }))).toBe(false)
    expect(isQuotaError(null)).toBe(false)
    expect(isQuotaError('QuotaExceededError')).toBe(false)
    expect(isQuotaError(undefined)).toBe(false)
  })
})

describe('writeItem', () => {
  it('writes, and says so', () => {
    const seen: [string, string][] = []
    const r = writeItem((k, v) => seen.push([k, v]), 'k', () => 'payload')
    expect(r).toEqual({ ok: true })
    expect(seen).toEqual([['k', 'payload']])
  })

  it('REPORTS a full quota rather than throwing it', () => {
    // The whole point. If this throws, the caller's `setState` never runs and
    // the user's edit is destroyed by the act of trying to save it.
    const boom = () => { throw quotaError('QuotaExceededError', 22) }
    let threw = false
    let out
    try { out = writeItem(boom, 'k', () => 'v') } catch { threw = true }
    expect(threw).toBe(false)
    expect(out).toEqual({ ok: false, reason: 'quota', message: QUOTA_MESSAGE })
  })

  it('tells the user their work is still on screen', () => {
    // The first assumption on seeing "could not save" is that the work is gone.
    expect(QUOTA_MESSAGE).toMatch(/still on screen/i)
    // And what to actually do about it.
    expect(QUOTA_MESSAGE).toMatch(/export|delete/i)
  })

  it('reports a non-quota storage failure separately', () => {
    const boom = () => { throw new Error('storage is disabled') }
    const out = writeItem(boom, 'k', () => 'v')
    expect(out.ok).toBe(false)
    expect(out.ok === false && out.reason).toBe('failed')
    // The underlying message is kept: "could not be saved" alone gives whoever
    // is debugging it nothing to go on.
    expect(out.ok === false && out.message).toContain('storage is disabled')
  })

  it('catches a serialise that throws, instead of letting it past', () => {
    // A circular reference or a BigInt in the document. Same user-visible
    // outcome — not saved — and it must not escape the caller's handling just
    // because it happened one line earlier.
    const cyclic = () => JSON.stringify((() => { const o: Record<string, unknown> = {}; o.self = o; return o })())
    const out = writeItem(() => {}, 'k', cyclic)
    expect(out.ok).toBe(false)
    expect(out.ok === false && out.reason).toBe('failed')
  })

  it('does not write anything when serialising failed', () => {
    let wrote = false
    writeItem(() => { wrote = true }, 'k', () => { throw new Error('nope') })
    expect(wrote).toBe(false)
  })
})
