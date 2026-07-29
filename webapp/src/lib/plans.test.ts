import { describe, it, expect } from 'vitest'
import {
  PLANS, planOf, planAllows, withinModelLimit, lowestPlanWith,
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
    }
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

  it('gives free the model space but not the paid extras', () => {
    expect(planAllows('free', 'model-space')).toBe(true)
    expect(planAllows('free', 'design-pipeline')).toBe(true)
    expect(planAllows('free', 'optimizer')).toBe(false)
    expect(planAllows('free', 'reports')).toBe(false)
    expect(planAllows('free', 'nonlinear')).toBe(false)
  })

  it('gives pro everything', () => {
    for (const f of ALL) expect(planAllows('pro', f), f).toBe(true)
  })

  it('accepts a plan object as well as an id', () => {
    expect(planAllows(planOf('pro'), 'optimizer')).toBe(true)
  })
})

describe('withinModelLimit', () => {
  it('blocks a guest from any model at all', () => {
    expect(withinModelLimit('guest', 1)).toBe(false)
    expect(withinModelLimit('guest', 0)).toBe(true)
  })

  it('enforces the free ceiling exactly at the boundary', () => {
    expect(withinModelLimit('free', 50)).toBe(true)
    expect(withinModelLimit('free', 51)).toBe(false)
  })

  it('never limits pro', () => {
    expect(withinModelLimit('pro', 1_000_000)).toBe(true)
  })
})

describe('lowestPlanWith', () => {
  it('names the cheapest plan that includes a feature', () => {
    expect(lowestPlanWith('model-space')?.id).toBe('free')
    expect(lowestPlanWith('design-pipeline')?.id).toBe('free')
    expect(lowestPlanWith('optimizer')?.id).toBe('pro')
    expect(lowestPlanWith('reports')?.id).toBe('pro')
  })
})

describe('upgradeMessage', () => {
  it('says nothing when the feature is already available', () => {
    expect(upgradeMessage('pro', 'optimizer')).toBeNull()
    expect(upgradeMessage('free', 'model-space')).toBeNull()
  })

  it('tells a guest to create a FREE account when free is enough', () => {
    const m = upgradeMessage('guest', 'model-space')!
    expect(m).toMatch(/free account/i)
    expect(m).toContain(featureLabel('model-space'))
  })

  it('names the plan that actually unlocks it, not a generic upgrade', () => {
    const m = upgradeMessage('free', 'optimizer')!
    expect(m).toContain('Pro')
    expect(m).toContain(featureLabel('optimizer'))
    expect(m).not.toMatch(/upgrade to continue/i)
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
