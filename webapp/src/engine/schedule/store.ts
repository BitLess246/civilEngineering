// ─────────────────────────────────────────────────────────────────────────
// Schedule-project persistence.
//
// A tiny key-value store over a swappable `StorageBackend` (browser
// localStorage in the app; an in-memory backend in tests / SSR), plus
// versioned JSON import/export. Projects are stored one key each under
// `schedule:project:<id>`, wrapped with a schema version so future format
// changes migrate on read rather than corrupting old saves.
// ─────────────────────────────────────────────────────────────────────────

import type { ScheduleProject } from './model'
import { validateProject } from './validate'

/** Current on-disk schema version. Bump + add a migration when the shape changes. */
export const SCHEDULE_SCHEMA_VERSION = 1

const KEY_PREFIX = 'schedule:project:'

/** Minimal storage contract (a subset of the Web Storage API). */
export interface StorageBackend {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  /** All keys currently held. */
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

/** Persisted wrapper: the project plus metadata. */
export interface StoredProject {
  version: number
  savedAt: string
  project: ScheduleProject
}

/** Lightweight listing entry (avoids parsing every full project). */
export interface ProjectSummary {
  id: string
  name: string
  savedAt: string
  activityCount: number
}

export interface ScheduleStore {
  list(): ProjectSummary[]
  load(id: string): ScheduleProject | null
  save(id: string, project: ScheduleProject, savedAt?: string): StoredProject
  remove(id: string): void
  exists(id: string): boolean
}

/** Create a store over `backend` (defaults to localStorage / memory). */
export function createStore(backend: StorageBackend = defaultBackend()): ScheduleStore {
  const keyOf = (id: string) => KEY_PREFIX + id
  const idOf = (key: string) => key.slice(KEY_PREFIX.length)

  const readStored = (key: string): StoredProject | null => {
    const raw = backend.getItem(key)
    if (raw == null) return null
    try {
      return migrate(JSON.parse(raw) as StoredProject)
    } catch {
      return null   // corrupt entry — treated as absent
    }
  }

  return {
    list() {
      const out: ProjectSummary[] = []
      for (const key of backend.keys()) {
        if (!key.startsWith(KEY_PREFIX)) continue
        const stored = readStored(key)
        if (!stored) continue
        out.push({
          id: idOf(key),
          name: stored.project.meta.name,
          savedAt: stored.savedAt,
          activityCount: stored.project.activities.length,
        })
      }
      return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    },
    load(id) {
      return readStored(keyOf(id))?.project ?? null
    },
    save(id, project, savedAt = new Date().toISOString()) {
      const stored: StoredProject = { version: SCHEDULE_SCHEMA_VERSION, savedAt, project }
      backend.setItem(keyOf(id), JSON.stringify(stored))
      return stored
    },
    remove(id) {
      backend.removeItem(keyOf(id))
    },
    exists(id) {
      return backend.getItem(keyOf(id)) != null
    },
  }
}

/** Migrate a stored wrapper to the current schema version (no-op at v1). */
function migrate(stored: StoredProject): StoredProject {
  // Future: while (stored.version < SCHEDULE_SCHEMA_VERSION) { …; stored.version++ }
  return stored
}

// ── JSON import / export ─────────────────────────────────────────────────────

/** Serialise a project to a pretty, versioned JSON string for download. */
export function exportProjectJSON(project: ScheduleProject, savedAt = new Date().toISOString()): string {
  const stored: StoredProject = { version: SCHEDULE_SCHEMA_VERSION, savedAt, project }
  return JSON.stringify(stored, null, 2)
}

/**
 * Parse and validate a project from an exported JSON string. Accepts either the
 * versioned wrapper or a bare `ScheduleProject`. Throws on malformed JSON, an
 * unrecognised shape, or any structural (error-level) validation failure.
 */
export function importProjectJSON(json: string): ScheduleProject {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Import failed: not valid JSON.')
  }

  const project = extractProject(parsed)
  if (!project) throw new Error('Import failed: unrecognised schedule-project format.')

  const errors = validateProject(project).filter((i) => i.severity === 'error')
  if (errors.length) {
    throw new Error(`Import failed: ${errors.length} integrity error(s): ${errors.map((e) => e.message).join(' ')}`)
  }
  return project
}

/** Pull a `ScheduleProject` out of either a wrapper or a bare object. */
function extractProject(parsed: unknown): ScheduleProject | null {
  if (typeof parsed !== 'object' || parsed === null) return null
  const obj = parsed as Record<string, unknown>
  const candidate = 'project' in obj ? obj.project : obj
  if (typeof candidate !== 'object' || candidate === null) return null
  const p = candidate as Partial<ScheduleProject>
  const ok =
    p.meta != null &&
    Array.isArray(p.activities) &&
    Array.isArray(p.calendars) &&
    Array.isArray(p.wbs) &&
    Array.isArray(p.resources) &&
    Array.isArray(p.baselines) &&
    typeof p.defaultCalendarId === 'string'
  return ok ? (candidate as ScheduleProject) : null
}
