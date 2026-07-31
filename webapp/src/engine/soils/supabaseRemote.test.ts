import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseRemote, TABLE } from './supabaseRemote'
import { ConflictError } from './remoteStore'
import { emptyInvestigation } from './model'

const inv = (no: string) => {
  const i = emptyInvestigation('T')
  i.meta.investigationNo = no
  return i
}

const row = (id: string, no: string, updatedAt = '2026-01-01T00:00:00.000Z', schema = 1) => ({
  id, user_id: 'u1', investigation: inv(no), schema_version: schema, updated_at: updatedAt,
})

/**
 * A postgrest-shaped fake. Every builder method returns `this`, and the object
 * is awaited at the end — the same shape supabase-js presents.
 */
function fakeClient(handlers: {
  select?: (filters: Record<string, unknown>) => { data: unknown; error: unknown }
  update?: (patch: unknown, filters: Record<string, unknown>) => { data: unknown; error: unknown }
  insert?: (values: unknown) => { data: unknown; error: unknown }
  delete?: (filters: Record<string, unknown>) => { data: unknown; error: unknown }
}) {
  const calls: { op: string; filters: Record<string, unknown>; payload?: unknown }[] = []

  const make = (op: string, payload?: unknown) => {
    const filters: Record<string, unknown> = {}
    const b: Record<string, unknown> = {}
    b.eq = (k: string, v: unknown) => { filters[k] = v; return b }
    b.order = () => b
    b.select = () => b
    const settle = () => {
      calls.push({ op, filters, payload })
      if (op === 'select') return handlers.select?.(filters) ?? { data: [], error: null }
      if (op === 'update') return handlers.update?.(payload, filters) ?? { data: null, error: null }
      if (op === 'insert') return handlers.insert?.(payload) ?? { data: null, error: null }
      return handlers.delete?.(filters) ?? { data: null, error: null }
    }
    b.maybeSingle = async () => settle()
    b.single = async () => settle()
    b.then = (res: (v: unknown) => unknown) => Promise.resolve(settle()).then(res)
    return b
  }

  const client = {
    from(table: string) {
      expect(table).toBe(TABLE)
      return {
        select: () => make('select'),
        update: (patch: unknown) => make('update', patch),
        insert: (values: unknown) => make('insert', values),
        delete: () => make('delete'),
      }
    },
  } as unknown as SupabaseClient
  return { client, calls }
}

describe('listing', () => {
  it('filters to the signed-in user and returns summaries', async () => {
    const { client, calls } = fakeClient({
      select: () => ({ data: [row('a', 'SI-A'), row('b', 'SI-B')], error: null }),
    })
    const store = supabaseRemote(client, 'u1')
    const list = await store.list()
    expect(list.map((x) => x.investigationNo)).toEqual(['SI-A', 'SI-B'])
    expect(calls[0].filters.user_id).toBe('u1')
  })

  it('SKIPS one unreadable row rather than failing the whole listing', async () => {
    // Same rule the local store follows for a corrupt entry: one bad record
    // must not hide every good one.
    const { client } = fakeClient({
      select: () => ({
        data: [row('a', 'SI-A'), { ...row('b', 'SI-B'), investigation: { nonsense: true } }],
        error: null,
      }),
    })
    expect((await supabaseRemote(client, 'u1').list()).map((x) => x.id)).toEqual(['a'])
  })

  it('surfaces a transport error rather than returning an empty list', async () => {
    // An empty list reads as "you have no investigations", which is a lie the
    // user would act on.
    const { client } = fakeClient({ select: () => ({ data: null, error: { message: 'network down' } }) })
    await expect(supabaseRemote(client, 'u1').list()).rejects.toThrow(/network down/)
  })
})

describe('schema versioning', () => {
  it('REFUSES a row written by a newer client', async () => {
    // Parsing a shape this version does not understand could silently drop
    // fields on the next save. An error the user can act on is better.
    const { client } = fakeClient({ select: () => ({ data: row('a', 'SI-A', undefined, 99), error: null }) })
    await expect(supabaseRemote(client, 'u1').load('a'))
      .rejects.toThrow(/saved by a newer version/)
  })

  it('accepts an older or equal version', async () => {
    const { client } = fakeClient({ select: () => ({ data: row('a', 'SI-A', undefined, 1), error: null }) })
    expect((await supabaseRemote(client, 'u1').load('a'))!.investigation.meta.investigationNo).toBe('SI-A')
  })
})

describe('saving', () => {
  it('conditions an update on the version the caller read', async () => {
    const { client, calls } = fakeClient({
      update: (_p, f) => ({ data: row('a', 'SI-A', f.updated_at as string), error: null }),
    })
    await supabaseRemote(client, 'u1').save('a', inv('SI-A'), '2026-01-01T00:00:00.000Z')
    const call = calls.find((c) => c.op === 'update')!
    expect(call.filters.updated_at).toBe('2026-01-01T00:00:00.000Z')
    expect(call.filters.user_id).toBe('u1')
  })

  it('raises ConflictError when the conditional update matches NO row', async () => {
    let first = true
    const { client } = fakeClient({
      update: () => ({ data: null, error: null }),              // nobody matched
      select: () => {
        first = false
        return { data: row('a', 'SI-A moved on', '2026-02-02T00:00:00.000Z'), error: null }
      },
    })
    await expect(supabaseRemote(client, 'u1').save('a', inv('mine'), '2026-01-01T00:00:00.000Z'))
      .rejects.toBeInstanceOf(ConflictError)
    expect(first).toBe(false)
  })

  it('reports a vanished row as missing rather than as a conflict', async () => {
    const { client } = fakeClient({
      update: () => ({ data: null, error: null }),
      select: () => ({ data: null, error: null }),
    })
    await expect(supabaseRemote(client, 'u1').save('a', inv('mine'), '2026-01-01T00:00:00.000Z'))
      .rejects.toThrow(/no longer exists/)
  })

  it('inserts when there is no expected version, and stamps the user', async () => {
    const { client, calls } = fakeClient({ insert: (v) => ({ data: { ...(v as object) }, error: null }) })
    await supabaseRemote(client, 'u1').save('a', inv('SI-A'))
    const call = calls.find((c) => c.op === 'insert')!
    expect((call.payload as { user_id: string }).user_id).toBe('u1')
    expect((call.payload as { schema_version: number }).schema_version).toBe(1)
  })

  it('turns a unique-violation on insert into a ConflictError', async () => {
    const { client } = fakeClient({
      insert: () => ({ data: null, error: { message: 'duplicate key', code: '23505' } }),
      select: () => ({ data: row('a', 'SI-A already there'), error: null }),
    })
    await expect(supabaseRemote(client, 'u1').save('a', inv('mine')))
      .rejects.toBeInstanceOf(ConflictError)
  })
})

describe('deleting', () => {
  it('scopes the delete to the signed-in user', async () => {
    const { client, calls } = fakeClient({ delete: () => ({ data: null, error: null }) })
    await supabaseRemote(client, 'u1').remove('a')
    const call = calls.find((c) => c.op === 'delete')!
    expect(call.filters.user_id).toBe('u1')
    expect(call.filters.id).toBe('a')
  })
})
