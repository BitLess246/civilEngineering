import { describe, it, expect } from 'vitest'
import { parsePriceMap, isActiveStatus, fromPaddle, fromStripe, fromPaymongo, parseEvent } from './events'

const PRICES = { pri_pro: 'pro', pri_max: 'max' } as const
const P = { ...PRICES } as Record<string, 'pro' | 'max' | 'free'>

describe('parsePriceMap', () => {
  it('parses the env form', () => {
    expect(parsePriceMap('pri_a=pro,pri_b=max')).toEqual({ pri_a: 'pro', pri_b: 'max' })
  })

  it('tolerates whitespace and empty input', () => {
    expect(parsePriceMap(' pri_a = pro , pri_b = max ')).toEqual({ pri_a: 'pro', pri_b: 'max' })
    expect(parsePriceMap(undefined)).toEqual({})
    expect(parsePriceMap('')).toEqual({})
  })

  it('DROPS entries naming a plan that does not exist', () => {
    // A typo like 'professional' must not become a tier. Dropping it means the
    // price later fails to map and the webhook rejects loudly, instead of
    // minting a user with a nonsense plan the gate would resolve to guest.
    expect(parsePriceMap('pri_a=professional,pri_b=max')).toEqual({ pri_b: 'max' })
    expect(parsePriceMap('pri_a=admin')).toEqual({})
    expect(parsePriceMap('pri_a=guest')).toEqual({})
  })

  it('ignores malformed pairs', () => {
    expect(parsePriceMap('nonsense,=pro,pri_a=')).toEqual({})
  })
})

describe('isActiveStatus', () => {
  it('counts past_due as active — the card is still being retried', () => {
    expect(isActiveStatus('past_due')).toBe(true)
    expect(isActiveStatus('active')).toBe(true)
    expect(isActiveStatus('trialing')).toBe(true)
  })

  it('counts everything else as not paying', () => {
    for (const s of ['canceled', 'cancelled', 'unpaid', 'paused', 'incomplete', '', 'ACTIVE']) {
      expect(isActiveStatus(s), s).toBe(false)
    }
  })
})

