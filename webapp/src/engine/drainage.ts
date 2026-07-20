// ─────────────────────────────────────────────────────────────────────────
// Sanitary drainage (DWV) design — RNPCP 2000 (Module 3).  Sizes the drain,
// waste and vent piping from the drainage-fixture-unit (DFU) load, plus the
// building-sewer slope.
//
//   • Drain/vent size + maximum developed length — RNPCP Table 7-5 (max fixture
//     unit loading & length of excreta drainage and vent piping).
//   • A vent must be ≥ 32 mm and ≥ ½ the drain it serves (Table 7-5 note).
//   • No water closet discharges into a drain < 75 mm (§ soil-pipe rule).
//   • Building-sewer minimum slope — §1206 (2 %; 1 % for 102/152 mm; 0.5 % for
//     ≥ 203 mm).  On a 1 % run the horizontal DFU capacity is ×0.8 (Table 7-5,
//     footnote 5).
//
// Units: pipe diameter mm; length m; slope % and mm/m; DFU dimensionless.
// ─────────────────────────────────────────────────────────────────────────
import { type FixtureCount, type Occupancy, totalDFU, PLUMBING_FIXTURES } from './plumbingFixtures'
import { type SolutionStep, sn0, sn1 } from '../lib/solution'

/** No soil (water-closet) drain smaller than this. */
export const MIN_SOIL_MM = 75

// ── Table 7-5 — max DFU per drain size + companion vent + max lengths ────────
export interface DrainRow {
  maxDfu: number      // max drainage fixture units on this size (horizontal branch cap)
  drainMm: number     // drain / stack diameter
  ventMm: number      // companion vent diameter
  maxDrainM: number   // max developed length of the drain/stack, m
  maxVentM: number    // max developed length of the vent, m
}
// Calibrated to the Module 3 worked examples (14 DFU → 76/51 mm, 65/37 m;
// 39 DFU → 102/65 mm, 91/55 m) and the standard RNPCP/UPC Table 7-5 ladder.
export const DRAIN_TABLE: DrainRow[] = [
  { maxDfu: 1, drainMm: 32, ventMm: 32, maxDrainM: 14, maxVentM: 9 },
  { maxDfu: 3, drainMm: 40, ventMm: 32, maxDrainM: 15, maxVentM: 12 },
  { maxDfu: 6, drainMm: 50, ventMm: 40, maxDrainM: 18, maxVentM: 18 },
  { maxDfu: 12, drainMm: 65, ventMm: 40, maxDrainM: 22, maxVentM: 24 },
  { maxDfu: 20, drainMm: 76, ventMm: 51, maxDrainM: 65, maxVentM: 37 },
  { maxDfu: 160, drainMm: 102, ventMm: 65, maxDrainM: 91, maxVentM: 55 },
  { maxDfu: 620, drainMm: 152, ventMm: 76, maxDrainM: 152, maxVentM: 91 },
  { maxDfu: 1400, drainMm: 203, ventMm: 102, maxDrainM: 200, maxVentM: 120 },
]

// ── Building-sewer slope — §1206 ────────────────────────────────────────────
export interface SewerSlope { defaultPct: number; minPct: number; mmPerM: number }
/** Minimum building-sewer slope allowed for a pipe diameter (§1206): 2 % normal;
 *  1 % permitted for 102/152 mm; 0.5 % for ≥ 203 mm. mmPerM at the minimum. */
export function sewerSlope(diameterMm: number): SewerSlope {
  const minPct = diameterMm >= 203 ? 0.5 : diameterMm >= 102 ? 1.0 : 2.0
  return { defaultPct: 2.0, minPct, mmPerM: (minPct / 100) * 1000 }
}

// ── Drainage sizing ─────────────────────────────────────────────────────────
export interface DrainageResult {
  dfu: number
  wcCount: number
  slopePct: number
  effectiveDfu: number     // DFU after the 1 %-slope ×1.25 penalty (=÷0.8)
  drainMm: number          // horizontal + vertical drain size
  ventMm: number
  maxDrainM: number
  maxVentM: number
  ventOK: boolean          // ≥ max(32, drain/2)
  wcStackWarn: boolean     // > 4 WC on a stack
  wcBranchWarn: boolean    // > 3 WC on a horizontal branch
  sewer: SewerSlope
  ok: boolean
}

