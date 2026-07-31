import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runRemoteDiagnostics } from './remoteDiagnostics'

/**
 * A postgrest-shaped fake whose behaviour per operation is scripted, so each
 * check can be driven to BOTH outcomes. A diagnostic that cannot fail is not a
 * diagnostic, and these tests exist to prove each one can.
 */
function fake(script: {
  selectColumns?: 'ok' | 'error'
  bogusColumn?: 'error' | 'accepted'
  anonInsert?: 'refused' | 'accepted'
  ownInsert?: 'ok' | 'error'
  readBack?: 'match' | 'mismatch'
  staleUpdate?: 'no-rows' | 'applied' | 'error'
}) {
  const calls: string[] = []
  const make = (op: string, payload?: unknown) => {
    const filters: Record<string, unknown> = {}
    const b: Record<string, unknown> = {}
    b.eq = (k: string, v: unknown) => { filters[k] = v; return b }
    b.limit = () => b
    b.select = () => b
    b.order = () => b

    const settle = () => {
      if (op === 'select') {
        const cols = String(payload ?? '')
        if (cols.includes('definitely_not_a_column')) {
          calls.push('bogus')
          return script.bogusColumn === 'accepted'
            ? { data: [], error: null }
            : { data: null, error: { message: 'column does not exist', code: '42703' } }
        }
        if (cols.includes('investigation') && filters.id) {
          calls.push('readback')
          return script.readBack === 'mismatch'
            ? { data: { investigation: { meta: { investigationNo: 'something else' } } }, error: null }
            : { data: { investigation: { meta: { investigationNo: String(filters.id) } } }, error: null }
        }
        calls.push('columns')
        return script.selectColumns === 'error'
          ? { data: null, error: { message: 'relation does not exist', code: '42P01' } }
          : { data: [], error: null }
      }
      if (op === 'insert') {
        const v = payload as { user_id: string; id: string }
        if (v.user_id === '00000000-0000-0000-0000-000000000000') {
          calls.push('anon-insert')
          return script.anonInsert === 'accepted'
            ? { data: { ...v }, error: null }
            : { data: null, error: { message: 'new row violates row-level security policy', code: '42501' } }
        }
        calls.push('own-insert')
        return script.ownInsert === 'error'
          ? { data: null, error: { message: 'permission denied', code: '42501' } }
          : { data: { ...v, updated_at: '2026-01-01T00:00:00.000Z' }, error: null }
      }
      if (op === 'update') {
        calls.push('stale-update')
        if (script.staleUpdate === 'error') return { data: null, error: { message: 'boom' } }
        return script.staleUpdate === 'applied'
          ? { data: [{ id: 'x' }], error: null }
          : { data: [], error: null }
      }
      calls.push('delete')
      return { data: null, error: null }
    }

    b.maybeSingle = async () => settle()
    b.single = async () => settle()
    b.then = (res: (v: unknown) => unknown) => Promise.resolve(settle()).then(res)
    return b
  }

  const client = {
    from: () => ({
      select: (cols: string) => make('select', cols),
      insert: (v: unknown) => make('insert', v),
      update: (v: unknown) => make('update', v),
      delete: () => make('delete'),
    }),
  } as unknown as SupabaseClient
  return { client, calls }
}

const HEALTHY = {
  selectColumns: 'ok', bogusColumn: 'error', anonInsert: 'refused',
  ownInsert: 'ok', readBack: 'match', staleUpdate: 'no-rows',
} as const

const by = (r: Awaited<ReturnType<typeof runRemoteDiagnostics>>, name: string) =>
  r.results.find((x) => x.name === name)!

describe('a healthy database', () => {
  it('passes every check', async () => {
    const { client } = fake(HEALTHY)
    const r = await runRemoteDiagnostics(client, 'u1')
    expect(r.ok).toBe(true)
    expect(r.ranAll).toBe(true)
    expect(r.results.every((x) => x.status === 'pass')).toBe(true)
  })

  it('CLEANS UP the row it wrote', async () => {
    const { client, calls } = fake(HEALTHY)
    await runRemoteDiagnostics(client, 'u1')
    expect(calls).toContain('delete')
  })
})

