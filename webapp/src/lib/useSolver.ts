import { useCallback, useEffect, useRef, useState } from 'react'
import type { SolverRequest } from '../engine/solverWorker'

type Kind = SolverRequest['kind']
type PayloadByKind = { [K in Kind]: Omit<Extract<SolverRequest, { kind: K }>, 'id' | 'kind'> }

/**
 * Runs the heavy FEM/design/optimise work in a Web Worker so the page never
 * freezes. `run(kind, payload)` returns a promise with the worker result; `busy`
 * reflects the in-flight job kind ('' when idle) for spinners / disabled buttons.
 */
export function useSolver() {
  const worker = useRef<Worker | null>(null)
  const pending = useRef(new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>())
  const nextId = useRef(1)
  const [busy, setBusy] = useState<'' | Kind>('')

  useEffect(() => {
    const w = new Worker(new URL('../engine/solverWorker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
      const { id, ok, result, error } = e.data
      const p = pending.current.get(id); if (!p) return
      pending.current.delete(id)
      if (pending.current.size === 0) setBusy('')
      if (ok) p.resolve(result); else p.reject(new Error(error ?? 'solver failed'))
    }
    w.onerror = (e) => { for (const p of pending.current.values()) p.reject(new Error(e.message)); pending.current.clear(); setBusy('') }
    worker.current = w
    return () => { w.terminate(); pending.current.clear() }
  }, [])

  const run = useCallback(<K extends Kind>(kind: K, payload: PayloadByKind[K]): Promise<unknown> => {
    const w = worker.current
    if (!w) return Promise.reject(new Error('solver not ready'))
    const id = nextId.current++
    setBusy(kind)
    return new Promise<unknown>((resolve, reject) => {
      pending.current.set(id, { resolve, reject })
      w.postMessage({ id, kind, ...payload })
    })
  }, [])

  return { busy, run }
}
