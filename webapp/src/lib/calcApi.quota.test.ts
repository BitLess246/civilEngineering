// What the CLIENT does with the gate. The endpoint's own tests prove it
// refuses; these prove the browser respects the refusal instead of quietly
// computing the answer itself, which is the one bug that would make the whole
// server-side gate ornamental.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { calcBeam } from './calcApi'
import { TrialExhaustedError, startRun, resetRun, ticketFor } from './calcRun'
import { TRIAL_ROUTE } from './calcRoutes'

const INPUT = { shapeName: 'W310x38.7', Fy: 345, span: 6, Lb: 2, Cb: 1, wDead: 15, wLive: 25 }

// `calcToken()` needs a configured auth client to send anything at all; without
// one it takes the local-fallback path and never reaches the network.
vi.mock('./auth/authClient', () => ({
  isAuthConfigured: () => true,
  getClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }),
}))

let calls: { headers: Headers; url: string }[]
const original = globalThis.fetch

const respond = (make: (n: number) => Response) => {
  calls = []
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), headers: new Headers(init?.headers) })
    return make(calls.length)
  }) as typeof fetch
}

beforeEach(() => {
  // Without an anon key `calcToken()` returns null and every call takes the
  // local-fallback path without touching the network — which would make each
  // assertion below vacuously pass on zero requests.
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')
  resetRun()
  startRun()
})
afterEach(() => { globalThis.fetch = original; vi.unstubAllEnvs() })

describe('a refused calculation', () => {
  it('throws TrialExhaustedError rather than falling back to the browser', async () => {
    // THE TEST THAT MATTERS. A 402 answered by computing locally would mean the
    // gate is bypassed by its own client on the very request it refused.
    respond(() => new Response(
      JSON.stringify({ error: 'trial-exhausted', route: '/steel/beam', used: 5 }), { status: 402 }))
    await expect(calcBeam(INPUT)).rejects.toBeInstanceOf(TrialExhaustedError)
    expect(calls).toHaveLength(1)      // no second, local attempt
  })

  it('carries the route and count the server named', async () => {
    respond(() => new Response(
      JSON.stringify({ error: 'trial-exhausted', route: '/steel/beam', used: 5 }), { status: 402 }))
    await expect(calcBeam(INPUT)).rejects.toMatchObject({ route: '/steel/beam', used: 5 })
  })

  it('still identifies the route when the body is unreadable', async () => {
    respond(() => new Response('<html>gateway</html>', { status: 402 }))
    await expect(calcBeam(INPUT)).rejects.toMatchObject({ route: TRIAL_ROUTE.beam })
  })
})

describe('what the client sends', () => {
  const ok = () => new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'x-calc-ticket': 'ticket-xyz' },
  })

  it('tags every request with the run token', async () => {
    respond(ok)
    await calcBeam(INPUT)
    expect(calls[0].headers.get('x-calc-run')).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
  })

  it('sends the SAME token for repeated recomputes of one arrival', async () => {
    // Which is what makes a run cost one charge rather than one per keystroke.
    respond(ok)
    await calcBeam(INPUT)
    await calcBeam({ ...INPUT, span: 7 })
    await calcBeam({ ...INPUT, span: 8 })
    const tokens = new Set(calls.map((c) => c.headers.get('x-calc-run')))
    expect(tokens.size).toBe(1)
  })

  it('sends a different token after the next arrival', async () => {
    respond(ok)
    await calcBeam(INPUT)
    startRun()
    await calcBeam(INPUT)
    expect(calls[0].headers.get('x-calc-run')).not.toBe(calls[1].headers.get('x-calc-run'))
  })

  it('replays the ticket the server issued, so later requests skip its database', async () => {
    respond(ok)
    await calcBeam(INPUT)
    expect(calls[0].headers.get('x-calc-ticket')).toBeNull()   // none to send yet
    expect(ticketFor(TRIAL_ROUTE.beam)).toBe('ticket-xyz')
    await calcBeam({ ...INPUT, span: 7 })
    expect(calls[1].headers.get('x-calc-ticket')).toBe('ticket-xyz')
  })

  it('does not send a ticket belonging to another calculator', async () => {
    respond(ok)
    await calcBeam(INPUT)
    expect(ticketFor(TRIAL_ROUTE.column)).toBeUndefined()
  })
})

describe('the fallback still covers a missing deployment', () => {
  it('404 computes in-browser, because a 404 means the endpoint is not there', async () => {
    // Unlike 402, this one is not a refusal — it is an absence, and falling
    // back keeps the site working rather than routing around a decision.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    respond(() => new Response('not found', { status: 404 }))
    const res = await calcBeam(INPUT)
    warn.mockRestore()
    expect(res.avail.Mn).toBeGreaterThan(150)
  })
})
