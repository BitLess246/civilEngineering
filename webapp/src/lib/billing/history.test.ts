import { describe, it, expect } from 'vitest'
import { readPage, rowAmount, rowDate, statusLabel, needsAttention, type HistoryRow } from './history'

const row = (over: Partial<HistoryRow> = {}): HistoryRow => ({
  id: 'txn_01a',
  billedAt: '2026-08-01T10:00:00Z',
  status: 'completed',
  amount: '20500',
  currencyCode: 'USD',
  invoiceNumber: '123-10001',
  ...over,
})

describe('readPage', () => {
  it('reads a page of rows', () => {
    expect(readPage({ items: [row()], hasMore: true })).toEqual({ items: [row()], hasMore: true })
  })

  it('drops a row that cannot be displayed honestly', () => {
    const items = [
      { ...row(), amount: '' },
      { ...row(), id: 'txn_b', currencyCode: '' },
      { ...row(), id: 'txn_c', amount: 'lots' },
      row({ id: 'txn_d' }),
    ]
    expect(readPage({ items }).items.map((r) => r.id)).toEqual(['txn_d'])
  })

  it('defaults a missing status rather than dropping a real payment', () => {
    expect(readPage({ items: [{ ...row(), status: '' }] }).items[0].status).toBe('unknown')
  })

  it('is empty for anything that is not a page', () => {
    for (const junk of [null, undefined, {}, { items: null }, 'nope', { items: [1, 'x', null] }]) {
      expect(readPage(junk)).toEqual({ items: [], hasMore: false })
    }
  })

  it('offers another page only on a literal true', () => {
    expect(readPage({ items: [], hasMore: 'yes' }).hasMore).toBe(false)
  })
})

describe('rowAmount', () => {
  it('formats cents in the currency charged', () => {
    expect(rowAmount(row())).toBe('$205.00')
    expect(rowAmount(row({ amount: '1850', currencyCode: 'EUR' }))).toBe('€18.50')
  })

  // The reason the lowest-unit helper is shared with the pricing page: a
  // transaction carries no pre-formatted string, and ¥30,750 read as ¥307.50
  // would understate what the customer actually paid by a hundredfold.
  it('does not divide a zero-decimal currency', () => {
    expect(rowAmount(row({ amount: '30750', currencyCode: 'JPY' }))).toBe('¥30,750')
  })
})

describe('rowDate', () => {
  it('reads a Paddle timestamp', () => {
    expect(rowDate('2026-08-01T10:00:00Z')).toBe('Aug 1, 2026')
  })

  it('is empty for a transaction not billed yet, or an unreadable date', () => {
    for (const junk of [null, '', 'soon', '2026-99-99T00:00:00Z']) {
      expect(rowDate(junk)).toBe('')
    }
  })
})

describe('statusLabel', () => {
  it('says "Paid" for both statuses that mean the money arrived', () => {
    expect(statusLabel('paid')).toBe('Paid')
    expect(statusLabel('completed')).toBe('Paid')
  })

  // The only row that asks anything of the reader is the only one phrased as
  // an instruction.
  it('tells a customer what to do about a failed charge', () => {
    expect(statusLabel('past_due')).toContain('update your card')
    expect(needsAttention('past_due')).toBe(true)
    for (const s of ['paid', 'completed', 'billed', 'canceled']) {
      expect(needsAttention(s), s).toBe(false)
    }
  })

  it('passes an unknown status through rather than hiding the row', () => {
    expect(statusLabel('something_new')).toBe('something_new')
  })
})
