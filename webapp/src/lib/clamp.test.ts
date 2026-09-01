// No DOM testing library in this repo (see ErrorBoundary.test.tsx), so the
// clamp's LOGIC is pinned here and the wiring is asserted against the source.
// That the clamped field really refuses an out-of-range entry was verified by
// driving the app in a browser — see the PR.
import { describe, it, expect } from 'vitest'
import { clampTo } from './clamp'
import modelSpaceSrc from '../pages/ModelSpace.tsx?raw'

describe('clampTo', () => {
  it('bounds on both sides', () => {
    expect(clampTo(40, 0.1, 5)).toBe(5)
    expect(clampTo(-3, 0.1, 5)).toBe(0.1)
    expect(clampTo(1.5, 0.1, 5)).toBe(1.5)
  })
  it('takes one bound alone', () => {
    expect(clampTo(-2, 0)).toBe(0)
    expect(clampTo(99, undefined, 10)).toBe(10)
  })
  it('passes an empty field straight through — NaN means "empty", not "zero"', () => {
    expect(clampTo(NaN, 0.1, 5)).toBeNaN()
  })
  it('does nothing at all when neither bound is given — every existing input', () => {
    for (const v of [-1e9, 0, 0.5, 1e9]) expect(clampTo(v)).toBe(v)
  })
})

describe('the assumed-ρ inputs are bounded', () => {
  it('both pushover and nonlinear ρ carry min/max', () => {
    // ρ is a modelling choice with no upstream check; unbounded it reached
    // `plasticMoment` at any value. Solved-Mp makes a large ρ merely wrong for
    // the frame rather than nonsense, but the field should still not take 400%.
    const hits = modelSpaceSrc.match(/Concrete ρ \(tension\)[\s\S]{0,240}?min=\{0\.1\} max=\{5\}/g) ?? []
    expect(hits.length).toBe(2)
  })
})
