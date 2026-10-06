import { describe, it, expect } from 'vitest'
import { niceStep, tickLabel, axesMap } from './chartScale'

describe('chart scale', () => {
  it('picks a 1-2-2.5-5 step giving about n intervals', () => {
    expect(niceStep(100, 4)).toBe(25)
    expect(niceStep(90, 4)).toBe(25)
    expect(niceStep(1.5, 4)).toBeCloseTo(0.5)
    expect(niceStep(20.86, 4)).toBe(10)
    expect(niceStep(0)).toBe(1)
  })
  it('labels ticks with only the decimals the step needs', () => {
    expect(tickLabel(25, 25)).toBe('25')
    expect(tickLabel(0.5, 0.5)).toBe('0.5')
    expect(tickLabel(0.25, 0.25)).toBe('0.25')
  })
  it('maps the box corners', () => {
    const { X, Y } = axesMap({ x0: 10, x1: 110, top: 20, base: 220 }, 50, 4)
    expect(X(0)).toBe(10); expect(X(50)).toBe(110)
    expect(Y(0)).toBe(220); expect(Y(4)).toBe(20)
  })
})
