/// <reference lib="webworker" />
// Minimal frame-solve worker: receives one FramePrecompSerial via 'init' then
// handles 'solve' requests using that pre-factored stiffness (O(n²) per solve).
import { deserializePrecomp, solveWithGeometry } from './frame3d'
import type { FramePrecompSerial, FramePrecomp, F3Load, PDeltaOpts, F3Result } from './frame3d'

type InMsg =
  | { kind: 'init'; serial: FramePrecompSerial }
  | { kind: 'solve'; id: number; loads: F3Load[]; opts?: PDeltaOpts }

type OutMsg =
  | { kind: 'ready' }
  | { kind: 'result'; id: number; result: F3Result | null }

const ctx = self as unknown as Worker
let precomp: FramePrecomp | null = null

ctx.onmessage = ({ data }: MessageEvent<InMsg>) => {
  if (data.kind === 'init') {
    precomp = deserializePrecomp(data.serial)
    ctx.postMessage({ kind: 'ready' } satisfies OutMsg)
  } else {
    const result = precomp ? solveWithGeometry(precomp, data.loads, data.opts) : null
    ctx.postMessage({ kind: 'result', id: data.id, result } satisfies OutMsg)
  }
}
