import { describe, it, expect } from 'vitest'
import {
  memoryRemote, memoryMarks, syncInvestigations, ConflictError, summaryOf, contentHash,
  type RemoteStore,
} from './remoteStore'
import { createStore, memoryBackend, type SoilsStore } from './store'
import { emptyInvestigation } from './model'
import type { Investigation } from './model'

const inv = (no: string, title = 'X'): Investigation => {
  const i = emptyInvestigation(title)
  i.meta.investigationNo = no
  return i
}

function setup() {
  const local: SoilsStore = createStore(memoryBackend())
  const remote: RemoteStore = memoryRemote()
  const marks = memoryMarks()
  return { local, remote, marks }
}

describe('optimistic concurrency', () => {
  it('accepts a save that carries the version it read', async () => {
    const r = memoryRemote()
    const a = await r.save('i1', inv('SI-1'))
    const b = await r.save('i1', inv('SI-1 edited'), a.updatedAt)
    expect(b.updatedAt).not.toBe(a.updatedAt)
    expect((await r.load('i1'))!.investigation.meta.investigationNo).toBe('SI-1 edited')
  })

  it('REFUSES a save against a stale version, and hands back both', async () => {
    const r = memoryRemote()
    const first = await r.save('i1', inv('SI-1'))
    await r.save('i1', inv('SI-1 from device B'), first.updatedAt)   // someone else moved it

    await expect(r.save('i1', inv('SI-1 from device A'), first.updatedAt))
      .rejects.toBeInstanceOf(ConflictError)

    try {
      await r.save('i1', inv('SI-1 from device A'), first.updatedAt)
    } catch (e) {
      const c = e as ConflictError
      expect(c.remote.investigation.meta.investigationNo).toBe('SI-1 from device B')
      expect(c.expectedUpdatedAt).toBe(first.updatedAt)
      expect(c.message).toMatch(/would discard that version/)
    }
  })

  it('gives distinct versions to saves in the same millisecond', async () => {
    // A Date.now() stamp would collide here and optimistic concurrency would
    // silently stop working — a stale write would look current.
    const r = memoryRemote()
    const a = await r.save('a', inv('A'))
    const b = await r.save('b', inv('B'))
    expect(a.updatedAt).not.toBe(b.updatedAt)
  })

  it('refuses a create that races an existing row', async () => {
    const r = memoryRemote()
    await r.save('i1', inv('SI-1'))
    await expect(r.save('i1', inv('SI-1 again'))).rejects.toBeInstanceOf(ConflictError)
  })
})

describe('sync', () => {
  it('uploads an investigation the remote has never seen', async () => {
    const { local, remote, marks } = setup()
    local.save('i1', inv('SI-1'))
    const rep = await syncInvestigations(local, remote, marks)
    expect(rep.outcomes).toEqual([{ kind: 'uploaded', id: 'i1' }])
    expect((await remote.load('i1'))!.investigation.meta.investigationNo).toBe('SI-1')
    expect(marks.get('i1')).toBeDefined()
  })

  it('downloads one this browser has never seen', async () => {
    const { local, remote, marks } = setup()
    await remote.save('i9', inv('SI-9'))
    const rep = await syncInvestigations(local, remote, marks)
    expect(rep.outcomes).toEqual([{ kind: 'downloaded', id: 'i9' }])
    expect(local.load('i9')!.meta.investigationNo).toBe('SI-9')
  })

  it('does nothing when both sides already agree', async () => {
    const { local, remote, marks } = setup()
    local.save('i1', inv('SI-1'))
    await syncInvestigations(local, remote, marks)
    const rep = await syncInvestigations(local, remote, marks)
    expect(rep.outcomes).toEqual([{ kind: 'in-sync', id: 'i1' }])
  })

  it('uploads a local edit', async () => {
    const { local, remote, marks } = setup()
    local.save('i1', inv('SI-1'))
    await syncInvestigations(local, remote, marks)

    local.save('i1', inv('SI-1 rev B'))
    const rep = await syncInvestigations(local, remote, marks)
    expect(rep.outcomes).toEqual([{ kind: 'uploaded', id: 'i1' }])
    expect((await remote.load('i1'))!.investigation.meta.investigationNo).toBe('SI-1 rev B')
  })

  it('downloads a remote edit', async () => {
    const { local, remote, marks } = setup()
    local.save('i1', inv('SI-1'))
    await syncInvestigations(local, remote, marks)

    const current = await remote.load('i1')
    await remote.save('i1', inv('SI-1 from the office'), current!.updatedAt)
    const rep = await syncInvestigations(local, remote, marks)
    expect(rep.outcomes).toEqual([{ kind: 'downloaded', id: 'i1' }])
    expect(local.load('i1')!.meta.investigationNo).toBe('SI-1 from the office')
  })

  it('REPORTS a two-sided edit as a conflict and changes NOTHING', async () => {
    // The case the whole design exists for. Two engineers entering different
    // laboratory results for one hole: picking a winner automatically destroys
    // work that took a week to produce.
    const { local, remote, marks } = setup()
    local.save('i1', inv('SI-1'))
    await syncInvestigations(local, remote, marks)

    const current = await remote.load('i1')
    await remote.save('i1', inv('SI-1 remote edit'), current!.updatedAt)
    local.save('i1', inv('SI-1 local edit'))

    const rep = await syncInvestigations(local, remote, marks)
    expect(rep.conflicts).toHaveLength(1)
    const c = rep.conflicts[0]
    expect(c.local.meta.investigationNo).toBe('SI-1 local edit')
    expect(c.remote.investigation.meta.investigationNo).toBe('SI-1 remote edit')

    // Neither side was touched.
    expect(local.load('i1')!.meta.investigationNo).toBe('SI-1 local edit')
    expect((await remote.load('i1'))!.investigation.meta.investigationNo).toBe('SI-1 remote edit')
  })

  it('surfaces conflicts separately so they cannot be scrolled past', async () => {
    const { local, remote, marks } = setup()
    local.save('i1', inv('SI-1'))
    local.save('i2', inv('SI-2'))
    await syncInvestigations(local, remote, marks)

    const cur = await remote.load('i1')
    await remote.save('i1', inv('remote'), cur!.updatedAt)
    local.save('i1', inv('local'))

    const rep = await syncInvestigations(local, remote, marks)
    expect(rep.outcomes.length).toBeGreaterThan(1)
    expect(rep.conflicts).toHaveLength(1)
    expect(rep.conflicts[0].id).toBe('i1')
  })

  it('keeps going when ONE investigation fails', async () => {
    // A single bad record must not stop the rest of the sync.
    const { local, marks } = setup()
    local.save('ok', inv('fine'))
    local.save('bad', inv('broken'))
    const remote: RemoteStore = {
      ...memoryRemote(),
      async list() { return [] },
      async save(id, i) {
        if (id === 'bad') throw new Error('server exploded')
        return { id, investigation: i, schemaVersion: 1, updatedAt: '2026-01-01T00:00:00.000Z' }
      },
    }
    const rep = await syncInvestigations(local, remote, marks)
    expect(rep.outcomes.find((o) => o.id === 'ok')?.kind).toBe('uploaded')
    const failed = rep.outcomes.find((o) => o.id === 'bad')
    expect(failed?.kind).toBe('failed')
    expect(failed && 'error' in failed && failed.error).toMatch(/server exploded/)
  })

  it('is a no-op on both sides when there is nothing anywhere', async () => {
    const { local, remote, marks } = setup()
    const rep = await syncInvestigations(local, remote, marks)
    expect(rep.outcomes).toEqual([])
    expect(rep.conflicts).toEqual([])
  })
})

