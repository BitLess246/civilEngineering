import { describe, it, expect } from 'vitest'
import { loadCollapsed, saveCollapsed, toggleCollapsed } from './navCollapse'

/** In-memory Storage stand-in; the module only needs get/set. */
function fakeStore(seed?: string) {
  const map = new Map<string, string>()
  if (seed !== undefined) map.set('civeng-nav-collapsed', seed)
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v) },
    read: () => map.get('civeng-nav-collapsed'),
  }
}

/** Storage that throws on every access, like Safari in private mode. */
const hostileStore = {
  getItem() { throw new Error('denied') },
  setItem() { throw new Error('denied') },
}

describe('loading', () => {
  it('reads back what was saved', () => {
    const s = fakeStore()
    saveCollapsed(new Set(['Concrete', 'Geotechnical']), s)
    expect(loadCollapsed(s)).toEqual(new Set(['Concrete', 'Geotechnical']))
  })

  it('nothing stored means nothing collapsed — the full sidebar', () => {
    expect(loadCollapsed(fakeStore())).toEqual(new Set())
  })

  it('survives a corrupt value rather than blanking the nav', () => {
    expect(loadCollapsed(fakeStore('{not json'))).toEqual(new Set())
    expect(loadCollapsed(fakeStore('"a string"'))).toEqual(new Set())
    expect(loadCollapsed(fakeStore('{"Concrete":true}'))).toEqual(new Set())
  })

  it('drops non-string entries', () => {
    // A hand-edited value could otherwise put an object in the set, where
    // `.has(label)` silently never matches and the group behaves at random.
    expect(loadCollapsed(fakeStore('["Concrete",1,null,{"x":1},"Steel"]')))
      .toEqual(new Set(['Concrete', 'Steel']))
  })

  it('does not throw when storage itself is denied', () => {
    expect(loadCollapsed(hostileStore)).toEqual(new Set())
    expect(() => saveCollapsed(new Set(['Concrete']), hostileStore)).not.toThrow()
  })

  it('does not throw when there is no storage at all', () => {
    expect(loadCollapsed(null)).toEqual(new Set())
    expect(() => saveCollapsed(new Set(['Concrete']), null)).not.toThrow()
  })
})

describe('the stored value is the COLLAPSED set, not the open one', () => {
  it('a group nobody has heard of is open', () => {
    // The load-bearing property. When a new group ships, everyone with a stored
    // preference must see it; storing the open set would hide every future
    // group behind a setting no existing user knows to change.
    const collapsed = loadCollapsed(fakeStore('["Concrete"]'))
    expect(collapsed.has('Timber')).toBe(false)
    expect(collapsed.has('Some Group Added In 2027')).toBe(false)
  })

  it('persists as an array of labels', () => {
    const s = fakeStore()
    saveCollapsed(new Set(['Steel']), s)
    expect(JSON.parse(s.read()!)).toEqual(['Steel'])
  })
})

describe('toggling', () => {
  it('collapses an open group and opens a collapsed one', () => {
    expect(toggleCollapsed(new Set(), 'Concrete')).toEqual(new Set(['Concrete']))
    expect(toggleCollapsed(new Set(['Concrete']), 'Concrete')).toEqual(new Set())
  })

  it('leaves the other groups alone', () => {
    expect(toggleCollapsed(new Set(['Steel']), 'Concrete')).toEqual(new Set(['Steel', 'Concrete']))
  })

  it('returns a new set, so React re-renders', () => {
    // Mutating in place would leave the reference equal and the sidebar frozen
    // with a stale open/closed state.
    const before = new Set(['Concrete'])
    expect(toggleCollapsed(before, 'Steel')).not.toBe(before)
    expect(before).toEqual(new Set(['Concrete']))
  })
})

describe('a collapse survives navigation', () => {
  it('nothing in the module re-opens a group on its own', () => {
    // The behavioural decision this module encodes: navigating into a
    // collapsed group does NOT force it open, because that silently undoes a
    // choice the user made and makes them redo it on every visit. The sidebar
    // marks the collapsed group that holds the active route instead.
    //
    // If a `revealGroup` ever comes back, this is the test that should have to
    // be deleted deliberately rather than quietly regressed.
    const stored = fakeStore()
    saveCollapsed(new Set(['Concrete']), stored)
    expect(loadCollapsed(stored).has('Concrete')).toBe(true)
    expect(loadCollapsed(stored).has('Concrete')).toBe(true)
  })
})
