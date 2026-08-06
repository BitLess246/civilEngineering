// ─────────────────────────────────────────────────────────────────────────
// Hydrometer sedimentation. Layer 8. ASTM D7928 (D422 for the classic method).
//
// Below the 0.075 mm sieve, grains are sized by how fast they fall through
// water. Stokes' law gives the diameter of a sphere that settles the effective
// depth L in time t, and the hydrometer reading gives how much solid is still
// in suspension above that depth — one point on the grading curve per reading.
//
//     D = sqrt( 18 η L / ((Gs − 1) ρw g t) )        Stokes
//     P = (a · Rc / Ms) × 100                       percent finer
//
// WHAT THIS TEST ACTUALLY MEASURES IS A SETTLING VELOCITY. Every grain is
// reported as the sphere that would fall at the speed it fell. A clay platelet
// is not a sphere and does not settle like one, so "D = 0.002 mm" here means
// "settles like a 0.002 mm sphere" — the equivalent diameter, which is the only
// thing the method can give and is worth saying out loud once.
//
// THREE CORRECTIONS, AND THEY ARE NOT OPTIONAL.
//   • the composite correction (dispersant + meniscus + temperature), read on a
//     control cylinder of the same dispersant solution, subtracted from every
//     reading. On a 152H hydrometer it is commonly 5–7 g/L against readings of
//     10–50, so skipping it moves the whole curve by a tenth of the sample.
//   • the meniscus correction alone, ADDED back for the effective depth: the
//     scale is read at the top of the meniscus but the suspension surface is at
//     the bottom of it.
//   • the specific-gravity factor a, which is 1.00 only at Gs = 2.65.
// A reading with no correction supplied is refused rather than assumed.
//
// UNITS: reading g/L; depth cm; time min; temperature °C; diameter mm;
// percentages 0–100.
// ─────────────────────────────────────────────────────────────────────────

/** One reading: elapsed time, hydrometer scale, temperature. */
export interface HydrometerReading {
  /** Elapsed time from the start of sedimentation, minutes. */
  time: number
  /** Hydrometer reading at the top of the meniscus, g/L. */
  reading: number
  /** Suspension temperature at the reading, °C. */
  temperature: number
}

export interface HydrometerData {
  /** Oven-dry mass of soil in the suspension, g. */
  dryMass: number
  /** Specific gravity of the solids. */
  specificGravity: number
  /**
   * Composite correction read on the control cylinder, g/L — dispersant,
   * meniscus and temperature together. Subtracted from every reading.
   */
  compositeCorrection: number
  /** Meniscus correction alone, g/L, added back for the effective depth. */
  meniscusCorrection: number
  /**
   * What fraction of the WHOLE sample this suspension represents, %. A
   * hydrometer run on the minus-No.200 fraction alone reports percentages of
   * that fraction; scaling by the fines content puts them back on the same
   * basis as the sieve curve. Absent ⇒ 100 (the whole sample was suspended).
   */
  fractionOfTotal?: number
  readings: HydrometerReading[]
}

export interface HydrometerRow {
  time: number
  reading: number
  temperature: number
  /** Reading after the composite correction, g/L. */
  correctedReading: number
  /** Effective depth of the centre of buoyancy, cm. */
  effectiveDepth: number
  /** Equivalent spherical diameter, mm. */
  diameter: number
  /** Percent of the suspended specimen finer than that diameter, %. */
  percentFinerOfSpecimen: number
  /** The same, as a percentage of the whole sample. */
  percentFiner: number
}

export interface HydrometerResult {
  rows: HydrometerRow[]
  /** Specific-gravity correction factor a. 1.00 at Gs = 2.65. */
  gravityFactor: number
  /** D50 by interpolation on the log-size curve, mm. Undefined outside range. */
  d50?: number
  /** Clay fraction, % of the whole sample finer than 0.002 mm. */
  clayFraction?: number
  notes: string[]
}

/** Dynamic viscosity of water, poise (dyne·s/cm²), from the Vogel equation. */
export function waterViscosity(tempC: number): number {
  if (!(tempC > 0)) throw new Error('Suspension temperature must be above 0 °C.')
  // μ [Pa·s] = 2.414e-5 · 10^(247.8/(T[K] − 140)); 1 Pa·s = 10 poise.
  return 10 * 2.414e-5 * Math.pow(10, 247.8 / (tempC + 273.15 - 140))
}

/**
 * Specific-gravity correction factor for the percent-finer equation.
 *
 *     a = 1.65 Gs / ((Gs − 1) · 2.65)
 *
 * Unity at Gs = 2.65, which is what the hydrometer scale is graduated for.
 */
export function gravityFactor(gs: number): number {
  if (!(gs > 1)) throw new Error('Specific gravity must be greater than 1.')
  return (1.65 * gs) / ((gs - 1) * 2.65)
}

/**
 * Effective depth of the ASTM 152H hydrometer, cm, from the meniscus-corrected
 * reading: the standard linear fit L = 16.3 − 0.1641·R over its 0–60 g/L scale.
 *
 * This is apparatus geometry, not soil behaviour — a different hydrometer has a
 * different pair of constants, which is why they are named rather than inlined.
 */
export const H152 = { intercept: 16.3, slope: 0.1641 } as const

export const effectiveDepth = (readingCorrectedForMeniscus: number): number =>
  H152.intercept - H152.slope * readingCorrectedForMeniscus

