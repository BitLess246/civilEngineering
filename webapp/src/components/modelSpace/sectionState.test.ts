import { describe, it, expect } from 'vitest'
import { isCollapsed, toggleSection, parseSectionState, type SectionState } from './sectionState'

describe('toggleSection', () => {
  it('folds an open section and unfolds a folded one', () => {
    const a = toggleSection({}, 'grid')
    expect(isCollapsed(a, 'grid')).toBe(true)
    expect(isCollapsed(toggleSection(a, 'grid'), 'grid')).toBe(false)
  })

  it('stores OPEN as absence, so the file does not grow a key per section looked at', () => {
    // Open is the default; writing `false` for every section anyone ever
    // expanded would accumulate a key for each and mean the same thing.
    expect(toggleSection(toggleSection({}, 'grid'), 'grid')).toEqual({})
  })

  it('leaves other sections alone', () => {
    const s = toggleSection(toggleSection({}, 'a'), 'b')
    expect(toggleSection(s, 'a')).toEqual({ b: true })
  })

  it('returns a NEW object every time', () => {
    // `useSyncExternalStore` compares snapshots by identity: mutated in place,
    // the store would change and nothing would re-render.
    const s: SectionState = { a: true }
    const next = toggleSection(s, 'b')
    expect(next).not.toBe(s)
    expect(s).toEqual({ a: true })          // …and the old one is untouched
  })
})

describe('parseSectionState — a bad value opens everything', () => {
  it('reads back what was written', () => {
    const s = toggleSection(toggleSection({}, 'loads'), 'grid')
    expect(parseSectionState(JSON.stringify(s))).toEqual(s)
  })

  it('treats missing, empty and corrupt storage as all-open', () => {
    for (const raw of [null, undefined, '', 'not json', '[1,2]', '"a string"', 'null', '42']) {
      expect(parseSectionState(raw)).toEqual({})
    }
  })

  it('keeps only true, so a hand-edited file cannot smuggle in a truthy value', () => {
    const parsed = parseSectionState('{"a":true,"b":false,"c":1,"d":"yes","e":null}')
    expect(parsed).toEqual({ a: true })
    expect(isCollapsed(parsed, 'c')).toBe(false)
  })
})
