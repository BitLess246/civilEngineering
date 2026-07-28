import { describe, it, expect } from 'vitest'
import { dashSpans } from './dashPattern'

describe('dashPattern — dashSpans', () => {
  it('degenerate members draw nothing', () => {
    expect(dashSpans(0).t).toEqual([])
    expect(dashSpans(1e-9).dash).toBe(0)
  })

  it('always uses an odd cell count so both ends carry a dash', () => {
    for (const len of [0.05, 0.3, 1, 3.5, 12]) {
      const p = dashSpans(len)
      expect(p.cells % 2).toBe(1)
      // first dash starts at the i-end, last one ends at the j-end
      expect(p.t[0] * len - p.dash / 2).toBeLessThan(len * 0.02)
      expect(p.t[p.t.length - 1] * len + p.dash / 2).toBeGreaterThan(len * 0.98)
    }
  })

  it('is symmetric about mid-span', () => {
    const p = dashSpans(3.5)
    for (let i = 0; i < p.t.length; i++) {
      expect(p.t[i] + p.t[p.t.length - 1 - i]).toBeCloseTo(1, 12)
    }
  })

  it('honours the fill fraction — drawn length is fill·(cells+1)/2 cells', () => {
    const len = 4, fill = 0.75
    const p = dashSpans(len, { fill })
    const drawn = p.t.length * p.dash
    const cellLen = len / p.cells
    expect(p.dash).toBeCloseTo(fill * cellLen, 12)
    expect(drawn).toBeLessThan(len)                       // gaps really exist
    expect(drawn / len).toBeCloseTo((fill * p.t.length) / p.cells, 12)
  })

  it('short members still read as dashed (minCells floor)', () => {
    const p = dashSpans(0.1, { pitch: 0.2, minCells: 6 })
    expect(p.cells).toBeGreaterThanOrEqual(7)             // 6 floored, then made odd
    expect(p.t.length).toBeGreaterThanOrEqual(4)
  })

  it('long members track the requested pitch', () => {
    const p = dashSpans(10, { pitch: 0.25 })
    expect(p.cells).toBeGreaterThanOrEqual(39)            // ≈ 10/0.25 = 40 → 41 (odd)
    expect(p.cells).toBeLessThanOrEqual(41)
    expect(10 / p.cells).toBeCloseTo(0.25, 1)
  })

  it('every dash lies inside the member', () => {
    const len = 6
    const p = dashSpans(len)
    for (const t of p.t) {
      expect(t * len - p.dash / 2).toBeGreaterThanOrEqual(-1e-12)
      expect(t * len + p.dash / 2).toBeLessThanOrEqual(len + 1e-12)
    }
  })
})
