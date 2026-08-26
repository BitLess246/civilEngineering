import { describe, it, expect } from 'vitest'
import {
  loadPrefs, savePrefs, hasAnswered, prefsFromChosen, chosenFromPrefs,
  visibleGroups, isHidden, PINNED_GROUPS, NO_PREFS,
} from './toolPrefs'
import { SIDEBAR_GROUPS } from './tools'

function fakeStore(seed?: string) {
  const map = new Map<string, string>()
  if (seed !== undefined) map.set('civeng-tool-prefs', seed)
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v) },
    read: () => map.get('civeng-tool-prefs'),
  }
}

const hostileStore = {
  getItem() { throw new Error('denied') },
  setItem() { throw new Error('denied') },
}

const ALL = SIDEBAR_GROUPS.map((g) => g.label)
const groupsOf = (labels: readonly string[]) => labels.map((label) => ({ label }))

describe('"never asked" is not the same as "asked, wants everything"', () => {
  it('an empty store reads as null, not as empty prefs', () => {
    // The distinction the whole first-run flow rests on. Collapsing these two
    // would re-open the dialog on every visit for anyone who chose to keep the
    // full catalog.
    expect(loadPrefs(fakeStore())).toBeNull()
    expect(hasAnswered(loadPrefs(fakeStore()))).toBe(false)
  })

  it('choosing everything still counts as answered', () => {
    const s = fakeStore()
    savePrefs(NO_PREFS, s)
    expect(loadPrefs(s)).toEqual({ hidden: [] })
    expect(hasAnswered(loadPrefs(s))).toBe(true)
  })
})

describe('reading and writing', () => {
  it('round-trips', () => {
    const s = fakeStore()
    savePrefs({ hidden: ['Concrete', 'Planning'] }, s)
    expect(loadPrefs(s)).toEqual({ hidden: ['Concrete', 'Planning'] })
  })

  it('treats corrupt values as unanswered rather than throwing', () => {
    expect(loadPrefs(fakeStore('{not json'))).toBeNull()
    expect(loadPrefs(fakeStore('null'))).toBeNull()
    expect(loadPrefs(fakeStore('"a string"'))).toBeNull()
    expect(loadPrefs(fakeStore('{"hidden":"Concrete"}'))).toBeNull()
    expect(loadPrefs(fakeStore('{}'))).toBeNull()
  })

  it('drops non-string entries from the hidden list', () => {
    expect(loadPrefs(fakeStore('{"hidden":["Concrete",7,null,{"a":1}]}')))
      .toEqual({ hidden: ['Concrete'] })
  })

  it('survives storage being denied or absent', () => {
    expect(loadPrefs(hostileStore)).toBeNull()
    expect(loadPrefs(null)).toBeNull()
    expect(() => savePrefs({ hidden: ['Concrete'] }, hostileStore)).not.toThrow()
    expect(() => savePrefs({ hidden: ['Concrete'] }, null)).not.toThrow()
  })
})

describe('rule 1 — it stores what is HIDDEN, so new groups appear', () => {
  it('a group that did not exist when they answered is shown', () => {
    // The launch-day property. If this inverted, shipping a new module would
    // make it invisible to every existing user, and nothing would report it.
    const stored = prefsFromChosen(['Concrete'], ['Concrete', 'Steel'])
    const later = groupsOf(['Concrete', 'Steel', 'Masonry'])
    expect(visibleGroups(later, stored).map((g) => g.label)).toEqual(['Concrete', 'Masonry'])
  })

  it('persists the hidden list, not the chosen one', () => {
    const s = fakeStore()
    savePrefs(prefsFromChosen(['Concrete'], ['Concrete', 'Steel', 'Timber']), s)
    expect(JSON.parse(s.read()!)).toEqual({ hidden: ['Steel', 'Timber'] })
  })
})

