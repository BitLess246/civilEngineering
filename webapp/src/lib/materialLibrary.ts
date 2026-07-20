// ─────────────────────────────────────────────────────────────────────────
// User-defined timber material library — persistence + CSV interchange.
//
// A custom material is just a name + kind + WoodRefValues (the same struct the
// analysis/design engine already consumes), so a user can define proprietary
// glulam, engineered wood, or a locally tested species and it flows through the
// solver unchanged.  Stored in localStorage; import/export as CSV so libraries
// can be shared. The pure transforms (CSV ↔ materials, id, validation) are
// separated from the storage I/O so they're testable without a browser.
// ─────────────────────────────────────────────────────────────────────────
import { validateWoodRef, type WoodKind, type WoodRefValues } from '../engine/woodDesign'

export interface CustomMaterial {
  id: string
  name: string
  kind: WoodKind
  ref: WoodRefValues
  note?: string
}

const STORAGE_KEY = 'wood-custom-materials'
const FIELDS: (keyof WoodRefValues)[] = ['Fb', 'Ft', 'Fv', 'FcPerp', 'Fc', 'E', 'Emin', 'G']
export const CSV_HEADER = ['name', 'kind', ...FIELDS, 'note']

// ── Storage I/O (thin localStorage wrappers) ────────────────────────────────
export function loadCustomMaterials(): CustomMaterial[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(v) ? (v as CustomMaterial[]) : []
  } catch { return [] }
}
export function saveCustomMaterials(list: CustomMaterial[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)) } catch { /* quota — ignore */ }
}

// ── Pure helpers ────────────────────────────────────────────────────────────
/** A stable, collision-free id derived from the material name. */
export function slugId(name: string, existing: string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'material'
  let id = `custom-${base}`, i = 2
  while (existing.includes(id)) id = `custom-${base}-${i++}`
  return id
}

/** Insert or replace a material by id, returning a new list. */
export function upsertMaterial(list: CustomMaterial[], m: CustomMaterial): CustomMaterial[] {
  const i = list.findIndex((x) => x.id === m.id)
  if (i < 0) return [...list, m]
  const next = list.slice(); next[i] = m; return next
}
export function deleteMaterial(list: CustomMaterial[], id: string): CustomMaterial[] {
  return list.filter((x) => x.id !== id)
}

const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

/** Serialise materials to CSV (header + one row each). */
export function materialsToCsv(list: CustomMaterial[]): string {
  const rows = [CSV_HEADER.join(',')]
  for (const m of list) rows.push([esc(m.name), m.kind, ...FIELDS.map((f) => String(m.ref[f])), esc(m.note ?? '')].join(','))
  return rows.join('\n')
}

/** Split one CSV line into fields, honouring double-quoted values. */
function parseLine(line: string): string[] {
  const out: string[] = []
  let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

/** Parse a CSV back into materials, validating each row's engineering values.
 *  Returns the accepted materials and a list of per-row errors. */
export function csvToMaterials(text: string, existingIds: string[] = []): { materials: CustomMaterial[]; errors: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  const errors: string[] = []
  const materials: CustomMaterial[] = []
  if (lines.length === 0) return { materials, errors: ['empty file'] }
  const header = parseLine(lines[0]).map((h) => h.toLowerCase())
  const col = (name: string) => header.indexOf(name.toLowerCase())
  if (col('name') < 0 || FIELDS.some((f) => col(f) < 0)) {
    return { materials, errors: [`header must include: ${CSV_HEADER.join(', ')}`] }
  }
  const ids = [...existingIds]
  for (let r = 1; r < lines.length; r++) {
    const cells = parseLine(lines[r])
    const name = cells[col('name')] || `Material ${r}`
    const kind: WoodKind = cells[col('kind')] === 'glulam' ? 'glulam' : 'sawn'
    const ref = Object.fromEntries(FIELDS.map((f) => [f, Number(cells[col(f)])])) as unknown as WoodRefValues
    const errs = validateWoodRef(ref)
    if (errs.length) { errors.push(`row ${r} (${name}): ${errs.join('; ')}`); continue }
    const id = slugId(name, ids); ids.push(id)
    const noteIdx = col('note')
    materials.push({ id, name, kind, ref, note: noteIdx >= 0 ? cells[noteIdx] || undefined : undefined })
  }
  return { materials, errors }
}
