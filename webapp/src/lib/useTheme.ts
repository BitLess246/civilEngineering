// The chosen theme, shared live across the app.
//
// Mirrors `useToolPrefs` deliberately — same store shape, same cross-tab
// `storage` listener — because a second pattern for "one value everyone reads"
// is how two of them drift. See that file for why `useSyncExternalStore` over
// a context provider, and why the snapshot must be cached.

import { useSyncExternalStore } from 'react'
import { loadTheme, saveTheme, applyTheme, DEFAULT_THEME, THEME_KEY, type ThemeId } from './theme'

let cache: ThemeId | null = null
const listeners = new Set<() => void>()

function snapshot(): ThemeId {
  if (cache === null) cache = loadTheme()
  return cache
}
function emit() { for (const l of listeners) l() }
function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
/** Server/prerender snapshot. Nothing is stored there, so it is the default. */
const serverSnapshot = (): ThemeId => DEFAULT_THEME

export function useTheme(): ThemeId {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}

/** Write, paint, then wake every reader. */
export function setTheme(id: ThemeId): void {
  saveTheme(id)
  applyTheme(id)
  cache = id
  emit()
}

/** Re-read from storage and notify. Exported for tests. */
export function refreshTheme(): void {
  cache = loadTheme()
  applyTheme(cache)
  emit()
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    // Two windows of the same app disagreeing about the theme is the bug this
    // prevents; `key === null` is a whole-storage clear.
    if (e.key === null || e.key === THEME_KEY) refreshTheme()
  })
}
