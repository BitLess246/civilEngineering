import { describe, it, expect, vi, afterEach } from 'vitest'
import { trackPageView, trackEvent } from './analytics'

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
