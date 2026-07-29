// ─────────────────────────────────────────────────────────────────────────
// WEBHOOK SIGNATURE VERIFICATION — the whole reason a server exists here.
//
// A payment webhook is an unauthenticated POST from the open internet that says
// "this person paid you". Anyone can send that request. The ONLY thing
// separating a real payment from a forged one is an HMAC computed with a secret
// that only the provider and this function know. Get this wrong and the paywall
// is decorative — which is exactly the reason none of it could live in the
// browser, where the secret would be public.
//
// FAILS CLOSED, DELIBERATELY. `lib/auth/authClient` and `usePlan` fail OPEN when
// unconfigured, so a fork of this repo stays usable. This module does the
// opposite: a missing secret, an unparseable header, a stale timestamp or a
// mismatched digest all REJECT. The asymmetry is the point — the cost of being
// wrong is "nobody can use the app" in one case and "anyone can grant themselves
// a paid plan" in the other.
//
// Runs on Web Crypto only (`crypto.subtle`, `TextEncoder`), so the same source
// executes under Deno in the Edge Function and under Node in the test suite.
// ─────────────────────────────────────────────────────────────────────────

/** How far a webhook's own timestamp may be from ours before it is a replay. */
export const DEFAULT_TOLERANCE_S = 300

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'no-secret' | 'malformed-header' | 'stale' | 'mismatch' }

const enc = new TextEncoder()

/**
 * Constant-time string comparison.
 *
 * `a === b` on a digest leaks, through how long it takes to fail, how many
 * leading characters an attacker guessed right — which turns forging a
 * signature into a few thousand requests instead of brute force. Comparing
 * every character regardless, and OR-ing the differences, removes that signal.
 * Length is folded in the same way rather than short-circuiting on it.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}

/** Lowercase hex HMAC-SHA256 of `payload` under `secret`. */
export async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface VerifyInput {
  /**
   * The EXACT bytes the provider signed, as received.
   *
   * Never `JSON.stringify(await req.json())` — re-serialising changes key order,
   * whitespace and number formatting, so the digest will not match and, worse,
   * might match for a body that differs from what was signed.
   */
  rawBody: string
  /** The provider's signature header, verbatim. */
  header: string | null
  /** The endpoint's signing secret. */
  secret: string | undefined
  /** Seconds since epoch; injectable so tolerance can be tested. */
  nowS?: number
  toleranceS?: number
}

/**
 * Paddle (Billing v2): `Paddle-Signature: ts=1700000000;h1=<hex>`
 * signed over `${ts}:${rawBody}`.
 */
export async function verifyPaddle(input: VerifyInput): Promise<VerifyResult> {
  const { rawBody, header, secret } = input
  if (!secret) return { ok: false, reason: 'no-secret' }
  if (!header) return { ok: false, reason: 'malformed-header' }

  const parts = new Map<string, string>()
  for (const seg of header.split(';')) {
    const i = seg.indexOf('=')
    if (i > 0) parts.set(seg.slice(0, i).trim(), seg.slice(i + 1).trim())
  }
  const ts = parts.get('ts')
  const h1 = parts.get('h1')
  if (!ts || !h1 || !/^\d+$/.test(ts) || !/^[0-9a-f]+$/i.test(h1)) {
    return { ok: false, reason: 'malformed-header' }
  }
  if (isStale(Number(ts), input)) return { ok: false, reason: 'stale' }

  const expected = await hmacSha256Hex(secret, `${ts}:${rawBody}`)
  return timingSafeEqual(expected, h1.toLowerCase()) ? { ok: true } : { ok: false, reason: 'mismatch' }
}

/**
 * Stripe: `Stripe-Signature: t=1700000000,v1=<hex>[,v1=<hex>…]`
 * signed over `${t}.${rawBody}`.
 *
 * Multiple `v1` values appear while a secret is being rotated; ANY match is
 * valid, and each is compared in constant time rather than bailing on the first.
 */
