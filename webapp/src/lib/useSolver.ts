import { useCallback, useEffect, useRef, useState } from 'react'
import type { SolverRequest } from '../engine/solverWorker'
import type { SolveProgress } from '../engine/progress'

type Kind = SolverRequest['kind']
type PayloadByKind = { [K in Kind]: Omit<Extract<SolverRequest, { kind: K }>, 'id' | 'kind'> }
type WorkerMsg = { id: number; ok?: boolean; result?: unknown; error?: string; progress?: SolveProgress }

/**
 * Runs the heavy FEM/design/optimise work in a Web Worker so the page never
 * freezes. `run(kind, payload)` returns a promise with the worker result; `busy`
 * reflects the in-flight job kind ('' when idle) for spinners / disabled buttons;
 * `progress` is the latest tick from the worker (null when idle).
 *
 * `error` IS PART OF THE CONTRACT, not the caller's problem. Every solver call
 * in Model Space ended `.catch((e) => console.error(...))` — nine of them —
 * so a solve that threw left the button un-spinning and told the user
 * absolutely nothing. Reporting it here rather than at each call site means a
 * new solver kind cannot forget: the state is set wherever the promise
 * rejects, which is one place, and cleared when the next run starts.
 */
export function useSolver() {
  const worker = useRef<Worker | null>(null)
  const pending = useRef(new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>())
  const nextId = useRef(1)
  const [busy, setBusy] = useState<'' | Kind>('')
  const [progress, setProgress] = useState<SolveProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // capture the map for the cleanup closure — `pending.current` could point
    // at a different object by the time the effect tears down
    const inflight = pending.current
    const w = new Worker(new URL('../engine/solverWorker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<WorkerMsg>) => {
      const { id, ok, result, error: errMsg, progress: prog } = e.data
      if (prog) { if (pending.current.has(id)) setProgress(prog); return }   // progress tick
      const p = pending.current.get(id); if (!p) return
      pending.current.delete(id)
      if (pending.current.size === 0) { setBusy(''); setProgress(null) }
      if (ok) p.resolve(result)
      else { setError(errMsg ?? 'solver failed'); p.reject(new Error(errMsg ?? 'solver failed')) }
    }
    w.onerror = (e) => {
      // The worker itself died — every in-flight job is lost, and the user
      // gets told once rather than nine times.
      setError(e.message || 'the solver worker stopped unexpectedly')
      for (const p of pending.current.values()) p.reject(new Error(e.message))
      pending.current.clear(); setBusy(''); setProgress(null)
    }
    worker.current = w
    return () => { w.terminate(); inflight.clear() }
  }, [])

  const run = useCallback(<K extends Kind>(kind: K, payload: PayloadByKind[K]): Promise<unknown> => {
    const w = worker.current
    if (!w) return Promise.reject(new Error('solver not ready'))
    const id = nextId.current++
    setBusy(kind)
    setProgress(null)
    setError(null)          // a new run supersedes the last failure
    return new Promise<unknown>((resolve, reject) => {
      pending.current.set(id, { resolve, reject })
      w.postMessage({ id, kind, ...payload })
    })
  }, [])

  const clearError = useCallback(() => setError(null), [])

  return { busy, run, progress, error, clearError }
}