/** Size the drain, vent and building-sewer slope for a fixture schedule.
 *  `slopePct` (2 default; 1 allowed for ≥102 mm) reduces the horizontal DFU
 *  capacity by ×0.8 when 1 % (Table 7-5 fn.5). */
export function designDrainage(p: { items: FixtureCount[]; occupancy: Occupancy; slopePct?: number }): DrainageResult {
  const dfu = totalDFU(p.items, p.occupancy)
  const wcCount = p.items.find((i) => i.id === 'water-closet')?.count ?? 0
  const slopePct = p.slopePct ?? 2.0
  // On a 1 % run the table capacity is ×0.8 → size against the inflated load.
  const effectiveDfu = slopePct <= 1.0 ? dfu / 0.8 : dfu
  let row = DRAIN_TABLE.find((r) => effectiveDfu <= r.maxDfu) ?? DRAIN_TABLE[DRAIN_TABLE.length - 1]
  // No water closet into a drain < 75 mm.
  if (wcCount > 0 && row.drainMm < MIN_SOIL_MM) {
    row = DRAIN_TABLE.find((r) => r.drainMm >= MIN_SOIL_MM) ?? row
  }
  const ventMm = row.ventMm
  const ventOK = ventMm >= Math.max(32, row.drainMm / 2)
  return {
    dfu, wcCount, slopePct, effectiveDfu,
    drainMm: row.drainMm, ventMm, maxDrainM: row.maxDrainM, maxVentM: row.maxVentM, ventOK,
    wcStackWarn: wcCount > 4, wcBranchWarn: wcCount > 3,
    sewer: sewerSlope(row.drainMm),
    ok: ventOK && (wcCount === 0 || row.drainMm >= MIN_SOIL_MM),
  }
}

// ── Worked solution ────────────────────────────────────────────────────────
export function drainageSolution(p: { items: FixtureCount[]; occupancy: Occupancy }, r: DrainageResult): SolutionStep[] {
  const breakdown = p.items
    .filter((i) => i.count > 0 && (PLUMBING_FIXTURES[i.id]?.dfu[p.occupancy] ?? 0) > 0)
    .map((i) => `${i.count}×${PLUMBING_FIXTURES[i.id].label} (${PLUMBING_FIXTURES[i.id].dfu[p.occupancy]} DFU)`)
    .join(' + ')
  return [
    {
      title: 'Drainage fixture units', clause: 'RNPCP Table 7-2',
      lines: [
        { text: `${breakdown || 'no drainage fixtures'} — Σ DFU = ${sn0(r.dfu)} (${p.occupancy}).` },
        ...(r.slopePct <= 1.0 ? [{ tex: `\\text{1% slope: } DFU_{eff} = ${sn0(r.dfu)}/0.8 = ${sn1(r.effectiveDfu)}` } as const] : []),
      ],
    },
    {
      title: 'Drain & vent size', clause: 'RNPCP Table 7-5',
      lines: [
        { text: `From Table 7-5 at ${sn1(r.effectiveDfu)} DFU: drain (horizontal & vertical) = ${sn0(r.drainMm)} mm; vent = ${sn0(r.ventMm)} mm.` },
        { text: `Max developed length — drain/stack ${sn0(r.maxDrainM)} m, vent ${sn0(r.maxVentM)} m.` },
        { tex: `d_{vent} = ${sn0(r.ventMm)} \\ge \\max(32,\\ ${sn0(r.drainMm)}/2 = ${sn0(r.drainMm / 2)})\\ \\text{mm}` },
        ...(r.wcCount > 0 ? [{ text: `Contains ${r.wcCount} water closet(s): soil drain ≥ 75 mm ✓${r.wcStackWarn ? ' — warning: > 4 WC on one stack.' : ''}${r.wcBranchWarn && !r.wcStackWarn ? ' — check: > 3 WC on a horizontal branch.' : ''}` } as const] : []),
      ],
      pass: r.ventOK,
    },
    {
      title: 'Building-sewer slope', clause: 'RNPCP §1206',
      lines: [
        { text: `${sn0(r.drainMm)} mm sewer: minimum slope ${sn1(r.sewer.minPct)} % (${sn1(r.sewer.mmPerM)} mm/m); run at ${sn1(r.sewer.defaultPct)} % where practical.` },
      ],
    },
  ]
}
