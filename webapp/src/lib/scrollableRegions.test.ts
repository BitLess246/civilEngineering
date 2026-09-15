import { describe, it, expect } from 'vitest'
import { overflows } from './scrollableRegions'

describe('scrollable regions — a tab stop only where there is something to scroll', () => {
  it('is true only when content exceeds the box', () => {
    expect(overflows(900, 400)).toBe(true)
    expect(overflows(400, 400)).toBe(false)
  })

  it('ignores sub-pixel rounding, which would add a useless tab stop', () => {
    // Fractional layout leaves scrollWidth a hair over clientWidth on regions
    // that visibly do not scroll. At 84 regions, treating those as scrollable
    // is dozens of dead tab stops for the users the fix exists for.
    expect(overflows(401, 400)).toBe(false)
    expect(overflows(402, 400)).toBe(true)
  })

  it('a region that stops overflowing stops being a tab stop', () => {
    // The condition is a LAYOUT fact, not a markup fact: the same table
    // overflows at 390px and not at 1440px.
    expect(overflows(900, 390)).toBe(true)
    expect(overflows(900, 1440)).toBe(false)
  })
})
