// ─────────────────────────────────────────────────────────────────────────
// THE BRAND, IN ONE PLACE.
//
// The name was previously typed out in twelve files across three casings —
// `CivEngg Toolkit` in prose, `CIVENGG TOOLKIT` in the PDF document strip, and
// `CIVENGG` as the wordmark — so renaming it meant finding every one of them
// and getting each casing right. Everything now derives from
// `SITE.tradeName`, which is where a business fact belongs.
//
// The derivation is deliberately dumb: the wordmark is the FIRST word and the
// tail is the rest. That covers a two-word trade name and degrades sensibly for
// a one-word one (empty tail). `brand.test.ts` asserts the pieces reassemble
// into the trade name, so a future rename cannot leave the wordmark behind.
// ─────────────────────────────────────────────────────────────────────────

import { SITE } from './siteConfig'

/** The trade name as written in prose: `CivEngg Toolkit`.
 *  Named `BRAND_NAME`, not `BRAND`, because `pdfKit` already exports `BRAND`
 *  as the brand COLOUR — two different things must not share one name. */
export const BRAND_NAME = SITE.tradeName

/** The whole name in caps, for the PDF document strip: `CIVENGG TOOLKIT`. */
export const BRAND_UPPER = BRAND_NAME.toUpperCase()

const words = BRAND_NAME.trim().split(/\s+/)

/** The heavy half of the wordmark: `CIVENGG`. */
export const BRAND_MARK = (words[0] ?? '').toUpperCase()

/** The light half that sits beside it: `TOOLKIT`. Empty for a one-word name. */
export const BRAND_TAIL = words.slice(1).join(' ').toUpperCase()

/**
 * A PDF/report document-strip label: `CIVENGG TOOLKIT · STRUCTURE — CALCULATION REPORT`.
 *
 * Every sheet in the set is built from this, so the separator and casing cannot
 * drift between the calc sheets, the structure report and the soils report —
 * they are meant to look like pages from one document.
 */
export const docLabel = (sheet: string): string => `${BRAND_UPPER} · ${sheet.toUpperCase()}`

/**
 * The engine attribution printed under every calculation.
 *
 * Kept here rather than repeated at each call site because it is a CLAIM about
 * where the numbers came from — three copies of it is three chances for one to
 * go stale and say something no longer true.
 */
export const COMPUTED_BY = `Computed client-side by the ${BRAND_NAME} engine · verify before construction use.`
