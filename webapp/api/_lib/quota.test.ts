// The decision that used to be the browser's. What matters here is not that
// the happy path works but that each way of ducking the counter is closed, and
// that the ways this can fail leave the site working rather than dark.

import { describe, it, expect, vi } from 'vitest'
import { claimRun, quotaConfig, GUEST_TRIAL_LIMIT, type QuotaConfig } from './quota'
import { issueTicket, TICKET_TTL_MS } from './ticket'
import { subjectHash } from './subject'

const SALT = 'a'.repeat(32)
const CFG: QuotaConfig = {
  supabaseUrl: 'https://proj.supabase.co',
  anonKey: 'anon-key',
  salt: SALT,
  limit: 5,
}

const UA = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36'

const req = (extra: Record<string, string> = {}, ip = '203.0.113.7') =>
  new Request('https://example.test/api/steel/beam', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip, 'user-agent': UA, ...extra },
  })

/** A stub PostgREST that answers as `claim_guest_run` would. */
const rpc = (row: Record<string, unknown>, status = 200) => {
  const calls: { body: Record<string, unknown> }[] = []
  const impl = (async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown> })
    return new Response(JSON.stringify([row]), { status })
  }) as unknown as typeof fetch
  return { impl, calls }
}

const never = (() => { throw new Error('the database should not have been called') }) as unknown as typeof fetch

describe('claimRun charges an arrival', () => {
  it('allows a first run and hands back a ticket', async () => {
    const { impl, calls } = rpc({ allowed: true, charged: true, used: 1, reason: null })
    const v = await claimRun(req({ 'x-calc-run': 'run-token-0001' }), '/steel/beam', CFG, impl)
    expect(v.ok).toBe(true)
    expect(v.ok && v.ticket).toBeTruthy()
    expect(calls[0].body.p_route).toBe('/steel/beam')
    expect(calls[0].body.p_run).toBe('run-token-0001')
    expect(calls[0].body.p_limit).toBe(5)
    // The address never leaves the process — only its salted digest does.
    expect(JSON.stringify(calls[0].body)).not.toContain('203.0.113.7')
    expect(calls[0].body.p_subject).toBe(await subjectHash(SALT, '203.0.113.7'))
  })

  it('refuses once the allowance is spent', async () => {
    const { impl } = rpc({ allowed: false, charged: false, used: 5, reason: 'exhausted' })
    const v = await claimRun(req({ 'x-calc-run': 'run-token-0006' }), '/steel/beam', CFG, impl)
    expect(v).toEqual({ ok: false, reason: 'exhausted', used: 5 })
  })

  it('passes the route cap through as its own reason', async () => {
    const { impl } = rpc({ allowed: false, charged: false, used: 0, reason: 'route-cap' })
    const v = await claimRun(req({ 'x-calc-run': 'run-token-0001' }), '/steel/beam', CFG, impl)
    expect(v).toEqual({ ok: false, reason: 'route-cap', used: 0 })
  })
})

describe('the ticket keeps typing off the database', () => {
  it('a valid ticket is accepted with NO round trip', async () => {
    // This is the performance claim in the module header, asserted rather than
    // assumed: `never` throws if the database is consulted at all.
    const subject = await subjectHash(SALT, '203.0.113.7')
    const ticket = await issueTicket(SALT, subject, '/steel/beam', 'run-token-0001')
    const v = await claimRun(
      req({ 'x-calc-run': 'run-token-0001', 'x-calc-ticket': ticket }), '/steel/beam', CFG, never)
    expect(v.ok).toBe(true)
    expect(v.ok && v.ticket).toBeUndefined()   // no need to reissue
  })

  it('an EXPIRED ticket falls back to the database with the same run token', async () => {
    // And the database, seeing a token it remembers, admits without charging —
    // which is why a long session does not cost a second run.
    const subject = await subjectHash(SALT, '203.0.113.7')
    const t0 = 1_000_000
    const ticket = await issueTicket(SALT, subject, '/steel/beam', 'run-token-0001', t0)
    const { impl, calls } = rpc({ allowed: true, charged: false, used: 1, reason: null })
    const v = await claimRun(
      req({ 'x-calc-run': 'run-token-0001', 'x-calc-ticket': ticket }),
      '/steel/beam', CFG, impl, t0 + TICKET_TTL_MS + 1)
    expect(v.ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].body.p_run).toBe('run-token-0001')
  })

  it('a ticket for ANOTHER route does not skip the check', async () => {
    const subject = await subjectHash(SALT, '203.0.113.7')
    const ticket = await issueTicket(SALT, subject, '/steel/column', 'run-token-0001')
    const { impl, calls } = rpc({ allowed: true, charged: true, used: 1, reason: null })
    await claimRun(
      req({ 'x-calc-run': 'run-token-0001', 'x-calc-ticket': ticket }), '/steel/beam', CFG, impl)
    expect(calls).toHaveLength(1)
  })

  it('a ticket from a DIFFERENT visitor does not skip the check', async () => {
    const other = await subjectHash(SALT, '198.51.100.1')
    const ticket = await issueTicket(SALT, other, '/steel/beam', 'run-token-0001')
    const { impl, calls } = rpc({ allowed: false, charged: false, used: 5, reason: 'exhausted' })
    const v = await claimRun(
      req({ 'x-calc-run': 'run-token-0001', 'x-calc-ticket': ticket }), '/steel/beam', CFG, impl)
    expect(calls).toHaveLength(1)
    expect(v.ok).toBe(false)
  })
})

