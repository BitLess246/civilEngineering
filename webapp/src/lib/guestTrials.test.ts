import { describe, it, expect, vi } from 'vitest'
import { mergeUsage } from './guestTrials'
import guestQuotaSrc from '../../../supabase/functions/guest-quota/index.ts?raw'
import { accessFor, recordRun, trialNotice, GUEST_TRIAL_LIMIT } from './trialQuota'

/** Every `functions.invoke` this file provokes, so the wire shape is assertable. */
const invoked: { name: string; body: Record<string, unknown> }[] = []

// `vi.spyOn` on an ES module namespace is not reliably redefinable; mocking the
// module is. Only `consumeRemote`/`peekRemote` touch it, so the rest of the
// file is unaffected.
vi.mock('./auth/authClient', () => ({
  isAuthConfigured: () => true,
  getClient: () => ({
    functions: {
      invoke: async (name: string, opts: { body: Record<string, unknown> }) => {
        invoked.push({ name, body: opts.body })
        return { data: { usage: {} }, error: null }
      },
    },
  }),
}))

describe('mergeUsage', () => {
  it('takes the higher count per route', () => {
    expect(mergeUsage({ '/beam-design': 2 }, { '/beam-design': 4 }))
      .toEqual({ '/beam-design': 4 })
    expect(mergeUsage({ '/beam-design': 5 }, { '/beam-design': 1 }))
      .toEqual({ '/beam-design': 5 })
  })

  it('keeps routes only one side knows about', () => {
    expect(mergeUsage({ '/foundation': 1 }, { '/stair': 3 }))
      .toEqual({ '/foundation': 1, '/stair': 3 })
  })

  it('is monotone — merging can never LOWER a count', () => {
    // The property the whole design rests on. No ordering of syncs, tabs or
    // reloads may give a route back a run it has already spent.
    const local = { '/beam-design': 3, '/stair': 1 }
    const remote = { '/beam-design': 5 }
    const once = mergeUsage(local, remote)
    const twice = mergeUsage(once, mergeUsage(remote, local))
    for (const k of Object.keys(once)) expect(twice[k]).toBeGreaterThanOrEqual(once[k])
    expect(twice).toEqual(once)
  })

  it('is commutative', () => {
    const a = { '/a': 1, '/b': 7 }, b = { '/b': 2, '/c': 4 }
    expect(mergeUsage(a, b)).toEqual(mergeUsage(b, a))
  })

  it('discards counts that are not believable', () => {
    // A hostile or broken payload must not be able to reduce a real count or
    // inject NaN into the arithmetic downstream.
    const local = { '/beam-design': 3 }
    for (const junk of [
      { '/beam-design': -1 }, { '/beam-design': NaN }, { '/beam-design': Infinity },
      { '/beam-design': '9' as unknown as number }, { '/beam-design': null as unknown as number },
    ]) {
      expect(mergeUsage(local, junk)).toEqual({ '/beam-design': 3 })
    }
  })

  it('floors fractional counts rather than propagating them', () => {
    expect(mergeUsage({}, { '/stair': 2.9 })).toEqual({ '/stair': 2 })
  })

  it('handles empty and absent maps', () => {
    expect(mergeUsage()).toEqual({})
    expect(mergeUsage({ '/a': 1 }, {})).toEqual({ '/a': 1 })
  })
})

describe('the behaviour this exists to produce', () => {
  it('a cleared browser does not get a fresh allowance', () => {
    // Before: usage came from localStorage alone, so wiping it meant `{}` and
    // a full allowance. Now the server's record merges back in.
    const cleared: Record<string, number> = {}
    const server = { '/beam-design': GUEST_TRIAL_LIMIT }

    expect(accessFor('/beam-design', false, cleared).kind).toBe('trial')
    expect(accessFor('/beam-design', false, mergeUsage(cleared, server)).kind)
      .toBe('trial-exhausted')
  })

  it('runs made while the server was unreachable still count once it answers', () => {
    const local = { '/stair': 3 }   // three runs made offline
    const server = { '/stair': 1 }  // the server only saw the first
    const merged = mergeUsage(local, server)
    expect(merged['/stair']).toBe(3)
    const v = accessFor('/stair', false, merged)
    expect(v.kind === 'trial' && v.remaining).toBe(GUEST_TRIAL_LIMIT - 3)
  })

  it('never applies to a signed-in member', () => {
    // The counter is for visitors without an account. A member with a maxed
    // usage map is still a member.
    expect(accessFor('/beam-design', true, { '/beam-design': 99 }).kind).toBe('member')
  })
})

describe('trialNotice', () => {
  it('counts down, and warns specially on the last one', () => {
    expect(trialNotice(accessFor('/stair', false, {}))).toBe('5 free runs left on this calculator.')
    expect(trialNotice(accessFor('/stair', false, { '/stair': 4 })))
      .toBe('Last free run of this calculator — a free account removes the limit.')
  })

  it('says nothing to a member, on a public page, or once exhausted', () => {
    // Exhausted returns null because the WALL says it; two messages saying the
    // same thing on one screen is worse than one.
    expect(trialNotice(accessFor('/stair', true, {}))).toBeNull()
    expect(trialNotice(accessFor('/docs', false, {}))).toBeNull()
    expect(trialNotice(accessFor('/stair', false, { '/stair': 5 }))).toBeNull()
    expect(trialNotice(accessFor('/model', false, {}))).toBeNull()
  })
})

