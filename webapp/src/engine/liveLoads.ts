// ─────────────────────────────────────────────────────────────────────────
// NSCP 2015 live loads (§205) + other minimum loads (§206) reference data.
//   · Table 205-1 — Minimum Uniform & Concentrated Live Loads by occupancy.
//     A slab's live load is taken from its chosen occupancy (kPa), overriding
//     the global default LL.
//   · §205.6 — Live-load reduction for members with large tributary area:
//     L = Lo·(0.25 + 4.57/√(KLL·AT)), AT in m², not below 0.5·Lo (one floor) or
//     0.4·Lo (members carrying ≥ 2 floors); no reduction for Lo ≤ 4.8 kPa areas
//     of public assembly or where AT·KLL ≤ 37.16 m².
//   · §206 — Other minimum loads: partition allowance and roof live load Lr.
// Values are representative code entries for everyday building take-off.
// ─────────────────────────────────────────────────────────────────────────

/** Table 205-1 occupancy — uniform (kPa) and, where relevant, a concentrated load (kN). */
export interface LiveOccupancy { id: string; label: string; kPa: number; conc?: number; group: string }

/** NSCP 2015 Table 205-1 — Minimum uniform distributed live loads (kPa). */
export const TABLE_205_1: LiveOccupancy[] = [
  // Residential
  { id: 'res-dwelling', label: 'Dwellings — basic floor area', kPa: 1.9, group: 'Residential' },
  { id: 'res-balcony', label: 'Dwellings — balconies / decks', kPa: 2.9, group: 'Residential' },
  { id: 'hotel-room', label: 'Hotel / lodging guest rooms', kPa: 1.9, group: 'Residential' },
  // Office
  { id: 'office-room', label: 'Offices', kPa: 2.4, conc: 9.0, group: 'Office' },
  { id: 'office-lobby', label: 'Office lobbies & first-floor corridors', kPa: 4.8, conc: 9.0, group: 'Office' },
  { id: 'office-corridor', label: 'Corridors above first floor', kPa: 3.8, group: 'Office' },
  // Schools
  { id: 'school-class', label: 'Classrooms', kPa: 1.9, conc: 4.5, group: 'School' },
  { id: 'school-corridor', label: 'School corridors above first floor', kPa: 3.8, group: 'School' },
  // Assembly
  { id: 'assembly-fixed', label: 'Assembly — fixed seats', kPa: 2.9, group: 'Assembly' },
  { id: 'assembly-movable', label: 'Assembly — movable seats', kPa: 4.8, group: 'Assembly' },
  { id: 'assembly-stage', label: 'Assembly — platforms / stages', kPa: 7.2, group: 'Assembly' },
  { id: 'lobby-corridor1', label: 'Lobbies & first-floor corridors', kPa: 4.8, conc: 9.0, group: 'Assembly' },
  // Mercantile / storage
  { id: 'store-ground', label: 'Retail stores — ground floor', kPa: 4.8, conc: 4.5, group: 'Mercantile' },
  { id: 'store-upper', label: 'Retail stores — upper floors', kPa: 3.6, conc: 4.5, group: 'Mercantile' },
  { id: 'storage-light', label: 'Storage warehouse — light', kPa: 6.0, group: 'Storage' },
  { id: 'storage-heavy', label: 'Storage warehouse — heavy', kPa: 12.0, group: 'Storage' },
  // Institutional
  { id: 'hosp-room', label: 'Hospital — patient rooms', kPa: 1.9, conc: 4.5, group: 'Institutional' },
  { id: 'hosp-operating', label: 'Hospital — operating rooms / labs', kPa: 2.9, conc: 4.5, group: 'Institutional' },
  { id: 'library-reading', label: 'Library — reading rooms', kPa: 2.9, conc: 4.5, group: 'Institutional' },
  { id: 'library-stack', label: 'Library — stack rooms', kPa: 7.2, conc: 4.5, group: 'Institutional' },
  // Parking / circulation
  { id: 'garage-car', label: 'Garages — passenger cars only', kPa: 1.9, group: 'Parking' },
  { id: 'stairs', label: 'Stairs & exitways', kPa: 4.8, group: 'Parking' },
]

/** §206 — other minimum loads usable as area adders (kPa). */
export const TABLE_206: LiveOccupancy[] = [
  { id: 'partition-allow', label: 'Movable partition allowance (§206)', kPa: 1.0, group: 'Other' },
  { id: 'roof-maint', label: 'Roof live load Lr — ordinary, maintenance (§205.4)', kPa: 1.0, group: 'Roof' },
  { id: 'roof-garden', label: 'Roof — promenade / occupiable', kPa: 4.8, group: 'Roof' },
]

/** A slab's chosen live occupancy (overrides the global default LL). */
export interface LiveItem { id: string; label: string; kPa: number }

/**
 * §205.6 live-load reduction. `Lo` = unreduced kPa, `AT` = tributary area (m²),
 * `KLL` = live-load element factor (interior column 4, edge 3, beam 2, slab 1),
 * `floors` = number of floors carried (≥ 2 → 0.40 floor, else 0.50). Returns the
 * reduced design live load (kPa). No reduction for Lo ≤ 4.8 in assembly areas or
 * when KLL·AT ≤ 37.16 m².
 */
export function liveLoadReduction(Lo: number, AT: number, KLL = 2, floors = 1): number {
  if (KLL * AT <= 37.16) return Lo
  const factor = 0.25 + 4.57 / Math.sqrt(KLL * AT)
  const floor = Math.max(factor, floors >= 2 ? 0.40 : 0.50)
  return Lo * Math.min(1, floor)
}
