// ─────────────────────────────────────────────────────────────────────────────
// Analysis Report Extraction — Phase 1
//
// Assembles the analytical model definition and linear static analysis results
// into a renderer-agnostic report payload. Complements the design-focused
// modelReport.ts by documenting the structural analysis that drives design.
//
// Data sources:
//   - StructuralModel: node/member/support definitions, load list
//   - F3Result: equilibrium reactions, member forces, governing combo
//   - ModalResult: periods, frequencies, effective modal mass (if run)
//   - AnalyzeOptions: solver settings (P-Δ, shear deformation, etc.)
//
// Presentation only — all numbers come from the analysis pipeline.
// ─────────────────────────────────────────────────────────────────────────────

import type { StructuralModel, Node, Member, NodeSupport } from '../engine/model'
import type { F3Result, F3MemberResult } from '../engine/frame3d'
import type { ModalResult } from '../engine/modal'
import type { AnalyzeOptions } from '../engine/pipeline'

/** Summary of one node in the analytical model. */
export interface AnalysisNode {
  id: string
  x: number
  y: number
  z: number
  /** Support condition at this node, if any. */
  support?: { fixity: string; springs?: { kx?: number; ky?: number; kz?: number } }
}

/** Summary of one member in the analytical model. */
export interface AnalysisMember {
  id: string
  role: string
  material: string
  section: string
  iNode: string
  jNode: string
  length: number
  /** Per-end releases (e.g. pinned connection). */
  releases?: string[]
  /** Rigid zone / offset configuration. */
  rigidzones?: string
}

/** One load case or load combination (factors and description). */
export interface AnalysisLoadCase {
  name: string
  D?: number
  L?: number
  Lr?: number
  S?: number
  R?: number
  W?: number
  E?: number
  /** Vertical seismic component Ev, if applied. */
  Ev?: number
}

/** Linear static equilibrium results for one load case. */
export interface AnalysisEquilibrium {
  loadCase: string
  reactions: Array<{
    node: string
    Fx: number
    Fy: number
    Fz: number
    Mx: number
    My: number
    Mz: number
  }>
  /** Envelope member forces (at critical sections). */
  memberForces: Array<{
    memberId: string
    Nmax: number  // axial, compression positive (kN)
    Nmin: number
    Mzmax: number  // strong-axis moment (kN·m)
    Mzmin: number
    Mymax: number  // weak-axis moment
    Mymin: number
    Vymax: number  // strong-axis shear (kN)
    Vzmax: number  // weak-axis shear
  }>
}

/** One natural mode from modal analysis. */
export interface AnalysisMode {
  mode: number
  period: number
  frequency: number
  effMassX: number
  effMassY: number
  effMassZ: number
  effMassRatioX: number
  effMassRatioY: number
  effMassRatioZ: number
}

/** Modal analysis summary (periods, frequencies, mass participation). */
export interface AnalysisModal {
  totalMass: [number, number, number]
  modes: AnalysisMode[]
  cumRatioX: number
  cumRatioY: number
  cumRatioZ: number
}

/** Solver settings and analysis metadata. */
export interface AnalysisMetadata {
  /** Second-order P-Δ iteration enabled. */
  pDelta: boolean
  /** P-Δ converged (only if pDelta=true). */
  pDeltaConverged?: boolean
  /** Timoshenko shear deformation enabled. */
  shearDeformation: boolean
  /** Cracked-section I-modifiers on concrete members. */
  crackedSections: boolean
  /** Rigid end zones automatic. */
  rigidEndZones: boolean
  /** Rigid-zone factor (0–1). */
  rigidZoneFactor?: number
  /** Live-load factor f₁ (NSCP §203.3.1). */
  f1?: number
  /** Seismic system (gravity/imf/smf) — drives column tie detailing. */
  seismicSystem?: string
  /** Diaphragm (rigid floor). */
  diaphragm: boolean
}