describe('the allowance is worth exactly GUEST_TRIAL_LIMIT visits', () => {
  it('admits the visitor on the Nth arrival and blocks the N+1th', () => {
    // TrialGate judges the verdict AS IT STOOD ON ARRIVAL and then charges, so
    // the run being spent is the one being used. Judging after the charge — the
    // obvious implementation — would make 5 runs buy 4 pages.
    let usage: Record<string, number> = {}
    const admitted: boolean[] = []
    for (let visit = 1; visit <= GUEST_TRIAL_LIMIT + 1; visit++) {
      const onArrival = accessFor('/stair', false, usage)
      admitted.push(onArrival.kind === 'trial')
      if (onArrival.kind === 'trial') usage = recordRun('/stair', usage)
    }
    expect(admitted).toEqual([...Array(GUEST_TRIAL_LIMIT).fill(true), false])
    expect(usage['/stair']).toBe(GUEST_TRIAL_LIMIT)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// ONE ARRIVAL, ONE RUN — ACROSS BOTH HALVES OF THE COUNTER.
//
// Three calculators (`calcRoutes.ts`) compute through the Vercel endpoint,
// which claims the same `(subject, route)` row this function writes — the two
// subject derivations are pinned identical by `api/_lib/subject.test.ts`
// precisely so they land on one row. Both halves therefore claim the same
// arrival, and the ONLY thing that stops that being charged twice is that both
// send the SAME run token, so whichever lands second is admitted free.
//
// It cost a guest two of five runs per visit on those three pages, and it was
// invisible: the counter simply moved faster than the pricing page promised.
// ─────────────────────────────────────────────────────────────────────────
describe('the run token reaches the server half of the counter', () => {
  it('consumeRemote sends the token this arrival was given', async () => {
    const { startRun, runToken, resetRun } = await import('./calcRun')
    const { consumeRemote } = await import('./guestTrials')

    resetRun()
    const token = startRun()
    expect(runToken()).toBe(token)

    invoked.length = 0
    const result = await consumeRemote('/steel/beam')

    expect(result.kind).toBe('ok')
    expect(invoked).toHaveLength(1)
    expect(invoked[0].name).toBe('guest-quota')
    expect(invoked[0].body.action).toBe('consume')
    expect(invoked[0].body.route).toBe('/steel/beam')
    // THE ASSERTION. Without this the endpoint's claim is a second, separate
    // run and the guest pays twice for one visit.
    expect(invoked[0].body.run).toBe(token)

    resetRun()
  })

  it('sends a token the database is willing to remember', async () => {
    // `claim_guest_run` treats anything outside 8–64 chars as "no token", which
    // charges every request. A token it will not remember is worse than none.
    const { startRun, resetRun } = await import('./calcRun')
    const { consumeRemote } = await import('./guestTrials')
    resetRun()
    startRun()
    invoked.length = 0
    await consumeRemote('/steel/beam')
    expect(String(invoked[0].body.run)).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
    resetRun()
  })

  it('gives a SECOND arrival a different token, or the counter would freeze', async () => {
    // The token makes one arrival idempotent. If it never changed, every later
    // visit would be admitted free and the allowance would never move.
    const { startRun, resetRun } = await import('./calcRun')
    const { consumeRemote } = await import('./guestTrials')
    resetRun()
    startRun()
    invoked.length = 0
    await consumeRemote('/steel/beam')
    startRun()
    await consumeRemote('/steel/beam')
    expect(invoked[0].body.run).not.toBe(invoked[1].body.run)
    resetRun()
  })
})

describe('the server half claims runs rather than blindly counting', () => {
  // A source guard on the Deno function, in the style `tours.test.ts` uses.
  // `consume_guest_trial` only ever adds one and knows nothing about run
  // tokens, so calling it here is what double-charged every arrival on the
  // three API-served calculators.
  //
  // Matched against the CODE, not the file: the header explains the change and
  // therefore names the function it warns against, which a raw text match reads
  // as the bug. `plans.limits.test.ts` documents the same trap.
  const code = guestQuotaSrc.split('\n')
    .map((l) => l.replace(/\/\/.*/, ''))
    .join('\n')

  it('guest-quota goes through claim_guest_run, not consume_guest_trial', () => {
    expect(code).toContain("db.rpc('claim_guest_run'")
    expect(code).not.toContain('consume_guest_trial')
  })

  it('and passes the run token through to it', () => {
    expect(code).toMatch(/p_run:\s*run/)
  })

  it('does not turn a spent allowance into an error the client discards', () => {
    // `exhausted` must come back as a normal usage payload: the client derives
    // the paywall from the count, and any error response sends it down the
    // `unavailable` path, which falls back to the LOCAL count and shows the
    // visitor runs they do not have.
    const consume = code.slice(code.indexOf("if (action === 'consume')"))
    const branch = consume.slice(0, consume.indexOf('const { data, error }'))
    expect(branch).toContain("reason === 'route-cap'")
    expect(branch).not.toContain("'exhausted'")
  })
})
