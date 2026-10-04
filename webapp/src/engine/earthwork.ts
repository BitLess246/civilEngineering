// ─────────────────────────────────────────────────────────────────────────
// EARTHWORK VOLUMES — average end area, prismoidal correction, mass haul.
//
// The project gives one cross-section per station: the cut area above
// existing grade and the fill area below it (both m²). Between two stations
// a distance d apart:
//
//   average end area   V = (A₁ + A₂)/2 · d        (always computed)
//   prismoidal         V = d/6 · (A₁ + 4·A_m + A₂)   when a middle area A_m
//       is supplied — its difference from the end-area value is the
//       PRISMOIDAL CORRECTION, the check every board problem asks for:
//           C_p = |(A₁ + A₂)/2 · d − d/6 (A₁ + 4A_m + A₂)|
//
// Cut and fill are accumulated separately (shrinkage/bulking factors may be
// applied per project; the engine exposes the factors but defaults them to
// 1.0). The mass-haul ordinate at each station is the running
// (cut − fill) volume: rising where cut exceeds fill, falling in fill.
// The balance line on the page reads borrow/waste straight off the ends.
// ─────────────────────────────────────────────────────────────────────────

export interface Section {
  /** Station (m). */
  station: number
  /** Cut area above existing grade (m²); 0 for pure fill sections. */
  cut: number
  /** Fill area below existing grade (m²); 0 for pure cut sections. */
  fill: number
  /** Middle-section area for the prismoidal check of the NEXT interval (m²). */
  midCut?: number
  midFill?: number
}

export interface EarthworkInput {
  sections: Section[]
  /** Interval spacing is derived from the station column; override here (m). */
  interval?: number
  /** Shrinkage factor applied to cut volume before hauling (default 1). */
  cutFactor?: number
  /** Bulking factor applied to fill volume (default 1). */
  fillFactor?: number
}

export interface IntervalRow {
  from: number
  to: number
  distance: number
  cutA1: number
  cutA2: number
  /** Average-end-area cut volume for the interval (m³, factored). */
  cutVol: number
  fillA1: number
  fillA2: number
  fillVol: number
  /** Prismoidal cut volume & correction when a mid area is supplied. */
  cutPrism: number | null
  cutCorrection: number | null
  fillPrism: number | null
  fillCorrection: number | null
  /** Net (cut − fill) for the interval (m³) — the mass-haul rise. */
  net: number
  /** Cumulative mass-haul ordinate at the TO station (m³). */
  massOrdinate: number
}

export interface EarthworkResult {
  rows: IntervalRow[]
  /** Totals (m³, factored). */
  totalCut: number
  totalFill: number
  /** Positive = surplus to waste, negative = borrow needed (m³). */
  balance: number
  /** Largest |mass ordinate| (m³) and the stations of extremes. */
  maxOrdinate: number
  maxOrdinateStation: number
  minOrdinate: number
  minOrdinateStation: number
  /** Haul sums (station·m³): total haul = Σ |ordinate| · interval — an upper bound. */
  totalHaulUpper: number
  cutFactor: number
  fillFactor: number
}

/** Reduce a strip of cross-sections to volumes and a mass-haul table. */
export function solveEarthwork(input: EarthworkInput): EarthworkResult {
  const sections = [...input.sections].sort((a, b) => a.station - b.station)
  if (sections.length < 2) throw new Error('Earthwork needs at least two cross-sections.')
  const cutFactor = input.cutFactor ?? 1
  const fillFactor = input.fillFactor ?? 1

  const rows: IntervalRow[] = []
  let mass = 0
  for (let i = 1; i < sections.length; i++) {
    const a = sections[i - 1]
    const b = sections[i]
    const d = input.interval ?? (b.station - a.station)
    if (!(d > 0)) throw new Error(`Interval from ${a.station} to ${b.station} is non-positive.`)

    const cutVol = ((a.cut + b.cut) / 2) * d * cutFactor
    const fillVol = ((a.fill + b.fill) / 2) * d * fillFactor

    const hasMid = a.midCut !== undefined || a.midFill !== undefined
    let cutPrism: number | null = null
    let cutCorrection: number | null = null
    let fillPrism: number | null = null
    let fillCorrection: number | null = null
    if (hasMid) {
      // The prismoid [a → b] uses the MIDDLE section areas stored on `a`
      // (or b's, when a's are absent) — the engine accepts either spelling.
      const mc = a.midCut ?? sections[i].midCut ?? 0
      const mf = a.midFill ?? sections[i].midFill ?? 0
      cutPrism = (d / 6) * (a.cut + 4 * mc + b.cut) * cutFactor
      cutCorrection = Math.abs(cutVol - cutPrism)
      fillPrism = (d / 6) * (a.fill + 4 * mf + b.fill) * fillFactor
      fillCorrection = Math.abs(fillVol - fillPrism)
    }

    const net = cutVol - fillVol
    mass += net
    rows.push({
      from: a.station, to: b.station, distance: d,
      cutA1: a.cut, cutA2: b.cut, cutVol,
      fillA1: a.fill, fillA2: b.fill, fillVol,
      cutPrism, cutCorrection, fillPrism, fillCorrection,
      net, massOrdinate: mass,
    })
  }

  const totalCut = rows.reduce((s, r) => s + r.cutVol, 0)
  const totalFill = rows.reduce((s, r) => s + r.fillVol, 0)
  let maxOrdinate = 0
  let maxOrdinateStation = sections[0].station
  let minOrdinate = 0
  let minOrdinateStation = sections[0].station
  let haulSum = 0
  let prevMass = 0
  for (const r of rows) {
    if (r.massOrdinate > maxOrdinate) { maxOrdinate = r.massOrdinate; maxOrdinateStation = r.to }
    if (r.massOrdinate < minOrdinate) { minOrdinate = r.massOrdinate; minOrdinateStation = r.to }
    // Genuine upper bound on haul: the larger end-ordinate held over the
    // whole interval. The to-ordinate alone is NOT a bound — on a falling
    // interval (200 → 0) it reports 0 against a true haul near 2000.
    haulSum += Math.max(Math.abs(prevMass), Math.abs(r.massOrdinate)) * r.distance
    prevMass = r.massOrdinate
  }

  return {
    rows,
    totalCut, totalFill,
    balance: totalCut - totalFill,
    maxOrdinate, maxOrdinateStation,
    minOrdinate, minOrdinateStation,
    totalHaulUpper: haulSum,
    cutFactor, fillFactor,
  }
}
