// ─────────────────────────────────────────────────────────────────────────
// Self-test for the soil-investigation remote store.
//
// The adapter in `supabaseRemote.ts` is unit-tested against a postgrest-shaped
// fake, which proves the LOGIC but not the CONTRACT: whether the column names
// match the table, and whether Postgres really returns the error codes the
// adapter branches on. Those can only be settled against a live database.
//
// So the settling is done HERE, in the app, on demand — rather than in a
// throwaway script on one machine. It runs the same probes a developer would,
// reports each as a plain pass/fail with what it actually saw, and is safe to
// run against production data because:
//
//   • it WRITES NOTHING except under a row id it owns and then deletes;
//   • the one deliberately-refused write proves RLS is enforcing, and a refusal
//     is the PASS condition for that check;
//   • every probe is scoped to the signed-in user.
//
// If a check fails, the message says what was expected and what came back, so
// the failure is actionable rather than "sync is broken".
// ─────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { TABLE } from './supabaseRemote'
import { emptyInvestigation } from './model'
import { SOILS_SCHEMA_VERSION } from './store'

export interface DiagnosticResult {
  name: string
  status: 'pass' | 'fail' | 'skipped'
  /** What happened, in words a reader can act on. */
  detail: string
}

export interface DiagnosticsReport {
  results: DiagnosticResult[]
  ok: boolean
  /** True when every check that could run, passed. */
  ranAll: boolean
}

const PROBE_PREFIX = '__diag_'

/**
 * Run the checks. `userId` must be the signed-in user: without it RLS denies
 * everything and the run tells you nothing except that RLS exists.
 */
export async function runRemoteDiagnostics(
  client: SupabaseClient, userId: string | null,
): Promise<DiagnosticsReport> {
  const results: DiagnosticResult[] = []
  const add = (name: string, status: DiagnosticResult['status'], detail: string) =>
    results.push({ name, status, detail })

  // 1 — reachability and COLUMN NAMES. PostgREST parses the column list before
  // RLS filters rows, so a wrong name errors even when the result is empty.
  // This is the single most valuable check: it is what the fake cannot prove.
  {
    const { error } = await client
      .from(TABLE)
      .select('id, user_id, investigation, schema_version, updated_at')
      .limit(1)
    if (error) {
      add('Table and column names', 'fail',
        `The adapter's column list was rejected: ${error.message}. Either the table is missing or a column name differs from what the client expects.`)
    } else {
      add('Table and column names', 'pass',
        'Every column the adapter reads exists on the table.')
    }
  }

  // 2 — control. If a deliberately bogus column does NOT error, check 1 proves
  // nothing, and a green report would be worthless.
  {
    const { error } = await client.from(TABLE).select('id, definitely_not_a_column').limit(1)
    if (error) {
      add('Column check is meaningful', 'pass',
        'A deliberately wrong column name was rejected, so the check above is a real test.')
    } else {
      add('Column check is meaningful', 'fail',
        'A nonsense column name was ACCEPTED. The column check above cannot be trusted.')
    }
  }

  // 3 — RLS. A refusal is the PASS condition.
  {
    const { error } = await client.from(TABLE).insert({
      id: `${PROBE_PREFIX}rls`,
      user_id: '00000000-0000-0000-0000-000000000000',
      investigation: { probe: true },
      schema_version: SOILS_SCHEMA_VERSION,
      updated_at: new Date().toISOString(),
    })
    if (error) {
      add('Row-level security', 'pass',
        `A write under another user's id was refused (${error.code ?? 'no code'}). One account cannot write into another's data.`)
    } else {
      add('Row-level security', 'fail',
        'A row was written under a DIFFERENT user id. Row-level security is not protecting this table — treat the data as public until the policies are fixed.')
      await client.from(TABLE).delete().eq('id', `${PROBE_PREFIX}rls`)
    }
  }

  if (!userId) {
    add('Round trip', 'skipped', 'Not signed in, so the save/read/update path could not be exercised.')
    add('Conflict detection', 'skipped', 'Not signed in.')
    return { results, ok: results.every((r) => r.status !== 'fail'), ranAll: false }
  }

  // 4 — the real round trip, under a row this user owns.
  const probeId = `${PROBE_PREFIX}${Date.now().toString(36)}`
  try {
    const inv = emptyInvestigation('Connection test')
    inv.meta.investigationNo = probeId

    const { data, error } = await client
      .from(TABLE)
      .insert({
        id: probeId, user_id: userId, investigation: inv,
        schema_version: SOILS_SCHEMA_VERSION, updated_at: new Date().toISOString(),
      })
      .select('id, user_id, investigation, schema_version, updated_at')
      .single()

    if (error || !data) {
      add('Round trip', 'fail', `Could not write a test row: ${error?.message ?? 'no row returned'}.`)
      add('Conflict detection', 'skipped', 'The test row could not be created.')
      return { results, ok: false, ranAll: false }
    }
    const firstStamp = (data as { updated_at: string }).updated_at

    const back = await client.from(TABLE).select('investigation').eq('id', probeId).maybeSingle()
    const readNo = (back.data as { investigation?: { meta?: { investigationNo?: string } } } | null)
      ?.investigation?.meta?.investigationNo
    if (readNo === probeId) {
      add('Round trip', 'pass', 'A test investigation was written, read back intact, and will be removed.')
    } else {
      add('Round trip', 'fail',
        `The document did not come back as written (read "${readNo ?? 'nothing'}"). The jsonb column may not be round-tripping.`)
    }

    // 5 — optimistic concurrency: a conditional update against a STALE stamp
    // must match zero rows. This is what stops two devices overwriting each
    // other, and it is the other thing the fake cannot prove.
    const stale = new Date(Date.parse(firstStamp) - 60_000).toISOString()
    const { data: staleRows, error: staleErr } = await client
      .from(TABLE)
      .update({ investigation: { clobbered: true }, updated_at: new Date().toISOString() })
      .eq('user_id', userId).eq('id', probeId).eq('updated_at', stale)
      .select('id')
    if (staleErr) {
      add('Conflict detection', 'fail', `The conditional update errored rather than matching nothing: ${staleErr.message}.`)
    } else if ((staleRows ?? []).length === 0) {
      add('Conflict detection', 'pass',
        'An update carrying an out-of-date version matched no rows, so a stale write is refused instead of overwriting newer work.')
    } else {
      add('Conflict detection', 'fail',
        'An update carrying an OUT-OF-DATE version was applied. Two devices editing one investigation would silently overwrite each other.')
    }
  } finally {
    // Always clean up, including when a check threw.
    await client.from(TABLE).delete().eq('user_id', userId).eq('id', probeId)
  }

  return {
    results,
    ok: results.every((r) => r.status !== 'fail'),
    ranAll: results.every((r) => r.status !== 'skipped'),
  }
}
