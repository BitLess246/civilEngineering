import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ScheduleProject } from '../engine/schedule/model'
import { defaultCalendar } from '../engine/schedule/calendar'
import { createStore, defaultBackend, exportProjectJSON, importProjectJSON, type ProjectSummary } from '../engine/schedule/store'
import { sampleProject } from '../engine/schedule/sample'

// Shared active-project state for the scheduling routes. Each schedule page
// calls this hook; the localStorage store is the single source of truth, so
// edits on one route (auto-saved) are visible when another route mounts —
// which is how the separate /schedule, /schedule/gantt … views stay in sync.

const ACTIVE_KEY = 'schedule:active'

function newId(): string {
  return `p_${Date.now().toString(36)}`
}

/** An empty project with a default Mon–Fri calendar. */
export function emptyProject(name = 'Untitled Schedule'): ScheduleProject {
  const cal = defaultCalendar()
  return {
    meta: { name, start: new Date().toISOString().slice(0, 10) },
    calendars: [cal],
    defaultCalendarId: cal.id,
    wbs: [],
    activities: [],
    resources: [],
    baselines: [],
  }
}

export interface ScheduleProjectApi {
  project: ScheduleProject | null
  activeId: string | null
  projects: ProjectSummary[]
  /** Mutate a structural copy of the project; auto-persists. */
  update(mutate: (draft: ScheduleProject) => void): void
  replace(project: ScheduleProject): void
  loadSample(): void
  newProject(name?: string): void
  open(id: string): void
  remove(id: string): void
  rename(name: string): void
  importJSON(json: string): void
  exportJSON(): string
}

export function useScheduleProject(): ScheduleProjectApi {
  const backend = useMemo(() => defaultBackend(), [])
  const store = useMemo(() => createStore(backend), [backend])

  const [activeId, setActiveId] = useState<string | null>(() => backend.getItem(ACTIVE_KEY))
  const [project, setProject] = useState<ScheduleProject | null>(() => {
    const id = backend.getItem(ACTIVE_KEY)
    return id ? store.load(id) : null
  })
  const [projects, setProjects] = useState<ProjectSummary[]>(() => store.list())

  const refreshList = useCallback(() => setProjects(store.list()), [store])

  // Persist the active pointer whenever it changes.
  useEffect(() => {
    if (activeId) backend.setItem(ACTIVE_KEY, activeId)
    else backend.removeItem(ACTIVE_KEY)
  }, [activeId, backend])

  const persist = useCallback((id: string, next: ScheduleProject) => {
    store.save(id, next)
    setProject(next)
    refreshList()
  }, [store, refreshList])

  const activate = useCallback((id: string, next: ScheduleProject) => {
    setActiveId(id)
    persist(id, next)
  }, [persist])

  const update = useCallback((mutate: (draft: ScheduleProject) => void) => {
    if (!project || !activeId) return
    const draft = structuredClone(project)
    mutate(draft)
    persist(activeId, draft)
  }, [project, activeId, persist])

  const replace = useCallback((next: ScheduleProject) => {
    const id = activeId ?? newId()
    activate(id, next)
  }, [activeId, activate])

  const loadSample = useCallback(() => activate(newId(), sampleProject()), [activate])
  const newProject = useCallback((name?: string) => activate(newId(), emptyProject(name)), [activate])

  const open = useCallback((id: string) => {
    const p = store.load(id)
    if (p) { setActiveId(id); setProject(p) }
  }, [store])

  const remove = useCallback((id: string) => {
    store.remove(id)
    refreshList()
    if (id === activeId) {
      const next = store.list()[0]
      if (next) open(next.id)
      else { setActiveId(null); setProject(null) }
    }
  }, [store, activeId, refreshList, open])

  const rename = useCallback((name: string) => update((d) => { d.meta.name = name }), [update])

  const importJSON = useCallback((json: string) => {
    const p = importProjectJSON(json)   // throws on invalid; caller surfaces it
    activate(newId(), p)
  }, [activate])

  const exportJSON = useCallback(() => (project ? exportProjectJSON(project) : ''), [project])

  return { project, activeId, projects, update, replace, loadSample, newProject, open, remove, rename, importJSON, exportJSON }
}
