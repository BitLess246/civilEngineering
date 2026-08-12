import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { openPortalSession, portalMessage, type PortalFailure } from './portal'

// The Supabase client is the only thing this module touches, so it is the only
// thing mocked. Everything else under test is our own handling of what comes
// back — which is the part that decides what a customer trying to cancel sees.
const invoke = vi.fn()
vi.mock('../auth/authClient', () => ({
  getClient: () => (clientPresent ? { functions: { invoke } } : null),
}))

let clientPresent = true

/** A FunctionsHttpError as supabase-js shapes it: the body hangs off `context`. */
const httpError = (status: number, body: unknown) => ({
  name: 'FunctionsHttpError',
  context: { status, json: async () => body },
})

beforeEach(() => {
  clientPresent = true
  invoke.mockReset()
})
afterEach(() => vi.restoreAllMocks())

describe('openPortalSession', () => {
  it('returns the url and the cancel deep link', async () => {
    invoke.mockResolvedValue({
      data: { url: 'https://customer-portal.paddle.com/cpl_01', cancelUrl: 'https://customer-portal.paddle.com/cpl_01/cancel' },
      error: null,
    })
    await expect(openPortalSession()).resolves.toEqual({
      ok: true,
      url: 'https://customer-portal.paddle.com/cpl_01',
      cancelUrl: 'https://customer-portal.paddle.com/cpl_01/cancel',
    })
  })

  it('sends no customer id — there is nothing for a caller to steer', async () => {
    // The security property from the function's side, asserted from this side:
    // if a body ever starts carrying an identifier, this fails and someone has
    // to justify it.
    invoke.mockResolvedValue({ data: { url: 'https://customer-portal.paddle.com/x' }, error: null })
    await openPortalSession()
    expect(invoke).toHaveBeenCalledWith('billing-portal', { body: {} })
  })

  it('reports no-customer distinctly, because it is not an error', async () => {
    // An account that never bought anything needs "nothing to manage", not
    // "something went wrong" — different words, different reason token.
    invoke.mockResolvedValue({ data: null, error: httpError(404, { error: 'no-customer' }) })
    await expect(openPortalSession()).resolves.toEqual({ ok: false, reason: 'no-customer' })
  })

  it('reports an expired session as unauthenticated', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(401, { error: 'unauthenticated' }) })
    await expect(openPortalSession()).resolves.toEqual({ ok: false, reason: 'unauthenticated' })
  })

  it('falls back to the status when the body carries no reason', async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(401, null) })
    await expect(openPortalSession()).resolves.toEqual({ ok: false, reason: 'unauthenticated' })
    invoke.mockResolvedValue({ data: null, error: httpError(502, 'not json at all') })
    await expect(openPortalSession()).resolves.toEqual({ ok: false, reason: 'unavailable' })
  })

  it('survives an error whose body cannot be read twice', async () => {
    const err = { context: { status: 500, json: async () => { throw new Error('body already consumed') } } }
    invoke.mockResolvedValue({ data: null, error: err })
    await expect(openPortalSession()).resolves.toEqual({ ok: false, reason: 'unavailable' })
  })

  it('REFUSES a non-https url instead of navigating to it', async () => {
    // The response is still input. This value is assigned to
    // `window.location.href`, so a `javascript:` payload here would execute.
    for (const url of ['javascript:alert(1)', 'http://paddle.com/x', '', null, 42, undefined]) {
      invoke.mockResolvedValue({ data: { url }, error: null })
      await expect(openPortalSession(), String(url)).resolves.toEqual({ ok: false, reason: 'unavailable' })
    }
  })

  it('drops a bad cancel link but still opens the portal', async () => {
    invoke.mockResolvedValue({
      data: { url: 'https://customer-portal.paddle.com/x', cancelUrl: 'javascript:alert(1)' },
      error: null,
    })
    const r = await openPortalSession()
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.cancelUrl).toBeNull()
  })

  it('does not throw when the network does', async () => {
    invoke.mockRejectedValue(new Error('offline'))
    await expect(openPortalSession()).resolves.toEqual({ ok: false, reason: 'unavailable' })
  })

  it('reports unauthenticated when auth is not configured at all', async () => {
    clientPresent = false
    await expect(openPortalSession()).resolves.toEqual({ ok: false, reason: 'unauthenticated' })
    expect(invoke).not.toHaveBeenCalled()
  })
})

describe('portalMessage', () => {
  it('gives every failure a sentence that says what to do next', () => {
    for (const reason of ['no-customer', 'unauthenticated', 'unavailable'] as PortalFailure[]) {
      const msg = portalMessage(reason)
      expect(msg.length, reason).toBeGreaterThan(20)
      // The reason is a token for our code, not a word for a customer.
      expect(msg, reason).not.toContain(reason)
      expect(msg, reason).toMatch(/\.$/)
    }
  })

  it('does not call an empty subscription an error', () => {
    expect(portalMessage('no-customer')).toMatch(/nothing to manage/i)
    expect(portalMessage('no-customer')).not.toMatch(/error|wrong|failed/i)
  })
})
