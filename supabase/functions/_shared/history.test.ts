import { describe, it, expect } from 'vitest'
import { historyQuery, readHistory, VISIBLE_STATUSES, PER_PAGE } from './history'

const params = (customerId: string, after?: string | null) => {
  const r = historyQuery(customerId, after)
  if (!r.ok) throw new Error(`expected a query, got ${r.reason}`)
  return new URLSearchParams(r.query)
}

describe('historyQuery', () => {
  // Without the filter, Paddle returns EVERY transaction in the account — every
  // customer's payment history to whoever asked. There is deliberately no path
  // through this module that can build such a request.
  it('always scopes the request to one customer', () => {
    expect(params('ctm_01abc').get('customer_id')).toBe('ctm_01abc')
  })

  it('refuses to build a query without a real customer id', () => {
    for (const bad of ['', '   ', 'sub_01xyz', 'ctm', 'nonsense']) {
      expect(historyQuery(bad), bad).toEqual({ ok: false, reason: 'no-customer' })
    }
  })

  it('asks only for statuses that happened to the customer', () => {
    const status = params('ctm_01abc').get('status')!.split(',')
    // draft and ready are in-flight internal states; a draft on screen reads as
    // a charge that never occurred.
    expect(status).not.toContain('draft')
    expect(status).not.toContain('ready')
    expect(status).toEqual([...VISIBLE_STATUSES])
  })

  it('shows a failed charge, which is the row a customer can act on', () => {
    expect(VISIBLE_STATUSES).toContain('past_due')
  })

  it('asks for one screenful, newest first', () => {
    const p = params('ctm_01abc')
    expect(p.get('per_page')).toBe(String(PER_PAGE))
    expect(PER_PAGE).toBeLessThanOrEqual(30)   // Paddle's ceiling
    expect(p.get('order_by')).toBe('billed_at[DESC]')
  })

  it('carries a cursor when one is given', () => {
    expect(params('ctm_01abc', 'txn_01last').get('after')).toBe('txn_01last')
  })

  it('ignores a cursor that is not a transaction id, rather than sending it', () => {
    for (const bad of [null, undefined, '', 'ctm_01abc', '10']) {
      expect(params('ctm_01abc', bad).has('after'), String(bad)).toBe(false)
    }
  })
})

const txn = (over: Record<string, unknown> = {}) => ({
  id: 'txn_01a',
  status: 'completed',
  billed_at: '2026-08-01T10:00:00Z',
  currency_code: 'USD',
  invoice_number: '123-10001',
  details: { totals: { subtotal: '20500', tax: '0', total: '20500', credit: '0', grand_total: '20500' } },
  ...over,
})

const page = (data: unknown[], hasMore = false) => ({
  data,
  meta: { pagination: { per_page: 10, has_more: hasMore, estimated_total: data.length } },
})

describe('readHistory', () => {
  it('reads a page of transactions', () => {
    expect(readHistory(page([txn()]))).toEqual({
      items: [{
        id: 'txn_01a',
        billedAt: '2026-08-01T10:00:00Z',
        status: 'completed',
        amount: '20500',
        currencyCode: 'USD',
        invoiceNumber: '123-10001',
      }],
      hasMore: false,
    })
  })

  it('prefers the grand total, which is what the card was charged', () => {
    // A history that disagrees with a bank statement is worse than none.
    const t = txn({ details: { totals: { total: '20500', credit: '5000', grand_total: '15500' } } })
    expect(readHistory(page([t])).items[0].amount).toBe('15500')
  })

  it('falls back to the plain total when there is no grand total', () => {
    const t = txn({ details: { totals: { total: '4900' } } })
    expect(readHistory(page([t])).items[0].amount).toBe('4900')
  })

  it('keeps a transaction that has not been billed yet', () => {
    const t = txn({ billed_at: null, status: 'billed' })
    expect(readHistory(page([t])).items[0]).toMatchObject({ billedAt: null, status: 'billed' })
  })

  // "You paid $0.00" invites a support ticket about a refund that never
  // happened, so a row that does not parse does not appear.
  it('drops a row with no readable amount rather than showing zero', () => {
    const broken = txn({ details: { totals: {} } })
    const nonNumeric = txn({ id: 'txn_01b', details: { totals: { total: 'lots' } } })
    const good = txn({ id: 'txn_01c' })
    const { items } = readHistory(page([broken, nonNumeric, good]))
    expect(items.map((i) => i.id)).toEqual(['txn_01c'])
  })

  it('drops a row with no currency, which cannot be displayed honestly', () => {
    expect(readHistory(page([txn({ currency_code: '' })])).items).toHaveLength(0)
  })

  it('reports an unknown status rather than dropping the row', () => {
    // The amount is the important part; a status Paddle adds later should not
    // make a real payment vanish from the list.
    expect(readHistory(page([txn({ status: '' })])).items[0].status).toBe('unknown')
  })

  it('carries has_more so the caller can offer another page', () => {
    expect(readHistory(page([txn()], true)).hasMore).toBe(true)
    expect(readHistory(page([txn()], false)).hasMore).toBe(false)
    // Anything other than a literal true is treated as "no more".
    expect(readHistory({ data: [txn()], meta: { pagination: { has_more: 'yes' } } }).hasMore).toBe(false)
  })

  it('survives an empty or nonsense body', () => {
    for (const junk of [null, undefined, {}, { data: null }, 'nope', 7, { data: [null, 3, 'x'] }]) {
      expect(readHistory(junk)).toEqual({ items: [], hasMore: false })
    }
  })
})
