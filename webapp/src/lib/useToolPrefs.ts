// The tool preference, shared live across the app.
//
// Three places read it — the sidebar, the home directory, the ⌘K palette — and
// two write it: the first-run dialog and the profile page. Reading
// localStorage in each of them would leave the sidebar showing the old catalog
// until a reload, which makes the profile's Save button look broken.
//
// `useSyncExternalStore` over a module-level cache rather than a context
// provider: there is exactly one value, it is not per-subtree, and a provider
// would mean threading one more wrapper through main.tsx for no gain.
//
// The snapshot is CACHED because `getSnapshot` must return a stable reference
// between calls — parsing localStorage on every call returns a fresh object
// each time, and React treats that as a perpetual change and re-renders
// forever.

import { useSyncExternalStore } from 'react'
import { loadPrefs, savePrefs, type ToolPrefs } from './toolPrefs'

let cache: ToolPrefs | null = null
let loaded = false
const listeners = new Set<() => void>()

function snapshot(): ToolPrefs | null {
  if (!loaded) { cache = loadPrefs(); loaded = true }
  return cache
}

function emit() { for (const l of listeners) l() }

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

/** Server/prerender snapshot. Nothing is stored there, so nothing is hidden. */
const serverSnapshot = (): ToolPrefs | null => null

/** The current preference, or `null` when the question has never been answered. */
export function useToolPrefs(): ToolPrefs | null {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}

/** Write, then wake every reader. */
export function setToolPrefs(p: ToolPrefs): void {
  savePrefs(p)
  cache = p
  loaded = true
  emit()
}

/**
 * Re-read from storage and notify.
 *
 * Wired to the `storage` event so a change made in another tab lands here
 * instead of leaving two windows of the same app disagreeing about which tools
 * exist. Exported for tests, which need to clear the module cache between
 * cases.
 */
export function refreshToolPrefs(): void {
  cache = loadPrefs()
  loaded = true
  emit()
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    // Only our key; every other write in the app fires this too.
    if (e.key === null || e.key === 'civeng-tool-prefs') refreshToolPrefs()
  })
}
