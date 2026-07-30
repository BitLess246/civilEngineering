// ─────────────────────────────────────────────────────────────────────────
// Unconfined compressive strength. Layer 8. ASTM D2166.
//
//   qu = P / Ac     and, for a saturated cohesive soil,     cu ≈ qu / 2
//
// THE AREA CORRECTION IS NOT OPTIONAL. A specimen shortens as it is loaded and
// bulges to compensate, so the area carrying the load grows: Ac = A0/(1 − ε).
// At 15% axial strain — a routine failure strain for a soft clay — the
// corrected area is 18% larger than the initial one, so using A0 overstates qu
// by 18%. That error goes straight into cu and from there into a bearing
// capacity, and it always errs unconservatively.
//
// cu = qu/2 ASSUMES φ = 0. The total-stress Mohr circle through the origin is
// only a fair picture of a SATURATED COHESIVE soil sheared undrained. In a
// fissured clay, a partly saturated soil, or anything granular the assumption
// fails and cu comes out unconservative — so the caller states the soil and the
// module declines rather than dividing regardless.
//
// A UCS IS ALSO A LOWER BOUND ON THE IN-SITU SOIL. Sampling disturbance only
// ever weakens a specimen, so a low qu may be the sample rather than the ground.
//
// UNITS: dimensions mm; load N; stresses kPa; strain as a fraction.
// ─────────────────────────────────────────────────────────────────────────

export interface UcsData {
  /** Initial specimen diameter, mm. */
  diameter: number
  /** Initial specimen height, mm. */
  height: number
  /** Axial load at failure, N. */
  failureLoad: number
  /** Axial deformation at failure, mm. */
  failureDeformation: number
  /** Bulk unit weight of the specimen, kN/m³. Optional, for the record. */
  unitWeight?: number
}

export type UcsSoil = 'saturated-cohesive' | 'fissured' | 'partly-saturated' | 'granular'

export interface UcsResult {
  /** Initial cross-sectional area, mm². */
  initialArea: number
  /** Axial strain at failure, as a fraction. */
  strain: number
  /** Corrected area at failure, mm². */
  correctedArea: number
  /** Unconfined compressive strength, kPa. */
  qu: number
  /** qu computed on the INITIAL area — for comparison only. */
  quUncorrected: number
  /** Undrained shear strength, kPa. Undefined when the assumption does not hold. */
  cu?: number
  /** Why cu was not reported, when it was not. */
  cuDeclined?: string
  /** Descriptive consistency from qu (Terzaghi & Peck). */
  consistency: string
  notes: string[]
}

/** Consistency of a cohesive soil from qu, kPa (Terzaghi & Peck). */
export function consistencyFromQu(qu: number): string {
  if (qu < 25) return 'very soft'
  if (qu < 50) return 'soft'
  if (qu < 100) return 'medium stiff'
  if (qu < 200) return 'stiff'
  if (qu < 400) return 'very stiff'
  return 'hard'
}

export function ucs(d: UcsData, soil: UcsSoil = 'saturated-cohesive'): UcsResult {
  const notes: string[] = []

  if (!(d.diameter > 0) || !(d.height > 0)) {
    throw new Error('Specimen diameter and height must both be greater than zero.')
  }
  if (d.failureLoad < 0) throw new Error('Failure load must not be negative.')
  if (d.failureDeformation < 0) throw new Error('Failure deformation must not be negative.')
  if (d.failureDeformation >= d.height) {
    throw new Error('The axial deformation equals or exceeds the specimen height — check the units on the dial gauge.')
  }

  const initialArea = (Math.PI / 4) * d.diameter ** 2
  const strain = d.failureDeformation / d.height
  const correctedArea = initialArea / (1 - strain)

  // N / mm² = MPa; ×1000 → kPa.
  const qu = (d.failureLoad / correctedArea) * 1000
  const quUncorrected = (d.failureLoad / initialArea) * 1000

  const ratio = d.height / d.diameter
  if (ratio < 2 || ratio > 2.5) {
    notes.push(
      `Height/diameter is ${ratio.toFixed(2)}. D2166 asks for 2.0–2.5: a squatter specimen is restrained by the platens and reads high, a slenderer one can buckle.`,
    )
  }
  if (strain > 0.20) {
    notes.push(
      `Failure strain is ${(strain * 100).toFixed(1)}%. Beyond about 20% the specimen is barrelling rather than shearing, and the area correction stops describing it.`,
    )
  }
  if (strain > 0.05) {
    notes.push(
      `The area correction raised the area by ${(((correctedArea / initialArea) - 1) * 100).toFixed(1)}%, lowering qu from ${quUncorrected.toFixed(0)} to ${qu.toFixed(0)} kPa. Omitting it would overstate the strength.`,
    )
  }

  let cu: number | undefined
  let cuDeclined: string | undefined
  if (soil === 'saturated-cohesive') {
    cu = qu / 2
    notes.push('cu = qu/2 assumes φ = 0 — a saturated cohesive soil sheared undrained. A UCS is also a LOWER BOUND on the in-situ strength, since sampling disturbance only ever weakens a specimen.')
  } else {
    cuDeclined = {
      fissured: 'The specimen is fissured, so it fails on a discontinuity rather than through the matrix. qu/2 would overstate the operational strength.',
      'partly-saturated': 'The soil is partly saturated, so suction contributes to the measured strength and φ = 0 does not hold. qu/2 would be unconservative.',
      granular: 'A granular soil has no unconfined strength to speak of, and φ = 0 does not apply. Use a triaxial or direct shear test.',
    }[soil]
    notes.push(cuDeclined)
  }

  return {
    initialArea, strain, correctedArea, qu, quUncorrected,
    cu, cuDeclined, consistency: consistencyFromQu(qu), notes,
  }
}
