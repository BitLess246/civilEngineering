/**
 * The contour scale.
 *
 * Every case here is a way a stress plot can lie to the reader: zero landing
 * somewhere other than the middle of a signed field, a flat field dividing by
 * zero, a colour bar labelled `0` for a field that runs to 0.8, or the 2D and
 * 3D views disagreeing about what colour an element is.
 */
import { describe, it, expect } from 'vitest'
import {
  isSigned, stressDomain, normalise, stressColor, stressColorRGB,
  rampSwatches, rampTicks, formatStress, isMembrane, unitFor, labelFor, STRESS_KEYS, type StressKey,
} from './stressScale'

describe('signedness', () => {
  it('treats von Mises as the only unsigned quantity', () => {
    // It is a norm of the deviatoric stress — it cannot be negative.
    expect(isSigned('vonMises')).toBe(false)
    for (const { key } of STRESS_KEYS) {
      if (key !== 'vonMises') expect(isSigned(key), key).toBe(true)
    }
  })

  it('separates membrane from bending, which is not the same cut as signedness', () => {
    // The legend explains a flat membrane field by the CST/DKT decoupling. Cut
    // on signedness instead and the explanation prints for von Mises only,
    // while σx/σy/τxy/σ₁/σ₂ — which go flat on exactly the same model, for
    // exactly the same reason — say nothing.
    for (const k of ['sigmaX', 'sigmaY', 'tauXY', 'sigma1', 'sigma2', 'vonMises'] as StressKey[]) {
      expect(isMembrane(k), k).toBe(true)
      expect(unitFor(k), k).toBe('kN/m²')
    }
    for (const k of ['Mx', 'My', 'Mxy'] as StressKey[]) {
      expect(isMembrane(k), k).toBe(false)
      expect(unitFor(k), k).toBe('kN·m/m')
    }
    expect(isMembrane('sigmaX')).not.toBe(isSigned('sigmaX') === false)
  })

  it('covers every key the panel offers', () => {
    expect(STRESS_KEYS).toHaveLength(9)
    for (const { key, unit } of STRESS_KEYS) {
      expect(unitFor(key)).toBe(unit)
      expect(labelFor(key).length).toBeGreaterThan(0)
    }
    // Bending moments are per unit width; membrane stresses are not.
    expect(unitFor('Mx')).toBe('kN·m/m')
    expect(unitFor('sigmaX')).toBe('kN/m²')
  })
})

describe('stressDomain', () => {
  it('centres a signed field on zero', () => {
    // The defect this exists for: a slab running −40 → +10 kN·m/m. On a linear
    // min→max scale the sign change sits at 80% of the bar and the hogging
    // region reads as "medium" instead of "the other sign".
    const d = stressDomain([-40, -12, 0, 10], true)
    expect(d.min).toBe(-40)
    expect(d.max).toBe(40)
    expect(normalise(0, d)).toBeCloseTo(0.5, 12)
  })

  it('runs an unsigned field from zero, not from its minimum', () => {
    // Von Mises of 100…180 is not "0% to 100% of stressed" — the floor is 0.
    const d = stressDomain([100, 140, 180], false)
    expect(d.min).toBe(0)
    expect(d.max).toBe(180)
    expect(normalise(100, d)).toBeCloseTo(100 / 180, 12)
  })

  it('flags a flat field, so the legend can say so instead of drawing a scale', () => {
    // A flat shell under transverse pressure has IDENTICALLY ZERO membrane
    // stress — bending and membrane are decoupled — so von Mises really is 0
    // everywhere on an ordinary gravity slab. Drawing a 0.00–1.00 colour bar
    // over that invites the reader to look values up on a scale that means
    // nothing.
    expect(stressDomain([0, 0, 0], false).flat).toBe(true)
    expect(stressDomain([5, 5], true).flat).toBe(true)
    expect(stressDomain([], true).flat).toBe(true)
    expect(stressDomain([-4, 0, 9], true).flat).toBe(false)
    expect(stressDomain([1, 2], false).flat).toBe(false)
  })

  it('survives a flat field and an empty one', () => {
    for (const d of [stressDomain([7, 7, 7], true), stressDomain([], true), stressDomain([0, 0], true)]) {
      expect(d.max).toBeGreaterThan(d.min)
      expect(Number.isFinite(normalise(7, d))).toBe(true)
    }
    const flat = stressDomain([0, 0], false)
    expect(flat.max).toBeGreaterThan(0)
  })

  it('ignores non-finite values rather than poisoning the range', () => {
    const d = stressDomain([1, 2, NaN, Infinity, -3], true)
    expect(d.max).toBe(3)
    expect(Number.isFinite(d.min)).toBe(true)
    expect(normalise(NaN, d)).toBe(0)
  })
})

describe('normalise', () => {
  it('clamps outside the domain instead of running off the ramp', () => {
    const d = stressDomain([-10, 10], true)
    expect(normalise(-999, d)).toBe(0)
    expect(normalise(999, d)).toBe(1)
  })
})

