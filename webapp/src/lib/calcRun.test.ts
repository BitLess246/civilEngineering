import { describe, it, expect, beforeEach } from 'vitest'
import { startRun, runToken, rememberTicket, ticketFor, resetRun, TrialExhaustedError } from './calcRun'

beforeEach(resetRun)

describe('the run token', () => {
  it('is stable within one arrival, so typing does not spend the allowance', () => {
    // The whole reason the token exists. Every recompute of one visit must
    // present the SAME token or the server counts each keystroke as a run.
    const t = startRun()
    for (let i = 0; i < 10; i++) expect(runToken()).toBe(t)
  })

  it('changes on the next arrival, which is what the server charges for', () => {
    const first = startRun()
    expect(startRun()).not.toBe(first)
  })

  it('is minted on demand if a calculation somehow precedes any arrival', () => {
    // Never send nothing: the endpoint treats a missing token as a new run on
    // every request, which would burn five runs in a second of typing.
    expect(runToken()).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
  })

  it('matches the charset and bounds the server will accept', () => {
    // The endpoint drops anything outside these, and a dropped token is a
    // token charged per request.
    for (let i = 0; i < 50; i++) expect(startRun()).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
  })

  it('does not repeat', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 500; i++) seen.add(startRun())
    expect(seen.size).toBe(500)
  })
})

describe('the ticket cache', () => {
  it('holds one ticket per route', () => {
    startRun()
    rememberTicket('/steel/beam', 'ticket-a')
    rememberTicket('/steel/column', 'ticket-b')
    expect(ticketFor('/steel/beam')).toBe('ticket-a')
    expect(ticketFor('/steel/column')).toBe('ticket-b')
    expect(ticketFor('/bolted-connection')).toBeUndefined()
  })

  it('is cleared by a new arrival — a ticket is bound to the run it names', () => {
    startRun()
    rememberTicket('/steel/beam', 'ticket-a')
    startRun()
    expect(ticketFor('/steel/beam')).toBeUndefined()
  })

  it('ignores an absent ticket rather than storing a blank', () => {
    startRun()
    rememberTicket('/steel/beam', null)
    rememberTicket('/steel/beam', undefined)
    rememberTicket('/steel/beam', '')
    expect(ticketFor('/steel/beam')).toBeUndefined()
  })
})

describe('TrialExhaustedError', () => {
  it('carries the route and count the page needs to explain itself', () => {
    const e = new TrialExhaustedError('/steel/beam', 5)
    expect(e).toBeInstanceOf(Error)
    expect(e.route).toBe('/steel/beam')
    expect(e.used).toBe(5)
  })

  it('is distinguishable from an ordinary failure', () => {
    // `CalcBadge` and `TrialWall` both switch on exactly this, so that a spent
    // trial is never reported to the visitor as a bug.
    expect(new TrialExhaustedError('/steel/beam', 5)).toBeInstanceOf(TrialExhaustedError)
    expect(new Error('boom')).not.toBeInstanceOf(TrialExhaustedError)
  })
})
