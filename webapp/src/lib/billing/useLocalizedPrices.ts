// ─────────────────────────────────────────────────────────────────────────
// FETCHING THE LOCALIZED PRICES — the I/O shell around `localizedPrices`.
//
// Same split as `paddleCheckout`/`paddleConfig`: the rules are pure and tested
// next door, and what is here is the part that needs a browser — one Paddle.js
// call, cached, wired into React.
//
// NO COUNTRY IS SENT. Paddle infers it from the request IP, which is also how
// the checkout overlay decides, so the preview and the overlay cannot disagree.
// The alternative — a country selector — invites a visitor to shop for whichever
// market is cheapest and then meet their real country's price at checkout, which
// is the exact mismatch this feature exists to remove.
//
// IT FAILS QUIET, NOT CLOSED. An ad blocker eating Paddle.js, an offline
// visitor, or a deploy with no token all end at an empty table, and the pricing
// page falls back to the USD base it has always shown. That is a true statement
// about the price (it is the base the conversion starts from) so there is
// nothing to warn about — unlike `paddleConfig`, where failing open would put a
// dead Buy button on screen.
// ─────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { PADDLE_CONFIG } from './paddleConfig'
import { loadPaddle } from './paddleCheckout'
import { previewItems, readPricePreview, type PriceTable } from './localizedPrices'

const EMPTY: PriceTable = {}

/**
 * One request per page load, shared by every mount.
 *
 * The prices cannot change while the tab is open, and the pricing page is
 * reachable from several places — caching the promise means bouncing between
 * `/pricing` and a paywall notice does not re-ask Paddle each time.
 */
let cached: Promise<PriceTable> | null = null

function fetchPrices(): Promise<PriceTable> {
  if (cached) return cached
  cached = (async () => {
    const config = PADDLE_CONFIG
    if (!config) return EMPTY
    const paddle = await loadPaddle()
    if (!paddle) return EMPTY
    return readPricePreview(await paddle.PricePreview({ items: previewItems(config.prices) }))
  })().catch((err) => {
    // Let a later mount try again — the usual cause is a transient network
    // failure, and caching that forever would pin the page to USD until reload.
    cached = null
    console.error('[billing] price preview failed; showing base USD prices', err)
    return EMPTY
  })
  return cached
}

/**
 * The previewed prices for this visitor, keyed by Paddle price id.
 *
 * Empty until the request resolves, and empty forever if it cannot — callers
 * must have a base-currency answer ready rather than rendering a placeholder,
 * so a blocked Paddle.js leaves a complete pricing page rather than four cards
 * with spinners where the prices should be.
 */
export function useLocalizedPrices(): PriceTable {
  const [prices, setPrices] = useState<PriceTable>(EMPTY)

  useEffect(() => {
    let live = true
    void fetchPrices().then((table) => { if (live) setPrices(table) })
    return () => { live = false }
  }, [])

  return prices
}

/** Test seam: drop the cached request. Not used by the app. */
export const resetPriceCache = (): void => { cached = null }
