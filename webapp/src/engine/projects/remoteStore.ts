// ─────────────────────────────────────────────────────────────────────────
// Durable project storage — the async half. Layer 1.
//
// `store.ts` is synchronous because localStorage is. A database is not, and no
// amount of wrapping makes it so, which is why this is a separate interface
// rather than a fourth `StorageBackend`.
//
// CONFLICTS ARE REPORTED, NEVER RESOLVED SILENTLY. Two machines editing one
// project is the reason an engineer wanted cloud storage in the first place. A
// save that would overwrite a version the caller has not seen fails with both
// versions attached, and the caller decides which to keep. There is no
// field-by-field merge: two versions of a structural model are not mergeable
// without someone deciding which column size is right, and a machine guessing
// at that is worse than asking.
//
// One row per project, the document in a `jsonb` column — the same call the
// soils module made, argued at length in `engine/soils/remoteStore.ts`. Nothing
// queries across projects, so normalising now would be thirty tables of
// guesses; normalising later is a migration rather than a rewrite.
// ─────────────────────────────────────────────────────────────────────────

import { contentHash as hashOf } from '../../lib/contentHash'
import { summaryOf, type Project, type ProjectSummary } from './model'
import type { ProjectStore } from './store'

export interface RemoteRecord {
  id: string
  project: Project
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
      `"${remote.project.meta.name || id}" was changed elsewhere at ${remote.updatedAt}. Saving now would discard that version.`,
    )
    this.name = 'ConflictError'
    this.id = id
    this.remote = remote
    this.expectedUpdatedAt = expectedUpdatedAt
  }
}

/** Raised when the account is already at its plan's project ceiling. */
export class ProjectLimitError extends Error {
  readonly limit: number
  constructor(limit: number) {
    super(
      limit === 0
        ? 'Your plan does not include saved projects.'
        : `Your plan keeps ${limit} saved project${limit === 1 ? '' : 's'}. Delete one, or move to a plan without a limit.`,
    )
    this.name = 'ProjectLimitError'
    this.limit = limit
  }
}

export interface RemoteStore {
  list(): Promise<ProjectSummary[]>
  load(id: string): Promise<RemoteRecord | null>
  /**
   * Write. `expectedUpdatedAt` is the version the caller last read; a mismatch
   * raises ConflictError rather than overwriting. Omit it only when creating.
   */
  save(id: string, project: Project, expectedUpdatedAt?: string): Promise<RemoteRecord>
  remove(id: string): Promise<void>
}

/** Content fingerprint of a project — the shared rule, narrowed to this type. */
export const contentHash = (p: Project): string => hashOf(p)

// ── In-memory implementation, for tests and the offline case ──────────────

export function memoryRemote(seed: RemoteRecord[] = [], limit: number | null = null): RemoteStore {
  const rows = new Map<string, RemoteRecord>(seed.map((r) => [r.id, r]))
  // A counter, not Date.now(): two saves inside the same millisecond must still
  // produce different versions, or optimistic concurrency stops working exactly
  // when the app is fast.
  let tick = 0
  const stamp = () => new Date(Date.UTC(2026, 0, 1) + ++tick * 1000).toISOString()

  const self: RemoteStore = {
    async list() {
      return [...rows.values()]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((r) => summaryOf(r.id, r.project))
    },
    async load(id) {
      return rows.get(id) ?? null
    },
    async save(id, project, expectedUpdatedAt) {
      const current = rows.get(id)
      if (current && current.updatedAt !== expectedUpdatedAt) {
        throw new ConflictError(id, current, expectedUpdatedAt)
      }
      if (!current && expectedUpdatedAt) {
        throw new Error(`Project "${id}" no longer exists on the server.`)
      }
      if (!current && limit !== null && rows.size >= limit) throw new ProjectLimitError(limit)
      const rec: RemoteRecord = { id, project, schemaVersion: 1, updatedAt: stamp() }
      rows.set(id, rec)
      return rec
    },
    async remove(id) {
      rows.delete(id)
    },
  }
  return self
}

// ── Reconciliation ────────────────────────────────────────────────────────

/**
 * The watermark for one project as of the last reconciliation: what the local
 * document HASHED to, and what the server's version stamp was.
 *
 * Two tokens because the two sides answer to different clocks. Storing one
 * timestamp for both — the obvious first version — makes `localChanged`
 * permanently true and re-uploads on every sync.
 */
