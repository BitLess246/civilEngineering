// ─────────────────────────────────────────────────────────────────────────
// AUTH CLIENT — the Supabase adapter, behind a provider-agnostic surface.
//
// Everything the app touches goes through `AuthClient`, so the provider is one
// file rather than a hundred call sites. Swapping to Firebase later means
// writing a second adapter, not editing pages.
//
// CONFIGURED OR NOT, THE APP MUST STILL RUN. The keys arrive as build-time env
// vars, and a fork of this repo (or CI, or a preview deploy) will not have them.
// So `isAuthConfigured()` is checked before any call, `getClient()` returns null
// rather than throwing, and every page degrades to a clear "sign-in is not set
// up" message instead of a blank screen. That is why the client is created
// LAZILY: importing this module must be free.
//
// On key safety: VITE_* vars are inlined into the browser bundle and are public
// by definition. Supabase's anon key is designed for exactly that — it carries
// no privileges beyond what Row Level Security grants an anonymous or
// authenticated user. The SERVICE ROLE key is not, must never appear here, and
// there is a test asserting this file does not reference one.
// ─────────────────────────────────────────────────────────────────────────
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js'

export interface AuthUser {
  id: string
  email: string | null
  /** Display name from user metadata, when the account carries one. */
  name: string | null
  /** True once the address has been confirmed. */
  emailVerified: boolean
  /**
   * Subscription plan id, read from APP METADATA.
   *
   * Read-only here, and null until something sets it. Nothing in the browser
   * may grant itself a plan — that has to come from the server side (a
   * checkout webhook, or an admin setting it by hand), or the paywall would be
   * a suggestion. `planOf` maps an unknown value to the least-privileged plan.
   */
  plan: string | null
}

export type AuthErrorKind =
  | 'not-configured'
  | 'invalid-credentials'
  | 'email-taken'
  | 'weak-password'
  | 'rate-limited'
  | 'network'
  | 'unknown'

export interface AuthError {
  kind: AuthErrorKind
  /** Message safe to show a user. */
  message: string
}

export type AuthResult<T> = { ok: true; value: T } | { ok: false; error: AuthError }

const URL_KEY = 'VITE_SUPABASE_URL'
const ANON_KEY = 'VITE_SUPABASE_ANON_KEY'

const env = (k: string): string => {
  const v = (import.meta.env as Record<string, string | undefined>)[k]
  return typeof v === 'string' ? v.trim() : ''
}

/** True when both keys are present, so auth can actually be attempted. */
export const isAuthConfigured = (): boolean => !!env(URL_KEY) && !!env(ANON_KEY)

/** The env var names, so the "not configured" UI can name them exactly. */
export const AUTH_ENV_KEYS = [URL_KEY, ANON_KEY] as const

let client: SupabaseClient | null = null

