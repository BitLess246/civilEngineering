import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Investigation } from '../engine/soils/model'
import { emptyInvestigation } from '../engine/soils/model'
import {
  createStore, defaultBackend, exportJSON as serialise, importJSON as parse,
  type InvestigationSummary,
} from '../engine/soils/store'
import { sampleInvestigation } from '../engine/soils/sample'

// Shared active-investigation state for the /soils routes. Each page calls this
// hook; the store is the single source of truth, so an edit on the borehole
// page is visible when the profile page mounts — the same arrangement the
// scheduling routes use.
//
// EVERY MUTATION PERSISTS IMMEDIATELY. Field and laboratory data is expensive
// to re-enter and, until the backend swap lands, it lives in one browser: an
// unsaved edit lost to a refresh is not a minor annoyance here.

const ACTIVE_KEY = 'soils:active'

const newId = (): string => `si_${Date.now().toString(36)}`

export interface InvestigationApi {
  investigation: Investigation | null
  activeId: string | null
  investigations: InvestigationSummary[]
  /** Mutate a structural copy; auto-persists. */
  update(mutate: (draft: Investigation) => void): void
  replace(next: Investigation): void
  loadSample(): void
  newInvestigation(title?: string): void
  open(id: string): void
  remove(id: string): void
  importJSON(json: string): void
  exportJSON(): string
}

export function useInvestigation(): InvestigationApi {
  const backend = useMemo(() => defaultBackend(), [])
  const store = useMemo(() => createStore(backend), [backend])

  const [activeId, setActiveId] = useState<string | null>(() => backend.getItem(ACTIVE_KEY))
  const [investigation, setInvestigation] = useState<Investigation | null>(() => {
    const id = backend.getItem(ACTIVE_KEY)
    return id ? store.load(id) : null
  })
  const [investigations, setInvestigations] = useState<InvestigationSummary[]>(() => store.list())

  const refreshList = useCallback(() => setInvestigations(store.list()), [store])

  useEffect(() => {
    if (activeId) backend.setItem(ACTIVE_KEY, activeId)
    else backend.removeItem(ACTIVE_KEY)
  }, [activeId, backend])

  /**
   * THE ONLY WAY THIS HOOK SETS ITS STATE, and the reason is `update`.
   *
   * `update` cloned the investigation out of the RENDER CLOSURE, so two calls
   * before the next render both started from the same snapshot and the second
   * silently overwrote the first — an edit lost with no error. React state is
   * not readable synchronously after setting it, so the live value is kept in
   * a ref alongside.
   *
   * Every `setInvestigation` goes through here rather than the ref being
   * updated at each call site: a site that set state without the ref would
   * reintroduce the staleness, and there were three of them to remember.
   * Now there are none to remember.
   */
  const live = useRef<Investigation | null>(investigation)
  const setLive = useCallback((next: Investigation | null) => {
    live.current = next
    setInvestigation(next)
  }, [])

  const persist = useCallback((id: string, next: Investigation) => {
    store.save(id, next)
    setLive(next)
    refreshList()
  }, [store, refreshList, setLive])

  const activate = useCallback((id: string, next: Investigation) => {
    setActiveId(id)
    persist(id, next)
  }, [persist])

  const update = useCallback((mutate: (draft: Investigation) => void) => {
    const current = live.current
    if (!current || !activeId) return
    const draft = structuredClone(current)
    mutate(draft)
    persist(activeId, draft)
  }, [activeId, persist])

  const replace = useCallback((next: Investigation) => {
    activate(activeId ?? newId(), next)
  }, [activeId, activate])

  const loadSample = useCallback(() => activate(newId(), sampleInvestigation()), [activate])
  const newInvestigation = useCallback(
    (title?: string) => activate(newId(), emptyInvestigation(title)), [activate],
  )

  const open = useCallback((id: string) => {
    const found = store.load(id)
    if (found) { setActiveId(id); setLive(found) }
  }, [store, setLive])

  const remove = useCallback((id: string) => {
    store.remove(id)
    refreshList()
    if (id === activeId) {
      const next = store.list()[0]
      if (next) open(next.id)
      else { setActiveId(null); setLive(null) }
    }
  }, [store, activeId, refreshList, open, setLive])

  const importJSON = useCallback((json: string) => {
    // Throws on malformed JSON or an integrity error; the caller surfaces it
    // rather than this hook swallowing a failed import.
    activate(newId(), parse(json))
  }, [activate])

  const exportJSON = useCallback(() => (investigation ? serialise(investigation) : ''), [investigation])

  return {
    investigation, activeId, investigations,
    update, replace, loadSample, newInvestigation, open, remove, importJSON, exportJSON,
  }
}
