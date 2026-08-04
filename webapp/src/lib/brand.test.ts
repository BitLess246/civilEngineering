// The brand was previously typed out by hand in twelve files across three
// casings, and nothing failed when they disagreed. These tests exist so the
// next rename cannot leave a stale spelling behind in a PDF nobody reopened.

import { describe, it, expect } from 'vitest'
import { BRAND_NAME, BRAND_UPPER, BRAND_MARK, BRAND_TAIL, COMPUTED_BY, docLabel } from './brand'
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
