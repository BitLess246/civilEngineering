import { useEffect } from 'react'

/**
 * Global Ctrl/⌘+K listener for the shell that mounts the command palette.
 *
 * Lives here rather than in `CommandPalette.tsx` so that module exports only
 * the component — a file mixing components with other exports breaks React
 * Fast Refresh.
 *
 * `enabled` gates the listener without unmounting it (hooks cannot be called
 * conditionally). The embed preview of Model Space passes false: a poster of
 * the workbench should not answer a hotkey aimed at the page it sits on.
 */
export function usePaletteHotkey(setOpen: (v: boolean | ((o: boolean) => boolean)) => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen, enabled])
}
