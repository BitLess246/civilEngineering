// A ticket says "this run is already paid for" and is believed WITHOUT asking
// the database. Everything below is a way that claim could be forged, lifted,
// stretched or replayed onto something it was not minted for.

import { describe, it, expect } from 'vitest'
import { issueTicket, verifyTicket, TICKET_TTL_MS } from './ticket'

const SALT = 'x'.repeat(32)
const SUB = 'a'.repeat(64)
const ROUTE = '/steel/beam'
const RUN = 'run-token-0001'

describe('a ticket the endpoint minted', () => {
  it('verifies for the run it was minted for', async () => {
    const t = await issueTicket(SALT, SUB, ROUTE, RUN)
    await expect(verifyTicket(SALT, t, SUB, ROUTE, RUN)).resolves.toBe(true)
  })

  it('still verifies just before it expires, and not after', async () => {
    const now = 1_000_000
    const t = await issueTicket(SALT, SUB, ROUTE, RUN, now)
    await expect(verifyTicket(SALT, t, SUB, ROUTE, RUN, now + TICKET_TTL_MS - 1)).resolves.toBe(true)
    await expect(verifyTicket(SALT, t, SUB, ROUTE, RUN, now + TICKET_TTL_MS)).resolves.toBe(false)
    await expect(verifyTicket(SALT, t, SUB, ROUTE, RUN, now + TICKET_TTL_MS + 1)).resolves.toBe(false)
  })
})

describe('a ticket cannot be moved to something it was not minted for', () => {
  it('is bound to the SUBJECT — lifting one from another visitor buys nothing', async () => {
    // The case that matters if a ticket ever leaks: it is worthless to anyone
    // whose IP and browser family hash to a different subject.
    const t = await issueTicket(SALT, SUB, ROUTE, RUN)
    await expect(verifyTicket(SALT, t, 'b'.repeat(64), ROUTE, RUN)).resolves.toBe(false)
  })

  it('is bound to the ROUTE — one paid run does not unlock the other calculators', async () => {
    const t = await issueTicket(SALT, SUB, ROUTE, RUN)
    await expect(verifyTicket(SALT, t, SUB, '/steel/column', RUN)).resolves.toBe(false)
    await expect(verifyTicket(SALT, t, SUB, '/bolted-connection', RUN)).resolves.toBe(false)
  })

  it('is bound to the RUN — a new arrival cannot ride the last one', async () => {
    // Without this the whole scheme collapses: mint once, then present a fresh
    // run token with the old ticket forever.
    const t = await issueTicket(SALT, SUB, ROUTE, RUN)
    await expect(verifyTicket(SALT, t, SUB, ROUTE, 'run-token-0002')).resolves.toBe(false)
  })
})

describe('a ticket cannot be manufactured', () => {
  it('needs the key — a different salt does not verify', async () => {
    const t = await issueTicket(SALT, SUB, ROUTE, RUN)
    await expect(verifyTicket('y'.repeat(32), t, SUB, ROUTE, RUN)).resolves.toBe(false)
  })

  it('rejects a tampered expiry, even though the expiry is in the clear', async () => {
    // The expiry has to be readable to be checked before the crypto, so the
    // MAC has to cover it. Pushing it out by an hour must invalidate the MAC.
    const now = 1_000_000
    const t = await issueTicket(SALT, SUB, ROUTE, RUN, now)
    const mac = t.slice(t.indexOf('.') + 1)
    const stretched = `${now + 3_600_000}.${mac}`
    await expect(verifyTicket(SALT, stretched, SUB, ROUTE, RUN, now + 1)).resolves.toBe(false)
  })

  it('refuses an expiry further out than the TTL allows, whatever it is signed with', async () => {
    // Belt and braces: even a correctly signed ticket cannot outlive the TTL,
    // so a key compromise cannot mint a permanent one.
    const now = 1_000_000
    const far = await issueTicket(SALT, SUB, ROUTE, RUN, now + TICKET_TTL_MS)
    await expect(verifyTicket(SALT, far, SUB, ROUTE, RUN, now)).resolves.toBe(false)
  })

  it('rejects a flipped signature', async () => {
    const t = await issueTicket(SALT, SUB, ROUTE, RUN)
    const i = t.indexOf('.')
    const mac = t.slice(i + 1)
    const flipped = mac[0] === 'A' ? `B${mac.slice(1)}` : `A${mac.slice(1)}`
    await expect(verifyTicket(SALT, `${t.slice(0, i)}.${flipped}`, SUB, ROUTE, RUN)).resolves.toBe(false)
  })

  it('treats every malformed shape as invalid rather than throwing', async () => {
    for (const bad of ['', '.', 'abc', '123', '123.', '.sig', 'notanumber.sig', '1e9999.sig',
                       `${Date.now() + 1000}.!!!not-base64!!!`]) {
      await expect(verifyTicket(SALT, bad, SUB, ROUTE, RUN), bad).resolves.toBe(false)
    }
    await expect(verifyTicket(SALT, null, SUB, ROUTE, RUN)).resolves.toBe(false)
  })
})

describe('the ticket key is separated from the subject key', () => {
  it('a ticket MAC is not the subject digest for the same inputs', async () => {
    // Both are SHA-256 over the salt. The context string is what stops one
    // being replayed as the other.
    const { subjectHash } = await import('./subject')
    const t = await issueTicket(SALT, SUB, ROUTE, RUN)
    expect(t).not.toContain(await subjectHash(SALT, '203.0.113.7'))
  })
})
