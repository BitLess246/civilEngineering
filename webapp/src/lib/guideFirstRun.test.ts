/**
 * When the walkthrough opens by itself.
 *
 * Four ways it must not fire, and each is a real path through the page rather
 * than a hypothetical — so each gets its own case. The rule is a pure function
 * of facts precisely so these can be asserted without a browser, a router or a
 * mounted page.
 */
import { describe, it, expect } from 'vitest'
import {
  shouldAutoStartGuide, hasSeenGuide, markGuideSeen, GUIDE_SEEN_KEY,
} from './guideFirstRun'

const ok = { seen: false, embed: false, explicit: false, ready: true }

/** A localStorage stand-in, plus the two ways a real one misbehaves. */
const memStore = () => {
  const m: Record<string, string> = {}
  return {
    raw: m,
    getItem: (k: string) => m[k] ?? null,
    setItem: (k: string, v: string) => { m[k] = v },
  }
}
const throwingStore = {
  getItem: () => { throw new Error('site data blocked') },
  setItem: () => { throw new Error('site data blocked') },
}

describe('shouldAutoStartGuide', () => {
  it('fires on a first visit, which is the whole point', () => {
    expect(shouldAutoStartGuide(ok)).toBe(true)
  })

  it('never fires twice', () => {
    expect(shouldAutoStartGuide({ ...ok, seen: true })).toBe(false)
  })

  it('never fires in the embed preview', () => {
    // `?embed=1` locks pointer events across the page and bootstraps its own
    // demo frame. An overlay on top of a poster is a bug.
    expect(shouldAutoStartGuide({ ...ok, embed: true })).toBe(false)
  })

  it('never fires alongside ?tour=1, which starts it already', () => {
    // Not merely redundant: the tour's start hook GENERATES A DEMO MODEL, so
    // running it twice is not harmless.
    expect(shouldAutoStartGuide({ ...ok, explicit: true })).toBe(false)
  })

  it('waits until the page is ready', () => {
    expect(shouldAutoStartGuide({ ...ok, ready: false })).toBe(false)
  })

  it('needs every condition, so no single one can force it', () => {
    // Guards against the rule being rewritten as an OR by accident.
    const keys = ['seen', 'embed', 'explicit'] as const
    for (const k of keys) {
      expect(shouldAutoStartGuide({ ...ok, [k]: true }), k).toBe(false)
    }
    expect(shouldAutoStartGuide({ seen: true, embed: true, explicit: true, ready: true })).toBe(false)
  })
})

describe('the seen flag', () => {
  it('round-trips', () => {
    const s = memStore()
    expect(hasSeenGuide('model', s)).toBe(false)
    markGuideSeen('model', s)
    expect(hasSeenGuide('model', s)).toBe(true)
  })

  it('is per tour, so one page does not suppress another', () => {
    const s = memStore()
    markGuideSeen('model', s)
    expect(hasSeenGuide('schedule', s)).toBe(false)
  })

  it('MERGES rather than replacing, which a naive write would not', () => {
    // Writing `{ [name]: true }` flat would clear every other page's flag the
    // first time a second guide ran — a bug that only shows up on the third
    // visit to the first page, which is the kind nobody finds by clicking.
    const s = memStore()
    markGuideSeen('model', s)
    markGuideSeen('schedule', s)
    expect(hasSeenGuide('model', s)).toBe(true)
    expect(hasSeenGuide('schedule', s)).toBe(true)
  })

  it('OVERWRITES a corrupt value rather than refusing to write', () => {
    // A BUG THIS SHIPPED WITH FOR ONE COMMIT, found by measurement and not by
    // reading. With the parse in the same `try` as the write, `JSON.parse`
    // threw on a corrupt value and took `setItem` with it — so the flag could
    // never be repaired and the guide would reopen on every visit forever.
    // Seeded with `{oops` in Chromium, the value was still `{oops` after the
    // guide had run.
    for (const bad of ['{oops', 'null', '[]', '"model"', '7', 'undefined']) {
      const s = memStore()
      s.raw[GUIDE_SEEN_KEY] = bad
      markGuideSeen('model', s)
      expect(hasSeenGuide('model', s), `did not recover from ${bad}`).toBe(true)
      expect(s.raw[GUIDE_SEEN_KEY], bad).toBe('{"model":true}')
    }
  })

  it('reads a corrupt or hand-edited value as NOT seen', () => {
    // The safe direction: showing the guide to someone who has seen it costs
    // them one dismissal; hiding it from someone who has not costs them the
    // only explanation the page has.
    for (const bad of ['', 'null', '[]', '"model"', '{', '7']) {
      const s = memStore()
      s.raw[GUIDE_SEEN_KEY] = bad
      expect(hasSeenGuide('model', s), bad).toBe(false)
    }
  })

  it('keeps only `true`, so a truthy value cannot be smuggled in', () => {
    const s = memStore()
    s.raw[GUIDE_SEEN_KEY] = JSON.stringify({ model: 1, schedule: 'yes' })
    expect(hasSeenGuide('model', s)).toBe(false)
    expect(hasSeenGuide('schedule', s)).toBe(false)
  })

  it('survives storage that throws, in both directions', () => {
    // A browser set to block site data throws on the property access itself.
    expect(hasSeenGuide('model', throwingStore)).toBe(false)
    expect(() => markGuideSeen('model', throwingStore)).not.toThrow()
  })

  it('survives no storage at all', () => {
    expect(hasSeenGuide('model', null)).toBe(false)
    expect(() => markGuideSeen('model', null)).not.toThrow()
  })
})
