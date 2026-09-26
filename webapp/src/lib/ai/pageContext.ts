// Live page snapshots — what the assistant "sees" of the open calculator.
//
// A page that opts in publishes a compact snapshot of its current inputs and
// results; the widget attaches the current route's snapshot to every chat
// request, and the function prints it into the prompt as ground truth. That
// is what turns "why did the answer come out like that?" from a request for
// more context into an explanation of THESE numbers.
//
// `useSyncExternalStore` + a module Map, not context: pages publish from an
// effect (syncing an external store — no setState-in-effect), the widget
// subscribes, and a page that never opts in simply has no snapshot. Publish
// a useMemo'd value so the effect only refires when the content changes.
import { useEffect, useSyncExternalStore } from 'react'

export interface PageSnapshotField {
  label: string
  value: string
}

export interface PageSnapshot {
  route: string
  tool: string
  inputs: PageSnapshotField[]
  results: PageSnapshotField[]
  notes: string[]
}

/** Cap on the formatted snapshot: context, not a dump. The server caps again. */
export const MAX_SNAPSHOT_CHARS = 2500

type Listener = () => void

const snapshots = new Map<string, PageSnapshot>()
const listeners = new Set<Listener>()

function notify(): void {
  for (const fn of listeners) fn()
}

/** Publish (or, with null, withdraw) this route's snapshot. Exported for tests. */
export function publishPageSnapshot(route: string, snapshot: PageSnapshot | null): void {
  if (snapshot) {
    snapshots.set(route, snapshot)
  } else {
    snapshots.delete(route)
  }
  notify()
}

/** The current snapshot for a route, if its page published one. Exported for tests. */
export function readPageSnapshot(route: string): PageSnapshot | null {
  return snapshots.get(route) ?? null
}

function subscribePageSnapshots(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/**
 * Called by an opted-in page with a memoised snapshot. Withdrawn on unmount,
 * so a snapshot never outlives the page that produced it.
 */
export function usePublishPageSnapshot(route: string, snapshot: PageSnapshot | null): void {
  useEffect(() => {
    publishPageSnapshot(route, snapshot)
    return () => publishPageSnapshot(route, null)
  }, [route, snapshot])
}

/** The widget's view: the live snapshot for the open route, or null. */
export function usePageSnapshot(route: string): PageSnapshot | null {
  return useSyncExternalStore(subscribePageSnapshots, () => readPageSnapshot(route))
}

/** One compact block the prompt can quote. Field order is the page's own. */
export function formatPageSnapshot(s: PageSnapshot): string {
  const fields = (fs: PageSnapshotField[]): string =>
    fs.map((f) => `${f.label}=${f.value}`).join('; ') || '—'
  const lines = [
    `Open calculator: ${s.tool} (${s.route})`,
    `Inputs: ${fields(s.inputs)}`,
    `Results: ${fields(s.results)}`,
  ]
  if (s.notes.length > 0) lines.push(`Notes: ${s.notes.join('; ')}`)
  const text = lines.join('\n')
  return text.length > MAX_SNAPSHOT_CHARS ? `${text.slice(0, MAX_SNAPSHOT_CHARS)}…` : text
}
