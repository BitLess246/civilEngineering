// ─────────────────────────────────────────────────────────────────────────
// AXLE LOAD EQUIVALENCY — the generalized fourth-power law.
//
//   LEF = (P / P_std)^4
//
// An axle's consumption of pavement life scales with the FOURTH POWER of
// its load ratio to the standard 80 kN (18-kip, 8.16 t) single axle — the
// engineering digest of the AASHO Road Test, and the basis of every ESAL
// table. The exponent is exposed (3–5 covers the literature range: heavy
// thin pavements ≈ 4.5+, thick flexible ≈ 3.5–4).
//
// Axle GROUPS. A tandem/tridem spreads the load over its axles, so the
// fourth-power law applies PER AXLE SHARE:
//   group ESALs = n_axles · (P_group / n_axles / P_std)^4
// e.g. a 150 kN tandem → 2 × (75/80)^4 = 1.541 ESALs — two axles riding
// close together cost much less than 2 × (150/80)^4 = 12.36 if each stood
// alone, and slightly more than one 80 kN axle.
//
// Loads may be entered in kN or tonnes (1 t = 9.807 kN). The traffic side
// (ADT, trucks, growth) reuses the same growth arithmetic as /pavement.
// ─────────────────────────────────────────────────────────────────────────

/** Standard single-axle load, kN (the 18-kip equivalent axle). */
export const P_STD = 80

export type AxleKind = 'single' | 'tandem' | 'tridem'
export const AXLES_IN: Record<AxleKind, number> = { single: 1, tandem: 2, tridem: 3 }

/** Convert tonnes to kN (gravity load of one metric tonne). */
export const t2kn = (t: number) => t * 9.80665

export interface AxleRow {
  name: string
  kind: AxleKind
  /** Group load, kN (all axles of the group together). */
  loadK: number
  /** Vehicles per day crossing the section, both directions. */
  perDay: number
}

/** Fourth-power LEF of ONE axle carrying `axleK` (kN). */
export function axleLEF(axleK: number, exponent = 4): number {
  if (!(axleK > 0)) throw new Error('Axle load must be positive.')
  return Math.pow(axleK / P_STD, exponent)
}

/**
 * LEF of an axle GROUP under the per-axle fourth-power law: the group load
 * is shared equally across its axles and each axle's LEF is summed.
 */
export function groupLEF(loadK: number, kind: AxleKind, exponent = 4): number {
  const n = AXLES_IN[kind]
  if (!(loadK >= n * 0.05)) throw new Error(`Group load must be positive.`)
  return n * axleLEF(loadK / n, exponent)
}

export interface EsalResult {
  rows: { name: string; kind: AxleKind; loadK: number; axleK: number; lef: number; daily: number }[]
  dailyEsal: number
  directional: number
  laneFactor: number
  growthFactor: number
  W18: number
}

export interface EsalInput {
  rows: AxleRow[]
  exponent?: number
  /** Directional split (default 0.5). */
  directional?: number
  /** Design-lane factor (default 1.0). */
  laneFactor?: number
  /** Annual growth rate, % (default 0). */
  growthPct?: number
  /** Design period, years (default 20). */
  years?: number
}

/** Full traffic → design-ESALs run over an editable axle-load census. */
export function esalFromAxles(inp: EsalInput): EsalResult {
  if (inp.rows.length === 0) throw new Error('Add at least one axle-load row.')
  const exponent = inp.exponent ?? 4
  if (!(exponent >= 2 && exponent <= 6)) throw new Error('Exponent must be 2–6.')
  const dir = inp.directional ?? 0.5
  const lane = inp.laneFactor ?? 1.0
  const r = (inp.growthPct ?? 0) / 100
  const years = inp.years ?? 20
  if (!(years > 0)) throw new Error('Design period must be positive.')
  const growthFactor = r > 0 ? (Math.pow(1 + r, years) - 1) / r : years

  const rows = inp.rows.map((row) => {
    const lef = groupLEF(row.loadK, row.kind, exponent)
    return {
      name: row.name, kind: row.kind, loadK: row.loadK,
      axleK: row.loadK / AXLES_IN[row.kind], lef,
      daily: row.perDay * lef * dir * lane,
    }
  })
  const dailyEsal = rows.reduce((s, x) => s + x.daily, 0)
  return { rows, dailyEsal, directional: dir, laneFactor: lane, growthFactor, W18: dailyEsal * 365 * growthFactor }
}

/** Typical Philippine/legal-load axle loads (kN) for the sample and hints. */
export const TYPICAL_AXLES = [
  { name: 'Cars & SUVs (1000 kg front)', kind: 'single' as AxleKind, loadK: 9.8 },
  { name: 'Utility truck, front axle', kind: 'single' as AxleKind, loadK: 35 },
  { name: '10-wheel dump truck, rear tandem (legal 68 kN/axle)', kind: 'tandem' as AxleKind, loadK: 136 },
  { name: 'Semi-trailer tandem drive', kind: 'tandem' as AxleKind, loadK: 118 },
  { name: 'Tridem trailer bogie', kind: 'tridem' as AxleKind, loadK: 186 },
]
