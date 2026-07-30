// ─────────────────────────────────────────────────────────────────────────
// Whole-borehole SPT profile: every test corrected, in depth order. Layer 8.
//
// `spt.ts` corrects one test. This walks a hole, computes the effective stress
// at each test depth from the supplied unit weights, and returns the corrected
// profile the log plot and the parameter engine both read.
//
// Unit weights come in EXPLICITLY, keyed by layer id. They are an
// interpretation — usually correlated from the very blow counts being corrected
// — so the caller owns that judgement and this module stays a pure
// transformation. Where a layer has no unit weight the profile says so instead
// of substituting a default, because a wrong γ moves σ′v0, which moves C_N,
// which moves (N₁)₆₀, which moves φ′.
//
// UNITS: depth m; unit weight kN/m³; stress kPa.
// ─────────────────────────────────────────────────────────────────────────

import type { Borehole } from './model'
import { layerThickness } from './model'
import { sptCorrections, type SptCorrections } from './spt'
import { verticalStress, type StressLayer } from './overburden'

/** Unit weights for one layer, kN/m³. */
export interface LayerUnitWeight {
  gamma: number
  gammaSat?: number
}

export interface SptProfileRow extends SptCorrections {
  testId: string
  depth: number
  /** Effective vertical stress at the test depth, kPa. Undefined when unknown. */
  effectiveStress?: number
  /** Layer the test falls in, when the profile covers that depth. */
  layerId?: string
  layerName?: string
}

export interface SptProfile {
  rows: SptProfileRow[]
  /** Layers with no unit weight supplied — every stress below them is unknown. */
  missingUnitWeights: string[]
  notes: string[]
}

/**
 * Correct every SPT in a hole.
 *
 * `unitWeights` is keyed by layer id. When any layer above a test lacks a unit
 * weight, that test's effective stress and (N₁)₆₀ come back undefined rather
 * than guessed — N₆₀ is still reported, since it needs no stress.
 */
export function sptProfile(
  bh: Borehole, unitWeights: Record<string, LayerUnitWeight>,
): SptProfile {
  const notes: string[] = []
  const ordered = [...bh.layers].sort((a, b) => a.depthTop - b.depthTop)

  const missingUnitWeights = ordered
    .filter((l) => unitWeights[l.id] == null)
    .map((l) => l.name)

  // Depth above which every layer has a unit weight; below it, stress is unknown.
  let knownTo = 0
  for (const l of ordered) {
    if (unitWeights[l.id] == null) break
    knownTo = l.depthBottom
  }

  const stressLayers: StressLayer[] = []
  for (const l of ordered) {
    const uw = unitWeights[l.id]
    if (uw == null) break
    stressLayers.push({ thickness: layerThickness(l), gamma: uw.gamma, gammaSat: uw.gammaSat })
  }

  if (missingUnitWeights.length) {
    notes.push(
      `No unit weight for ${missingUnitWeights.join(', ')}. Effective stress — and therefore (N₁)₆₀ — is not computed below ${knownTo.toFixed(2)} m.`,
    )
  }

  const rows: SptProfileRow[] = [...bh.spt]
    .sort((a, b) => a.depth - b.depth)
    .map((t) => {
      const layer = ordered.find((l) => t.depth >= l.depthTop && t.depth < l.depthBottom)
      const canStress = t.depth <= knownTo + 1e-9
      const effectiveStress = canStress
        ? verticalStress(stressLayers, t.depth, bh.groundwaterDepth ?? Infinity).effective
        : undefined

      const corrections = sptCorrections({
        test: t,
        boreholeDiameter: bh.diameter,
        effectiveStress,
      })

      return {
        ...corrections,
        testId: t.id,
        depth: t.depth,
        effectiveStress,
        layerId: layer?.id,
        layerName: layer?.name,
      }
    })

  const refusals = rows.filter((r) => r.refusal).length
  if (refusals) {
    notes.push(`${refusals} of ${rows.length} tests hit refusal — those blow counts are lower bounds.`)
  }
  if (bh.groundwaterDepth == null && rows.some((r) => r.effectiveStress != null)) {
    notes.push('No groundwater depth recorded, so the profile is treated as dry. Effective stress reads high if it is not.')
  }

  return { rows, missingUnitWeights, notes }
}
