import { describe, it, expect } from 'vitest'
import {
  PLANS, planOf, planAllows, withinModelLimit, withinProjectLimit, lowestPlanWith,
  upgradeMessage, featureLabel, CHECKOUT_ENABLED,
  type Feature,
} from './plans'

const ALL: Feature[] = [
  'model-space', 'design-pipeline', 'optimizer', 'reports',
  'estimating', 'scheduling', 'nonlinear', 'saved-projects',
]

describe('plan catalogue', () => {
  it('is ordered cheapest first and has no duplicate ids', () => {
    const ids = PLANS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    const prices = PLANS.map((p) => p.price ?? 0)
    for (let k = 1; k < prices.length; k++) expect(prices[k]).toBeGreaterThanOrEqual(prices[k - 1])
  })

  it('is strictly cumulative — a dearer plan never loses a feature', () => {
    // The property people assume about tiers, and the one that silently breaks
    // when a feature is added to the middle tier and forgotten at the top.
    for (let k = 1; k < PLANS.length; k++) {
      for (const f of PLANS[k - 1].features) {
        expect(PLANS[k].features, `${PLANS[k].id} lost ${f} from ${PLANS[k - 1].id}`).toContain(f)
      }
    }
  })

  it('limits never tighten as the price rises', () => {
    const rank = (v: number | null) => (v === null ? Infinity : v)
    for (let k = 1; k < PLANS.length; k++) {
      expect(rank(PLANS[k].maxMembers)).toBeGreaterThanOrEqual(rank(PLANS[k - 1].maxMembers))
      expect(rank(PLANS[k].calculatorRuns)).toBeGreaterThanOrEqual(rank(PLANS[k - 1].calculatorRuns))
      expect(rank(PLANS[k].maxProjects)).toBeGreaterThanOrEqual(rank(PLANS[k - 1].maxProjects))
    }
  })

  it('gives guest and free the same feature set — an account is the only difference', () => {
    // The deliberate shape of the ladder: signing up must not be what unlocks
    // a calculator, only what removes the trial counter and allows saving.
    const guest = PLANS.find((p) => p.id === 'guest')!
    const free = PLANS.find((p) => p.id === 'free')!
    expect(free.features.filter((f) => f !== 'saved-projects')).toEqual([...guest.features])
    expect(guest.calculatorRuns).toBe(5)
    expect(free.calculatorRuns).toBeNull()
    expect(guest.maxProjects).toBe(0)
    expect(free.maxProjects).toBeGreaterThan(0)
  })

  it('the top plan includes every feature that exists', () => {
    const top = PLANS[PLANS.length - 1]
    for (const f of ALL) expect(top.features, `top plan missing ${f}`).toContain(f)
  })

  it('gives every plan a name, tagline and highlights', () => {
    for (const p of PLANS) {
      expect(p.name.length).toBeGreaterThan(0)
      expect(p.tagline.length).toBeGreaterThan(10)
      expect(p.highlights.length).toBeGreaterThan(1)
    }
  })
})

describe('planOf', () => {
  it('resolves known ids', () => {
    for (const p of PLANS) expect(planOf(p.id).id).toBe(p.id)
  })

  it('falls back to the LEAST privileged plan for anything unknown', () => {
    // The safe direction: a corrupt or absent plan claim must not grant access.
    for (const bad of [null, undefined, '', 'enterprise', 'PRO', 'admin']) {
      expect(planOf(bad).id, String(bad)).toBe('guest')
    }
  })
})

describe('planAllows', () => {
  it('gives a guest nothing', () => {
    for (const f of ALL) expect(planAllows('guest', f), f).toBe(false)
  })

  it('gives free saved projects and nothing else — the calculators need no feature', () => {
    expect(planAllows('free', 'saved-projects')).toBe(true)
    expect(planAllows('free', 'model-space')).toBe(false)
    expect(planAllows('free', 'design-pipeline')).toBe(false)
    expect(planAllows('free', 'optimizer')).toBe(false)
  })

  it('gives pro the model space and what is built on it, but not the heavy solvers', () => {
    expect(planAllows('pro', 'model-space')).toBe(true)
    expect(planAllows('pro', 'design-pipeline')).toBe(true)
    expect(planAllows('pro', 'optimizer')).toBe(true)
    expect(planAllows('pro', 'reports')).toBe(true)
    expect(planAllows('pro', 'estimating')).toBe(true)
    expect(planAllows('pro', 'nonlinear')).toBe(false)
    expect(planAllows('pro', 'scheduling')).toBe(false)
  })

  it('gives max everything', () => {
    for (const f of ALL) expect(planAllows('max', f), f).toBe(true)
  })

  it('accepts a plan object as well as an id', () => {
    expect(planAllows(planOf('pro'), 'optimizer')).toBe(true)
  })
})

