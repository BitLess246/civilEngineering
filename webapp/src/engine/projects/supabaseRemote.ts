// ─────────────────────────────────────────────────────────────────────────
// Supabase-backed `RemoteStore` for projects.
//
// Deliberately thin: it maps rows to `RemoteRecord` and translates the two
// errors that matter — a version mismatch and a plan ceiling — into typed
// exceptions. All the reconciliation logic lives in `remoteStore.ts`, which is
// testable without a database.
//
// SECURITY. Every query goes through the ANON key with the user's session, so
// Row Level Security is what enforces ownership; the `.eq('user_id', …)`
// filters are an optimisation and a readability aid, not a control. The
// project CEILING is enforced by the same policy — see the migration — which
// is the difference between a paywall and a suggestion. A browser that skips
// this file entirely still cannot insert row four on a Free plan.
//
// SCHEMA VERSION. A row written by a newer client is REFUSED rather than
// parsed: a partial read of a shape this client does not understand is worse
// than an error the engineer can act on.
// ─────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { isProject, summaryOf, PROJECT_SCHEMA_VERSION, type Project, type ProjectSummary } from './model'
import { ConflictError, ProjectLimitError, type RemoteRecord, type RemoteStore } from './remoteStore'

export const TABLE = 'projects'

const COLUMNS = 'id, user_id, project, schema_version, updated_at'

interface Row {
  id: string
  user_id: string
  project: unknown
  schema_version: number
  updated_at: string
}

function toRecord(row: Row): RemoteRecord {
  if (row.schema_version > PROJECT_SCHEMA_VERSION) {
    throw new Error(
      `Project "${row.id}" was saved by a newer version of the app (format ${row.schema_version}, this client reads ${PROJECT_SCHEMA_VERSION}). Update before opening it — reading it with this version could silently drop data.`,
    )
  }
  if (!isProject(row.project)) {
    throw new Error(`Project "${row.id}" did not come back in a shape this client recognises.`)
  }
  return {
    id: row.id,
    project: row.project,
    schemaVersion: row.schema_version,
    updatedAt: row.updated_at,
  }
}

/**
 * Postgres tells us the ceiling was hit by refusing the INSERT — in one of two
 * ways, because the ceiling is enforced in two places.
 *
 * 42501 (insufficient_privilege) is the INSERT policy's `with check` turning
 * away a single-row save before a row is written. It is indistinguishable from
 * any other policy refusal by code alone, hence the message sniff.
 *
 * 23514 (check_violation) is the `projects_limit` constraint trigger, which is
 * the authority: the policy's count is `STABLE` and cannot see rows from its
 * own statement, so a multi-row insert gets past it and is stopped after the
 * rows land. See `supabase/migrations/20260813000000_project_limit_trigger.sql`.
 *
 * The fallback in both cases is a plain error, so a genuine permission problem
 * is never mislabelled as "buy a bigger plan".
 */
export function isLimitRefusal(error: { code?: string; message?: string }): boolean {
  const m = (error.message ?? '').toLowerCase()
  if (error.code === '23514') return m.includes('project limit reached')
  if (error.code !== '42501') return false
  return m.includes('row-level security') || m.includes('row level security')
}

export function supabaseRemote(client: SupabaseClient, userId: string): RemoteStore {
  const self: RemoteStore = {
    async list(): Promise<ProjectSummary[]> {
      const { data, error } = await client
        .from(TABLE).select(COLUMNS)
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
      if (error) throw new Error(error.message)

      const out: ProjectSummary[] = []
      for (const row of (data ?? []) as unknown as Row[]) {
        // One unreadable row must not take the whole listing down — the same
        // rule the local store follows for a corrupt entry.
        try { const r = toRecord(row); out.push(summaryOf(r.id, r.project)) } catch { continue }
      }
      return out
    },

    async load(id): Promise<RemoteRecord | null> {
      const { data, error } = await client
        .from(TABLE).select(COLUMNS)
        .eq('user_id', userId).eq('id', id)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data ? toRecord(data as unknown as Row) : null
    },

    async save(id, project: Project, expectedUpdatedAt): Promise<RemoteRecord> {
      // Optimistic concurrency: the UPDATE is conditional on the version the
      // caller read. Zero rows back means someone else got there first.
      if (expectedUpdatedAt) {
        const { data, error } = await client
          .from(TABLE)
          .update({ project, schema_version: PROJECT_SCHEMA_VERSION, updated_at: new Date().toISOString() })
          .eq('user_id', userId).eq('id', id).eq('updated_at', expectedUpdatedAt)
          .select(COLUMNS)
          .maybeSingle()
        if (error) throw new Error(error.message)
        if (!data) {
          const current = await self.load(id)
          if (current) throw new ConflictError(id, current, expectedUpdatedAt)
          throw new Error(`Project "${id}" no longer exists on the server.`)
        }
        return toRecord(data as unknown as Row)
      }

      const { data, error } = await client
        .from(TABLE)
        .insert({
          id, user_id: userId, project,
          schema_version: PROJECT_SCHEMA_VERSION, updated_at: new Date().toISOString(),
        })
        .select(COLUMNS)
        .single()
      if (error) {
        const e = error as { code?: string; message?: string }
        // 23505 = unique violation: the row exists, so this is a create racing
        // an existing record rather than a transport failure.
        if (e.code === '23505') {
          const current = await self.load(id)
          if (current) throw new ConflictError(id, current, undefined)
        }
        if (isLimitRefusal(e)) throw new ProjectLimitError(await countFor(client, userId))
        throw new Error(error.message)
      }
      return toRecord(data as unknown as Row)
    },

    async remove(id) {
      const { error } = await client.from(TABLE).delete().eq('user_id', userId).eq('id', id)
      if (error) throw new Error(error.message)
    },
  }
  return self
}

/**
 * How many projects the account already has, for the limit message.
 *
 * Asked only when a save has ALREADY been refused, so the extra round trip
 * costs nothing on the path that matters. Returns 0 if even the count fails —
 * a vague message beats an error swallowing the real one.
 */
async function countFor(client: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await client
    .from(TABLE).select('id', { count: 'exact', head: true }).eq('user_id', userId)
  return error ? 0 : (count ?? 0)
}
