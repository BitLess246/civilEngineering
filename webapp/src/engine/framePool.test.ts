import { describe, expect, it } from 'vitest'
import { frameWorkerCount, MAX_FRAME_WORKERS } from './framePool'

describe('frameWorkerCount', () => {
  it('never starts more workers than the task batch needs', () => {
    expect(frameWorkerCount(1, 16)).toBe(1)
    expect(frameWorkerCount(3, 16)).toBe(3)
  })

  it('caps workers at the pool limit and leaves one logical CPU available', () => {
    expect(frameWorkerCount(40, 16)).toBe(MAX_FRAME_WORKERS)
    expect(frameWorkerCount(40, 4)).toBe(3)
  })

  it('handles invalid and fractional counts safely', () => {
    expect(frameWorkerCount(0, 8)).toBe(1)
    expect(frameWorkerCount(-4, 8)).toBe(1)
    expect(frameWorkerCount(2.9, 8)).toBe(2)
    expect(frameWorkerCount(Number.NaN, Number.NaN)).toBe(1)
    expect(frameWorkerCount(10, 1)).toBe(1)
  })
})
