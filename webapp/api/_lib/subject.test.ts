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

// The User-Agent matrix that used to live here is gone with the input it fed.
// `quota.test.ts` asserts the behavioural half — that four wildly different
// agents now produce ONE subject.

const SALT = 'a'.repeat(32)

describe('the Edge copy answers exactly like the Deno original', () => {
  it('subjectHash agrees on every address', async () => {
    for (const ip of IPS) {
      expect(await edge.subjectHash(SALT, ip), `ip=${ip}`)
        .toBe(await deno.subjectHash(SALT, ip))
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

  it('clientIp agrees, including on the headers both now ignore', () => {
    const cases: Record<string, string>[] = [
      { 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' },
      { 'x-forwarded-for': '  203.0.113.7  ' },
      { 'x-forwarded-for': '', 'x-real-ip': '198.51.100.9' },
      { 'cf-connecting-ip': '198.51.100.10' },
      { 'x-real-ip': '198.51.100.11' },
      { 'x-vercel-forwarded-for': '203.0.113.9' },
      { 'x-vercel-forwarded-for': '203.0.113.9', 'x-forwarded-for': '198.51.100.1' },
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

  it('both prefer the platform header, and both ignore the caller-set ones', () => {
    // `cf-connecting-ip` and `x-real-ip` are set by nothing in front of either
    // deployment, so the only way one arrives is from the caller. Honouring
    // them means a fresh subject — and a fresh allowance — per request.
    for (const mod of [edge, deno]) {
      expect(mod.clientIp(new Headers({ 'cf-connecting-ip': '198.51.100.10' }))).toBeNull()
      expect(mod.clientIp(new Headers({ 'x-real-ip': '198.51.100.11' }))).toBeNull()
      expect(mod.clientIp(new Headers({
        'x-vercel-forwarded-for': '203.0.113.9',
        'x-forwarded-for': '198.51.100.1',
      }))).toBe('203.0.113.9')
    }
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
    const h = await edge.subjectHash(SALT, '203.0.113.7')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it('separates visitors, and keeps one visitor stable', async () => {
    const a = await edge.subjectHash(SALT, '203.0.113.7')
    const b = await edge.subjectHash(SALT, '203.0.113.8')
    expect(a).not.toBe(b)
    expect(await edge.subjectHash(SALT, '203.0.113.7')).toBe(a)
  })

  it('changes completely with the salt, which is why the salt must be secret', async () => {
    const a = await edge.subjectHash('a'.repeat(32), '203.0.113.7')
    const b = await edge.subjectHash('b'.repeat(32), '203.0.113.7')
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
      expect(src, name).toContain('`${salt}\\0${ip}`')
    }
  })

  it('takes NOTHING the caller chooses — neither copy mentions the User-Agent', () => {
    // The User-Agent was an input and is not any more: it is picked by the
    // caller in full, so its 36 engine/platform buckets were 36 subjects
    // reachable from devtools. A source guard rather than a behavioural one,
    // because "the UA is absent from the derivation" leaves no observable
    // signature once it is genuinely gone.
    for (const [name, src] of [
      ['api/_lib/subject.ts', edgeSrc],
      ['supabase/functions/_shared/guestSubject.ts', denoSrc],
    ] as [string, string][]) {
      const fn = src.slice(src.indexOf('export async function subjectHash'))
      expect(fn, name).not.toMatch(/user-agent|uaFamily|family/i)
    }
    expect('uaFamily' in edge, 'uaFamily is gone from the Edge copy').toBe(false)
    expect('uaFamily' in deno, 'uaFamily is gone from the Deno copy').toBe(false)
  })
})
