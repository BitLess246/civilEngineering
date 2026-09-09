// The endpoints' only gate. Its failure modes are the interesting part: a
// check that admits when the auth service is down, or that accepts a token it
// never verified, is not a check — and neither shows up as a crash.

import { describe, it, expect } from 'vitest'
import { authConfig, bearer, identify, couldBeJwt, type AuthConfig } from './auth'

/** A structurally real JWT with the given payload. Unsigned — nothing in this
 *  module verifies signatures, which is precisely the gap S5's second half
 *  names, and the tests below say so rather than implying otherwise. */
const b64u = (o: unknown) =>
  btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = (payload: Record<string, unknown>) =>
  `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u(payload)}.c2ln`
/** A live member token, the shape a real Supabase session hands over. */
const LIVE = () => jwt({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 3600 })

const CFG: AuthConfig = { supabaseUrl: 'https://proj.supabase.co', anonKey: 'anon-key-abc' }

describe('authConfig', () => {
  it('accepts either spelling, preferring the unprefixed server one', () => {
    expect(authConfig({ SUPABASE_URL: 'a', SUPABASE_ANON_KEY: 'b' }))
      .toEqual({ supabaseUrl: 'a', anonKey: 'b' })
    expect(authConfig({ VITE_SUPABASE_URL: 'a', VITE_SUPABASE_ANON_KEY: 'b' }))
      .toEqual({ supabaseUrl: 'a', anonKey: 'b' })
    expect(authConfig({ SUPABASE_URL: 'server', VITE_SUPABASE_URL: 'client', SUPABASE_ANON_KEY: 'k' }))
      .toEqual({ supabaseUrl: 'server', anonKey: 'k' })
  })

  it('is null when either half is missing, so the endpoint can 503', () => {
    // Half-configured is the dangerous shape: a URL with no key would otherwise
    // let every token fail open or closed depending on the next branch.
    expect(authConfig({})).toBeNull()
    expect(authConfig({ SUPABASE_URL: 'a' })).toBeNull()
    expect(authConfig({ SUPABASE_ANON_KEY: 'b' })).toBeNull()
    expect(authConfig({ SUPABASE_URL: '', SUPABASE_ANON_KEY: 'b' })).toBeNull()
  })
})

describe('bearer', () => {
  it('extracts the token, case-insensitively on the scheme', () => {
    expect(bearer('Bearer abc.def.ghi')).toBe('abc.def.ghi')
    expect(bearer('bearer abc')).toBe('abc')
    expect(bearer('  Bearer   abc  ')).toBe('abc')
  })

  it('rejects anything that is not a bearer token', () => {
    expect(bearer(null)).toBeNull()
    expect(bearer('')).toBeNull()
    expect(bearer('abc')).toBeNull()            // no scheme
    expect(bearer('Basic abc')).toBeNull()      // wrong scheme
    expect(bearer('Bearer')).toBeNull()         // no token
    expect(bearer('Bearer    ')).toBeNull()     // whitespace only
  })
})

describe('identify', () => {
  const never = (() => { throw new Error('should not have been called') }) as unknown as typeof fetch

  it('recognises the anon key WITHOUT a round trip', () => {
    // Every guest calculation would otherwise pay a call to Supabase that can
    // only ever answer "not a user".
    return expect(identify(CFG.anonKey, CFG, never)).resolves.toEqual({ kind: 'guest' })
  })

  it('introspects a member token and returns the user id', async () => {
    // A REAL member token is a JWT, which is what this fixture now is. It used
    // to be the bare string 'member-token' — which no Supabase session ever
    // produces, so the test was passing a shape the endpoint cannot receive.
    const token = jwt({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 3600 })
    const calls: string[] = []
    const fake = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push(String(url))
      expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${token}`)
      return new Response(JSON.stringify({ id: 'user-1' }), { status: 200 })
    }) as unknown as typeof fetch
    await expect(identify(token, CFG, fake)).resolves.toEqual({ kind: 'member', userId: 'user-1' })
    expect(calls).toEqual(['https://proj.supabase.co/auth/v1/user'])
  })

  it('refuses a well-formed token Supabase rejects — and DOES ask', async () => {
    // The forged-signature case: structurally a JWT, so the screen cannot
    // judge it and the network must. This is the gap `couldBeJwt` does not
    // close, pinned so it is not mistaken for closed.
    let asked = 0
    const fake = (async () => { asked++; return new Response('no', { status: 401 }) }) as unknown as typeof fetch
    const forged = jwt({ sub: 'nobody', exp: Math.floor(Date.now() / 1000) + 3600 })
    await expect(identify(forged, CFG, fake)).resolves.toBeNull()
    expect(asked).toBe(1)
  })

  // ───────────────────────────────────────────────────────────────────────
  // S5, first half — garbage must not be amplified into our auth endpoint.
  // ───────────────────────────────────────────────────────────────────────
  describe('the structural screen in front of the round trip', () => {
    const never = (() => { throw new Error('should not have been called') }) as unknown as typeof fetch

    it('refuses what cannot be a JWT without asking Supabase', async () => {
      for (const junk of [
        'member-token',            // not a JWT at all
        '', 'a', 'a.b',            // too few segments
        'a.b.c.d',                 // too many
        'a..c',                    // empty segment
        '!!.@@.##',                // not base64url
        'aGk.bm90LWpzb24.sig',     // payload is not JSON
      ]) {
        await expect(identify(junk, CFG, never)).resolves.toBeNull()
      }
    })

    it('refuses an expired token without asking, but allows for clock skew', async () => {
      const now = Date.now()
      const at = (deltaSec: number) => jwt({ sub: 'u', exp: Math.floor(now / 1000) + deltaSec })
      // Long expired — Supabase would reject it too, so refusing locally
      // cannot change any outcome.
      await expect(identify(at(-3600), CFG, never, now)).resolves.toBeNull()
      // Only just expired: still asked, because OUR clock may be the fast one
      // and the token may be live at the server.
      let asked = 0
      const fake = (async () => { asked++; return new Response(JSON.stringify({ id: 'u' }), { status: 200 }) }) as unknown as typeof fetch
      await expect(identify(at(-30), CFG, fake, now)).resolves.toEqual({ kind: 'member', userId: 'u' })
      expect(asked).toBe(1)
    })

    it('never admits anything the screen alone could not justify', () => {
      // The screen may only REJECT. A token with no `exp` is not ours to
      // judge — Supabase decides — so it passes the screen and is asked about.
      expect(couldBeJwt(jwt({ sub: 'u' }))).toBe(true)
      expect(couldBeJwt(jwt({ sub: 'u', exp: Math.floor(Date.now() / 1000) + 60 }))).toBe(true)
    })
  })

  it('refuses a 200 that carries no user id', async () => {
    // A body-shape change upstream must not be read as "authenticated".
    const fake = (async () => new Response(JSON.stringify({}), { status: 200 })) as unknown as typeof fetch
    await expect(identify(LIVE(), CFG, fake)).resolves.toBeNull()
  })

  it('FAILS CLOSED when the auth service is unreachable', async () => {
    // The one that matters. An auth check that passes when the auth service is
    // down admits everybody exactly when you are least able to notice.
    const fake = (async () => { throw new Error('ECONNREFUSED') }) as unknown as typeof fetch
    // A LIVE-looking token, so this exercises the network failure and not the
    // structural screen in front of it.
    await expect(identify(LIVE(), CFG, fake)).resolves.toBeNull()
  })

  it('fails closed on a malformed JSON body too', async () => {
    const fake = (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch
    await expect(identify(LIVE(), CFG, fake)).resolves.toBeNull()
  })
})
