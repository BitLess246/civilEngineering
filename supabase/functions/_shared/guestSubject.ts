// ─────────────────────────────────────────────────────────────────────────
// WHO IS THIS GUEST? — deriving a stable, non-reversible subject key for a
// visitor who has no account.
//
// The problem this solves: the trial counter used to live only in
// localStorage, so clearing site data handed out a fresh allowance. Anything
// the browser stores, the browser can drop. To survive that, the count has to
// live server-side, which means the server needs a key to count against.
//
// WHAT WE USE. Only request metadata the server already receives: the client
// IP and a COARSE browser/platform token from the User-Agent. Nothing is asked
// of the page — no canvas hash, no screen size, no timezone, no font probing.
// That is a deliberate limit: those signals identify a person more precisely
// than a quota on a free calculator could ever justify.
//
// WHAT THAT COSTS, stated plainly rather than discovered later:
//   • An office behind one NAT shares an allowance per browser family. Five
//     engineers on identical Chrome/Windows laptops get five runs between them.
//   • A different browser, a VPN, or a phone on mobile data is a new subject.
// So this stops "clear the cache and start over", which is what it is for. It
// is not, and cannot be, proof of identity.
//
// WHY IT IS SALTED. sha256(ip) is NOT anonymous: IPv4 is 2^32 values and a
// laptop enumerates the whole space in minutes. Without a secret salt the
// stored digests are just IP addresses in a costume. The function refuses to
// run rather than fall back to an unsalted or default-salted hash.
// ─────────────────────────────────────────────────────────────────────────

/** Longest route string we will store. Anything longer is a client bug or an abuse attempt. */
export const ROUTE_MAX_LEN = 64

/** Distinct routes tracked per subject before we stop opening new rows. */
export const ROUTE_CAP_PER_SUBJECT = 60

/**
 * The client's address, from the headers the PLATFORM sets.
 *
 * Only two headers are consulted, and the order is the point.
 *
 * `x-vercel-forwarded-for` is written by Vercel's edge and cannot be set by a
 * caller, so it is preferred wherever it exists — it is absent here on Supabase
 * and present on the Vercel half, and both halves must answer identically for
 * any given set of headers. `x-forwarded-for` is the fallback and is also
 * platform-written on both deployments; Vercel's docs are explicit that it
 * "overwrites this header and does not forward external IPs to prevent
 * spoofing", except on Enterprise with a trusted proxy configured. It is a
 * CHAIN — `client, proxy1, proxy2` — and the client is the FIRST entry; taking
 * the last one, a common slip, keys every visitor behind the same proxy to one
 * subject.
 *
 * `cf-connecting-ip` and `x-real-ip` USED TO BE CONSULTED and no longer are.
 * Nothing in front of either deployment sets them — there is no Cloudflare and
 * no nginx in this path — so the only way either could arrive is from the
 * caller. A fallback that can only ever return an attacker-chosen value is not
 * a fallback; it is a way to mint a fresh subject per request by sending one
 * extra header.
 *
 * Returns null when no platform header carries an address; the caller must
 * decide what to do about that rather than counting everyone under an empty
 * string.
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
// `safari/mac` — six engines by six platforms. The intent was the fairness this
// module's header describes: an office behind one NAT would get an allowance
// per browser family rather than one between everybody.
//
// The problem is that the User-Agent is chosen by the caller, in full. Those
// thirty-six buckets are thirty-six subjects available to anyone willing to
// edit one header, so the five-run allowance was really a hundred-and-eighty-run
// allowance, and the row count this table can be made to grow was multiplied by
// the same factor. A value the client picks cannot be part of a key that
// decides what the client is allowed to do.
//
// The cost is the one this module already accepts and states plainly: an office
// behind one NAT now shares five runs between everybody rather than five per
// browser family. That is a real cost to a handful of visitors, and it is
// smaller than a 36× bypass available from devtools.

/**
 * Normalised route key, or null when it is not a plausible route.
 *
 * The server does NOT hold the list of trial routes — that list lives in
 * `webapp/src/lib/trialQuota.ts` and having a second copy here is how the two
 * drift until a route is free on one side and gated on the other. What the
 * server enforces instead is SHAPE: a leading slash, a sane length, and a
 * conservative charset, so the route column cannot be used as free storage.
 */
export function normalizeRoute(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const path = raw.split('?')[0].split('#')[0].trim()
  if (!path.startsWith('/') || path.length > ROUTE_MAX_LEN) return null
  if (!/^\/[a-z0-9/-]*$/i.test(path)) return null
  // '/beam-design/' and '/beam-design' are the same page and must share a row.
  return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
}

/**
 * The subject key: a salted SHA-256 over the client address.
 *
 * EVERY INPUT HERE IS SET BY THE PLATFORM OR BY US. The salt lives in the
 * function's secrets; the address comes from a header the edge writes. Nothing
 * the caller chooses reaches this function, which is the property that makes
 * the digest a boundary rather than a suggestion — see the note above about
 * the User-Agent, which was an input and no longer is.
 *
 * Hex rather than base64 so the value is safe in a URL, a log line and a
 * primary key without further escaping.
 * The separator is a NUL, written `\0`. It was once a RAW NUL byte in this
 * file: invisible in review, and enough to make git and grep treat the source
 * as binary. The bytes hashed are identical either way - and they must stay
 * identical, because changing the separator gives every existing guest a new
 * subject and a fresh allowance without anything appearing to break.
 */
export async function subjectHash(salt: string, ip: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}\0${ip}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** A salt too short to be worth having. 32 hex chars ≈ 128 bits. */
export const MIN_SALT_LEN = 24

/** Whether a configured salt is strong enough to be used at all. */
export const saltUsable = (salt: string | undefined | null): salt is string =>
  typeof salt === 'string' && salt.trim().length >= MIN_SALT_LEN
