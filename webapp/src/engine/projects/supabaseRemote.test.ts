// The project ceiling is enforced in the database, so this file cannot test
// that it holds — `supabase/migrations/project_limit.spec.sql` does, against a
// real Postgres, and is the place to look for that.
//
// What IS this module's job is TRANSLATION: turning whichever refusal Postgres
// sent into `ProjectLimitError`, so the user reads "delete one or upgrade"
// instead of a raw SQLSTATE. Getting that wrong in either direction is its own
// bug — a missed refusal shows a database error to a paying customer, and an
// over-eager match tells someone with a genuine permissions problem to buy a
// bigger plan.

import { describe, it, expect } from 'vitest'
import { isLimitRefusal } from './supabaseRemote'
import trigger from '../../../../supabase/migrations/20260813000000_project_limit_trigger.sql?raw'

describe('isLimitRefusal', () => {
  it('recognises the INSERT policy turning a single save away', () => {
    expect(isLimitRefusal({
      code: '42501',
      message: 'new row violates row-level security policy for table "projects"',
    })).toBe(true)
  })

  it('recognises the constraint trigger, which is what a bulk insert hits', () => {
    // The policy's count is STABLE and blind to rows from its own statement, so
    // a multi-row insert sails past it and is stopped afterwards. Before this
    // was handled, that path surfaced as a bare `project limit reached` string.
    expect(isLimitRefusal({ code: '23514', message: 'project limit reached' })).toBe(true)
  })

  it('leaves an unrelated permission failure alone', () => {
    expect(isLimitRefusal({ code: '42501', message: 'permission denied for table projects' })).toBe(false)
  })

  it('leaves an unrelated check violation alone', () => {
    // A future CHECK constraint on this table must not read as a paywall.
    expect(isLimitRefusal({ code: '23514', message: 'new row violates check constraint "projects_id_check"' }))
      .toBe(false)
  })

  it('does not guess from a message with no code', () => {
    expect(isLimitRefusal({ message: 'project limit reached' })).toBe(false)
    expect(isLimitRefusal({})).toBe(false)
  })
})

describe('the message this file matches is the one the trigger raises', () => {
  // The string is the contract between the migration and the client, and
  // nothing else ties them together. If the trigger's wording is edited, this
  // fails here rather than as a customer seeing a SQLSTATE.
  it('the trigger raises exactly "project limit reached"', () => {
    expect(trigger).toMatch(/raise exception 'project limit reached'/)
  })

  it('and raises it as a check_violation', () => {
    expect(trigger).toMatch(/using errcode = 'check_violation'/)
  })
})
