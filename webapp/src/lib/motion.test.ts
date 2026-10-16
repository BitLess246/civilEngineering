import { describe, it, expect, vi, afterEach } from 'vitest'
import { easeOutExpo, formatLike, motionOK, parseNumeric, tween } from './motion'

describe('the count-up only touches a string that is a number', () => {
  it('reads plain, grouped, signed and percent figures', () => {
    expect(parseNumeric('0.95')).toEqual({ value: 0.95, decimals: 2, group: false, suffix: '', minus: '-' })
    expect(parseNumeric('1,250')).toMatchObject({ value: 1250, decimals: 0, group: true })
    expect(parseNumeric('−12.5')).toMatchObject({ value: -12.5, minus: '−' })
    expect(parseNumeric('95.0%')).toMatchObject({ value: 95, decimals: 1, suffix: '%' })
    expect(parseNumeric(' 440 ')).toMatchObject({ value: 440 })
  })

  it('leaves anything else alone — a bar mark, a dash, a ratio, a unit', () => {
    for (const s of ['4-⌀20', '—', '', '2-leg @220', '1/2', '440 mm', '1,25', '.5', 'NaN']) expect(parseNumeric(s)).toBeNull()
  })

  it('writes a value back exactly as the original was written', () => {
    for (const s of ['0.95', '1,250', '1,234,567.89', '−12.5', '-3', '95.0%', '0', '12']) {
      const spec = parseNumeric(s)!
      expect(formatLike(spec.value, spec)).toBe(s)
    }
    const spec = parseNumeric('1,250.0')!
    expect(formatLike(987.66, spec)).toBe('987.7')
    expect(formatLike(-0.001, parseNumeric('0.00')!)).toBe('0.00')     // never "-0.00"
  })
})

describe('the curve', () => {
  it('runs 0 → 1, monotonic, and lands exactly', () => {
    expect(easeOutExpo(0)).toBe(0)
    expect(easeOutExpo(1)).toBe(1)
    expect(easeOutExpo(2)).toBe(1)
    let prev = 0
    for (let t = 0.05; t < 1; t += 0.05) { const v = easeOutExpo(t); expect(v).toBeGreaterThan(prev); prev = v }
    expect(easeOutExpo(0.5)).toBeGreaterThan(0.95)                       // most of the way at half time
    expect(tween(10, 20, 1)).toBe(20)
    expect(tween(10, 20, 0)).toBe(10)
  })
})

describe('reduced motion', () => {
  afterEach(() => { vi.unstubAllGlobals() })
  it('is off without matchMedia, off when reduce is asked for, on otherwise', () => {
    vi.stubGlobal('window', {})
    expect(motionOK()).toBe(false)                                       // no matchMedia: tests, SSR
    vi.stubGlobal('window', { matchMedia: (q: string) => ({ matches: q.includes('reduce') }) })
    expect(motionOK()).toBe(false)
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    expect(motionOK()).toBe(true)
  })
})
