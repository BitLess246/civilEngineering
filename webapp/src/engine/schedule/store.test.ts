import { describe, it, expect } from 'vitest'
import {
  memoryBackend, createStore, exportProjectJSON, importProjectJSON,
  SCHEDULE_SCHEMA_VERSION,
} from './store'
import { sampleProject } from './sample'

describe('createStore over a memory backend', () => {
  it('saves, loads, reports existence and removes', () => {
    const store = createStore(memoryBackend())
    expect(store.exists('p1')).toBe(false)
    expect(store.load('p1')).toBeNull()

    const stored = store.save('p1', sampleProject(), '2026-08-01T00:00:00.000Z')
    expect(stored.version).toBe(SCHEDULE_SCHEMA_VERSION)
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
