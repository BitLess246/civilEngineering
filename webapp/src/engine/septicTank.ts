// ─────────────────────────────────────────────────────────────────────────
// On-site sewage treatment — septic tank design, RNPCP 2000 Appendix B
// (Module 4).  Sizes a two-compartment septic tank from the drainage-fixture-
// unit load and lays out the digestive (inlet) and leaching (outlet) chambers.
//
//   • Minimum liquid capacity — Table B-2 (by max DFU served); beyond 100 DFU
//     add 94.6 L per extra fixture unit.
//   • Two compartments: the inlet is ≥ 2/3 of the total capacity (and ≥ 2 m³),
//     the secondary ≤ 1/3 (and ≥ 1 m³).
//   • Liquid depth 0.6–1.8 m; side walls extend ≥ 228.6 mm above the liquid
//     (freeboard); inlet ≥ 0.9 m wide × 1.5 m long.
//
// Units: capacity L (and m³); tank dimensions m; DFU dimensionless.
// ─────────────────────────────────────────────────────────────────────────
import { type FixtureCount, type Occupancy, totalDFU } from './plumbingFixtures'
import { type SolutionStep, sn0, sn2 } from '../lib/solution'

/** Side-wall freeboard above the liquid level (Appendix B), m. */
export const FREEBOARD_M = 0.2286      // 228.6 mm
export const MIN_LIQUID_DEPTH = 0.6
export const MAX_LIQUID_DEPTH = 1.8
export const MIN_INLET_WIDTH = 0.9
export const MIN_INLET_LENGTH = 1.5
export const MIN_INLET_VOL = 2.0       // m³
export const MIN_SECONDARY_VOL = 1.0   // m³

// ── Table B-2 — capacity of septic tanks by max DFU served ──────────────────
export interface SepticRow { maxDfu: number; gallons: number; liters: number }
export const SEPTIC_TABLE_B2: SepticRow[] = [
  { maxDfu: 15, gallons: 750, liters: 2838.0 },
  { maxDfu: 20, gallons: 1000, liters: 3785.0 },
  { maxDfu: 25, gallons: 1200, liters: 4542.0 },
  { maxDfu: 33, gallons: 1500, liters: 5677.5 },
  { maxDfu: 45, gallons: 2000, liters: 7570.0 },
  { maxDfu: 55, gallons: 2250, liters: 8516.3 },
  { maxDfu: 60, gallons: 2500, liters: 9462.5 },
  { maxDfu: 70, gallons: 2750, liters: 10408.8 },
  { maxDfu: 80, gallons: 3000, liters: 11355.0 },
  { maxDfu: 90, gallons: 3250, liters: 12301.3 },
  { maxDfu: 100, gallons: 3500, liters: 13247.5 },
]
/** Extra capacity per fixture unit above 100 DFU (Table B-2 note), L. */
export const L_PER_DFU_OVER_100 = 94.6

/** Minimum septic-tank liquid capacity (L) for a drainage fixture-unit load. */
export function septicCapacity(dfu: number): number {
  const last = SEPTIC_TABLE_B2[SEPTIC_TABLE_B2.length - 1]
  if (dfu > last.maxDfu) return last.liters + (dfu - last.maxDfu) * L_PER_DFU_OVER_100
  return (SEPTIC_TABLE_B2.find((r) => dfu <= r.maxDfu) ?? SEPTIC_TABLE_B2[0]).liters
}

// ── Tank design ─────────────────────────────────────────────────────────────
export interface SepticResult {
  dfu: number
  capacityL: number          // required minimum (Table B-2)
  width: number; liquidDepth: number
  length: number             // rounded up to 0.1 m
  totalHeight: number        // liquidDepth + freeboard, rounded up to 0.1 m
  inletLength: number        // digestive chamber, 2/3
  outletLength: number       // leaching chamber, 1/3
  providedVol: number        // m³ liquid volume at the rounded length
  inletVol: number; outletVol: number
  depthOK: boolean           // 0.6–1.8 m
  capacityOK: boolean        // provided ≥ required
  inletVolOK: boolean; outletVolOK: boolean; inletDimOK: boolean
  ok: boolean
}

const ceil1 = (x: number) => Math.ceil(x * 10) / 10   // round up to 0.1 m

/** Two-compartment septic-tank layout for a DFU load, given the plan width and
 *  liquid depth (Appendix B design steps). */
