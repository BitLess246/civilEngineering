// ─────────────────────────────────────────────────────────────────────────
// Durable storage for soil investigations. Layer 1.
//
// `store.ts` is synchronous by design — localStorage is. A database is not,
// and no amount of wrapping makes it so, which is why this is a separate
// ASYNC interface rather than a fourth `StorageBackend`.
//
// WHY A JSONB DOCUMENT AND NOT THIRTY TABLES.
//
// The original plan called for a normalised relational schema — boreholes,
// layers, samples, tests, one table each. That is the right shape once the
// module needs to QUERY across investigations ("every CH layer with a
// liquefaction FS below 1.2"). It is the wrong shape today: nothing in the app
// asks such a question, the `Investigation` type is still moving, and a
// thirty-table migration written against a moving type is thirty tables of
// guesses plus the migrations to correct them.
//
// So one row per investigation, the document in a `jsonb` column, with the
// schema version alongside it. The cost is that the database cannot index into
// a borehole; the benefit is that the model above stays the single source of
// truth and normalising later is a migration rather than a rewrite. Stated
// here so the next person meets a decision rather than an accident.
//
// CONFLICTS ARE REPORTED, NEVER RESOLVED SILENTLY. Two devices editing one
// investigation is a real scenario, and laboratory data is expensive to
// re-enter. A save that would overwrite a newer remote version fails with both
// versions attached, and the caller decides.
// ─────────────────────────────────────────────────────────────────────────

import type { Investigation } from './model'
import { SOILS_SCHEMA_VERSION, isInvestigation, type InvestigationSummary, type SoilsStore } from './store'
import { contentHash as hashOf } from '../../lib/contentHash'


export interface RemoteRecord {
  id: string
  investigation: Investigation
  schemaVersion: number
  /** Server timestamp of the last write, ISO. */
  updatedAt: string
}

/** Raised when a save would clobber a version the caller has not seen. */
export class ConflictError extends Error {
  readonly id: string
  readonly remote: RemoteRecord
  readonly expectedUpdatedAt: string | undefined

  constructor(id: string, remote: RemoteRecord, expectedUpdatedAt: string | undefined) {
    super(
      `"${remote.investigation.meta.investigationNo || id}" was changed elsewhere at ${remote.updatedAt}. Saving now would discard that version.`,
    )
    this.name = 'ConflictError'
    this.id = id
    this.remote = remote
    this.expectedUpdatedAt = expectedUpdatedAt
  }
}

export interface RemoteStore {
  list(): Promise<InvestigationSummary[]>
  load(id: string): Promise<RemoteRecord | null>
  /**
   * Write. `expectedUpdatedAt` is the version the caller last read; a mismatch
   * raises ConflictError rather than overwriting. Omit it only when creating.
   */
  save(id: string, inv: Investigation, expectedUpdatedAt?: string): Promise<RemoteRecord>
  remove(id: string): Promise<void>
}

export const summaryOf = (r: RemoteRecord): InvestigationSummary => ({
  id: r.id,
  investigationNo: r.investigation.meta.investigationNo,
  title: r.investigation.meta.title,
  projectName: r.investigation.meta.site.projectName,
  status: r.investigation.meta.status,
  savedAt: r.updatedAt,
  boreholeCount: r.investigation.boreholes.length,
  sampleCount: r.investigation.boreholes.reduce((n, b) => n + b.samples.length, 0),
})

// ── In-memory implementation, for tests and for the offline case ──────────

export function memoryRemote(seed: RemoteRecord[] = []): RemoteStore {
  const rows = new Map<string, RemoteRecord>(seed.map((r) => [r.id, r]))
  // A counter, not Date.now(): two saves inside the same millisecond must still
  // produce different versions, or optimistic concurrency silently stops working.
  let tick = 0
  const stamp = () => new Date(Date.UTC(2026, 0, 1) + ++tick * 1000).toISOString()

  return {
    async list() {
      return [...rows.values()].map(summaryOf).sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    },
    async load(id) {
      return rows.get(id) ?? null
    },
    async save(id, investigation, expectedUpdatedAt) {
      const existing = rows.get(id)
      if (existing && existing.updatedAt !== expectedUpdatedAt) {
        throw new ConflictError(id, existing, expectedUpdatedAt)
      }
      const rec: RemoteRecord = {
        id, investigation, schemaVersion: SOILS_SCHEMA_VERSION, updatedAt: stamp(),
      }
      rows.set(id, rec)
      return rec
    },
    async remove(id) {
      rows.delete(id)
    },
  }
}

// ── Sync between the local store and a remote ─────────────────────────────

export type SyncOutcome =
  | { kind: 'uploaded'; id: string }
  | { kind: 'downloaded'; id: string }
  | { kind: 'in-sync'; id: string }
  | { kind: 'conflict'; id: string; local: Investigation; remote: RemoteRecord }
  | { kind: 'failed'; id: string; error: string }

