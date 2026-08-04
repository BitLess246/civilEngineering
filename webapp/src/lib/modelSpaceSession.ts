// ─────────────────────────────────────────────────────────────────────────
// The Model Space session snapshot — the two sessionStorage keys the page
// writes on every change and reads once at mount.
//
// Pulled out of the page so the Projects panel can save and restore a project
// WITHOUT a second copy of the design-input list. Model Space keeps roughly
// sixty design fields in individual `useState` hooks; restoring a project by
// calling sixty setters would duplicate that list a third time and silently
// miss whichever field was added last. Writing these two keys and letting the
// page's own restore path run means a field added to the autosave is restored
// for free.
//
// That is also why opening a project RELOADS the page. The alternative is the
// sixty setters. A reload is legible — the engineer just asked to swap the
// whole document — and it cannot drift.
// ─────────────────────────────────────────────────────────────────────────

import type { StructuralModel } from '../engine/model'

export const AUTOSAVE_KEY = 'model-space-autosave'
export const INPUTS_KEY = 'model-space-inputs'

/** Which saved project the open session belongs to, if any. Survives the
 *  reload that opening performs, which is the only reason it is stored. */
export const OPEN_ID_KEY = 'projects:open-id'

export interface SessionSnapshot {
  model: StructuralModel | null
  inputs: Record<string, unknown>
}

const store = (): Storage | undefined =>
  typeof globalThis !== 'undefined' ? (globalThis as { sessionStorage?: Storage }).sessionStorage : undefined

/** What Model Space currently has open. Missing or corrupt reads as empty. */
export function readSession(): SessionSnapshot {
  const s = store()
  let model: StructuralModel | null = null
  let inputs: Record<string, unknown> = {}
  try {
    const raw = s?.getItem(AUTOSAVE_KEY)
    if (raw) model = JSON.parse(raw) as StructuralModel
  } catch { /* a corrupt autosave is a fresh page, not a crash */ }
  try {
    const raw = s?.getItem(INPUTS_KEY)
    const v = raw ? JSON.parse(raw) : null
    if (v && typeof v === 'object' && !Array.isArray(v)) inputs = v as Record<string, unknown>
  } catch { /* as above */ }
  return { model, inputs }
}

/** Load a snapshot into the session the page reads at mount. */
export function writeSession(snap: SessionSnapshot): void {
  const s = store()
  try {
    if (snap.model) s?.setItem(AUTOSAVE_KEY, JSON.stringify(snap.model))
    else s?.removeItem(AUTOSAVE_KEY)
    s?.setItem(INPUTS_KEY, JSON.stringify(snap.inputs))
  } catch { /* quota — the caller reloads either way and gets what fitted */ }
}

export function readOpenId(): string | null {
  try { return store()?.getItem(OPEN_ID_KEY) ?? null } catch { return null }
}

export function writeOpenId(id: string | null): void {
  try {
    if (id) store()?.setItem(OPEN_ID_KEY, id)
    else store()?.removeItem(OPEN_ID_KEY)
  } catch { /* ignore */ }
}
