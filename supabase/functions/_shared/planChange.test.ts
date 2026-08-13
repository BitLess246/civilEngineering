import { describe, it, expect } from 'vitest'
import {
  parsePlanCatalog, planChangeDecision, changeBody, summarizeChange,
  currentPriceOf, isChangeableStatus,
} from './planChange'
import { parsePriceMap } from './events'

/** The four prices as the secret will carry them once periods are added. */
const MAP = 'pri_pro_m=pro:monthly,pri_pro_a=pro:annual,pri_max_m=max:monthly,pri_max_a=max:annual'
const catalog = () => parsePlanCatalog(MAP)

describe('parsePlanCatalog', () => {
  it('reads the tier and the billing period', () => {
    expect(catalog()).toEqual({
      pri_pro_m: { plan: 'pro', period: 'monthly' },
      pri_pro_a: { plan: 'pro', period: 'annual' },
      pri_max_m: { plan: 'max', period: 'monthly' },
      pri_max_a: { plan: 'max', period: 'annual' },
    })
  })

  it('still reads the original period-less form', () => {
    expect(parsePlanCatalog('pri_a=pro,pri_b=max')).toEqual({
      pri_a: { plan: 'pro' }, pri_b: { plan: 'max' },
    })
  })

  it('drops an unknown plan and an unknown period rather than guessing', () => {
    const c = parsePlanCatalog('pri_a=professional:annual,pri_b=pro:quarterly,pri_c=,=pro')
    expect(c.pri_a).toBeUndefined()
    expect(c.pri_b).toEqual({ plan: 'pro' })   // tier kept, nonsense period dropped
    expect(c.pri_c).toBeUndefined()
    expect(Object.keys(c)).toEqual(['pri_b'])
  })

  it('tolerates the whitespace an env var collects', () => {
    expect(parsePlanCatalog(' pri_a = pro : annual ')).toEqual({ pri_a: { plan: 'pro', period: 'annual' } })
  })
})

// The webhook and the plan-change function read the SAME secret. If adding
// periods to it made the webhook stop recognising a price, a real payment would
// be rejected as `unknown-price` — money taken, no plan granted.
describe('parsePriceMap — forward compatibility with the period suffix', () => {
  it('still maps a price to its plan when the period is present', () => {
    expect(parsePriceMap(MAP)).toEqual({
      pri_pro_m: 'pro', pri_pro_a: 'pro', pri_max_m: 'max', pri_max_a: 'max',
    })
  })

  it('is unchanged for the original form', () => {
    expect(parsePriceMap('pri_a=pro,pri_b=max')).toEqual({ pri_a: 'pro', pri_b: 'max' })
  })
})

describe('planChangeDecision — the direction decides the money', () => {
  it('charges the difference now on a tier upgrade', () => {
    expect(planChangeDecision('pri_pro_m', 'pri_max_m', catalog()))
      .toEqual({ ok: true, mode: 'prorated_immediately', direction: 'upgrade' })
  })

  it('charges the difference now when the term lengthens', () => {
    expect(planChangeDecision('pri_pro_m', 'pri_pro_a', catalog()))
      .toEqual({ ok: true, mode: 'prorated_immediately', direction: 'upgrade' })
  })

  // Immediate proration on the way down REFUNDS the unused remainder, which is
  // not what "downgrade" means to either side of the transaction.
  it('waits for the renewal on a tier downgrade', () => {
    expect(planChangeDecision('pri_max_a', 'pri_pro_a', catalog()))
      .toEqual({ ok: true, mode: 'prorated_next_billing_period', direction: 'downgrade' })
  })

  it('waits for the renewal when the term shortens', () => {
    expect(planChangeDecision('pri_max_a', 'pri_max_m', catalog()))
      .toEqual({ ok: true, mode: 'prorated_next_billing_period', direction: 'downgrade' })
  })

  it('treats the tier as what the customer is buying, ahead of the term', () => {
    // Pro annual → Max monthly: a higher tier on a shorter term is an upgrade.
    expect(planChangeDecision('pri_pro_a', 'pri_max_m', catalog()).ok).toBe(true)
    expect(planChangeDecision('pri_pro_a', 'pri_max_m', catalog()))
      .toMatchObject({ direction: 'upgrade' })
  })

  it('refuses a price it does not sell, before Paddle is ever called', () => {
    expect(planChangeDecision('pri_pro_m', 'pri_someone_elses', catalog()))
      .toEqual({ ok: false, reason: 'unknown-price' })
  })

  // Both guesses cost somebody money: assume upgrade and a downgrade refunds
  // mid-period; assume downgrade and an upgrade is free until renewal.
  it('refuses rather than guess the direction from an unknown current price', () => {
    expect(planChangeDecision('pri_archived_2024', 'pri_max_a', catalog()))
      .toEqual({ ok: false, reason: 'unknown-current-price' })
  })

  it('refuses a move to the price already held', () => {
    expect(planChangeDecision('pri_max_a', 'pri_max_a', catalog()))
      .toEqual({ ok: false, reason: 'same-price' })
  })

  it('lands on the side that charges nothing when neither price records a period', () => {
    const c = parsePlanCatalog('pri_a=pro,pri_b=pro')
    expect(planChangeDecision('pri_a', 'pri_b', c)).toMatchObject({
      direction: 'downgrade', mode: 'prorated_next_billing_period',
    })
  })
})

