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
  rampSwatches, rampTicks, formatStress, isMembrane, unitFor, labelFor, STRESS_KEYS,
  bandCenter, bandEdges, rampStops, DEFAULT_BANDS, type StressKey,
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


describe('bands — what makes a contour a contour', () => {
  it('snaps to the band CENTRE, not its lower edge', () => {
    // Edge-snapping draws each band half a step darker than the values it
    // contains, so the legend swatch and the surface disagree everywhere by
    // half a band — which is exactly the error that is hardest to notice and
    // most annoying once seen.
    expect(bandCenter(0.00, 4)).toBeCloseTo(0.125, 12)
    expect(bandCenter(0.24, 4)).toBeCloseTo(0.125, 12)
    expect(bandCenter(0.26, 4)).toBeCloseTo(0.375, 12)
    expect(bandCenter(1.00, 4)).toBeCloseTo(0.875, 12)
  })

  it('puts every value in exactly one band, with no value falling off the top', () => {
    // t = 1 is the classic off-by-one: floor(1 * n) = n, one past the last
    // band, which on a shader reads as a black or wrapped fringe along the
    // single most stressed edge of the model.
    for (const n of [4, 8, 12, 20]) {
      for (let i = 0; i <= 100; i++) {
        const c = bandCenter(i / 100, n)
        expect(c, `t=${i / 100} n=${n}`).toBeGreaterThan(0)
        expect(c).toBeLessThan(1)
        // it is a band centre of THIS n
        expect(Math.abs(c * n - Math.round(c * n - 0.5) - 0.5)).toBeLessThan(1e-9)
      }
    }
  })

  it('passes a value through untouched when banding is off', () => {
    for (const t of [0, 0.37, 1]) expect(bandCenter(t, 0)).toBeCloseTo(t, 12)
    expect(bandCenter(-1, 0)).toBe(0)
    expect(bandCenter(2, 0)).toBe(1)
  })

  it('labels band boundaries as the iso-levels they are', () => {
    const d = stressDomain([-10, 10], true)
    const e = bandEdges(d, 4)
    expect(e).toHaveLength(5)
    expect(e[0]).toBeCloseTo(-10, 9)
    expect(e[2]).toBeCloseTo(0, 9)      // a signed field's middle boundary IS zero
    expect(e[4]).toBeCloseTo(10, 9)
  })

  it('makes the legend show the SAME colours the surface is drawn in', () => {
    // The bar is a key to the picture or it is decoration. With bands on,
    // there is one swatch per band and each is that band's own colour.
    const sw = rampSwatches(24, true, 8)
    expect(sw).toHaveLength(8)
    sw.forEach((c, i) => expect(c).toBe(stressColor(bandCenter((i + 0.5) / 8, 8), true)))
    // Adjacent bands are genuinely different colours — otherwise the boundary
    // the reader is meant to see is not there.
    expect(new Set(sw).size).toBe(8)
  })

  it('still gives a smooth bar when banding is off', () => {
    expect(rampSwatches(24, true, 0)).toHaveLength(24)
  })

  it('hands the shader the same nine stops the legend uses', () => {
    // The shader evaluates the ramp in GLSL from these; if they were a second
    // transcription the surface and the bar would drift apart silently.
    for (const signed of [true, false]) {
      const stops = rampStops(signed)
      expect(stops).toHaveLength(9)
      expect(stressColor(0, signed)).toBe(`rgb(${stops[0].map(Math.round).join(',')})`)
      expect(stressColor(1, signed)).toBe(`rgb(${stops[8].map(Math.round).join(',')})`)
    }
  })

  it('defaults to a band count in the range post-processors actually use', () => {
    expect(DEFAULT_BANDS).toBeGreaterThanOrEqual(8)
    expect(DEFAULT_BANDS).toBeLessThanOrEqual(20)
  })
})


describe('why the colour must be evaluated per fragment, not interpolated', () => {
  it('measures how wrong a straight RGB blend is at the zero crossing', () => {
    // THE DEFECT THIS QUANTIFIES. The first cut handed the GPU a COLOUR per
    // vertex and let `vertexColors` blend it. Across a member's section the two
    // extreme fibres are the two ENDS of the diverging ramp, and the GPU walks
    // a straight line between them in RGB — it does not pass through the
    // ramp's own middle. So the zero crossing, which is the one contour line
    // an engineer looks for, was painted the wrong colour on every side face.
    const lo = rampStops(true)[0], hi = rampStops(true)[8]
    const blend = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2)   // what the GPU drew
    const truth = rampStops(true)[4]                          // what the ramp says
    const dist = Math.hypot(...[0, 1, 2].map((k) => blend[k] - truth[k]))
    // Not a rounding difference: a dark purple where a pale band belongs.
    expect(dist, `RGB distance ${dist.toFixed(0)} of a possible 441`).toBeGreaterThan(250)
    const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    expect(lum(truth)).toBeGreaterThan(200)     // the ramp's centre is pale
    expect(lum(blend)).toBeLessThan(80)         // the blend's centre is dark
  })

  it('is fixed by interpolating the VALUE — 0.5 lands on the ramp centre', () => {
    // With a scalar varying, the midpoint between the two extremes is t = 0.5,
    // and the shader evaluates the ramp there. That IS the pale band.
    const mid = stressColor(0.5, true).match(/\d+/g)!.map(Number)
    const truth = rampStops(true)[4]
    for (let k = 0; k < 3; k++) expect(mid[k]).toBe(Math.round(truth[k]))
  })
})
