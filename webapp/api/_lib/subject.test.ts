// The two halves of the guest counter must agree on WHO the guest is.
//
// `guest-quota` (Deno, called by the browser) and this endpoint (Vercel Edge)
// write the same `guest_trials` rows. If their subject derivations ever differ
// by one character, the digests differ completely and one visitor quietly gets
// two allowances — no error, no crash, just a counter that does not count.
//
// So the copy is tested against the original rather than trusted. Importing the
// Deno module directly is deliberate: a text diff would pass on two files that
// format the same logic differently and fail on a harmless comment edit,
// whereas this fails only when an ANSWER changes.

import { describe, it, expect } from 'vitest'
import * as edge from './subject'
import * as deno from '../../../supabase/functions/_shared/guestSubject.ts'
import edgeSrc from './subject.ts?raw'
import denoSrc from '../../../supabase/functions/_shared/guestSubject.ts?raw'

const IPS = [
  '203.0.113.7', '::1', '2001:db8::1', '10.0.0.1', '198.51.100.42',
]

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36 Edg/120',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36 OPR/106',
  'curl/8.4.0',
  '',
]

const SALT = 'a'.repeat(32)

describe('the Edge copy answers exactly like the Deno original', () => {
  it('uaFamily agrees on every user agent, including the odd ones', () => {
    for (const ua of [...UAS, null]) {
      expect(edge.uaFamily(ua), `ua=${ua}`).toBe(deno.uaFamily(ua))
    }
  })

  it('subjectHash agrees across the whole ip × ua matrix', async () => {
    for (const ip of IPS) {
      for (const ua of UAS) {
        const family = edge.uaFamily(ua)
        expect(await edge.subjectHash(SALT, ip, family))
          .toBe(await deno.subjectHash(SALT, ip, family))
      }
    }
  })

  it('normalizeRoute agrees, including on the values it rejects', () => {
    const routes: unknown[] = [
      '/steel/beam', '/steel/beam/', '/bolted-connection', '/', '/a?b=1', '/a#x',
      'steel/beam', '', '/' + 'x'.repeat(80), '/bad chars', '/under_score',
      42, null, undefined, {},
    ]
    for (const r of routes) {
      expect(edge.normalizeRoute(r), `route=${String(r)}`).toBe(deno.normalizeRoute(r))
    }
  })

  it('clientIp agrees, and both take the FIRST hop of the chain', () => {
    const cases: Record<string, string>[] = [
      { 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' },
      { 'x-forwarded-for': '  203.0.113.7  ' },
      { 'x-forwarded-for': '', 'x-real-ip': '198.51.100.9' },
      { 'cf-connecting-ip': '198.51.100.10' },
      { 'x-real-ip': '198.51.100.11' },
      {},
    ]
    for (const c of cases) {
      const h = new Headers(c)
      expect(edge.clientIp(h), JSON.stringify(c)).toBe(deno.clientIp(new Headers(c)))
    }
    // The slip this guards against: the LAST hop is the proxy, and using it
    // keys every visitor behind that proxy to one subject.
    expect(edge.clientIp(new Headers({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18' })))
      .toBe('203.0.113.7')
  })

  it('agrees on which salts are usable, and on the constants', () => {
    for (const s of ['', 'short', 'a'.repeat(23), 'a'.repeat(24), 'a'.repeat(64), null, undefined]) {
      expect(edge.saltUsable(s), `salt len ${s?.length}`).toBe(deno.saltUsable(s))
    }
    expect(edge.MIN_SALT_LEN).toBe(deno.MIN_SALT_LEN)
    expect(edge.ROUTE_MAX_LEN).toBe(deno.ROUTE_MAX_LEN)
    expect(edge.ROUTE_CAP_PER_SUBJECT).toBe(deno.ROUTE_CAP_PER_SUBJECT)
  })
})

describe('the properties the database relies on', () => {
  it('produces exactly 64 hex chars — what claim_guest_run checks', async () => {
    const h = await edge.subjectHash(SALT, '203.0.113.7', 'chrome/windows')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it('separates visitors, and keeps one visitor stable', async () => {
    const a = await edge.subjectHash(SALT, '203.0.113.7', 'chrome/windows')
    const b = await edge.subjectHash(SALT, '203.0.113.8', 'chrome/windows')
    const c = await edge.subjectHash(SALT, '203.0.113.7', 'firefox/windows')
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
    expect(await edge.subjectHash(SALT, '203.0.113.7', 'chrome/windows')).toBe(a)
  })

  it('changes completely with the salt, which is why the salt must be secret', async () => {
    const a = await edge.subjectHash('a'.repeat(32), '203.0.113.7', 'chrome/windows')
    const b = await edge.subjectHash('b'.repeat(32), '203.0.113.7', 'chrome/windows')
    expect(a).not.toBe(b)
  })

  it('hashes with a NUL separator, written as an escape and never as a raw byte', () => {
    // This test exists because the two copies once disagreed, and the reason
    // was invisible: the Deno file held LITERAL NUL bytes, so it read back as
    // a space and git called the file binary. A raw NUL is trivial for an
    // editor, a linter or a copy-paste to normalise away — and doing so gives
    // every existing guest a fresh allowance without anything looking broken.
    // `?raw` rather than node:fs — the API project deliberately carries no
    // @types/node, because these functions must not reach for Node builtins.
    const sources: [string, string][] = [
      ['api/_lib/subject.ts', edgeSrc],
      ['supabase/functions/_shared/guestSubject.ts', denoSrc],
    ]
    for (const [name, src] of sources) {
      expect(src.includes('\0'), `${name} contains a raw NUL byte`).toBe(false)
      expect(src, name).toContain('`${salt}\\0${ip}\\0${family}`')
    }
  })

  it('drops the browser version, so an update does not reset the allowance', () => {
    const v120 = edge.uaFamily('Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36')
    const v121 = edge.uaFamily('Mozilla/5.0 (Windows NT 10.0) Chrome/121 Safari/537.36')
    expect(v120).toBe(v121)
    expect(v120).toBe('chrome/windows')
  })
})
