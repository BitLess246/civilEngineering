/**
 * Drafting3D Session Management — mirrors ModelSpace session handling.
 */

import { useState, useEffect, useCallback } from 'react'
import type { DraftProject } from '../engine/drafting3d'
import { createDraftProject, deserializeProject } from '../engine/drafting3d'

const STORAGE_KEY = 'drafting3d.project'
const AUTOSAVE_KEY = 'drafting3d.autosave'
const AUTOSAVE_INTERVAL = 30_000  // 30 seconds

export function useDraftProject() {
  const [project, setProject] = useState<DraftProject>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) return deserializeProject(saved)
    } catch { }
    return createDraftProject('My Building')
  })

  // Autosave
  useEffect(() => {
    const id = setInterval(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, serializeProject(project))
      } catch { }
    }, AUTOSAVE_INTERVAL)
    return () => clearInterval(id)
  }, [project])

  // Persist on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serializeProject(project))
    } catch { }
  }, [project])

  const saveProject = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serializeProject(project))
      localStorage.setItem(AUTOSAVE_KEY, serializeProject(project))
    } catch { }
  }, [project])

  const exportToModelSpace = useCallback((project: DraftProject) => {
    // Import dynamically to avoid circular dependency
    const { draftToStructuralModel } = require('../engine/drafting3d')
    return draftToStructuralModel(project)
  }, [])

  return { project, setProject, saveProject, exportToModelSpace }
}

function serializeProject(project: DraftProject): string {
  return JSON.stringify({
    id: project.id,
    name: project.name,
    levels: Array.from(project.levels.entries()).map(([id, l]) => ({
      ...l,
      nodes: Array.from(l.nodes.entries()),
      elements: Array.from(l.elements.entries()),
    })),
    sections: Array.from(project.sections.entries()),
    activeLevelId: project.activeLevelId,
    gridX: project.gridX,
    gridY: project.gridY,
  })
}