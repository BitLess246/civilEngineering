import { describe, it, expect } from 'vitest'
import { checkCoverage, coverageSuffix, fullyChecked } from './checkCoverage'

describe('checkCoverage — a verdict must not speak for checks that never ran', () => {
  const ran = (r: number) => ({ ratio: r })
  const skipped = { ratio: null }

  it('counts what produced a number, not what was listed', () => {
    expect(checkCoverage([ran(0.4), ran(0.9), ran(0.2)])).toEqual({ run: 3, total: 3 })
    expect(checkCoverage([ran(0.4), ran(0.9), ran(0.2), skipped])).toEqual({ run: 3, total: 4 })
    expect(checkCoverage([skipped, skipped])).toEqual({ run: 0, total: 2 })
    expect(checkCoverage([])).toEqual({ run: 0, total: 0 })
  })

  it('stays silent when every check ran — a count there would be noise', () => {
    expect(coverageSuffix([ran(0.4), ran(0.9)])).toBe('')
    expect(coverageSuffix([])).toBe('')
  })

  it('qualifies the headline the moment one check did not run', () => {
    expect(coverageSuffix([ran(0.4), ran(0.9), ran(0.2), skipped])).toBe(' (3 of 4 checks)')
    expect(coverageSuffix([skipped])).toBe(' (0 of 1 checks)')
  })

  it('a FAILING check still counts as run — not-checked is a third state', () => {
    // The distinction this module exists for: 1.60 is a check that ran and
    // failed, which the verdict already reports. `null` is a check nobody
    // performed, which it previously did not.
    expect(coverageSuffix([ran(1.6), ran(0.4)])).toBe('')
    expect(fullyChecked([ran(1.6), ran(0.4)])).toBe(true)
    expect(fullyChecked([ran(1.6), skipped])).toBe(false)
  })

  it('null must never be compared as a number — `null <= 1` is TRUE in JS', () => {
    // This is the exact shape of the shipped defect: `ok: c.ratio <= 1.0001`
    // marked an unevaluated check PASS, because JS coerces null to 0. The
    // guard is `c.ratio !== null && …`, and this test pins why it is needed
    // rather than trusting a reader to remember the coercion rule.
    const naive = (r: number | null) => (r as number) <= 1.0001
    expect(naive(null)).toBe(true)              // the trap, demonstrated
    const guarded = (r: number | null) => r !== null && r <= 1.0001
    expect(guarded(null)).toBe(false)           // the fix
    expect(guarded(0.4)).toBe(true)
    expect(guarded(1.6)).toBe(false)
  })
})
