// ─────────────────────────────────────────────────────────────────────────
// Local project storage. Layer 1.
//
// The same `StorageBackend` seam the soils module uses, and for the same
// reason: the app gets localStorage, tests get a Map, and neither knows about
// the other. LOCALSTORAGE, NOT sessionStorage — the bug this replaces is that
// Model Space's autosave died with the tab.
//
// One key per project under `projects:<id>`, wrapped with a schema version so
// a future format change migrates on read instead of corrupting old saves.
//
// PLAN LIMITS ARE NOT ENFORCED HERE. `canSaveNew` reports whether a save would
// exceed the plan, and the caller decides what to say about it; the store
// itself never refuses. Two reasons: a plan that lapses must not make existing
// projects unreadable, and the real enforcement point is the database policy
// in the migration, not a check the browser could be talked out of.
// ─────────────────────────────────────────────────────────────────────────

import { isProject, cleanName, summaryOf, PROJECT_SCHEMA_VERSION, type Project, type ProjectSummary } from './model'
import { withinProjectLimit, planOf, type Plan, type PlanId } from '../../lib/plans'

const KEY_PREFIX = 'projects:'

/** Minimal storage contract (a subset of the Web Storage API). */
export interface StorageBackend {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  keys(): string[]
}

/** In-memory backend for tests / non-browser environments. */
export function memoryBackend(seed?: Record<string, string>): StorageBackend {
  const map = new Map<string, string>(seed ? Object.entries(seed) : [])
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    keys: () => [...map.keys()],
  }
}

/** Browser localStorage backend, or an in-memory fallback when unavailable. */
export function defaultBackend(): StorageBackend {
  const ls = typeof globalThis !== 'undefined' ? (globalThis as { localStorage?: Storage }).localStorage : undefined
  if (!ls) return memoryBackend()
  return {
    getItem: (k) => ls.getItem(k),
    setItem: (k, v) => ls.setItem(k, v),
    removeItem: (k) => ls.removeItem(k),
    keys: () => Array.from({ length: ls.length }, (_, i) => ls.key(i)).filter((k): k is string => k !== null),
  }
}

export interface StoredProject {
  version: number
  project: Project
}

/** Why a save was refused, or that it may go ahead. */
export type SaveVerdict =
  | { ok: true }
  | { ok: false; reason: 'plan-limit'; limit: number; saved: number; message: string }

export interface ProjectStore {
  /** Newest first — the order a picker wants. */
  list(): ProjectSummary[]
  load(id: string): Project | null
  /** Writes, stamping `updatedAt`. Never refuses on plan grounds — see the header. */
  save(id: string, project: Project, now?: string): Project
  remove(id: string): void
  exists(id: string): boolean
  count(): number
}

/**
 * A quota is only worth reporting when it would actually bite.
 *
 * `existingId` matters: re-saving a project you already have must never be
 * blocked, or a Free account at its limit could open a project and then not be
 * allowed to keep the edit — the worst possible moment to meet a paywall.
 */
export function canSaveNew(
  plan: PlanId | Plan, saved: number, existingId?: string,
): SaveVerdict {
  if (existingId) return { ok: true }
  const p = typeof plan === 'string' ? planOf(plan) : plan
  if (withinProjectLimit(p, saved)) return { ok: true }
  const limit = p.maxProjects ?? 0
  return {
    ok: false, reason: 'plan-limit', limit, saved,
    message: limit === 0
      ? `The ${p.name} plan cannot save projects. Create a free account to keep up to 3.`
      : `The ${p.name} plan keeps ${limit} saved project${limit === 1 ? '' : 's'}; you have ${saved}. Delete one, or move to a plan without a limit.`,
  }
}

export function createStore(backend: StorageBackend = defaultBackend()): ProjectStore {
  const keyOf = (id: string) => KEY_PREFIX + id
  const idOf = (key: string) => key.slice(KEY_PREFIX.length)

  const readStored = (key: string): StoredProject | null => {
    const raw = backend.getItem(key)
    if (raw == null) return null
    try {
      const parsed = JSON.parse(raw) as StoredProject
      // One corrupt entry must not take the whole listing down, so the shape is
      // checked here rather than trusted from the key prefix alone.
      if (!parsed || typeof parsed !== 'object' || !isProject(parsed.project)) return null
      return migrate(parsed)
    } catch {
      return null
    }
  }

  return {
    list() {
      const out: ProjectSummary[] = []
      for (const key of backend.keys()) {
        if (!key.startsWith(KEY_PREFIX)) continue
        const stored = readStored(key)
        if (!stored) continue
        out.push(summaryOf(idOf(key), stored.project))
      }
      return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },

    load(id) {
      return readStored(keyOf(id))?.project ?? null
    },

    save(id, project, now = new Date().toISOString()) {
      const stamped: Project = {
        ...project,
        meta: { ...project.meta, name: cleanName(project.meta.name), updatedAt: now },
      }
      backend.setItem(keyOf(id), JSON.stringify({ version: PROJECT_SCHEMA_VERSION, project: stamped }))
      return stamped
    },

    remove(id) {
      backend.removeItem(keyOf(id))
    },

    exists(id) {
      return readStored(keyOf(id)) !== null
    },

    count() {
      let n = 0
      for (const key of backend.keys()) {
        if (key.startsWith(KEY_PREFIX) && readStored(key)) n++
      }
      return n
    },
  }
}

/**
 * Bring an older record up to the current shape.
 *
 * A no-op at version 1 — it exists so the first real format change has an
 * obvious place to go, rather than being bolted onto the read path under
 * pressure. A record from a NEWER client is returned untouched and will fail
 * `isProject` if the shape moved, which is the safe direction: refusing to
 * open beats silently dropping fields this build does not know about.
 */
function migrate(stored: StoredProject): StoredProject {
  return stored
}
