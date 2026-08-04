// ─────────────────────────────────────────────────────────────────────────
// GUEST TRIAL QUOTA — how many times someone who has not signed in may run a
// calculator before being asked to create an account.
//
// Pure and separately testable on purpose. The rules here decide what a visitor
// can and cannot do, so they should be inspectable and provable rather than
// scattered through components as `if (user)` checks.
//
// WHERE THE COUNT LIVES. The `usage` map passed in here is the MERGE of a
// localStorage cache and a server-side record kept per visitor — see
// `guestTrials.ts` and `supabase/functions/guest-quota`. Clearing site data
// therefore no longer resets the allowance, which it used to.
//
// WHAT THIS IS STILL NOT: a security boundary. A different browser, a private
// window on another network, or a VPN is a new visitor as far as the server can
// tell, and every calculation runs in the visitor's own browser regardless —
// there is no server to withhold it from them. The tools that genuinely require
// an account are gated on the session itself (see `RequireAuth`). Treating this
// counter as protection is the mistake this comment exists to prevent; what it
// buys is that the prompt to sign up cannot be dismissed by one click in
// devtools.
// ─────────────────────────────────────────────────────────────────────────

/** Tools a signed-out visitor may try, with a per-tool run allowance. */
export const GUEST_TRIAL_LIMIT = 5

/**
 * Routes a guest may use, limited to `GUEST_TRIAL_LIMIT` runs each.
 *
 * These are the single-purpose calculators: one page, one answer, no project
 * state. They are the app's shop window, so trying one should not need an
 * account. Everything not listed here needs a session — see `GATED_PREFIXES`.
 */
export const GUEST_TRIAL_ROUTES: readonly string[] = [
  // RC members and details
  '/beam-analysis', '/beam-design', '/tbeam-design', '/column-design', '/slab-design',
  '/prestressed-beam', '/torsion', '/dev-length', '/punching-shear', '/stair', '/water-tank',
  // foundations
  '/foundation', '/combined', '/pile-cap', '/retaining-wall',
  // steel, timber and connections
  '/steel', '/bolted-connection', '/welded-connection', '/wood-slab',
  // geotechnical
  '/geotech', '/earth-pressure', '/bearing-capacity', '/slope', '/settlement', '/lateral-pile',
  '/soil-nail', '/micropile', '/rock-anchor', '/shotcrete-facing',
  // standalone analysis helpers
  '/load-combinations', '/load-path', '/plumbing',
]

/**
 * Route prefixes that always require an account, however many trials remain.
 *
 * These are the heavy, stateful features — a 3D model, a full design pipeline,
 * an optimiser run, a generated report. They are where the product's value is,
 * and they are also expensive to run, so they sit behind sign-in rather than
 * behind a counter.
 */
export const GATED_PREFIXES: readonly string[] = [
  '/model', '/frame', '/truss', '/schedule', '/estimate', '/seismic-wizard', '/soils',
]

/** Freely readable by anyone, signed in or not — no counter, no gate. */
export const PUBLIC_ROUTES: readonly string[] = [
  '/', '/docs', '/validation', '/about', '/pricing',
  '/signin', '/signup', '/forgot-password', '/reset-password',
  // Policy and contact pages. A customer must be able to read the terms and
  // find a way to complain WITHOUT an account — and a payment provider
  // reviewing the site will not have one either.
  '/terms', '/privacy', '/refunds', '/contact',
  // Profile: the letterhead settings are browser-local and work signed out.
  '/profile',
]

export type AccessVerdict =
  /** Open to everyone. */
  | { kind: 'public' }
  /** Signed in — everything is available. */
  | { kind: 'member' }
  /** A guest may run this, with `remaining` tries left. */
  | { kind: 'trial'; used: number; remaining: number }
  /** A guest has run out of tries on this tool. */
  | { kind: 'trial-exhausted'; used: number }
  /** Requires an account regardless of trials. */
  | { kind: 'members-only' }

