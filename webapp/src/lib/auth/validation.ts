// ─────────────────────────────────────────────────────────────────────────
// Form validation for the auth pages — pure, so the rules are testable without
// rendering anything.
//
// The password rules are the app's own minimum. Supabase enforces its own
// server side; these exist so a user is told what is wrong BEFORE a round trip,
// and so the rule is written down in one place rather than implied by whatever
// the server happens to reject.
// ─────────────────────────────────────────────────────────────────────────

export const MIN_PASSWORD = 8

/**
 * Email check. Deliberately permissive — the only authority on whether an
 * address works is whether the verification mail arrives, and over-strict
 * regexes reject valid addresses (plus-tags, long TLDs, unicode domains). This
 * catches typos, nothing more.
 */
export function emailError(email: string): string | null {
  const v = email.trim()
  if (!v) return 'Enter your email address.'
  if (v.length > 254) return 'That email address is too long.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'That does not look like an email address.'
  return null
}

export function passwordError(password: string): string | null {
  if (!password) return 'Enter a password.'
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`
  if (password.length > 72) return 'Passwords are limited to 72 characters.'
  return null
}

export function confirmError(password: string, confirm: string): string | null {
  if (!confirm) return 'Re-enter the password.'
  if (password !== confirm) return 'The two passwords do not match.'
  return null
}

export type Strength = 'weak' | 'fair' | 'good' | 'strong'

export interface StrengthResult {
  score: 0 | 1 | 2 | 3 | 4
  label: Strength
  /** The single most useful thing to do next, or null when already strong. */
  hint: string | null
}

/**
 * A rough strength signal for the meter.
 *
 * Length first, because it dominates real-world guessing resistance; character
 * variety adds less than people expect. This is guidance for the user, NOT a
 * gate — `passwordError` is the only thing that blocks submission, and a long
 * passphrase of one character class should not be refused.
 */
export function passwordStrength(password: string): StrengthResult {
  const p = password
  if (!p) return { score: 0, label: 'weak', hint: 'Enter a password.' }

  let score = 0
  if (p.length >= MIN_PASSWORD) score++
  if (p.length >= 12) score++
  if (p.length >= 16) score++
  // A genuinely long passphrase reaches the top on length alone. Without this
  // tier the scoring contradicted its own rationale: it said length dominates
  // but capped a 25-character passphrase below a short password with a symbol
  // in it, which is the advice backwards.
  if (p.length >= 20) score++
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length
  if (classes >= 3) score++

  // obvious patterns pull it back down however long they are
  if (/^(.)\1+$/.test(p) || /^(0123456789|abcdefghij|qwertyuiop|password)/i.test(p)) score = 0

  const clamped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4
  const label: Strength = clamped <= 1 ? 'weak' : clamped === 2 ? 'fair' : clamped === 3 ? 'good' : 'strong'
  const hint = p.length < MIN_PASSWORD ? `Use at least ${MIN_PASSWORD} characters.`
    : p.length < 12 ? 'Longer is stronger — aim for 12 or more.'
      : classes < 3 ? 'Mixing letters, numbers and symbols helps.'
        : null
  return { score: clamped, label, hint }
}

/** All the errors for a sign-up form; empty when it may be submitted. */
export function signUpErrors(f: { email: string; password: string; confirm: string }): {
  email?: string; password?: string; confirm?: string
} {
  const out: { email?: string; password?: string; confirm?: string } = {}
  const e = emailError(f.email); if (e) out.email = e
  const p = passwordError(f.password); if (p) out.password = p
  const c = confirmError(f.password, f.confirm); if (c) out.confirm = c
  return out
}

/** All the errors for a sign-in form; empty when it may be submitted. */
export function signInErrors(f: { email: string; password: string }): {
  email?: string; password?: string
} {
  const out: { email?: string; password?: string } = {}
  const e = emailError(f.email); if (e) out.email = e
  // NOT `passwordError` — an existing account may predate the current rule, and
  // telling someone their saved password is "too short" at the sign-in screen
  // is both wrong and confusing. Only emptiness is checked here.
  if (!f.password) out.password = 'Enter your password.'
  return out
}
