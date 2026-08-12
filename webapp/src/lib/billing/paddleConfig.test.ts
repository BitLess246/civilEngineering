import { describe, it, expect, vi, afterEach } from 'vitest'
import { readPaddleConfig, describeProblem, priceEnvKey, PAID_PLANS } from './paddleConfig'

/** A complete, valid sandbox env — each test spoils exactly one thing. */
const sandboxEnv = () => ({
  VITE_PADDLE_CLIENT_TOKEN: 'test_abc123',
  VITE_PADDLE_ENV: 'sandbox',
  VITE_PADDLE_PRICE_PRO_MONTHLY: 'pri_01pro_monthly',
  VITE_PADDLE_PRICE_PRO_ANNUAL: 'pri_01pro_annual',
  VITE_PADDLE_PRICE_MAX_MONTHLY: 'pri_01max_monthly',
  VITE_PADDLE_PRICE_MAX_ANNUAL: 'pri_01max_annual',
} as Record<string, unknown>)

const problemOf = (env: Record<string, unknown>) => {
  const r = readPaddleConfig(env)
  if (r.ok) throw new Error('expected the config to be rejected')
  return r.problem
}

describe('priceEnvKey', () => {
  it('names the four variables the seed script prints', () => {
    // The seed script writes these exact lines for pasting into .env; if the
    // two ever disagree the ids land in variables nothing reads.
    expect(priceEnvKey('pro', 'monthly')).toBe('VITE_PADDLE_PRICE_PRO_MONTHLY')
    expect(priceEnvKey('pro', 'annual')).toBe('VITE_PADDLE_PRICE_PRO_ANNUAL')
    expect(priceEnvKey('max', 'monthly')).toBe('VITE_PADDLE_PRICE_MAX_MONTHLY')
    expect(priceEnvKey('max', 'annual')).toBe('VITE_PADDLE_PRICE_MAX_ANNUAL')
  })
})

describe('readPaddleConfig — the happy path', () => {
  it('accepts a complete sandbox configuration', () => {
    const r = readPaddleConfig(sandboxEnv())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.config.environment).toBe('sandbox')
    expect(r.config.token).toBe('test_abc123')
    expect(r.config.prices.pro.annual).toBe('pri_01pro_annual')
    expect(r.config.prices.max.monthly).toBe('pri_01max_monthly')
  })

  it('accepts a complete production configuration', () => {
    const env = { ...sandboxEnv(), VITE_PADDLE_ENV: 'production', VITE_PADDLE_CLIENT_TOKEN: 'live_xyz' }
    const r = readPaddleConfig(env)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.config.environment).toBe('production')
  })

  it('covers every paid plan and period — no tier can be silently unbuyable', () => {
    const r = readPaddleConfig(sandboxEnv())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    for (const plan of PAID_PLANS) {
      for (const period of ['monthly', 'annual'] as const) {
        expect(r.config.prices[plan][period], `${plan}/${period}`).toMatch(/^pri_/)
      }
    }
  })

  it('tolerates surrounding whitespace, which .env files collect', () => {
    const env = { ...sandboxEnv(), VITE_PADDLE_CLIENT_TOKEN: '  test_abc123  ' }
    const r = readPaddleConfig(env)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.config.token).toBe('test_abc123')
  })
})

describe('readPaddleConfig — failing closed', () => {
  it('reports an unconfigured build as absent, not as an error', () => {
    // The ordinary state of a fresh clone. It must not log an error or read as
    // a broken deploy, but it must still leave checkout off.
    expect(problemOf({}).kind).toBe('absent')
  })

  it('rejects an environment name it does not recognise', () => {
    const p = problemOf({ ...sandboxEnv(), VITE_PADDLE_ENV: 'staging' })
    expect(p.kind).toBe('bad-environment')
  })

  it('REFUSES A LIVE TOKEN IN SANDBOX — the mistake that charges a real card', () => {
    // The asymmetric one. Testing against a live token means real money moves
    // during what everyone believes is a rehearsal, and no error message gets
    // that back. Booting without checkout is the cheap failure.
    const p = problemOf({ ...sandboxEnv(), VITE_PADDLE_CLIENT_TOKEN: 'live_realmoney' })
    expect(p.kind).toBe('token-environment-mismatch')
  })

  it('refuses a sandbox token in production, which could only ever fail', () => {
    const env = { ...sandboxEnv(), VITE_PADDLE_ENV: 'production' }
    expect(problemOf(env).kind).toBe('token-environment-mismatch')
  })

  it('refuses a token with no environment prefix at all', () => {
    const p = problemOf({ ...sandboxEnv(), VITE_PADDLE_CLIENT_TOKEN: 'abc123' })
    expect(p.kind).toBe('token-environment-mismatch')
  })

  it('names every missing price rather than the first one', () => {
    // A deploy that is fixed one variable at a time, redeploying between each,
    // is how a simple omission turns into four rounds of guessing.
    const env = sandboxEnv()
    delete env.VITE_PADDLE_PRICE_PRO_ANNUAL
    delete env.VITE_PADDLE_PRICE_MAX_MONTHLY
    const p = problemOf(env)
    expect(p.kind).toBe('missing-price')
    if (p.kind !== 'missing-price') return
    expect(p.keys).toEqual(['VITE_PADDLE_PRICE_PRO_ANNUAL', 'VITE_PADDLE_PRICE_MAX_MONTHLY'])
  })

  it('catches a product id pasted where a price id belongs', () => {
    // `pro_` and `pri_` differ by one character and sit next to each other in
    // the dashboard. Caught here, it is a console line; passed through, it is a
    // checkout that dies at Paddle in front of a customer.
    const p = problemOf({ ...sandboxEnv(), VITE_PADDLE_PRICE_PRO_MONTHLY: 'pro_01abc' })
    expect(p.kind).toBe('malformed-price')
    if (p.kind === 'malformed-price') expect(p.keys).toEqual(['VITE_PADDLE_PRICE_PRO_MONTHLY'])
  })

  it('treats a blank price id as missing, not as valid', () => {
    const p = problemOf({ ...sandboxEnv(), VITE_PADDLE_PRICE_MAX_ANNUAL: '   ' })
    expect(p.kind).toBe('missing-price')
  })

  it('never returns a config alongside a problem', () => {
    // The property the call sites lean on: `ok: false` means there is nothing
    // to open a checkout with, so no caller has to check twice.
    for (const env of [{}, { ...sandboxEnv(), VITE_PADDLE_ENV: 'nope' }]) {
      const r = readPaddleConfig(env)
      expect(r.ok).toBe(false)
      expect(r).not.toHaveProperty('config')
    }
  })
})

