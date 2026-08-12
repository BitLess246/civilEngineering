// End-to-end through the handler: method → auth → body → solver → JSON.
//
// This is as close to the deployed thing as this repo can get — the same
// module Vercel invokes, driven with a real `Request`. What it cannot prove is
// that Vercel is serving it at /api/steel/*; that needs a deployment, and the
// client's 404 fallback exists precisely because it might not be.

import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest'
import beam from './beam'
import column from './column'
import connection from './connection'
import type { BeamCalcResult } from '../../src/lib/calcApi'

const ANON = 'test-anon-key'
const BEAM_INPUT = { shapeName: 'W310x38.7', Fy: 345, span: 6, Lb: 2, Cb: 1, wDead: 15, wLive: 25 }

const post = (body: unknown, auth: string | null = `Bearer ${ANON}`, method = 'POST') =>
  new Request('https://example.test/api/steel/beam', {
    method,
    headers: auth ? { authorization: auth, 'content-type': 'application/json' } : {},
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })

// Restore key by key rather than replacing `process.env` wholesale: the API
// project has no @types/node on purpose (these functions must not reach for
// Node builtins), so `NodeJS.ProcessEnv` is not a name it can spell.
const KEYS = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY',
  'GUEST_TRIAL_SALT', 'GUEST_TRIAL_LIMIT'] as const
let saved: Record<string, string | undefined>
let quiet: MockInstance
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
  process.env.SUPABASE_URL = 'https://proj.supabase.co'
  process.env.SUPABASE_ANON_KEY = ANON
  delete process.env.VITE_SUPABASE_URL
  delete process.env.VITE_SUPABASE_ANON_KEY
  // No salt: the quota gate is inert and every guest computes, which is what
  // the existing cases below assume. The gated cases set one explicitly.
  delete process.env.GUEST_TRIAL_SALT
  delete process.env.GUEST_TRIAL_LIMIT
  quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  quiet.mockRestore()
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('POST /api/steel/beam', () => {
  it('computes for a guest presenting the anon key', async () => {
    const res = await beam(post(BEAM_INPUT))
    expect(res.status).toBe(200)
    const body = (await res.json()) as BeamCalcResult
    // A real answer, not an echo: φMn for this section is ~187 kN·m.
    expect(body.avail.Mn).toBeGreaterThan(150)
    expect(body.avail.Mn).toBeLessThan(220)
    expect(body.basis).toBe('LRFD')
    expect(body.loads.wu).toBeCloseTo(Math.max(1.4 * 15, 1.2 * 15 + 1.6 * 25), 6)
  })

  it('honours the design basis, so the endpoint is not hard-coded to LRFD', async () => {
    const lrfd = (await (await beam(post(BEAM_INPUT))).json()) as BeamCalcResult
    const asd = (await (await beam(post({ ...BEAM_INPUT, basis: 'ASD' }))).json()) as BeamCalcResult
    expect(asd.basis).toBe('ASD')
    expect(asd.avail.Mn).toBeLessThan(lrfd.avail.Mn)
    expect(asd.loads.wu).toBeCloseTo(40, 6)      // D + L
  })

  it('refuses without a token', async () => {
    const res = await beam(post(BEAM_INPUT, null))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthenticated' })
  })

  it('refuses a token that is neither the anon key nor a real session', async () => {
    // `identify` fails closed when it cannot reach Supabase, and the URL above
    // does not resolve in the test environment — which is the same answer.
    const res = await beam(post(BEAM_INPUT, 'Bearer not-a-real-token'))
    expect(res.status).toBe(401)
  })

  it('rejects a non-POST before looking at anything else', async () => {
    expect((await beam(post(null, `Bearer ${ANON}`, 'GET'))).status).toBe(405)
  })

  it('503s when the deployment forgot the env, rather than computing anyway', async () => {
    delete process.env.SUPABASE_URL
    delete process.env.VITE_SUPABASE_URL
    const res = await beam(post(BEAM_INPUT))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'unconfigured' })
  })

  it('400s on a body that is not an object', async () => {
    const req = new Request('https://example.test/api/steel/beam', {
      method: 'POST',
      headers: { authorization: `Bearer ${ANON}` },
      body: 'not json',
    })
    expect((await beam(req)).status).toBe(400)
  })

  it('turns an engine throw into a 400, not a 500', async () => {
    // An unknown section is the caller's mistake; the message is the engine's.
    const res = await beam(post({ ...BEAM_INPUT, shapeName: 'W999x999' }))
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toMatch(/Unknown AISC shape/)
  })

  it('never caches a result', async () => {
    expect((await beam(post(BEAM_INPUT))).headers.get('cache-control')).toBe('no-store')
  })
})