describe('changeBody', () => {
  it('REPLACES the line items rather than adding to them', () => {
    // Appending would leave the customer billed for both tiers at once.
    expect(changeBody('pri_max_a', 'prorated_immediately')).toEqual({
      items: [{ price_id: 'pri_max_a', quantity: 1 }],
      proration_billing_mode: 'prorated_immediately',
      on_payment_failure: 'prevent_change',
    })
  })

  it('never lets a declined card apply the change', () => {
    for (const mode of ['prorated_immediately', 'prorated_next_billing_period'] as const) {
      expect(changeBody('pri_pro_m', mode).on_payment_failure).toBe('prevent_change')
    }
  })
})

/** A preview as Paddle returns one for an upgrade. */
const previewBody = () => ({
  data: {
    status: 'active',
    currency_code: 'USD',
    next_billed_at: '2026-09-13T00:00:00Z',
    immediate_transaction: {
      details: { totals: { subtotal: '2400', tax: '0', total: '2400' } },
      totals: { subtotal: '2400', tax: '0', total: '2400', credit: '0', grand_total: '2400' },
    },
    recurring_transaction_details: {
      totals: { subtotal: '4900', tax: '0', total: '4900', grand_total: '4900' },
    },
  },
})

describe('summarizeChange', () => {
  it('reads what is charged now, what recurs, and when', () => {
    expect(summarizeChange(previewBody())).toEqual({
      immediate: { amount: '2400', currencyCode: 'USD' },
      recurring: { amount: '4900', currencyCode: 'USD' },
      nextBilledAt: '2026-09-13T00:00:00Z',
    })
  })

  it('prefers the grand total, which is what the card is charged', () => {
    // `total` ignores an existing credit balance; `grand_total` is net of it.
    const body = previewBody()
    body.data.immediate_transaction.totals.grand_total = '900'
    body.data.immediate_transaction.totals.credit = '1500'
    expect(summarizeChange(body).immediate).toEqual({ amount: '900', currencyCode: 'USD' })
  })

  it('falls back to the detail totals when there is no top-level one', () => {
    const body = { data: { currency_code: 'EUR', immediate_transaction: { details: { totals: { total: '1750' } } } } }
    expect(summarizeChange(body).immediate).toEqual({ amount: '1750', currencyCode: 'EUR' })
  })

  it('has no immediate charge on a downgrade', () => {
    const body = { data: { currency_code: 'USD', immediate_transaction: null, next_billed_at: '2026-10-01T00:00:00Z' } }
    expect(summarizeChange(body)).toEqual({
      immediate: null, recurring: null, nextBilledAt: '2026-10-01T00:00:00Z',
    })
  })

  // "You will be charged $0.00" because a field moved is worse than saying
  // Paddle will confirm the amount.
  it('reports nothing rather than zero when the totals do not parse', () => {
    const body = { data: { currency_code: 'USD', immediate_transaction: { totals: { total: 'free' } } } }
    expect(summarizeChange(body).immediate).toBeNull()
  })

  it('survives an empty or nonsense body', () => {
    for (const junk of [null, undefined, {}, { data: null }, 'nope', 7]) {
      expect(summarizeChange(junk)).toEqual({ immediate: null, recurring: null, nextBilledAt: null })
    }
  })
})

describe('currentPriceOf', () => {
  it('finds the price the subscription is on', () => {
    const body = { data: { items: [{ price: { id: 'pri_pro_a' }, quantity: 1 }] } }
    expect(currentPriceOf(body)).toBe('pri_pro_a')
  })

  it('skips an item with no price rather than throwing', () => {
    const body = { data: { items: [null, { quantity: 1 }, { price: { id: 'pri_max_m' } }] } }
    expect(currentPriceOf(body)).toBe('pri_max_m')
  })

  it('is empty when there is nothing to read, which the caller treats as unknown', () => {
    for (const junk of [null, {}, { data: {} }, { data: { items: [] } }]) {
      expect(currentPriceOf(junk)).toBe('')
    }
  })
})

describe('isChangeableStatus', () => {
  it('allows the states that can take an item change', () => {
    for (const status of ['active', 'trialing', 'past_due']) {
      expect(isChangeableStatus({ data: { status } }), status).toBe(true)
    }
  })

  it('refuses paused, canceled and anything unreadable', () => {
    for (const status of ['paused', 'canceled', '', 'unknown']) {
      expect(isChangeableStatus({ data: { status } }), status).toBe(false)
    }
    expect(isChangeableStatus(null)).toBe(false)
  })
})
