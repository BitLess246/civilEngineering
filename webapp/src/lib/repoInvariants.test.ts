/**
 * Two rules this repo states in prose and had no way to enforce.
 *
 * Both were found by reviewing merged work rather than by a failing test, and
 * both are the same shape: a file says it mirrors another file, and nothing
 * checks that it still does. `tabs.ts` was the third instance and its guard
 * shipped in #790; these are the remaining two.
 */
import { describe, it, expect } from 'vitest'
import { GATED_ROUTES } from './tools'
import { VALIDATION_CASES } from '../engine/validation'

const TSX = import.meta.glob('../**/*.tsx', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>
const TS = import.meta.glob('../**/*.ts', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>
const DOCS = import.meta.glob('../../../docs/*.md', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

const src = (all: Record<string, string>, endsWith: string) =>
  Object.entries(all).find(([f]) => f.endsWith(endsWith))?.[1] ?? ''

// ─────────────────────────────────────────────────────────────────────────

describe('GATED_ROUTES mirrors the RequireAuth gates it says it mirrors', () => {
  // `lib/tools.ts` declares the set with the comment "Mirrors the RequireAuth
  // gates in App.tsx". It is hand-kept, and the failure is user-facing in the
  // worse direction: a gated route MISSING from the set is advertised across
  // the home page, the sidebar and ⌘K with no lock badge and no "Sign in"
  // suffix, so somebody picks a tool that looks free and hits a wall. The
  // set's own docstring calls that out as the thing it exists to prevent.
  //
  // They agreed exactly when this was written — 17 and 17 — so this is not
  // fixing a live defect. It is making a claim checkable before it stops
  // being true.
  const app = src(TSX, 'App.tsx')

  /** Every `<Route path=… element=…>` whose element is wrapped in RequireAuth. */
  const gatedInApp = (): Set<string> => {
    const out = new Set<string>()
    for (const m of app.matchAll(/<Route\s+path="([^"]+)"\s+element=\{([\s\S]*?)\}\s*\/>/g)) {
      if (m[2].includes('RequireAuth')) out.add(m[1])
    }
    return out
  }

  it('found the route table at all', () => {
    // A regex that matched nothing would make every comparison below
    // vacuously true — the failure mode this repo has shipped before.
    expect(app).toContain('<Route')
    expect(gatedInApp().size).toBeGreaterThanOrEqual(10)
  })

  it('declares every route App.tsx actually gates', () => {
    // The dangerous direction: a paid tool advertised as free.
    const undeclared = [...gatedInApp()].filter((r) => !GATED_ROUTES.has(r)).sort()
    expect(undeclared, 'gated in App.tsx but shown without a lock badge').toEqual([])
  })

  it('declares nothing App.tsx does not gate', () => {
    // The merely-wrong direction: a lock badge on a route anyone can open.
    const gated = gatedInApp()
    const stale = [...GATED_ROUTES].filter((r) => !gated.has(r)).sort()
    expect(stale, 'badged as gated but open in App.tsx').toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────

describe('the validation map does not lag the benchmarks', () => {
  // CLAUDE.md L9: "when a new engine ships, add its benchmark row to
  // `validation.ts` *and* tick/extend `docs/ValidationMap.md` in the same PR —
  // the map must never lag the code again."
  //
  // It lagged. `influenceTruss` (ab6f53a) and `influenceBeam` (#793) both
  // shipped a user-facing calculator with NEITHER a benchmark row nor a map
  // entry, because the rule was prose with nothing behind it.
  //
  // `hysteresis` came out of this guard's first run and is a WEAKER case,
  // stated precisely because the first version of this comment overstated it:
  // its benchmark id was already cited in the map, inside the "Nonlinear TH"
  // row, so the evidence was published — what was missing was any mention of
  // the module or its own test file. The row added here names that. Not the
  // same kind of lag as the two above, and not a claim worth inflating.
  //
  // WHAT THIS CAN AND CANNOT DO, stated because the gap matters. It checks the
  // half that is mechanically checkable: anything `validation.ts` benchmarks
  // must be traceable in the map. It CANNOT check "an engine shipped with
  // neither", because the map is organised by topic and cites TEST FILES, not
  // modules — `pmInteraction`'s evidence lives under `columnDesign.test.ts`,
  // so matching module names would flag a dozen modules that are properly
  // covered under another file's name. That half stays a review question, and
  // 30 of the 164 engine modules are currently absent from the map by name
  // (most are infrastructure: workers, pools, renderers, progress reporting).
  const map = src(DOCS, 'ValidationMap.md')
  const validation = src(TS, 'engine/validation.ts')

  it('found the map and the benchmarks', () => {
    expect(map.length, 'ValidationMap.md not readable').toBeGreaterThan(2000)
    expect(VALIDATION_CASES.length).toBeGreaterThan(50)
  })

  it('names every engine module the benchmarks import', () => {
    // Each import in `validation.ts` is a module whose numbers are published
    // on /validation, so each must appear in the ledger — by its own name or
    // by the test file the map cites for it.
    const mods = [...validation.matchAll(/from '\.\/([\w/]+)'/g)]
      .map((m) => m[1].split('/').pop()!)
      .filter((m, i, a) => a.indexOf(m) === i)
    expect(mods.length, 'no imports found — regex is wrong').toBeGreaterThan(20)
    const absent = mods.filter((m) =>
      !map.includes(m) && !map.includes(`${m}.test.ts`)).sort()
    expect(absent, 'benchmarked but absent from ValidationMap.md').toEqual([])
  })

  it('cites every benchmark ID the map claims to reference', () => {
    // The map quotes benchmark IDs as evidence (`validation.ts` `rc-beam-mn`).
    // A quoted ID that no longer exists is a dead citation — the ledger saying
    // "verified in CI" about something CI does not run.
    // `[^`]+`, not `[a-z0-9-]+`. The tight class only recognises something
    // that still LOOKS like an id, so a citation renamed to anything outside
    // it stops being seen as a citation at all and the check goes quiet —
    // caught by sabotaging a quoted id to `…-OLD`, which passed. On a clean
    // tree both forms see the same 41 citations, so this closes a hole the
    // sabotage revealed rather than a live gap.
    const quoted = [...map.matchAll(/`validation\.ts`\s+`([^`]+)`/g)].map((m) => m[1])
    expect(quoted.length, 'no IDs quoted — regex is wrong').toBeGreaterThan(5)
    const ids = new Set(VALIDATION_CASES.map((c) => c.id))
    const dead = [...new Set(quoted)].filter((q) => !ids.has(q)).sort()
    expect(dead, 'ValidationMap cites a benchmark ID that does not exist').toEqual([])
  })

  it('carries the influence-line engines, which is what lagged', () => {
    for (const f of ['influenceTruss.test.ts', 'influenceBeam.test.ts']) {
      expect(map, `${f} missing from the map`).toContain(f)
    }
    const ids = VALIDATION_CASES.filter((c) => c.id.startsWith('il-')).map((c) => c.id)
    expect(ids.length, 'no influence-line benchmarks').toBeGreaterThanOrEqual(5)
    for (const id of ids) expect(map, `${id} not cited`).toContain(id)
  })
})
