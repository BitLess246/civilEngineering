/**
 * ?embed=1 — the shared definition of the embed flag.
 *
 * Model Space is iframed into the landing page as a scaled-down preview of
 * itself, with `?embed=1` on the iframe's address. The flag puts the page into
 * a read-only demo mode: the shell goes inert, persistence is suppressed, a
 * demo frame is generated on mount, and the idle camera starts orbiting (see
 * `EMBED` in ModelSpace.tsx, plus the matching branches in AppShell and App).
 *
 * Three components read the flag off a location, so the parse lives here
 * rather than being re-typed — a second spelling of "embed is on" is how the
 * preview ends up half-locked.
 *
 * THE FLAG IS SCOPED TO ONE ROUTE, and that is load-bearing rather than tidy.
 * The flag is also RequireAuth's bypass: the embed is a demo poster, and a
 * poster that renders a sign-in form is not a demo, so the gate steps aside for
 * it. But the lockdown that makes the bypass safe — no persistence, inert
 * shell, only the viewport and the walkthrough live — lives in `EMBED` inside
 * ModelSpace.tsx and NOWHERE else. On the query string alone the bypass would
 * therefore open every other route behind `RequireAuth` (soils, estimating,
 * scheduling, the seismic wizard) with no lockdown at all, past the plan gate
 * and past the trial quota, whose only enforcement point is that same
 * component. Matching the path as well is what keeps the public door attached
 * to the page that was built to be public.
 */

/** The one route the embed preview exists for — the only page carrying `EMBED`. */
export const EMBED_ROUTE = '/model'

/** Does this query string carry the flag? The parse, with no opinion on route. */
export function isEmbedSearch(search: string): boolean {
  return new URLSearchParams(search).get('embed') === '1'
}

/**
 * Is this location the embed preview? Flag AND route — see the note above on
 * why the route half is not optional. This is the predicate every consumer
 * should use; `isEmbedSearch` alone answers a narrower question.
 */
export function isEmbedLocation(loc: { pathname: string; search: string }): boolean {
  return loc.pathname === EMBED_ROUTE && isEmbedSearch(loc.search)
}
