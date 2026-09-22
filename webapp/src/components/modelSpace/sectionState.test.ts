import { describe, it, expect } from 'vitest'
import {
  isCollapsed, toggleSection, parseSectionState, SECTIONS_KEY,
  toggleSectionInStore, subscribeSections, resetSectionsForTest, type SectionState,
} from './sectionState'

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

describe('the store actually writes', () => {
  // THE GAP THAT LET A DEAD FEATURE SHIP. Everything above tests the pure
  // functions, which were never broken; the store around them called a
  // `storage()` helper that a later commit deleted, so `toggleSectionInStore`
  // threw a ReferenceError into its own `catch` and saved nothing. The page
  // looked identical — folds still worked within a visit — and the only thing
  // that would have caught it is asking whether the fold SURVIVES.
  it('persists what it was given, so a fold outlives the visit', () => {
    const store: Record<string, string> = {}
    const ls = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v },
      removeItem: (k: string) => { delete store[k] },
      clear: () => { for (const k of Object.keys(store)) delete store[k] },
      key: () => null, length: 0,
    } as unknown as Storage
    const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true })
    try {
      resetSectionsForTest()
      toggleSectionInStore('loads')
      expect(store[SECTIONS_KEY], 'nothing reached storage').toBeTruthy()
      // Round-trip through the parser, which is what the next visit does.
      expect(isCollapsed(parseSectionState(store[SECTIONS_KEY]), 'loads')).toBe(true)
      toggleSectionInStore('loads')
      expect(isCollapsed(parseSectionState(store[SECTIONS_KEY]), 'loads')).toBe(false)
    } finally {
      if (had) Object.defineProperty(globalThis, 'localStorage', had)
      else delete (globalThis as { localStorage?: unknown }).localStorage
      resetSectionsForTest()
    }
  })

  it('notifies its subscribers, which is what re-renders the panel', () => {
    let hits = 0
    const off = subscribeSections(() => { hits++ })
    try {
      toggleSectionInStore('geom')
      expect(hits).toBe(1)
    } finally { off(); resetSectionsForTest() }
  })
})
