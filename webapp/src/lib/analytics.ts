// Google Analytics 4 — page views for the SPA, plus a generic event helper.
//
// The gtag.js snippet lives in index.html and its `gtag('config', …)` call
// counts the INITIAL load with the real URL, before React has done anything.
// That matters: if the bundle fails to boot, analytics still sees the visit.
//
// What config does NOT see is SPA navigation — react-router swaps views without
// the browser ever loading a new document, so every route change after the
// first would be invisible to GA4. usePageViews() below closes that gap: it
// fires one `page_view` per pathname change and deliberately SKIPS the first
// render, which the config call already counted. Without that skip, every
// landing would be counted twice.
//
// gtag itself is defined synchronously by the inline snippet, so calls made
// before the async googletagmanager script arrives are simply queued in
// window.dataLayer — nothing is lost. If the snippet is absent entirely
// (ad blocker, tests, SSR) every call here is a no-op, and the app neither
// knows nor cares.

import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * URL parameters that carry a CREDENTIAL, and never go to analytics.
 *
 * Supabase completes a sign-in through the URL — `authClient` builds its client
 * with `detectSessionInUrl: true` — so for the moments between the redirect
 * landing and the client stripping it, the address bar holds the session
 * itself: the implicit flow returns `#access_token=…&refresh_token=…`, PKCE
 * returns `?code=…`, and the email links carry `token_hash`. Sent to GA4 that
 * is a live credential handed to a third party, and the strip is not something
 * this module can wait for: `getClient()` is lazy, so it may not have run yet.
 *
 * The fragment goes wholesale rather than by name — nothing in it is ever
 * wanted here (a hash jump is not a navigation, which is the same reason
 * `usePageViews` keys on pathname + search).
 */
const CREDENTIAL_PARAMS = [
  'access_token', 'refresh_token', 'provider_token', 'provider_refresh_token',
  'id_token', 'code', 'token', 'token_hash',
]

/** A query string with the credentials taken out — `''` when none is left. */
export function safeSearch(search: string): string {
  if (!search) return ''
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  for (const k of CREDENTIAL_PARAMS) q.delete(k)
  const rest = q.toString()
  return rest ? `?${rest}` : ''
}

/**
 * The page URL as analytics may see it: no fragment, no credentials.
 *
 * A URL it cannot parse is reported as its origin-and-path prefix, because a
 * hit with a truncated URL is a smaller mistake than a hit with a token in it.
 */
export function safeLocation(href: string): string {
  try {
    const u = new URL(href)
    u.hash = ''
    for (const k of CREDENTIAL_PARAMS) u.searchParams.delete(k)
    return u.toString()
  } catch {
    return href.split(/[?#]/)[0] ?? ''
  }
}

type GtagFn = (...args: unknown[]) => void

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: GtagFn
  }
}

/** True when the gtag snippet is present — guards tests, SSR and ad blockers. */
function hasGtag(): boolean {
  return typeof window !== 'undefined' && typeof window.gtag === 'function'
}

/**
 * Send a `page_view` for one SPA route change.
 *
 * `page_path` is what GA4's page report groups on, so it carries the query
 * string (deep links like `/model?project=…` stay distinguishable) — less any
 * `CREDENTIAL_PARAMS`, and never the fragment. In-page anchors are not tracked
 * either: the hook keys on pathname + search, mirroring the scroll-restoration
 * logic in App, where a hash jump is not a navigation.
 */
export function trackPageView(pathname: string, search = ''): void {
  if (!hasGtag()) return
  window.gtag!('event', 'page_view', {
    page_path: `${pathname}${safeSearch(search)}`,
    page_location: safeLocation(window.location.href),
  })
}

/**
 * Send a custom GA4 event — e.g. which tools visitors actually run.
 *
 * Reserved for future call sites (calc runs, plan exports, sign-ups); kept
 * next to trackPageView so the first feature-instrumentation commit has
 * somewhere to go that isn't `window.gtag` roulette.
 */
export function trackEvent(name: string, params: Record<string, unknown> = {}): void {
  if (!hasGtag()) return
  window.gtag!('event', name, params)
}

/**
 * Fire a `page_view` on every route change after the first.
 *
 * Mounted once at the app root (App.tsx), which sits inside BrowserRouter and
 * sees navigation for the home route and the workbench shell alike. The
 * skip-first guard is the same shape as useScrollTopOnChange, but the reason
 * is different: scrolling twice is harmless, counting the landing twice
 * inflates every number the dashboard shows.
 */
export function usePageViews(): void {
  const { pathname, search } = useLocation()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    trackPageView(pathname, search)
  }, [pathname, search])
}
