import { describe, it, expect } from 'vitest'
import {
  clearHeight, spliceWindow, offsetBentBars, OFFSET_MAX_SLOPE,
} from './columnDetail'

// The TYPICAL COLUMN DETAIL these once covered is gone: the sheet is
// `columnStackDetail`, one per column from footing to top, drawn from the
// placed cage. `tiePositions` went with it — it was a second tie layout beside
// `columnCage.tieLevels`, and only the cage's gets built. What is tested here
// is the code geometry that remains.

describe('clear height', () => {
  it('is the storey height less the depth framing in at the top', () => {
    // ℓu is the length that can hinge and the length §418.7.5 is written
    // against. Using the storey height overstates it by the beam depth, which
    // understates ℓo and puts the first tie in the wrong place.
    expect(clearHeight(3.0, 500)).toBeCloseTo(2.5, 9)
    expect(clearHeight(3.0, 0)).toBeCloseTo(3.0, 9)
  })
  it('never goes negative when the beam is deeper than the storey', () => {
    expect(clearHeight(0.4, 500)).toBe(0)
  })
})


describe('splice window — §418.7.4.3', () => {
  it('is the centre half of the clear height', () => {
    expect(spliceWindow(2.5)).toEqual([0.625, 1.875])
    const [a, b] = spliceWindow(2.5)
    expect(b - a).toBeCloseTo(2.5 / 2, 9)   // exactly half, centred
    expect((a + b) / 2).toBeCloseTo(1.25, 9)
  })
})


describe('offset bent bars — §410.7.4', () => {
  it('the offset per face is HALF the change in width', () => {
    // The factor-of-two error that decides whether §410.7.4.5 forces dowels:
    // a 600 column stepping to 500 narrows 100 overall but only 50 per face.
    expect(offsetBentBars(600, 500, 25).offset).toBe(50)
    expect(offsetBentBars(500, 500, 25).offset).toBe(0)
    expect(offsetBentBars(400, 600, 25).offset).toBe(0)   // growing: no crank
  })

  it('the minimum crank length is the offset at 1 in 6 — §410.7.4.1', () => {
    // 50 mm of run needs 300 mm of rise to stay at 1:6.
    expect(offsetBentBars(600, 500, 25).minCrankLength).toBeCloseTo(300, 9)
    expect(OFFSET_MAX_SLOPE).toBeCloseTo(1 / 6, 12)
  })

  it('accepts a crank at exactly 1:6 and rejects anything steeper', () => {
    const ok = offsetBentBars(600, 500, 25, 415, 300)
    expect(ok.slope).toBeCloseTo(1 / 6, 9)
    expect(ok.slopeOK).toBe(true)
    expect(ok.notes.join(' ')).not.toContain('steeper')

    const steep = offsetBentBars(600, 500, 25, 415, 200)   // 1:4
    expect(steep.slopeOK).toBe(false)
    expect(steep.notes.join(' ')).toContain('§410.7.4.1')
    expect(steep.notes.join(' ')).toContain('300')          // the fix, stated
  })

  it('forces dowels once the face offset passes 75 mm — §410.7.4.5', () => {
    // This is the rule most often missed: a big step is not a bend problem,
    // it is a dowel detail. 600→450 is 75 per face — exactly at the limit.
    expect(offsetBentBars(600, 450, 25).dowelsRequired).toBe(false)
    const big = offsetBentBars(600, 440, 25)                // 80 per face
    expect(big.dowelsRequired).toBe(true)
    expect(big.notes.join(' ')).toContain('may NOT be bent')
    expect(big.notes.join(' ')).toContain('§410.7.4.5')
  })

  it('sizes the tie force at 1.5× the horizontal component — §410.7.4.3', () => {
    // Ab·fy is the bar force; the horizontal component is that times the slope.
    const r = offsetBentBars(600, 500, 25, 415, 300)
    const Ab = (Math.PI / 4) * 25 ** 2
    expect(r.tieForce).toBeCloseTo((1.5 * Ab * 415 * (1 / 6)) / 1e3, 6)
    // a flatter crank pulls less sideways
    const flat = offsetBentBars(600, 500, 25, 415, 600)     // 1:12
    expect(flat.tieForce).toBeLessThan(r.tieForce)
  })

  it('says nothing when the column does not change size', () => {
    const same = offsetBentBars(500, 500, 25)
    expect(same.notes).toHaveLength(0)
    expect(same.slopeOK).toBe(true)
    expect(same.dowelsRequired).toBe(false)
  })
})
