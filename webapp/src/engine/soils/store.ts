// ─────────────────────────────────────────────────────────────────────────
// Soil-investigation persistence. Layer 1.
//
// A key-value store over a swappable `StorageBackend`: browser localStorage in
// the app, an in-memory backend in tests. Investigations are stored one key
// each under `soils:investigation:<id>`, wrapped with a schema version so a
// future format change migrates on read instead of corrupting old saves.
//
// WHY LOCALSTORAGE AND NOT POSTGRES, for now. The module's shape is going to
// move as the laboratory engines land, and designing thirty tables plus
// row-level-security policies against a schema that is still moving means
// writing migrations for guesses. The `StorageBackend` seam is the whole point:
// when the shape settles, a Supabase-backed backend drops in behind this same
// interface and nothing above it changes. The scheduling module has been
// running on exactly this arrangement.
//
// The cost of that choice is real and worth stating: laboratory data is
// expensive to re-enter, and until the backend swap lands an investigation
// lives in one browser on one machine. `exportJSON` is therefore not a
// convenience — it is the backup mechanism, and the UI should treat it that way.
// ─────────────────────────────────────────────────────────────────────────

import type { Investigation } from './model'
import { validateInvestigation } from './validate'

/** Current on-disk schema version. Bump + add a migration when the shape changes. */
export const SOILS_SCHEMA_VERSION = 1

const KEY_PREFIX = 'soils:investigation:'

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

export interface StoredInvestigation {
  version: number
  savedAt: string
  investigation: Investigation
}

/** Listing entry — enough for a picker without parsing every full record. */
export interface InvestigationSummary {
  id: string
  investigationNo: string
  title: string
  projectName: string
  status: Investigation['meta']['status']
  savedAt: string
  boreholeCount: number
  sampleCount: number
}

export interface SoilsStore {
  list(): InvestigationSummary[]
  load(id: string): Investigation | null
  save(id: string, investigation: Investigation, savedAt?: string): StoredInvestigation
  remove(id: string): void
  exists(id: string): boolean
}

export function createStore(backend: StorageBackend = defaultBackend()): SoilsStore {
  const keyOf = (id: string) => KEY_PREFIX + id
  const idOf = (key: string) => key.slice(KEY_PREFIX.length)

  const readStored = (key: string): StoredInvestigation | null => {
    const raw = backend.getItem(key)
    if (raw == null) return null
    try {
      const parsed = JSON.parse(raw) as StoredInvestigation
      // A corrupt entry must not take the listing down with it, so the shape is
      // checked here rather than trusted from the key prefix alone.
      if (!parsed || typeof parsed !== 'object' || !isInvestigation(parsed.investigation)) return null
      return migrate(parsed)
    } catch {
      return null
    }
  }

  return {
    list() {
      const out: InvestigationSummary[] = []
      for (const key of backend.keys()) {
        if (!key.startsWith(KEY_PREFIX)) continue
        const stored = readStored(key)
        if (!stored) continue
        const inv = stored.investigation
        out.push({
          id: idOf(key),
          investigationNo: inv.meta.investigationNo,
          title: inv.meta.title,
          projectName: inv.meta.site.projectName,
          status: inv.meta.status,
          savedAt: stored.savedAt,
          boreholeCount: inv.boreholes.length,
          sampleCount: inv.boreholes.reduce((n, b) => n + b.samples.length, 0),
        })
      }
      return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    },
    load(id) {
      return readStored(keyOf(id))?.investigation ?? null
    },
    save(id, investigation, savedAt = new Date().toISOString()) {
      const stored: StoredInvestigation = { version: SOILS_SCHEMA_VERSION, savedAt, investigation }
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
function migrate(stored: StoredInvestigation): StoredInvestigation {
  // Future: while (stored.version < SOILS_SCHEMA_VERSION) { …; stored.version++ }
  return stored
}

// ── JSON import / export ─────────────────────────────────────────────────

/** Serialise an investigation to a versioned JSON string for download. */
export function exportJSON(investigation: Investigation, savedAt = new Date().toISOString()): string {
  const stored: StoredInvestigation = { version: SOILS_SCHEMA_VERSION, savedAt, investigation }
  return JSON.stringify(stored, null, 2)
}

/**
 * Parse an investigation from an exported JSON string. Accepts either the
 * versioned wrapper or a bare `Investigation`. Throws on malformed JSON, an
 * unrecognised shape, or any error-level integrity failure — an import that
 * half-succeeded would be worse than one that refused.
 */
export function importJSON(json: string): Investigation {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Import failed: not valid JSON.')
  }

  const investigation = extract(parsed)
  if (!investigation) throw new Error('Import failed: unrecognised soil-investigation format.')

  const errors = validateInvestigation(investigation).filter((i) => i.severity === 'error')
  if (errors.length) {
    throw new Error(
      `Import failed: ${errors.length} integrity error(s): ${errors.map((e) => e.message).join(' ')}`,
    )
  }
  return investigation
}

function isInvestigation(v: unknown): v is Investigation {
  if (typeof v !== 'object' || v === null) return false
  const p = v as Partial<Investigation>
  return (
    p.meta != null && typeof p.meta === 'object' &&
    typeof (p.meta as Investigation['meta']).title === 'string' &&
    Array.isArray(p.boreholes) &&
    Array.isArray(p.parameters)
  )
}

/** Pull an `Investigation` out of either a wrapper or a bare object. */
function extract(parsed: unknown): Investigation | null {
  if (typeof parsed !== 'object' || parsed === null) return null
  const obj = parsed as Record<string, unknown>
  const candidate = 'investigation' in obj ? obj.investigation : obj
  return isInvestigation(candidate) ? candidate : null
}