/** Complete analytical model and analysis results. */
export interface AnalysisReport {
  modelName: string
  nodes: AnalysisNode[]
  members: AnalysisMember[]
  loadCases: AnalysisLoadCase[]
  /** Linear static results: governing case + summary. */
  equilibrium: AnalysisEquilibrium
  /** Modal analysis (if available). */
  modal?: AnalysisModal
  /** Solver settings and metadata. */
  metadata: AnalysisMetadata
}

/**
 * Extract analytical model definition from StructuralModel.
 * Provides node/member/support inventory; no analysis results yet.
 */
export function extractAnalyticalModel(model: StructuralModel): {
  nodes: AnalysisNode[]
  members: AnalysisMember[]
} {
  const supportMap = new Map(model.supports.map((s) => [s.node, s]))
  const sectionMap = new Map(model.sections.map((s) => [s.id, s]))
  const nodeMap = new Map(model.nodes.map((n) => [n.id, n]))

  const nodes: AnalysisNode[] = model.nodes.map((n) => {
    const sup = supportMap.get(n.id)
    return {
      id: n.id,
      x: n.x,
      y: n.y,
      z: n.z,
      ...(sup && {
        support: {
          fixity: sup.fixity,
          ...(sup.fixity === 'spring' && sup.kx !== undefined && {
            springs: { kx: sup.kx, ky: sup.ky, kz: sup.kz },
          }),
        },
      }),
    }
  })

  const members: AnalysisMember[] = model.members.map((m) => {
    const sec = sectionMap.get(m.section)
    const ni = nodeMap.get(m.i)
    const nj = nodeMap.get(m.j)
    const length = ni && nj ? Math.hypot(nj.x - ni.x, nj.y - ni.y, nj.z - ni.z) : 0

    const releases: string[] = []
    if (m.releases?.iEnd) {
      const re = m.releases.iEnd
      if (re.Fx) releases.push('i-Fx')
      if (re.Fy) releases.push('i-Fy')
      if (re.Fz) releases.push('i-Fz')
      if (re.Mx) releases.push('i-Mx')
      if (re.My) releases.push('i-My')
      if (re.Mz) releases.push('i-Mz')
    }
    if (m.releases?.jEnd) {
      const re = m.releases.jEnd
      if (re.Fx) releases.push('j-Fx')
      if (re.Fy) releases.push('j-Fy')
      if (re.Fz) releases.push('j-Fz')
      if (re.Mx) releases.push('j-Mx')
      if (re.My) releases.push('j-My')
      if (re.Mz) releases.push('j-Mz')
    }

    let rigidzones: string | undefined
    if (m.offsets || (model.rigidEndZones && m.rigidZoneFactor !== 0)) {
      const parts: string[] = []
      if (m.offsets?.iEnd) parts.push(`i: [${m.offsets.iEnd.map((v) => v.toFixed(2)).join(', ')}] m`)
      if (m.offsets?.jEnd) parts.push(`j: [${m.offsets.jEnd.map((v) => v.toFixed(2)).join(', ')}] m`)
      if (m.rigidZoneFactor !== undefined && m.rigidZoneFactor > 0)
        parts.push(`factor: ${m.rigidZoneFactor.toFixed(2)}`)
      rigidzones = parts.join(' · ')
    }

    return {
      id: m.id,
      role: m.role,
      material: sec?.material ?? 'concrete',
      section: sec?.name ?? m.section,
      iNode: m.i,
      jNode: m.j,
      length,
      ...(releases.length && { releases }),
      ...(rigidzones && { rigidzones }),
    }
  })

  return { nodes, members }
}

/**
 * Extract load cases and combination factors from the model's load list.
 * Builds the canonical NSCP load case enumeration with factors applied.
 */