describe('rule 2 — hiding is not removing', () => {
  it('says a group is hidden without the caller losing its tools', () => {
    // `isHidden` is what the palette uses to TAG a result, not to drop it.
    // Every tool stays reachable by URL and by search.
    const p = { hidden: ['Geotechnical'] }
    expect(isHidden('Geotechnical', p)).toBe(true)
    const geo = SIDEBAR_GROUPS.find((g) => g.label === 'Geotechnical')!
    expect(geo.tools.length).toBeGreaterThan(0)
  })

  it('nothing here reports on routes', () => {
    // Guard against a future "helpful" addition that filters the router. A
    // hidden tool whose bookmark 404s is a bug, not a preference.
    const p = { hidden: ['Geotechnical'] }
    expect(isHidden('Concrete', p)).toBe(false)
    expect(isHidden('Geotechnical', null)).toBe(false)
  })
})

describe('rule 3 — an empty app is never a valid state', () => {
  it('hiding every group is ignored', () => {
    const p = prefsFromChosen([], ALL)
    expect(visibleGroups(SIDEBAR_GROUPS, p)).toEqual(SIDEBAR_GROUPS)
  })

  it('hiding everything except pinned groups is also ignored', () => {
    // Leaving only Reference is an app with docs and a pricing page and no
    // calculators — and no way back, because the setting lives behind a nav
    // that now renders nothing useful.
    const p = { hidden: ALL.filter((l) => !PINNED_GROUPS.includes(l)) }
    expect(visibleGroups(SIDEBAR_GROUPS, p)).toEqual(SIDEBAR_GROUPS)
  })

  it('keeps a preference that leaves at least one real group', () => {
    const p = { hidden: ALL.filter((l) => l !== 'Concrete' && !PINNED_GROUPS.includes(l)) }
    const kept = visibleGroups(SIDEBAR_GROUPS, p).map((g) => g.label)
    expect(kept).toContain('Concrete')
    expect(kept).toContain('Reference')
    expect(kept).not.toContain('Geotechnical')
  })
})

describe('rule 4 — pinned groups cannot be hidden', () => {
  it('survives being unticked', () => {
    expect(prefsFromChosen(['Concrete'], ALL).hidden).not.toContain('Reference')
  })

  it('survives being hidden by a hand-edited stored value', () => {
    const p = { hidden: ['Reference', 'Geotechnical'] }
    expect(visibleGroups(SIDEBAR_GROUPS, p).map((g) => g.label)).toContain('Reference')
    expect(isHidden('Reference', p)).toBe(false)
  })
})

describe('the checkbox state round-trips', () => {
  it('unanswered ticks everything', () => {
    expect(chosenFromPrefs(null, ALL)).toEqual(new Set(ALL))
  })

  it('chosen -> stored -> chosen is stable', () => {
    const chosen = new Set(['Concrete', 'Steel', 'Reference'])
    const back = chosenFromPrefs(prefsFromChosen(chosen, ALL), ALL)
    expect(back).toEqual(chosen)
  })

  it('a pinned group comes back ticked even if it was not sent', () => {
    const back = chosenFromPrefs(prefsFromChosen(['Concrete'], ALL), ALL)
    expect(back.has('Reference')).toBe(true)
    expect(back.has('Concrete')).toBe(true)
    expect(back.has('Geotechnical')).toBe(false)
  })
})

describe('against the real catalog', () => {
  it('every pinned label is actually a group', () => {
    // A typo here would silently pin nothing, and Reference would become
    // hideable without any test noticing.
    for (const label of PINNED_GROUPS) expect(ALL).toContain(label)
  })

  it('leaves the tools inside a kept group untouched', () => {
    const p = { hidden: ['Geotechnical'] }
    const concrete = visibleGroups(SIDEBAR_GROUPS, p).find((g) => g.label === 'Concrete')!
    expect(concrete.tools).toEqual(SIDEBAR_GROUPS.find((g) => g.label === 'Concrete')!.tools)
  })
})
