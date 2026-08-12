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
 * The client's address, from the proxy headers.
 *
 * `x-forwarded-for` is a CHAIN — `client, proxy1, proxy2` — and the client is
 * the FIRST entry. Taking the last one, a common slip, keys every visitor
 * behind the same proxy to one subject.
 *
 * Null when no header carries an address; the caller decides what to do rather
 * than filing everyone under an empty string.
 */
export function clientIp(headers: Headers): string | null {
  const chain = headers.get('x-forwarded-for')
  if (chain) {
    const first = chain.split(',')[0]?.trim()
    if (first) return first
  }
  for (const h of ['cf-connecting-ip', 'x-real-ip']) {
    const v = headers.get(h)?.trim()
    if (v) return v
  }
  return null
}

/**
 * A coarse `engine/platform` token — `chrome/windows`, `safari/mac`.
 *
 * Deliberately low-resolution: the version is dropped, so a browser update
 * does not hand out a fresh allowance, and so the token cannot single out a
 * rare build. Order matters — Edge and Opera both claim "Chrome", so the more
 * specific name is tested first.
 */
export function uaFamily(ua: string | null): string {
  const s = (ua ?? '').toLowerCase()
  const engine =
    s.includes('edg/') ? 'edge'
    : s.includes('opr/') || s.includes('opera') ? 'opera'
    : s.includes('firefox') ? 'firefox'
    : s.includes('chrome') || s.includes('chromium') ? 'chrome'
    : s.includes('safari') ? 'safari'
    : 'other'
  const platform =
    s.includes('android') ? 'android'
    : s.includes('iphone') || s.includes('ipad') || s.includes('ios') ? 'ios'
    : s.includes('windows') ? 'windows'
    : s.includes('mac os') || s.includes('macintosh') ? 'mac'
    : s.includes('linux') ? 'linux'
    : 'other'
  return `${engine}/${platform}`
}

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
 * The subject key: a salted SHA-256 over the address and browser family.
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
export async function subjectHash(salt: string, ip: string, family: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}\0${ip}\0${family}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
