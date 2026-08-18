// Which Paddle environment does the seed script target?
//
// This is one ternary, and it had a cutover-day fuse on it. The script accepted
// only `PADDLE_ENV=live`; `docs/Billing.md` and every Edge Function say
// `production`. So the documented go-live command —
//
//   PADDLE_ENV=production PADDLE_API_KEY=pdl_live_… npx tsx …
//
// — fell through to SANDBOX, pointing the SDK at the sandbox API while holding
// a live key. It fails rather than creating a live catalog by accident, which
// is the right direction, but it fails in the one hour where nobody wants to be
// debugging vocabulary.
//
// Read out of the source rather than executed: the script talks to Paddle at
// import time, and the value under test is a constant expression.

import { describe, it, expect } from 'vitest'
import src from './seed-paddle-catalog.ts?raw'

/** Reproduces the script's selection, so the cases below are the real rule. */
function envNameFor(value: string | undefined): 'live' | 'sandbox' {
  const wanted = (value ?? '').trim().toLowerCase()
  return wanted === 'live' || wanted === 'production' ? 'live' : 'sandbox'
}

describe('the rule the script implements', () => {
  it('is the one this test reproduces', () => {
    // Guard the guard: if the source stops matching, these cases prove nothing.
    expect(src).toContain('wanted === "live" || wanted === "production"')
    expect(src).toMatch(/\.trim\(\)\.toLowerCase\(\)/)
  })
})

describe('PADDLE_ENV', () => {
  it('accepts the word the rest of the system uses', () => {
    // The one that was broken.
    expect(envNameFor('production')).toBe('live')
  })

  it('still accepts the word the script always used', () => {
    // Nobody's muscle memory or shell history should break for this fix.
    expect(envNameFor('live')).toBe('live')
  })

  it('is not case- or whitespace-sensitive', () => {
    for (const v of ['Production', 'LIVE', ' production ', 'Live\n']) {
      expect(envNameFor(v), v).toBe('live')
    }
  })

  it('defaults to sandbox when absent or unrecognised', () => {
    // The safe direction: guessing wrong the other way creates a LIVE catalog
    // by accident, and re-running is how duplicate products appear.
    for (const v of [undefined, '', '   ', 'sandbox', 'prod', 'staging', 'true']) {
      expect(envNameFor(v), String(v)).toBe('sandbox')
    }
  })
})

describe('the script says which catalog it built', () => {
  it('prints the environment in the header', () => {
    // The one-line confirmation that the command did what was intended, and
    // the thing to read before trusting the printed ids.
    expect(src).toMatch(/CATALOG IDs \(\$\{envName\}\)/)
  })

  it('still warns that re-running duplicates products', () => {
    expect(src).toMatch(/RE-RUNNING CREATES DUPLICATES/)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// THE PRICE MAP THE SCRIPT PRINTS IS PASTED STRAIGHT INTO A SECRET.
//
// So what it prints has to be the form the functions actually want. It printed
// the bare `pri_x=pro` shape, which the WEBHOOK reads fine — and which loses
// the information `billing-change-plan` needs. With no period, a move between
// two periods of the same plan has planDelta 0 and periodDelta 0, so it lands
// in the downgrade branch: Pro monthly → Pro annual gets deferred to the next
// billing period instead of being charged immediately.
//
// Nothing would look broken. The upgrade would simply arrive late and cheap.
// ─────────────────────────────────────────────────────────────────────────
describe('the printed BILLING_PRICE_MAP', () => {
  it('carries the :period suffix on every entry', () => {
    expect(src).toMatch(/\}=\$\{t\.key\}:monthly/)
    expect(src).toMatch(/\}=\$\{t\.key\}:annual/)
  })

  it('does not print the bare plan form that loses the period', () => {
    // `pri_x=pro` with nothing after it. Accepted by both readers, and silently
    // degrades plan switching.
    const line = src.slice(src.indexOf('BILLING_PRICE_MAP'), src.indexOf('# webapp/.env'))
    expect(line).not.toMatch(/=\$\{t\.key\}`/)
  })

  it('still prints the four VITE price vars', () => {
    expect(src).toMatch(/VITE_PADDLE_PRICE_\$\{t\.key\.toUpperCase\(\)\}_MONTHLY/)
    expect(src).toMatch(/VITE_PADDLE_PRICE_\$\{t\.key\.toUpperCase\(\)\}_ANNUAL/)
  })
})

describe('the seeded amounts match what the pricing page advertises', () => {
  // plans.ts says $19 / $205 and $49 / $529. Cents, so 1900 not 19 — seeding
  // 19 would create a $0.19 subscription and nobody would notice until the
  // first payout.
  it('pro', () => {
    expect(src).toMatch(/monthly: "1900"/)
    expect(src).toMatch(/annual: "20500"/)
  })
  it('max', () => {
    expect(src).toMatch(/monthly: "4900"/)
    expect(src).toMatch(/annual: "52900"/)
  })
})