describe('each check can actually fail', () => {
  // A diagnostic that cannot fail is decoration. One case per check.

  it('detects a missing table or renamed column', async () => {
    const { client } = fake({ ...HEALTHY, selectColumns: 'error' })
    const r = await runRemoteDiagnostics(client, 'u1')
    expect(by(r, 'Table and column names').status).toBe('fail')
    expect(by(r, 'Table and column names').detail).toMatch(/relation does not exist/)
    expect(r.ok).toBe(false)
  })

  it('detects that the column check itself is worthless', async () => {
    // If a nonsense column is accepted, a green column check proves nothing.
    const { client } = fake({ ...HEALTHY, bogusColumn: 'accepted' })
    const r = await runRemoteDiagnostics(client, 'u1')
    expect(by(r, 'Column check is meaningful').status).toBe('fail')
    expect(by(r, 'Column check is meaningful').detail).toMatch(/cannot be trusted/)
  })

  it('detects RLS not protecting the table, and says the data is public', async () => {
    const { client, calls } = fake({ ...HEALTHY, anonInsert: 'accepted' })
    const r = await runRemoteDiagnostics(client, 'u1')
    const rls = by(r, 'Row-level security')
    expect(rls.status).toBe('fail')
    expect(rls.detail).toMatch(/treat the data as public/)
    // And it removes the row it managed to plant.
    expect(calls.filter((c) => c === 'delete').length).toBeGreaterThan(0)
  })

  it('treats a REFUSED anonymous write as the pass condition', async () => {
    const { client } = fake(HEALTHY)
    const r = await runRemoteDiagnostics(client, 'u1')
    expect(by(r, 'Row-level security').status).toBe('pass')
    expect(by(r, 'Row-level security').detail).toMatch(/was refused/)
  })

  it('detects a document that does not round-trip through jsonb', async () => {
    const { client } = fake({ ...HEALTHY, readBack: 'mismatch' })
    const r = await runRemoteDiagnostics(client, 'u1')
    expect(by(r, 'Round trip').status).toBe('fail')
    expect(by(r, 'Round trip').detail).toMatch(/did not come back as written/)
  })

  it('detects broken conflict detection — the silent-overwrite case', async () => {
    const { client } = fake({ ...HEALTHY, staleUpdate: 'applied' })
    const r = await runRemoteDiagnostics(client, 'u1')
    const c = by(r, 'Conflict detection')
    expect(c.status).toBe('fail')
    expect(c.detail).toMatch(/silently overwrite each other/)
  })

  it('reports a conditional update that errors, distinctly from one that matches nothing', async () => {
    const { client } = fake({ ...HEALTHY, staleUpdate: 'error' })
    expect(by(await runRemoteDiagnostics(client, 'u1'), 'Conflict detection').detail)
      .toMatch(/errored rather than matching nothing/)
  })

  it('reports a failed write without pretending the later checks ran', async () => {
    const { client } = fake({ ...HEALTHY, ownInsert: 'error' })
    const r = await runRemoteDiagnostics(client, 'u1')
    expect(by(r, 'Round trip').status).toBe('fail')
    expect(by(r, 'Conflict detection').status).toBe('skipped')
    expect(r.ranAll).toBe(false)
  })
})

describe('signed out', () => {
  it('still checks the schema and RLS, and SKIPS what needs a session', async () => {
    const { client } = fake(HEALTHY)
    const r = await runRemoteDiagnostics(client, null)
    expect(by(r, 'Table and column names').status).toBe('pass')
    expect(by(r, 'Row-level security').status).toBe('pass')
    expect(by(r, 'Round trip').status).toBe('skipped')
    expect(r.ranAll).toBe(false)
    // Skipped is not failed — a signed-out run is inconclusive, not broken.
    expect(r.ok).toBe(true)
  })

  it('writes nothing when signed out', async () => {
    const { client, calls } = fake(HEALTHY)
    await runRemoteDiagnostics(client, null)
    expect(calls).not.toContain('own-insert')
  })
})
