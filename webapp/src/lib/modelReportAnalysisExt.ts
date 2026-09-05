// Extends webapp/src/lib/modelReport.ts to include analysis results.
// This file supplements the existing design-focused report with analytical
// model description and linear static equilibrium results.
//
// New in Phase 1: AnalysisReport integration
// - Analytical model inventory (nodes, members, supports)
// - Load case enumeration
// - Linear static equilibrium (reactions, member forces)
// - Modal analysis summary (periods, frequencies, mass participation)
// - Analysis metadata (solver settings, convergence)

import type { AnalysisReport } from './analysisReport'

/**
 * Extended report payload that combines analysis and design results.
 * Bridges the gap between structural analysis and member design.
 */
export interface ModelReportWithAnalysis {
  // ── Existing design report data ──
  ok: boolean
  governing: string
  stats: Array<{ label: string; value: string; unit?: string }>
  checks: Array<{ name: string; detail: string; ratio: number | null; ok: boolean }>
  props: [string, string][]
  tables: Array<{ title: string; head: string[]; rows: string[][]; right?: number[] }>
  groups: Array<{ title: string; items: any[] }>

  // ── New: Analysis results (optional) ──
  analysis?: {
    /** Analytical model description (nodes, members, supports, constraints). */
    modelName: string
    nodeCount: number
    memberCount: number
    supportCount: number

    /** Load cases and combination factors (NSCP enumeration). */
    loadCases: Array<{ name: string; D?: number; L?: number; [key: string]: any }>

    /** Governing linear static equilibrium results. */
    equilibrium: {
      loadCase: string
      reactionCount: number
      maxReaction: number  // max force magnitude (kN)
      peakMemberMoment: number  // governing M (kN·m)
      peakMemberShear: number  // governing V (kN)
      peakMemberAxial: number  // governing N (kN)
    }

    /** Modal analysis summary (if available). */
    modal?: {
      totalMass: [number, number, number]
      modes: Array<{
        mode: number
        period: number
        frequency: number
        effMassRatioX: number
        effMassRatioY: number
        effMassRatioZ: number
      }>
      cumMassRatioX: number
      cumMassRatioY: number
      cumMassRatioZ: number
    }

    /** Solver settings and analysis metadata. */
    metadata: {
      pDelta: boolean
      pDeltaConverged?: boolean
      shearDeformation: boolean
      crackedSections: boolean
      rigidEndZones: boolean
      diaphragm: boolean
      seismicSystem?: string
    }
  }
}

/**
 * Extract and condense analysis report for PDF inclusion.
 * Pulls key metrics from AnalysisReport for compact display.
 */
export function condensedAnalysisSummary(report: AnalysisReport): ModelReportWithAnalysis['analysis'] {
  const eq = report.equilibrium
  const maxReaction = Math.max(
    ...eq.reactions.map((r) => Math.hypot(r.Fx, r.Fy, r.Fz)),
  )
  const peakMemberMoment = Math.max(
    ...eq.memberForces.map((m) => Math.max(Math.abs(m.Mzmax), Math.abs(m.Mzmin), Math.abs(m.Mymax), Math.abs(m.Mymin))),
  )
  const peakMemberShear = Math.max(...eq.memberForces.map((m) => Math.max(m.Vymax, m.Vzmax)))
  const peakMemberAxial = Math.max(...eq.memberForces.map((m) => Math.max(Math.abs(m.Nmax), Math.abs(m.Nmin))))

  return {
    modelName: report.modelName,
    nodeCount: report.nodes.length,
    memberCount: report.members.length,
    supportCount: report.nodes.filter((n) => n.support).length,

    loadCases: report.loadCases,

    equilibrium: {
      loadCase: eq.loadCase,
      reactionCount: eq.reactions.length,
      maxReaction,
      peakMemberMoment,
      peakMemberShear,
      peakMemberAxial,
    },

    ...(report.modal && {
      modal: {
        totalMass: report.modal.totalMass,
        modes: report.modal.modes.map((m) => ({
          mode: m.mode,
          period: m.period,
          frequency: m.frequency,
          effMassRatioX: m.effMassRatioX,
          effMassRatioY: m.effMassRatioY,
          effMassRatioZ: m.effMassRatioZ,
        })),
        cumMassRatioX: report.modal.cumRatioX,
        cumMassRatioY: report.modal.cumRatioY,
        cumMassRatioZ: report.modal.cumRatioZ,
      },
    }),

    metadata: {
      pDelta: report.metadata.pDelta,
      pDeltaConverged: report.metadata.pDeltaConverged,
      shearDeformation: report.metadata.shearDeformation,
      crackedSections: report.metadata.crackedSections,
      rigidEndZones: report.metadata.rigidEndZones,
      diaphragm: report.metadata.diaphragm,
      seismicSystem: report.metadata.seismicSystem,
    },
  }
}

/**
 * Useful for tests and type checking: ensures the condensed summary
 * can be round-tripped through JSON serialization.
 */
export function validateAnalysisSummary(summary: ModelReportWithAnalysis['analysis']): boolean {
  if (!summary) return true  // optional, so undefined/null is OK
  return (
    typeof summary.modelName === 'string' &&
    typeof summary.nodeCount === 'number' &&
    typeof summary.memberCount === 'number' &&
    Array.isArray(summary.loadCases) &&
    typeof summary.equilibrium === 'object' &&
    typeof summary.metadata === 'object'
  )
}
