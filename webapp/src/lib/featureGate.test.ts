import { describe, it, expect } from 'vitest'
import {
  SOLVER_FEATURE, ROUTE_FEATURE, gateSolve, gateAction, gateRoute, featureForRoute,
  modelLimitMessage, type SolverKind,
} from './featureGate'
import { GATED_PREFIXES, PUBLIC_ROUTES } from './trialQuota'
import { PLANS, planOf, type Feature } from './plans'

// The worker's own source, so the guard below compares against what actually
// ships rather than against a copy of it.
const workerSrc = Object.values(
  import.meta.glob('../engine/solverWorker.ts', { query: '?raw', import: 'default', eager: true }),
)[0] as string

describe('solver kind coverage', () => {
  /** Every `kind: 'x'` in the SolverRequest union. */
  const declared = (): string[] => {
    const union = workerSrc.slice(
      workerSrc.indexOf('export type SolverRequest'),
      workerSrc.indexOf('const ctx = self'),
    )
    return [...new Set([...union.matchAll(/kind:\s*'([A-Za-z]+)'/g)].map((m) => m[1]))]
  }

  it('finds the union in the worker source at all', () => {
    // If this fails the parse has drifted and the guard below is vacuous —
    // which would be worse than a plain mismatch, because it would pass.
    expect(declared().length).toBeGreaterThan(4)
    expect(declared()).toContain('analyze')
  })

  it('classifies EVERY solver kind the worker accepts', () => {
    // An unmapped kind reads as `undefined` from the table, which `gateSolve`
    // treats as "no feature required" — i.e. it would run on any plan. This is
    // the test that stops a new solver shipping through the paywall unnoticed.
    for (const k of declared()) {
      expect(Object.keys(SOLVER_FEATURE), `unclassified solver kind: ${k}`).toContain(k)
    }
  })

  it('has no entry for a kind the worker no longer accepts', () => {
    const d = declared()
    for (const k of Object.keys(SOLVER_FEATURE)) {
      expect(d, `stale solver kind in SOLVER_FEATURE: ${k}`).toContain(k)
    }
  })
})

describe('gateSolve', () => {
  const BIG = 10_000

  it('lets Max run everything', () => {
    for (const k of Object.keys(SOLVER_FEATURE) as SolverKind[]) {
      expect(gateSolve(k, 'max', BIG).allowed, k).toBe(true)
    }
  })

  it('refuses guests and free accounts every solver job', () => {
    for (const plan of ['guest', 'free'] as const) {
      for (const k of Object.keys(SOLVER_FEATURE) as SolverKind[]) {
        expect(gateSolve(k, plan, 10).allowed, `${plan}/${k}`).toBe(false)
      }
    }
  })

  it('lets Pro analyse and design but not run the nonlinear solvers', () => {
    for (const k of ['analyze', 'modal', 'design', 'optimize'] as SolverKind[]) {
      expect(gateSolve(k, 'pro', 100).allowed, k).toBe(true)
    }
    for (const k of ['pushover', 'biaxialPushover', 'timeHistory', 'nonlinearTH'] as SolverKind[]) {
      const v = gateSolve(k, 'pro', 100)
      expect(v.allowed, k).toBe(false)
      if (!v.allowed) expect(v.message, k).toContain('Max')
    }
  })

  it('enforces the Pro member ceiling at the boundary', () => {
    const limit = planOf('pro').maxMembers!
    expect(gateSolve('analyze', 'pro', limit).allowed).toBe(true)
    const over = gateSolve('analyze', 'pro', limit + 1)
    expect(over.allowed).toBe(false)
    if (!over.allowed) {
      expect(over.reason).toBe('model-limit')
      if (over.reason === 'model-limit') {
        expect(over.limit).toBe(limit)
        expect(over.members).toBe(limit + 1)
      }
    }
  })

  it('reports the FEATURE, not the size, when both would block', () => {
    // A free account with a 5000-member model is over every limit, but being
    // told "your model is too big" would be misleading — the size is not what
    // stands in the way, and would not be after paying for the size alone.
    const v = gateSolve('analyze', 'free', 5000)
    expect(v.allowed).toBe(false)
    if (!v.allowed) expect(v.reason).toBe('feature')
  })

  it('treats an unknown plan id as the least privileged', () => {
    for (const bad of ['', 'PRO', 'admin', 'enterprise']) {
      expect(gateSolve('analyze', bad as never, 1).allowed, bad).toBe(false)
    }
  })

  it('always carries a message a user could act on', () => {
    for (const plan of PLANS) {
      for (const k of Object.keys(SOLVER_FEATURE) as SolverKind[]) {
        const v = gateSolve(k, plan.id, 5000)
        if (!v.allowed) {
          expect(v.message.length, `${plan.id}/${k}`).toBeGreaterThan(10)
          expect(v.message, `${plan.id}/${k}`).not.toContain('undefined')
        }
      }
    }
  })
})

