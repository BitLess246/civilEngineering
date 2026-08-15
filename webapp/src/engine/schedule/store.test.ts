import { describe, it, expect } from 'vitest'
import {
  memoryBackend, createStore, exportProjectJSON, importProjectJSON,
  SCHEDULE_SCHEMA_VERSION, type StorageBackend,
} from './store'
import { sampleProject } from './sample'

describe('createStore over a memory backend', () => {
  it('saves, loads, reports existence and removes', () => {
    const store = createStore(memoryBackend())
    expect(store.exists('p1')).toBe(false)
    expect(store.load('p1')).toBeNull()

    const saved = store.save('p1', sampleProject(), '2026-08-01T00:00:00.000Z')
    expect(saved.ok).toBe(true)
    expect(saved.stored.version).toBe(SCHEDULE_SCHEMA_VERSION)
    expect(store.exists('p1')).toBe(true)
    expect(store.load('p1')!.meta.name).toBe(sampleProject().meta.name)

    store.remove('p1')
    expect(store.exists('p1')).toBe(false)
  })

  it('lists summaries newest-first and ignores foreign / corrupt keys', () => {
    const backend = memoryBackend({
      'unrelated:key': 'x',
      'schedule:project:bad': '{ not json',
    })
    const store = createStore(backend)
    store.save('a', { ...sampleProject(), meta: { ...sampleProject().meta, name: 'A' } }, '2026-08-01T00:00:00.000Z')
    store.save('b', { ...sampleProject(), meta: { ...sampleProject().meta, name: 'B' } }, '2026-08-05T00:00:00.000Z')

    const list = store.list()
    expect(list.map((s) => s.id)).toEqual(['b', 'a'])          // newest first
    expect(list[0].name).toBe('B')
    expect(list[0].activityCount).toBe(sampleProject().activities.length)
  })
})