describe('the module-level wiring', () => {
  // `readPaddleConfig` being right is worth nothing if the values never reach
  // it. These load the module for real, against a stubbed `import.meta.env`,
  // so they cover the one link a pure test cannot: Vite's env inlining into
  // CHECKOUT_ENABLED, which is what actually decides whether the pricing page
  // grows a Buy button.
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  const stubSandbox = () => {
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', 'test_abc123')
    vi.stubEnv('VITE_PADDLE_ENV', 'sandbox')
    vi.stubEnv('VITE_PADDLE_PRICE_PRO_MONTHLY', 'pri_01pro_monthly')
    vi.stubEnv('VITE_PADDLE_PRICE_PRO_ANNUAL', 'pri_01pro_annual')
    vi.stubEnv('VITE_PADDLE_PRICE_MAX_MONTHLY', 'pri_01max_monthly')
    vi.stubEnv('VITE_PADDLE_PRICE_MAX_ANNUAL', 'pri_01max_annual')
  }

  it('turns checkout ON when the environment carries a full configuration', async () => {
    stubSandbox()
    vi.resetModules()
    const mod = await import('./paddleConfig')
    expect(mod.CHECKOUT_ENABLED).toBe(true)
    expect(mod.PADDLE_CONFIG?.prices.max.annual).toBe('pri_01max_annual')
  })

  it('leaves checkout OFF when one variable is missing', async () => {
    stubSandbox()
    vi.stubEnv('VITE_PADDLE_PRICE_MAX_ANNUAL', '')
    vi.resetModules()
    const mod = await import('./paddleConfig')
    expect(mod.CHECKOUT_ENABLED).toBe(false)
    expect(mod.PADDLE_CONFIG).toBeNull()
  })

  it('shouts on the console for a broken configuration, but stays quiet for an absent one', async () => {
    // A staging deploy with a typo must announce itself; a fresh clone with
    // nothing set is not an error and must not cry wolf.
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})

    stubSandbox()
    vi.stubEnv('VITE_PADDLE_ENV', 'staging')
    vi.resetModules()
    await import('./paddleConfig')
    expect(err).toHaveBeenCalledTimes(1)

    err.mockClear()
    vi.unstubAllEnvs()
    vi.stubEnv('VITE_PADDLE_CLIENT_TOKEN', '')
    vi.stubEnv('VITE_PADDLE_ENV', '')
    vi.resetModules()
    await import('./paddleConfig')
    expect(err).not.toHaveBeenCalled()

    err.mockRestore()
  })
})

describe('describeProblem', () => {
  it('names the variable to fix for every problem kind', () => {
    const kinds = [
      problemOf({}),
      problemOf({ ...sandboxEnv(), VITE_PADDLE_ENV: 'staging' }),
      problemOf({ ...sandboxEnv(), VITE_PADDLE_CLIENT_TOKEN: 'live_x' }),
      problemOf({ ...sandboxEnv(), VITE_PADDLE_PRICE_PRO_MONTHLY: '' }),
      problemOf({ ...sandboxEnv(), VITE_PADDLE_PRICE_PRO_MONTHLY: 'pro_01abc' }),
    ]
    for (const p of kinds) {
      const msg = describeProblem(p)
      expect(msg.length, p.kind).toBeGreaterThan(20)
      expect(msg, p.kind).toMatch(/VITE_PADDLE/)
    }
  })
})
