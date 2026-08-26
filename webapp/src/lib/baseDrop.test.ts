import { describe, it, expect } from 'vitest'
import { endDrops } from './baseDrop'

describe('endDrops — only the base of a column meets a pad', () => {
  it('drops the LOWER end, whichever of i/j that is', () => {
    expect(endDrops(0, 3.2, 0.9, 0)).toEqual({ i: 0.9, j: 0 })
    expect(endDrops(3.2, 0, 0, 0.9)).toEqual({ i: 0, j: 0.9 })
  })

  it('leaves the upper end alone even when its node carries a pedestal', () => {
    // Every base node in a stack of columns has a pedestal recorded against it
    // only at the bottom; but a node shared with the storey below can carry one
    // in the map. Applied to the top end it would stretch the column upward.
    expect(endDrops(3.2, 6.4, 0.9, 0.9)).toEqual({ i: 0.9, j: 0 })
  })

  it('reads a column with no pedestal as standing on its own node', () => {
    expect(endDrops(0, 3.2, 0, 0)).toEqual({ i: 0, j: 0 })
  })

  it('never returns a negative drop', () => {
    expect(endDrops(0, 3.2, -0.4, 0)).toEqual({ i: 0, j: 0 })
  })

  it('is deterministic on a degenerate column with both ends level', () => {
    expect(endDrops(3, 3, 0.5, 0.7)).toEqual({ i: 0.5, j: 0 })
  })

  it('is PURE — the same call gives the same answer, however many times', () => {
    // This is the whole point of returning numbers instead of adjusting the
    // caller's vectors. The scene memoises its node positions on the model, so
    // they outlive a render; subtracting the pedestal from one of them in place
    // sank the supports another pedestal deeper on EVERY re-render, which is
    // what "the support nodes keep moving deeper every time I change tabs"
    // was. A value cannot accumulate.
    const args = [0, 3.2, 0.9, 0] as const
    const first = endDrops(...args)
    for (let k = 0; k < 10; k++) expect(endDrops(...args)).toEqual(first)
  })
})