describe('JSON import / export', () => {
  it('round-trips a project through the versioned wrapper', () => {
    const json = exportProjectJSON(sampleProject(), '2026-08-01T00:00:00.000Z')
    expect(JSON.parse(json).version).toBe(SCHEDULE_SCHEMA_VERSION)
    const back = importProjectJSON(json)
    expect(back.meta.name).toBe(sampleProject().meta.name)
    expect(back.activities).toHaveLength(sampleProject().activities.length)
  })

  it('imports a bare project (no wrapper)', () => {
    const back = importProjectJSON(JSON.stringify(sampleProject()))
    expect(back.activities).toHaveLength(sampleProject().activities.length)
  })

  it('rejects malformed JSON', () => {
    expect(() => importProjectJSON('{ not json')).toThrow(/not valid JSON/i)
  })

  it('rejects an unrecognised shape', () => {
    expect(() => importProjectJSON('{"foo":1}')).toThrow(/unrecognised/i)
  })

  it('rejects a project with integrity errors', () => {
    const p = sampleProject()
    p.activities.push({ ...p.activities[0] })                  // duplicate id
    expect(() => importProjectJSON(exportProjectJSON(p))).toThrow(/integrity/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// CORRUPTION RESISTANCE.
//
// `readStored` used to wrap only `JSON.parse`, so a value that was valid JSON
// but the wrong SHAPE parsed cleanly and then threw a TypeError out of `list()`
// — which dereferences `project.meta.name` OUTSIDE that try. Because
// `useScheduleProject` calls `list()` and `load()` in `useState` initialisers,
// during render, the throw unmounted the whole app on mount, and the user could
// never reach the UI that would have deleted the bad entry. One malformed key
// took out all seven planning routes with no in-app recovery.
//
// Every case below is a real thing that can end up in localStorage: a
// half-written value, a record from a future build, something another tool
// wrote under a colliding key.
// ─────────────────────────────────────────────────────────────────────────
describe('one corrupt entry does not take the listing down', () => {
  const good = JSON.stringify({ version: 1, savedAt: '2026-08-01T00:00:00Z', project: sampleProject() })

  const malformed: [string, string][] = [
    ['an empty project object', JSON.stringify({ version: 1, savedAt: 'x', project: {} })],
    ['a null project', JSON.stringify({ version: 1, savedAt: 'x', project: null })],
    ['a bare array', JSON.stringify([1, 2, 3])],
    ['a string', JSON.stringify('not a project')],
    ['a project missing activities', JSON.stringify({ version: 1, savedAt: 'x', project: { meta: { name: 'x', start: '2026-01-01' }, calendars: [], wbs: [], resources: [], baselines: [], defaultCalendarId: 'c' } })],
    ['unparseable text', '{oh no'],
    ['an empty string', ''],
  ]

  it.each(malformed)('survives %s', (_label, raw) => {
    const store = createStore(memoryBackend({ 'schedule:project:bad': raw }))
    expect(() => store.list()).not.toThrow()
    expect(store.list()).toEqual([])
    expect(() => store.load('bad')).not.toThrow()
    expect(store.load('bad')).toBeNull()
  })

  it('still lists the GOOD projects alongside a corrupt one', () => {
    // The property that matters: a bad entry is skipped, not fatal, and it does
    // not hide the user's other schedules.
    const store = createStore(memoryBackend({
      'schedule:project:ok': good,
      'schedule:project:bad': JSON.stringify({ version: 1, savedAt: 'x', project: {} }),
    }))
    const list = store.list()
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('ok')
    expect(list[0].activityCount).toBeGreaterThan(0)
  })

  it('refuses a record written by a NEWER app rather than half-rendering it', () => {
    // `migrate` now reads `version`, which the module header always claimed it
    // did while the body ignored it.
    const future = JSON.stringify({ version: 99, savedAt: 'x', project: sampleProject() })
    const store = createStore(memoryBackend({ 'schedule:project:future': future }))
    expect(store.list()).toEqual([])
    expect(store.load('future')).toBeNull()
  })

  it('accepts the current schema version', () => {
    const store = createStore(memoryBackend({ 'schedule:project:ok': good }))
    expect(store.load('ok')).not.toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────
// A FULL DISK IS AN ANSWER, NOT AN EXCEPTION.
//
// `save` used to let `QuotaExceededError` escape. The throw travelled out of
// the hook's `persist` into a React event handler, so `setProject(next)` never
// ran: the user's edit disappeared from the screen and nothing said why. They
// retype it, and it disappears again.
// ─────────────────────────────────────────────────────────────────────────
describe('saving when storage is full', () => {
  /** A backend whose writes fail exactly as a browser at its quota does. */
  const fullBackend = (): StorageBackend => {
    const inner = memoryBackend()
    return {
      ...inner,
      setItem() {
        throw Object.assign(new Error('quota exceeded'), { name: 'QuotaExceededError', code: 22 })
      },
    }
  }

  it('reports rather than throwing', () => {
    const store = createStore(fullBackend())
    let threw = false
    let out
    try { out = store.save('p1', sampleProject()) } catch { threw = true }
    expect(threw, 'save must not throw — the caller loses the edit if it does').toBe(false)
    expect(out!.ok).toBe(false)
  })

  it('names the reason, so the UI can say something useful', () => {
    const out = createStore(fullBackend()).save('p1', sampleProject())
    expect(out.ok).toBe(false)
    expect(out.ok === false && out.reason).toBe('quota')
    expect(out.ok === false && out.message).toMatch(/storage is full/i)
  })

  it('hands the project back anyway — it is now the only copy', () => {
    // The caller keeps this in state. Reverting to what happened to fit on disk
    // would destroy the very work the user is being told to export.
    const p = sampleProject()
    const out = createStore(fullBackend()).save('p1', p)
    expect(out.stored.project).toBe(p)
    expect(out.stored.version).toBe(SCHEDULE_SCHEMA_VERSION)
  })

  it('a working backend still reports ok', () => {
    const out = createStore(memoryBackend()).save('p1', sampleProject())
    expect(out.ok).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// THE STAMP IS HOW A TAB NOTICES ANOTHER TAB.
//
// Two tabs on one schedule used to end with whichever typed last winning,
// silently — reproduced in a browser: tab B renamed the project, tab A then
// saved the copy it was still holding, and B's work was gone with nothing on
// screen to say so. `stampOf` is what `useScheduleProject` compares against
// the watermark it holds, and it has to be cheap and honest about absence.
// ─────────────────────────────────────────────────────────────────────────
describe('stampOf', () => {
  it('returns the stamp a save wrote', () => {
    const store = createStore(memoryBackend())
    store.save('p1', sampleProject(), '2026-08-01T00:00:00.000Z')
    expect(store.stampOf('p1')).toBe('2026-08-01T00:00:00.000Z')
  })

  it('moves when the project is written again', () => {
    const store = createStore(memoryBackend())
    store.save('p1', sampleProject(), '2026-08-01T00:00:00.000Z')
    store.save('p1', sampleProject(), '2026-08-02T00:00:00.000Z')
    expect(store.stampOf('p1')).toBe('2026-08-02T00:00:00.000Z')
  })

  it('is null for a project that is not there', () => {
    // The hook treats null as "nothing to conflict with", so a wrong answer
    // here would either block every save or detect nothing.
    expect(createStore(memoryBackend()).stampOf('nope')).toBeNull()
  })

  it('is null for a corrupt entry rather than throwing', () => {
    // It is consulted before EVERY save. A throw here would put us back to a
    // crash on edit, which is what R1 was.
    const backend = memoryBackend({ 'schedule:project:bad': '{"version":1,"savedAt":"x"}' })
    expect(createStore(backend).stampOf('bad')).toBeNull()
  })

  it('stamps sort lexicographically, which is what the comparison relies on', () => {
    // ISO-8601 UTC is fixed-width, so `>` on the strings is `>` on the instants.
    // If the store ever writes a local-time or non-padded stamp, the conflict
    // check silently stops working.
    const store = createStore(memoryBackend())
    store.save('p1', sampleProject())
    const a = store.stampOf('p1')!
    expect(a).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect('2026-08-02T00:00:00.000Z' > '2026-08-01T23:59:59.999Z').toBe(true)
  })
})

describe('keyFor', () => {
  it('names the key a storage event will carry', () => {
    // The cross-tab listener matches `e.key` against this. A mismatch means the
    // listener never fires and the tabs go back to diverging silently.
    const store = createStore(memoryBackend())
    const backend = memoryBackend()
    const s2 = createStore(backend)
    s2.save('p1', sampleProject())
    expect(store.keyFor('p1')).toBe('schedule:project:p1')
    expect(backend.keys()).toContain(store.keyFor('p1'))
  })
})
