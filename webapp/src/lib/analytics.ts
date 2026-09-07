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
 * string (deep links like `/model?project=…` stay distinguishable). In-page
 * anchors are not tracked: the hook keys on pathname + search, mirroring the
 * scroll-restoration logic in App, where a hash jump is not a navigation.
 */
export function trackPageView(pathname: string, search = ''): void {
  if (!hasGtag()) return
  window.gtag!('event', 'page_view', {
    page_path: `${pathname}${search}`,
    page_location: window.location.href,
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
