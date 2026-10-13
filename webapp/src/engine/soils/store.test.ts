import { describe, it, expect } from 'vitest'
import {
  createStore, memoryBackend, exportJSON, importJSON, SOILS_SCHEMA_VERSION, trySave, defaultBackend,
  type StorageBackend,
} from './store'
import { sampleInvestigation } from './sample'
import { emptyInvestigation } from './model'

describe('soils store', () => {
  it('round-trips an investigation unchanged', () => {
    const store = createStore(memoryBackend())
    const inv = sampleInvestigation()
    store.save('a', inv)
    expect(store.load('a')).toEqual(inv)
  })

  it('lists investigations newest first, with counts', () => {
    const store = createStore(memoryBackend())
    store.save('a', sampleInvestigation(), '2026-01-01T00:00:00Z')
    store.save('b', emptyInvestigation('Later'), '2026-06-01T00:00:00Z')

    const list = store.list()
    expect(list.map((s) => s.id)).toEqual(['b', 'a'])

    const a = list.find((s) => s.id === 'a')!
    expect(a.boreholeCount).toBe(2)
    expect(a.sampleCount).toBe(4)
    expect(a.investigationNo).toBe('SI-2026-014')
    expect(a.status).toBe('laboratory')
  })

  it('reports a missing investigation as null rather than throwing', () => {
    const store = createStore(memoryBackend())
    expect(store.load('nope')).toBeNull()
    expect(store.exists('nope')).toBe(false)
  })

  it('removes an investigation', () => {
    const store = createStore(memoryBackend())
    store.save('a', sampleInvestigation())
    store.remove('a')
    expect(store.load('a')).toBeNull()
    expect(store.list()).toEqual([])
  })

  it('survives a corrupt entry instead of taking the whole listing down', () => {
    // One bad key must not make every other investigation unreachable.
    const backend = memoryBackend({
      'soils:investigation:bad': '{ not json',
      'soils:investigation:half': '{"version":1,"savedAt":"x","investigation":{"meta":{}}}',
    })
    const store = createStore(backend)
    store.save('good', sampleInvestigation())

    expect(store.list().map((s) => s.id)).toEqual(['good'])
    expect(store.load('bad')).toBeNull()
    expect(store.load('half')).toBeNull()
  })

  it('ignores keys that belong to other modules', () => {
    const backend = memoryBackend({ 'schedule:project:x': '{}', 'unrelated': 'y' })
    const store = createStore(backend)
    store.save('a', sampleInvestigation())
    expect(store.list()).toHaveLength(1)
  })
})

describe('import / export', () => {
  it('exports a versioned wrapper that imports back identically', () => {
    const inv = sampleInvestigation()
    const json = exportJSON(inv)
    expect(JSON.parse(json).version).toBe(SOILS_SCHEMA_VERSION)
    expect(importJSON(json)).toEqual(inv)
  })

  it('accepts a bare investigation as well as the wrapper', () => {
    const inv = sampleInvestigation()
    expect(importJSON(JSON.stringify(inv))).toEqual(inv)
  })

  it('refuses malformed JSON and unrecognised shapes', () => {
    expect(() => importJSON('{ not json')).toThrow(/not valid JSON/)
    expect(() => importJSON('{"hello":1}')).toThrow(/unrecognised/)
    expect(() => importJSON('null')).toThrow(/unrecognised/)
  })

  it('refuses an import carrying an integrity ERROR', () => {
    // A half-successful import is worse than one that refused: the user would
    // not know which parts of their data survived.
    const inv = sampleInvestigation()
    inv.boreholes[0].layers[1].depthBottom = 5.0   // overlaps the layer below
    expect(() => importJSON(exportJSON(inv))).toThrow(/integrity error/)
  })

  it('allows an import that only carries WARNINGS', () => {
    const inv = sampleInvestigation()
    inv.boreholes[0].layers[1].depthBottom = 4.0   // a gap — advisory only
    expect(() => importJSON(exportJSON(inv))).not.toThrow()
  })
})

describe('save failures are reported, never thrown (GEN-08)', () => {
  const quotaFull = (): StorageBackend => {
    const b = memoryBackend()
    return { ...b, setItem: () => { throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' }) } }
  }

  it('a full quota comes back as a failed outcome with a recovery hint', () => {
    const out = trySave(createStore(quotaFull()), 'si_1', sampleInvestigation())
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toMatch(/storage is full.*Export/)
  })

  it('any other storage error is reported with its message', () => {
    const b = { ...memoryBackend(), setItem: () => { throw new Error('disk on fire') } }
    const out = trySave(createStore(b), 'si_1', sampleInvestigation())
    expect(out).toEqual({ ok: false, error: expect.stringContaining('disk on fire') })
  })

  it('a successful save reports when it landed, and the copy is readable', () => {
    const store = createStore(memoryBackend())
    const inv = sampleInvestigation()
    const out = trySave(store, 'si_1', inv)
    expect(out.ok).toBe(true)
    expect(store.load('si_1')).toEqual(inv)
  })

  it('blocked site storage falls back to memory and says it is not persistent', () => {
    const g = globalThis as { localStorage?: unknown }
    const had = Object.getOwnPropertyDescriptor(g, 'localStorage')
    Object.defineProperty(g, 'localStorage', { configurable: true, get: () => { throw new Error('SecurityError') } })
    try {
      expect(defaultBackend().persistent).toBe(false)
    } finally {
      if (had) Object.defineProperty(g, 'localStorage', had)
      else delete g.localStorage
    }
  })
})
