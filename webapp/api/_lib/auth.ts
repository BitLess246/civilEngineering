// ─────────────────────────────────────────────────────────────────────────
// Who is allowed to call the calculation endpoints. Runs on Vercel's EDGE
// runtime — Web `Request`/`Response`, no Node builtins.
//
// WHAT THIS IS. Every caller must present a Supabase JWT. The SPA always has
// one: a signed-in member sends their access token, and a guest sends the anon
// key, which is itself a valid JWT (the same arrangement `guest-quota` relies
// on). Without one, the endpoint answers 401 and computes nothing.
//
// WHAT THIS IS NOT — read this before treating it as a paywall. It is a KEY
// boundary, not an ENTITLEMENT boundary. The anon key is public by design; it
// is inlined into the JavaScript every visitor downloads, so anyone willing to
// read the bundle can present it. What the boundary buys today is real but
// narrow:
//
//   • the engine no longer has to ship to the browser to compute, so the
//     design code stops being copy-pasteable out of the bundle;
//   • calls are attributable and rate-limitable at the edge;
//   • there is now somewhere to PUT an entitlement check.
//
// The trial allowance is still decided client-side by `TrialGate` against the
// server-backed count from `guest-quota`. Moving that decision in here is the
// next step and is deliberately not pretended at — see the PR.
// ─────────────────────────────────────────────────────────────────────────

export type Caller =
  | { kind: 'member'; userId: string }
  | { kind: 'guest' }

export interface AuthConfig {
  supabaseUrl: string
  anonKey: string
}

/** The env the endpoints need, or null when the deployment has not set it. */
export function authConfig(env: Record<string, string | undefined>): AuthConfig | null {
  // Two spellings: the VITE_ ones already exist for the client build, and the
  // unprefixed ones are what a server-side env would normally be called. Taking
  // either means the endpoints work without a second copy of the same values.
  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL
  const anonKey = env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY
  return supabaseUrl && anonKey ? { supabaseUrl, anonKey } : null
}

/** `Authorization: Bearer <jwt>` → the token, or null. */
export function bearer(header: string | null): string | null {
  if (!header) return null
  const m = /^Bearer\s+(.+)$/i.exec(header.trim())
  const token = m?.[1]?.trim()
  return token && token.length > 0 ? token : null
}

/**
 * COULD THIS STRING POSSIBLY BE A LIVE SUPABASE JWT?
 *
 * A structural screen, run BEFORE the network call. Audit S5's first half is
 * that a caller can amplify garbage 1:1 into our own auth endpoint: every
 * unrecognised token costs one request to `/auth/v1/user`, so a flood of junk
 * is a flood against Supabase, paid for by us.
 *
 * This refuses locally what cannot be a token at all — the cheapest flood to
 * mount, and the one that needs no effort from the attacker.
 *
 * WHAT IT CANNOT DO, said plainly: it does NOT verify the signature, so a
 * well-formed, unexpired, entirely forged token still reaches the network. Only
 * local signature verification closes that, and it is not attempted here — see
 * `docs/AuditRemediation.md` S5.
 *
 * SAFETY DIRECTION. This may only ever REJECT what the network would also have
 * rejected; it must never admit anything new, and must never reject something
 * Supabase would accept. Two consequences:
 *  - every check is on the shape and the `exp` claim, both of which Supabase
 *    enforces itself, so anything failing here would have failed there too;
 *  - `exp` is compared with a generous skew allowance, because an Edge clock
 *    running fast must not reject a token that is still live at the server.
 */
const JWT_SKEW_SECONDS = 120

export function couldBeJwt(token: string, now = Date.now()): boolean {
  // Three dot-separated base64url segments, with a non-empty signature.
  const parts = token.split('.')
  if (parts.length !== 3) return false
  if (parts.some((p) => p.length === 0)) return false
  if (!/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return false
  let payload: { exp?: unknown }
  try {
    // atob wants standard base64; JWT uses base64url and drops the padding.
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    payload = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)))
  } catch {
    return false
  }
  if (payload === null || typeof payload !== 'object') return false
  // No `exp` is not our business to reject — Supabase decides that.
  if (typeof payload.exp === 'number') {
    if (payload.exp * 1000 + JWT_SKEW_SECONDS * 1000 < now) return false
  }
  return true
}

/**
 * Identify the caller.
 *
 * The anon key is compared FIRST and by exact match, because asking Supabase to
 * introspect it costs a round trip on every guest calculation and answers
 * "not a user" anyway.
 */
export async function identify(
  token: string, cfg: AuthConfig,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<Caller | null> {
  if (token === cfg.anonKey) return { kind: 'guest' }
  // Screened before the round trip — see `couldBeJwt`.
  if (!couldBeJwt(token, now)) return null
  try {
    const res = await fetchImpl(`${cfg.supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: cfg.anonKey },
    })
    if (!res.ok) return null
    const user = (await res.json()) as { id?: string }
    return user?.id ? { kind: 'member', userId: user.id } : null
  } catch {
    // Reaching Supabase failed. Refuse rather than admit: an auth check that
    // passes when the auth service is down is not a check.
    return null
  }
}