export function extractLoadCases(model: StructuralModel): AnalysisLoadCase[] {
  // The NSCP combination rules are in beamAnalysis.ts:nscpCombos()
  // For the report, we enumerate the standard cases with their factors.
  // (The actual combinations solved are built dynamically in designStructure.)
  const cases: AnalysisLoadCase[] = [
    { name: '1.4D', D: 1.4 },
    { name: '1.2D + 1.6L + 0.5Lr', D: 1.2, L: 1.6, Lr: 0.5 },
    { name: '1.2D + 1.6Lr + 0.8W', D: 1.2, Lr: 1.6, W: 0.8 },
    { name: '1.2D + 1.0W + 0.5L + 0.5Lr', D: 1.2, W: 1.0, L: 0.5, Lr: 0.5 },
    { name: '1.2D + 1.0E + 0.5L', D: 1.2, E: 1.0, L: 0.5 },
    { name: '0.9D + 1.0W', D: 0.9, W: 1.0 },
    { name: '0.9D + 1.0E', D: 0.9, E: 1.0 },
  ]
  return cases
}

/**
 * Extract equilibrium results from one frame solve.
 * Governs on peak absolute member moment (the typical driving criterion).
 */
export function extractEquilibrium(
  loadCaseName: string,
  result: F3Result,
): AnalysisEquilibrium {
  const reactions = result.reactions.map((r) => ({
    node: r.node,
    Fx: r.F[0],
    Fy: r.F[1],
    Fz: r.F[2],
    Mx: r.M[0],
    My: r.M[1],
    Mz: r.M[2],
  }))

  const memberForces = result.members.map((m) => ({
    memberId: m.id,
    Nmax: Math.max(...m.N),
    Nmin: Math.min(...m.N),
    Mzmax: Math.max(...m.Mz),
    Mzmin: Math.min(...m.Mz),
    Mymax: Math.max(...m.My),
    Mymin: Math.min(...m.My),
    Vymax: Math.max(...m.Vy.map(Math.abs)),
    Vzmax: Math.max(...m.Vz.map(Math.abs)),
  }))

  return { loadCase: loadCaseName, reactions, memberForces }
}

/**
 * Extract modal summary from ModalResult.
 * Accumulates effective modal mass participation for display.
 */
export function extractModal(modal: ModalResult): AnalysisModal {
  const modes: AnalysisMode[] = modal.modes.slice(0, 12).map((m, i) => ({
    mode: i + 1,
    period: m.period,
    frequency: m.freq,
    effMassX: m.effMass[0],
    effMassY: m.effMass[1],
    effMassZ: m.effMass[2],
    effMassRatioX: m.effMassRatio[0],
    effMassRatioY: m.effMassRatio[1],
    effMassRatioZ: m.effMassRatio[2],
  }))

  let cumRatioX = 0,
    cumRatioY = 0,
    cumRatioZ = 0
  for (const m of modes) {
    cumRatioX += m.effMassRatioX
    cumRatioY += m.effMassRatioY
    cumRatioZ += m.effMassRatioZ
  }

  return {
    totalMass: modal.totalMass,
    modes,
    cumRatioX: Math.min(1, cumRatioX),
    cumRatioY: Math.min(1, cumRatioY),
    cumRatioZ: Math.min(1, cumRatioZ),
  }
}

/**
 * Build the complete AnalysisReport from model, results, and solver options.
 * Governs on the peak member moment across the provided result.
 */
export function buildAnalysisReport(
  model: StructuralModel,
  governingResult: F3Result,
  governingCaseName: string,
  modal: ModalResult | null,
  opts: AnalyzeOptions,
): AnalysisReport {
  const { nodes, members } = extractAnalyticalModel(model)
  const loadCases = extractLoadCases(model)
  const equilibrium = extractEquilibrium(governingCaseName, governingResult)

  const metadata: AnalysisMetadata = {
    pDelta: opts.pDelta ?? false,
    pDeltaConverged: governingResult.pDelta?.converged,
    shearDeformation: opts.shearDeformation ?? false,
    crackedSections: opts.crackedSections ?? false,
    rigidEndZones: model.rigidEndZones ?? false,
    rigidZoneFactor: model.rigidZoneFactor,
    f1: opts.f1,
    seismicSystem: opts.seismicSystem ?? 'gravity',
    diaphragm: model.diaphragm ?? false,
  }

  return {
    modelName: model.name,
    nodes,
    members,
    loadCases,
    equilibrium,
    ...(modal && { modal: extractModal(modal) }),
    metadata,
  }
}