export interface SyncMark {
  localHash: string
  remote: string
}

export interface SyncMarks {
  get(id: string): SyncMark | undefined
  set(id: string, mark: SyncMark): void
  forget(id: string): void
}

/** What one reconciliation did, per project. */
export type SyncOutcome =
  | { id: string; kind: 'uploaded' }
  | { id: string; kind: 'downloaded' }
  | { id: string; kind: 'unchanged' }
  | { id: string; kind: 'conflict'; local: Project; remote: RemoteRecord }
  | { id: string; kind: 'failed'; message: string }

export interface SyncReport {
  outcomes: SyncOutcome[]
  at: string
}

/**
 * Reconcile every local and remote project once.
 *
 * The decision for each id is made from three facts — did the local document
 * change since the mark, did the remote stamp change since the mark, does each
 * side exist — and NOTHING ELSE. In particular not "which is newer": wall
 * clocks on two machines disagree, and a laptop an hour behind would quietly
 * win every race.
 *
 * Both-changed is a CONFLICT and is reported, not resolved. Nothing is deleted
 * on either side: a project missing from one side is treated as new to it, so
 * a failed sync can never be the reason work disappeared. Deleting is an
 * explicit act through `remove`.
 */
export async function syncProjects(
  local: ProjectStore, remote: RemoteStore, marks: SyncMarks,
): Promise<SyncReport> {
  const at = new Date().toISOString()
  const outcomes: SyncOutcome[] = []

  const remoteList = await remote.list()
  const remoteIds = new Set(remoteList.map((r) => r.id))
  const localIds = new Set(local.list().map((r) => r.id))

  for (const id of new Set([...localIds, ...remoteIds])) {
    try {
      outcomes.push(await reconcile(id, local, remote, marks))
    } catch (e) {
      outcomes.push({ id, kind: 'failed', message: e instanceof Error ? e.message : String(e) })
    }
  }

  return { outcomes, at }
}

async function reconcile(
  id: string, local: ProjectStore, remote: RemoteStore, marks: SyncMarks,
): Promise<SyncOutcome> {
  const mine = local.load(id)
  const theirs = await remote.load(id)
  const mark = marks.get(id)

  if (!mine && !theirs) return { id, kind: 'unchanged' }

  // Only on the server: take it. This also covers a machine that has never
  // seen the project, which is the whole point of storing it centrally.
  if (!mine && theirs) {
    local.save(id, theirs.project, theirs.project.meta.updatedAt)
    marks.set(id, { localHash: contentHash(theirs.project), remote: theirs.updatedAt })
    return { id, kind: 'downloaded' }
  }

  // Only local: push it. Note this is also what happens after someone deletes
  // the project on another machine — it comes back rather than vanishing here.
  // Resurrection is the safe failure; silent deletion is not.
  if (mine && !theirs) {
    const saved = await remote.save(id, mine)
    marks.set(id, { localHash: contentHash(mine), remote: saved.updatedAt })
    return { id, kind: 'uploaded' }
  }

  // Both sides exist from here.
  const localChanged = !mark || contentHash(mine!) !== mark.localHash
  const remoteChanged = !mark || theirs!.updatedAt !== mark.remote

  if (localChanged && remoteChanged) {
    return { id, kind: 'conflict', local: mine!, remote: theirs! }
  }
  if (localChanged) {
    const saved = await remote.save(id, mine!, theirs!.updatedAt)
    marks.set(id, { localHash: contentHash(mine!), remote: saved.updatedAt })
    return { id, kind: 'uploaded' }
  }
  if (remoteChanged) {
    local.save(id, theirs!.project, theirs!.project.meta.updatedAt)
    marks.set(id, { localHash: contentHash(theirs!.project), remote: theirs!.updatedAt })
    return { id, kind: 'downloaded' }
  }
  return { id, kind: 'unchanged' }
}

/** The conflicts in a report — the only outcome the UI must act on. */
export const conflictsIn = (r: SyncReport): Extract<SyncOutcome, { kind: 'conflict' }>[] =>
  r.outcomes.filter((o): o is Extract<SyncOutcome, { kind: 'conflict' }> => o.kind === 'conflict')