export interface SyncReport {
  outcomes: SyncOutcome[]
  /** Conflicts need a human. Surfaced separately so they cannot be scrolled past. */
  conflicts: Extract<SyncOutcome, { kind: 'conflict' }>[]
}

/**
 * Content fingerprint of an investigation — the shared rule from
 * `lib/contentHash`, re-exported so this module's callers keep one import.
 * The argument is narrowed to `Investigation` on purpose: hashing anything
 * else here would be a call-site mistake, not a feature.
 */
export const contentHash = (inv: Investigation): string => hashOf(inv)

/**
 * The watermark for one investigation, as of the last reconciliation: what the
 * local document HASHED to, and what the server's version stamp was.
 *
 * Two different tokens because the two sides answer to different clocks. The
 * first version stored one timestamp for both, which made `localChanged`
 * permanently true and re-uploaded on every sync.
 */
export interface SyncMark {
  localHash: string
  remote: string
}

export interface SyncMarks {
  get(id: string): SyncMark | undefined
  set(id: string, mark: SyncMark): void
}

export function memoryMarks(seed: Record<string, SyncMark> = {}): SyncMarks {
  const m = new Map(Object.entries(seed))
  return { get: (id) => m.get(id), set: (id, mark) => void m.set(id, mark) }
}

/**
 * Reconcile every local investigation with the remote.
 *
 * The rule, in one sentence: an investigation the remote has not seen is
 * UPLOADED; one the remote has and the local does not is DOWNLOADED; one that
 * changed in both places is a CONFLICT and is left alone.
 *
 * There is deliberately no "last write wins". Two engineers entering different
 * laboratory results for the same hole is precisely the case where picking one
 * automatically destroys work that took a week to produce.
 */
export async function syncInvestigations(
  local: SoilsStore, remote: RemoteStore, marks: SyncMarks,
): Promise<SyncReport> {
  const outcomes: SyncOutcome[] = []
  const localList = local.list()
  const remoteList = await remote.list()
  const remoteById = new Map(remoteList.map((r) => [r.id, r]))

  for (const summary of localList) {
    const id = summary.id
    try {
      const inv = local.load(id)
      if (!inv) continue
      const seen = marks.get(id)
      const onRemote = remoteById.get(id)

      if (!onRemote) {
        const rec = await remote.save(id, inv, undefined)
        marks.set(id, { localHash: contentHash(inv), remote: rec.updatedAt })
        outcomes.push({ kind: 'uploaded', id })
        continue
      }

      // Local change by CONTENT, remote change by the server's own stamp.
      const localChanged = contentHash(inv) !== seen?.localHash
      const remoteChanged = onRemote.savedAt !== seen?.remote

      if (!remoteChanged && !localChanged) {
        outcomes.push({ kind: 'in-sync', id })
      } else if (localChanged && !remoteChanged) {
        const rec = await remote.save(id, inv, onRemote.savedAt)
        marks.set(id, { localHash: contentHash(inv), remote: rec.updatedAt })
        outcomes.push({ kind: 'uploaded', id })
      } else if (remoteChanged && !localChanged) {
        const rec = await remote.load(id)
        if (rec) {
          local.save(id, rec.investigation)
          marks.set(id, { localHash: contentHash(rec.investigation), remote: rec.updatedAt })
          outcomes.push({ kind: 'downloaded', id })
        }
      } else {
        const rec = await remote.load(id)
        if (rec) outcomes.push({ kind: 'conflict', id, local: inv, remote: rec })
      }
    } catch (e) {
      if (e instanceof ConflictError) {
        outcomes.push({ kind: 'conflict', id, local: local.load(id)!, remote: e.remote })
      } else {
        outcomes.push({ kind: 'failed', id, error: e instanceof Error ? e.message : String(e) })
      }
    }
  }

  // Anything on the remote this browser has never seen.
  const localIds = new Set(localList.map((s) => s.id))
  for (const r of remoteList) {
    if (localIds.has(r.id)) continue
    try {
      const rec = await remote.load(r.id)
      if (!rec || !isInvestigation(rec.investigation)) continue
      local.save(r.id, rec.investigation)
      marks.set(r.id, { localHash: contentHash(rec.investigation), remote: rec.updatedAt })
      outcomes.push({ kind: 'downloaded', id: r.id })
    } catch (e) {
      outcomes.push({ kind: 'failed', id: r.id, error: e instanceof Error ? e.message : String(e) })
    }
  }

  return {
    outcomes,
    conflicts: outcomes.filter((o): o is Extract<SyncOutcome, { kind: 'conflict' }> => o.kind === 'conflict'),
  }
}
