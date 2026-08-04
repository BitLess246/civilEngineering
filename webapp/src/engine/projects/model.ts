// ─────────────────────────────────────────────────────────────────────────
// SAVED PROJECTS — the document a paid account keeps. Layer 1.
//
// Until now Model Space kept its work in `sessionStorage` under
// `model-space-autosave`, which means it survived a reload and NOTHING ELSE.
// Close the tab and a day's modelling was gone; open it on another machine and
// there was nothing there. The `saved-projects` feature has been listed on
// every plan since `plans.ts` was written, with no store behind it.
//
// WHAT A PROJECT IS. The structural model plus the design inputs that produced
// it — soil, seismic, wind, prices, material choices. The model alone is not
// enough: reopening it with the inputs reset to defaults gives an engineer a
// structure whose design basis silently changed.
//
// WHY `inputs` IS AN OPAQUE BAG. Model Space keeps roughly sixty design fields
// in component state and already writes them out as one object. Restating that
// list as a typed interface here would be a second copy that drifts the first
// time a field is added, and the page already reads them defensively (each
// field falls back to its default). So the shape is checked, the contents are
// not — and the page, which owns the fields, stays the only place that knows
// them. Stated here so this reads as a decision rather than laziness.
// ─────────────────────────────────────────────────────────────────────────

import type { StructuralModel } from '../model'

/** On-disk schema version. Bump and add a migration when the shape changes. */
export const PROJECT_SCHEMA_VERSION = 1

/** Longest project name we will store — long enough for a real one, short
 *  enough that a listing stays readable and the column cannot be abused. */
export const NAME_MAX = 120

export interface ProjectMeta {
  /** What the engineer calls it. The only field they must supply. */
  name: string
  client: string
  location: string
  notes: string
  /** ISO timestamps, written by the store rather than the caller. */
  createdAt: string
  updatedAt: string
}

export interface Project {
  meta: ProjectMeta
  /**
   * The 3D model, or null.
   *
   * Null is a real state, not a placeholder: a project can be named and given
   * a client before a grid is generated, and refusing to save that would mean
   * the first thing an engineer does is the one thing they cannot keep.
   */
  model: StructuralModel | null
  /** Model Space's design inputs. Opaque here — see the header. */
  inputs: Record<string, unknown>
}

/** Listing entry — enough for a picker without parsing every full document. */
export interface ProjectSummary {
  id: string
  name: string
  client: string
  location: string
  updatedAt: string
  /** 0 when the project has no model yet. */
  nodeCount: number
  memberCount: number
}

const str = (v: unknown): v is string => typeof v === 'string'

/**
 * Structural check, used on every read from disk and from the network.
 *
 * Deliberately shallow on `model`: it asks whether the arrays are there, not
 * whether every member references a live node. Deep validation belongs to
 * `meshValidation`, which the solver runs anyway, and duplicating it here
 * would mean a project that fails a NEW rule becomes unopenable rather than
 * openable-and-flagged.
 */
export function isProject(v: unknown): v is Project {
  if (!v || typeof v !== 'object') return false
  const p = v as Partial<Project>
  const m = p.meta as Partial<ProjectMeta> | undefined
  if (!m || typeof m !== 'object') return false
  if (!str(m.name) || !str(m.client) || !str(m.location) || !str(m.notes)) return false
  if (!str(m.createdAt) || !str(m.updatedAt)) return false
  if (!p.inputs || typeof p.inputs !== 'object' || Array.isArray(p.inputs)) return false
  if (p.model === null || p.model === undefined) return true
  const mo = p.model as Partial<StructuralModel>
  return Array.isArray(mo.nodes) && Array.isArray(mo.members)
}

/** A project's display name, never blank — an untitled row is unclickable. */
export const displayName = (p: Project): string => p.meta.name.trim() || 'Untitled project'

/**
 * Trim and cap a name on the way in.
 *
 * Applied at the store boundary rather than in the form, so a name that
 * arrives from an import or from another client is capped too.
 */
export const cleanName = (raw: string): string => raw.trim().slice(0, NAME_MAX)

export const summaryOf = (id: string, p: Project): ProjectSummary => ({
  id,
  name: displayName(p),
  client: p.meta.client,
  location: p.meta.location,
  updatedAt: p.meta.updatedAt,
  nodeCount: p.model?.nodes.length ?? 0,
  memberCount: p.model?.members.length ?? 0,
})

/** A fresh, empty project. `now` is injectable so tests are not clock-bound. */
export function emptyProject(name: string, now: string = new Date().toISOString()): Project {
  return {
    meta: { name: cleanName(name), client: '', location: '', notes: '', createdAt: now, updatedAt: now },
    model: null,
    inputs: {},
  }
}
