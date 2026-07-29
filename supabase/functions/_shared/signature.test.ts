import { describe, it, expect } from 'vitest'
import {
  timingSafeEqual, hmacSha256Hex, verifyPaddle, verifyStripe, verifyPaymongo,
  verifySignature, SIGNATURE_HEADER, DEFAULT_TOLERANCE_S,
} from './signature'

const SECRET = 'whsec_test_2f8a9c1e4b6d'
const BODY = '{"event_id":"evt_1","data":{"status":"active"}}'
const NOW = 1_800_000_000

describe('timingSafeEqual', () => {
  it('matches identical strings and rejects any difference', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
    expect(timingSafeEqual('abc', 'abd')).toBe(false)
    expect(timingSafeEqual('abc', 'ab')).toBe(false)
    expect(timingSafeEqual('', '')).toBe(true)
    expect(timingSafeEqual('a', '')).toBe(false)
  })

  it('does not short-circuit on the first differing character', () => {
    // Both comparisons must do the same work. This cannot assert wall-clock
    // timing reliably in CI, so it asserts the observable proxy: a mismatch in
    // position 0 and one in the last position both simply return false, with
    // no length- or prefix-dependent early exit visible in behaviour.
    const a = 'f'.repeat(64)
    expect(timingSafeEqual(a, 'e' + a.slice(1))).toBe(false)
    expect(timingSafeEqual(a, a.slice(0, 63) + 'e')).toBe(false)
  })
})

