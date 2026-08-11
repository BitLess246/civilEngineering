import { describe, it, expect } from 'vitest'
import {
  accessFor, canRun, recordRun, isGated, isPublic, isTrialRoute,
  loadUsage, saveUsage, GUEST_TRIAL_LIMIT, GUEST_TRIAL_ROUTES, GATED_PREFIXES,
} from './trialQuota'

const APP_SRC = import.meta.glob('../App.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const ROUTES = [...Object.values(APP_SRC)[0].matchAll(/<Route\s+path="([^"]+)"/g)]
  .map((m) => m[1]).filter((p) => p !== '*')

/** Minimal in-memory stand-in for localStorage. */
const memStore = (initial: Record<string, string> = {}) => {
  const m = new Map(Object.entries(initial))
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v) },
    dump: () => Object.fromEntries(m),
  }
}

describe('the lists match the router', () => {
  // The first draft of these lists was written from memory and 15 of 27 trial
  // routes did not exist. This is the guard that makes that impossible to ship.
  it('found the routes to check against', () => {
    expect(ROUTES.length).toBeGreaterThan(40)
    expect(ROUTES).toContain('/model')
  })

  it('every trial route is one the router actually serves', () => {
    const served = new Set(ROUTES)
    const missing = GUEST_TRIAL_ROUTES.filter((r) => !served.has(r))
    expect(missing, `trial routes with no page: ${missing.join(', ')}`).toEqual([])
  })

  it('every gated prefix matches at least one served route', () => {
    for (const p of GATED_PREFIXES) {
      const hit = ROUTES.some((r) => r === p || r.startsWith(`${p}/`))
      expect(hit, `${p} gates nothing`).toBe(true)
    }
  })

  it('classifies EVERY served route — nothing is left to the default by accident', () => {
    // An unclassified route falls through to members-only, which is safe but
    // probably not intended; this forces the choice to be explicit.
    const unclassified = ROUTES.filter(
      (r) => !isPublic(r) && !isGated(r) && !isTrialRoute(r))
    expect(unclassified, `unclassified routes: ${unclassified.join(', ')}`).toEqual([])
  })
})

describe('route classification', () => {
  it('treats documentation and marketing pages as public', () => {
    for (const r of ['/', '/docs', '/validation', '/pricing', '/signin', '/signup']) {
      expect(isPublic(r), r).toBe(true)
      expect(accessFor(r, false).kind).toBe('public')
    }
  })

  it('gates the heavy stateful features, including their sub-routes', () => {
    for (const r of ['/model', '/model/anything', '/schedule/gantt', '/estimate/beam']) {
      expect(isGated(r), r).toBe(true)
    }
    // a prefix must match a path SEGMENT, not merely a string prefix
    expect(isGated('/modelling-notes')).toBe(false)
    expect(isGated('/reportage')).toBe(false)
  })

  it('normalises query strings, hashes and trailing slashes', () => {
    expect(isPublic('/docs?q=beam')).toBe(true)
    expect(isPublic('/docs#model-space')).toBe(true)
    expect(isTrialRoute('/beam-design/')).toBe(true)
    expect(isGated('/model/')).toBe(true)
  })

  it('has no route in two lists at once', () => {
    for (const r of GUEST_TRIAL_ROUTES) {
      expect(isPublic(r), `${r} is both public and a trial route`).toBe(false)
      expect(isGated(r), `${r} is both gated and a trial route`).toBe(false)
    }
    for (const p of GATED_PREFIXES) expect(isPublic(p), `${p} is both public and gated`).toBe(false)
  })
})

describe('accessFor', () => {
  it('gives a signed-in member everything', () => {
    for (const r of ['/beam-design', '/model', '/schedule/gantt', '/docs', '/not-a-route']) {
      expect(accessFor(r, true).kind, r).toBe(r === '/docs' ? 'public' : 'member')
    }
  })

  it('lets a guest try a single-purpose calculator', () => {
    const v = accessFor('/beam-design', false)
    expect(v).toEqual({ kind: 'trial', used: 0, remaining: GUEST_TRIAL_LIMIT })
    expect(canRun(v)).toBe(true)
  })

  it('counts down and then stops the guest', () => {
    let usage: Record<string, number> = {}
    for (let k = 1; k <= GUEST_TRIAL_LIMIT; k++) {
      const before = accessFor('/beam-design', false, usage)
      expect(canRun(before), `run ${k} should be allowed`).toBe(true)
      usage = recordRun('/beam-design', usage)
    }
    const after = accessFor('/beam-design', false, usage)
    expect(after).toEqual({ kind: 'trial-exhausted', used: GUEST_TRIAL_LIMIT })
    expect(canRun(after)).toBe(false)
  })

  it('counts each tool separately', () => {
    let usage: Record<string, number> = {}
    for (let k = 0; k < GUEST_TRIAL_LIMIT; k++) usage = recordRun('/beam-design', usage)
    expect(canRun(accessFor('/beam-design', false, usage))).toBe(false)
    expect(canRun(accessFor('/column-design', false, usage))).toBe(true)
  })

  it('never lets a guest into a gated feature, however many trials remain', () => {
    expect(accessFor('/model', false).kind).toBe('members-only')
    expect(canRun(accessFor('/model', false))).toBe(false)
    // and signing in opens it
    expect(canRun(accessFor('/model', true))).toBe(true)
  })

  it('defaults an unknown route to members-only, not to free', () => {
    // the safe direction: adding a page must not accidentally make it public
    const v = accessFor('/some-new-tool', false)
    expect(v.kind).toBe('members-only')
    expect(canRun(v)).toBe(false)
  })

  it('keeps documentation public even for an exhausted guest', () => {
    let usage: Record<string, number> = {}
    for (let k = 0; k < GUEST_TRIAL_LIMIT * 3; k++) usage = recordRun('/beam-design', usage)
    expect(accessFor('/docs', false, usage).kind).toBe('public')
    expect(canRun(accessFor('/docs', false, usage))).toBe(true)
  })
})

