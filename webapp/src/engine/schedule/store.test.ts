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