const norm = (route: string): string => {
  const clean = route.split('?')[0].split('#')[0]
  return clean.length > 1 && clean.endsWith('/') ? clean.slice(0, -1) : clean
}

/** True when a route is one of the always-gated features. */
export const isGated = (route: string): boolean => {
  const r = norm(route)
  return GATED_PREFIXES.some((p) => r === p || r.startsWith(`${p}/`))
}

/** True when a route is open to everyone. */
export const isPublic = (route: string): boolean => {
  const r = norm(route)
  return PUBLIC_ROUTES.includes(r)
}

/** True when a signed-out visitor may try this route on the trial allowance. */
export const isTrialRoute = (route: string): boolean => GUEST_TRIAL_ROUTES.includes(norm(route))

/**
 * What a visitor may do on a route.
 *
 * `usage` maps route → runs already used. Precedence is deliberate and tested:
 * PUBLIC beats everything (documentation must never be gated), then a signed-in
 * member gets everything, then the always-gated list, then the trial allowance.
 * A route in neither list is members-only — the safe default, so adding a new
 * page does not accidentally make it free.
 */
export function accessFor(
  route: string, signedIn: boolean, usage: Readonly<Record<string, number>> = {},
): AccessVerdict {
  if (isPublic(route)) return { kind: 'public' }
  if (signedIn) return { kind: 'member' }
  if (isGated(route)) return { kind: 'members-only' }
  if (!isTrialRoute(route)) return { kind: 'members-only' }
  const used = Math.max(0, Math.floor(usage[norm(route)] ?? 0))
  const remaining = GUEST_TRIAL_LIMIT - used
  return remaining > 0
    ? { kind: 'trial', used, remaining }
    : { kind: 'trial-exhausted', used }
}

/** Whether the verdict permits running a calculation right now. */
export const canRun = (v: AccessVerdict): boolean =>
  v.kind === 'public' || v.kind === 'member' || v.kind === 'trial'

/** Record one run against a route, returning the updated usage map. */
export function recordRun(
  route: string, usage: Readonly<Record<string, number>> = {},
): Record<string, number> {
  const r = norm(route)
  if (!isTrialRoute(r)) return { ...usage }
  return { ...usage, [r]: Math.max(0, Math.floor(usage[r] ?? 0)) + 1 }
}

const STORAGE_KEY = 'ce.guestTrials.v1'

/** Read the usage map from localStorage; `{}` when unavailable or corrupt. */
export function loadUsage(store?: Pick<Storage, 'getItem'>): Record<string, number> {
  try {
    const s = store ?? (typeof localStorage !== 'undefined' ? localStorage : undefined)
    const raw = s?.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = Math.floor(v)
    }
    return out
  } catch {
    // a blocked or full localStorage must never break the app — a guest simply
    // gets a fresh allowance, which is the failure direction that costs nothing
    return {}
  }
}

/** Persist the usage map; silently a no-op when storage is unavailable. */
export function saveUsage(usage: Record<string, number>, store?: Pick<Storage, 'setItem'>): void {
  try {
    const s = store ?? (typeof localStorage !== 'undefined' ? localStorage : undefined)
    s?.setItem(STORAGE_KEY, JSON.stringify(usage))
  } catch { /* ignore — see loadUsage */ }
}

/**
 * The "N runs left" line for a guest, or null when there is nothing to say.
 *
 * A counter that blocks with no warning is a trap: the visitor is mid-task
 * when the page they were using turns into a sign-up form. Silence for members
 * and public routes is equally deliberate — a signed-in engineer does not need
 * reminding of a limit that does not apply to them.
 */
export function trialNotice(v: AccessVerdict): string | null {
  if (v.kind !== 'trial') return null
  return v.remaining === 1
    ? 'Last free run of this calculator — a free account removes the limit.'
    : `${v.remaining} free runs left on this calculator.`
}
