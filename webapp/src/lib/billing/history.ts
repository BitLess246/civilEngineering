// ─────────────────────────────────────────────────────────────────────────
// BILLING HISTORY — the browser's side of "what have I paid you?".
//
// Thin, like `portal.ts` and `changePlan.ts`. The `billing-history` Edge
// Function resolves whose history it is and scopes the request; this asks for a
// page and turns rows into strings.
//
// AN EMPTY HISTORY IS NOT AN ERROR. An account that has never bought anything
// gets `{ items: [], hasMore: false }`, and the profile page renders nothing at
// all — a "no billing history" panel on a free account is noise about a
// relationship the reader has not entered into.
//
// AMOUNTS ARE FORMATTED HERE, not by Paddle. Unlike `PricePreview`, a
// transaction carries no pre-formatted total — only the integer and a currency
// code — so it goes through the same lowest-unit conversion the pricing page
// uses. That shared helper is why a yen transaction reads ¥30,750 rather than
// ¥307.50 without this file knowing anything about the yen.
// ─────────────────────────────────────────────────────────────────────────
import { getClient } from '../auth/authClient'
import { formatMoney, fromLowestUnit } from './localizedPrices'

const FUNCTION_NAME = 'billing-history'

export interface HistoryRow {
  id: string
  /** RFC 3339, or null for a transaction Paddle has not billed yet. */
  billedAt: string | null
  status: string
  amount: string
  currencyCode: string
  invoiceNumber: string | null
}

export interface HistoryPage {
  items: HistoryRow[]
  hasMore: boolean
}

export type HistoryResult =
  | { ok: true; page: HistoryPage }
  | { ok: false; reason: 'unauthenticated' | 'unavailable' }

/**
 * One page of the signed-in user's transactions.
 *
 * `after` is the id of the last row already on screen — Paddle paginates by
 * cursor. It takes no customer: the function resolves that from the caller's
 * own record, which is what stops a signed-in user reading anybody else's.
 */
export async function fetchBillingHistory(after?: string | null): Promise<HistoryResult> {
  const client = getClient()
  if (!client) return { ok: false, reason: 'unauthenticated' }

  try {
    const { data, error } = await client.functions.invoke(FUNCTION_NAME, {
      body: after ? { after } : {},
    })
    if (error) {
      const ctx = (error as { context?: { status?: number } })?.context
      return { ok: false, reason: ctx?.status === 401 ? 'unauthenticated' : 'unavailable' }
    }
    return { ok: true, page: readPage(data) }
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/**
 * Read the payload, dropping any row that cannot be displayed honestly.
 *
 * The function already filters these, so this is the second gate rather than
 * the only one — but a row rendered as `$NaN` or `$0.00` is the kind of thing a
 * customer screenshots, and the cost of dropping it is one missing line in a
 * list that is not the system of record.
 */
export function readPage(data: unknown): HistoryPage {
  if (!isRecord(data)) return { items: [], hasMore: false }
  const raw = Array.isArray(data.items) ? data.items : []
  const items: HistoryRow[] = []

  for (const row of raw) {
    if (!isRecord(row)) continue
    const id = str(row.id)
    const amount = str(row.amount)
    const currencyCode = str(row.currencyCode)
    if (!id || !amount || !currencyCode || !Number.isFinite(Number(amount))) continue
    items.push({
      id,
      billedAt: str(row.billedAt) || null,
      status: str(row.status) || 'unknown',
      amount,
      currencyCode,
      invoiceNumber: str(row.invoiceNumber) || null,
    })
  }

  return { items, hasMore: data.hasMore === true }
}

/** A row's amount, in the currency it was charged in. */
export const rowAmount = (row: HistoryRow): string =>
  formatMoney(fromLowestUnit(Number(row.amount), row.currencyCode), row.currencyCode)

/** `2026-08-01T10:00:00Z` → `Aug 1, 2026`; empty for anything unreadable. */
export function rowDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * A status in words.
 *
 * Paddle's vocabulary is not the customer's: `completed` and `billed` both mean
 * "this went through", and `past_due` is the only one that asks anything of the
 * reader — so it is the only one this spells out as an action.
 */
export function statusLabel(status: string): string {
  switch (status) {
    case 'paid':
    case 'completed':
      return 'Paid'
    case 'billed':
      return 'Awaiting payment'
    case 'past_due':
      return 'Payment failed — update your card'
    case 'canceled':
      return 'Cancelled'
    default:
      return status
  }
}

/** Whether a row needs the customer to do something. */
export const needsAttention = (status: string): boolean => status === 'past_due'