describe('the run token cannot be used to dodge the counter', () => {
  it('a junk or missing token is sent as null, so every request is a new run', async () => {
    const junk: Record<string, string>[] = [
      {}, { 'x-calc-run': 'short' }, { 'x-calc-run': 'has spaces here!' },
      { 'x-calc-run': 'x'.repeat(65) },
    ]
    for (const h of junk) {
      const { impl, calls } = rpc({ allowed: true, charged: true, used: 1, reason: null })
      await claimRun(req(h), '/steel/beam', CFG, impl)
      expect(calls[0].body.p_run, JSON.stringify(h)).toBeNull()
    }
  })

  it('issues no ticket when there is no run token to bind it to', async () => {
    const { impl } = rpc({ allowed: true, charged: true, used: 1, reason: null })
    const v = await claimRun(req(), '/steel/beam', CFG, impl)
    expect(v.ok && v.ticket).toBeUndefined()
  })

  it('the ROUTE comes from the endpoint, never from the request', async () => {
    // A caller who could name their own route would just claim one with a
    // fresh allowance for every request.
    const { impl, calls } = rpc({ allowed: true, charged: true, used: 1, reason: null })
    await claimRun(
      req({ 'x-calc-run': 'run-token-0001', 'x-calc-route': '/anything-i-like' }),
      '/bolted-connection', CFG, impl)
    expect(calls[0].body.p_route).toBe('/bolted-connection')
  })
})

