// ─────────────────────────────────────────────────────────────────────────
// Vertical stress in a layered profile. Layer 8.
//
// Total stress is the weight of everything above; pore pressure is the head of
// water above; effective stress is the difference, and it is the one that
// governs strength, compressibility and the SPT overburden correction.
//
// SUBMERGED SOIL USES ITS SATURATED UNIT WEIGHT, NOT ITS BULK ONE. A layer
// below the water table weighs more (it is full of water) but pushes less (that
// water carries part of the load). Using the moist γ below the table
// double-counts the buoyancy and reads σ′ high, which flows straight into an
// unconservative (N₁)₆₀ and from there into an unconservative friction angle.
//
// This module takes unit weights EXPLICITLY rather than reading them from the
// parameter engine, so it stays usable before parameters have been interpreted
// and so its tests do not depend on that layer.
//
// UNITS: depth m; unit weight kN/m³; stress kPa.
// ─────────────────────────────────────────────────────────────────────────

/** Unit weight of water, kN/m³. */
export const GAMMA_W = 9.81

/** One stratum for a stress profile. */
export interface StressLayer {
  /** Thickness, m. */
  thickness: number
  /** Moist/bulk unit weight above the water table, kN/m³. */
  gamma: number
  /** Saturated unit weight below the water table, kN/m³. Falls back to gamma. */
  gammaSat?: number
}

export interface StressAtDepth {
  depth: number
  /** Total vertical stress, kPa. */
  total: number
  /** Pore water pressure, kPa. */
  pore: number
  /** Effective vertical stress σ′v0 = total − pore, kPa. */
  effective: number
  notes: string[]
}

/**
 * Vertical stress at a depth in a layered profile.
 *
 * `waterTable` is the depth to the water table, m below ground; omit it (or
 * pass Infinity) for a dry profile. A layer straddling the table is integrated
 * in two parts, moist above and saturated below, rather than taking whichever
 * unit weight happens to apply at its midpoint.
 */
export function verticalStress(
  layers: StressLayer[], depth: number, waterTable = Infinity,
): StressAtDepth {
  const notes: string[] = []
  if (depth < 0) throw new Error('Depth must not be negative.')

  let total = 0
  let z = 0        // running depth at the top of the current layer
  let remaining = depth

  for (const l of layers) {
    if (remaining <= 0) break
    const slice = Math.min(l.thickness, remaining)
    const sat = l.gammaSat ?? l.gamma
    if (l.gammaSat == null && z + slice > waterTable) {
      notes.push(
        `A submerged layer has no saturated unit weight, so its moist γ = ${l.gamma} kN/m³ was used. Effective stress will read low.`,
      )
    }

    // Split the slice at the water table when it straddles it.
    const dryPart = Math.max(Math.min(slice, waterTable - z), 0)
    const wetPart = slice - dryPart
    total += dryPart * l.gamma + wetPart * sat

    z += slice
    remaining -= slice
  }

  if (remaining > 1e-9) {
    notes.push(
      `The profile is ${(depth - remaining).toFixed(2)} m deep but the stress was asked for at ${depth.toFixed(2)} m — the stress below the logged profile is not computed.`,
    )
  }

  const pore = Math.max(depth - waterTable, 0) * GAMMA_W
  const effective = total - pore
  return { depth, total, pore, effective, notes }
}

/** Effective vertical stress only — the common case. */
export const effectiveStressAt = (
  layers: StressLayer[], depth: number, waterTable = Infinity,
): number => verticalStress(layers, depth, waterTable).effective

/**
 * Buoyant (submerged) unit weight γ′ = γsat − γw. The weight a submerged soil
 * actually contributes to effective stress.
 */
export const buoyantUnitWeight = (gammaSat: number): number => gammaSat - GAMMA_W
