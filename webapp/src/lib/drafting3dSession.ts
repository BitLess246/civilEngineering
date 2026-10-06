/**
 * Drafting3D Session Management — mirrors ModelSpace session handling, plus
 * undo/redo: every committed edit is an immutable project snapshot, so the
 * history (lib/undoHistory) is the session's state and `project` its present.
 */

import { useState, useEffect, useCallback } from 'react'
import type { DraftProject } from '../engine/drafting3d'
import { createDraftProject, deserializeProject, draftToStructuralModel, normalizeDraftSections, serializeProject } from '../engine/drafting3d'
import { initHistory, pushHistory, redoHistory, undoHistory, type History } from './undoHistory'

const STORAGE_KEY = 'drafting3d.project'
const AUTOSAVE_KEY = 'drafting3d.autosave'
const AUTOSAVE_INTERVAL = 30_000  // 30 seconds

function loadProject(): DraftProject {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    // repaired on load: slabs and walls saved under the old single active
    // section carry a 400×400 column section (see normalizeDraftSections)
    if (saved) return normalizeDraftSections(deserializeProject(saved))
  } catch {
    // corrupt or blocked storage must never break the tool — start fresh
  }
  return createDraftProject('My Building')
}

export function useDraftProject() {
  const [hist, setHist] = useState<History<DraftProject>>(() => initHistory(loadProject()))
  const project = hist.present

  /** Commit an edit — undoable. */
  const setProject = useCallback((p: DraftProject) => setHist(h => pushHistory(h, p)), [])
  /** Change view state that is not an edit (the active level) — not recorded,
   *  so Undo never just flips the storey you are looking at. */
  const replaceProject = useCallback((p: DraftProject) => setHist(h => ({ ...h, present: p })), [])
  const undo = useCallback(() => setHist(undoHistory), [])
  const redo = useCallback(() => setHist(redoHistory), [])

  // Autosave
  useEffect(() => {
    const id = setInterval(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, serializeProject(project))
      } catch {
        // a blocked localStorage silently skips this autosave tick
      }
    }, AUTOSAVE_INTERVAL)
    return () => clearInterval(id)
  }, [project])

  // Persist on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serializeProject(project))
    } catch {
      // a blocked localStorage silently skips this persist
    }
  }, [project])

  const saveProject = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serializeProject(project))
      localStorage.setItem(AUTOSAVE_KEY, serializeProject(project))
    } catch {
      // explicit save into a blocked localStorage is a no-op
    }
  }, [project])

  const exportToModelSpace = useCallback((p: DraftProject) => draftToStructuralModel(p), [])

  return {
    project, setProject, replaceProject, saveProject, exportToModelSpace,
    undo, redo, canUndo: hist.past.length > 0, canRedo: hist.future.length > 0,
  }
}