describe('gateAction', () => {
  it('gates report export on the plan, with no size condition', () => {
    expect(gateAction('reports', 'pro').allowed).toBe(true)
    expect(gateAction('reports', 'free').allowed).toBe(false)
    expect(gateAction('scheduling', 'pro').allowed).toBe(false)
    expect(gateAction('scheduling', 'max').allowed).toBe(true)
  })

  it('names the unlocking plan in the refusal', () => {
    const v = gateAction('estimating', 'free')
    expect(v.allowed).toBe(false)
    if (!v.allowed) expect(v.message).toContain('Pro')
  })
})

describe('modelLimitMessage', () => {
  it('is empty for an unlimited plan — there is nothing to say', () => {
    expect(modelLimitMessage('max', 99_999)).toBe('')
  })

  it('quotes the real ceiling and the real count', () => {
    const m = modelLimitMessage('pro', 512)
    expect(m).toContain('400')
    expect(m).toContain('512')
    expect(m).toContain('Max')
  })

  it('never renders an undefined for any plan', () => {
    for (const p of PLANS) {
      expect(modelLimitMessage(p.id, 10), p.id).not.toContain('undefined')
    }
  })
})

describe('route gating', () => {
  it('covers exactly the prefixes that require a session — no more, no less', () => {
    // A gated prefix with no feature would be reachable by any signed-in
    // account; a feature on an ungated prefix would be unreachable copy.
    expect([...Object.keys(ROUTE_FEATURE)].sort()).toEqual([...GATED_PREFIXES].sort())
  })

  it('leaves public and trial routes alone', () => {
    for (const r of [...PUBLIC_ROUTES, '/beam-design', '/settlement', '/lateral-pile']) {
      expect(featureForRoute(r), r).toBeNull()
      expect(gateRoute(r, 'guest').allowed, r).toBe(true)
    }
  })

  it('gates the project-scale routes by tier', () => {
    expect(gateRoute('/model', 'free').allowed).toBe(false)
    expect(gateRoute('/model', 'pro').allowed).toBe(true)
    expect(gateRoute('/estimate/slab', 'pro').allowed).toBe(true)
    expect(gateRoute('/schedule', 'pro').allowed).toBe(false)
    expect(gateRoute('/schedule', 'max').allowed).toBe(true)
  })

  it('matches on a segment boundary, not a bare string prefix', () => {
    // '/modelling-guide' must not be swallowed by the '/model' entry.
    expect(featureForRoute('/modelling-guide')).toBeNull()
    expect(featureForRoute('/model')).toBe('model-space')
    expect(featureForRoute('/model/anything')).toBe('model-space')
  })

  it('ignores a query string when matching', () => {
    expect(featureForRoute('/schedule?view=gantt')).toBe('scheduling')
  })
})

describe('feature coverage', () => {
  it('every feature a solver needs is one some plan actually sells', () => {
    const sold = new Set<Feature>(PLANS.flatMap((p) => [...p.features]))
    for (const f of Object.values(SOLVER_FEATURE)) {
      if (f) expect(sold, `no plan includes ${f}`).toContain(f)
    }
  })
})