/**
 * Equivalent spherical diameter from Stokes' law, mm.
 *
 *   D[cm] = sqrt( 18 μ L / ((Gs − 1) · ρw · g · t) ) with μ in poise, L in cm,
 *   t in seconds; ρw·g is taken as 980 dyne/cm³ (ρw = 1 g/cm³).
 */
export function stokesDiameter(L: number, timeMin: number, gs: number, tempC: number): number {
  if (!(timeMin > 0)) throw new Error('Elapsed time must be greater than zero.')
  if (!(L > 0)) throw new Error('The effective depth must be greater than zero.')
  const mu = waterViscosity(tempC)
  const cm = Math.sqrt((18 * mu * L) / ((gs - 1) * 980 * timeMin * 60))
  return cm * 10
}

export function hydrometer(d: HydrometerData): HydrometerResult {
  const notes: string[] = []
  if (!(d.dryMass > 0)) throw new Error('The dry mass of soil in suspension must be greater than zero.')
  const a = gravityFactor(d.specificGravity)
  const scale = (d.fractionOfTotal ?? 100) / 100
  if (!(scale > 0 && scale <= 1)) {
    throw new Error('The fraction of the whole sample must be between 0 and 100%.')
  }

  const readings = [...d.readings]
    .filter((r) => Number.isFinite(r.time) && Number.isFinite(r.reading) && Number.isFinite(r.temperature))
    .sort((x, y) => x.time - y.time)

  if (readings.length < 2) throw new Error('A hydrometer test needs at least two readings.')

  const rows: HydrometerRow[] = readings.map((r) => {
    const correctedReading = r.reading - d.compositeCorrection
    const L = effectiveDepth(r.reading + d.meniscusCorrection)
    const diameter = stokesDiameter(L, r.time, d.specificGravity, r.temperature)
    const pSpec = ((a * correctedReading) / d.dryMass) * 100
    return {
      time: r.time,
      reading: r.reading,
      temperature: r.temperature,
      correctedReading,
      effectiveDepth: L,
      diameter,
      percentFinerOfSpecimen: pSpec,
      percentFiner: pSpec * scale,
    }
  })

  // ── What the numbers can and cannot be ──
  const negative = rows.filter((r) => r.correctedReading <= 0)
  if (negative.length) {
    notes.push(
      `${negative.length} reading(s) fall at or below the composite correction of ${d.compositeCorrection} g/L, which puts no solid in suspension above the bulb. Either sedimentation was complete or the correction is wrong — read it again on the control cylinder before using this curve.`,
    )
  }
  const over = rows.filter((r) => r.percentFinerOfSpecimen > 100.5)
  if (over.length) {
    notes.push(
      `A reading gives ${Math.max(...over.map((r) => r.percentFinerOfSpecimen)).toFixed(0)}% finer, which is more soil than was put in the cylinder. Check the dry mass and the composite correction — those two set the whole curve's height.`,
    )
  }
  if (rows.some((r, i) => i > 0 && r.percentFiner > rows[i - 1].percentFiner + 1e-9)) {
    notes.push(
      'The percent finer RISES between two readings. Sedimentation only removes particles from suspension, so the curve cannot climb — a reading was taken at the wrong time, or the suspension was disturbed.',
    )
  }
  const temps = rows.map((r) => r.temperature)
  if (Math.max(...temps) - Math.min(...temps) > 2) {
    notes.push(
      `The suspension moved ${(Math.max(...temps) - Math.min(...temps)).toFixed(1)} °C during the run. Viscosity, and therefore every diameter, follows it — D7928 asks for a bath held within about 1 °C.`,
    )
  }
  if (d.fractionOfTotal != null && d.fractionOfTotal < 100) {
    notes.push(
      `Percentages are scaled to ${d.fractionOfTotal}% of the whole sample — the fines this suspension was taken from — so they sit on the same basis as the sieve curve and the two join at 0.075 mm.`,
    )
  }
  notes.push(
    'Every diameter is an EQUIVALENT SPHERICAL diameter: the size of a sphere that would settle at the speed this fraction settled. Clay platelets are not spheres, so the fine end of this curve describes settling behaviour rather than a measured dimension.',
  )

  // D50 and the clay fraction, by interpolation on the log-size curve.
  const asc = [...rows].sort((x, y) => x.diameter - y.diameter)
  const interpAt = (p: number): number | undefined => {
    for (let i = 1; i < asc.length; i++) {
      const lo = asc[i - 1], hi = asc[i]
      if ((lo.percentFiner - p) * (hi.percentFiner - p) <= 0 && lo.percentFiner !== hi.percentFiner) {
        const t = (p - lo.percentFiner) / (hi.percentFiner - lo.percentFiner)
        return Math.pow(10, Math.log10(lo.diameter) + t * (Math.log10(hi.diameter) - Math.log10(lo.diameter)))
      }
    }
    return undefined
  }
  const percentFinerThan = (size: number): number | undefined => {
    for (let i = 1; i < asc.length; i++) {
      const lo = asc[i - 1], hi = asc[i]
      if (size >= lo.diameter && size <= hi.diameter) {
        const t = (Math.log10(size) - Math.log10(lo.diameter)) / (Math.log10(hi.diameter) - Math.log10(lo.diameter))
        return lo.percentFiner + t * (hi.percentFiner - lo.percentFiner)
      }
    }
    return undefined
  }

  return {
    rows,
    gravityFactor: a,
    d50: interpAt(50),
    clayFraction: percentFinerThan(0.002),
    notes,
  }
}