export function designSepticTank(p: { dfu: number; width: number; liquidDepth: number }): SepticResult {
  const capacityL = septicCapacity(p.dfu)
  const capacityM3 = capacityL / 1000
  const rawLength = capacityM3 / (p.width * p.liquidDepth)
  const length = ceil1(rawLength)
  const totalHeight = ceil1(p.liquidDepth + FREEBOARD_M)
  const inletLength = ceil1((2 / 3) * length)
  const outletLength = Math.max(0, length - inletLength)
  const providedVol = p.width * length * p.liquidDepth
  const inletVol = p.width * inletLength * p.liquidDepth
  const outletVol = p.width * outletLength * p.liquidDepth
  const depthOK = p.liquidDepth >= MIN_LIQUID_DEPTH && p.liquidDepth <= MAX_LIQUID_DEPTH
  const capacityOK = providedVol * 1000 >= capacityL - 1e-6
  const inletVolOK = inletVol >= MIN_INLET_VOL - 1e-6
  const outletVolOK = outletVol >= MIN_SECONDARY_VOL - 1e-6
  const inletDimOK = p.width >= MIN_INLET_WIDTH && inletLength >= MIN_INLET_LENGTH
  return {
    dfu: p.dfu, capacityL, width: p.width, liquidDepth: p.liquidDepth,
    length, totalHeight, inletLength, outletLength, providedVol, inletVol, outletVol,
    depthOK, capacityOK, inletVolOK, outletVolOK, inletDimOK,
    ok: depthOK && capacityOK && inletVolOK && outletVolOK && inletDimOK,
  }
}

/** Convenience: total DFU from a fixture schedule, then design the tank. */
export function designSepticFromSchedule(p: {
  items: FixtureCount[]; occupancy: Occupancy; width: number; liquidDepth: number
}): SepticResult {
  return designSepticTank({ dfu: totalDFU(p.items, p.occupancy), width: p.width, liquidDepth: p.liquidDepth })
}

// ── Worked solution ────────────────────────────────────────────────────────
export function septicSolution(r: SepticResult): SolutionStep[] {
  return [
    {
      title: 'Minimum capacity', clause: 'RNPCP Table B-2',
      lines: [
        { text: `Σ DFU = ${sn0(r.dfu)} → minimum liquid capacity = ${sn0(r.capacityL)} L (${sn2(r.capacityL / 1000)} m³).` },
      ],
    },
    {
      title: 'Plan length', clause: 'Appendix B, step 4',
      lines: [
        { tex: `L = \\dfrac{V}{w\\,d} = \\dfrac{${sn2(r.capacityL / 1000)}}{${sn2(r.width)}\\times ${sn2(r.liquidDepth)}} = ${sn2(r.capacityL / 1000 / (r.width * r.liquidDepth))}\\ \\text{m} \\to ${sn2(r.length)}\\ \\text{m}` },
        { text: `Provided liquid volume = ${sn2(r.width)}×${sn2(r.length)}×${sn2(r.liquidDepth)} = ${sn2(r.providedVol)} m³ ≥ ${sn2(r.capacityL / 1000)} m³.` },
      ],
      pass: r.capacityOK,
    },
    {
      title: 'Two compartments (2/3 · 1/3)', clause: 'Appendix B',
      lines: [
        { tex: `L_{inlet} = \\tfrac{2}{3}L = ${sn2(r.inletLength)}\\ \\text{m}\\ (${sn2(r.inletVol)}\\ \\text{m}^3);\\quad L_{outlet} = \\tfrac{1}{3}L = ${sn2(r.outletLength)}\\ \\text{m}\\ (${sn2(r.outletVol)}\\ \\text{m}^3)` },
        { text: `Inlet ≥ 2 m³ & ≥ 2/3 total ${r.inletVolOK ? '✓' : '✗'}; secondary ≥ 1 m³ ${r.outletVolOK ? '✓' : '✗'}; inlet ≥ 0.9 m × 1.5 m ${r.inletDimOK ? '✓' : '✗'}.` },
      ],
      pass: r.inletVolOK && r.outletVolOK && r.inletDimOK,
    },
    {
      title: 'Overall height', clause: 'Appendix B (freeboard 228.6 mm)',
      lines: [
        { tex: `H = d + ${sn2(FREEBOARD_M)} = ${sn2(r.liquidDepth)} + ${sn2(FREEBOARD_M)} = ${sn2(r.liquidDepth + FREEBOARD_M)} \\to ${sn2(r.totalHeight)}\\ \\text{m}` },
        { text: `Digestive chamber ${sn2(r.width)}×${sn2(r.inletLength)}×${sn2(r.totalHeight)} m; leaching chamber ${sn2(r.width)}×${sn2(r.outletLength)}×${sn2(r.totalHeight)} m.` },
      ],
      pass: r.depthOK,
      note: 'Liquid depth must be 0.6–1.8 m. Provide two 508 mm manholes (inlet & outlet); inlet/outlet baffles 101.6 mm above / 304.8 mm below the liquid.',
    },
  ]
}
