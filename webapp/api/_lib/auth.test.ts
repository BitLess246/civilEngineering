// The endpoints' only gate. Its failure modes are the interesting part: a
// check that admits when the auth service is down, or that accepts a token it
// never verified, is not a check — and neither shows up as a crash.

import { describe, it, expect } from 'vitest'
import { authConfig, bearer, identify, type AuthConfig } from './auth'

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
    const calls: string[] = []
    const fake = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push(String(url))
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer member-token')
      return new Response(JSON.stringify({ id: 'user-1' }), { status: 200 })
    }) as unknown as typeof fetch
    await expect(identify('member-token', CFG, fake)).resolves.toEqual({ kind: 'member', userId: 'user-1' })
    expect(calls).toEqual(['https://proj.supabase.co/auth/v1/user'])
  })

  it('refuses a token Supabase rejects', async () => {
    const fake = (async () => new Response('no', { status: 401 })) as unknown as typeof fetch
    await expect(identify('forged', CFG, fake)).resolves.toBeNull()
  })

  it('refuses a 200 that carries no user id', async () => {
    // A body-shape change upstream must not be read as "authenticated".
    const fake = (async () => new Response(JSON.stringify({}), { status: 200 })) as unknown as typeof fetch
    await expect(identify('odd', CFG, fake)).resolves.toBeNull()
  })

  it('FAILS CLOSED when the auth service is unreachable', async () => {
    // The one that matters. An auth check that passes when the auth service is
    // down admits everybody exactly when you are least able to notice.
    const fake = (async () => { throw new Error('ECONNREFUSED') }) as unknown as typeof fetch
    await expect(identify('member-token', CFG, fake)).resolves.toBeNull()
  })

  it('fails closed on a malformed JSON body too', async () => {
    const fake = (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch
    await expect(identify('member-token', CFG, fake)).resolves.toBeNull()
  })
})
