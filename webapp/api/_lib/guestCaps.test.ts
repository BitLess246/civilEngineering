// The guest ceilings exist in two places and have to: TypeScript sends them as
// RPC arguments, and the SQL decides what it will actually honour. The server
// cannot import TypeScript, and after `20260813010000_guest_run_caps.sql` the
// SQL no longer trusts what it is sent — which is the fix, and which also means
// the two can now disagree WITHOUT ANYTHING FAILING. A `p_limit` of 9 would
// simply be quietly clamped to 5, and the only symptom would be a pricing page
// promising nine runs and a database handing out five.
//
// So this file reads the migration and checks the numbers match. It is the
// same arrangement `plans.limits.test.ts` uses for the project ceiling, and for
// the same reason.

import { describe, it, expect } from 'vitest'
import caps from '../../../supabase/migrations/20260813010000_guest_run_caps.sql?raw'
import { GUEST_TRIAL_LIMIT } from './quota'
import { ROUTE_CAP_PER_SUBJECT } from './subject'

/** SQL with `--` comments stripped, so a comment naming a value cannot match. */
const code = (sql: string): string =>
  // No `$` anchor: `.` does not match `\r`, so on a CRLF checkout `/--.*$/`
  // matches nothing and every comment survives. That exact slip made
  // `plans.limits.test.ts` green on Linux and red on Windows.
  sql.split('\n').map((l) => l.replace(/--.*/, '')).join('\n')

/** The integer a one-line `select N` SQL function returns. */
function returns(sql: string, fn: string): number | null {
  const at = sql.indexOf(`function public.${fn}()`)
  if (at < 0) return null
  const m = /select\s+(\d+)/i.exec(sql.slice(at, sql.indexOf('$$', sql.indexOf('$$', at) + 2)))
  return m ? Number(m[1]) : null
}

describe('the SQL ceilings match the TypeScript ones', () => {
  const sql = code(caps)

  it('found the functions at all — a silent null would pass everything', () => {
    expect(returns(sql, 'guest_run_limit')).not.toBeNull()
    expect(returns(sql, 'guest_route_cap')).not.toBeNull()
    expect(returns(sql, 'guest_trials_max_rows')).not.toBeNull()
  })

  it('agrees on the run allowance', () => {
    expect(returns(sql, 'guest_run_limit')).toBe(GUEST_TRIAL_LIMIT)
  })

  it('agrees on the per-subject route cap', () => {
    expect(returns(sql, 'guest_route_cap')).toBe(ROUTE_CAP_PER_SUBJECT)
  })
})

describe('the clamp is still a clamp', () => {
  const sql = code(caps)

  it('bounds both arguments with least(), against the server functions', () => {
    // `least(x, ceiling)` is the whole fix. `greatest(…, 0)` beside it stops a
    // negative or null argument reading as unlimited through a later comparison.
    // Asserted on the assignment LINE rather than with one regex over the pair:
    // the arguments nest parentheses, and a regex that tries to span them is
    // the kind that passes by accident later.
    // `\s*:=` rather than a literal ' :=' — the two assignments are aligned in
    // the migration, so one of them has three spaces.
    const line = (name: string) =>
      sql.split('\n').find((l) => new RegExp(`${name}\\s*:=`).test(l)) ?? ''

    for (const [name, ceiling] of [
      ['eff_limit', 'public.guest_run_limit()'],
      ['eff_cap', 'public.guest_route_cap()'],
    ]) {
      expect(line(name), name).toContain('least(')
      expect(line(name), name).toContain('greatest(')
      expect(line(name), name).toContain(ceiling)
    }
  })

  it('uses the clamped values, never the raw arguments, in the decisions', () => {
    // The failure this catches is a partial fix: computing `eff_limit` and then
    // comparing against `p_limit` anyway. Inside the function body after the
    // clamp, the raw arguments must not appear in a comparison.
    const body = sql.slice(sql.indexOf('eff_limit :='))
    expect(body).toMatch(/row_used\s*>=\s*eff_limit/)
    expect(body).toMatch(/distinct_rts\s*>=\s*eff_cap/)
    expect(body).not.toMatch(/>=\s*p_limit/)
    expect(body).not.toMatch(/>=\s*p_cap/)
  })

  it('keeps the whole-table backstop on the only branch that grows the table', () => {
    // The route cap is per-subject and subjects are caller-invented, so it has
    // never bounded the table. If this check moves off the insert path, nothing
    // does.
    const insertBranch = sql.slice(sql.indexOf('select count(*) into distinct_rts'))
    expect(insertBranch).toContain('guest_trials_full()')
  })

  it('fails OPEN on a full table, matching what quota.ts expects to read', () => {
    // `allowed = true` with reason 'table-full'. If this ever became a refusal,
    // a storage backstop would close the shop window on every new visitor at
    // once — and `quota.ts` would report it as a spent allowance.
    expect(sql).toMatch(/guest_trials_full\(\)\s*then\s*\n?\s*return query select true, false, 0, 'table-full'/)
  })
})
