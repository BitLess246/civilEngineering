import { describe, it, expect } from 'vitest'
import {
  loadPrefs, savePrefs, hasAnswered, prefsFromChosen, chosenFromPrefs,
  visibleGroups, isHidden, PINNED_GROUPS, CHOOSABLE_GROUPS, ALL_PREFS,
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
    savePrefs(ALL_PREFS, s)
    expect(loadPrefs(s)).toEqual({ chosen: null })
    expect(hasAnswered(loadPrefs(s))).toBe(true)
  })
})

describe('reading and writing', () => {
  it('round-trips a selection', () => {
    const s = fakeStore()
    savePrefs({ chosen: ['Concrete', 'Planning'] }, s)
    expect(loadPrefs(s)).toEqual({ chosen: ['Concrete', 'Planning'] })
  })

  it('round-trips "everything" as null, distinct from a list', () => {
    const s = fakeStore()
    savePrefs(ALL_PREFS, s)
    expect(JSON.parse(s.read()!)).toEqual({ chosen: null })
    expect(loadPrefs(s)?.chosen).toBeNull()
  })

  it('treats corrupt values as unanswered rather than throwing', () => {
    expect(loadPrefs(fakeStore('{not json'))).toBeNull()
    expect(loadPrefs(fakeStore('null'))).toBeNull()
    expect(loadPrefs(fakeStore('"a string"'))).toBeNull()
    expect(loadPrefs(fakeStore('{"chosen":"Concrete"}'))).toBeNull()
    expect(loadPrefs(fakeStore('{}'))).toBeNull()
  })

  it('a value from the earlier hidden-set format reads as unanswered', () => {
    // The shape changed before this shipped, so no real browser holds one — but
    // reading it as "answered, nothing chosen" would blank somebody's nav, and
    // re-asking is the harmless direction.
    expect(loadPrefs(fakeStore('{"hidden":["Concrete"]}'))).toBeNull()
  })

  it('drops non-string entries from the chosen list', () => {
    expect(loadPrefs(fakeStore('{"chosen":["Concrete",7,null,{"a":1}]}')))
      .toEqual({ chosen: ['Concrete'] })
  })

  it('survives storage being denied or absent', () => {
    expect(loadPrefs(hostileStore)).toBeNull()
    expect(loadPrefs(null)).toBeNull()
    expect(() => savePrefs({ chosen: ['Concrete'] }, hostileStore)).not.toThrow()
    expect(() => savePrefs({ chosen: ['Concrete'] }, null)).not.toThrow()
    expect(() => savePrefs(ALL_PREFS, null)).not.toThrow()
  })
})

describe('rule 1 — it stores what is CHOSEN, so a later group stays hidden', () => {
  it('a group that did not exist when they answered is NOT shown', () => {
    // The product decision. Somebody who said "I do concrete" should not find a
    // masonry section in their sidebar next month because we shipped one: the
    // selection is a standing instruction, not a snapshot of that day.
    const stored = prefsFromChosen(['Concrete'], ['Concrete', 'Steel'])
    const later = groupsOf(['Concrete', 'Steel', 'Masonry'])
    expect(visibleGroups(later, stored).map((g) => g.label)).toEqual(['Concrete'])
  })

  it('persists the chosen list, not the hidden one', () => {
    const s = fakeStore()
    savePrefs(prefsFromChosen(['Concrete'], ['Concrete', 'Steel', 'Timber']), s)
    expect(JSON.parse(s.read()!)).toEqual({ chosen: ['Concrete'] })
  })

  it('"everything" DOES pick up a later group, because it stores null', () => {
    // The other half of the rule, and the reason `chosen` is nullable. Ticking
    // every box means "all of it", not "these two" — freezing it into a list
    // would make "show me everything" a lie the day a third group ships.
    const stored = prefsFromChosen(['Concrete', 'Steel'], ['Concrete', 'Steel'])
    expect(stored.chosen).toBeNull()
    const later = groupsOf(['Concrete', 'Steel', 'Masonry'])
    expect(visibleGroups(later, stored).map((g) => g.label)).toEqual(['Concrete', 'Steel', 'Masonry'])
  })

  it('a later group is still discoverable, just not pushed', () => {
    // The cost of rule 1, and where it is paid back: the new group is not in
    // the nav, but the palette tags it rather than dropping it, and the profile
    // shows it as an unticked box. Silence in the nav is not silence overall.
    const stored = prefsFromChosen(['Concrete'], ['Concrete', 'Steel'])
    expect(isHidden('Masonry', stored)).toBe(true)
    expect(chosenFromPrefs(stored, ['Concrete', 'Steel', 'Masonry']).has('Masonry')).toBe(false)
  })
})

