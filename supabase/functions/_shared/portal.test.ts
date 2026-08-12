import { describe, it, expect } from 'vitest'
import { apiBase, paddleEnv, customerIdFor, portalUrls, PADDLE_API } from './portal'

describe('paddleEnv / apiBase', () => {
  it('sends sandbox traffic to the sandbox host', () => {
    expect(paddleEnv('sandbox')).toBe('sandbox')
    expect(apiBase('sandbox')).toBe(PADDLE_API.sandbox)
  })

  it('DEFAULTS TO PRODUCTION for anything unset or misspelled', () => {
    // The opposite of the web app's fail-closed reading, and deliberate. A
    // live deployment whose PADDLE_ENV went missing must not start asking the
    // sandbox about real customers — that 403s every paying subscriber who is
    // trying to cancel. Guessing production with a sandbox key merely 403s the
    // test account, which someone notices immediately and nobody is charged for.
    for (const raw of [undefined, '', 'Sandbox', 'SANDBOX', 'staging', 'prod']) {
      expect(paddleEnv(raw), String(raw)).toBe('production')
      expect(apiBase(raw), String(raw)).toBe(PADDLE_API.production)
    }
  })

  it('points at Paddle over https, both environments', () => {
    for (const base of Object.values(PADDLE_API)) expect(base).toMatch(/^https:\/\/[a-z-]*api\.paddle\.com$/)
  })
})

describe('customerIdFor', () => {
  it('finds the customer and subscription an account has', () => {
    const r = customerIdFor({ paddle_customer_id: 'ctm_01abc', paddle_subscription_id: 'sub_01xyz' })
    expect(r).toEqual({ ok: true, customerId: 'ctm_01abc', subscriptionIds: ['sub_01xyz'] })
  })

  it('opens the portal with no subscription ids rather than failing', () => {
    // Valid, and the right call: the overview still works, and a customer with
    // a lapsed subscription still needs their invoices.
    const r = customerIdFor({ paddle_customer_id: 'ctm_01abc' })
    expect(r).toEqual({ ok: true, customerId: 'ctm_01abc', subscriptionIds: [] })
  })

  it('reports no-customer for an account that never checked out', () => {
    // Distinct from an error on purpose: "you have no subscription yet" is
    // both truer and more useful than "something went wrong".
    for (const meta of [null, undefined, {}, { paddle_customer_id: '' }, { paddle_customer_id: '   ' }]) {
      expect(customerIdFor(meta).ok, JSON.stringify(meta)).toBe(false)
    }
  })

  it('refuses anything that is not a ctm_ id', () => {
    // Forwarding junk earns a Paddle 400 whose message means nothing to the
    // person who pressed the button. `sub_` here is the likely mix-up.
    for (const bad of ['sub_01xyz', 'txn_01xyz', 'ctm', 'x'.repeat(40), 42, {}, ['ctm_01']]) {
      expect(customerIdFor({ paddle_customer_id: bad }).ok, String(bad)).toBe(false)
    }
  })

  it('drops a malformed subscription id but still opens the portal', () => {
    // Losing a deep link is a nuisance; failing the whole request over it
    // would deny access to billing entirely.
    const r = customerIdFor({ paddle_customer_id: 'ctm_01abc', paddle_subscription_id: 'txn_01' })
    expect(r).toEqual({ ok: true, customerId: 'ctm_01abc', subscriptionIds: [] })
  })

  it('takes the id from metadata only — there is no other input', () => {
    // The security property, stated as a test so a future signature change
    // that adds a caller-supplied id has to argue with it: an authenticated
    // user must never be able to name the customer whose portal is minted.
    expect(customerIdFor.length).toBe(1)
  })
})

describe('portalUrls', () => {
  const body = (over: Record<string, unknown> = {}) => ({
    data: {
      urls: {
        general: { overview: 'https://sandbox-customer-portal.paddle.com/cpl_01' },
        subscriptions: [{ id: 'sub_01', cancel_subscription: 'https://sandbox-customer-portal.paddle.com/cpl_01/cancel' }],
        ...over,
      },
    },
  })

  it('returns the overview and the cancel deep link', () => {
    const r = portalUrls(body())
    expect(r).toEqual({
      ok: true,
      overview: 'https://sandbox-customer-portal.paddle.com/cpl_01',
      cancel: 'https://sandbox-customer-portal.paddle.com/cpl_01/cancel',
    })
  })

  it('returns a null cancel link when there is no subscription', () => {
    const r = portalUrls(body({ subscriptions: [] }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.cancel).toBeNull()
  })

  it('rejects a response with no usable overview url', () => {
    for (const bad of [null, undefined, 42, {}, { data: {} }, { data: { urls: {} } }]) {
      expect(portalUrls(bad).ok, JSON.stringify(bad)).toBe(false)
    }
  })

  it('refuses a non-https url wherever it appears', () => {
    // A URL from the provider is still input. `javascript:` in a value the
    // browser is about to navigate to is the whole reason this is checked.
    for (const bad of ['javascript:alert(1)', 'http://paddle.com/x', '//evil.example', '']) {
      expect(portalUrls({ data: { urls: { general: { overview: bad } } } }).ok, bad).toBe(false)
    }
    const r = portalUrls(body({ subscriptions: [{ cancel_subscription: 'javascript:alert(1)' }] }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.cancel).toBeNull()
  })

  it('never returns the customer id or session id it was given', () => {
    // Only a URL leaves the server. The response Paddle sends also names the
    // customer, and the browser has no use for that.
    const r = portalUrls({
      data: { customer_id: 'ctm_secret', id: 'cpls_secret', urls: body().data.urls },
    })
    expect(JSON.stringify(r)).not.toMatch(/ctm_secret|cpls_secret/)
  })
})
