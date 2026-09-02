import { describe, it, expect } from 'vitest'
import {
  emptyHistory, recordHistory, undoHistory, redoHistory, isTypingTarget, HISTORY_LIMIT,
} from './history'

/** Walk a sequence of edits the way the page does: record, then replace. */
const edits = (values: string[]) => {
  let h = emptyHistory<string>()
  let present = values[0]
  for (const v of values.slice(1)) { h = recordHistory(h, present); present = v }
  return { h, present }
}

describe('recordHistory', () => {
  it('remembers what was on screen, not what replaced it', () => {
    // The value passed in is the PRESENT — the thing you would come back to.
    const h = recordHistory(emptyHistory<string>(), 'a')
    expect(h.past).toEqual(['a'])
  })

  it('drops the redo branch, because a new edit makes it unreachable', () => {
    // Undo twice, then edit: the two undone values described a future that
    // followed a different past. Kept, redo would jump to a value that never
    // followed what is on screen.
    const { h, present } = edits(['a', 'b', 'c'])
    const u = undoHistory(h, present)!
    expect(u.history.future).toEqual(['c'])
    expect(recordHistory(u.history, 'x').future).toEqual([])
  })

  it('keeps only the last HISTORY_LIMIT steps, dropping the OLDEST', () => {
    let h = emptyHistory<number>()
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) h = recordHistory(h, i)
    expect(h.past).toHaveLength(HISTORY_LIMIT)
    // the ones kept are the most recent — dropping the newest would make undo
    // jump backwards past edits you can still see
    expect(h.past[h.past.length - 1]).toBe(HISTORY_LIMIT + 9)
    expect(h.past[0]).toBe(10)
  })

  it('takes the limit as an argument, so the test does not depend on the default', () => {
    let h = emptyHistory<number>()
    for (const v of [1, 2, 3, 4]) h = recordHistory(h, v, 2)
    expect(h.past).toEqual([3, 4])
  })
})

describe('undo and redo', () => {
  it('say NO rather than throwing when there is nowhere to go', () => {
    expect(undoHistory(emptyHistory<string>(), 'a')).toBeNull()
    expect(redoHistory(emptyHistory<string>(), 'a')).toBeNull()
  })

  it('steps back through the edits in order', () => {
    const { h, present } = edits(['a', 'b', 'c'])
    const u1 = undoHistory(h, present)!
    expect(u1.value).toBe('b')
    const u2 = undoHistory(u1.history, u1.value)!
    expect(u2.value).toBe('a')
    expect(undoHistory(u2.history, u2.value)).toBeNull()   // back at the start
  })

  it('undo is itself reversible — redo returns exactly what undo left', () => {
    const { h, present } = edits(['a', 'b', 'c'])
    const u = undoHistory(h, present)!
    const r = redoHistory(u.history, u.value)!
    expect(r.value).toBe('c')
    expect(r.history).toEqual(h)      // …and the history is where it started
  })

  it('round-trips a whole sequence, back to the start and forward again', () => {
    const seq = ['a', 'b', 'c', 'd']
    let { h, present } = edits(seq)
    const back: string[] = []
    for (;;) {
      const u = undoHistory(h, present)
      if (!u) break
      back.push(u.value); h = u.history; present = u.value
    }
    expect(back).toEqual(['c', 'b', 'a'])
    const fwd: string[] = []
    for (;;) {
      const r = redoHistory(h, present)
      if (!r) break
      fwd.push(r.value); h = r.history; present = r.value
    }
    expect(fwd).toEqual(['b', 'c', 'd'])
    expect(present).toBe(seq[seq.length - 1])
  })

  it('never mutates the history it was given', () => {
    const { h, present } = edits(['a', 'b'])
    const before = JSON.stringify(h)
    undoHistory(h, present)
    recordHistory(h, present)
    expect(JSON.stringify(h)).toBe(before)
  })

  it('carries null the same as any other value — clearing the model is undoable', () => {
    // `save(null)` empties the page; it is an edit like any other and has to be
    // reachable by undo, so the history must not treat null as "nothing".
    const h = recordHistory(emptyHistory<string | null>(), 'a')
    const u = undoHistory(recordHistory(h, null), null)
    expect(u!.value).toBeNull()
  })
})

describe('isTypingTarget — ⌘Z inside a field belongs to the field', () => {
  it('is true for the controls this page is mostly made of', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(isTypingTarget({ tagName })).toBe(true)
    }
  })

  it('matches however the tag name is cased', () => {
    expect(isTypingTarget({ tagName: 'input' })).toBe(true)
  })

  it('is true for a contenteditable of any tag', () => {
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: false })).toBe(false)
  })

  it('is false for everything else, and for nothing at all', () => {
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false)
    expect(isTypingTarget({ tagName: 'CANVAS' })).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
    expect(isTypingTarget(undefined)).toBe(false)
    expect(isTypingTarget({})).toBe(false)
  })
})
