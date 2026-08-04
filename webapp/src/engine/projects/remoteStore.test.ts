import { describe, it, expect } from 'vitest'
import { createStore, memoryBackend, type ProjectStore } from './store'
import { emptyProject, type Project } from './model'
import {
  memoryRemote, syncProjects, contentHash, conflictsIn,
  ConflictError, ProjectLimitError, type SyncMark, type SyncMarks, type RemoteStore,
} from './remoteStore'

const T = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString()

function marksIn(): SyncMarks & { all: Map<string, SyncMark> } {
  const all = new Map<string, SyncMark>()
  return { all, get: (id) => all.get(id), set: (id, m) => void all.set(id, m), forget: (id) => void all.delete(id) }
}

const named = (name: string, n = 0): Project => emptyProject(name, T(n))

async function settled(local: ProjectStore, remote: RemoteStore, marks: SyncMarks) {
  const r = await syncProjects(local, remote, marks)
  return r.outcomes.map((o) => `${o.id}:${o.kind}`).sort()
}

describe('contentHash', () => {
  it('ignores key order — two structurally equal projects hash the same', () => {
    const a = named('Tower', 0)
    const reordered = JSON.parse(JSON.stringify({ inputs: a.inputs, model: a.model, meta: a.meta })) as Project
    expect(contentHash(reordered)).toBe(contentHash(a))
  })

  it('notices a real edit', () => {
    const a = named('Tower', 0)
    const b: Project = { ...a, meta: { ...a.meta, client: 'ACME' } }
    expect(contentHash(b)).not.toBe(contentHash(a))
  })
})

describe('memoryRemote', () => {
  it('refuses a stale write and hands back the version it refused for', async () => {
    const r = memoryRemote()
    const first = await r.save('a', named('One'))
    await r.save('a', named('Two'), first.updatedAt)
    await expect(r.save('a', named('Three'), first.updatedAt)).rejects.toThrow(ConflictError)
  })

  it('stamps two writes in the same millisecond differently', async () => {
    // Wall-clock stamps collide when the app is fast, and optimistic
    // concurrency silently stops working the moment two versions share one.
    const r = memoryRemote()
    const a = await r.save('a', named('a'))
    const b = await r.save('b', named('b'))
    expect(a.updatedAt).not.toBe(b.updatedAt)
  })

  it('enforces a ceiling on new rows only', async () => {
    const r = memoryRemote([], 2)
    const a = await r.save('a', named('a'))
    await r.save('b', named('b'))
    await expect(r.save('c', named('c'))).rejects.toThrow(ProjectLimitError)
    // The one that exists can still be saved — a lapsed plan must not make
    // existing work unsavable.
    await expect(r.save('a', named('a2'), a.updatedAt)).resolves.toBeTruthy()
  })
})

