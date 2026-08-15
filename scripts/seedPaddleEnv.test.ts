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
