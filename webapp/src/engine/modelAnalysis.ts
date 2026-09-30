// ─────────────────────────────────────────────────────────────────────────
// MODEL ANALYSIS — the "Analyze (3D FEM)" run: the NSCP combination sweep,
// then (with a seismic case) storey drift, irregularity flags and the
// §208.5.10.2 stability check off the E-case.
//
// Lifted out of `solverWorker` so it can be tested; the worker only posts it.
//
// ONE FACTORIZATION. The combo sweep and the drift E-case solve the same
// structure, so they share one `precomputeFrame`. The drift solve used to
// call `solveFrame3D`, which assembles and factors K again — a second full
// factorization per run (2.4 s on an 8-storey frame meshed 3×3 per panel;
// 271 s before the skyline factor was restored) — and it passed NO diaphragm
// groups, so with a rigid diaphragm on the drift was read off a different
// structure from the one the E combos solved. The active-set path always
// passed them; now both paths do.
//
// Units: geometry m, forces kN, displacement m (drift rows as `driftCheck`).
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel } from './model'
import { modelToFrame3D } from './modelBridge'
import {
  precomputeFrame, analyzeWithGeometry, solveWithGeometry, applyF3Combo,
  type F3AnalyzeOpts, type F3Analysis, type F3Result,
} from './frame3d'
import { analyzeActiveSet, solveActiveSet, axialModes } from './axialOnly'
import { splitAxialModes, stitchAnalysis } from './memberSplit'
import { driftCheck, stabilityCheck, type DriftRow, type StabilityRow } from './seismic'
import { assessIrregularities, type IrregularityFlag } from './irregularity'
import type { SolveProgress } from './progress'

export type DriftReq = { hasSeis: boolean; T: number; R: number; axis: 'x' | 'z'; pDelta: boolean; Z?: number }

export interface ModelAnalysisReq {
  model: StructuralModel
  opts: F3AnalyzeOpts
  drift: DriftReq
  crackedSections?: boolean
  shearDeformation?: boolean
  beamTopOfSteel?: boolean
}

export interface ModelAnalysisResult {
  analysis: F3Analysis | null
  orphans: number
  drift: DriftRow[] | null
  irregularities: IrregularityFlag[] | null
  stability: StabilityRow[] | null
  /** The E-only solve the drift rows were read from (null without a seismic case). */
  eCase: F3Result | null
}

export function runModelAnalysis(req: ModelAnalysisReq, onProgress: (p: SolveProgress) => void = () => {}): ModelAnalysisResult {
  const br = modelToFrame3D(req.model, { crackedSections: req.crackedSections, shearDeformation: req.shearDeformation, beamTopOfSteel: req.beamTopOfSteel })
  // Tension/compression-only members break superposition: the shared-LU
  // combo sweep is only valid while every combo sees the same structure.
  // When any member is limited, each combo gets its own active set instead.
  // A beam carrying mesh nodes was cut into collinear parts by the bridge,
  // so the solver sees `B1#0..#k` where the model has `B1`. The axial modes
  // must follow the cut — a tension-only brace stays tension-only along its
  // whole length — and the results must be put back on the parent id before
  // anything downstream reads them.
  const modes = splitAxialModes(axialModes(req.model.members), br.memberSplits)
  let precomp = null
  let raw: F3Analysis | null
  if (modes.size) {
    raw = analyzeActiveSet(br.nodes, br.members, br.supports, br.loads,
      modes, { ...req.opts, diaphragms: br.diaphragmGroups }, onProgress, br.shells)
  } else {
    onProgress({ phase: 'Assembling and factoring stiffness' })
    precomp = precomputeFrame(br.nodes, br.members, br.supports, br.diaphragmGroups, br.shells)
    raw = analyzeWithGeometry(precomp, br.loads, req.opts, onProgress)
  }
  const analysis = raw ? stitchAnalysis(raw, br.memberSplits) : raw
  let drift = null
  let irregularities = null
  let stability = null
  let sol: F3Result | null = null
  if (req.drift.hasSeis) {
    onProgress({ phase: 'Storey-drift check' })
    const eOnly = applyF3Combo(br.loads, { E: 1 })
    // the E-case gets its own active set too — the braces that carry the
    // seismic push are exactly the ones a tension-only rule switches off
    sol = !eOnly.length ? null
      : modes.size
        ? solveActiveSet(br.nodes, br.members, br.supports, eOnly, modes,
            { pDelta: req.drift.pDelta, diaphragms: br.diaphragmGroups }, br.shells)?.result ?? null
        : solveWithGeometry(precomp!, eOnly, { pDelta: req.drift.pDelta })
    // Storey drift is a property of the LATERAL SYSTEM. `driftCheck` picks
    // the largest lateral displacement of any node at a storey elevation,
    // and mesh nodes sit at exactly those elevations — so a slab's own
    // in-plane deformation could be reported as the storey's drift. Hand it
    // the model's nodes only; the prefix is 1:1 with them by construction.
    const frameNodes = br.nodes.slice(0, br.nodes.length - br.meshNodeCount)
    drift = sol ? driftCheck(req.model, frameNodes, sol.d, req.drift.R, req.drift.T, req.drift.axis) : null
    if (sol) {
      // applied lateral storey force per level (E-case, run direction) → storey shear
      const yById = new Map(br.nodes.map((n) => [n.id, n.y]))
      const fByLevel = new Map<number, number>()
      for (const ld of eOnly) {
        if (ld.kind !== 'node') continue
        const y = yById.get(ld.node); if (y === undefined) continue
        const F = (req.drift.axis === 'x' ? ld.Fx : ld.Fz) ?? 0
        fByLevel.set(y, (fByLevel.get(y) ?? 0) + F)
      }
      const storeyForce = [...fByLevel].map(([elevation, F]) => ({ elevation, F }))
      irregularities = assessIrregularities(req.model, { nodeOrder: frameNodes, d: sol.d, storeyForce, dir: req.drift.axis })
      // §208.5.10.2: whether the code REQUIRES the second-order run the
      // user may or may not have switched on. Same Δs and the same storey
      // forces the drift check and the irregularity flags already use.
      stability = drift ? stabilityCheck(req.model, drift, storeyForce, { R: req.drift.R, Z: req.drift.Z }) : null
    }
  }
  return { analysis, orphans: br.orphanEdges.length, drift, irregularities, stability, eCase: sol }
}
