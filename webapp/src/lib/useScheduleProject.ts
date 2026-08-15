import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  /**
   * Another tab has written this project since this tab last read it, and this
   * tab has an edit that would discard their work.
   *
   * Non-null means NOTHING IS BEING SAVED until it is resolved — the edit is on
   * screen only. That is deliberate: the alternative is what used to happen,
   * which is that whichever tab typed last silently won.
   */
  conflict: TabConflict | null
  /** Take the other tab's version. Discards this tab's unsaved edit. */
  reloadTheirs(): void
  /** Keep this tab's version. Discards the other tab's changes. */
  overwriteWithMine(): void
}

/** A write refused because another tab got there first. */
export interface TabConflict {
  id: string
  /** When the other tab saved. */
  theirSavedAt: string
  /** The name their version carries, so the prompt can be concrete. */
  theirName: string
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
  const [conflict, setConflict] = useState<TabConflict | null>(null)

  /**
   * The `savedAt` this tab last READ or WROTE for the active project.
   *
   * A ref rather than state: it is compared inside `persist` and must be the
   * value as of THIS call, not as of the last render. Reading a stale watermark
   * is exactly the bug being fixed.
   */
  const watermark = useRef<string | null>(null)

  const refreshList = useCallback(() => setProjects(store.list()), [store])

  // Persist the active pointer whenever it changes.
  useEffect(() => {
    if (activeId) backend.setItem(ACTIVE_KEY, activeId)
    else backend.removeItem(ACTIVE_KEY)
  }, [activeId, backend])

  const persist = useCallback((id: string, next: ScheduleProject) => {
    // ── HAS ANOTHER TAB WRITTEN SINCE WE LAST READ? ────────────────────────
    // Two tabs on one schedule used to end with whichever typed last winning,
    // silently: tab A holds the copy it loaded, tab B saves, tab A saves its
    // stale base and B's work is gone with nothing on screen to say so.
    //
    // Comparing ISO stamps as strings is correct — they are fixed-width UTC and
    // sort lexicographically. Two writes inside the SAME millisecond compare
    // equal and slip through; the `storage` listener below is what covers that,
    // and the residue is a millisecond-wide window on a document a human is
    // typing into.
    const disk = store.stampOf(id)
    if (disk && watermark.current && disk > watermark.current) {
      // The edit is KEPT and NOT written — same rule as a full disk. Refusing
      // and dropping the edit would lose the work we are trying to protect.
      setProject(next)
      setConflict({ id, theirSavedAt: disk, theirName: store.load(id)?.meta.name ?? 'their version' })
      refreshList()
      return
    }

    const outcome = store.save(id, next)
    // THE EDIT IS KEPT WHETHER OR NOT IT PERSISTED, and the order matters. When
    // storage is full the old code let the throw escape before this line, so
    // `project` kept its previous value and the user watched their change
    // disappear with no message — then retyped it and watched it disappear
    // again. The in-memory copy is the only one they can still export or copy
    // out, so it survives; what changes is that we say it is not saved.
    setProject(next)
    setSaveError(outcome.ok ? null : outcome.message)
    // Only a write that landed moves the watermark. Moving it after a failed
    // save would make this tab believe it is up to date with a version that was
    // never stored, and the next conflict would go undetected.
    if (outcome.ok) watermark.current = outcome.stored.savedAt
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
    if (p) {
      setActiveId(id)
      setProject(p)
      watermark.current = store.stampOf(id)
      setConflict(null)
    }
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

  // ── Resolving a conflict ────────────────────────────────────────────────
  // Two buttons, both destructive in one direction, both explicit. There is no
  // merge: two versions of a construction programme differ in durations,
  // logic and resourcing, and a machine picking between them field by field
  // would produce a schedule nobody wrote. The same call `remoteStore` makes
  // for cloud conflicts, argued at length there.

  const reloadTheirs = useCallback(() => {
    if (!conflict) return
    const theirs = store.load(conflict.id)
    if (theirs) {
      setProject(theirs)
      watermark.current = store.stampOf(conflict.id)
    }
    setConflict(null)
    refreshList()
  }, [conflict, store, refreshList])

  const overwriteWithMine = useCallback(() => {
    if (!conflict || !project) return
    // Take their stamp as the watermark FIRST, so this write is judged against
    // what is actually on disk rather than tripping the same check again.
    watermark.current = store.stampOf(conflict.id)
    setConflict(null)
    const outcome = store.save(conflict.id, project)
    setSaveError(outcome.ok ? null : outcome.message)
    if (outcome.ok) watermark.current = outcome.stored.savedAt
    refreshList()
  }, [conflict, project, store, refreshList])

  // ── Another tab wrote the project we have open ──────────────────────────
  // `storage` fires only in the OTHER tabs, which is exactly what is wanted:
  // the tab that saved already has the value. Reloading here is what keeps the
  // two tabs from diverging in the first place, so most of the time the
  // conflict check above never has to fire at all.
  //
  // It does NOT reload over unsaved work. A tab holding a conflict, or an edit
  // that hit a full disk, has state that exists nowhere else; overwriting it
  // from disk would destroy the very thing both of those states are protecting.
  useEffect(() => {
    if (typeof window === 'undefined' || !activeId) return
    const key = store.keyFor(activeId)
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return
      if (conflict || saveError) return   // unsaved work here — leave it alone
      const theirs = store.load(activeId)
      if (!theirs) return
      setProject(theirs)
      watermark.current = store.stampOf(activeId)
      refreshList()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [activeId, store, conflict, saveError, refreshList])

  // Seed the watermark for the project restored at mount. Without this the
  // FIRST edit in a freshly-opened tab has nothing to compare against and
  // cannot detect a conflict — which is the commonest case of all, since a
  // second tab is usually opened and then left.
  useEffect(() => {
    if (activeId && watermark.current === null) watermark.current = store.stampOf(activeId)
  }, [activeId, store])

  const importJSON = useCallback((json: string) => {
    const p = importProjectJSON(json)   // throws on invalid; caller surfaces it
    activate(newId(), p)
  }, [activate])

  const exportJSON = useCallback(() => (project ? exportProjectJSON(project) : ''), [project])

  return {
    project, activeId, projects, update, replace, loadSample, newProject, open, remove,
    rename, importJSON, exportJSON, saveError, clearSaveError,
    conflict, reloadTheirs, overwriteWithMine,
  }
}
