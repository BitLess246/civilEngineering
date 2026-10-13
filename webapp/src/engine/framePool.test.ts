import { afterEach, describe, expect, it, vi } from 'vitest'
import { FramePool, frameWorkerCount, MAX_FRAME_WORKERS } from './framePool'

describe('frameWorkerCount', () => {
  it('never starts more workers than the task batch needs', () => {
    expect(frameWorkerCount(1, 16)).toBe(1)
    expect(frameWorkerCount(3, 16)).toBe(3)
  })

  it('caps workers at the pool limit and leaves one logical CPU available', () => {
    expect(frameWorkerCount(40, 16)).toBe(MAX_FRAME_WORKERS)
    expect(frameWorkerCount(40, 4)).toBe(3)
    expect(frameWorkerCount(40, 16, 8000)).toBe(4)
    expect(frameWorkerCount(40, 16, 20000)).toBe(2)
    expect(frameWorkerCount(40, 16, 50000)).toBe(2)
  })

  it('handles invalid and fractional counts safely', () => {
    expect(frameWorkerCount(0, 8)).toBe(1)
    expect(frameWorkerCount(-4, 8)).toBe(1)
    expect(frameWorkerCount(2.9, 8)).toBe(2)
    expect(frameWorkerCount(Number.NaN, Number.NaN)).toBe(1)
    expect(frameWorkerCount(10, 1)).toBe(1)
  })
})

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  onmessageerror: (() => void) | null = null
  terminated = false

  constructor() { FakeWorker.instances.push(this) }

  postMessage(message: { kind: string; id?: number }) {
    queueMicrotask(() => {
      if (this.terminated) return
      if (message.kind === 'init') this.onmessage?.({ data: { kind: 'ready' } } as MessageEvent)
      else this.onmessage?.({ data: { kind: 'result', id: message.id, result: null } } as MessageEvent)
    })
  }

  terminate() { this.terminated = true }

  crash() {
    this.onerror?.({ message: 'simulated worker crash', preventDefault() {} } as ErrorEvent)
  }
}

describe('FramePool failure handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    FakeWorker.instances = []
  })

  it('rejects running and queued solves if a worker crashes', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const pool = new FramePool(1)
    try {
      await pool.init({} as never)
      const running = pool.solve([])
      const queued = pool.solve([])
      FakeWorker.instances[0].crash()
      const results = await Promise.allSettled([running, queued])
      expect(results.every((result) => result.status === 'rejected')).toBe(true)
      expect(results.map((result) => result.status === 'rejected' ? String(result.reason) : '')).toEqual([
        expect.stringContaining('simulated worker crash'),
        expect.stringContaining('simulated worker crash'),
      ])
    } finally {
      pool.terminate()
    }
  })

  it('rejects solves submitted after termination', async () => {
    vi.stubGlobal('Worker', FakeWorker)
    const pool = new FramePool(1)
    pool.terminate()
    await expect(pool.solve([])).rejects.toThrow('terminated')
  })
})
