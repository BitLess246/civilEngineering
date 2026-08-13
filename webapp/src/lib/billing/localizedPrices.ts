// ─────────────────────────────────────────────────────────────────────────
// LOCALIZED PRICING — what this visitor will actually be charged.
//
// The plans are priced in USD because Paddle cannot charge PHP (see `plans.ts`),
// and Paddle converts to the buyer's own currency at checkout. That left a gap
// the pricing page could not close on its own: a buyer in Tokyo read `$19` here
// and met `¥2,850` in the overlay. Two numbers for one purchase, and the second
// one arrives at exactly the moment a customer is deciding whether to trust us.
//
// Paddle.js `PricePreview` closes it — it returns the same figure the checkout
// will quote, for the country it infers from the request, with any inclusive tax
// already applied. This module is the pure half: turn a `PricePreviewResponse`
// into a table, and derive the two comparison figures the cards show.
//
// WHAT IS QUOTED AND WHAT IS DERIVED, because the distinction is the whole
// point of doing this at all:
//
//   • `charged` is Paddle's own `formattedTotals.total`, passed through
//     UNTOUCHED. It is the number the customer pays, so nothing here reformats,
//     re-rounds or re-converts it. Wrapping it in `Intl.NumberFormat` a second
//     time is the classic way to render `$$9.99`.
//
//   • `perMonth` and `saving` are OURS — an annual price ÷ 12, and twelve
//     monthly payments less one annual one. Paddle has no opinion on either;
//     they are shopping aids, and they are computed from the raw integer totals
//     of the two prices Paddle just quoted, never from the USD base.
//
// AMOUNTS ARRIVE IN THE CURRENCY'S LOWEST UNIT — `1900` is $19.00, but `1900`
// is also ¥1,900, because the yen has no minor unit. Dividing everything by 100
// under-reports a yen price by a factor of a hundred, which is the wrong
// direction: it advertises a price nobody could refuse and cannot be honoured.
// The divisor comes from `Intl` rather than a hand-kept list of zero-decimal
// currencies, so JPY/KRW/CLP (0) and the three-decimal dinars land right
// without this file having to know they exist.
// ─────────────────────────────────────────────────────────────────────────
import type { BillingPeriod } from '../plans'

/** One price as Paddle previewed it for this visitor. */
export interface PreviewedPrice {
  priceId: string
  /** Paddle's formatted string, e.g. `"€18.50"`. The charged amount, verbatim. */
  charged: string
  /** The same amount as an integer in the currency's lowest unit. */
  total: number
  /** ISO 4217 code Paddle quoted in, e.g. `"EUR"`. */
  currencyCode: string
}

/** Previewed prices by Paddle price id. */
export type PriceTable = Readonly<Record<string, PreviewedPrice>>

/** The `{ priceId, quantity }` line items for a preview request. */
export interface PreviewItem {
  priceId: string
  quantity: number
}

/**
 * Every price id in the config, as preview line items.
 *
 * All four go in ONE request — monthly and annual for both tiers — because the
 * cards need the pair to show a saving, and re-previewing when the period
 * toggle flips would double the network traffic to display numbers we already
 * had. Duplicates are dropped: Paddle would return one line item per repeat and
 * the table would keep the last, which is harmless but pointless.
 */
export function previewItems(prices: Record<string, Record<BillingPeriod, string>>): PreviewItem[] {
  const ids = new Set<string>()
  for (const byPeriod of Object.values(prices)) {
    for (const id of Object.values(byPeriod)) if (id) ids.add(id)
  }
  return [...ids].map((priceId) => ({ priceId, quantity: 1 }))
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null

/**
 * Read a `PricePreviewResponse` into a table.
 *
 * Takes `unknown` and validates on the way through, rather than trusting the
 * SDK's types: this is a network payload from another company's API, and the
 * failure it protects against is a renamed field silently yielding `undefined`
 * where a price should be. A line item that does not parse is DROPPED rather
 * than defaulted — a missing entry makes the page fall back to the USD base,
 * which is a true statement about the base price, while a defaulted `0` would
 * advertise the plan as free.
 */
export function readPricePreview(response: unknown): PriceTable {
  const table: Record<string, PreviewedPrice> = {}
  if (!isRecord(response)) return table

  const data = isRecord(response.data) ? response.data : null
  const details = data && isRecord(data.details) ? data.details : null
  const lineItems = details && Array.isArray(details.lineItems) ? details.lineItems : []
  // The response-level currency is the fallback: every line item in one preview
  // is quoted in the same currency, and Paddle repeats it per item only in the
  // totals objects.
  const fallbackCurrency = data && typeof data.currencyCode === 'string' ? data.currencyCode : ''

  for (const raw of lineItems) {
    if (!isRecord(raw)) continue
    const price = isRecord(raw.price) ? raw.price : null
    const priceId = price && typeof price.id === 'string' ? price.id : ''
    const formatted = isRecord(raw.formattedTotals) ? raw.formattedTotals : null
    const totals = isRecord(raw.totals) ? raw.totals : null
    const charged = formatted && typeof formatted.total === 'string' ? formatted.total : ''
    // Paddle sends the integer as a STRING (`"1900"`); an empty or non-numeric
    // one must not become NaN further down the page.
    const total = totals !== null ? Number(totals.total) : NaN
    const currencyCode = typeof raw.currencyCode === 'string' && raw.currencyCode
      ? raw.currencyCode
      : fallbackCurrency

    if (!priceId || !charged || !currencyCode) continue
    if (!Number.isFinite(total)) continue

    table[priceId] = { priceId, charged, total, currencyCode }
  }

  return table
}

/**
 * How many decimal places a currency's lowest unit implies — 2 for USD, 0 for
 * JPY/KRW/CLP, 3 for the dinars.
 *
 * Asked of `Intl` rather than hard-coded, so the answer comes from the same ICU
 * data that formats the number a line later and cannot disagree with it. An
 * unrecognised code throws, and falls back to 2: wrong for a currency ICU has
 * never heard of, but that currency is not one Paddle settles in either.
 */
export function minorUnitDigits(currencyCode: string): number {
  try {
    const opts = new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode })
      .resolvedOptions()
    return opts.maximumFractionDigits ?? 2
  } catch {
    return 2
  }
}