describe('recordRun', () => {
  it('does not count runs on public or gated routes', () => {
    expect(recordRun('/docs', {})).toEqual({})
    expect(recordRun('/model', {})).toEqual({})
  })

  it('is immutable — it never mutates the map it is given', () => {
    const before = { '/beam-design': 2 }
    const after = recordRun('/beam-design', before)
    expect(before).toEqual({ '/beam-design': 2 })
    expect(after).toEqual({ '/beam-design': 3 })
  })

  it('repairs a corrupt count rather than propagating it', () => {
    expect(recordRun('/beam-design', { '/beam-design': -4 })['/beam-design']).toBe(1)
    expect(recordRun('/beam-design', { '/beam-design': 2.7 })['/beam-design']).toBe(3)
  })
})

describe('persistence', () => {
  it('round-trips a usage map', () => {
    const s = memStore()
    saveUsage({ '/beam-design': 3, '/column-design': 1 }, s)
    expect(loadUsage(s)).toEqual({ '/beam-design': 3, '/column-design': 1 })
  })

  it('survives corrupt, hostile or missing storage', () => {
    expect(loadUsage(memStore())).toEqual({})
    expect(loadUsage(memStore({ 'ce.guestTrials.v1': 'not json' }))).toEqual({})
    expect(loadUsage(memStore({ 'ce.guestTrials.v1': '[1,2,3]' }))).toEqual({})
    expect(loadUsage(memStore({ 'ce.guestTrials.v1': 'null' }))).toEqual({})
    // non-numeric and negative entries are dropped, valid ones kept
    expect(loadUsage(memStore({ 'ce.guestTrials.v1': '{"/beam-design":"x","/column-design":2,"/stair":-1}' })))
      .toEqual({ '/column-design': 2 })
  })

  it('never throws when storage is blocked', () => {
    const throwing = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    }
    expect(() => loadUsage(throwing)).not.toThrow()
    expect(loadUsage(throwing)).toEqual({})
    expect(() => saveUsage({ '/beam-design': 1 }, throwing)).not.toThrow()
  })

  it('a cleared store simply restores the allowance — it is a prompt, not a lock', () => {
    // Stated explicitly because it is the security property people assume:
    // the counter is defeatable by design, and the real gate is the session.
    const s = memStore()
    saveUsage({ '/beam-design': GUEST_TRIAL_LIMIT }, s)
    expect(canRun(accessFor('/beam-design', false, loadUsage(s)))).toBe(false)
    saveUsage({}, s)
    expect(canRun(accessFor('/beam-design', false, loadUsage(s)))).toBe(true)
    // whereas a gated route stays shut no matter what the store says
    expect(canRun(accessFor('/model', false, loadUsage(s)))).toBe(false)
  })
})

describe('routes that only redirect', () => {
  // A page folded into another leaves its route behind as a stub so old links
  // and bookmarks still land somewhere. Two things can go wrong, and both are
  // silent: the stub falls through to members-only and a guest hits a wall
  // instead of the replacement, or it keeps its trial entry and the visit is
  // billed twice — once at the stub, once at the page it redirects to.
  const APP = Object.values(APP_SRC)[0]

  /** Routes whose element is a bare <Navigate>, read from the router itself. */
  const redirects = [...APP.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<Navigate\s+to="([^"]+)"/g)]
    .map((m) => ({ from: m[1], to: m[2] }))

  it('keeps the routes of pages that were split or removed', () => {
    // /steel was one page with three tabs and is now four pages; /geotech was
    // an index of tools the sidebar already lists. Both are linked from the
    // docs, so both still land somewhere useful.
    const from = redirects.map((r) => r.from)
    expect(from).toContain('/steel')
    expect(from).toContain('/geotech')
    expect(redirects.find((r) => r.from === '/steel')?.to).toBe('/steel/beam')
  })

  it('lets a guest through the stub without spending a run', () => {
    for (const { from } of redirects) {
      expect(isPublic(from), `${from} should be public`).toBe(true)
      expect(isTrialRoute(from), `${from} must not hold its own allowance`).toBe(false)
      expect(accessFor(from, false).kind, from).toBe('public')
    }
  })

  it('charges the run at the destination instead', () => {
    for (const { to } of redirects) {
      const classified = isTrialRoute(to) || isGated(to) || isPublic(to)
      expect(classified, `${to} is unclassified`).toBe(true)
    }
    // The one that matters: the four steel pages each hold their own
    // allowance — five free runs, then locked, like every other calculator.
    for (const r of ['/steel/beam', '/steel/column', '/bolted-connection', '/welded-connection']) {
      expect(isTrialRoute(r), r).toBe(true)
      expect(accessFor(r, false, { [r]: GUEST_TRIAL_LIMIT - 1 }).kind, r).toBe('trial')
      expect(accessFor(r, false, { [r]: GUEST_TRIAL_LIMIT }).kind, r).toBe('trial-exhausted')
    }
  })
})
