// ─────────────────────────────────────────────────────────────────────────
// Truss steel material take-off + priced Bill of Materials (Truss Phase 3).
// All members share one cross-section (the EffectiveSection from aiscSections).
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

export interface TrussTakeoffResult {
  byMember: TrussMemberQty[]
  section: string            // effective section label
  areaMm2: number            // mm²
  kgPerM: number             // kg/m
  netSteelKg: number         // fabricated member steel
  gussetFraction: number     // e.g. 0.10
  gussetKg: number           // netSteelKg × gussetFraction
  totalKg: number            // net + gusset
  byKind: TrussKindSubtotal[]
}

export interface TrussTakeoffOptions {
  /** Fraction of net steel weight added for gusset/connection plates (default 0.10). */
  gussetFraction?: number
}

export function trussTakeoff(
  forces: EnvForce[],
  eff: EffectiveSection,
  opts: TrussTakeoffOptions = {},
): TrussTakeoffResult {
  const gussetFraction = Math.max(0, opts.gussetFraction ?? 0.10)
  const areaMm2 = eff.A
  const kgPerM = (areaMm2 / 1e6) * STEEL_DENSITY

  const byMember: TrussMemberQty[] = forces.map((f) => ({
    id: f.id, kind: f.kind, L: f.L, kgPerM, netWeightKg: f.L * kgPerM,
  }))

  const netSteelKg = byMember.reduce((s, m) => s + m.netWeightKg, 0)
  const gussetKg = netSteelKg * gussetFraction
  const totalKg = netSteelKg + gussetKg

  const kindOrder: ChordKind[] = ['top', 'bottom', 'vertical', 'diagonal']
  const byKind: TrussKindSubtotal[] = kindOrder
    .map((kind) => {
      const ms = byMember.filter((m) => m.kind === kind)
      return { kind, members: ms.length, lengthM: ms.reduce((s, m) => s + m.L, 0), netKg: ms.reduce((s, m) => s + m.netWeightKg, 0) }
    })
    .filter((k) => k.members > 0)

  return { byMember, section: eff.label, areaMm2, kgPerM, netSteelKg, gussetFraction, gussetKg, totalKg, byKind }
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
