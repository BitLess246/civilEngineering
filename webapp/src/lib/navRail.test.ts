/**
 * The rail preference.
 *
 * Small, but it decides what the whole left edge of the app looks like on
 * every load, so the failure modes are worth pinning: a corrupt value must not
 * strand someone in a nav they cannot read, and a storage throw (private mode,
 * blocked site data) must not take the navigation down with it.
 */
import { describe, it, expect } from 'vitest'
import { loadRailCollapsed, saveRailCollapsed, RAIL_W, FULL_W } from './navRail'

const mem = (initial: Record<string, string> = {}) => {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v) },
    map,
  }
}

describe('loadRailCollapsed', () => {
  it('defaults to EXPANDED when nothing is stored', () => {
    // The safe direction: the rail is the denser expert view, and someone who
    // has never asked for it should get the sidebar that names its tools.
    expect(loadRailCollapsed(mem())).toBe(false)
  })

  it('reads a stored collapse', () => {
    expect(loadRailCollapsed(mem({ 'civeng-nav-rail': '1' }))).toBe(true)
    expect(loadRailCollapsed(mem({ 'civeng-nav-rail': '0' }))).toBe(false)
  })

  it('treats anything unrecognised as expanded, not as collapsed', () => {
    for (const v of ['true', 'yes', '{}', '', '11', 'null']) {
      expect(loadRailCollapsed(mem({ 'civeng-nav-rail': v })), v).toBe(false)
    }
  })

  it('survives storage being unavailable entirely', () => {
    expect(loadRailCollapsed(null)).toBe(false)
    const throwing = { getItem() { throw new Error('blocked') }, setItem() {} }
    expect(loadRailCollapsed(throwing)).toBe(false)
  })
})

describe('saveRailCollapsed', () => {
  it('round-trips both ways', () => {
    const s = mem()
    saveRailCollapsed(true, s)
    expect(loadRailCollapsed(s)).toBe(true)
    saveRailCollapsed(false, s)
    expect(loadRailCollapsed(s)).toBe(false)
  })

  it('never throws when storage refuses', () => {
    const throwing = { getItem: () => null, setItem() { throw new Error('quota') } }
    expect(() => saveRailCollapsed(true, throwing)).not.toThrow()
    expect(() => saveRailCollapsed(true, null)).not.toThrow()
  })
})

describe('widths', () => {
  it('keeps the rail wide enough for the pointer target this app holds to', () => {
    // 44 px targets plus a gutter either side. Narrower looks tidier in a mock
    // and makes every group a cramped target in use.
    expect(RAIL_W).toBeGreaterThanOrEqual(44 + 2 * 6)
    expect(RAIL_W).toBeLessThan(FULL_W / 2)
  })
})
