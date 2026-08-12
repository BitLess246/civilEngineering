// The endpoint meters a page. If its idea of which page drifts from the UI's,
// the failure is quiet and one-sided: the server refuses a guest on a page the
// client still believes is free, so the counter reads "3 free runs left" next
// to a paywall. This is the check that stops the two lists parting.

import { describe, it, expect } from 'vitest'
import { TRIAL_ROUTE } from './routes'
import { GUEST_TRIAL_ROUTES, accessFor, GUEST_TRIAL_LIMIT } from '../../src/lib/trialQuota'
import { GUEST_TRIAL_LIMIT as SERVER_LIMIT } from './quota'

describe('the routes the endpoints meter', () => {
  it('are all routes the UI actually offers on trial', () => {
    for (const route of Object.values(TRIAL_ROUTE)) {
      expect(GUEST_TRIAL_ROUTES, route).toContain(route)
    }
  })

  it('are judged `trial` for a guest, not members-only or public', () => {
    // A public route would mean the endpoint meters something the UI never
    // warns about; a members-only one would mean the page is unreachable
    // anyway and the metering is dead code.
    for (const route of Object.values(TRIAL_ROUTE)) {
      expect(accessFor(route, false).kind, route).toBe('trial')
      expect(accessFor(route, true).kind, route).toBe('member')
    }
  })

  it('run out at the same count the UI counts down to', () => {
    // Two constants, one promise. If they part, the banner says "1 free run
    // left" on the request the server has already refused.
    expect(SERVER_LIMIT).toBe(GUEST_TRIAL_LIMIT)
    for (const route of Object.values(TRIAL_ROUTE)) {
      const spent = { [route]: GUEST_TRIAL_LIMIT }
      expect(accessFor(route, false, spent).kind, route).toBe('trial-exhausted')
    }
  })

  it('covers one endpoint each, with no two endpoints sharing an allowance', () => {
    const routes = Object.values(TRIAL_ROUTE)
    expect(new Set(routes).size).toBe(routes.length)
  })
})
