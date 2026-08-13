// ─────────────────────────────────────────────────────────────────────────
// BILLING HISTORY — the pure half of "what have I paid you?".
//
// Paddle's portal already lists invoices, so this exists for one reason: a
// customer should be able to see what they were charged without leaving the
// app and without minting a session. The portal stays where downloads, cards
// and cancellation live; this is the read-only summary beside them.
//
// THE `customer_id` FILTER IS THE SECURITY GUARANTEE, not a convenience. A
// `GET /transactions` without one returns every transaction in the account —
// every customer's payment history to whoever asked first. `historyQuery`
// therefore refuses to build a query string without a customer id, so there is
// no path through this module that produces an unscoped request.
//
// DRAFT AND READY ARE EXCLUDED. They are in-flight internal states, not things
// that happened to the customer; showing a `draft` reads as a charge that never
// occurred.
//
// AMOUNTS ARE STRINGS IN THE LOWEST UNIT, as everywhere else in this codebase
// — passed through untouched for the browser to format. Unlike `PricePreview`,
// a transaction carries NO pre-formatted string, which is exactly why the
// lowest-unit handling in `localizedPrices` is shared rather than re-derived.
// ─────────────────────────────────────────────────────────────────────────

/**
 * The statuses a customer should see.
 *
 * `past_due` is included deliberately: a failed charge that is being retried is
 * the one row a customer most needs to see, because it is the one they can do
 * something about. Hiding it until it resolves is how a subscription lapses
 * without warning.
 */
export const VISIBLE_STATUSES = ['billed', 'paid', 'past_due', 'completed', 'canceled'] as const

/** Paddle's ceiling is 30; a page of ten is a screenful. */
export const PER_PAGE = 10

export type QueryResult =
  | { ok: true; query: string }
  | { ok: false; reason: 'no-customer' }

/**
 * The query string for one page of a customer's transactions.
 *
 * Takes the customer id as its only required input and refuses a blank one —
 * see the header. `after` is a transaction id, not an offset: Paddle paginates
 * by cursor, and the caller passes the last id it rendered.
 */
export function historyQuery(customerId: string, after?: string | null): QueryResult {
  const id = customerId.trim()
  if (!id.startsWith('ctm_')) return { ok: false, reason: 'no-customer' }

  const params = new URLSearchParams({
    customer_id: id,
    status: VISIBLE_STATUSES.join(','),
    per_page: String(PER_PAGE),
    // Newest first, which is the order anybody scanning a billing history reads
    // in. Paddle's default is by id, which is close but not guaranteed.
    order_by: 'billed_at[DESC]',
  })
  const cursor = (after ?? '').trim()
  if (cursor.startsWith('txn_')) params.set('after', cursor)

  return { ok: true, query: params.toString() }
}

/** One row of the table. */
export interface HistoryItem {
  id: string
  /** RFC 3339, or null for a transaction Paddle has not billed yet. */
  billedAt: string | null
  status: string
  /** Integer string in the currency's lowest unit. */
  amount: string
  currencyCode: string
  /** Paddle's own invoice number, when the transaction has one. */
  invoiceNumber: string | null
}

export interface HistoryPage {
  items: HistoryItem[]
  hasMore: boolean
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/**
 * Read a list response into rows.
 *
 * `grand_total` first, then `total`: the former is what the card was charged
 * after any credit balance, and a history that disagrees with a bank statement
 * is worse than no history. A row whose amount does not parse is DROPPED rather
 * than shown as zero — "you paid $0.00" invites a support ticket about a refund
 * that never happened.
 */
export function readHistory(body: unknown): HistoryPage {
  const items: HistoryItem[] = []
  if (!isRecord(body)) return { items, hasMore: false }

  const data = Array.isArray(body.data) ? body.data : []
  for (const raw of data) {
    if (!isRecord(raw)) continue
    const id = str(raw.id)
    const details = isRecord(raw.details) ? raw.details : null
    const totals = details && isRecord(details.totals) ? details.totals : null
    const amount = str(totals?.grand_total) || str(totals?.total)
    const currencyCode = str(raw.currency_code)
    if (!id || !amount || !currencyCode) continue
    if (!Number.isFinite(Number(amount))) continue

    items.push({
      id,
      billedAt: str(raw.billed_at) || null,
      status: str(raw.status) || 'unknown',
      amount,
      currencyCode,
      invoiceNumber: str(raw.invoice_number) || null,
    })
  }

  const meta = isRecord(body.meta) ? body.meta : null
  const pagination = meta && isRecord(meta.pagination) ? meta.pagination : null
  // `has_more` is the only signal trusted here. `estimated_total` is a count
  // Paddle itself calls estimated, and it returns -1 when counting is skipped.
  return { items, hasMore: pagination?.has_more === true }
}