describe('change detection is by CONTENT, not by clock', () => {
  it('hashes structurally equal documents the same regardless of key order', () => {
    // Rebuild every object with its keys in REVERSE insertion order. Plain
    // JSON.stringify would disagree; the stable form must not.
    const reorder = (v: unknown): unknown => {
      if (v === null || typeof v !== 'object') return v
      if (Array.isArray(v)) return v.map(reorder)
      const out: Record<string, unknown> = {}
      for (const k of Object.keys(v as Record<string, unknown>).reverse()) {
        out[k] = reorder((v as Record<string, unknown>)[k])
      }
      return out
    }
    const a = inv('SI-1')
    const b = reorder(a) as Investigation
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))   // the orders really differ
    expect(contentHash(a)).toBe(contentHash(b))
  })

  it('changes when anything in the document changes', () => {
    const a = inv('SI-1')
    const b = inv('SI-1')
    b.meta.title = 'different'
    expect(contentHash(a)).not.toBe(contentHash(b))
  })

  it('does NOT upload when a save changed nothing', () => {
    // Re-saving identical content should not push traffic at the server.
    const { local } = setup()
    local.save('i1', inv('SI-1'))
    const first = contentHash(local.load('i1')!)
    local.save('i1', inv('SI-1'))
    expect(contentHash(local.load('i1')!)).toBe(first)
  })

  it('detects an edit that lands in the SAME MILLISECOND as the last one', async () => {
    // The bug that made this a hash instead of a timestamp: two saves inside
    // one millisecond share a savedAt, so a timestamp watermark would call the
    // second one unchanged and never upload it. Silent data loss.
    const { local, remote, marks } = setup()
    local.save('i1', inv('SI-1'), '2026-01-01T00:00:00.000Z')
    await syncInvestigations(local, remote, marks)

    local.save('i1', inv('SI-1 edited'), '2026-01-01T00:00:00.000Z')   // same stamp
    const rep = await syncInvestigations(local, remote, marks)
    expect(rep.outcomes).toEqual([{ kind: 'uploaded', id: 'i1' }])
    expect((await remote.load('i1'))!.investigation.meta.investigationNo).toBe('SI-1 edited')
  })
})

describe('summaries', () => {
  it('counts boreholes and samples from the document', async () => {
    const i = inv('SI-7', 'Counted')
    i.boreholes = [{
      id: 'b', name: 'BH-01', kind: 'borehole', actualDepth: 10,
      layers: [], spt: [],
      samples: [
        { id: 's1', name: 'S-01', type: 'disturbed', depthTop: 1, depthBottom: 1.5, tests: [] },
        { id: 's2', name: 'S-02', type: 'disturbed', depthTop: 3, depthBottom: 3.5, tests: [] },
      ],
    }]
    const s = summaryOf({ id: 'x', investigation: i, schemaVersion: 1, updatedAt: '2026-01-01T00:00:00.000Z' })
    expect(s.boreholeCount).toBe(1)
    expect(s.sampleCount).toBe(2)
    expect(s.investigationNo).toBe('SI-7')
  })

  it('lists newest first', async () => {
    const r = memoryRemote()
    await r.save('old', inv('OLD'))
    await r.save('new', inv('NEW'))
    expect((await r.list()).map((x) => x.id)).toEqual(['new', 'old'])
  })
})
