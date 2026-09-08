import { describe, it, expect, vi, afterEach } from 'vitest'
import { trackPageView, trackEvent, safeSearch, safeLocation } from './analytics'
import indexHtml from '../../index.html?raw'

// The suite runs under `environment: 'node'` — there is no `window` and no
// gtag snippet — so these also pin the guards that keep analytics importable
// from tests, SSR or an ad-blocked browser instead of throwing on first use.
const g = globalThis as { window?: unknown }

afterEach(() => { delete g.window })

describe('trackPageView', () => {
  it('is a no-op without a window rather than throwing', () => {
    expect(typeof g.window).toBe('undefined')
    expect(() => trackPageView('/model')).not.toThrow()
  })

  it('is a no-op when the gtag snippet never loaded (ad blocker)', () => {
    g.window = { location: { href: 'https://example.com/model' } }
    expect(() => trackPageView('/model')).not.toThrow()
  })

  it('forwards a page_view with page_path including the query string', () => {
    const gtag = vi.fn()
    g.window = { gtag, location: { href: 'https://example.com/model?project=7' } }
    trackPageView('/model', '?project=7')
    expect(gtag).toHaveBeenCalledWith('event', 'page_view', {
      page_path: '/model?project=7',
      page_location: 'https://example.com/model?project=7',
    })
  })

  it('never sends the session Supabase leaves in the URL', () => {
    // `authClient` builds its client with detectSessionInUrl, so a sign-in
    // redirect lands with the session in the address bar. The implicit flow
    // puts it in the FRAGMENT; PKCE returns `?code=`. Either one in an
    // analytics hit is a live credential handed to a third party.
    const gtag = vi.fn()
    g.window = { gtag, location: {
      href: 'https://example.com/model?project=7&code=abc#access_token=eyJ&refresh_token=r1&expires_in=3600',
    } }
    trackPageView('/model', '?project=7&code=abc')
    const [, , params] = gtag.mock.calls[0] as [string, string, Record<string, string>]
    for (const secret of ['access_token', 'refresh_token', 'eyJ', 'code=abc', 'r1']) {
      expect(`${params.page_location} ${params.page_path}`, secret).not.toContain(secret)
    }
    expect(params.page_location).toBe('https://example.com/model?project=7')
    expect(params.page_path).toBe('/model?project=7')
  })
})

describe('the credentials that never leave the app', () => {
  it('drops each one from a query string and keeps the rest', () => {
    expect(safeSearch('?project=7&code=abc&token_hash=zz')).toBe('?project=7')
    expect(safeSearch('?code=abc')).toBe('')
    expect(safeSearch('')).toBe('')
  })

  it('drops the fragment wholesale — nothing in it is ever wanted here', () => {
    expect(safeLocation('https://e.com/a?b=1#access_token=x')).toBe('https://e.com/a?b=1')
    expect(safeLocation('https://e.com/a#anything')).toBe('https://e.com/a')
  })

  it('reports a URL it cannot parse without its query or fragment', () => {
    // A truncated hit is a smaller mistake than a hit carrying a token.
    expect(safeLocation('not a url?code=abc#access_token=x')).toBe('not a url')
  })

  it('keeps index.html\'s inline snippet in step with this module', () => {
    // The gtag config call runs in <head>, before the bundle and before the
    // auth client — so it strips the URL itself, with its own copy of the
    // list. Two copies that can drift are worth one test.
    const inline = indexHtml.match(/var drop = \[([^\]]+)\]/)?.[1] ?? ''
    const named = [...inline.matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(named.length).toBeGreaterThan(0)
    // every name the module drops, the snippet drops too
    for (const k of ['access_token', 'refresh_token', 'provider_token', 'provider_refresh_token',
      'id_token', 'code', 'token', 'token_hash']) expect(named, k).toContain(k)
    expect(indexHtml).toContain("u.hash = ''")
  })
})

describe('trackEvent', () => {
  it('is a no-op without gtag', () => {
    expect(() => trackEvent('calc_run')).not.toThrow()
  })

  it('forwards the event name and params', () => {
    const gtag = vi.fn()
    g.window = { gtag, location: { href: 'https://example.com/' } }
    trackEvent('calc_run', { tool: 'frame' })
    expect(gtag).toHaveBeenCalledWith('event', 'calc_run', { tool: 'frame' })
  })
})
