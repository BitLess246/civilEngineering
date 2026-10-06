import { describe, expect, it } from 'vitest'
import { initHistory, pushHistory, redoHistory, undoHistory } from './undoHistory'

describe('undo history', () => {
  it('undoes and redoes in order, and a new edit drops the redo branch', () => {
    let h = initHistory('a')
    h = pushHistory(h, 'b')
    h = pushHistory(h, 'c')
    h = undoHistory(h)
    expect(h.present).toBe('b')
    h = undoHistory(h)
    expect(h.present).toBe('a')
    expect(undoHistory(h)).toBe(h)              // nothing left to undo
    h = redoHistory(h)
    expect(h.present).toBe('b')
    h = pushHistory(h, 'd')
    expect(h.future).toEqual([])
    expect(redoHistory(h)).toBe(h)
    expect(h.past).toEqual(['a', 'b'])
  })

  it('ignores re-committing the present and caps the past', () => {
    let h = initHistory(0)
    expect(pushHistory(h, 0)).toBe(h)
    for (let i = 1; i <= 10; i++) h = pushHistory(h, i, 3)
    expect(h.past).toEqual([7, 8, 9])
    expect(h.present).toBe(10)
  })
})
