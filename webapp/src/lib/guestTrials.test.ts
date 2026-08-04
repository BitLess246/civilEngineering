import { describe, it, expect } from 'vitest'
import { mergeUsage } from './guestTrials'
import { accessFor, recordRun, trialNotice, GUEST_TRIAL_LIMIT } from './trialQuota'

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
