import { describe, it, expect } from 'vitest'
import { readChange, describeChange, showDate, changeMessage, type PlanChange } from './changePlan'

const upgrade = (over: Partial<PlanChange> = {}): PlanChange => ({
  immediate: { amount: '2400', currencyCode: 'USD' },
  recurring: { amount: '4900', currencyCode: 'USD' },
  nextBilledAt: '2026-09-13T00:00:00Z',
  direction: 'upgrade',
  committed: false,
  ...over,
})

describe('readChange', () => {
  it('reads a preview payload', () => {
    expect(readChange({
      immediate: { amount: '2400', currencyCode: 'USD' },
      recurring: { amount: '4900', currencyCode: 'USD' },
      nextBilledAt: '2026-09-13T00:00:00Z',
      direction: 'upgrade',
      committed: false,
    })).toEqual(upgrade())
  })

  it('accepts a downgrade with no money in it at all', () => {
    const change = readChange({ direction: 'downgrade', committed: true })
    expect(change).toEqual({
      immediate: null, recurring: null, nextBilledAt: null, direction: 'downgrade', committed: true,
    })
  })

  // The direction is what the whole confirm screen is written around; without
  // it the payload is not an answer to the question that was asked.
  it('rejects a payload with no direction', () => {
    for (const junk of [null, undefined, {}, 'nope', { direction: 'sideways' }]) {
      expect(readChange(junk)).toBeNull()
    }
  })

  it('drops a half-read amount rather than showing part of it', () => {
    const change = readChange({ direction: 'upgrade', immediate: { amount: '2400' } })!
    expect(change.immediate).toBeNull()
  })

  it('drops an amount that is not a number', () => {
    const change = readChange({ direction: 'upgrade', immediate: { amount: 'lots', currencyCode: 'USD' } })!
    expect(change.immediate).toBeNull()
  })
})

describe('showDate', () => {
  it('reads a Paddle timestamp', () => {
    expect(showDate('2026-09-13T00:00:00Z')).toBe('September 13, 2026')
  })

  it('is empty for anything unreadable, so the sentence can leave it out', () => {
    for (const junk of [null, '', 'next tuesday', '2026-13-45T00:00:00Z']) {
      expect(showDate(junk)).toBe('')
    }
  })
})

describe('describeChange — the sentence on the confirm screen', () => {
  it('quotes what is charged today and what recurs after', () => {
    expect(describeChange(upgrade()))
      .toBe('You will be charged $24.00 today, then $49.00 from September 13, 2026.')
  })

  it('says nothing is due today on a downgrade', () => {
    expect(describeChange(upgrade({
      direction: 'downgrade', immediate: null, recurring: { amount: '1900', currencyCode: 'USD' },
    }))).toBe('Nothing to pay today. From September 13, 2026 you will pay $19.00.')
  })

  it('uses the currency Paddle quoted, with no minor unit where there is none', () => {
    expect(describeChange(upgrade({
      immediate: { amount: '3600', currencyCode: 'JPY' },
      recurring: { amount: '7300', currencyCode: 'JPY' },
    }))).toBe('You will be charged ¥3,600 today, then ¥7,300 from September 13, 2026.')
  })

  // A figure invented to fill the sentence is the version of this that ends in
  // a chargeback; naming who will confirm it is both true and useful.
  it('promises no number when Paddle gave none', () => {
    expect(describeChange(upgrade({ immediate: null, recurring: null, nextBilledAt: null })))
      .toBe('Paddle will confirm the amount due today.')
  })

  it('drops the date but keeps the price when the renewal date is missing', () => {
    expect(describeChange(upgrade({ nextBilledAt: null })))
      .toBe('You will be charged $24.00 today, then $49.00 per billing period.')
  })

  it('falls back to "your next renewal" on a downgrade with no date', () => {
    expect(describeChange(upgrade({ direction: 'downgrade', immediate: null, recurring: null, nextBilledAt: null })))
      .toBe('Nothing to pay today. The change takes effect at your next renewal.')
  })
})

describe('changeMessage', () => {
  it('says plainly that a declined card changed nothing', () => {
    // The one message that has to be exactly right: the customer must not be
    // left wondering whether they are now on a tier they did not pay for.
    expect(changeMessage('payment-failed')).toContain('nothing has changed')
    expect(changeMessage('payment-failed')).toContain('still on your current plan')
  })

  it('has a sentence for every failure, and none of them blame the customer', () => {
    const reasons = [
      'no-subscription', 'not-changeable', 'payment-failed', 'unknown-current-price',
      'same-price', 'unauthenticated', 'unavailable',
    ] as const
    for (const reason of reasons) {
      const msg = changeMessage(reason)
      expect(msg.length, reason).toBeGreaterThan(20)
      expect(msg, reason).toMatch(/[.!]$/)
    }
  })
})
