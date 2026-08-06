// ─────────────────────────────────────────────────────────────────────────
// One-dimensional swell or collapse. Layer 8. ASTM D4546.
//
// A confined specimen is inundated and its height change measured. The result
// is a signed strain and the stress it was measured at, and both halves matter.
//
// THE SIGN IS THE RESULT, NOT A DETAIL. The same apparatus and the same
// procedure measure two opposite behaviours: an expansive clay takes on water
// and SWELLS, while a loose or lightly-compacted soil — loess, a fill placed
// dry of optimum — loses the suction holding its fabric open and COLLAPSES on
// wetting. Reporting a magnitude without its sign describes neither. This
// module keeps the sign all the way through and names the behaviour in words.
//
// A PERCENT SWELL WITHOUT ITS STRESS IS MEANINGLESS. The same specimen swells
// several times more under a 1 kPa seating load than under 50 kPa, because the
// surcharge is doing the work the swelling pressure has to overcome. So the
// inundation stress travels with the number, always, and D4546's three methods
// differ mainly in what that stress is:
//
//   A  wetted at a token seating pressure     → free swell, the largest figure
//   B  wetted at the estimated in-situ stress → what the ground will actually do
//   C  height held constant while wetted      → swelling pressure, measured
//
// SWELL PRESSURE IS METHOD-DEPENDENT AND THE TWO ROUTES DISAGREE. Method C
// measures it directly. Methods A and B infer it by re-loading the swollen
// specimen until it returns to its original height, which travels a different
// stress path and typically reports a HIGHER value. Quoting one number without
// the method is quoting an unknown quantity, so the method is carried on the
// result and stated in the notes.
//
// UNITS: heights mm; stresses kPa; strains % (positive = swell).
// ─────────────────────────────────────────────────────────────────────────

export type SwellMethod = 'A' | 'B' | 'C'

/** One point on the re-loading curve after the specimen has swollen. */
export interface SwellPoint {
  /** Applied vertical stress, kPa. */
  stress: number
  /** Specimen height at equilibrium under that stress, mm. */
  height: number
}

export interface SwellData {
  method: SwellMethod
  /** Height before inundation, mm. */
  initialHeight: number
  /** Vertical stress at which water was admitted, kPa. */
  inundationStress: number
  /**
   * Height at equilibrium after wetting, mm. Larger than the initial height for
   * a swelling soil, SMALLER for a collapsing one. Not used by method C, where
   * the height is held.
   */
  wettedHeight?: number
  /**
   * Method C only: the stress required to hold the height constant, kPa —
   * the swelling pressure, measured rather than inferred.
   */
  constantVolumePressure?: number
  /** Re-loading curve after swelling (methods A and B), for the inferred σs. */
  points?: SwellPoint[]
}

export interface SwellResult {
  method: SwellMethod
  /** Signed strain on wetting, %: positive swell, negative collapse. */
  strain: number
  /** 'swell' | 'collapse' | 'negligible' — the behaviour in a word. */
  behaviour: 'swell' | 'collapse' | 'negligible'
  /** The stress the strain was measured at, kPa — inseparable from it. */
  inundationStress: number
  /** Swelling pressure, kPa, when the test can give one. */
  swellPressure?: number
  /** How that pressure was obtained. */
  swellPressureFrom?: 'constant-volume' | 'reload-to-original-height'
  /** Re-loading rows, when supplied: stress and the strain still remaining. */
  rows?: { stress: number; height: number; strain: number }[]
  notes: string[]
}

/** Strain, %, of a height change against the original. Signed. */
export const swellStrain = (h0: number, h: number): number => {
  if (!(h0 > 0)) throw new Error('The initial specimen height must be greater than zero.')
  return ((h - h0) / h0) * 100
}

/**
 * The stress at which the re-loading curve brings the specimen back to its
 * original height — the INFERRED swelling pressure.
 *
 * Interpolated on log stress, as every other stress-vs-height reading in this
 * module is, because the curve is a straight line there and not on a linear
 * axis. Returns undefined when the loading never recompresses the specimen that
 * far: the honest answer is then "σs is greater than the largest stress
 * applied", which the caller reports rather than extrapolating to it.
 */
export function reloadPressure(h0: number, points: SwellPoint[]): number | undefined {
  const pts = [...points].filter((p) => p.stress > 0 && p.height > 0).sort((a, b) => a.stress - b.stress)
  for (let i = 1; i < pts.length; i++) {
    const lo = pts[i - 1], hi = pts[i]
    // the crossing where height passes through h0
    if ((lo.height - h0) * (hi.height - h0) <= 0 && lo.height !== hi.height) {
      const t = (h0 - lo.height) / (hi.height - lo.height)
      return Math.pow(10, Math.log10(lo.stress) + t * (Math.log10(hi.stress) - Math.log10(lo.stress)))
    }
  }
  return undefined
}

