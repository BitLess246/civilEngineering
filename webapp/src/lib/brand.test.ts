// The brand was previously typed out by hand in twelve files across three
// casings, and nothing failed when they disagreed. These tests exist so the
// next rename cannot leave a stale spelling behind in a PDF nobody reopened.

import { describe, it, expect } from 'vitest'
import { BRAND_NAME, BRAND_UPPER, BRAND_MARK, BRAND_TAIL, COMPUTED_BY, docLabel, BRAND_MONOGRAM } from './brand'
import { SITE } from './siteConfig'

describe('brand', () => {
  it('is the trade name — the brand is a business fact, not a UI string', () => {
    expect(BRAND_NAME).toBe(SITE.tradeName)
    expect(BRAND_NAME).toBe('Zeta')
  })

  it('splits into a wordmark that reassembles into the whole name', () => {
    // The invariant that matters: rename the trade name and BOTH halves of the
    // wordmark follow. A test on the literals alone would pass while the mark
    // still read CIVENG.
    expect([BRAND_MARK, BRAND_TAIL].filter(Boolean).join(' ')).toBe(BRAND_UPPER)
    expect(BRAND_MARK).toBe('ZETA')
    // A one-word trade name has NO tail, and the five wordmarks render the
    // tail span only when there is one — an empty span in a flex row with a
    // gap still takes the gap, which shifted the footer tagline 12 px right.
    expect(BRAND_TAIL).toBe('')
  })

  it('builds document strips in the shared house style', () => {
    expect(docLabel('Structure — Calculation Report'))
      .toBe('ZETA · STRUCTURE — CALCULATION REPORT')
    // Every sheet in the set uses the same separator, so the calc sheets, the
    // structure report and the soils report read as one document.
    expect(docLabel('anything')).toMatch(/^ZETA · /)
  })

  it('names itself in the engine attribution', () => {
    expect(COMPUTED_BY).toContain(BRAND_NAME)
    expect(COMPUTED_BY).toContain('verify before construction use')
  })

  it('leaves no trace of the old trade names', () => {
    // Two renames' worth: `CivEng` → `CivEngg Toolkit` → `Zeta`. The legal
    // name `CIVENGG WEBSITE APPLICATION SERVICE` is NOT the trade name and is
    // deliberately untouched — it is not among these derived strings, which
    // are everything the product calls itself.
    const stale = /civ ?engg?|toolkit/i
    for (const s of [BRAND_NAME, BRAND_UPPER, BRAND_MARK, BRAND_TAIL, COMPUTED_BY, docLabel('x')]) {
      expect(s).not.toMatch(stale)
    }
  })
})

describe('BRAND_MONOGRAM — the reduced lockup for the collapsed nav rail', () => {
  it('is the capitals of the first word, not its first two letters', () => {
    // `Zeta` carries one capital, so this is the one-cap fallback: the first
    // letter, a legitimate single-letter lockup. The capitals route is still
    // what runs — under the old name `CivEngg` it gave `CE` where the first
    // two letters would have given `CI`, a truncation that abbreviates nothing
    // — and the first two letters here would be `ZE`.
    expect(BRAND_MONOGRAM).toBe('Z')
    expect(BRAND_MONOGRAM).not.toBe(BRAND_MARK.slice(0, 2))
  })

  it('fits the rail: two characters at most, one at least', () => {
    expect(BRAND_MONOGRAM.length).toBeGreaterThanOrEqual(1)
    expect(BRAND_MONOGRAM.length).toBeLessThanOrEqual(2)
  })

  it('belongs to the wordmark it reduces', () => {
    for (const ch of BRAND_MONOGRAM) expect(BRAND_MARK).toContain(ch)
  })
})
