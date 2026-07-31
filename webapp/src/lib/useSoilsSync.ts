// ─────────────────────────────────────────────────────────────────────────
// Sync state for the soil-investigation store.
//
// EVERYTHING HERE IS MANUAL, DELIBERATELY. Nothing syncs on a timer, on mount,
// or on save. Laboratory data is expensive to re-enter and a two-sided edit is
// a real scenario, so the moment data moves between machines is a moment the
// engineer chose — not one that happened while they were typing.
//
// The sync marks live in localStorage beside the investigations. They are a
// CACHE, not a source of truth: losing them makes the next sync treat
// everything as changed on both sides, which surfaces conflicts rather than
// destroying anything.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useState } from 'react'
import { getClient, isAuthConfigured } from './auth/authClient'
import { useAuth } from './auth/authContext'
import { createStore, defaultBackend } from '../engine/soils/store'
import { supabaseRemote } from '../engine/soils/supabaseRemote'
import {
  syncInvestigations, contentHash, type SyncReport, type SyncMark, type SyncMarks,
} from '../engine/soils/remoteStore'
import { runRemoteDiagnostics, type DiagnosticsReport } from '../engine/soils/remoteDiagnostics'

const MARKS_KEY = 'soils:sync-marks'

/** Marks persisted in localStorage. A corrupt blob is discarded, not thrown. */
function storedMarks(): SyncMarks {
  const read = (): Record<string, SyncMark> => {
    try {
      const raw = localStorage.getItem(MARKS_KEY)
      const v = raw ? JSON.parse(raw) : {}
      return v && typeof v === 'object' ? (v as Record<string, SyncMark>) : {}
    } catch { return {} }
  }
  return {
    get: (id) => read()[id],
    set: (id, mark) => {
      const all = read()
      all[id] = mark
      try { localStorage.setItem(MARKS_KEY, JSON.stringify(all)) } catch { /* quota — next sync re-detects */ }
    },
  }
}

export type SyncAvailability =
  | { kind: 'ready'; userId: string }
  | { kind: 'not-configured' }
  | { kind: 'signed-out' }

export interface SoilsSync {
  availability: SyncAvailability
  busy: boolean
  report: SyncReport | null
  diagnostics: DiagnosticsReport | null
  error: string | null
  sync(): Promise<void>
  check(): Promise<void>
  /** Resolve one conflict by choosing a side. */
  resolve(id: string, keep: 'local' | 'remote'): Promise<void>
}

export function useSoilsSync(): SoilsSync {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<SyncReport | null>(null)
  const [diagnostics, setDiagnostics] = useState<DiagnosticsReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  const local = useMemo(() => createStore(defaultBackend()), [])
  const marks = useMemo(() => storedMarks(), [])

  const availability: SyncAvailability = !isAuthConfigured()
    ? { kind: 'not-configured' }
    : user
      ? { kind: 'ready', userId: user.id }
      : { kind: 'signed-out' }

  const remote = useMemo(() => {
    const client = getClient()
    if (!client || !user) return null
    return supabaseRemote(client, user.id)
  }, [user])

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [])

  const sync = useCallback(async () => {
    if (!remote) return
    await run(async () => {
      setReport(await syncInvestigations(local, remote, marks))
    })
  }, [remote, local, marks, run])

  const check = useCallback(async () => {
    const client = getClient()
    if (!client) return
    await run(async () => {
      setDiagnostics(await runRemoteDiagnostics(client, user?.id ?? null))
    })
  }, [user, run])

  /**
   * Resolve a conflict by KEEPING ONE SIDE WHOLE. There is no merge: two
   * versions of a borehole log are not mergeable field-by-field without an
   * engineer deciding which reading is right, and a machine guessing at that
   * is worse than asking.
   */
  const resolve = useCallback(async (id: string, keep: 'local' | 'remote') => {
    if (!remote) return
    await run(async () => {
      const current = await remote.load(id)
      if (!current) return
      if (keep === 'remote') {
        local.save(id, current.investigation)
        // Mark BOTH sides as seen, or the next sync would treat the copy it
        // just took as a local edit and push it straight back.
        marks.set(id, { localHash: contentHash(current.investigation), remote: current.updatedAt })
      } else {
        const mine = local.load(id)
        if (!mine) return
        const saved = await remote.save(id, mine, current.updatedAt)
        marks.set(id, { localHash: contentHash(mine), remote: saved.updatedAt })
      }
      // Re-run so the panel reflects the new state rather than a stale report.
      setReport(await syncInvestigations(local, remote, marks))
    })
  }, [remote, local, marks, run])

  return { availability, busy, report, diagnostics, error, sync, check, resolve }
}
