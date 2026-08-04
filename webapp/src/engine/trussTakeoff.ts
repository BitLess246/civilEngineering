// ─────────────────────────────────────────────────────────────────────────
// Truss steel material take-off + priced Bill of Materials (Truss Phase 3).
// Members share one cross-section by default; pass `sectionOf` to bill a
// truss sized per design group by the optimiser, where a bottom chord and a
// top chord are different sections and the BOM has to say so.
// A connection/gusset plate allowance (default 10 % of net steel) is added on
// top of the member steel to cover gusset plates and field welding/bolting.
// Units: geometry m; area mm²; linear density kg/m; weight kg; prices PHP (₱).
// ─────────────────────────────────────────────────────────────────────────
import type { ChordKind, EnvForce } from './truss'
import type { EffectiveSection } from './aiscSections'

const STEEL_DENSITY = 7850   // kg/m³

export interface TrussMemberQty {
  id: string
  kind: ChordKind
  L: number            // m
  kgPerM: number       // linear density for the chosen section
  netWeightKg: number  // L × kgPerM
}

export interface TrussKindSubtotal {
  kind: ChordKind
  members: number
  lengthM: number
  netKg: number
}

/** One distinct section used by the truss, and what it costs. */
export interface TrussSectionSubtotal {
  label: string
  areaMm2: number
  kgPerM: number
  members: number
  lengthM: number
  netKg: number
}

export interface TrussTakeoffResult {
  byMember: TrussMemberQty[]
  /** Section label — or a count, when the truss uses more than one. */
  section: string
  /**
   * Area and linear density. With a single section these are exactly that
   * section's; with several they are LENGTH-WEIGHTED AVERAGES, and `bySection`
   * carries the real breakdown.
   */
  areaMm2: number
  kgPerM: number
  netSteelKg: number         // fabricated member steel
  gussetFraction: number     // e.g. 0.10
  gussetKg: number           // netSteelKg × gussetFraction
  totalKg: number            // net + gusset
  byKind: TrussKindSubtotal[]
  bySection: TrussSectionSubtotal[]
}

export interface TrussTakeoffOptions {
  /** Fraction of net steel weight added for gusset/connection plates (default 0.10). */
  gussetFraction?: number
  /**
   * Per-member section, for a truss sized by design group. Anything this
   * returns `undefined` for falls back to the `eff` passed in, so a partial
   * mapping still bills correctly.
   */
  sectionOf?: (memberId: string) => EffectiveSection | undefined
}

export function trussTakeoff(
  forces: EnvForce[],
  eff: EffectiveSection,
  opts: TrussTakeoffOptions = {},
): TrussTakeoffResult {
  const gussetFraction = Math.max(0, opts.gussetFraction ?? 0.10)
  const secOf = (id: string) => opts.sectionOf?.(id) ?? eff
  const density = (a: number) => (a / 1e6) * STEEL_DENSITY

  const byMember: TrussMemberQty[] = forces.map((f) => {
    const kg = density(secOf(f.id).A)
    return { id: f.id, kind: f.kind, L: f.L, kgPerM: kg, netWeightKg: f.L * kg }
  })

  const netSteelKg = byMember.reduce((s, m) => s + m.netWeightKg, 0)

  // Group by the section actually used, so a grouped truss bills one line per
  // section rather than one averaged line that no supplier can quote from.
  const secMap = new Map<string, TrussSectionSubtotal>()
  for (const f of forces) {
    const sc = secOf(f.id)
    const row = secMap.get(sc.label) ?? {
      label: sc.label, areaMm2: sc.A, kgPerM: density(sc.A), members: 0, lengthM: 0, netKg: 0,
    }
    row.members += 1
    row.lengthM += f.L
    row.netKg += f.L * row.kgPerM
    secMap.set(sc.label, row)
  }
  const bySection = [...secMap.values()].sort((a, b) => b.netKg - a.netKg)

  const totalLength = forces.reduce((s, f) => s + f.L, 0)
  const areaMm2 = bySection.length === 1
    ? bySection[0].areaMm2
    : (totalLength > 0 ? bySection.reduce((s, r) => s + r.areaMm2 * r.lengthM, 0) / totalLength : eff.A)
  const kgPerM = totalLength > 0 ? netSteelKg / totalLength : density(eff.A)
  const gussetKg = netSteelKg * gussetFraction
  const totalKg = netSteelKg + gussetKg

  const kindOrder: ChordKind[] = ['top', 'bottom', 'vertical', 'diagonal']
  const byKind: TrussKindSubtotal[] = kindOrder
    .map((kind) => {
      const ms = byMember.filter((m) => m.kind === kind)
      return { kind, members: ms.length, lengthM: ms.reduce((s, m) => s + m.L, 0), netKg: ms.reduce((s, m) => s + m.netWeightKg, 0) }
    })
    .filter((k) => k.members > 0)

  const section = bySection.length === 1 ? bySection[0].label : `${bySection.length} sections`
  return { byMember, section, areaMm2, kgPerM, netSteelKg, gussetFraction, gussetKg, totalKg, byKind, bySection }
}

// ── Pricing ────────────────────────────────────────────────────────────────
export interface TrussPriceList {
  steelKg: number   // ₱ per kg (applies to both sections and gusset plates)
}

export interface TrussBomRow {
  item: string; qty: number; unit: string; unitPrice: number; amount: number
}
export interface TrussBom { rows: TrussBomRow[]; total: number }

export function costTrussBill(t: TrussTakeoffResult, p: TrussPriceList): TrussBom {
  const row = (item: string, qty: number, unit: string, unitPrice: number): TrussBomRow =>
    ({ item, qty, unit, unitPrice, amount: qty * unitPrice })
  const rows: TrussBomRow[] = [
    row('Structural steel sections', t.netSteelKg, 'kg', p.steelKg),
    row(`Gusset / connection plates (${(t.gussetFraction * 100).toFixed(0)}% allowance)`, t.gussetKg, 'kg', p.steelKg),
  ]
  return { rows, total: rows.reduce((s, r) => s + r.amount, 0) }
}