describe('the other two endpoints', () => {
  it('column computes', async () => {
    const res = await column(post({ shapeName: 'W250x67', Fy: 345, L: 4, Kx: 1, Ky: 1, Pu: 900, Mux: 60, Muy: 0 }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { avail: { Pn: number }; comb: { ratio: number } }
    expect(body.avail.Pn).toBeGreaterThan(0)
    expect(body.comb.ratio).toBeGreaterThan(0)
  })

  it('connection computes', async () => {
    const res = await connection(post({
      Vu: 150, Hu: 0, boltGrade: 'A325M', db: 20, nRows: 3, nCols: 1,
      sy: 70, sx: 70, ey: 40, ex_edge: 35, threads: true,
      tPlate: 10, FuPlate: 400, FyPlate: 248,
      ex_load: 0, ey_load: 0, e_out: 0, b_gage: 0,
    }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { geom: { n: number }; avail: { governing: number } }
    expect(body.geom.n).toBe(3)
    expect(body.avail.governing).toBeGreaterThan(0)
  })

  it('all three refuse without a token', async () => {
    for (const h of [beam, column, connection]) {
      expect((await h(post({}, null))).status).toBe(401)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────
// THE TRIAL GATE, THROUGH THE REAL HANDLER.
//
// The unit tests in api/_lib/quota.test.ts prove the decision. These prove the
// endpoint HONOURS it: that a refusal stops the solver running, that a member
// is never metered, and that typing does not burn the allowance.
// ─────────────────────────────────────────────────────────────────────────
describe('the guest trial gate', () => {
  const SALT = 'q'.repeat(32)
  const GUEST = { 'x-forwarded-for': '203.0.113.7', 'user-agent': 'Chrome/120 Windows' }

  /** A request from a guest on a named run. */
  const guest = (run?: string, extra: Record<string, string> = {}) =>
    new Request('https://example.test/api/steel/beam', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${ANON}`, 'content-type': 'application/json',
        ...GUEST, ...(run ? { 'x-calc-run': run } : {}), ...extra,
      },
      body: JSON.stringify(BEAM_INPUT),
    })

  /** Stand in for Supabase: /auth/v1/user for members, the RPC for the quota. */
  const supabase = (row: Record<string, unknown>) => {
    const rpcCalls: Record<string, unknown>[] = []
    const original = globalThis.fetch
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url)
      if (u.endsWith('/rest/v1/rpc/claim_guest_run')) {
        rpcCalls.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
        return new Response(JSON.stringify([row]), { status: 200 })
      }
      if (u.endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: 'user-1' }), { status: 200 })
      return new Response('no', { status: 404 })
    }) as typeof fetch
    return { rpcCalls, restore: () => { globalThis.fetch = original } }
  }

  beforeEach(() => { process.env.GUEST_TRIAL_SALT = SALT })

  it('computes for a guest with runs left', async () => {
    const sb = supabase({ allowed: true, charged: true, used: 1, reason: null })
    try {
      const res = await beam(guest('run-token-0001'))
      expect(res.status).toBe(200)
      expect((await res.json() as BeamCalcResult).avail.Mn).toBeGreaterThan(150)
      // and hands back a ticket so the next keystroke skips the database
      expect(res.headers.get('x-calc-ticket')).toBeTruthy()
    } finally { sb.restore() }
  })

  it('402s an exhausted guest WITHOUT computing anything', async () => {
    // The status matters: 401 would tell the page to re-authenticate, which
    // cannot help. 402 is "this needs an account".
    const sb = supabase({ allowed: false, charged: false, used: 5, reason: 'exhausted' })
    try {
      const res = await beam(guest('run-token-0006'))
      expect(res.status).toBe(402)
      const body = await res.json() as { error: string; route: string; used: number }
      expect(body.error).toBe('trial-exhausted')
      expect(body.route).toBe('/steel/beam')
      expect(body.used).toBe(5)
      // No result leaked alongside the refusal.
      expect(JSON.stringify(body)).not.toContain('avail')
    } finally { sb.restore() }
  })

  it('never meters a signed-in member', async () => {
    // `identify` returns a member for any token that is not the anon key, and
    // the gate must not even ask the database about them.
    const sb = supabase({ allowed: false, charged: false, used: 99, reason: 'exhausted' })
    try {
      const res = await beam(new Request('https://example.test/api/steel/beam', {
        method: 'POST',
        headers: { authorization: 'Bearer member-token', 'content-type': 'application/json', ...GUEST },
        body: JSON.stringify(BEAM_INPUT),
      }))
      expect(res.status).toBe(200)
      expect(sb.rpcCalls).toHaveLength(0)
    } finally { sb.restore() }
  })

  it('charges the arrival once, not once per keystroke', async () => {
    // The whole reason for the ticket. Five runs would otherwise be gone in a
    // second of typing, because the page recomputes on a 250 ms debounce.
    const sb = supabase({ allowed: true, charged: true, used: 1, reason: null })
    try {
      const first = await beam(guest('run-token-0001'))
      const ticket = first.headers.get('x-calc-ticket')!
      for (let i = 0; i < 20; i++) {
        const res = await beam(guest('run-token-0001', { 'x-calc-ticket': ticket }))
        expect(res.status).toBe(200)
      }
      expect(sb.rpcCalls).toHaveLength(1)      // 21 requests, one claim
    } finally { sb.restore() }
  })

  it('meters each calculator separately', async () => {
    const sb = supabase({ allowed: true, charged: true, used: 1, reason: null })
    try {
      await beam(guest('run-token-0001'))
      await column(new Request('https://example.test/api/steel/column', {
        method: 'POST',
        headers: { authorization: `Bearer ${ANON}`, 'content-type': 'application/json',
                   ...GUEST, 'x-calc-run': 'run-token-0001' },
        body: JSON.stringify({ shapeName: 'W250x67', Fy: 345, L: 4, Kx: 1, Ky: 1, Pu: 900, Mux: 60, Muy: 0 }),
      }))
      expect(sb.rpcCalls.map((c) => c.p_route)).toEqual(['/steel/beam', '/steel/column'])
    } finally { sb.restore() }
  })

  it('says so in a header when the gate is inert, rather than failing quietly', async () => {
    delete process.env.GUEST_TRIAL_SALT
    const res = await beam(guest('run-token-0001'))
    expect(res.status).toBe(200)
    expect(res.headers.get('x-calc-quota')).toBe('degraded; no-salt')
  })

  it('keeps computing when the quota store is unreachable', async () => {
    const original = globalThis.fetch
    globalThis.fetch = (async (url: string | URL | Request) => {
      if (String(url).includes('rpc/claim_guest_run')) throw new Error('ECONNREFUSED')
      return new Response('no', { status: 404 })
    }) as typeof fetch
    try {
      const res = await beam(guest('run-token-0001'))
      expect(res.status).toBe(200)
      expect(res.headers.get('x-calc-quota')).toBe('degraded; rpc-unreachable')
    } finally { globalThis.fetch = original }
  })
})
