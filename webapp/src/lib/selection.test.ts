import { describe, it, expect } from 'vitest'
import {
  EMPTY_SELECTION, clickSelect, selectMany, pruneSelection,
  boxMode, normRect, segmentTouchesRect, boxSelect, distToSegment, nearestSegment, type ScreenSegment,
} from './selection'

const ids = (s: { ids: ReadonlySet<string> }) => [...s.ids].sort()

describe('clickSelect — STAAD click grammar', () => {
  it('a plain click selects one and drops the rest', () => {
    const s = selectMany(EMPTY_SELECTION, ['m1', 'm2', 'm3'], false)
    const t = clickSelect(s, 'm7', false)
    expect(ids(t)).toEqual(['m7'])
    expect(t.primary).toBe('m7')
  })

  it('Ctrl+click adds, and makes the new one primary', () => {
    const s = clickSelect(clickSelect(EMPTY_SELECTION, 'm1', false), 'm2', true)
    expect(ids(s)).toEqual(['m1', 'm2'])
    expect(s.primary).toBe('m2')
  })

  it('Ctrl+click on a selected element takes it back out; the primary falls back', () => {
    let s = clickSelect(EMPTY_SELECTION, 'm1', false)
    s = clickSelect(s, 'm2', true)
    s = clickSelect(s, 'm3', true)
    s = clickSelect(s, 'm3', true)                  // remove the primary
    expect(ids(s)).toEqual(['m1', 'm2'])
    expect(s.primary).toBe('m2')
    s = clickSelect(s, 'm1', true)                  // remove a non-primary: primary stays
    expect(s.primary).toBe('m2')
    s = clickSelect(s, 'm2', true)
    expect(s.ids.size).toBe(0)
    expect(s.primary).toBeNull()
  })

  it('does not mutate the selection it was given', () => {
    const s = clickSelect(EMPTY_SELECTION, 'm1', false)
    clickSelect(s, 'm2', true)
    expect(ids(s)).toEqual(['m1'])
  })
})

describe('selectMany / pruneSelection', () => {
  it('replaces, or adds when asked', () => {
    const s = selectMany(EMPTY_SELECTION, ['a', 'b'], false)
    expect(ids(selectMany(s, ['c'], false))).toEqual(['c'])
    expect(ids(selectMany(s, ['c'], true))).toEqual(['a', 'b', 'c'])
    expect(selectMany(s, [], false)).toBe(EMPTY_SELECTION)
  })

  it('prunes ids that no longer exist and keeps the primary when it survives', () => {
    const s = selectMany(EMPTY_SELECTION, ['a', 'b', 'c'], false)   // primary c
    const p = pruneSelection(s, (id) => id !== 'a')
    expect(ids(p)).toEqual(['b', 'c'])
    expect(p.primary).toBe('c')
    expect(pruneSelection(s, () => true)).toBe(s)                   // same object when nothing went
    expect(pruneSelection(s, () => false)).toBe(EMPTY_SELECTION)
  })
})

describe('the box — window and crossing', () => {
  const r = normRect([100, 100], [200, 200])
  const segs: ScreenSegment[] = [
    { id: 'inside', a: [120, 120], b: [180, 180] },
    { id: 'half', a: [150, 150], b: [250, 150] },            // one end in
    { id: 'through', a: [50, 150], b: [250, 150] },          // both ends out, crosses
    { id: 'diagonal', a: [50, 250], b: [250, 50] },          // crosses the corner region
    { id: 'outside', a: [10, 10], b: [90, 90] },
    { id: 'grazing', a: [200, 50], b: [200, 300] },          // runs along the right edge
  ]

  it('drag direction decides the mode', () => {
    expect(boxMode(100, 200)).toBe('window')
    expect(boxMode(200, 100)).toBe('crossing')
    expect(normRect([200, 50], [100, 150])).toEqual({ x0: 100, y0: 50, x1: 200, y1: 150 })
  })

  it('a window takes only what lies wholly inside', () => {
    expect(boxSelect(segs, r, 'window')).toEqual(['inside'])
  })

  it('a crossing takes anything it touches, including a member passing straight through', () => {
    expect(boxSelect(segs, r, 'crossing').sort()).toEqual(['diagonal', 'grazing', 'half', 'inside', 'through'])
  })

  it('a segment beside the box but not touching it is not taken', () => {
    expect(segmentTouchesRect([210, 50], [210, 300], r)).toBe(false)
    expect(segmentTouchesRect([0, 0], [99, 99], r)).toBe(false)
  })
})

describe('nearestSegment — a click in box mode', () => {
  it('perpendicular and end distances', () => {
    expect(distToSegment([5, 3], [0, 0], [10, 0])).toBeCloseTo(3, 12)
    expect(distToSegment([13, 4], [0, 0], [10, 0])).toBeCloseTo(5, 12)    // past the end: to the end point
  })

  it('picks the closest within tolerance, or nothing', () => {
    const segs: ScreenSegment[] = [
      { id: 'a', a: [0, 0], b: [100, 0] },
      { id: 'b', a: [0, 10], b: [100, 10] },
    ]
    expect(nearestSegment(segs, [50, 3])).toBe('a')
    expect(nearestSegment(segs, [50, 8])).toBe('b')
    expect(nearestSegment(segs, [50, 40])).toBeNull()
  })
})
