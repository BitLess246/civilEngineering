/**
 * Per-route document title.
 *
 * `index.html` hard-codes one `<title>` for all 53 routes, so every tab,
 * bookmark and history entry read "Civil Engineering" — three open calculators
 * were indistinguishable, and a screen-reader user heard the same page title on
 * arrival at every tool. The route's own name is already in `ALL_TOOLS`, which
 * is what the sidebar and the ⌘K palette render, so the title comes from the
 * same source rather than a second list that could disagree with them.
 */
import { ALL_TOOLS } from './tools'
import { BRAND_MARK } from './brand'

/** Routes with no entry in the tool registry. */
const EXTRA: Record<string, string> = {
  '/': '',                                  // the landing page is the brand itself
  '/signin': 'Sign in',
  '/signup': 'Create account',
  '/forgot-password': 'Reset password',
  '/reset-password': 'Set a new password',
  '/profile': 'Account',
  '/terms': 'Terms',
  '/privacy': 'Privacy',
  '/refunds': 'Refunds',
  '/contact': 'Contact',
}

const SUFFIX = `${BRAND_MARK} Toolkit`

/**
 * What this route is CALLED — 'Beam Design', 'Sign in' — or null where nothing
 * names it. Longest prefix wins, so `/estimate/slab` picks its own entry rather
 * than `/estimate`'s.
 *
 * Separate from `titleFor` because the name has a second reader: the Suspense
 * fallback, which says what it is fetching. Trimming the brand suffix back off
 * a finished title would be string surgery on a format that is free to change.
 */
export function routeName(pathname: string): string | null {
  const exact = EXTRA[pathname]
  if (exact !== undefined) return exact || null

  let best: { len: number; name: string } | null = null
  for (const t of ALL_TOOLS) {
    if (pathname === t.to || pathname.startsWith(t.to + '/')) {
      if (!best || t.to.length > best.len) best = { len: t.to.length, name: t.name }
    }
  }
  return best?.name ?? null
}

/** The document title for a pathname: the route's name, then the brand. */
export function titleFor(pathname: string): string {
  const name = routeName(pathname)
  return name ? `${name} — ${SUFFIX}` : SUFFIX
}
