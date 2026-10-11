// Fan-out pool of frame-solve workers. Each worker holds one pre-factored
// FramePrecomp; the pool distributes solve() calls across idle workers using
// a FIFO queue so all N workers stay busy during a batch of load cases.
import type { FramePrecompSerial, F3Load, F3Result, PDeltaOpts } from './frame3d'

/** Keep one logical CPU available for the browser/UI and cap memory-heavy solver copies. */
export const MAX_FRAME_WORKERS = 8

/**
 * Choose a worker count for a known batch. Each worker deserializes and retains
 * its own factorization, so starting more workers than useful tasks wastes both
 * startup time and substantial memory on large shell meshes.
 */
export function frameWorkerCount(
  taskCount: number,
  hardwareConcurrency = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 4 : 4,
  estimatedDofs = 0,
): number {
  const tasks = Number.isFinite(taskCount) ? Math.max(1, Math.floor(taskCount)) : 1
  const cores = Number.isFinite(hardwareConcurrency) ? Math.max(1, Math.floor(hardwareConcurrency)) : 4
  const dofs = Number.isFinite(estimatedDofs) ? Math.max(0, estimatedDofs) : 0
  // Dense factorization memory grows faster than model size. These conservative
  // tiers limit duplicated solver state for large models; benchmark data should
  // tune the thresholds before claiming optimality.
  const memoryCap = dofs >= 20000 ? 2 : dofs >= 8000 ? 4 : MAX_FRAME_WORKERS
  return Math.max(1, Math.min(MAX_FRAME_WORKERS, memoryCap, Math.max(1, cores - 1), tasks))
}

interface PendingTask {
  id: number
  loads: F3Load[]
  opts?: PDeltaOpts
  recover?: string[]
  resolve: (r: F3Result | null) => void
  reject: (error: Error) => void
}

interface PendingSolve {
  resolve: (r: F3Result | null) => void
  reject: (error: Error) => void
}

export class FramePool {
  private readonly ws: Worker[]
  private queue: PendingTask[] = []
  private idle: number[] = []
  private pending = new Map<number, PendingSolve>()
  private initRejects = new Set<(error: Error) => void>()
  private failure: Error | null = null
  private terminated = false
  private seq = 0

  constructor(size = frameWorkerCount(MAX_FRAME_WORKERS)) {
    if (!Number.isInteger(size) || size < 1 || size > MAX_FRAME_WORKERS) {
      throw new RangeError(`FramePool size must be an integer from 1 to ${MAX_FRAME_WORKERS}`)
    }
    this.ws = Array.from({ length: size }, (_, i) => {
      const w = new Worker(new URL('./frameWorker.ts', import.meta.url), { type: 'module' })
      w.onmessage = ({ data }) => this.recv(i, data)
      w.onerror = (event) => { event.preventDefault(); this.fail(new Error('Frame worker ' + i + ' failed: ' + (event.message || 'unknown worker error'))) }
      w.onmessageerror = () => this.fail(new Error('Frame worker ' + i + ' returned an unreadable message'))
      return w
    })
  }

  /** Broadcast new precomp to all workers and wait until all are ready. */
  async init(serial: FramePrecompSerial): Promise<void> {
    this.assertUsable()
    this.idle = []
    this.queue = []
    await Promise.all(
      this.ws.map((w, i) =>
        new Promise<void>((resolve, reject) => {
          const onInitError = (error: Error) => reject(error)
          this.initRejects.add(onInitError)
          w.onmessage = ({ data }: MessageEvent<{ kind: string }>) => {
            if (data.kind === 'ready') {
              this.initRejects.delete(onInitError)
              w.onmessage = ({ data: d }) => this.recv(i, d)
              this.idle.push(i)
              resolve()
            } else {
              const error = new Error('Frame worker ' + i + ' sent unexpected message during initialization')
              this.initRejects.delete(onInitError)
              reject(error)
              this.fail(error)
            }
          }
          try {
            w.postMessage({ kind: 'init', serial })
          } catch (cause) {
            const error = cause instanceof Error ? cause : new Error(String(cause))
            this.initRejects.delete(onInitError)
            reject(error)
            this.fail(error)
          }
        }),
      ),
    )
  }

  /** `recover` names the members this solve needs internal forces for; omit for
   *  all of them, pass an empty list for none. See `RecoverFilter`. A Set does
   *  not survive postMessage structured-clone in every runtime, so it crosses as
   *  an array. */
  solve(loads: F3Load[], opts?: PDeltaOpts, recover?: ReadonlySet<string>): Promise<F3Result | null> {
    const id = this.seq++
    const rec = recover ? [...recover] : undefined
    return new Promise((resolve, reject) => {
      try {
        this.assertUsable()
        if (this.idle.length > 0) {
          const wi = this.idle.shift()!
          this.pending.set(id, { resolve, reject })
          this.ws[wi].postMessage({ kind: 'solve', id, loads, opts, recover: rec })
        } else {
          this.queue.push({ id, loads, opts, recover: rec, resolve, reject })
        }
      } catch (cause) {
        reject(cause instanceof Error ? cause : new Error(String(cause)))
      }
    })
  }

  private recv(wi: number, data: { kind: string; id?: number; result?: F3Result | null }) {
    if (data.kind !== 'result' || data.id === undefined) return
    const task = this.pending.get(data.id)
    if (task) { this.pending.delete(data.id); task.resolve(data.result ?? null) }
    if (this.queue.length > 0) {
      const { id, loads, opts, recover, resolve, reject } = this.queue.shift()!
      this.pending.set(id, { resolve, reject })
      try {
        this.ws[wi].postMessage({ kind: 'solve', id, loads, opts, recover })
      } catch (cause) {
        this.pending.delete(id)
        const error = cause instanceof Error ? cause : new Error(String(cause))
        reject(error)
        this.fail(error)
      }
    } else {
      this.idle.push(wi)
    }
  }

  private assertUsable(): void {
    if (this.failure) throw this.failure
    if (this.terminated) throw new Error('FramePool has been terminated')
  }

  private fail(error: Error): void {
    if (this.failure || this.terminated) return
    this.failure = error
    this.initRejects.forEach((reject) => reject(error))
    this.initRejects.clear()
    this.pending.forEach(({ reject }) => reject(error))
    this.pending.clear()
    this.queue.splice(0).forEach((task) => task.reject(error))
    this.idle = []
    this.ws.forEach((w) => w.terminate())
  }

  terminate(): void {
    if (this.terminated) return
    this.terminated = true
    const error = new Error('FramePool has been terminated')
    this.initRejects.forEach((reject) => reject(error))
    this.initRejects.clear()
    this.pending.forEach(({ reject }) => reject(error))
    this.pending.clear()
    this.queue.splice(0).forEach((task) => task.reject(error))
    this.ws.forEach((w) => w.terminate())
    this.idle = []
  }
}
