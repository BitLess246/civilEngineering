// ─────────────────────────────────────────────────────────────────────────
// Projects, from a component's point of view.
//
// EVERYTHING REMOTE IS MANUAL, DELIBERATELY — the same rule the soils sync
// follows. Nothing uploads on a timer or on every keystroke. A structural
// model is expensive to rebuild and a two-sided edit is a real scenario, so
// the moment work moves between machines is a moment the engineer chose.
//
// LOCAL SAVING IS NOT. `save()` writes to localStorage immediately, because
// the bug this module replaces is that Model Space's autosave died with the
// tab. Losing a day's modelling to a closed window is not a trade-off worth
// keeping for tidiness.
//
// The sync marks live in localStorage beside the projects. They are a CACHE,
// not a source of truth: losing them makes the next sync treat everything as
// changed on both sides, which surfaces conflicts rather than destroying
// anything.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useState } from 'react'
import { getClient, isAuthConfigured } from './auth/authClient'
import { useAuth } from './auth/authContext'
import { usePlan } from './auth/usePlan'
import { createStore, defaultBackend, canSaveNew, type SaveVerdict } from '../engine/projects/store'
import { emptyProject, type Project, type ProjectSummary } from '../engine/projects/model'
import { supabaseRemote } from '../engine/projects/supabaseRemote'
import {
  syncProjects, contentHash, conflictsIn,
  type SyncReport, type SyncMark, type SyncMarks,
} from '../engine/projects/remoteStore'

const MARKS_KEY = 'projects:sync-marks'

/** Marks persisted in localStorage. A corrupt blob is discarded, not thrown. */
function storedMarks(): SyncMarks {
  const read = (): Record<string, SyncMark> => {
    try {
      const raw = localStorage.getItem(MARKS_KEY)
      const v = raw ? JSON.parse(raw) : {}
      return v && typeof v === 'object' ? (v as Record<string, SyncMark>) : {}
    } catch { return {} }
  }
  const write = (all: Record<string, SyncMark>) => {
    try { localStorage.setItem(MARKS_KEY, JSON.stringify(all)) } catch { /* quota — next sync re-detects */ }
  }
  return {
    get: (id) => read()[id],
    set: (id, mark) => { const all = read(); all[id] = mark; write(all) },
    forget: (id) => { const all = read(); delete all[id]; write(all) },
  }
}

/** A short, sortable, collision-resistant id. Not a UUID — it is a key in one
 *  account's namespace, and a readable prefix helps when reading the table. */
const newId = (): string =>
  'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)

export interface ProjectsApi {
  /** Local listing, newest first. */
  list: ProjectSummary[]
  /** Whether cloud sync is even possible right now. */
  cloud: 'ready' | 'signed-out' | 'not-configured'
  busy: boolean
  error: string | null
  report: SyncReport | null
  /** Whether a NEW project may be saved under the current plan. */
  canCreate: SaveVerdict
  create(name: string, seed?: Partial<Project>): string | null
  load(id: string): Project | null
  save(id: string, project: Project): void
  rename(id: string, name: string): void
  remove(id: string): void
  sync(): Promise<void>
  /** Resolve one conflict by keeping one side whole. */
  resolve(id: string, keep: 'local' | 'remote'): Promise<void>
}

export function useProjects(): ProjectsApi {
  const { user } = useAuth()
  const plan = usePlan()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<SyncReport | null>(null)
  // Bumped after every mutation so the listing re-reads. The store is
  // synchronous, so a version counter is honest about where the truth lives —
  // mirroring the list into React state would give two answers to one question.
  const [rev, setRev] = useState(0)

  const local = useMemo(() => createStore(defaultBackend()), [])
  const marks = useMemo(() => storedMarks(), [])

  const list = useMemo(() => {
    void rev
    return local.list()
  }, [local, rev])

  const cloud: ProjectsApi['cloud'] = !isAuthConfigured()
    ? 'not-configured' : user ? 'ready' : 'signed-out'

  const remote = useMemo(() => {
    const client = getClient()
    if (!client || !user) return null
    return supabaseRemote(client, user.id)
  }, [user])

  const canCreate = canSaveNew(plan, list.length)

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true); setError(null)
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false); setRev((n) => n + 1) }
  }, [])

  const create = useCallback((name: string, seed?: Partial<Project>): string | null => {
    // The plan check is read from the CURRENT listing rather than the stale
    // `canCreate` above, so two quick clicks cannot both pass.
    if (!canSaveNew(plan, local.list().length).ok) return null
    const id = newId()
    local.save(id, { ...emptyProject(name), ...seed, meta: { ...emptyProject(name).meta, ...seed?.meta } })
    setRev((n) => n + 1)
    return id
  }, [local, plan])

  const load = useCallback((id: string) => local.load(id), [local])

  const save = useCallback((id: string, project: Project) => {
    local.save(id, project)
    setRev((n) => n + 1)
  }, [local])

  const rename = useCallback((id: string, name: string) => {
    const p = local.load(id)
    if (!p) return
    local.save(id, { ...p, meta: { ...p.meta, name } })
    setRev((n) => n + 1)
  }, [local])

  const remove = useCallback((id: string) => {
    local.remove(id)
    // Forget the watermark too. Leaving it would make the next sync read
    // "local is gone but unchanged" and quietly pull the project back.
    marks.forget(id)
    setRev((n) => n + 1)
  }, [local, marks])

  const sync = useCallback(async () => {
    if (!remote) return
    await run(async () => { setReport(await syncProjects(local, remote, marks)) })
  }, [remote, local, marks, run])

  /**
   * Resolve a conflict by KEEPING ONE SIDE WHOLE.
   *
   * There is no merge. Two versions of a structural model are not mergeable
   * field-by-field without an engineer deciding which member size is right,
   * and a machine guessing at that is worse than asking.
   */
  const resolve = useCallback(async (id: string, keep: 'local' | 'remote') => {
    if (!remote) return
    await run(async () => {
      const current = await remote.load(id)
      if (!current) return
      if (keep === 'remote') {
        local.save(id, current.project, current.project.meta.updatedAt)
        // Mark BOTH sides as seen, or the next sync treats the copy it just
        // took as a local edit and pushes it straight back.
        marks.set(id, { localHash: contentHash(current.project), remote: current.updatedAt })
      } else {
        const mine = local.load(id)
        if (!mine) return
        const saved = await remote.save(id, mine, current.updatedAt)
        marks.set(id, { localHash: contentHash(mine), remote: saved.updatedAt })
      }
      // Re-run so the panel reflects the new state rather than a stale report.
      setReport(await syncProjects(local, remote, marks))
    })
  }, [remote, local, marks, run])

  return { list, cloud, busy, error, report, canCreate, create, load, save, rename, remove, sync, resolve }
}

/** Conflicts in the latest report, for the panel. Re-exported so the component
 *  imports one module rather than reaching into the engine. */
export { conflictsIn }
