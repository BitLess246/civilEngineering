/**
 * Drafting3D Session Management — mirrors ModelSpace session handling.
 */

import { useState, useEffect, useCallback } from 'react'
import type { DraftProject } from '../engine/drafting3d'
import { createDraftProject, deserializeProject, draftToStructuralModel, normalizeDraftSections, serializeProject } from '../engine/drafting3d'

const STORAGE_KEY = 'drafting3d.project'
const AUTOSAVE_KEY = 'drafting3d.autosave'
const AUTOSAVE_INTERVAL = 30_000  // 30 seconds

export function useDraftProject() {
  const [project, setProject] = useState<DraftProject>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      // repaired on load: slabs and walls saved under the old single active
      // section carry a 400×400 column section (see normalizeDraftSections)
      if (saved) return normalizeDraftSections(deserializeProject(saved))
    } catch {
      // corrupt or blocked storage must never break the tool — start fresh
    }
    return createDraftProject('My Building')
  })

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

  return { project, setProject, saveProject, exportToModelSpace }
}
