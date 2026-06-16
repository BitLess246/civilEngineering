// ─────────────────────────────────────────────────────────────────────────
// NSCP 2015 dead-load reference data for composing a slab superimposed dead
// load (SDL).
//   · Table 204-1 — Minimum Design Dead Loads: COMPONENT weights given directly
//     in kPa (finishes, ceilings, partitions, roofing, MEP allowances).
//   · Table 204-2 — Minimum Densities for Design Loads from Materials: material
//     UNIT WEIGHTS in kN/m³, multiplied by a user thickness to give kPa.
// A slab's SDL = Σ(chosen 204-1 components) + Σ(204-2 material × thickness).
// Values are representative entries from the code tables for everyday building
// take-off; extend the lists as needed.
// ─────────────────────────────────────────────────────────────────────────

/** Table 204-1 component — a finished assembly with a fixed area load (kPa). */
export interface DeadComponent { id: string; label: string; kPa: number; group: string }

/** Table 204-2 material — a unit weight (kN/m³) applied over a thickness. */
export interface DeadMaterial { id: string; label: string; gamma: number }

/** NSCP 2015 Table 204-1 — Minimum Design Dead Loads (component, kPa). */
export const TABLE_204_1: DeadComponent[] = [
  // Floor finishes
  { id: 'fin-ceramic', label: 'Ceramic / quarry tile (20 mm) on 25 mm mortar', kPa: 1.10, group: 'Floor finish' },
  { id: 'fin-ceramic-thin', label: 'Ceramic / quarry tile (20 mm) on 12 mm mortar', kPa: 0.77, group: 'Floor finish' },
  { id: 'fin-marble', label: 'Marble and mortar on stone-concrete fill', kPa: 1.58, group: 'Floor finish' },
  { id: 'fin-cement', label: 'Cement finish (25 mm) on stone-concrete fill', kPa: 1.53, group: 'Floor finish' },
  { id: 'fin-hardwood', label: 'Hardwood flooring (22 mm)', kPa: 0.19, group: 'Floor finish' },
  { id: 'fin-vinyl', label: 'Vinyl / asphalt tile (on concrete)', kPa: 0.07, group: 'Floor finish' },
  // Ceilings
  { id: 'ceil-plaster-tile', label: 'Plaster on tile or concrete', kPa: 0.24, group: 'Ceiling' },
  { id: 'ceil-susp-plaster', label: 'Suspended metal lath & gypsum plaster', kPa: 0.48, group: 'Ceiling' },
  { id: 'ceil-acoustic', label: 'Acoustical fiber board (suspended)', kPa: 0.05, group: 'Ceiling' },
  { id: 'ceil-gypsum', label: 'Gypsum board (one 13 mm layer)', kPa: 0.10, group: 'Ceiling' },
  // Partitions
  { id: 'part-gypsum', label: 'Wood/steel studs, 13 mm gypsum board both sides', kPa: 0.38, group: 'Partition' },
  { id: 'part-movable', label: 'Movable steel partitions (allowance)', kPa: 0.19, group: 'Partition' },
  { id: 'part-allow', label: 'Partition allowance (§204.3.2 min)', kPa: 1.00, group: 'Partition' },
  // Waterproofing / roofing
  { id: 'roof-5ply', label: 'Five-ply felt-and-gravel roofing', kPa: 0.26, group: 'Roofing / waterproofing' },
  { id: 'roof-membrane', label: 'Bituminous, smooth-surface membrane', kPa: 0.07, group: 'Roofing / waterproofing' },
  // MEP allowance
  { id: 'mep-duct', label: 'Mechanical duct allowance', kPa: 0.20, group: 'MEP' },
]

/** NSCP 2015 Table 204-2 — Minimum Densities for Design Loads from Materials (kN/m³). */
export const TABLE_204_2: DeadMaterial[] = [
  { id: 'mat-rc', label: 'Concrete, reinforced (stone)', gamma: 23.6 },
  { id: 'mat-pc', label: 'Concrete, plain (stone)', gamma: 22.6 },
  { id: 'mat-cinder', label: 'Concrete, cinder', gamma: 17.0 },
  { id: 'mat-mortar', label: 'Cement mortar', gamma: 21.2 },
  { id: 'mat-chb', label: 'Masonry, concrete hollow block (grouted)', gamma: 21.2 },
  { id: 'mat-brick', label: 'Masonry, brick', gamma: 18.8 },
  { id: 'mat-earth', label: 'Earth (dry, packed)', gamma: 15.7 },
  { id: 'mat-sand', label: 'Sand / gravel (dry, packed)', gamma: 15.7 },
  { id: 'mat-water', label: 'Water', gamma: 9.81 },
  { id: 'mat-steel', label: 'Steel', gamma: 77.3 },
  { id: 'mat-wood', label: 'Wood (softwood, typical)', gamma: 6.3 },
]

/** A picked SDL line: either a 204-1 component (kPa direct) or a 204-2 material
 *  over a thickness (kPa = γ·t). Stored on the plate so each slab owns its SDL. */
export interface SdlItem {
  id: string                 // table entry id
  kind: '204-1' | '204-2'
  label: string
  kPa?: number               // 204-1 component
  gamma?: number             // 204-2 material density, kN/m³
  thicknessMm?: number       // 204-2 applied thickness, mm
}

/** Area load (kPa) contributed by one SDL line. */
export function sdlItemKPa(item: SdlItem): number {
  if (item.kind === '204-1') return item.kPa ?? 0
  return ((item.gamma ?? 0) * (item.thicknessMm ?? 0)) / 1000   // γ[kN/m³]·t[m]
}

/** Total SDL (kPa) from a list of lines. */
export function sdlTotal(items: SdlItem[] | undefined): number {
  return (items ?? []).reduce((s, it) => s + sdlItemKPa(it), 0)
}
