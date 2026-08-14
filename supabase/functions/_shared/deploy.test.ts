// What the deploy workflow will do, checked against what the functions need.
//
// `--no-verify-jwt` removes the gateway's authentication from a function and
// leaves it reachable by anyone on the internet. That is correct for exactly
// one function here and catastrophic for the others — `billing-change-plan`
// without it would let a stranger move somebody else's subscription.
//
// The flag lives in a bash `case` inside a YAML file, which nothing typechecks
// and nothing else reads. So it is pinned here: the list is allowed to contain
// `billing-webhook` and nothing else, and `billing-webhook` has to actually
// have the signature check that justifies it.

import { describe, it, expect } from 'vitest'
import workflow from '../../../.github/workflows/supabase-functions.yml?raw'
import webhookSrc from '../billing-webhook/index.ts?raw'

/** The `NO_JWT="…"` assignment in the workflow, as a list of function names. */
function noJwtList(yml: string): string[] {
  const m = /^\s*NO_JWT="([^"]*)"/m.exec(yml)
  if (!m) return []
  return m[1].split(/\s+/).filter(Boolean)
}

describe('the deploy workflow', () => {
  it('declares a NO_JWT list at all — a missing one would silently mean "none"', () => {
    // If the assignment is renamed, this returns [] and every assertion below
    // passes vacuously. Check it was found first.
    expect(/^\s*NO_JWT="/m.test(workflow)).toBe(true)
  })

  it('opens ONLY the webhook to unauthenticated callers', () => {
    expect(noJwtList(workflow)).toEqual(['billing-webhook'])
  })

  it('and the webhook earns it by checking a signature instead', () => {
    // The trade is not "skip auth", it is "authenticate differently". A
    // function on this list with no check of its own is an open endpoint.
    expect(webhookSrc).toMatch(/verif|signature/i)
  })

  it('skips underscore directories, which are libraries and not functions', () => {
    // `_shared` is bundled into each function by the CLI. Trying to deploy it
    // fails the whole run, since it has no entry point.
    expect(workflow).toMatch(/case "\$name" in _\*\)\s*continue/)
  })

  it('fails loudly rather than succeeding having deployed nothing', () => {
    // A glob that matches nothing exits 0 and looks exactly like success. The
    // first symptom would be a merged fix that never went live, which is the
    // whole failure this workflow exists to end.
    expect(workflow).toMatch(/deployed" -eq 0/)
  })

  it('pins the project ref rather than relying on a linked state', () => {
    // There is no `supabase link` step, so a deploy without --project-ref would
    // target whatever the runner happens to have, which is nothing.
    expect(workflow).toMatch(/PROJECT_REF:\s*[a-z0-9]{20}/)
    expect(workflow).toMatch(/--project-ref "\$PROJECT_REF"/)
  })

  it('verifies before it deploys', () => {
    // `_shared` carries the subject derivation both halves of the guest counter
    // must agree on. Shipping a broken one is silent — the two halves simply
    // key different rows — so the tests are not optional here.
    expect(workflow).toMatch(/needs:\s*verify/)
  })
})

describe('every function is covered by the deploy loop', () => {
  // The loop iterates directories, so a new function deploys itself. This
  // asserts the assumption that makes that safe: the ones that exist today are
  // all real functions with an entry point, so nothing in the glob will break
  // the run.
  const dirs = import.meta.glob('../*/index.ts', { query: '?raw', eager: true })

  it('finds an index.ts for each deployable directory', () => {
    const names = Object.keys(dirs)
      .map((p) => p.split('/')[1])
      .filter((n) => !n.startsWith('_'))
      .sort()
    expect(names).toEqual([
      'billing-change-plan', 'billing-history', 'billing-portal',
      'billing-webhook', 'guest-quota',
    ])
  })
})
