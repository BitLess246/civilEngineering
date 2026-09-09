// ─────────────────────────────────────────────────────────────────────────
// WHICH ORIGINS MAY DRIVE A WRITE.
//
// `_shared/cors.ts` argues, correctly, that `*` is right for the billing
// endpoints: they carry no ambient authority, so every one of them needs a
// bearer token that only the signed-in tab holds, and a hostile page gains
// nothing it could not already do. That file also says the decision has to be
// revisited the moment an endpoint starts accepting ambient authority.
//
// `guest-quota` is that endpoint, and it always was. Its subject is a salted
// digest of the CLIENT IP — which the browser supplies automatically, exactly
// like a cookie. So the wildcard's own justification does not hold there: a
// third-party page CAN do something it otherwise could not, namely spend a
// visitor's free trial on a site the visitor has never opened. `peek` is
// harmless (it reveals the caller's own count, to the caller); `consume`
// writes.
//
// WHAT THIS IS AND IS NOT. CORS is enforced by browsers. curl sends any Origin
// it likes, or none, so this stops the DRIVE-BY case — a hostile page burning
// its own visitors' trials — and not a determined script. That is the threat
// the audit described, and the counter has never claimed to be more: see the
// header of `guest-quota/index.ts`, which says in full why this is not a
// security boundary.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Parse an allowlist from a comma- or whitespace-separated env value.
 *
 * Entries are origins (`https://example.com`) or a single-label wildcard
 * (`https://*.vercel.app`), which is what makes preview deployments workable —
 * pinning exact origins would need an edit per preview, which is why the
 * endpoint reached for `*` in the first place.
 */
export function parseOrigins(raw: string | undefined | null): string[] {
  if (!raw) return []
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim().replace(/\/+$/, '').toLowerCase())
    .filter((s) => s.length > 0)
}

/**
 * Is `origin` allowed by `patterns`?
 *
 * A wildcard matches ONE label and only in the leftmost position, so
 * `https://*.vercel.app` admits `https://foo.vercel.app` but not
 * `https://a.b.vercel.app` and not `https://evil-vercel.app`. The scheme must
 * match exactly — `http://` is never admitted by an `https://` entry.
 */
export function originAllowed(origin: string | null | undefined, patterns: string[]): boolean {
  if (!origin) return false
  const o = origin.trim().replace(/\/+$/, '').toLowerCase()
  // A literal "null" is what a sandboxed iframe or a file:// page sends. It is
  // an origin no allowlist can meaningfully name, so it is never admitted.
  if (o === '' || o === 'null') return false
  for (const p of patterns) {
    if (p === o) return true
    const star = p.indexOf('*.')
    if (star === -1) continue
    // Split as scheme + "*." + suffix, e.g. https:// | *. | vercel.app
    const scheme = p.slice(0, star)
    const suffix = p.slice(star + 2)
    if (!scheme.endsWith('//') || suffix.length === 0) continue
    if (!o.startsWith(scheme)) continue
    const host = o.slice(scheme.length)
    if (!host.endsWith(`.${suffix}`)) continue
    const label = host.slice(0, host.length - suffix.length - 1)
    // Exactly one label, and a real one.
    if (label.length > 0 && !label.includes('.')) return true
  }
  return false
}

/**
 * The `access-control-allow-origin` value for a request.
 *
 * An allowlisted origin is reflected VERBATIM — the header has to echo what
 * the browser sent, not a normalised copy of it — and everything else gets the
 * wildcard, which is all `peek` needs. Any response built with this must also
 * carry `Vary: Origin`, or a shared cache will hand one visitor's reflected
 * origin to the next.
 *
 * Never emit `access-control-allow-credentials` alongside this: a reflected
 * origin plus credentials is the combination that turns a CORS relaxation into
 * a real one.
 */
export function corsOrigin(origin: string | null | undefined, patterns: string[]): string {
  return originAllowed(origin, patterns) ? (origin as string) : '*'
}