/** The Supabase client, or null when unconfigured. Created on first use. */
export function getClient(): SupabaseClient | null {
  if (!isAuthConfigured()) return null
  if (!client) {
    client = createClient(env(URL_KEY), env(ANON_KEY), {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  }
  return client
}

const NOT_CONFIGURED: AuthError = {
  kind: 'not-configured',
  message: 'Sign-in is not configured for this deployment.',
}

/**
 * Map a provider error onto our own vocabulary.
 *
 * Deliberately does NOT pass the raw message through for credential failures:
 * a sign-in error must not reveal whether the address exists, because that
 * turns the form into an account-enumeration oracle. Everything that could be
 * "wrong email" or "wrong password" collapses to one message.
 */
export function classifyError(message: string, status?: number): AuthError {
  const m = message.toLowerCase()
  if (status === 429 || m.includes('rate limit')) {
    return { kind: 'rate-limited', message: 'Too many attempts. Please wait a minute and try again.' }
  }
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('user already exists')) {
    return { kind: 'email-taken', message: 'An account with that email already exists.' }
  }
  if (m.includes('password') && (m.includes('short') || m.includes('least') || m.includes('weak'))) {
    return { kind: 'weak-password', message: 'That password is too short — use at least 8 characters.' }
  }
  if (m.includes('invalid login') || m.includes('invalid credentials') || m.includes('email not confirmed')) {
    return { kind: 'invalid-credentials', message: 'Email or password is incorrect.' }
  }
  if (m.includes('fetch') || m.includes('network')) {
    return { kind: 'network', message: 'Could not reach the sign-in service. Check your connection.' }
  }
  return { kind: 'unknown', message: 'Something went wrong. Please try again.' }
}

/**
 * Map a session to the app's user. Exported so the plan's provenance can be
 * pinned by a test — that it comes from app_metadata and that a plan planted
 * in user_metadata is ignored is a SECURITY property, not a detail.
 */
export const toUser = (s: Session | null): AuthUser | null => {
  const u = s?.user
  if (!u) return null
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>
  const name = typeof meta.name === 'string' ? meta.name : null

  // THE PLAN COMES FROM app_metadata, NOT user_metadata, and there is
  // deliberately NO FALLBACK to user_metadata. `updateUser({ data })` writes
  // user_metadata, so a signed-in account could set its own plan there; a
  // fallback "for the transition" would leave that door open permanently.
  // app_metadata is writable only with the service-role key, which lives in
  // the billing webhook and nowhere else.
  const appMeta = (u.app_metadata ?? {}) as Record<string, unknown>
  const plan = typeof appMeta.plan === 'string' ? appMeta.plan : null

  return { id: u.id, email: u.email ?? null, name, emailVerified: !!u.email_confirmed_at, plan }
}

export async function signIn(email: string, password: string): Promise<AuthResult<AuthUser | null>> {
  const c = getClient()
  if (!c) return { ok: false, error: NOT_CONFIGURED }
  try {
    const { data, error } = await c.auth.signInWithPassword({ email, password })
    if (error) return { ok: false, error: classifyError(error.message, error.status) }
    return { ok: true, value: toUser(data.session) }
  } catch (e) {
    return { ok: false, error: classifyError(String(e)) }
  }
}

export async function signUp(
  email: string, password: string, name?: string,
): Promise<AuthResult<{ user: AuthUser | null; needsVerification: boolean }>> {
  const c = getClient()
  if (!c) return { ok: false, error: NOT_CONFIGURED }
  try {
    const { data, error } = await c.auth.signUp({
      email, password,
      options: { data: name ? { name } : undefined },
    })
    if (error) return { ok: false, error: classifyError(error.message, error.status) }
    // Supabase returns a user but no session when email confirmation is on
    return { ok: true, value: { user: toUser(data.session), needsVerification: !data.session } }
  } catch (e) {
    return { ok: false, error: classifyError(String(e)) }
  }
}

export async function signOut(): Promise<void> {
  await getClient()?.auth.signOut()
}

/**
 * Send a password-reset email.
 *
 * Always reports success to the caller, even when the address is unknown —
 * otherwise the form tells an attacker which addresses have accounts. The user
 * sees "if that address has an account, a link is on its way", which is both
 * honest and non-disclosing.
 */
export async function requestPasswordReset(email: string, redirectTo?: string): Promise<AuthResult<true>> {
  const c = getClient()
  if (!c) return { ok: false, error: NOT_CONFIGURED }
  try {
    const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo })
    if (error && error.status === 429) return { ok: false, error: classifyError(error.message, 429) }
    return { ok: true, value: true }
  } catch {
    return { ok: true, value: true }
  }
}

/** Set a new password for the session established by a reset link. */
export async function updatePassword(password: string): Promise<AuthResult<true>> {
  const c = getClient()
  if (!c) return { ok: false, error: NOT_CONFIGURED }
  try {
    const { error } = await c.auth.updateUser({ password })
    if (error) return { ok: false, error: classifyError(error.message, error.status) }
    return { ok: true, value: true }
  } catch (e) {
    return { ok: false, error: classifyError(String(e)) }
  }
}

/** Current user, or null. */
export async function currentUser(): Promise<AuthUser | null> {
  const c = getClient()
  if (!c) return null
  const { data } = await c.auth.getSession()
  return toUser(data.session)
}

/** Subscribe to sign-in/sign-out. Returns an unsubscribe function. */
export function onAuthChange(cb: (u: AuthUser | null) => void): () => void {
  const c = getClient()
  if (!c) return () => {}
  const { data } = c.auth.onAuthStateChange((_e, session) => cb(toUser(session)))
  return () => data.subscription.unsubscribe()
}
