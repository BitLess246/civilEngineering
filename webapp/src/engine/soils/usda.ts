// ─────────────────────────────────────────────────────────────────────────
// USDA soil texture. Layer 8. USDA Soil Survey Manual (NRCS) textural triangle.
//
// The third classification this module speaks, and the one that answers a
// different question from the other two. USCS and AASHTO are ENGINEERING
// systems: they sort a soil by how it will behave under a load or a pavement,
// and both lean on plasticity to do it. USDA is an AGRONOMIC system: it sorts
// by what the grains ARE, purely by size, into the twelve textures a soil
// scientist names — sandy loam, silty clay, and so on. It says nothing about
// bearing capacity and is not a substitute for either engineering system; it is
// what agricultural, drainage, erosion and land-capability work is written in.
//
// THE SIZE BOUNDARIES ARE NOT THE SAME, AND THAT IS THE WHOLE DIFFICULTY:
//
//                    gravel      sand              silt            clay
//   USDA            > 2.0 mm    0.05–2.0        0.002–0.05       < 0.002
//   AASHTO          > 2.0 mm    0.075–2.0       0.002–0.075      < 0.002
//   USCS            > 4.75 mm   0.075–4.75      ── "fines", split by PLASTICITY ──
//
// So a USCS "sand" and a USDA "sand" are different populations, and the fines a
// USCS classification calls silt or clay are decided by an Atterberg test
// rather than by size at all. Quoting one system's fraction inside another's
// name is the error this module refuses to make.
//
// A SIEVE ALONE CANNOT PRODUCE A USDA TEXTURE. The triangle needs the split at
// 0.002 mm, which is two orders of magnitude below the finest practical sieve
// (0.075 mm). That number comes from a sedimentation test — the hydrometer —
// and without one this module declines to classify rather than guessing where
// the silt ends. That is also why the hydrometer earns its place: it is not a
// refinement of the sieve curve, it is the only route to a clay fraction.
//
// PERCENTAGES ARE OF THE FINE EARTH. USDA reports sand, silt and clay as
// percentages of the < 2 mm fraction, with anything coarser named separately as
// a modifier ("gravelly sandy loam"). A texture computed on the whole sample
// instead is wrong by exactly the gravel content.
//
// UNITS: sizes mm; percentages 0–100.
// ─────────────────────────────────────────────────────────────────────────

import { type LabNote, info, warn } from './notes'

/** The twelve textures of the USDA triangle. */
export type UsdaTexture =
  | 'sand' | 'loamy sand' | 'sandy loam' | 'loam' | 'silt loam' | 'silt'
  | 'sandy clay loam' | 'clay loam' | 'silty clay loam'
  | 'sandy clay' | 'silty clay' | 'clay'

/** Sand, silt and clay as percentages of the FINE EARTH (< 2 mm). */
export interface UsdaComposition {
  sand: number
  silt: number
  clay: number
}

export interface UsdaResult {
  texture: UsdaTexture
  /** With the gravel modifier applied, e.g. 'gravelly sandy loam'. */
  name: string
  composition: UsdaComposition
  /** Gravel (> 2 mm) as a percentage of the WHOLE sample; it is not in the triangle. */
  gravel: number
  /** Why this texture and not its neighbours. */
  reason: string
  notes: LabNote[]
}

/** USDA size boundaries, mm — named because they differ from every other system. */
export const USDA_SIZES = { gravel: 2.0, sand: 0.05, clay: 0.002 } as const

/**
 * Gravel modifier on a texture name (Soil Survey Manual): 15–35% of the whole
 * sample is "gravelly", 35–60% "very gravelly". Below 15% the coarse fraction
 * does not change the name.
 */
function gravelModifier(gravel: number): string {
  if (gravel >= 60) return 'extremely gravelly '
  if (gravel >= 35) return 'very gravelly '
  if (gravel >= 15) return 'gravelly '
  return ''
}

/**
 * The textural triangle.
 *
 * The classes are tested in order from the clay corner outward, because the
 * regions overlap at their edges and the triangle is defined by which boundary
 * you meet first. Written as the Soil Survey Manual states them rather than as
 * a nearest-centroid lookup, so a point on a boundary lands where the manual
 * says it does.
 */
