// ─────────────────────────────────────────────────────────────────────────
// Water content by oven drying. Layer 8. ASTM D2216.
//
// The simplest test in the laboratory and the one every other index property
// leans on: the liquid and plastic limits are water contents, the void ratio
// comes from it, and the unit weight cannot be split into dry and saturated
// without it.
//
// WATER CONTENT IS A RATIO TO THE DRY MASS, NOT THE TOTAL. w = Mw/Ms, so a
// water content above 100% is perfectly ordinary in a soft organic clay — it
// means the soil holds more water than solids by mass. Clamping it at 100
// would be wrong, and the module does not.
//
// The RAW MASSES are what the test records and what this takes: container,
// container + wet soil, container + dry soil. Storing only the answer would
// make a transcription error undetectable, and the tare mass is exactly where
// those errors happen.
//
// UNITS: masses g (any consistent unit — only ratios are used); w in %.
// ─────────────────────────────────────────────────────────────────────────

import { type LabNote, warn } from '../notes'

export interface MoistureData {
  /** Specimen identifier on the tin, e.g. 'A-14'. */
  container?: string
  /** Mass of the empty container, g. */
  containerMass: number
  /** Mass of container + wet soil, g. */
  wetMass: number
  /** Mass of container + oven-dried soil, g. */
  dryMass: number
  /** Drying temperature, °C. Default 110 per D2216. */
  temperature?: number
}

export interface MoistureResult {
  /** Mass of water driven off, g. */
  waterMass: number
  /** Mass of dry solids, g. */
  solidMass: number
  /** Water content, %. Can legitimately exceed 100. */
  waterContent: number
  notes: LabNote[]
}

export function moistureContent(d: MoistureData): MoistureResult {
  const notes: LabNote[] = []

  const waterMass = d.wetMass - d.dryMass
  const solidMass = d.dryMass - d.containerMass

  if (!(solidMass > 0)) {
    throw new Error(
      'Dry mass must exceed the container mass — check the tare. Without solids there is no water content.',
    )
  }
  if (waterMass < 0) {
    throw new Error(
      'The dry mass exceeds the wet mass, which is impossible. One of the two weighings is wrong.',
    )
  }

  const waterContent = (waterMass / solidMass) * 100

  const temp = d.temperature ?? 110
  if (temp > 60 && waterContent > 100) {
    notes.push(warn(
      'Water content above 100% — ordinary in a soft or organic clay, where the soil holds more water than solids by mass. If the soil is organic, D2216 asks for drying at 60 °C instead; structural water is lost at 110 °C and the result reads high.',
    ))
  }
  if (temp < 105 && temp !== 60) {
    notes.push(warn(`Dried at ${temp} °C. D2216 specifies 110 ± 5 °C unless the soil is organic or gypsiferous, in which case 60 °C and a stated deviation.`))
  }
  if (solidMass < 10) {
    notes.push(warn(`Only ${solidMass.toFixed(1)} g of solids — D2216 asks for a minimum specimen mass that grows with particle size, and a small specimen carries a large proportional weighing error.`))
  }

  return { waterMass, solidMass, waterContent, notes }
}

/**
 * Mean water content of several determinations, with the spread reported.
 * Averaging silently would hide a pair of results that disagree, which is
 * usually a tare or a transcription error rather than natural variation.
 */
export function meanWaterContent(results: MoistureResult[]): {
  mean: number; range: number; notes: LabNote[]
} {
  if (!results.length) throw new Error('No determinations to average.')
  const ws = results.map((r) => r.waterContent)
  const mean = ws.reduce((s, w) => s + w, 0) / ws.length
  const range = Math.max(...ws) - Math.min(...ws)
  const notes: LabNote[] = []
  // 2 percentage points is a common repeatability expectation for duplicates.
  if (ws.length > 1 && range > 2) {
    notes.push(warn(
      `The determinations spread ${range.toFixed(1)} percentage points. That is wider than duplicate repeatability — check the tare masses before averaging.`,
    ))
  }
  return { mean, range, notes }
}
