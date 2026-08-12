// ─────────────────────────────────────────────────────────────────────────
// RUN TICKETS — proof that a run has already been paid for, verifiable without
// touching the database.
//
// THE PROBLEM. `claim_guest_run` is the authority on whether a guest may
// start a run, and it lives in Postgres. But the calculator pages recompute on
// a 250 ms debounce every time a field changes, so asking Postgres on every
// request would put a Supabase round trip in front of every keystroke — on the
// exact pages whose "computing…" chip the user already noticed.
//
// THE ANSWER. The FIRST request of a run pays the database visit and gets back
// a ticket: a short-lived HMAC over (subject, route, run, expiry). Every later
// request of the same run presents the ticket, and the endpoint verifies it
// with one SHA-256 — no network, no database.
//
// WHAT A TICKET CANNOT DO. It is not a bearer credential for the API: the
// caller still needs a valid Supabase token, and the ticket is bound to the
// SUBJECT, so lifting one from another visitor's browser buys nothing (their
// digest is not yours). It cannot be minted client-side without the key, and it
// cannot outlive its expiry. The worst it grants is what it says: this
// already-charged run, for this route, for the next few minutes.
//
// EXPIRY IS NOT A SECOND CHARGE. When a ticket lapses under a visitor who has
// been on the page for an hour, the endpoint re-claims with the SAME run token
// — which `claim_guest_run` recognises in `recent_runs` and admits without
// charging. A long session costs one database visit per TTL, not one run.
// ─────────────────────────────────────────────────────────────────────────

/** How long a ticket stands before the endpoint re-checks with the database. */
export const TICKET_TTL_MS = 10 * 60 * 1000

/** Header the ticket travels on, both directions. */
export const TICKET_HEADER = 'x-calc-ticket'

/** Header carrying the client's opaque run token. */
export const RUN_HEADER = 'x-calc-run'

/**
 * The signing key, derived from the subject salt rather than adding a second
 * secret to configure (and to forget). The context string keeps the two uses
 * apart: a ticket MAC can never collide with a subject digest, so neither can
 * be replayed as the other.
 */
async function signingKey(salt: string): Promise<CryptoKey> {
  const material = new TextEncoder().encode(`${salt}\0calc-run-ticket-v1`)
  const raw = await crypto.subtle.digest('SHA-256', material)
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

const b64url = (bytes: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** The exact bytes covered by the MAC. Every field is inside it, so none can
 *  be swapped without invalidating the signature. */
const payload = (subject: string, route: string, run: string, exp: number): string =>
  `${subject}.${route}.${run}.${exp}`

/** Mint a ticket for a run that has just been paid for. */
export async function issueTicket(
  salt: string, subject: string, route: string, run: string, now = Date.now(),
): Promise<string> {
  const exp = now + TICKET_TTL_MS
  const key = await signingKey(salt)
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload(subject, route, run, exp)))
  return `${exp}.${b64url(mac)}`
}

/**
 * Does this ticket prove the named run was already paid for?
 *
 * False for anything at all suspect — wrong subject, wrong route, wrong run,
 * expired, malformed, or a signature that does not verify. There is no partial
 * credit and no error channel: the caller's only move on false is to go and ask
 * the database, which is the safe direction.
 */
export async function verifyTicket(
  salt: string, ticket: string | null, subject: string, route: string, run: string,
  now = Date.now(),
): Promise<boolean> {
  if (!ticket) return false
  const dot = ticket.indexOf('.')
  if (dot < 1) return false
  const exp = Number(ticket.slice(0, dot))
  const mac = ticket.slice(dot + 1)
  if (!Number.isFinite(exp) || !mac) return false
  // Checked BEFORE the signature so an expired ticket costs no crypto, and so
  // a valid signature can never resurrect a lapsed run.
  if (exp <= now) return false
  // A ticket claiming to last longer than the TTL was not minted here.
  if (exp > now + TICKET_TTL_MS) return false
  try {
    const key = await signingKey(salt)
    const sig = Uint8Array.from(
      atob(mac.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
    // crypto.subtle.verify is constant-time; comparing strings would not be.
    return await crypto.subtle.verify(
      'HMAC', key, sig, new TextEncoder().encode(payload(subject, route, run, exp)))
  } catch {
    return false                    // malformed base64 is just an invalid ticket
  }
}