/** An integer in the lowest unit → a decimal amount. `1900` USD → `19`. */
export const fromLowestUnit = (total: number, currencyCode: string): number =>
  total / 10 ** minorUnitDigits(currencyCode)

/**
 * Format a DERIVED amount in the previewed currency.
 *
 * Fixed to `en-US` for the same reason `formatUsd` is: this figure sits directly
 * beside a string Paddle formatted, and Paddle quotes in the en-style
 * symbol-first form. Formatting ours in the visitor's own locale would put
 * `€17.08` next to `17,08 €` on one card and make a reader check whether they
 * are the same number.
 *
 * Never used on `charged` — see the header.
 */
export const formatMoney = (amount: number, currencyCode: string): string => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode })
      .format(amount)
  } catch {
    // An unformattable code still has to render as something honest.
    return `${amount.toFixed(2)} ${currencyCode}`
  }
}

/** The localized figures for one tier on one billing period. */
export interface LocalizedLine {
  currencyCode: string
  /** Paddle's own string for what is charged on this period. */
  charged: string
  /** Derived: the annual price ÷ 12, or the monthly price itself. */
  perMonth: string
  /** Derived: twelve monthly payments less one annual one. Null when there is nothing to show. */
  saving: string | null
  /**
   * Derived: that saving as a fraction of twelve monthly payments, e.g. `0.101`.
   *
   * Carried beside the amount so the page can quote a percentage from the SAME
   * pair of previewed prices. Reading the amount off the localized quote and the
   * percentage off the USD base would agree today — the catalog has no regional
   * overrides, so conversion is proportional — and would quietly stop agreeing
   * the day one is added.
   */
  savingFraction: number | null
}

/**
 * Build the line a card renders, or null to fall back to the USD base.
 *
 * NULL IS THE NORMAL STATE for the first few hundred milliseconds of a page
 * load, and the permanent state on a deploy with no Paddle token. The caller
 * must have a base-currency answer ready; this never invents one.
 *
 * The saving needs BOTH prices in the SAME currency, so it is dropped rather
 * than approximated when either is missing — comparing a euro annual price
 * against a dollar monthly one would produce a confident, wrong number.
 */
export function localizedLine(
  table: PriceTable,
  ids: Record<BillingPeriod, string>,
  period: BillingPeriod,
): LocalizedLine | null {
  const here = table[ids[period]]
  if (!here) return null

  const { currencyCode } = here
  const amount = fromLowestUnit(here.total, currencyCode)
  const perMonth = period === 'annual' ? amount / 12 : amount

  const monthly = table[ids.monthly]
  const annual = table[ids.annual]
  const comparable = monthly && annual
    && monthly.currencyCode === currencyCode
    && annual.currencyCode === currencyCode
  const yearOfMonthly = comparable ? fromLowestUnit(monthly.total, currencyCode) * 12 : 0
  const savedAmount = comparable
    ? yearOfMonthly - fromLowestUnit(annual.total, currencyCode)
    : 0
  const worthShowing = savedAmount > 0 && yearOfMonthly > 0

  return {
    currencyCode,
    charged: here.charged,
    perMonth: formatMoney(perMonth, currencyCode),
    saving: worthShowing ? formatMoney(savedAmount, currencyCode) : null,
    savingFraction: worthShowing ? savedAmount / yearOfMonthly : null,
  }
}

/**
 * The currency a table was quoted in, or null if it is empty or inconsistent.
 *
 * Used for the one sentence at the foot of the pricing page that names the
 * currency. A mixed table cannot be described in a single sentence, so it says
 * nothing rather than naming whichever currency happened to sort first.
 */
export function tableCurrency(table: PriceTable): string | null {
  const codes = new Set(Object.values(table).map((p) => p.currencyCode))
  return codes.size === 1 ? [...codes][0] : null
}
