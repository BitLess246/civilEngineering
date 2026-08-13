import { describe, it, expect } from 'vitest'
import {
  clientIp, normalizeRoute, subjectHash, saltUsable,
  ROUTE_MAX_LEN, MIN_SALT_LEN,
} from './guestSubject.ts'

const h = (o: Record<string, string>) => new Headers(o)

describe('clientIp', () => {
  it('takes the FIRST entry of x-forwarded-for, not the last', () => {
    // The last entry is the nearest proxy. Reading it keys every visitor
    // behind that proxy to one subject — one shared allowance for everybody.
    expect(clientIp(h({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' })))
      .toBe('203.0.113.7')
  })

  it('prefers the Vercel header, which a caller cannot set', () => {
    expect(clientIp(h({
      'x-vercel-forwarded-for': '203.0.113.9',
      'x-forwarded-for': '198.51.100.1',
    }))).toBe('203.0.113.9')
  })

  it('IGNORES cf-connecting-ip and x-real-ip — nothing in front of us sets them', () => {
    // These were fallbacks. Since no Cloudflare and no nginx sits in this path,
    // the only way either arrives is from the caller, so honouring one is a way
    // to mint a fresh subject — and a fresh allowance — with one extra header.
    expect(clientIp(h({ 'cf-connecting-ip': '198.51.100.4' }))).toBeNull()
    expect(clientIp(h({ 'x-real-ip': '198.51.100.9' }))).toBeNull()
  })

  it('returns null rather than an empty string when nothing carries an address', () => {
    // An empty string would become a real subject key that every
    // header-less request shares.
    expect(clientIp(h({}))).toBeNull()
    expect(clientIp(h({ 'x-forwarded-for': '  ,  ' }))).toBeNull()
  })
})

describe('normalizeRoute', () => {
  it('collapses the trailing slash so one page is one row', () => {
    expect(normalizeRoute('/beam-design/')).toBe('/beam-design')
    expect(normalizeRoute('/beam-design')).toBe('/beam-design')
  })

  it('strips query and hash', () => {
    expect(normalizeRoute('/foundation?tab=2#results')).toBe('/foundation')
  })

  it('keeps the root as "/"', () => {
    expect(normalizeRoute('/')).toBe('/')
  })

  it('refuses anything that is not a plain path', () => {
    // The route column must not become free storage or a log-injection vector.
    for (const bad of [
      'beam-design',                       // no leading slash
      'https://evil.test/x',               // absolute URL
      '/x'.padEnd(ROUTE_MAX_LEN + 2, 'y'), // over length
      '/a b',                              // space
      '/a\nb',                             // newline
      '/a;drop',                           // punctuation outside the charset
      123, null, undefined, {},            // not a string at all
    ] as unknown[]) {
      expect(normalizeRoute(bad)).toBeNull()
    }
  })
})

describe('subjectHash', () => {
  const SALT = 'x'.repeat(MIN_SALT_LEN)

  it('is stable for the same visitor', async () => {
    const a = await subjectHash(SALT, '203.0.113.7')
    const b = await subjectHash(SALT, '203.0.113.7')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('separates different addresses', async () => {
    const base = await subjectHash(SALT, '203.0.113.7')
    expect(await subjectHash(SALT, '203.0.113.8')).not.toBe(base)
  })

  it('changes completely with the salt — the salt is what makes it non-reversible', async () => {
    // Without a secret salt, sha256(ip) is reversible by enumerating IPv4 in
    // minutes. The digest must be worthless to anyone who reads the table.
    const other = await subjectHash('z'.repeat(MIN_SALT_LEN), '203.0.113.7')
    expect(other).not.toBe(await subjectHash(SALT, '203.0.113.7'))
  })

  it('separates the salt from the address', async () => {
    // Naive concatenation would let a salt ending in the first octet collide
    // with a shorter salt and a longer address. The NUL separator is what stops
    // it, and it has been silently lost once already — see subject.test.ts.
    const a = await subjectHash('x'.repeat(MIN_SALT_LEN), '1.2.3.4')
    const b = await subjectHash('x'.repeat(MIN_SALT_LEN - 1), 'x1.2.3.4')
    expect(a).not.toBe(b)
  })
})

describe('saltUsable', () => {
  it('rejects absent, blank and short salts', () => {
    expect(saltUsable(undefined)).toBe(false)
    expect(saltUsable(null)).toBe(false)
    expect(saltUsable('')).toBe(false)
    expect(saltUsable('   ')).toBe(false)
    expect(saltUsable('short')).toBe(false)
    expect(saltUsable('x'.repeat(MIN_SALT_LEN - 1))).toBe(false)
  })

  it('accepts a salt of at least the minimum length', () => {
    expect(saltUsable('x'.repeat(MIN_SALT_LEN))).toBe(true)
  })
})