export async function verifyStripe(input: VerifyInput): Promise<VerifyResult> {
  const { rawBody, header, secret } = input
  if (!secret) return { ok: false, reason: 'no-secret' }
  if (!header) return { ok: false, reason: 'malformed-header' }

  let t: string | undefined
  const v1: string[] = []
  for (const seg of header.split(',')) {
    const i = seg.indexOf('=')
    if (i <= 0) continue
    const k = seg.slice(0, i).trim(), v = seg.slice(i + 1).trim()
    if (k === 't') t = v
    else if (k === 'v1') v1.push(v)
  }
  if (!t || !/^\d+$/.test(t) || v1.length === 0 || !v1.every((s) => /^[0-9a-f]+$/i.test(s))) {
    return { ok: false, reason: 'malformed-header' }
  }
  if (isStale(Number(t), input)) return { ok: false, reason: 'stale' }

  const expected = await hmacSha256Hex(secret, `${t}.${rawBody}`)
  let matched = false
  for (const candidate of v1) {
    // no early exit: every candidate is compared so the work is uniform
    if (timingSafeEqual(expected, candidate.toLowerCase())) matched = true
  }
  return matched ? { ok: true } : { ok: false, reason: 'mismatch' }
}

/**
 * A signature is only good for a window around its own timestamp.
 *
 * Without this, a signature captured once stays valid forever, and anyone who
 * ever saw a legitimate webhook body could replay it. Future timestamps are
 * rejected on the same window so a forged clock cannot buy an indefinite one.
 */
function isStale(tsS: number, { nowS, toleranceS = DEFAULT_TOLERANCE_S }: VerifyInput): boolean {
  const now = nowS ?? Math.floor(Date.now() / 1000)
  return Math.abs(now - tsS) > toleranceS
}

/**
 * PayMongo: `Paymongo-Signature: t=1700000000,te=<hex>,li=<hex>`
 * signed over `${t}.${rawBody}` — the same construction as Stripe, with the
 * digest split by mode instead of by key version.
 *
 * `te` is the TEST-mode signature and `li` the LIVE one. Which of the two is
 * authoritative depends on the key the endpoint was configured with, so it is
 * passed in explicitly rather than accepting whichever happens to match:
 * accepting either would let a test-mode secret — far more widely shared, and
 * often pasted into chats and issues — approve a live payment.
 */
export async function verifyPaymongo(
  input: VerifyInput & { mode: 'test' | 'live' },
): Promise<VerifyResult> {
  const { rawBody, header, secret, mode } = input
  if (!secret) return { ok: false, reason: 'no-secret' }
  if (!header) return { ok: false, reason: 'malformed-header' }

  const parts = new Map<string, string>()
  for (const seg of header.split(',')) {
    const i = seg.indexOf('=')
    if (i > 0) parts.set(seg.slice(0, i).trim(), seg.slice(i + 1).trim())
  }
  const t = parts.get('t')
  const digest = parts.get(mode === 'live' ? 'li' : 'te')
  if (!t || !digest || !/^\d+$/.test(t) || !/^[0-9a-f]+$/i.test(digest)) {
    return { ok: false, reason: 'malformed-header' }
  }
  if (isStale(Number(t), input)) return { ok: false, reason: 'stale' }

  const expected = await hmacSha256Hex(secret, `${t}.${rawBody}`)
  return timingSafeEqual(expected, digest.toLowerCase()) ? { ok: true } : { ok: false, reason: 'mismatch' }
}

export type Provider = 'paddle' | 'stripe' | 'paymongo'

/** Signature header name each provider sends. */
export const SIGNATURE_HEADER: Record<Provider, string> = {
  paddle: 'paddle-signature',
  stripe: 'stripe-signature',
  paymongo: 'paymongo-signature',
}

/** Verify under whichever provider is configured. */
export function verifySignature(
  provider: Provider, input: VerifyInput & { mode?: 'test' | 'live' },
): Promise<VerifyResult> {
  if (provider === 'paddle') return verifyPaddle(input)
  if (provider === 'stripe') return verifyStripe(input)
  return verifyPaymongo({ ...input, mode: input.mode ?? 'live' })
}
