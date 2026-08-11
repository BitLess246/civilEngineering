// The dual format's failure mode is not a crash — it is a plausible number on
// the wrong basis. An ASD allowable strength checked against a factored load
// passes things it should not by ~1.5, and the reverse fails things it should
// not. So these tests are about the PAIRING as much as the arithmetic.

import { describe, it, expect } from 'vitest'
import {
  SAFETY, basisFactor, available, requiredFromDL,
  capacityLabel, demandLabel, factorLabel, comboLabel,
  type LimitState, type DesignBasis,
} from './designBasis'

const ALL: LimitState[] = ['flexure', 'shearRolled', 'shearSlender', 'compression', 'connection', 'plateFlexure']

describe('the φ / Ω table matches AISC 360-16', () => {
  it('carries the specification values', () => {
    expect(SAFETY.flexure).toEqual({ phi: 0.90, omega: 1.67 })        // §F1
    expect(SAFETY.shearRolled).toEqual({ phi: 1.00, omega: 1.50 })    // §G2.1(a)
    expect(SAFETY.shearSlender).toEqual({ phi: 0.90, omega: 1.67 })   // §G2.1(b)
    expect(SAFETY.compression).toEqual({ phi: 0.90, omega: 1.67 })    // §E1
    expect(SAFETY.connection).toEqual({ phi: 0.75, omega: 2.00 })     // §J
  })

  it('keeps Ω ≈ 1.5/φ, the calibration between the two formats', () => {
    // Not how the values are produced — they are written out to match the book
    // — but if a future edit breaks this relation it is a typo, not a change.
    for (const ls of ALL) {
      const { phi, omega } = SAFETY[ls]
      expect(omega, ls).toBeCloseTo(1.5 / phi, 2)
    }
  })
})

describe('available strength', () => {
  it('is φRn under LRFD and Rn/Ω under ASD', () => {
    expect(available(100, 'LRFD', 'flexure')).toBeCloseTo(90, 9)
    expect(available(100, 'ASD', 'flexure')).toBeCloseTo(100 / 1.67, 9)
    expect(available(100, 'LRFD', 'connection')).toBeCloseTo(75, 9)
    expect(available(100, 'ASD', 'connection')).toBeCloseTo(50, 9)
  })

  it('is always lower under ASD, for every limit state', () => {
    // The ASD allowable is the more conservative NUMBER; it is compared against
    // a smaller demand. Neither format is "safer" — but if ASD ever came out
    // higher, the pairing has been inverted somewhere.
    for (const ls of ALL) {
      expect(available(100, 'ASD', ls), ls).toBeLessThan(available(100, 'LRFD', ls))
    }
  })

  it('scales linearly, so a doubled nominal doubles the available', () => {
    for (const basis of ['LRFD', 'ASD'] as DesignBasis[]) {
      expect(available(200, basis, 'compression')).toBeCloseTo(2 * available(100, basis, 'compression'), 9)
    }
  })

  it('rolled and slender webs differ on BOTH sides of the format', () => {
    // §G2.1(a) is the one place φ is 1.00, and its Ω is 1.50 rather than 1.67.
    // Using the flexure pair for shear would be wrong in both formats.
    expect(basisFactor('LRFD', 'shearRolled')).toBe(1.0)
    expect(basisFactor('LRFD', 'shearSlender')).toBe(0.9)
    expect(available(100, 'ASD', 'shearRolled')).toBeGreaterThan(available(100, 'ASD', 'shearSlender'))
  })
})

describe('load combinations travel with the basis', () => {
  it('factors under LRFD and sums under ASD', () => {
    expect(requiredFromDL('LRFD', 10, 25)).toBeCloseTo(1.2 * 10 + 1.6 * 25, 9)
    expect(requiredFromDL('ASD', 10, 25)).toBeCloseTo(35, 9)
  })

  it('LRFD takes 1.4D when the live load is small', () => {
    // 1.4D governs below L ≈ 0.125D; the max() is not decoration.
    expect(requiredFromDL('LRFD', 100, 0)).toBeCloseTo(140, 9)
    expect(requiredFromDL('LRFD', 100, 5)).toBeCloseTo(140, 9)
    expect(requiredFromDL('LRFD', 100, 50)).toBeCloseTo(200, 9)
  })

  it('the ASD demand is always the smaller of the two', () => {
    // This is the whole reason the two must not be mixed: an ASD demand against
    // an LRFD capacity is unconservative in exactly this ratio.
    for (const [D, L] of [[10, 25], [100, 0], [40, 40], [0, 60]]) {
      expect(requiredFromDL('ASD', D, L)).toBeLessThanOrEqual(requiredFromDL('LRFD', D, L))
    }
  })
})

describe('the labels say which basis is on the page', () => {
  it('names the capacity and the demand consistently', () => {
    expect(capacityLabel('LRFD', 'M')).toBe('φMn')
    expect(capacityLabel('ASD', 'M')).toBe('Mn/Ω')
    // The axis suffix belongs on the strength, not on the omega.
    expect(capacityLabel('ASD', 'M', 'x')).toBe('Mnx/Ω')
    expect(capacityLabel('LRFD', 'M', 'x')).toBe('φMnx')
    expect(demandLabel('LRFD', 'V')).toBe('Vu')
    expect(demandLabel('ASD', 'V')).toBe('Va')
  })

  it('quotes the factor that was actually applied', () => {
    expect(factorLabel('LRFD', 'connection')).toBe('φ = 0.75')
    expect(factorLabel('ASD', 'connection')).toBe('Ω = 2.00')
    expect(factorLabel('LRFD', 'shearRolled')).toBe('φ = 1.00')
  })

  it('states the combination, not just the format name', () => {
    expect(comboLabel('LRFD')).toContain('1.6L')
    expect(comboLabel('ASD')).toBe('D + L')
  })
})