describe('hmacSha256Hex', () => {
  it('matches a known RFC-style vector', async () => {
    // HMAC-SHA256(key='key', msg='The quick brown fox jumps over the lazy dog')
    expect(await hmacSha256Hex('key', 'The quick brown fox jumps over the lazy dog'))
      .toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8')
  })

  it('is lowercase hex of full digest length', async () => {
    const h = await hmacSha256Hex(SECRET, BODY)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('verifyPaddle', () => {
  const sign = async (body = BODY, ts = NOW, secret = SECRET) =>
    `ts=${ts};h1=${await hmacSha256Hex(secret, `${ts}:${body}`)}`

  it('accepts a correctly signed body', async () => {
    const r = await verifyPaddle({ rawBody: BODY, header: await sign(), secret: SECRET, nowS: NOW })
    expect(r.ok).toBe(true)
  })

  it('rejects a body altered after signing', async () => {
    const header = await sign()
    const r = await verifyPaddle({ rawBody: BODY.replace('active', 'canceled'), header, secret: SECRET, nowS: NOW })
    expect(r).toEqual({ ok: false, reason: 'mismatch' })
  })

  it('rejects a signature made with a different secret', async () => {
    const header = await sign(BODY, NOW, 'whsec_attacker')
    expect(await verifyPaddle({ rawBody: BODY, header, secret: SECRET, nowS: NOW }))
      .toEqual({ ok: false, reason: 'mismatch' })
  })

  it('rejects a replay outside the tolerance window, in BOTH directions', async () => {
    const old = await sign(BODY, NOW - DEFAULT_TOLERANCE_S - 1)
    expect(await verifyPaddle({ rawBody: BODY, header: old, secret: SECRET, nowS: NOW }))
      .toEqual({ ok: false, reason: 'stale' })
    const future = await sign(BODY, NOW + DEFAULT_TOLERANCE_S + 1)
    expect(await verifyPaddle({ rawBody: BODY, header: future, secret: SECRET, nowS: NOW }))
      .toEqual({ ok: false, reason: 'stale' })
  })

  it('accepts right at the tolerance boundary', async () => {
    const edge = await sign(BODY, NOW - DEFAULT_TOLERANCE_S)
    expect((await verifyPaddle({ rawBody: BODY, header: edge, secret: SECRET, nowS: NOW })).ok).toBe(true)
  })

  it('FAILS CLOSED with no secret configured', async () => {
    expect(await verifyPaddle({ rawBody: BODY, header: await sign(), secret: undefined, nowS: NOW }))
      .toEqual({ ok: false, reason: 'no-secret' })
    expect(await verifyPaddle({ rawBody: BODY, header: await sign(), secret: '', nowS: NOW }))
      .toEqual({ ok: false, reason: 'no-secret' })
  })

  it('rejects malformed or missing headers rather than throwing', async () => {
    for (const header of [null, '', 'garbage', 'ts=abc;h1=deadbeef', 'ts=123', 'h1=deadbeef', 'ts=123;h1=zzz']) {
      const r = await verifyPaddle({ rawBody: BODY, header, secret: SECRET, nowS: NOW })
      expect(r.ok, String(header)).toBe(false)
      if (!r.ok) expect(['malformed-header', 'stale']).toContain(r.reason)
    }
  })
})

describe('verifyStripe', () => {
  const sign = async (body = BODY, t = NOW, secret = SECRET) =>
    `t=${t},v1=${await hmacSha256Hex(secret, `${t}.${body}`)}`

  it('accepts a correctly signed body', async () => {
    expect((await verifyStripe({ rawBody: BODY, header: await sign(), secret: SECRET, nowS: NOW })).ok).toBe(true)
  })

  it('accepts when ANY v1 matches, as during secret rotation', async () => {
    const good = await hmacSha256Hex(SECRET, `${NOW}.${BODY}`)
    const header = `t=${NOW},v1=${'0'.repeat(64)},v1=${good}`
    expect((await verifyStripe({ rawBody: BODY, header, secret: SECRET, nowS: NOW })).ok).toBe(true)
  })

  it('rejects when no v1 matches', async () => {
    const header = `t=${NOW},v1=${'0'.repeat(64)},v1=${'1'.repeat(64)}`
    expect(await verifyStripe({ rawBody: BODY, header, secret: SECRET, nowS: NOW }))
      .toEqual({ ok: false, reason: 'mismatch' })
  })

  it('rejects a tampered body and a stale timestamp', async () => {
    expect(await verifyStripe({ rawBody: BODY + ' ', header: await sign(), secret: SECRET, nowS: NOW }))
      .toEqual({ ok: false, reason: 'mismatch' })
    expect(await verifyStripe({ rawBody: BODY, header: await sign(BODY, NOW - 999), secret: SECRET, nowS: NOW }))
      .toEqual({ ok: false, reason: 'stale' })
  })

  it('fails closed with no secret and on malformed headers', async () => {
    expect((await verifyStripe({ rawBody: BODY, header: await sign(), secret: undefined, nowS: NOW })).ok).toBe(false)
    for (const header of [null, 'v1=abc', `t=${NOW}`, 't=x,v1=abc']) {
      expect((await verifyStripe({ rawBody: BODY, header, secret: SECRET, nowS: NOW })).ok, String(header)).toBe(false)
    }
  })
})

describe('verifyPaymongo', () => {
  const sign = async (opts: { body?: string; t?: number; secret?: string; te?: string; li?: string } = {}) => {
    const { body = BODY, t = NOW, secret = SECRET } = opts
    const d = await hmacSha256Hex(secret, `${t}.${body}`)
    return `t=${t},te=${opts.te ?? d},li=${opts.li ?? d}`
  }

  it('accepts a correctly signed live event', async () => {
    expect((await verifyPaymongo({ rawBody: BODY, header: await sign(), secret: SECRET, nowS: NOW, mode: 'live' })).ok)
      .toBe(true)
  })

  it('accepts a correctly signed test event in test mode', async () => {
    expect((await verifyPaymongo({ rawBody: BODY, header: await sign(), secret: SECRET, nowS: NOW, mode: 'test' })).ok)
      .toBe(true)
  })

  it('does NOT let a valid test signature approve a live event', async () => {
    // The whole reason mode is explicit: test keys circulate far more freely,
    // and accepting whichever digest happens to match would make one enough.
    const good = await hmacSha256Hex(SECRET, `${NOW}.${BODY}`)
    const header = `t=${NOW},te=${good},li=${'0'.repeat(64)}`
    expect(await verifyPaymongo({ rawBody: BODY, header, secret: SECRET, nowS: NOW, mode: 'live' }))
      .toEqual({ ok: false, reason: 'mismatch' })
    // …and the same header is fine when the endpoint IS in test mode
    expect((await verifyPaymongo({ rawBody: BODY, header, secret: SECRET, nowS: NOW, mode: 'test' })).ok).toBe(true)
  })

  it('rejects tampering, staleness, a missing secret and junk headers', async () => {
    expect((await verifyPaymongo({ rawBody: '{}', header: await sign(), secret: SECRET, nowS: NOW, mode: 'live' })).ok).toBe(false)
    expect(await verifyPaymongo({ rawBody: BODY, header: await sign({ t: NOW - 9999 }), secret: SECRET, nowS: NOW, mode: 'live' }))
      .toEqual({ ok: false, reason: 'stale' })
    expect(await verifyPaymongo({ rawBody: BODY, header: await sign(), secret: undefined, nowS: NOW, mode: 'live' }))
      .toEqual({ ok: false, reason: 'no-secret' })
    for (const header of [null, 'nonsense', `t=${NOW}`, `t=x,li=abc`]) {
      expect((await verifyPaymongo({ rawBody: BODY, header, secret: SECRET, nowS: NOW, mode: 'live' })).ok, String(header)).toBe(false)
    }
  })
})

describe('verifySignature dispatch', () => {
  it('routes to the right verifier for each provider', async () => {
    const paddle = `ts=${NOW};h1=${await hmacSha256Hex(SECRET, `${NOW}:${BODY}`)}`
    const dotted = await hmacSha256Hex(SECRET, `${NOW}.${BODY}`)
    expect((await verifySignature('paddle', { rawBody: BODY, header: paddle, secret: SECRET, nowS: NOW })).ok).toBe(true)
    expect((await verifySignature('stripe', { rawBody: BODY, header: `t=${NOW},v1=${dotted}`, secret: SECRET, nowS: NOW })).ok).toBe(true)
    expect((await verifySignature('paymongo', { rawBody: BODY, header: `t=${NOW},li=${dotted}`, secret: SECRET, nowS: NOW })).ok).toBe(true)
  })

  it('does not accept one provider’s header format under another', async () => {
    const paddle = `ts=${NOW};h1=${await hmacSha256Hex(SECRET, `${NOW}:${BODY}`)}`
    expect((await verifySignature('stripe', { rawBody: BODY, header: paddle, secret: SECRET, nowS: NOW })).ok).toBe(false)
    expect((await verifySignature('paymongo', { rawBody: BODY, header: paddle, secret: SECRET, nowS: NOW })).ok).toBe(false)
  })

  it('names a header for every provider it can dispatch to', () => {
    for (const p of ['paddle', 'stripe', 'paymongo'] as const) {
      expect(SIGNATURE_HEADER[p], p).toBeTruthy()
      expect(SIGNATURE_HEADER[p], p).toBe(SIGNATURE_HEADER[p].toLowerCase())
    }
  })
})