describe('fromPaddle', () => {
  const evt = (over: Record<string, unknown> = {}) => ({
    event_id: 'evt_01', event_type: 'subscription.activated',
    data: {
      status: 'active',
      custom_data: { user_id: 'user-1' },
      items: [{ price: { id: 'pri_pro' } }],
      ...over,
    },
  })

  it('maps an active subscription to its plan', () => {
    expect(fromPaddle(evt(), P)).toEqual({ kind: 'set-plan', userId: 'user-1', plan: 'pro', eventId: 'evt_01' })
  })

  it('downgrades to free on any non-active status', () => {
    for (const status of ['canceled', 'paused', 'unpaid']) {
      expect(fromPaddle(evt({ status }), P), status)
        .toEqual({ kind: 'set-plan', userId: 'user-1', plan: 'free', eventId: 'evt_01' })
    }
  })

  it('REJECTS an unknown price instead of guessing a tier', () => {
    const r = fromPaddle(evt({ items: [{ price: { id: 'pri_typo' } }] }), P)
    expect(r).toEqual({ kind: 'reject', why: 'unknown-price', detail: 'pri_typo' })
  })

  it('rejects an event with no user to attribute it to', () => {
    expect(fromPaddle(evt({ custom_data: null }), P).kind).toBe('reject')
  })

  it('rejects an event with no id, since idempotency depends on it', () => {
    expect(fromPaddle({ ...evt(), event_id: undefined }, P)).toEqual({ kind: 'reject', why: 'no-event-id' })
  })

  it('ignores event types it does not act on', () => {
    const r = fromPaddle({ ...evt(), event_type: 'customer.updated' }, P)
    expect(r.kind).toBe('ignore')
  })

  it('does not throw on junk', () => {
    for (const junk of [null, undefined, 42, 'x', {}, { data: null }]) {
      expect(() => fromPaddle(junk, P)).not.toThrow()
      expect(fromPaddle(junk, P).kind).toBe('reject')
    }
  })

  // ── the two families ────────────────────────────────────────────────────
  const txn = (over: Record<string, unknown> = {}) => ({
    event_id: 'evt_txn', event_type: 'transaction.completed',
    data: {
      id: 'txn_01', status: 'completed', subscription_id: 'sub_01',
      customer_id: 'ctm_01', custom_data: { user_id: 'user-1' },
      items: [{ price: { id: 'pri_pro' } }],
      ...over,
    },
  })

  it('GRANTS on a completed transaction — a payment must never downgrade', () => {
    // The regression this pins: `status` on a transaction is "completed",
    // which is not a subscription status, so running it through the active
    // check made a successful payment resolve to `free`. Paddle does not order
    // its events, so that could land after the subscription.created that
    // granted the tier and silently demote a customer who had just paid.
    const r = fromPaddle(txn(), P)
    expect(r.kind).toBe('set-plan')
    if (r.kind !== 'set-plan') return
    expect(r.plan).toBe('pro')
  })

  it('never downgrades on a transaction, whatever its status says', () => {
    // Money arriving is not evidence that something should be taken away.
    // Every genuine downgrade arrives as a subscription event instead.
    for (const status of ['completed', 'paid', 'billed', '']) {
      const r = fromPaddle(txn({ status }), P)
      expect(r.kind, status).toBe('set-plan')
      if (r.kind === 'set-plan') expect(r.plan, status).toBe('pro')
    }
  })

  it('still downgrades on a cancelled SUBSCRIPTION', () => {
    // The other half of the same rule — the fix must not have disarmed it.
    const r = fromPaddle(evt({ status: 'canceled' }), P)
    expect(r.kind).toBe('set-plan')
    if (r.kind === 'set-plan') expect(r.plan).toBe('free')
  })

  // ── ids for the customer portal ─────────────────────────────────────────
  it('carries the customer and subscription ids off a subscription event', () => {
    // `data.id` IS the subscription id on this family — there is no
    // `subscription_id` field to read.
    const r = fromPaddle(evt({ id: 'sub_09', customer_id: 'ctm_09' }), P)
    expect(r.kind).toBe('set-plan')
    if (r.kind !== 'set-plan') return
    expect(r.customerId).toBe('ctm_09')
    expect(r.subscriptionId).toBe('sub_09')
  })

  it('reads the subscription id from its own field on a transaction event', () => {
    // Here `data.id` is the TRANSACTION id, and taking it would store a
    // `txn_…` where a `sub_…` belongs — the portal would then be handed an id
    // that names nothing.
    const r = fromPaddle(txn(), P)
    if (r.kind !== 'set-plan') throw new Error('expected set-plan')
    expect(r.subscriptionId).toBe('sub_01')
    expect(r.customerId).toBe('ctm_01')
  })

  it('keeps the ids on a downgrade, so a cancelled customer can still reach the portal', () => {
    // Losing them here would mean somebody who cancelled could not see their
    // final invoice or resubscribe without contacting support.
    const r = fromPaddle(evt({ status: 'canceled', id: 'sub_09', customer_id: 'ctm_09' }), P)
    if (r.kind !== 'set-plan') throw new Error('expected set-plan')
    expect(r.plan).toBe('free')
    expect(r.customerId).toBe('ctm_09')
  })

  it('omits the ids rather than inventing them when an event has none', () => {
    // The webhook writes these fields only when present, so `undefined` here
    // is what stops a later event blanking out an earlier good value.
    const r = fromPaddle(evt(), P)
    if (r.kind !== 'set-plan') throw new Error('expected set-plan')
    expect(r.customerId).toBeUndefined()
    expect(r.subscriptionId).toBeUndefined()
  })
})

