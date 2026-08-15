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
  /** Loads the worked sample as a NEW project; returns its id. */
  loadSample(): string
  /** Creates an empty project; returns its id. */
  newProject(name?: string): string
  open(id: string): void
  remove(id: string): void
  rename(name: string): void
  importJSON(json: string): void
  exportJSON(): string
  /**
   * Why the last change is not on disk, or null when everything is saved.
   *
   * Non-null means the edit EXISTS ON SCREEN AND NOWHERE ELSE. Every schedule
   * page renders `<SaveAlert>` for it; a page that forgets is caught by
   * `saveAlert.test.ts`.
   */
  saveError: string | null
  /** Dismiss the notice. It returns on the next failed save. */
  clearSaveError(): void
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
  const [saveError, setSaveError] = useState<string | null>(null)

  const refreshList = useCallback(() => setProjects(store.list()), [store])

  // Persist the active pointer whenever it changes.
  useEffect(() => {
    if (activeId) backend.setItem(ACTIVE_KEY, activeId)
    else backend.removeItem(ACTIVE_KEY)
  }, [activeId, backend])

  const persist = useCallback((id: string, next: ScheduleProject) => {
    const outcome = store.save(id, next)
    // THE EDIT IS KEPT WHETHER OR NOT IT PERSISTED, and the order matters. When
    // storage is full the old code let the throw escape before this line, so
    // `project` kept its previous value and the user watched their change
    // disappear with no message — then retyped it and watched it disappear
    // again. The in-memory copy is the only one they can still export or copy
    // out, so it survives; what changes is that we say it is not saved.
    setProject(next)
    setSaveError(outcome.ok ? null : outcome.message)
    refreshList()
  }, [store, refreshList])

  // Returns the id it activated. A caller that CREATED a project needs to be
  // able to undo that later — the walkthroughs seed a sample when there is
  // nothing to point at and remove it again on close — and reading `activeId`
  // afterwards would see the state from before this render.
  const activate = useCallback((id: string, next: ScheduleProject) => {
    setActiveId(id)
    persist(id, next)
    return id
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

  const clearSaveError = useCallback(() => setSaveError(null), [])

  const importJSON = useCallback((json: string) => {
    const p = importProjectJSON(json)   // throws on invalid; caller surfaces it
    activate(newId(), p)
  }, [activate])

  const exportJSON = useCallback(() => (project ? exportProjectJSON(project) : ''), [project])

  return {
    project, activeId, projects, update, replace, loadSample, newProject, open, remove,
    rename, importJSON, exportJSON, saveError, clearSaveError,
  }
}