describe('the ramps', () => {
  it('give a diverging field a pale centre and saturated ends', () => {
    // Blue for compression, red for tension, pale at zero — the convention
    // these plots are read with.
    const lo = stressColorRGB(0, true), mid = stressColorRGB(0.5, true), hi = stressColorRGB(1, true)
    expect(lo[2]).toBeGreaterThan(lo[0])        // low end is blue-dominant
    expect(hi[0]).toBeGreaterThan(hi[2])        // high end is red-dominant
    const spread = (c: number[]) => Math.max(...c) - Math.min(...c)
    expect(spread(mid)).toBeLessThan(spread(lo))
    expect(spread(mid)).toBeLessThan(spread(hi))
  })

  it('make the sequential ramp monotonic in lightness', () => {
    // This is what makes viridis readable in greyscale and under red–green
    // colour deficiency, and it is the property the old rainbow lacked: the
    // rainbow returns to mid-lightness at cyan and at yellow, inventing
    // contour bands the data never had.
    const lum = (t: number) => {
      const [r, g, b] = stressColorRGB(t, false)
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    let prev = -Infinity
    for (let i = 0; i <= 40; i++) {
      const l = lum(i / 40)
      expect(l, `t=${(i / 40).toFixed(3)}`).toBeGreaterThan(prev - 1e-9)
      prev = l
    }
    expect(lum(1)).toBeGreaterThan(lum(0) + 0.5)   // and it actually spans
  })

  it('emit parseable rgb() and clamp out-of-range t', () => {
    for (const signed of [true, false]) {
      for (const t of [-1, 0, 0.37, 1, 2]) {
        const m = stressColor(t, signed).match(/^rgb\((\d+),(\d+),(\d+)\)$/)
        expect(m, `t=${t}`).toBeTruthy()
        for (const ch of m!.slice(1)) {
          expect(Number(ch)).toBeGreaterThanOrEqual(0)
          expect(Number(ch)).toBeLessThanOrEqual(255)
        }
      }
    }
  })

  it('agree between the css and the three.js form', () => {
    // The 2D panel takes the string, the 3D layer takes the floats. If these
    // ever diverge the same element is two colours in two views.
    for (const signed of [true, false]) {
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const css = stressColor(t, signed).match(/\d+/g)!.map(Number)
        const rgb = stressColorRGB(t, signed).map((c) => Math.round(c * 255))
        expect(rgb, `t=${t} signed=${signed}`).toEqual(css)
      }
    }
  })
})

describe('legend', () => {
  it('returns swatches low → high', () => {
    const s = rampSwatches(7, false)
    expect(s).toHaveLength(7)
    expect(s[0]).toBe(stressColor(0, false))
    expect(s[6]).toBe(stressColor(1, false))
    expect(rampSwatches(1, false)).toHaveLength(1)
  })

  it('labels the bar at the magnitude of the field, not a fixed precision', () => {
    // A ±0.8 kN·m/m bending field and a ±40 000 kPa membrane field are read
    // off the same bar; `0` and `40000.000` are each wrong for one of them.
    const small = rampTicks(stressDomain([-0.8, 0.8], true))
    expect(small[0]).toBe('-0.800')
    expect(small[small.length - 1]).toBe('0.800')

    const big = rampTicks(stressDomain([-40000, 40000], true))
    expect(big[0]).toBe('-40000')
    expect(big[2]).toBe('0')

    // Ends are the domain ends, and the middle of a signed bar is zero.
    const t = rampTicks(stressDomain([-10, 4], true), 5)
    expect(t).toHaveLength(5)
    expect(Number(t[2])).toBeCloseTo(0, 12)
  })
})

describe('formatStress', () => {
  it('prints a value at the same precision as the bar it is read against', () => {
    // The peak read-out sits under the colour bar. `16.0` beside ticks reading
    // `0.800`, or `16.01` beside ticks reading `40000`, is the same number in
    // two precisions and reads as two different measurements.
    const small = stressDomain([-0.8, 0.8], true)
    expect(formatStress(0.41, small)).toBe('0.410')
    expect(rampTicks(small)[0]).toBe('-0.800')

    const big = stressDomain([-40000, 40000], true)
    expect(formatStress(12345.6, big)).toBe('12346')

    const mid = stressDomain([-12.7, 12.7], true)
    expect(formatStress(16.01, mid)).toBe('16.0')   // the ELEMENT peak, outside the nodal bar
  })

  it('does not print NaN at the reader', () => {
    expect(formatStress(NaN, stressDomain([1, 2], false))).toBe('—')
    expect(formatStress(Infinity, stressDomain([1, 2], false))).toBe('—')
  })
})

describe('keys are exhaustive against the engine', () => {
  it('names every field ElementStress exposes as a contour', () => {
    // If `recoverShellStress` gains a quantity, it should become selectable
    // rather than silently unavailable.
    const fromEngine: StressKey[] = [
      'sigmaX', 'sigmaY', 'tauXY', 'sigma1', 'sigma2', 'vonMises', 'Mx', 'My', 'Mxy',
    ]
    expect(STRESS_KEYS.map((k) => k.key).sort()).toEqual([...fromEngine].sort())
  })
})
