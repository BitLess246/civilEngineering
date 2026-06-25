// ─────────────────────────────────────────────────────────────────────────
// StructuralModel → time-history bridge (Tier 3 #11, UI phase).
//
// Synthesises a uniform ground-acceleration record and runs modalTimeHistory,
// returning the base-shear and roof-displacement histories for plotting. Keeps
// the page thin — record synthesis + control-node choice live here, tested.
//
// Sample records (scaled to a target PGA, m/s²):
//   harmonic    : steady sine  a_g = PGA·sin(2πf t)
//   pulse       : one-cycle sine pulse over 1/f s, then quiet
//   rampedSine  : sine under a ramp-up / exponential-decay envelope (transient)
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel } from './model'
import { modalTimeHistory, type GroundMotion, type TimeHistoryResult } from './timeHistory'
import { parseAccelerogram } from './accelerogram'

export type GroundMotionKind = 'harmonic' | 'pulse' | 'rampedSine'

export interface GroundMotionSpec {
  kind: GroundMotionKind
  dt: number          // s
  duration: number    // s
  pga: number         // peak ground acceleration, m/s² (g·9.81)
  freq: number        // excitation frequency, Hz
  dir: 0 | 1 | 2
}

/** Build a ground-acceleration record from a spec (see file header). */
export function makeGroundMotion(spec: GroundMotionSpec): GroundMotion {
  const n = Math.max(1, Math.round(spec.duration / spec.dt) + 1)
  const w = 2 * Math.PI * spec.freq
  const ag = new Array(n)
  for (let i = 0; i < n; i++) {
    const t = i * spec.dt
    let a = spec.pga * Math.sin(w * t)
    if (spec.kind === 'pulse') {
      a = t <= 1 / spec.freq ? a : 0
    } else if (spec.kind === 'rampedSine') {
      // 0.5 s linear ramp-up, then exponential decay (τ = duration/3)
      const ramp = Math.min(1, t / 0.5)
      const decay = Math.exp(-t / Math.max(spec.duration / 3, 1e-6))
      a *= ramp * decay
    }
    ag[i] = a
  }
  return { dt: spec.dt, ag, dir: spec.dir }
}

/** CSV/AT2 accelerogram wired directly into the time-history analysis. */
export interface CsvAccelerogramOpts {
  /** Raw text of the CSV or AT2 file. */
  text: string
  /** Time step (s). Required for one-column format when the file has no DT= header. */
  dt?: number
  /** Acceleration unit in the file. 'g' → ×9.81 → m/s². Default: 'ms2'. */
  units?: 'g' | 'ms2'
  /** Excitation direction: 0 = X, 1 = Y, 2 = Z. */
  dir: 0 | 1 | 2
}

export interface TimeHistoryModelOpts {
  /** Synthetic ground-motion spec (used when csv is not provided). */
  spec?: GroundMotionSpec
  /** Real accelerogram parsed from a CSV / PEER AT2 file (takes priority over spec). */
  csv?: CsvAccelerogramOpts
  zeta?: number
  nModes?: number
  controlNode?: string
}

export interface TimeHistoryModelResult {
  result: TimeHistoryResult
  controlNode: string
  /** Peak ground acceleration of the applied record, m/s². */
  pga: number
  /** Peak displacement at the control node in the excitation direction, m. */
  peakRoof: number
  /** 'csv' when a real accelerogram was used; 'synthetic' otherwise. */
  source: 'csv' | 'synthetic'
}

/**
 * Build the record, pick the roof control node and run modal time-history.
 * Pass opts.csv (a real accelerogram) or opts.spec (synthetic motion).
 * Returns null when modal analysis fails (singular K / no mass) or the CSV cannot be parsed.
 */
export function runTimeHistoryModel(
  model: StructuralModel, opts: TimeHistoryModelOpts,
): TimeHistoryModelResult | null {
  if (model.nodes.length === 0) return null
  const yMax = Math.max(...model.nodes.map((nd) => nd.y))
  const controlNode = opts.controlNode ?? (model.nodes.find((nd) => nd.y === yMax)?.id ?? model.nodes[0].id)

  let gm: GroundMotion
  let source: 'csv' | 'synthetic'
  if (opts.csv) {
    const parsed = parseAccelerogram(opts.csv.text, { dt: opts.csv.dt, units: opts.csv.units })
    if (!parsed) return null
    gm = { dt: parsed.dt, ag: parsed.ag, dir: opts.csv.dir }
    source = 'csv'
  } else if (opts.spec) {
    gm = makeGroundMotion(opts.spec)
    source = 'synthetic'
  } else {
    return null
  }

  const result = modalTimeHistory(model, gm, {
    zeta: opts.zeta, nModes: opts.nModes, historyNode: controlNode,
  })
  if (!result) return null

  const dir = gm.dir
  const peakRoof = result.peakDisp[controlNode]?.[dir] ?? 0
  const pga = gm.ag.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
  return { result, controlNode, pga, peakRoof, source }
}
