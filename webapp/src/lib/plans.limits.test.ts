// The project ceiling exists in TWO places and has to: `plans.ts` drives what
// the UI says, and the RLS policy in the migration is what actually stops the
// insert. The server cannot import TypeScript and the browser cannot be trusted
// to enforce its own paywall, so duplication is the price.
//
// This test is what stops them drifting. It reads the SQL and checks every
// branch of `project_limit()` against `PLANS`, so raising a limit in one place
// and not the other fails here rather than in production, where the symptom
// would be a customer who paid for unlimited projects being refused the fourth.

import { describe, it, expect } from 'vitest'
import migration from '../../../supabase/migrations/20260804010000_projects.sql?raw'
import triggerMigration from '../../../supabase/migrations/20260813000000_project_limit_trigger.sql?raw'
import { PLANS, planOf } from './plans'

/**
 * SQL with `--` comments removed.
 *
 * The assertions below are about what the database EXECUTES. Matching raw file
 * text instead fails on a comment that merely names the thing it is warning
 * you against — which is exactly what happened the first time this ran.
 */
// No `$` anchor: `.` does not match `\r`, so on a CRLF checkout `/--.*$/`
// matched nothing at all and every comment survived — including the one below
// that names `user_metadata` while warning against it, which then failed the
// assertion that the executed SQL never reads it. Green on Linux, red on
// Windows, and about the file's punctuation rather than its meaning.
const code = (sql: string): string =>
  sql.split('\n').map((l) => l.replace(/--.*/, '')).join('\n')

/** The `when '<plan>' then <null|N>` branches of `project_limit()`. */
function sqlLimits(sql: string): Record<string, number | null> {
  const fn = sql.slice(sql.indexOf('function public.project_limit()'))
  const body = fn.slice(0, fn.indexOf('$$;'))
  const out: Record<string, number | null> = {}
  for (const m of body.matchAll(/when\s+'([a-z]+)'\s+then\s+(null|\d+)/gi)) {
    out[m[1]] = m[2].toLowerCase() === 'null' ? null : Number(m[2])
  }
  return out
}

describe('the SQL project ceiling matches plans.ts', () => {
  const limits = sqlLimits(code(migration))

  it('found the branches at all — a silent zero here would pass everything', () => {
    expect(Object.keys(limits).sort()).toEqual(['free', 'max', 'pro'])
  })

  it.each(['free', 'pro', 'max'])('agrees for the %s plan', (id) => {
    expect(limits[id]).toBe(planOf(id).maxProjects)
  })

  it('defaults an unknown plan to the free allowance, never to unlimited', () => {
    // `else 3` in the SQL. The failure direction has to cost the business
    // nothing: an unrecognised plan string must not read as "no limit".
    const fallback = /else\s+(null|\d+)/i.exec(
      code(migration).slice(code(migration).indexOf('function public.project_limit()')),
    )
    expect(fallback?.[1]).toBe(String(planOf('free').maxProjects))
  })

  it('reads the plan from app_metadata, not user_metadata', () => {
    // user_metadata is writable by the account itself — see migration
    // 20260731120000. Reading it here would let anyone raise their own ceiling
    // from a browser console.
    expect(code(migration)).toContain("auth.jwt() -> 'app_metadata' ->> 'plan'")
    expect(code(migration)).not.toContain('user_metadata')
  })

  it('applies the ceiling to INSERT only', () => {
    // A lapsed plan must not make existing projects unsavable. If the UPDATE
    // policy ever grows a count, an engineer mid-edit is holding changes they
    // cannot store.
    const sql = code(migration)
    const update = sql.slice(sql.indexOf('for update'))
    expect(update).not.toContain('project_count')
    const insert = sql.slice(sql.indexOf('for insert'), sql.indexOf('for update'))
    expect(insert).toContain('project_count')
  })

  it('every plan that offers saved-projects has a limit the SQL knows about', () => {
    for (const p of PLANS) {
      if (!p.features.includes('saved-projects')) continue
      expect(Object.keys(limits)).toContain(p.id)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────
// The ceiling was countable around, and this file did not notice.
//
// Every assertion above is about the NUMBERS agreeing. All of them passed
// while one PostgREST call with a JSON-array body inserted a hundred projects
// on a Free plan, because `project_count()` is STABLE and a `with check`
// clause cannot see the rows of its own statement. The numbers were right; the
// enforcement was not.
//
// So these are structural. They cannot prove the ceiling holds — only
// `supabase/migrations/project_limit.spec.sql` can, and it does, against a real
// Postgres — but they stop the fix from being deleted or quietly reverted by
// someone reading the policy and concluding the trigger is redundant.
// ─────────────────────────────────────────────────────────────────────────
describe('the ceiling is enforced after the rows land, not from a snapshot', () => {
  const sql = code(triggerMigration)

  it('ships a trigger that fires AFTER INSERT', () => {
    // BEFORE would put us back where we started: the row being inserted is not
    // in the table yet, so the count is short by exactly the rows that matter.
    expect(sql).toMatch(/after\s+insert\s+on\s+public\.projects/)
    expect(sql).toMatch(/create\s+constraint\s+trigger\s+projects_limit/)
  })

  it('counts with a plain query, never through the STABLE project_count()', () => {
    // The one-word "fix" that looks right and is not. `project_count()` is
    // invisible to its own command for MVCC reasons, not caching ones, so
    // marking it VOLATILE would change nothing.
    const fn = sql.slice(sql.indexOf('function public.enforce_project_limit'))
    expect(fn).not.toContain('project_count')
    expect(fn).toMatch(/count\(\*\)\s+into\s+n\s+from\s+public\.projects/)
  })

  it('reads the ceiling from the same project_limit() the policy uses', () => {
    // Two copies of the plan table would be a third place to drift.
    expect(sql).toContain('public.project_limit()')
  })

  it('leaves the service role alone', () => {
    // `auth.uid()` is NULL only when RLS was bypassed, which nothing but the
    // service role can do. A restore or a support fix must not meet the paywall.
    expect(sql).toMatch(/if\s+auth\.uid\(\)\s+is\s+null\s+then\s+return\s+null/)
  })

  it('and the ownership half of the INSERT policy is still in the other file', () => {
    // The trigger only counts. If someone removes `auth.uid() = user_id` on the
    // grounds that the trigger now handles the limit, any signed-in account can
    // plant rows under another user id.
    const insert = code(migration).slice(
      code(migration).indexOf('for insert'), code(migration).indexOf('for update'),
    )
    expect(insert).toContain('auth.uid() = user_id')
  })
})
