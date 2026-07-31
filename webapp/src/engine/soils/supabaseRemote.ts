// ─────────────────────────────────────────────────────────────────────────
// Supabase-backed `RemoteStore`.
//
// Deliberately thin: it maps rows to `RemoteRecord` and translates the one
// error that matters (a version mismatch) into `ConflictError`. All the
// reconciliation logic lives in `remoteStore.ts`, which is testable without a
// database.
//
// SECURITY. Every query goes through the ANON key with the user's session, so
// Row Level Security is what actually enforces ownership — not the `.eq('user_id',
// …)` filters below, which are an optimisation and a readability aid. The
// policy in the migration is the security boundary; if it were dropped, adding
// filters here would not save us. The service-role key must never appear in
// this bundle, and `authClient` carries a test asserting that.
//
// SCHEMA VERSION. A row written by a newer client is REFUSED rather than
// parsed, because a partial read of a shape this client does not understand is
// worse than an error the user can act on.
// ─────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Investigation } from './model'
import { SOILS_SCHEMA_VERSION, isInvestigation, type InvestigationSummary } from './store'
import { ConflictError, summaryOf, type RemoteRecord, type RemoteStore } from './remoteStore'

export const TABLE = 'soil_investigations'

interface Row {
  id: string
  user_id: string
  investigation: unknown
  schema_version: number
  updated_at: string
}

function toRecord(row: Row): RemoteRecord {
  if (row.schema_version > SOILS_SCHEMA_VERSION) {
    throw new Error(
      `Investigation "${row.id}" was saved by a newer version of the app (format ${row.schema_version}, this client reads ${SOILS_SCHEMA_VERSION}). Update before opening it — reading it with this version could silently drop data.`,
    )
  }
  if (!isInvestigation(row.investigation)) {
    throw new Error(`Investigation "${row.id}" did not come back in a shape this client recognises.`)
  }
  return {
    id: row.id,
    investigation: row.investigation,
    schemaVersion: row.schema_version,
    updatedAt: row.updated_at,
  }
}

export function supabaseRemote(client: SupabaseClient, userId: string): RemoteStore {
  return {
    async list(): Promise<InvestigationSummary[]> {
      const { data, error } = await client
        .from(TABLE)
        .select('id, user_id, investigation, schema_version, updated_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
      if (error) throw new Error(error.message)

      const out: InvestigationSummary[] = []
      for (const row of (data ?? []) as Row[]) {
        // One unreadable row must not take the whole listing down — the same
        // rule the local store follows for a corrupt entry.
        try { out.push(summaryOf(toRecord(row))) } catch { continue }
      }
      return out
    },

    async load(id): Promise<RemoteRecord | null> {
      const { data, error } = await client
        .from(TABLE)
        .select('id, user_id, investigation, schema_version, updated_at')
        .eq('user_id', userId)
        .eq('id', id)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data ? toRecord(data as Row) : null
    },

    async save(id, inv: Investigation, expectedUpdatedAt): Promise<RemoteRecord> {
      // Optimistic concurrency: the UPDATE is conditional on the version the
      // caller read. Zero rows back means someone else got there first.
      if (expectedUpdatedAt) {
        const { data, error } = await client
          .from(TABLE)
          .update({ investigation: inv, schema_version: SOILS_SCHEMA_VERSION, updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('id', id)
          .eq('updated_at', expectedUpdatedAt)
          .select('id, user_id, investigation, schema_version, updated_at')
          .maybeSingle()
        if (error) throw new Error(error.message)
        if (!data) {
          const current = await this.load(id)
          if (current) throw new ConflictError(id, current, expectedUpdatedAt)
          throw new Error(`Investigation "${id}" no longer exists on the server.`)
        }
        return toRecord(data as Row)
      }

      const { data, error } = await client
        .from(TABLE)
        .insert({
          id, user_id: userId, investigation: inv,
          schema_version: SOILS_SCHEMA_VERSION, updated_at: new Date().toISOString(),
        })
        .select('id, user_id, investigation, schema_version, updated_at')
        .single()
      if (error) {
        // 23505 = unique violation: the row already exists, so this is a
        // create racing an existing record rather than a transport failure.
        if ((error as { code?: string }).code === '23505') {
          const current = await this.load(id)
          if (current) throw new ConflictError(id, current, undefined)
        }
        throw new Error(error.message)
      }
      return toRecord(data as Row)
    },

    async remove(id) {
      const { error } = await client.from(TABLE).delete().eq('user_id', userId).eq('id', id)
      if (error) throw new Error(error.message)
    },
  }
}
