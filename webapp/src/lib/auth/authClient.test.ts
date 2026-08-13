import { describe, it, expect } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import { toUser } from './authClient'

/** Minimal session stand-in — only the fields `toUser` reads. */
const session = (
  app: Record<string, unknown>, user: Record<string, unknown> = {},
): Session => ({
  user: {
    id: 'u1', email: 'a@b.c', email_confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: app, user_metadata: user,
  },
} as unknown as Session)

describe('where the plan comes from', () => {
  it('reads the plan from APP metadata', () => {
    expect(toUser(session({ plan: 'pro' }))!.plan).toBe('pro')
  })

  it('IGNORES a plan planted in user metadata', () => {
    // The security property. `updateUser({ data })` writes user_metadata, so an
    // account could set this itself; if it were honoured, the paywall would be
    // a suggestion and any signed-in user could grant themselves `max` from a
    // browser console.
    expect(toUser(session({}, { plan: 'max' }))!.plan).toBeNull()
  })

  it('takes app metadata even when user metadata disagrees', () => {
    expect(toUser(session({ plan: 'free' }, { plan: 'max' }))!.plan).toBe('free')
  })

  it('is null when no plan has been granted', () => {
    expect(toUser(session({}))!.plan).toBeNull()
  })

  it('ignores a non-string plan rather than coercing it', () => {
    expect(toUser(session({ plan: 42 }))!.plan).toBeNull()
    expect(toUser(session({ plan: { tier: 'max' } }))!.plan).toBeNull()
  })
})

describe('the rest of the mapping', () => {
  it('still takes the display NAME from user metadata, which the user owns', () => {
    // Deliberate: a name is the user's to set. A plan is not.
    const u = toUser(session({ plan: 'pro' }, { name: 'A. Engineer' }))!
    expect(u.name).toBe('A. Engineer')
    expect(u.plan).toBe('pro')
  })

  it('carries id, email and verification through', () => {
    const u = toUser(session({}))!
    expect(u.id).toBe('u1')
    expect(u.email).toBe('a@b.c')
    expect(u.emailVerified).toBe(true)
  })

  it('is null for no session', () => {
    expect(toUser(null)).toBeNull()
  })

  it('survives metadata being absent entirely', () => {
    const s = { user: { id: 'u2', email: null } } as unknown as Session
    const u = toUser(s)!
    expect(u.plan).toBeNull()
    expect(u.name).toBeNull()
    expect(u.emailVerified).toBe(false)
    expect(u.hasSubscription).toBe(false)
  })
})

describe('hasSubscription', () => {
  it('is true for an account the webhook has recorded a subscription on', () => {
    expect(toUser(session({ plan: 'pro', paddle_subscription_id: 'sub_01xyz' }))!.hasSubscription).toBe(true)
  })

  it('is false for a paid account with no subscription id yet', () => {
    // The pricing page must offer "Choose Max" here, not "Switch to Max" —
    // there is nothing to switch, and the change function would 404.
    expect(toUser(session({ plan: 'pro' }))!.hasSubscription).toBe(false)
  })

  // Same provenance rule as the plan: user_metadata is the account's own to
  // write, so a subscription claimed there means nothing.
  it('IGNORES a subscription id planted in user metadata', () => {
    expect(toUser(session({}, { paddle_subscription_id: 'sub_01xyz' }))!.hasSubscription).toBe(false)
  })

  it('ignores a malformed or non-string id', () => {
    for (const bad of ['', 'ctm_01abc', 'sub', 42, { id: 'sub_01xyz' }]) {
      expect(toUser(session({ paddle_subscription_id: bad }))!.hasSubscription, String(bad)).toBe(false)
    }
  })
})
