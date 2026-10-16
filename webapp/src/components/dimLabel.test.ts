import { describe, expect, it } from 'vitest'
import { sideLabelLevel, sideLabelReach } from './dimLabel'

describe('side dimension labels', () => {
  it('rotate along a span long enough to hold them', () => {
    expect(sideLabelLevel(0, 120, 'h = 600 mm')).toBe(false)
    expect(sideLabelReach(0, 120, 'h = 600 mm')).toBe(17)
  })
  it('lie level beside a span too short for them — a flange, a slab', () => {
    expect(sideLabelLevel(0, 23, 'hf = 100')).toBe(true)
    expect(sideLabelLevel(30, 0, 'hf = 100')).toBe(true)            // either direction
  })
  it('reach further when level, by the length of the text', () => {
    const short = sideLabelReach(0, 20, 'd 50'), long = sideLabelReach(0, 20, 'Dc = 425 mm')
    expect(long).toBeGreaterThan(short)
    expect(long).toBeGreaterThan(17)
  })
})