describe('nothing the caller chooses reaches the subject', () => {
  // The property that makes the digest a boundary. Each of these headers used
  // to change the subject, and each is set entirely by whoever is calling.

  const subjectFor = async (headers: Record<string, string>, ip?: string) => {
    const { impl, calls } = rpc({ allowed: true, charged: true, used: 1, reason: null })
    await claimRun(req({ 'x-calc-run': 'run-token-0001', ...headers }, ip), '/steel/beam', CFG, impl)
    return calls[0].body.p_subject
  }

  it('the User-Agent does not, so one browser cannot be thirty-six visitors', async () => {
    // `uaFamily` bucketed the UA into 6 engines × 6 platforms. All 36 were
    // reachable by editing one header, which turned a five-run allowance into
    // 180 and multiplied the row growth by the same factor.
    const chromeWin = await subjectFor({ 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120' })
    const safariMac = await subjectFor({ 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/605' })
    const firefox = await subjectFor({ 'user-agent': 'Mozilla/5.0 (X11; Linux) Firefox/121' })
    const absent = await subjectFor({ 'user-agent': '' })
    expect(new Set([chromeWin, safariMac, firefox, absent]).size).toBe(1)
  })

  it('cf-connecting-ip does not — nothing in front of this sets it', async () => {
    const spoofed = await subjectFor({ 'cf-connecting-ip': '198.51.100.99' })
    const plain = await subjectFor({})
    expect(spoofed).toBe(plain)
  })

  it('x-real-ip does not, for the same reason', async () => {
    expect(await subjectFor({ 'x-real-ip': '198.51.100.98' })).toBe(await subjectFor({}))
  })

  it('but the platform address still does — or nobody is told apart', async () => {
    expect(await subjectFor({}, '203.0.113.7')).not.toBe(await subjectFor({}, '198.51.100.1'))
  })

  it('and x-vercel-forwarded-for wins over x-forwarded-for', async () => {
    // Vercel overwrites `x-forwarded-for` and does not forward external IPs
    // (their docs), so both are platform-written here — but the Vercel-specific
    // one is the one a trusted-proxy configuration could never loosen.
    const viaVercel = await subjectFor({ 'x-vercel-forwarded-for': '198.51.100.1' }, '203.0.113.7')
    const direct = await subjectFor({}, '198.51.100.1')
    expect(viaVercel).toBe(direct)
  })
})

describe('failure is open, and says so', () => {
  const degraded = async (cfg: QuotaConfig, impl: typeof fetch) => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const v = await claimRun(req({ 'x-calc-run': 'run-token-0001' }), '/steel/beam', cfg, impl)
    const logged = spy.mock.calls.length
    spy.mockRestore()
    return { v, logged }
  }

  it('with no salt the gate is inert — allowed, but loudly', async () => {
    // The worst failure mode is a deployment where this silently never counts.
    // It cannot be silent.
    const { v, logged } = await degraded({ ...CFG, salt: undefined }, never)
    expect(v).toEqual({ ok: true, degraded: 'no-salt' })
    expect(logged).toBe(1)
  })

  it('a too-short salt counts as no salt, rather than hashing weakly', async () => {
    const { v } = await degraded({ ...CFG, salt: 'tooshort' }, never)
    expect(v.ok && v.degraded).toBe('no-salt')
  })

  it('with no client address, nobody is counted under one shared row', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = new Request('https://example.test/api/steel/beam', { method: 'POST' })
    const v = await claimRun(r, '/steel/beam', CFG, never)
    spy.mockRestore()
    expect(v).toEqual({ ok: true, degraded: 'no-subject' })
  })

  it('an unreachable database lets the calculator work', async () => {
    const boom = (async () => { throw new Error('ECONNREFUSED') }) as unknown as typeof fetch
    const { v } = await degraded(CFG, boom)
    expect(v).toEqual({ ok: true, degraded: 'rpc-unreachable' })
  })

  it('an HTTP error from PostgREST does too, tagged with the status', async () => {
    const { impl } = rpc({}, 500)
    const { v } = await degraded(CFG, impl)
    expect(v.ok && v.degraded).toBe('rpc-500')
  })

  it('an unrecognised payload does too, rather than being read as a refusal', async () => {
    const bad = (async () => new Response(JSON.stringify({ nope: 1 }), { status: 200 })) as unknown as typeof fetch
    const { v } = await degraded(CFG, bad)
    expect(v.ok && v.degraded).toBe('rpc-shape')
  })

  it('a full guest_trials table lets the visitor compute, and is reported', async () => {
    // The whole-table backstop tripped, so no new subject may open a row. The
    // function ALLOWS — a full table is our problem, not the visitor's — and
    // this must not be read as a refusal or the shop window closes on everyone
    // at once.
    const { impl } = rpc({ allowed: true, charged: false, used: 0, reason: 'table-full' })
    const { v, logged } = await degraded(CFG, impl)
    expect(v).toEqual({ ok: true, degraded: 'table-full' })
    expect(logged).toBe(1)
  })

  it('and issues no ticket for a run nothing charged for', async () => {
    // A ticket asserts "this run is paid for". Nothing was.
    const { impl } = rpc({ allowed: true, charged: false, used: 0, reason: 'table-full' })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const v = await claimRun(req({ 'x-calc-run': 'run-token-0001' }), '/steel/beam', CFG, impl)
    spy.mockRestore()
    expect(v.ok && v.ticket).toBeUndefined()
  })
})

describe('quotaConfig', () => {
  it('defaults the limit to the one the UI promises', () => {
    const c = quotaConfig({}, 'https://u', 'k')
    expect(c.limit).toBe(GUEST_TRIAL_LIMIT)
    expect(c.limit).toBe(5)
  })

  it('takes an override, and ignores nonsense rather than locking everyone out', () => {
    expect(quotaConfig({ GUEST_TRIAL_LIMIT: '10' }, 'u', 'k').limit).toBe(10)
    expect(quotaConfig({ GUEST_TRIAL_LIMIT: '0' }, 'u', 'k').limit).toBe(5)
    expect(quotaConfig({ GUEST_TRIAL_LIMIT: '-3' }, 'u', 'k').limit).toBe(5)
    expect(quotaConfig({ GUEST_TRIAL_LIMIT: 'lots' }, 'u', 'k').limit).toBe(5)
  })

  it('carries the salt through from the environment', () => {
    expect(quotaConfig({ GUEST_TRIAL_SALT: SALT }, 'u', 'k').salt).toBe(SALT)
  })
})