describe('rule 2 — hiding is not removing', () => {
  it('says a group is hidden without the caller losing its tools', () => {
    // `isHidden` is what the palette uses to TAG a result, not to drop it.
    // Every tool stays reachable by URL and by search.
    const p = { chosen: ALL.filter((l) => l !== 'Geotechnical') }
    expect(isHidden('Geotechnical', p)).toBe(true)
    const geo = SIDEBAR_GROUPS.find((g) => g.label === 'Geotechnical')!
    expect(geo.tools.length).toBeGreaterThan(0)
  })

  it('nothing here reports on routes', () => {
    // Guard against a future "helpful" addition that filters the router. A
    // hidden tool whose bookmark 404s is a bug, not a preference.
    const p = { chosen: ALL.filter((l) => l !== 'Geotechnical') }
    expect(isHidden('Concrete', p)).toBe(false)
    expect(isHidden('Geotechnical', null)).toBe(false)
    expect(isHidden('Geotechnical', ALL_PREFS)).toBe(false)
  })
})

describe('rule 3 — an empty app is never a valid state', () => {
  it('choosing nothing is ignored', () => {
    const p = prefsFromChosen([], ALL)
    expect(visibleGroups(SIDEBAR_GROUPS, p)).toEqual(SIDEBAR_GROUPS)
  })

  it('and the palette agrees, rather than tagging a full sidebar as hidden', () => {
    // If `isHidden` honoured a preference `visibleGroups` ignores, every result
    // would be tagged "hidden" while the sidebar showed all of them.
    const p = prefsFromChosen([], ALL)
    expect(isHidden('Concrete', p)).toBe(false)
  })

  it('choosing only pinned groups is also ignored', () => {
    // Leaving only Reference is an app with docs and a pricing page and no
    // calculators — and no way back, because the setting lives behind a nav
    // that now renders nothing useful.
    const p = { chosen: [...PINNED_GROUPS] }
    expect(visibleGroups(SIDEBAR_GROUPS, p)).toEqual(SIDEBAR_GROUPS)
  })

  it('keeps a preference that leaves at least one real group', () => {
    const p = { chosen: ['Concrete'] }
    const kept = visibleGroups(SIDEBAR_GROUPS, p).map((g) => g.label)
    expect(kept).toContain('Concrete')
    expect(kept).toContain('Reference')
    expect(kept).not.toContain('Geotechnical')
  })
})

describe('rule 4 — pinned groups cannot be hidden', () => {
  it('is never written into the chosen list, so it cannot be dropped from it', () => {
    expect(prefsFromChosen(['Concrete'], ALL).chosen).not.toContain('Reference')
  })

  it('survives a hand-edited stored value that omits it', () => {
    const p = { chosen: ['Geotechnical'] }
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

  it('everything ticked comes back everything ticked', () => {
    const back = chosenFromPrefs(prefsFromChosen(new Set(ALL), ALL), ALL)
    expect(back).toEqual(new Set(ALL))
  })

  it('a pinned group comes back ticked even if it was not sent', () => {
    const back = chosenFromPrefs(prefsFromChosen(['Concrete'], ALL), ALL)
    expect(back.has('Reference')).toBe(true)
    expect(back.has('Concrete')).toBe(true)
    expect(back.has('Geotechnical')).toBe(false)
  })
})

describe('against the real catalog', () => {
  it('every group is either offerable or pinned — none falls through', () => {
    // A group in neither list would be permanently visible and impossible to
    // turn off, with nothing on screen explaining why. Since both lists are
    // derived from SIDEBAR_GROUPS this holds by construction today; the test is
    // here so that a future hand-written exception has to face it.
    const covered = new Set([...CHOOSABLE_GROUPS, ...PINNED_GROUPS])
    expect([...ALL].filter((l) => !covered.has(l))).toEqual([])
  })

  it('offers everything except the pinned groups', () => {
    expect([...CHOOSABLE_GROUPS]).toEqual(ALL.filter((l) => !PINNED_GROUPS.includes(l)))
    expect(CHOOSABLE_GROUPS.length).toBeGreaterThan(0)
  })

  it('every pinned label is actually a group', () => {
    // A typo here would silently pin nothing, and Reference would become
    // hideable without any test noticing.
    for (const label of PINNED_GROUPS) expect(ALL).toContain(label)
  })

  it('leaves the tools inside a kept group untouched', () => {
    const p = { chosen: ALL.filter((l) => l !== 'Geotechnical') }
    const concrete = visibleGroups(SIDEBAR_GROUPS, p).find((g) => g.label === 'Concrete')!
    expect(concrete.tools).toEqual(SIDEBAR_GROUPS.find((g) => g.label === 'Concrete')!.tools)
  })
})
