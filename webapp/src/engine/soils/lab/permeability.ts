// ─────────────────────────────────────────────────────────────────────────
// Hydraulic conductivity. Layer 8. ASTM D2434 (constant head) / D5084 (falling
// head, flexible wall).
//
//   constant head   k = Q·L / (A·h·t)
//   falling head    k = (a·L)/(A·t) · ln(h1/h2)
//
// Both are Darcy's law rearranged, and both are honest only inside the range of
// permeability their apparatus can actually measure.
//
// THE METHOD IS PART OF THE RESULT. A constant-head test on a clay is not a
// slow test, it is a wrong one: at k = 1e-9 m/s the flow through a 100 mm
// specimen under a metre of head is a few cubic millimetres a day, and what the
// burette records is mostly evaporation and temperature drift. A falling-head
// test on a clean sand fails the other way — the head drops before the reading
// is taken. D2434 puts constant head at k > 1e-5 m/s, D5084 puts flexible-wall
// falling head below 1e-6 m/s, and this module says so when the answer lands
// outside the range of the method that produced it.
//
// k IS REPORTED AT 20 °C. Water is 30% less viscous at 30 °C than at 10 °C, and
// k scales with 1/η, so an uncorrected result carries the laboratory's room
// temperature in it. The correction is D5084's RT = η_T/η_20.
//
// ORDERS OF MAGNITUDE, NOT PERCENTAGES. Permeability spans ten decades across
// soils and a good laboratory value is trusted to a factor of two or three.
// Every note here is written in that spirit; nothing rounds k to three figures
// and calls it accuracy.
//
// UNITS: lengths mm; areas mm²; volumes cm³; times s; k in m/s (module
// convention), with cm/s alongside because that is what the sheets are written
// in.
// ─────────────────────────────────────────────────────────────────────────

export type PermeabilityMethod = 'constant-head' | 'falling-head'

export interface ConstantHeadData {
  method: 'constant-head'
  /** Specimen length along the flow path, mm. */
  length: number
  /** Specimen cross-sectional area, mm². */
  area: number
  /** Constant head difference across the specimen, mm. */
  head: number
  /** Volume of water collected, cm³. */
  volume: number
  /** Collection time, s. */
  time: number
  /** Water temperature during the test, °C. Absent ⇒ no correction to 20 °C. */
  temperature?: number
}

export interface FallingHeadData {
  method: 'falling-head'
  length: number
  area: number
  /** Standpipe (burette) internal area, mm². */
  standpipeArea: number
  /** Head at the start of the interval, mm. */
  headStart: number
  /** Head at the end of the interval, mm. */
  headEnd: number
  /** Elapsed time, s. */
  time: number
  temperature?: number
}

export type PermeabilityData = ConstantHeadData | FallingHeadData

export interface PermeabilityResult {
  method: PermeabilityMethod
  /** Hydraulic conductivity at the test temperature, m/s. */
  k: number
  /** Corrected to 20 °C, m/s. Equals k when no temperature was recorded. */
  k20: number
  /** k20 in cm/s, the unit the laboratory sheet is written in. */
  k20cmPerSec: number
  /** Viscosity ratio η_T/η_20 applied. 1 when no temperature was recorded. */
  temperatureFactor: number
  /** Hydraulic gradient i = h/L (constant head) or the mean over the interval. */
  gradient: number
  notes: string[]
}

/**
 * D5084 viscosity ratio RT = η_T / η_20, the factor that turns k measured at
 * T °C into k at 20 °C.
 *
 *   RT = 2.2902 · (0.9842^T) / T^0.1702
 *
 * Returns 1 at 20 °C to within 0.5%, which is the check the test makes.
 */
export function viscosityRatio(tempC: number): number {
  if (!(tempC > 0)) throw new Error('Water temperature must be above 0 °C.')
  return (2.2902 * Math.pow(0.9842, tempC)) / Math.pow(tempC, 0.1702)
}

/** Typical ranges, m/s — used only to say when a result is outside them. */
const PLAUSIBLE = { min: 1e-12, max: 1e-1 }

