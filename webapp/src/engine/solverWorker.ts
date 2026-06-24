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
import { modalAnalysis } from './modal'
import { driftCheck } from './seismic'
import { designStructureAsync, optimizeStructureAsync, selectBarDiameters, type SoilOptions, type FootingPlan, type AnalyzeOptions } from './pipeline'
import type { SolveProgress } from './progress'

type DriftReq = { hasSeis: boolean; T: number; R: number; axis: 'x' | 'z'; pDelta: boolean }
export type SolverRequest =
  | { id: number; kind: 'analyze'; model: StructuralModel; opts: F3AnalyzeOpts; drift: DriftReq }
  | { id: number; kind: 'design'; model: StructuralModel; soil: SoilOptions; plan: FootingPlan; opts: AnalyzeOptions; tryBars: boolean }
  | { id: number; kind: 'optimize'; model: StructuralModel; soil: SoilOptions; plan: FootingPlan; opts: AnalyzeOptions; tryBars: boolean; maxIter: number }
  | { id: number; kind: 'modal'; model: StructuralModel; nModes: number }

const ctx = self as unknown as Worker

ctx.onmessage = async (e: MessageEvent<SolverRequest>) => {
  const msg = e.data
  // forward progress ticks to the main thread (delivered while the worker runs)
  const onProgress = (p: SolveProgress) => ctx.postMessage({ id: msg.id, progress: p })
  try {
    if (msg.kind === 'analyze') {
      const br = modelToFrame3D(msg.model)
      const analysis = analyzeFrame3D(br.nodes, br.members, br.supports, br.loads, msg.opts, onProgress)
      let drift = null
      if (msg.drift.hasSeis) {
        onProgress({ phase: 'Storey-drift check' })
        const eOnly = applyF3Combo(br.loads, { E: 1 })
        const sol = eOnly.length ? solveFrame3D(br.nodes, br.members, br.supports, eOnly, { pDelta: msg.drift.pDelta }) : null
        drift = sol ? driftCheck(msg.model, br.nodes, sol.d, msg.drift.R, msg.drift.T, msg.drift.axis) : null
      }
      ctx.postMessage({ id: msg.id, ok: true, result: { analysis, orphans: br.orphanEdges.length, drift } })
    } else if (msg.kind === 'modal') {
      onProgress({ phase: 'Modal analysis' })
      const modal = modalAnalysis(msg.model, msg.nModes)
      ctx.postMessage({ id: msg.id, ok: true, result: { modal } })
    } else if (msg.kind === 'design') {
      let m = msg.model
      if (msg.tryBars) {
        const hasConcrete = msg.model.sections.some((s) => s.material !== 'steel')
        if (hasConcrete) onProgress({ phase: 'Selecting bar sizes' })
        m = selectBarDiameters(msg.model, msg.soil, msg.plan, msg.opts)
      }
      const design = await designStructureAsync(m, msg.soil, msg.plan, msg.opts, onProgress)
      ctx.postMessage({ id: msg.id, ok: true, result: { model: m, design } })
    } else {
      const result = await optimizeStructureAsync(msg.model, msg.soil, msg.plan, msg.maxIter, msg.opts, msg.tryBars, onProgress)
      ctx.postMessage({ id: msg.id, ok: true, result })
    }
  } catch (err) {
    ctx.postMessage({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
