import { describe, expect, it } from 'vitest'
import { websterTiming, websterDelay, losByDelay, type WebsterInput } from './websterSignal'

const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol)

// Hand case — two phases, the textbook setup:
//   q1 = 800, s1 = 3200 → y1 = 0.250   q2 = 400, s2 = 3200 → y2 = 0.125
//   Y = 0.375, L = 2×4 = 8 s
//   C0 = (1.5·8 + 5)/(1 − 0.375) = 17/0.625 = 27.2 s
//   g1 = (0.25/0.375)(27.2 − 8) = 12.8 s · g2 = 6.4 s
const TWO: WebsterInput = {
  phases: [
    { name: 'NS green', q: 800, s: 3200, lost: 4 },
    { name: 'EW green', q: 400, s: 3200, lost: 4 },
  ],
}

describe('websterTiming — optimal cycle and splits', () => {
  const res = websterTiming(TWO)

  it('flow ratios and Y match the hand values', () => {
    near(res.phases[0].y, 0.25)
    near(res.phases[1].y, 0.125)
    near(res.Y, 0.375)
    near(res.L, 8)
  })
  it("Webster's optimal cycle is (1.5L+5)/(1−Y) = 27.2 s", () => {
    near(res.C0, 27.2, 1e-9)
    near(res.C, 27.2, 1e-9)
  })
  it('greens split in proportion to y: 12.8 s and 6.4 s', () => {
    near(res.phases[0].g, 12.8)
    near(res.phases[1].g, 6.4)
    near(res.phases.reduce((s, p) => s + p.g, 0), 27.2 - 8, 1e-9)
  })
  it('saturation degrees X = y·C/g', () => {
    near(res.phases[0].x, (0.25 * 27.2) / 12.8, 1e-9)
    near(res.phases[1].x, (0.125 * 27.2) / 6.4, 1e-9)
    expect(res.phases[0].x).toBeLessThan(1)
  })
  it('both phases sit at LOS A–B territory for this light loading', () => {
    for (const p of res.phases) expect(['A', 'B', 'C']).toContain(p.los)
    expect(['A', 'B', 'C']).toContain(res.los)
  })
})

describe('websterTiming — cycle override and saturation', () => {
  it('honours a user cycle for the splits', () => {
    const res = websterTiming({ ...TWO, cycleOverride: 60 })
    near(res.C, 60)
    near(res.phases[0].g, (0.25 / 0.375) * 52, 1e-9)
    near(res.phases[0].x, (800 / 3600) / ((3200 / 3600) * (res.phases[0].g / 60)), 1e-9)
  })
  it('throws when Σy ≥ 1 — no fixed-time cycle exists', () => {
    expect(() => websterTiming({
      phases: [
        { name: 'a', q: 1800, s: 3600, lost: 4 },
        { name: 'b', q: 1900, s: 3600, lost: 4 },
      ],
    })).toThrow(/oversaturated/)
  })
  it('flags a phase over X = 1 when the forced cycle is too short', () => {
    const res = websterTiming({ ...TWO, cycleOverride: 9 })
    expect(res.phases.some((p) => p.x >= 1)).toBe(true)
    expect(res.los).toBe('F')
  })
})

describe('websterDelay — the three-term formula', () => {
  it('uniform term only when x → 0 is dominated by d1', () => {
    // q tiny relative to green: x ≈ 0.02
    const { d } = websterDelay(100, 3600, 60, 30)
    const lambda = 0.5
    const x = (100 / 3600) / ((3600 / 3600) * lambda)
    const d1 = (60 * (1 - lambda) ** 2) / (2 * (1 - lambda * x))
    expect(d).toBeGreaterThan(d1 * 0.9)
    expect(d).toBeLessThan(d1 + 5)
  })
  it('goes to NaN past saturation (X ≥ 1)', () => {
    const { d } = websterDelay(2000, 2000, 60, 30)
    expect(Number.isNaN(d)).toBe(true)
  })
})

describe('losByDelay — the HCM signalized bands', () => {
  it('walks A through F', () => {
    expect(losByDelay(5)).toBe('A')
    expect(losByDelay(15)).toBe('B')
    expect(losByDelay(30)).toBe('C')
    expect(losByDelay(50)).toBe('D')
    expect(losByDelay(70)).toBe('E')
    expect(losByDelay(90)).toBe('F')
    expect(losByDelay(20, true)).toBe('F')
  })
})