describe('syncProjects', () => {
  it('uploads a project the server has never seen', async () => {
    const local = createStore(memoryBackend()), remote = memoryRemote(), marks = marksIn()
    local.save('a', named('Tower'), T(0))
    expect(await settled(local, remote, marks)).toEqual(['a:uploaded'])
    expect((await remote.load('a'))?.project.meta.name).toBe('Tower')
  })

  it('downloads a project this machine has never seen — the point of the feature', async () => {
    const local = createStore(memoryBackend()), remote = memoryRemote(), marks = marksIn()
    await remote.save('a', named('From the office'))
    expect(await settled(local, remote, marks)).toEqual(['a:downloaded'])
    expect(local.load('a')?.meta.name).toBe('From the office')
  })

  it('is a no-op the second time — nothing re-uploads on every sync', async () => {
    const local = createStore(memoryBackend()), remote = memoryRemote(), marks = marksIn()
    local.save('a', named('Tower'), T(0))
    await settled(local, remote, marks)
    expect(await settled(local, remote, marks)).toEqual(['a:unchanged'])
  })

  it('uploads a local edit and downloads a remote one', async () => {
    const local = createStore(memoryBackend()), remote = memoryRemote(), marks = marksIn()
    local.save('a', named('Tower'), T(0))
    await settled(local, remote, marks)

    local.save('a', { ...local.load('a')!, meta: { ...local.load('a')!.meta, client: 'ACME' } }, T(10))
    expect(await settled(local, remote, marks)).toEqual(['a:uploaded'])
    expect((await remote.load('a'))?.project.meta.client).toBe('ACME')

    const cur = await remote.load('a')
    await remote.save('a', { ...cur!.project, meta: { ...cur!.project.meta, location: 'Cebu' } }, cur!.updatedAt)
    expect(await settled(local, remote, marks)).toEqual(['a:downloaded'])
    expect(local.load('a')?.meta.location).toBe('Cebu')
  })

  it('reports both-sides-changed as a conflict and touches neither', async () => {
    const local = createStore(memoryBackend()), remote = memoryRemote(), marks = marksIn()
    local.save('a', named('Tower'), T(0))
    await settled(local, remote, marks)

    local.save('a', { ...local.load('a')!, meta: { ...local.load('a')!.meta, client: 'LOCAL' } }, T(10))
    const cur = await remote.load('a')
    await remote.save('a', { ...cur!.project, meta: { ...cur!.project.meta, client: 'REMOTE' } }, cur!.updatedAt)

    const report = await syncProjects(local, remote, marks)
    expect(conflictsIn(report)).toHaveLength(1)
    // Neither side was overwritten. The caller decides; the machine does not
    // guess which column size is right.
    expect(local.load('a')?.meta.client).toBe('LOCAL')
    expect((await remote.load('a'))?.project.meta.client).toBe('REMOTE')
  })

  it('does not decide by timestamp', async () => {
    // A laptop whose clock is an hour slow would otherwise lose every race.
    // The local document here is stamped in 1999 and still wins, because it is
    // the side that CHANGED.
    const local = createStore(memoryBackend()), remote = memoryRemote(), marks = marksIn()
    local.save('a', named('Tower'), T(0))
    await settled(local, remote, marks)
    local.save('a', { ...local.load('a')!, meta: { ...local.load('a')!.meta, client: 'ACME' } },
      new Date(Date.UTC(1999, 0, 1)).toISOString())
    expect(await settled(local, remote, marks)).toEqual(['a:uploaded'])
    expect((await remote.load('a'))?.project.meta.client).toBe('ACME')
  })

  it('never deletes — a project missing from one side comes back', async () => {
    // Resurrection is the safe failure; silent deletion is not. Deleting is an
    // explicit act through `remove`, not something a sync infers.
    const local = createStore(memoryBackend()), remote = memoryRemote(), marks = marksIn()
    local.save('a', named('Tower'), T(0))
    await settled(local, remote, marks)
    await remote.remove('a')
    expect(await settled(local, remote, marks)).toEqual(['a:uploaded'])
    expect(await remote.load('a')).not.toBeNull()
  })

  it('keeps going when one project fails', async () => {
    const local = createStore(memoryBackend()), remote = memoryRemote(), marks = marksIn()
    local.save('ok', named('Fine'), T(0))
    local.save('bad', named('Broken'), T(0))
    const failing: RemoteStore = {
      ...remote,
      save: async (id, p, exp) => {
        if (id === 'bad') throw new Error('network went away')
        return remote.save(id, p, exp)
      },
    }
    const outcomes = await settled(local, failing, marks)
    expect(outcomes).toEqual(['bad:failed', 'ok:uploaded'])
    // The one that worked is marked, so it does not re-upload next time.
    expect(marks.all.has('ok')).toBe(true)
    expect(marks.all.has('bad')).toBe(false)
  })

  it('surfaces the plan ceiling as a failure rather than losing the project', async () => {
    const local = createStore(memoryBackend()), marks = marksIn()
    const remote = memoryRemote([], 1)
    local.save('a', named('One'), T(0))
    local.save('b', named('Two'), T(1))

    // WHICH one is refused depends on the order the listing happens to yield,
    // and that is not the invariant. The invariant is that exactly one gets
    // through, the other is reported, and BOTH are still on this machine — a
    // quota must never be the reason work disappears.
    const report = await syncProjects(local, remote, marks)
    const kinds = report.outcomes.map((o) => o.kind).sort()
    expect(kinds).toEqual(['failed', 'uploaded'])
    const refused = report.outcomes.find((o) => o.kind === 'failed')!
    expect(refused.kind === 'failed' && refused.message).toContain('plan')
    expect(local.load('a')).not.toBeNull()
    expect(local.load('b')).not.toBeNull()
  })
})
