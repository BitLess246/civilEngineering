// ─────────────────────────────────────────────────────────────────────────
// Specific gravity of soil solids by water pycnometer. Layer 8. ASTM D854.
//
//   Gs = Ms / (Ms + Mpw − Mpws)
//
// where the denominator is the mass of water the solids displaced. The
// measurement is a difference between two nearly equal masses, which is why it
// is delicate: a 0.1 g error in Mpws on a 25 g specimen moves Gs by about 0.01,
// and de-airing is the dominant error source — an under-de-aired suspension
// traps air, displaces too little water, and reads LOW.
//
// TEMPERATURE MATTERS AND IS NOT OPTIONAL. Water density falls with
// temperature, so a test run at 25 °C displaces less mass than the same solids
// at 20 °C. D854 reports Gs at 20 °C, and the correction K = ρw(T)/ρw(20) is
// applied here rather than left to the engineer to remember.
//
// UNITS: masses g; temperature °C; Gs dimensionless.
// ─────────────────────────────────────────────────────────────────────────

export interface SpecificGravityData {
  /** Pycnometer identifier. */
  pycnometer?: string
  /** Oven-dry mass of the soil solids, g. */
  solidMass: number
  /** Mass of pycnometer + water at the test temperature, g. */
  pycWaterMass: number
  /** Mass of pycnometer + water + solids at the test temperature, g. */
  pycWaterSolidMass: number
  /** Test temperature, °C. Default 20 (no correction). */
  temperature?: number
}

export interface SpecificGravityResult {
  /** Mass of water displaced by the solids, g. */
  displacedMass: number
  /** Gs at the test temperature, before the correction to 20 °C. */
  gsAtTest: number
  /** Temperature correction K = ρw(T)/ρw(20). */
  k: number
  /** Gs corrected to 20 °C — the reported value. */
  gs: number
  notes: string[]
}

/**
 * Density of water, g/cm³, over the range a soils laboratory works in.
 * Fitted to the standard table; accurate to about 1e-6 over 15–30 °C, which is
 * an order of magnitude finer than the mass weighings.
 */
export function waterDensity(tempC: number): number {
  // Thiesen–Scheel–Diesselhorst form, the usual expression for pure water.
  const t = tempC
  return (1 - ((t + 288.9414) / (508929.2 * (t + 68.12963))) * (t - 3.9863) ** 2)
}

/** D854 temperature correction K = ρw(T)/ρw(20 °C). */
export const temperatureCorrection = (tempC: number): number =>
  waterDensity(tempC) / waterDensity(20)

export function specificGravity(d: SpecificGravityData): SpecificGravityResult {
  const notes: string[] = []
  const { solidMass: Ms, pycWaterMass: Mpw, pycWaterSolidMass: Mpws } = d

  if (!(Ms > 0)) throw new Error('The oven-dry mass of solids must be greater than zero.')

  const displacedMass = Ms + Mpw - Mpws
  if (!(displacedMass > 0)) {
    throw new Error(
      'The solids displaced no water (Ms + Mpw ≤ Mpws), which is physically impossible. Check the two pycnometer weighings.',
    )
  }

  const gsAtTest = Ms / displacedMass
  const temp = d.temperature ?? 20
  const k = temperatureCorrection(temp)
  const gs = gsAtTest * k

  if (gs < 2.4 || gs > 2.9) {
    notes.push(
      `Gs = ${gs.toFixed(3)} falls outside the 2.60–2.80 range most mineral soils occupy. Below it suggests organic matter or trapped air from incomplete de-airing, which reads low; above it suggests heavy minerals. Verify before using this in a void-ratio calculation.`,
    )
  }
  if (Math.abs(temp - 20) > 0.1) {
    notes.push(
      `Corrected from ${temp.toFixed(1)} °C to 20 °C with K = ${k.toFixed(5)}. D854 reports Gs at 20 °C.`,
    )
  }
  if (Ms < 10) {
    notes.push(
      `Only ${Ms.toFixed(1)} g of solids. Gs is a difference between two nearly equal masses, so a small specimen magnifies every weighing error.`,
    )
  }

  return { displacedMass, gsAtTest, k, gs, notes }
}

/**
 * Void ratio from the dry unit weight and Gs:  e = (Gs·γw / γd) − 1.
 *
 * Kept here because it is the reason Gs is measured at all — the number is
 * rarely of interest by itself, and pairing them makes the dependency obvious.
 */
export function voidRatio(gs: number, dryUnitWeight: number, gammaW = 9.81): number {
  if (!(dryUnitWeight > 0)) throw new Error('Dry unit weight must be greater than zero.')
  return (gs * gammaW) / dryUnitWeight - 1
}

/** Degree of saturation, %:  S = w·Gs / e. */
export function saturation(waterContent: number, gs: number, e: number): number {
  if (!(e > 0)) throw new Error('Void ratio must be greater than zero.')
  return (waterContent * gs) / e
}
