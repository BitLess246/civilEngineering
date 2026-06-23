// Fan-out pool of frame-solve workers. Each worker holds one pre-factored
// FramePrecomp; the pool distributes solve() calls across idle workers using
// a FIFO queue so all N workers stay busy during a batch of load cases.
import type { FramePrecompSerial, F3Load, F3Result, PDeltaOpts } from './frame3d'

interface PendingTask {
  id: number
  loads: F3Load[]
  opts?: PDeltaOpts
  resolve: (r: F3Result | null) => void
}

export class FramePool {
  private readonly ws: Worker[]
  private queue: PendingTask[] = []
  private idle: number[] = []
  private pending = new Map<number, (r: F3Result | null) => void>()
  private seq = 0

  constructor(size = Math.min(navigator.hardwareConcurrency ?? 4, 8)) {
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

  solve(loads: F3Load[], opts?: PDeltaOpts): Promise<F3Result | null> {
    const id = this.seq++
    return new Promise((resolve) => {
      if (this.idle.length > 0) {
        const wi = this.idle.shift()!
        this.pending.set(id, resolve)
        this.ws[wi].postMessage({ kind: 'solve', id, loads, opts })
      } else {
        this.queue.push({ id, loads, opts, resolve })
      }
    })
  }

  private recv(wi: number, data: { kind: string; id?: number; result?: F3Result | null }) {
    if (data.kind !== 'result' || data.id === undefined) return
    const cb = this.pending.get(data.id)
    if (cb) { this.pending.delete(data.id); cb(data.result ?? null) }
    if (this.queue.length > 0) {
      const { id, loads, opts, resolve } = this.queue.shift()!
      this.pending.set(id, resolve)
      this.ws[wi].postMessage({ kind: 'solve', id, loads, opts })
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
