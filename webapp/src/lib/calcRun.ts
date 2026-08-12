// ─────────────────────────────────────────────────────────────────────────
// NAMING THE RUN — the client half of the server-side trial gate.
//
// The endpoint charges a guest one run per ARRIVAL at a calculator, not one
// per computation, because these pages recompute on a 250 ms debounce every
// time a field changes. Something has to tell the server which requests belong
// to the same arrival, and that is the token minted here: opaque, per-arrival,
// sent on every calculation request.
//
// It is deliberately NOT a credential. It grants nothing — the server decides
// whether the run it names may proceed, and the answer for a fresh token is
// "only if the allowance has room". Replaying an old token is the one thing it
// buys, and that is the same thing leaving a tab open has always bought.
//
// TICKETS. The server's reply to the first request of a run carries a signed
// ticket; presenting it on later requests lets the endpoint skip its database
// round trip. Cached here, in memory only, keyed by route: it is worthless to
// anyone else (it is bound to this visitor's subject) and worthless later (it
// expires), so persisting it would add exposure for nothing.
//
// WHY IT IS NOT IN REACT STATE. `calcApi.post` needs it, and that is a plain
// async function reached from a hook's callback — threading a token through
// every page's props to get there would put the plumbing in twenty components
// to serve one header.
// ─────────────────────────────────────────────────────────────────────────

/** Matches the charset and bounds the endpoint and `claim_guest_run` accept. */
const TOKEN_RE = /^[A-Za-z0-9_-]{8,64}$/

let currentRun: string | null = null
const tickets = new Map<string, string>()

/** A fresh, unguessable token. `randomUUID` where available — a run token that
 *  collided with another visitor's would merge two allowances. */
function mint(): string {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, '')
  if (c?.getRandomValues) {
    const b = new Uint8Array(16)
    c.getRandomValues(b)
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  }
  // No Web Crypto at all is a very old browser. Uniqueness still matters more
  // than unpredictability here, so time plus randomness is an acceptable last
  // resort — the token is not a secret.
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`.padEnd(16, '0').slice(0, 32)
}

/**
 * Begin a new run. Called on ARRIVAL at a calculator page — the same event
 * `TrialGate` charges for, so the client and server agree on what a run is.
 *
 * The cached tickets are dropped with it: a ticket is bound to the run it was
 * minted for and the server would reject it against the new one anyway.
 */
export function startRun(): string {
  currentRun = mint()
  tickets.clear()
  return currentRun
}

/** The token for the run in progress, minting one if a calculation somehow
 *  happens before any arrival was recorded. */
export function runToken(): string {
  if (!currentRun || !TOKEN_RE.test(currentRun)) currentRun = mint()
  return currentRun
}

/** Remember a ticket the server issued for `route`. */
export function rememberTicket(route: string, ticket: string | null | undefined): void {
  if (ticket) tickets.set(route, ticket)
}

/** The ticket held for `route`, if any. */
export const ticketFor = (route: string): string | undefined => tickets.get(route)

/** Testing seam — resets the module to its initial state. */
export function resetRun(): void {
  currentRun = null
  tickets.clear()
}

/**
 * Thrown when the server refuses because the guest allowance is spent.
 *
 * A distinct type because the UI's answer is completely different from every
 * other failure: not "API error — check console" but the sign-up prompt. A
 * visitor who has used their five runs has not hit a bug.
 */
export class TrialExhaustedError extends Error {
  readonly route: string
  readonly used: number
  constructor(route: string, used: number) {
    super(`Free trial used up for ${route}`)
    this.name = 'TrialExhaustedError'
    this.route = route
    this.used = used
  }
}
