/// <reference lib="webworker" />
// ─────────────────────────────────────────────────────────────────────────
// Off-main-thread solver. The 3D FEM analysis, the design pipeline and the
// optimisation loop are CPU-heavy and were freezing the UI on large models.
// They are pure functions over JSON-serialisable data, so they run here in a
// Web Worker and post results back; the page stays responsive (and can show a
// "computing…" state). One request → one response, matched by `id`.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel } from './model'
import { modelToFrame3D } from './modelBridge'
import { analyzeFrame3D, solveFrame3D, applyF3Combo, type F3AnalyzeOpts } from './frame3d'
import { driftCheck } from './seismic'
import { designStructure, optimizeStructure, selectBarDiameters, type SoilOptions, type FootingPlan, type AnalyzeOptions } from './pipeline'

type DriftReq = { hasSeis: boolean; T: number; R: number; axis: 'x' | 'z'; pDelta: boolean }
export type SolverRequest =
  | { id: number; kind: 'analyze'; model: StructuralModel; opts: F3AnalyzeOpts; drift: DriftReq }
  | { id: number; kind: 'design'; model: StructuralModel; soil: SoilOptions; plan: FootingPlan; opts: AnalyzeOptions; tryBars: boolean }
  | { id: number; kind: 'optimize'; model: StructuralModel; soil: SoilOptions; plan: FootingPlan; opts: AnalyzeOptions; tryBars: boolean; maxIter: number }

const ctx = self as unknown as Worker

ctx.onmessage = (e: MessageEvent<SolverRequest>) => {
  const msg = e.data
  try {
    if (msg.kind === 'analyze') {
      const br = modelToFrame3D(msg.model)
      const analysis = analyzeFrame3D(br.nodes, br.members, br.supports, br.loads, msg.opts)
      let drift = null
      if (msg.drift.hasSeis) {
        const eOnly = applyF3Combo(br.loads, { E: 1 })
        const sol = eOnly.length ? solveFrame3D(br.nodes, br.members, br.supports, eOnly, { pDelta: msg.drift.pDelta }) : null
        drift = sol ? driftCheck(msg.model, br.nodes, sol.d, msg.drift.R, msg.drift.T, msg.drift.axis) : null
      }
      ctx.postMessage({ id: msg.id, ok: true, result: { analysis, orphans: br.orphanEdges.length, drift } })
    } else if (msg.kind === 'design') {
      const m = msg.tryBars ? selectBarDiameters(msg.model, msg.soil, msg.plan, msg.opts) : msg.model
      const design = designStructure(m, msg.soil, msg.plan, msg.opts)
      ctx.postMessage({ id: msg.id, ok: true, result: { model: m, design } })
    } else {
      const result = optimizeStructure(msg.model, msg.soil, msg.plan, msg.maxIter, msg.opts, msg.tryBars)
      ctx.postMessage({ id: msg.id, ok: true, result })
    }
  } catch (err) {
    ctx.postMessage({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