describe('withinModelLimit', () => {
  it('blocks guest and free from any model at all — the model space is paid', () => {
    for (const id of ['guest', 'free'] as const) {
      expect(withinModelLimit(id, 1), id).toBe(false)
      expect(withinModelLimit(id, 0), id).toBe(true)
    }
  })

  it('enforces the pro ceiling exactly at the boundary', () => {
    expect(withinModelLimit('pro', 400)).toBe(true)
    expect(withinModelLimit('pro', 401)).toBe(false)
  })

  it('never limits max', () => {
    expect(withinModelLimit('max', 1_000_000)).toBe(true)
  })
})

describe('withinProjectLimit', () => {
  it('lets a guest save nothing', () => {
    expect(withinProjectLimit('guest', 0)).toBe(false)
  })

  it('stops free at its allowance — the check is "may I save one MORE"', () => {
    // Off-by-one bait: holding 2 of 3 may save; holding 3 of 3 may not.
    expect(withinProjectLimit('free', 2)).toBe(true)
    expect(withinProjectLimit('free', 3)).toBe(false)
  })

  it('never limits the paid tiers', () => {
    expect(withinProjectLimit('pro', 10_000)).toBe(true)
    expect(withinProjectLimit('max', 10_000)).toBe(true)
  })
})

describe('lowestPlanWith', () => {
  it('names the cheapest plan that includes a feature', () => {
    expect(lowestPlanWith('saved-projects')?.id).toBe('free')
    expect(lowestPlanWith('model-space')?.id).toBe('pro')
    expect(lowestPlanWith('design-pipeline')?.id).toBe('pro')
    expect(lowestPlanWith('optimizer')?.id).toBe('pro')
    expect(lowestPlanWith('nonlinear')?.id).toBe('max')
    expect(lowestPlanWith('scheduling')?.id).toBe('max')
  })
})

describe('upgradeMessage', () => {
  it('says nothing when the feature is already available', () => {
    expect(upgradeMessage('pro', 'optimizer')).toBeNull()
    expect(upgradeMessage('free', 'saved-projects')).toBeNull()
    expect(upgradeMessage('max', 'nonlinear')).toBeNull()
  })

  it('tells a guest to create a FREE account when free is enough', () => {
    const m = upgradeMessage('guest', 'saved-projects')!
    expect(m).toMatch(/free account/i)
    expect(m).toContain(featureLabel('saved-projects'))
  })

  it('names the plan that actually unlocks it, not a generic upgrade', () => {
    const m = upgradeMessage('free', 'optimizer')!
    expect(m).toContain('Pro')
    expect(m).toContain(featureLabel('optimizer'))
    expect(m).not.toMatch(/upgrade to continue/i)
  })

  it('points at Max, not Pro, for the features only Max has', () => {
    // The failure this catches: adding a top tier but leaving the message
    // pointing at the tier that no longer unlocks the thing.
    for (const f of ['nonlinear', 'scheduling'] as const) {
      const m = upgradeMessage('pro', f)!
      expect(m, f).toContain('Max')
      expect(m, f).not.toContain('Pro plan')
    }
  })

  it('has a label for every feature — no raw identifiers reach a user', () => {
    for (const f of ALL) {
      const label = featureLabel(f)
      expect(label.length, f).toBeGreaterThan(3)
      // the point is that the raw identifier never reaches a user — not that
      // the prose avoids hyphens, which "take-off" legitimately needs
      expect(label, f).not.toBe(f)
    }
  })
})

describe('checkout', () => {
  it('is off, because a static SPA cannot verify a payment webhook', () => {
    // Asserted rather than assumed: if someone flips this on without adding a
    // server to verify the webhook, this test is the thing that objects.
    expect(CHECKOUT_ENABLED).toBe(false)
  })
})
