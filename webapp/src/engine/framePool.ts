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
): number {
  const tasks = Number.isFinite(taskCount) ? Math.max(1, Math.floor(taskCount)) : 1
  const cores = Number.isFinite(hardwareConcurrency) ? Math.max(1, Math.floor(hardwareConcurrency)) : 4
  return Math.max(1, Math.min(MAX_FRAME_WORKERS, Math.max(1, cores - 1), tasks))
}

interface PendingTask {
  id: number
  loads: F3Load[]
  opts?: PDeltaOpts
  recover?: string[]
  resolve: (r: F3Result | null) => void
}

export class FramePool {
  private readonly ws: Worker[]
  private queue: PendingTask[] = []
  private idle: number[] = []
  private pending = new Map<number, (r: F3Result | null) => void>()
  private seq = 0

  constructor(size = frameWorkerCount(MAX_FRAME_WORKERS)) {
    if (!Number.isInteger(size) || size < 1 || size > MAX_FRAME_WORKERS) {
      throw new RangeError(`FramePool size must be an integer from 1 to ${MAX_FRAME_WORKERS}`)
    }
    this.ws = Array.from({ length: size }, (_, i) => {
      const w = new Worker(new URL('./frameWorker.ts', import.meta.url), { type: 'module' })
      w.onmessage = ({ data }) => this.recv(i, data)
      return w
    })
  }

  /** Broadcast new precomp to all workers and wait until all are ready. */
  async init(serial: FramePrecompSerial): Promise<void> {
    this.idle = []
    this.queue = []
    this.pending.clear()
    await Promise.all(
      this.ws.map((w, i) =>
        new Promise<void>((resolve) => {
          w.onmessage = ({ data }: MessageEvent<{ kind: string }>) => {
            if (data.kind === 'ready') {
              w.onmessage = ({ data: d }) => this.recv(i, d)
              this.idle.push(i)
              resolve()
            }
          }
          w.postMessage({ kind: 'init', serial })
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
    return new Promise((resolve) => {
      if (this.idle.length > 0) {
        const wi = this.idle.shift()!
        this.pending.set(id, resolve)
        this.ws[wi].postMessage({ kind: 'solve', id, loads, opts, recover: rec })
      } else {
        this.queue.push({ id, loads, opts, recover: rec, resolve })
      }
    })
  }

  private recv(wi: number, data: { kind: string; id?: number; result?: F3Result | null }) {
    if (data.kind !== 'result' || data.id === undefined) return
    const cb = this.pending.get(data.id)
    if (cb) { this.pending.delete(data.id); cb(data.result ?? null) }
    if (this.queue.length > 0) {
      const { id, loads, opts, recover, resolve } = this.queue.shift()!
      this.pending.set(id, resolve)
      this.ws[wi].postMessage({ kind: 'solve', id, loads, opts, recover })
    } else {
      this.idle.push(wi)
    }
  }

  terminate(): void {
    this.ws.forEach((w) => w.terminate())
    this.idle = []
    this.queue = []
    this.pending.clear()
  }
}
