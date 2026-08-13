// ─────────────────────────────────────────────────────────────────────────
// WHO IS THIS GUEST? — the Edge-function copy.
//
// The canonical prose lives in `supabase/functions/_shared/guestSubject.ts`
// and is worth reading: what the digest is derived from, what it deliberately
// does NOT probe, what it costs (an office behind one NAT shares an
// allowance), and why an unsalted hash of an IPv4 address is not anonymous.
//
// WHY THERE ARE TWO COPIES. The Supabase function is Deno and imports with
// explicit `.ts` specifiers; this one is deployed by Vercel, which uploads only
// `webapp/`, so a file outside that directory is not there at runtime. Rather
// than let the two drift — which is exactly the failure `guestSubject.ts` warns
// about for the route list — `subject.test.ts` runs BOTH implementations over a
// matrix of addresses, user agents and salts and fails if any answer differs.
// The copy is allowed to exist; it is not allowed to diverge.
//
// Both halves must agree because they key the SAME table rows: the browser's
// `guest-quota` calls and this endpoint's claims have to land on one subject,
// or a visitor would get one allowance per code path.
// ─────────────────────────────────────────────────────────────────────────

/** Longest route string we will store. Longer is a client bug or an abuse attempt. */
export const ROUTE_MAX_LEN = 64

/** Distinct routes tracked per subject before we stop opening new rows. */
export const ROUTE_CAP_PER_SUBJECT = 60

/** A salt too short to be worth having. 24 chars ≈ 96 bits of hex. */
export const MIN_SALT_LEN = 24

/**
 * The client's address, from the headers the PLATFORM sets.
 *
 * Only two headers are consulted, and the order is the point.
 *
 * `x-vercel-forwarded-for` is written by Vercel's edge and cannot be set by a
 * caller, so it is preferred wherever it exists. `x-forwarded-for` is the
 * fallback and is also platform-written on both deployments — Vercel's docs are
 * explicit that it "overwrites this header and does not forward external IPs to
 * prevent spoofing", except on Enterprise with a trusted proxy configured. It
 * is a CHAIN — `client, proxy1, proxy2` — and the client is the FIRST entry;
 * taking the last one, a common slip, keys every visitor behind the same proxy
 * to one subject.
 *
 * `cf-connecting-ip` and `x-real-ip` USED TO BE CONSULTED and no longer are.
 * Nothing in front of either deployment sets them — there is no Cloudflare and
 * no nginx in this path — so the only way either could arrive is from the
 * caller. A fallback that can only ever return an attacker-chosen value is not
 * a fallback; it is a way to mint a fresh subject per request by sending one
 * extra header.
 *
 * Null when no platform header carries an address; the caller decides what to
 * do rather than filing everyone under an empty string.
 */
export function clientIp(headers: Headers): string | null {
  for (const h of ['x-vercel-forwarded-for', 'x-forwarded-for']) {
    const chain = headers.get(h)
    const first = chain?.split(',')[0]?.trim()
    if (first) return first
  }
  return null
}

// THE USER-AGENT USED TO BE PART OF THE SUBJECT, AND IS NOT ANY MORE.
//
// It was folded in as a coarse `engine/platform` token — `chrome/windows`,
// `safari/mac` — six engines by six platforms. The intent was fairness: an
// office behind one NAT would get an allowance per browser family rather than
// one between everybody.
//
// The problem is that the User-Agent is chosen by the caller, in full. Those
// thirty-six buckets are thirty-six subjects available to anyone willing to
// edit one header, so the five-run allowance was really a hundred-and-eighty-run
// allowance, and the row count this table can be made to grow was multiplied by
// the same factor. A value the client picks cannot be part of a key that
// decides what the client is allowed to do.
//
// The cost of removing it is the one the module header already accepts and
// states: an office behind one NAT now shares five runs between everybody
// rather than five per browser family. That is a real cost to a handful of
// visitors, and it is smaller than a 36× bypass available from devtools.
//
// The digest therefore covers the salt and the address only. Removing an input
// changes every digest, which hands existing guests one fresh allowance — see
// the note in `20260813010000_guest_run_caps.sql` about why now is the moment
// this is free.

/**
 * Normalised route key, or null when it is not a plausible route.
 *
 * Shape only — the list of which routes are free lives in
 * `src/lib/trialQuota.ts`. What is enforced here is that the route column
 * cannot be used as free storage.
 */
export function normalizeRoute(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const path = raw.split('?')[0].split('#')[0].trim()
  if (!path.startsWith('/') || path.length > ROUTE_MAX_LEN) return null
  if (!/^\/[a-z0-9/-]*$/i.test(path)) return null
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}

/** Whether a configured salt is strong enough to be used at all. */
export const saltUsable = (salt: string | undefined | null): salt is string =>
  typeof salt === 'string' && salt.trim().length >= MIN_SALT_LEN

/**
 * The subject key: a salted SHA-256 over the client address.
 *
 * EVERY INPUT HERE IS SET BY THE PLATFORM OR BY US. The salt lives in the
 * server environment; the address comes from a header the edge writes. Nothing
 * the caller chooses reaches this function, which is the property that makes
 * the digest a boundary rather than a suggestion — see the note above about
 * the User-Agent, which was an input and no longer is.
 *
 * The 64-hex output is what `claim_guest_run` checks the length of, and the
 * only thing that ever reaches the database — never the address itself.
 *
 * THE SEPARATOR IS A NUL AND MUST STAY ONE. It is written `\0` rather than
 * pasted as a raw byte (which is how the Deno original had it — invisible in a
 * diff, and enough to make `grep` call the file binary). Any change to the
 * separator changes every digest, which does not fail: it silently hands every
 * existing guest a brand-new subject and a fresh allowance. `subject.test.ts`
 * pins both halves together so that cannot happen quietly.
 */
export async function subjectHash(salt: string, ip: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}\0${ip}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
