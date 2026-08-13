// ─────────────────────────────────────────────────────────────────────────
// THE TRIAL GATE, ON THE SERVER SIDE OF THE WIRE.
//
// Until now the decision was the browser's: `TrialGate` counted arrivals in
// React state and drew the paywall, while `guest-quota` kept a durable tally
// that nothing was obliged to consult. Both were honest about it — "NOT a
// security boundary" appears at the top of `trialQuota.ts` — because the
// calculation happened in the visitor's own browser and there was nothing to
// withhold.
//
// The solvers now run in an Edge function, so there is. This module is where
// the endpoint decides, before computing anything, whether this caller may.
//
// ── WHAT IT ENFORCES, EXACTLY ────────────────────────────────────────────
// Five ARRIVALS per calculator per subject — the thing the pricing page has
// always promised. Not five computations: one run recomputes as often as the
// visitor types, and always did. Someone who replays one run token forever
// gets what someone who leaves a tab open gets, which is the honest reading of
// the promise. What is now impossible is what used to be trivial: clearing
// site data, or editing React state, to get a sixth run.
//
// ── FAILURE IS OPEN, AND THAT IS A DECISION ──────────────────────────────
// `identify()` in auth.ts fails CLOSED — an unreachable Supabase means nobody
// is authenticated, because that is authentication. This fails OPEN: an
// unreachable quota store means the calculator still works. The reasoning is
// the same one `guestTrials.ts` already states — refusing to run a free
// calculator because a counter is down breaks the shop window to defend a
// five-run courtesy, and the caller is still an authenticated one either way.
// Every such decision is logged, and `quotaDegraded` lets the endpoint say so
// in a response header so a broken deployment is visible rather than silently
// generous.
// ─────────────────────────────────────────────────────────────────────────

import { clientIp, saltUsable, subjectHash, ROUTE_CAP_PER_SUBJECT } from './subject'
import { issueTicket, verifyTicket, RUN_HEADER, TICKET_HEADER } from './ticket'

/** Runs per calculator for a visitor without an account. Mirrors
 *  `GUEST_TRIAL_LIMIT` in src/lib/trialQuota.ts, which is what the UI shows. */
export const GUEST_TRIAL_LIMIT = 5

export interface QuotaConfig {
  supabaseUrl: string
  anonKey: string
  /** Secret; without it no subject can be derived and the gate is inert. */
  salt: string | undefined
  limit: number
}

export function quotaConfig(env: Record<string, string | undefined>, supabaseUrl: string, anonKey: string): QuotaConfig {
  const raw = Number(env.GUEST_TRIAL_LIMIT)
  return {
    supabaseUrl,
    anonKey,
    salt: env.GUEST_TRIAL_SALT,
    limit: Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : GUEST_TRIAL_LIMIT,
  }
}

export type QuotaVerdict =
  /** Compute. `ticket` is set when a fresh one should go back to the client. */
  | { ok: true; ticket?: string; used?: number; degraded?: string }
  /** Do not compute. The allowance for this route is spent. */
  | { ok: false; reason: 'exhausted' | 'route-cap'; used: number }

/** The token naming this run, if the client sent a usable one. */
function runToken(headers: Headers): string | null {
  const raw = headers.get(RUN_HEADER)?.trim()
  // Matches the bounds `claim_guest_run` will accept; anything else is treated
  // as "no token", which charges every request rather than granting anything.
  if (!raw || raw.length < 8 || raw.length > 64) return null
  return /^[A-Za-z0-9_-]+$/.test(raw) ? raw : null
}

/**
 * May this guest run `route` right now?
 *
 * `route` is supplied by the ENDPOINT, never by the request — each handler
 * names its own, so a caller cannot claim to be on a route with a fresh
 * allowance.
 */
export async function claimRun(
  req: Request, route: string, cfg: QuotaConfig, fetchImpl: typeof fetch = fetch, now = Date.now(),
): Promise<QuotaVerdict> {
  if (!saltUsable(cfg.salt)) {
    // Loud, every time. An unsalted digest of an IPv4 address is reversible in
    // minutes, so hashing with a default would be worse than not counting —
    // but a deployment that never sets this has a gate that does nothing, and
    // silence is how that survives to production.
    console.error('calc quota: GUEST_TRIAL_SALT missing or too short — the guest trial gate is INERT')
    return { ok: true, degraded: 'no-salt' }
  }

  const ip = clientIp(req.headers)
  if (!ip) {
    // No address means no subject. Counting everyone under one row would be
    // far worse than not counting: the first five arrivals from anywhere would
    // exhaust the allowance for every visitor on earth.
    console.error('calc quota: no client address on the request — cannot derive a subject')
    return { ok: true, degraded: 'no-subject' }
  }

  const subject = await subjectHash(cfg.salt, ip)
  const run = runToken(req.headers)

  // Already paid for, and provably so. This is the path almost every request
  // takes — the second and later recomputes of a run — and it costs one hash.
  if (run && await verifyTicket(cfg.salt, req.headers.get(TICKET_HEADER), subject, route, run, now)) {
    return { ok: true }
  }

  let body: ClaimRow[] | null
  try {
    const res = await fetchImpl(`${cfg.supabaseUrl}/rest/v1/rpc/claim_guest_run`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.anonKey}`,
      },
      body: JSON.stringify({
        p_subject: subject,
        p_route: route,
        p_run: run,
        p_limit: cfg.limit,
        p_cap: ROUTE_CAP_PER_SUBJECT,
      }),
    })
    if (!res.ok) {
      console.error(`calc quota: claim_guest_run returned ${res.status}`)
      return { ok: true, degraded: `rpc-${res.status}` }
    }
    body = (await res.json()) as ClaimRow[]
  } catch (e) {
    console.error('calc quota: claim_guest_run unreachable:', e instanceof Error ? e.message : e)
    return { ok: true, degraded: 'rpc-unreachable' }
  }

  // PostgREST returns a RETURNS TABLE function as an array of rows.
  const row = Array.isArray(body) ? body[0] : null
  if (!row || typeof row.allowed !== 'boolean') {
    console.error('calc quota: unexpected claim_guest_run payload')
    return { ok: true, degraded: 'rpc-shape' }
  }

  if (!row.allowed) {
    return {
      ok: false,
      reason: row.reason === 'route-cap' ? 'route-cap' : 'exhausted',
      used: typeof row.used === 'number' ? row.used : cfg.limit,
    }
  }

  // ALLOWED, but the store declined to record it: `guest_trials` is over its
  // whole-table backstop, so no new subject may open a row. The function chose
  // to allow rather than refuse — a full table is our problem, not the
  // visitor's — and this reports the condition so a deployment in that state is
  // visible rather than silently generous. No ticket: nothing was charged, so
  // there is nothing for a ticket to prove.
  if (row.reason === 'table-full') {
    console.error('calc quota: guest_trials is at its row ceiling — new guests are not being counted')
    return { ok: true, degraded: 'table-full' }
  }

  // Paid for — hand back a ticket so the next recompute skips all of this.
  return {
    ok: true,
    used: typeof row.used === 'number' ? row.used : undefined,
    ticket: run ? await issueTicket(cfg.salt, subject, route, run, now) : undefined,
  }
}

interface ClaimRow {
  allowed?: boolean
  charged?: boolean
  used?: number
  reason?: string | null
}
