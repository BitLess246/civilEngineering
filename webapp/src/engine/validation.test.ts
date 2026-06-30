import { describe, it, expect } from 'vitest'
import { VALIDATION_CASES, pctDiff } from './validation'

describe('validation benchmarks — engine vs hand calculation', () => {
  it('every case agrees with its closed-form within tolerance', () => {
    for (const c of VALIDATION_CASES) {
      const rel = c.manual === 0 ? Math.abs(c.software) : Math.abs(c.software - c.manual) / Math.abs(c.manual)
      expect(rel, `${c.id}: software ${c.software} vs manual ${c.manual}`).toBeLessThanOrEqual(c.tol)
    }
  })

  it('reports a finite, small percent difference for each case', () => {
    for (const c of VALIDATION_CASES) {
      const d = pctDiff(c)
      expect(Number.isFinite(d)).toBe(true)
      expect(d).toBeLessThan(0.01)        // < 0.01 %
    }
  })

  it('covers the main engineering domains', () => {
    const cats = new Set(VALIDATION_CASES.map((c) => c.category))
    for (const c of ['RC', 'Steel', 'Analysis', 'Wind', 'Geotech']) expect(cats.has(c as never)).toBe(true)
  })

  it('the solver-based cases are genuine (non-zero) results', () => {
    const defl = VALIDATION_CASES.find((c) => c.id === 'cantilever-defl')!
    expect(defl.software).toBeGreaterThan(1)        // ~1.15 mm, not a trivial 0
    expect(defl.manual).toBeCloseTo(1.152, 2)
  })
})