export function classifyUSDA(c: UsdaComposition): UsdaResult {
  const notes: LabNote[] = []
  const total = c.sand + c.silt + c.clay
  if (!(total > 0)) throw new Error('Sand, silt and clay must sum to more than zero.')
  if (Math.abs(total - 100) > 1) {
    notes.push(warn(
      `The three fractions sum to ${total.toFixed(1)}% rather than 100%; they have been normalised. A gap this size usually means the gravel was left in, or the hydrometer and sieve were read on different bases.`,
    ))
  }
  // Normalise so a caller that passes fractions of the whole sample still lands
  // in the right region rather than off the triangle entirely.
  const sand = (c.sand / total) * 100
  const silt = (c.silt / total) * 100
  const clay = (c.clay / total) * 100
  const comp = { sand, silt, clay }

  const of = (texture: UsdaTexture, reason: string): UsdaResult =>
    ({ texture, name: texture, composition: comp, gravel: 0, reason, notes })

  // ── the clay corner ──
  if (clay >= 40 && silt < 40 && sand <= 45) {
    return of('clay', `clay ${clay.toFixed(0)}% ≥ 40 with sand ≤ 45 and silt < 40`)
  }
  if (clay >= 40 && silt >= 40) {
    return of('silty clay', `clay ${clay.toFixed(0)}% ≥ 40 alongside silt ${silt.toFixed(0)}% ≥ 40`)
  }
  if (clay >= 35 && sand > 45) {
    return of('sandy clay', `clay ${clay.toFixed(0)}% ≥ 35 with sand ${sand.toFixed(0)}% > 45`)
  }
  // ── the loam band ──
  if (clay >= 27 && clay < 40 && sand > 20 && sand <= 45) {
    return of('clay loam', `clay ${clay.toFixed(0)}% between 27 and 40 with sand ${sand.toFixed(0)}% between 20 and 45`)
  }
  if (clay >= 27 && clay < 40 && sand <= 20) {
    return of('silty clay loam', `clay ${clay.toFixed(0)}% between 27 and 40 with sand ${sand.toFixed(0)}% ≤ 20`)
  }
  if (clay >= 20 && clay < 35 && silt < 28 && sand > 45) {
    return of('sandy clay loam', `clay ${clay.toFixed(0)}% between 20 and 35 with silt < 28 and sand > 45`)
  }
  // ── the silt side ──
  if (silt >= 80 && clay < 12) {
    return of('silt', `silt ${silt.toFixed(0)}% ≥ 80 with clay < 12`)
  }
  if ((silt >= 50 && clay >= 12 && clay < 27) || (silt >= 50 && silt < 80 && clay < 12)) {
    return of('silt loam', `silt ${silt.toFixed(0)}% ≥ 50 with clay ${clay.toFixed(0)}% below 27`)
  }
  if (clay >= 7 && clay < 27 && silt >= 28 && silt < 50 && sand <= 52) {
    return of('loam', `clay ${clay.toFixed(0)}%, silt ${silt.toFixed(0)}% and sand ${sand.toFixed(0)}% all inside the loam block`)
  }
  // ── the sand side, where the two sloping boundaries decide it ──
  if (silt + 1.5 * clay < 15) {
    return of('sand', `silt + 1.5·clay = ${(silt + 1.5 * clay).toFixed(0)} < 15`)
  }
  if (silt + 2 * clay < 30) {
    return of('loamy sand', `silt + 1.5·clay ≥ 15 but silt + 2·clay = ${(silt + 2 * clay).toFixed(0)} < 30`)
  }
  return of('sandy loam', `silt + 2·clay = ${(silt + 2 * clay).toFixed(0)} ≥ 30 with clay ${clay.toFixed(0)}% below 20`)
}

/**
 * USDA fractions from a grading curve.
 *
 * Takes percent PASSING at the three USDA boundaries, on the whole-sample
 * basis, and returns the triangle's composition (of the fine earth) plus the
 * gravel that was set aside.
 *
 * Returns undefined when the 0.002 mm value is absent — see the module header:
 * no sedimentation test, no clay fraction, no texture.
 */
export function usdaFractions(passing: {
  /** % passing 2.0 mm. */
  gravelBoundary: number
  /** % passing 0.05 mm. */
  sandBoundary: number
  /** % passing 0.002 mm, from a hydrometer. */
  clayBoundary?: number
}): { composition: UsdaComposition; gravel: number } | undefined {
  const { gravelBoundary: p2, sandBoundary: p05, clayBoundary: p002 } = passing
  if (p002 == null || !Number.isFinite(p002)) return undefined
  if (!(p2 > 0)) return undefined

  const gravel = 100 - p2
  const clay = p002
  const silt = p05 - p002
  const sand = p2 - p05
  if (silt < -0.5 || sand < -0.5) return undefined     // a curve that goes backwards

  // Renormalise onto the fine earth: the triangle knows nothing about gravel.
  const fine = Math.max(p2, 1e-9)
  return {
    gravel,
    composition: {
      sand: (Math.max(sand, 0) / fine) * 100,
      silt: (Math.max(silt, 0) / fine) * 100,
      clay: (Math.max(clay, 0) / fine) * 100,
    },
  }
}

/** Classify straight from the boundaries, with the gravel modifier applied. */
export function usdaFromPassing(passing: Parameters<typeof usdaFractions>[0]): UsdaResult | undefined {
  const f = usdaFractions(passing)
  if (!f) return undefined
  const r = classifyUSDA(f.composition)
  const prefix = gravelModifier(f.gravel)
  if (prefix) {
    r.notes.push(info(
      `${f.gravel.toFixed(0)}% of the whole sample is coarser than 2 mm. USDA keeps that out of the triangle and names it as a modifier, so the texture describes the fine earth only.`,
    ))
  }
  return { ...r, gravel: f.gravel, name: prefix + r.texture }
}
