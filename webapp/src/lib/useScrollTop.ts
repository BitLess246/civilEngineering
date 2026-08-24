// Scroll-to-top on navigation — for tab panels and for route changes.
//
// Neither happens for free. A tab is state, not navigation, so the browser has
// no reason to move the viewport; and react-router deliberately does NOT reset
// scroll on a route change, leaving that to the app. The result either way is
// the same: you read to the bottom of a long panel, switch, and land in the
// middle of the next one with no idea you are not at its top.
//
// Instant rather than smooth, deliberately. A smooth scroll from deep in a long
// schedule takes long enough to read as lag, and it animates past content the
// user did not ask to see. `prefers-reduced-motion` is moot for an instant jump.

import { useEffect, useRef } from 'react'

/** Jump the window to the top. Safe to call outside a browser (tests, SSR). */
export function scrollTop(): void {
  if (typeof window === 'undefined') return
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
}

/**
 * Scroll to the top whenever `key` changes — but NOT on first render.
 *
 * The mount skip matters: without it, every page carrying this hook would yank
 * the viewport to the top on arrival, which fights deep links and any restore
 * the browser does on a back-navigation.
 */
export function useScrollTopOnChange(key: unknown): void {
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    scrollTop()
  }, [key])
}
