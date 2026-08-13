import { describe, it, expect } from 'vitest'
import { corsHeaders, preflight, jsonWithCors } from './cors'

describe('preflight', () => {
  // The bug this file exists to fix: an OPTIONS that falls through to the
  // method check gets 405 with no allow-origin, the browser refuses to send the
  // real request, and the page reports a generic failure with nothing in the
  // logs — because the call never left the tab.
  it('answers a preflight instead of letting it reach the method check', () => {
    const res = preflight(new Request('https://x/functions/v1/billing-portal', { method: 'OPTIONS' }))!
    expect(res).not.toBeNull()
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('lets a real request through untouched', () => {
    for (const method of ['POST', 'GET', 'PATCH', 'DELETE']) {
      expect(preflight(new Request('https://x', { method })), method).toBeNull()
    }
  })
})

describe('corsHeaders', () => {
  // supabase-js sends all four; omitting one makes the preflight fail on a
  // header the caller never chose to send.
  it('allows every header supabase-js sends', () => {
    const allowed = corsHeaders['access-control-allow-headers'].split(',').map((h) => h.trim())
    for (const h of ['authorization', 'x-client-info', 'apikey', 'content-type']) {
      expect(allowed, h).toContain(h)
    }
  })

  it('allows the methods these functions actually serve, and no others', () => {
    const methods = corsHeaders['access-control-allow-methods'].split(',').map((m) => m.trim())
    expect(methods.sort()).toEqual(['OPTIONS', 'POST'])
  })

  // A wildcard is safe ONLY while these endpoints take a bearer token and no
  // cookies: it grants a hostile page nothing it could not already do. If
  // credentials are ever allowed, both halves have to change together.
  it('does not allow credentials alongside the wildcard origin', () => {
    expect(corsHeaders['access-control-allow-origin']).toBe('*')
    expect(corsHeaders['access-control-allow-credentials']).toBeUndefined()
  })
})

describe('jsonWithCors', () => {
  it('carries the CORS headers on a normal response', async () => {
    const res = jsonWithCors({ url: 'https://paddle.example' })
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(await res.json()).toEqual({ url: 'https://paddle.example' })
  })

  // An error the browser cannot read is an error the page cannot explain, so
  // the failures need the headers just as much as the successes do.
  it('carries them on a failure too', async () => {
    const res = jsonWithCors({ error: 'no-customer' }, 404)
    expect(res.status).toBe(404)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(await res.json()).toEqual({ error: 'no-customer' })
  })
})