export function swell(d: SwellData): SwellResult {
  const notes: string[] = []
  if (!(d.initialHeight > 0)) throw new Error('The initial specimen height must be greater than zero.')
  if (d.inundationStress < 0) throw new Error('The inundation stress cannot be negative.')

  let strain = 0
  let swellPressure: number | undefined
  let swellPressureFrom: SwellResult['swellPressureFrom']

  if (d.method === 'C') {
    // Height held: the strain is zero by construction and the pressure IS the
    // measurement. Reporting "0% swell" here would be true and useless, so the
    // note says what the zero means.
    if (!(d.constantVolumePressure != null && d.constantVolumePressure >= 0)) {
      throw new Error('Method C measures the pressure needed to hold the height constant — that pressure is required.')
    }
    swellPressure = d.constantVolumePressure
    swellPressureFrom = 'constant-volume'
    notes.push(
      'Method C holds the height constant, so the strain is zero BY CONSTRUCTION and carries no information — the measurement is the pressure required to hold it.',
    )
  } else {
    if (d.wettedHeight == null) {
      throw new Error('Methods A and B need the height after wetting; without it there is no strain to report.')
    }
    if (!(d.wettedHeight > 0)) throw new Error('The wetted height must be greater than zero.')
    strain = swellStrain(d.initialHeight, d.wettedHeight)
    if (d.points?.length) {
      swellPressure = reloadPressure(d.initialHeight, d.points)
      swellPressureFrom = swellPressure != null ? 'reload-to-original-height' : undefined
      if (swellPressure == null) {
        const maxStress = Math.max(...d.points.map((p) => p.stress))
        notes.push(
          `Re-loading to ${maxStress.toFixed(0)} kPa never brought the specimen back to its original height, so the swelling pressure is GREATER than that and is not reported. Extrapolating the curve past the last point would invent it.`,
        )
      }
    }
  }

  const behaviour: SwellResult['behaviour'] =
    strain > 0.1 ? 'swell' : strain < -0.1 ? 'collapse' : 'negligible'

  const rows = d.points?.length
    ? [...d.points].sort((a, b) => a.stress - b.stress).map((p) => ({
        stress: p.stress, height: p.height, strain: swellStrain(d.initialHeight, p.height),
      }))
    : undefined

  // ── What the number does and does not say ──
  if (behaviour === 'collapse') {
    notes.push(
      `The specimen COLLAPSED on wetting: ${Math.abs(strain).toFixed(2)}% of its height, downward. This is the opposite behaviour to swelling and the same test measures both — a loose or dry-of-optimum fabric loses the suction holding it open the moment water arrives. A foundation on this soil settles when the ground gets wet; it does not heave.`,
    )
  } else if (behaviour === 'swell') {
    notes.push(
      `The specimen SWELLED ${strain.toFixed(2)}% under ${d.inundationStress.toFixed(1)} kPa. That percentage belongs to that stress and to no other: the same soil swells several times more at a seating load than under a real surcharge, because the surcharge does the work the swelling pressure must overcome.`,
    )
  } else if (d.method !== 'C') {
    notes.push(
      `The height barely moved (${strain.toFixed(3)}%). At ${d.inundationStress.toFixed(1)} kPa this soil is neither expansive nor collapsible — but a specimen wetted under a heavy surcharge can read flat while the same soil at a seating load does not, so the stress is part of the answer.`,
    )
  }

  if (d.method === 'A') {
    notes.push(
      'Method A wets at a token seating pressure, which gives FREE swell — the largest figure this soil can produce and an upper bound rather than a prediction. What a footing will see is method B, at the stress the ground will actually carry.',
    )
  } else if (d.method === 'B') {
    notes.push(
      'Method B wets at the estimated in-situ vertical stress, so the strain is what that depth would do if it got wet — provided the estimate was right. A stress guessed too high reports too little swell.',
    )
  }

  if (swellPressureFrom === 'reload-to-original-height') {
    notes.push(
      `Swelling pressure ${swellPressure!.toFixed(0)} kPa, INFERRED by re-loading the swollen specimen back to its original height. That is a different stress path from method C's constant-volume measurement and usually reports a higher value, so quote the method with the number.`,
    )
  }

  if (d.method !== 'C' && !d.points?.length) {
    notes.push('No re-loading curve, so no swelling pressure — the strain on wetting is the whole result. Method C measures the pressure directly if that is the number needed.')
  }

  notes.push(
    'Swell and collapse are properties of a FABRIC as much as a mineralogy: a remoulded or disturbed specimen does not answer for the ground it came from, and a compacted fill answers only for the density and water content it was compacted at.',
  )

  return {
    method: d.method,
    strain,
    behaviour,
    inundationStress: d.inundationStress,
    swellPressure,
    swellPressureFrom,
    rows,
    notes,
  }
}