export function permeability(d: PermeabilityData): PermeabilityResult {
  const notes: string[] = []
  if (!(d.length > 0)) throw new Error('Specimen length must be greater than zero.')
  if (!(d.area > 0)) throw new Error('Specimen area must be greater than zero.')
  if (!(d.time > 0)) throw new Error('Elapsed time must be greater than zero.')

  let k: number            // mm/s first, converted at the end
  let gradient: number

  if (d.method === 'constant-head') {
    if (!(d.head > 0)) throw new Error('The head difference must be greater than zero.')
    if (!(d.volume > 0)) throw new Error('The volume collected must be greater than zero.')
    // Q in cm³ → mm³ (×1000); k = Q·L/(A·h·t) in mm/s
    k = (d.volume * 1000 * d.length) / (d.area * d.head * d.time)
    gradient = d.head / d.length
  } else {
    if (!(d.standpipeArea > 0)) throw new Error('The standpipe area must be greater than zero.')
    if (!(d.headStart > 0) || !(d.headEnd > 0)) throw new Error('Both heads must be greater than zero.')
    if (!(d.headStart > d.headEnd)) {
      throw new Error('The head must FALL during the interval: the starting head has to exceed the ending head. Check which reading is which.')
    }
    k = ((d.standpipeArea * d.length) / (d.area * d.time)) * Math.log(d.headStart / d.headEnd)
    // The gradient falls through the run; the log-mean head is what the
    // integration above is driven by.
    const meanHead = (d.headStart - d.headEnd) / Math.log(d.headStart / d.headEnd)
    gradient = meanHead / d.length
  }

  const kMps = k / 1000                        // mm/s → m/s
  const temperatureFactor = d.temperature != null ? viscosityRatio(d.temperature) : 1
  const k20 = kMps * temperatureFactor

  if (d.temperature == null) {
    notes.push(
      'No water temperature recorded, so k is reported as measured. Water is about 30% less viscous at 30 °C than at 10 °C and k scales with 1/η, so an uncorrected value carries the laboratory\'s room temperature in it.',
    )
  } else if (Math.abs(temperatureFactor - 1) > 0.02) {
    notes.push(
      `Corrected to 20 °C by RT = η_T/η_20 = ${temperatureFactor.toFixed(3)} (D5084) — a ${((temperatureFactor - 1) * 100).toFixed(0)}% change from the value measured at ${d.temperature} °C.`,
    )
  }

  // ── Is this the right apparatus for the answer it produced? ──
  if (d.method === 'constant-head' && k20 < 1e-5) {
    notes.push(
      `k = ${k20.toExponential(1)} m/s is below the range a constant-head test measures (D2434 is for clean sands and gravels, k > 1e-5 m/s). At this permeability the volume collected is comparable with evaporation and temperature drift in the burette — the number is the apparatus, not the soil. Use a falling-head or flexible-wall test.`,
    )
  }
  if (d.method === 'falling-head' && k20 > 1e-4) {
    notes.push(
      `k = ${k20.toExponential(1)} m/s is above the range a falling-head test resolves: the head drops faster than it can be read, so the timed interval is dominated by reading error. A constant-head test (D2434) is the right apparatus here.`,
    )
  }
  if (k20 > PLAUSIBLE.max || k20 < PLAUSIBLE.min) {
    notes.push(
      `k = ${k20.toExponential(1)} m/s is outside the range real soils occupy (about 1e-12 for an intact clay to 1e-1 for an open gravel). Check the units on the specimen dimensions and the volume before reading anything into this.`,
    )
  }
  if (gradient > 30) {
    notes.push(
      `The hydraulic gradient is ${gradient.toFixed(0)}. High gradients turn the flow turbulent, and Darcy's law — which every form of this test rearranges — assumes it is laminar. D2434 suggests gradients under about 5 for coarse soils; a result from a steep gradient reads LOW.`,
    )
  }

  notes.push(
    'Permeability spans ten orders of magnitude across soils, and a good laboratory value is trusted to within a factor of two or three — not to three significant figures. A laboratory k also measures the specimen, not the deposit: fabric, layering and fissures make the field value larger, often by an order of magnitude.',
  )

  return {
    method: d.method,
    k: kMps,
    k20,
    k20cmPerSec: k20 * 100,
    temperatureFactor,
    gradient,
    notes,
  }
}
