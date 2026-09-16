// The brand was previously typed out by hand in twelve files across three
// casings, and nothing failed when they disagreed. These tests exist so the
// next rename cannot leave a stale spelling behind in a PDF nobody reopened.

import { describe, it, expect } from 'vitest'
import { BRAND_NAME, BRAND_UPPER, BRAND_MARK, BRAND_TAIL, COMPUTED_BY, docLabel, BRAND_MONOGRAM } from './brand'
import { SITE } from './siteConfig'

describe('brand', () => {
  it('is the trade name — the brand is a business fact, not a UI string', () => {
    expect(BRAND_NAME).toBe(SITE.tradeName)
    expect(BRAND_NAME).toBe('CivEngg Toolkit')
  })

  it('splits into a wordmark that reassembles into the whole name', () => {
    // The invariant that matters: rename the trade name and BOTH halves of the
    // wordmark follow. A test on the literals alone would pass while the mark
    // still read CIVENG.
    expect([BRAND_MARK, BRAND_TAIL].filter(Boolean).join(' ')).toBe(BRAND_UPPER)
    expect(BRAND_MARK).toBe('CIVENGG')
    expect(BRAND_TAIL).toBe('TOOLKIT')
  })

  it('builds document strips in the shared house style', () => {
    expect(docLabel('Structure — Calculation Report'))
      .toBe('CIVENGG TOOLKIT · STRUCTURE — CALCULATION REPORT')
    // Every sheet in the set uses the same separator, so the calc sheets, the
    // structure report and the soils report read as one document.
    expect(docLabel('anything')).toMatch(/^CIVENGG TOOLKIT · /)
  })

  it('names itself in the engine attribution', () => {
    expect(COMPUTED_BY).toContain(BRAND_NAME)
    expect(COMPUTED_BY).toContain('verify before construction use')
  })

  it('leaves no trace of the old spelling', () => {
    // `CivEngg` contains `CivEng` as a prefix, so a naive substring check would
    // pass on the old name too. Match the old name only where it is NOT
    // followed by the second g.
    const stale = /CivEng(?!g)|CIVENG(?!G)/
    for (const s of [BRAND_NAME, BRAND_UPPER, BRAND_MARK, BRAND_TAIL, COMPUTED_BY, docLabel('x')]) {
      expect(s).not.toMatch(stale)
    }
  })
})

describe('BRAND_MONOGRAM — the reduced lockup for the collapsed nav rail', () => {
  it('is the capitals of the first word, not its first two letters', () => {
    // `CivEngg` → `CE`, which reads as civil engineering. The first-two-letters
    // route gives `CI`, a truncation that abbreviates nothing — which is what
    // the rail shipped with in its first cut.
    expect(BRAND_MONOGRAM).toBe('CE')
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