describe('fromStripe', () => {
  const evt = (over: Record<string, unknown> = {}) => ({
    id: 'evt_stripe_1', type: 'customer.subscription.updated',
    data: { object: {
      status: 'active', metadata: { user_id: 'user-9' },
      items: { data: [{ price: { id: 'pri_max' } }] }, ...over,
    } },
  })

  it('maps an active subscription to its plan', () => {
    expect(fromStripe(evt(), P))
      .toEqual({ kind: 'set-plan', userId: 'user-9', plan: 'max', eventId: 'evt_stripe_1' })
  })

  it('falls back to client_reference_id when metadata is absent', () => {
    const r = fromStripe(evt({ metadata: null, client_reference_id: 'user-ref' }), P)
    expect(r).toMatchObject({ kind: 'set-plan', userId: 'user-ref' })
  })

  it('downgrades on cancellation and rejects an unknown price', () => {
    expect(fromStripe(evt({ status: 'canceled' }), P)).toMatchObject({ kind: 'set-plan', plan: 'free' })
    expect(fromStripe(evt({ items: { data: [{ price: { id: 'nope' } }] } }), P))
      .toMatchObject({ kind: 'reject', why: 'unknown-price' })
  })

  it('does not throw on junk', () => {
    for (const junk of [null, {}, { data: {} }]) expect(fromStripe(junk, P).kind).toBe('reject')
  })
})

describe('fromPaymongo', () => {
  const evt = (attrs: Record<string, unknown> = {}, type = 'subscription.updated') => ({
    data: { id: 'evt_pm_1', type: 'event', attributes: { type, data: { id: 'sub_1', attributes: {
      status: 'active', metadata: { user_id: 'user-ph' }, plan_id: 'pri_pro', ...attrs,
    } } } },
  })

  it('maps an active subscription to its plan', () => {
    expect(fromPaymongo(evt(), P))
      .toEqual({ kind: 'set-plan', userId: 'user-ph', plan: 'pro', eventId: 'evt_pm_1' })
  })

  it('reads a line item when there is no plan_id', () => {
    const r = fromPaymongo(evt({ plan_id: undefined, line_items: [{ id: 'pri_max' }] }, 'payment.paid'), P)
    expect(r).toMatchObject({ kind: 'set-plan', plan: 'max' })
  })

  it('downgrades on a failed payment', () => {
    expect(fromPaymongo(evt({}, 'payment.failed'), P)).toMatchObject({ kind: 'set-plan', plan: 'free' })
  })

  it('downgrades on an inactive subscription', () => {
    expect(fromPaymongo(evt({ status: 'cancelled' }), P)).toMatchObject({ kind: 'set-plan', plan: 'free' })
  })

  it('REJECTS an unknown price rather than granting anything', () => {
    expect(fromPaymongo(evt({ plan_id: 'pri_unknown' }), P)).toMatchObject({ kind: 'reject', why: 'unknown-price' })
  })

  it('rejects when the shape is not what we expect, rather than guessing', () => {
    // The field paths here are unconfirmed against a real PayMongo event, so
    // the behaviour on a surprise shape is the property that matters: it must
    // deny, which is visible and fixable, not grant.
    for (const junk of [null, {}, { data: {} }, { data: { id: 'e', attributes: {} } }]) {
      const r = fromPaymongo(junk, P)
      expect(['reject', 'ignore'], JSON.stringify(junk)).toContain(r.kind)
      expect(r.kind).not.toBe('set-plan')
    }
  })
})

describe('parseEvent dispatch', () => {
  it('never returns set-plan for an empty event, on any provider', () => {
    for (const p of ['paddle', 'stripe', 'paymongo'] as const) {
      expect(parseEvent(p, {}, P).kind, p).not.toBe('set-plan')
    }
  })

  it('never grants a plan when the price map is empty', () => {
    // The misconfiguration case: secrets set, PRICE_MAP forgotten. Every
    // provider must refuse rather than fall back to a tier.
    const active = [
      ['paddle', { event_id: 'e', event_type: 'subscription.activated', data: { status: 'active', custom_data: { user_id: 'u' }, items: [{ price: { id: 'x' } }] } }],
      ['stripe', { id: 'e', type: 'customer.subscription.updated', data: { object: { status: 'active', metadata: { user_id: 'u' }, items: { data: [{ price: { id: 'x' } }] } } } }],
      ['paymongo', { data: { id: 'e', attributes: { type: 'subscription.updated', data: { attributes: { status: 'active', metadata: { user_id: 'u' }, plan_id: 'x' } } } } }],
    ] as const
    for (const [prov, e] of active) {
      expect(parseEvent(prov, e, {}), prov).toMatchObject({ kind: 'reject', why: 'unknown-price' })
    }
  })
})
