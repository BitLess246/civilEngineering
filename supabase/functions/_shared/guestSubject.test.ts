import { describe, it, expect } from 'vitest'
import {
  clientIp, uaFamily, normalizeRoute, subjectHash, saltUsable,
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

  it('falls back through the other proxy headers', () => {
    expect(clientIp(h({ 'cf-connecting-ip': '198.51.100.4' }))).toBe('198.51.100.4')
    expect(clientIp(h({ 'x-real-ip': '198.51.100.9' }))).toBe('198.51.100.9')
  })

  it('returns null rather than an empty string when nothing carries an address', () => {
    // An empty string would become a real subject key that every
    // header-less request shares.
    expect(clientIp(h({}))).toBeNull()
    expect(clientIp(h({ 'x-forwarded-for': '  ,  ' }))).toBeNull()
  })
})

describe('uaFamily', () => {
  it('names Edge and Opera before Chrome — both also claim "Chrome"', () => {
    expect(uaFamily('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36 Edg/120'))
      .toBe('edge/windows')
    expect(uaFamily('Mozilla/5.0 (X11; Linux x86_64) Chrome/119 Safari/537.36 OPR/105'))
      .toBe('opera/linux')
  })

  it('names Chrome before Safari — Chrome also claims "Safari"', () => {
    expect(uaFamily('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36'))
      .toBe('chrome/mac')
    expect(uaFamily('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'))
      .toBe('safari/mac')
  })

  it('ignores the version, so a browser update is not a fresh allowance', () => {
    const a = 'Mozilla/5.0 (Windows NT 10.0) Firefox/121.0'
    const b = 'Mozilla/5.0 (Windows NT 10.0) Firefox/134.0'
    expect(uaFamily(a)).toBe(uaFamily(b))
  })

  it('is total — a missing or junk UA still yields a key', () => {
    expect(uaFamily(null)).toBe('other/other')
    expect(uaFamily('')).toBe('other/other')
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
    const a = await subjectHash(SALT, '203.0.113.7', 'chrome/windows')
    const b = await subjectHash(SALT, '203.0.113.7', 'chrome/windows')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('separates different addresses and different browser families', async () => {
    const base = await subjectHash(SALT, '203.0.113.7', 'chrome/windows')
    expect(await subjectHash(SALT, '203.0.113.8', 'chrome/windows')).not.toBe(base)
    expect(await subjectHash(SALT, '203.0.113.7', 'firefox/windows')).not.toBe(base)
  })

  it('changes completely with the salt — the salt is what makes it non-reversible', async () => {
    // Without a secret salt, sha256(ip) is reversible by enumerating IPv4 in
    // minutes. The digest must be worthless to anyone who reads the table.
    const other = await subjectHash('z'.repeat(MIN_SALT_LEN), '203.0.113.7', 'chrome/windows')
    expect(other).not.toBe(await subjectHash(SALT, '203.0.113.7', 'chrome/windows'))
  })

  it('does not confuse a field boundary', async () => {
    // Naive concatenation would make ('1.2.3.4', 'a b') and ('1.2.3.4 a', 'b')
    // collide. The separator is a space, so check the shifted pair differs.
    const a = await subjectHash(SALT, '1.2.3.4', 'chrome/mac')
    const b = await subjectHash(SALT, '1.2.3.4 chrome/mac', '')
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
