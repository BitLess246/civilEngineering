// ─────────────────────────────────────────────────────────────────────────
// Timber (wood frame) member design — ASD per NDS 2018 §3 / NSCP 2015 §6.
// NSCP 2015 Chapter 6 (Wood) adopts the same Allowable-Stress-Design
// adjustment-factor framework as the NDS: an allowable stress F′ is the
// tabulated reference stress F multiplied by the applicable C-factors, and the
// member is adequate when the actual stress f ≤ F′.  Reference design values
// below are NDS Supplement Table 4A/4D (visually-graded sawn lumber, SI
// conversion 1 psi = 0.00689476 MPa) and Table 5A (glulam); NSCP §6 Philippine
// species (Yakal, Apitong, Guijo …) share the method and can be supplied as
// custom reference values.
//
// Units: geometry mm; forces kN; moments kN·m; stresses MPa.  Section is a
// solid rectangle b (width) × d (depth); bending about the strong axis (depth).
// ─────────────────────────────────────────────────────────────────────────

/** Tabulated ASD reference design values for a species/grade (MPa). */
export interface WoodRefValues {
  Fb: number       // bending
  Ft: number       // tension parallel to grain
  Fv: number       // shear parallel to grain (horizontal shear)
  FcPerp: number   // compression perpendicular to grain (bearing)
  Fc: number       // compression parallel to grain
  E: number        // modulus of elasticity
  Emin: number     // reference modulus for stability (5th-percentile, ×safety)
  G: number        // specific gravity (for density / connector design)
}

export type WoodKind = 'sawn' | 'glulam'

/** One material entry (species × grade) resolved to a flat lookup.  The
 *  analysis/design engine only ever consumes `ref` (WoodRefValues) — species,
 *  grade and origin are UI/provenance metadata so the library is code- and
 *  country-agnostic (add any species by supplying its ref). */
export interface WoodSpecies {
  id: string                 // composite `${species}-${grade}`
  label: string              // "<species> — <grade>"
  kind: WoodKind
  ref: WoodRefValues
  species: string            // grouping key for the species dropdown
  speciesLabel: string
  grade: string              // key within a species (grade dropdown)
  gradeLabel: string
  origin: string             // provenance badge: 'NDS' | 'NSCP' | 'custom' | …
}

// psi → MPa
const K = 0.00689476
const mpa = (psi: number) => psi * K

// ── Built-in reference-value library, structured species → grades ──────────
// Sawn: NDS Supplement Table 4A (visually-graded dimension lumber / timbers).
// Glulam: NDS Supplement Table 5A (bending combinations, Δ = tension zone).
// Philippine species (Yakal, Ipil, Molave, Tanguile …) share this shape and can
// be added here — or supplied as custom materials — once their NSCP §6 / PWCM /
// FPRDI allowable stresses are available.
interface GradeSpec { grade: string; gradeLabel: string; ref: WoodRefValues }
interface SpeciesSpec { species: string; speciesLabel: string; kind: WoodKind; origin: string; grades: GradeSpec[] }

const LIBRARY_SPEC: SpeciesSpec[] = [
  { species: 'DFL', speciesLabel: 'Douglas Fir-Larch', kind: 'sawn', origin: 'NDS', grades: [
    { grade: 'SS', gradeLabel: 'Select Structural', ref: { Fb: mpa(1500), Ft: mpa(1000), Fv: mpa(180), FcPerp: mpa(625), Fc: mpa(1700), E: mpa(1_900_000), Emin: mpa(690_000), G: 0.50 } },
    { grade: '1', gradeLabel: 'No.1', ref: { Fb: mpa(1000), Ft: mpa(675), Fv: mpa(180), FcPerp: mpa(625), Fc: mpa(1500), E: mpa(1_700_000), Emin: mpa(620_000), G: 0.50 } },
    { grade: '2', gradeLabel: 'No.2', ref: { Fb: mpa(900), Ft: mpa(575), Fv: mpa(180), FcPerp: mpa(625), Fc: mpa(1350), E: mpa(1_600_000), Emin: mpa(580_000), G: 0.50 } },
  ] },
  { species: 'HF', speciesLabel: 'Hem-Fir', kind: 'sawn', origin: 'NDS', grades: [
    { grade: '2', gradeLabel: 'No.2', ref: { Fb: mpa(850), Ft: mpa(525), Fv: mpa(150), FcPerp: mpa(405), Fc: mpa(1300), E: mpa(1_300_000), Emin: mpa(470_000), G: 0.43 } },
  ] },
  { species: 'SPF', speciesLabel: 'Spruce-Pine-Fir', kind: 'sawn', origin: 'NDS', grades: [
    { grade: '2', gradeLabel: 'No.2', ref: { Fb: mpa(875), Ft: mpa(450), Fv: mpa(135), FcPerp: mpa(425), Fc: mpa(1150), E: mpa(1_400_000), Emin: mpa(510_000), G: 0.42 } },
  ] },
  { species: 'SP', speciesLabel: 'Southern Pine', kind: 'sawn', origin: 'NDS', grades: [
    { grade: '2', gradeLabel: 'No.2', ref: { Fb: mpa(1050), Ft: mpa(650), Fv: mpa(175), FcPerp: mpa(565), Fc: mpa(1700), E: mpa(1_600_000), Emin: mpa(580_000), G: 0.55 } },
  ] },
  { species: 'GLULAM', speciesLabel: 'Glulam — Douglas Fir', kind: 'glulam', origin: 'NDS', grades: [
    { grade: '24F', gradeLabel: '24F-1.8E (24F-V4)', ref: { Fb: mpa(2400), Ft: mpa(1100), Fv: mpa(265), FcPerp: mpa(650), Fc: mpa(1650), E: mpa(1_800_000), Emin: mpa(950_000), G: 0.50 } },
  ] },
]

/** Flat id → material lookup (id = `${species}-${grade}`), derived from the
 *  structured spec.  Ids are stable ('DFL-SS', 'HF-2', 'GLULAM-24F', …). */
export const WOOD_SPECIES: Record<string, WoodSpecies> = Object.fromEntries(
  LIBRARY_SPEC.flatMap((s) => s.grades.map((g): [string, WoodSpecies] => {
    const id = `${s.species}-${g.grade}`
    return [id, {
      id, label: `${s.speciesLabel} — ${g.gradeLabel}`, kind: s.kind, ref: g.ref,
      species: s.species, speciesLabel: s.speciesLabel, grade: g.grade, gradeLabel: g.gradeLabel, origin: s.origin,
    }]
  })),
)

export function getWoodRef(id: string): WoodSpecies | undefined {
  return WOOD_SPECIES[id]
}

/** Distinct species for the species dropdown (first-seen order). */
export function speciesList(): { species: string; label: string; kind: WoodKind; origin: string }[] {
  const seen = new Map<string, { species: string; label: string; kind: WoodKind; origin: string }>()
  for (const e of Object.values(WOOD_SPECIES))
    if (!seen.has(e.species)) seen.set(e.species, { species: e.species, label: e.speciesLabel, kind: e.kind, origin: e.origin })
  return [...seen.values()]
}

/** Grades available for a species (the dependent grade dropdown). */
export function gradesOf(species: string): WoodSpecies[] {
  return Object.values(WOOD_SPECIES).filter((e) => e.species === species)
}

/** Resolve a (species, grade) pair to its material entry. */
export function resolveWoodSpecies(species: string, grade: string): WoodSpecies | undefined {
  return WOOD_SPECIES[`${species}-${grade}`]
}

/** The reference design values a wood section actually uses: an explicit
 *  `woodRef` (custom material — travels with the model) wins over the built-in
 *  library id.  Keeps the pure engine independent of any material registry. */
export function woodRefOf(sec: { woodSpecies?: string; woodRef?: WoodRefValues }): WoodRefValues | undefined {
  return sec.woodRef ?? (sec.woodSpecies ? getWoodRef(sec.woodSpecies)?.ref : undefined)
}

/** Validate a (possibly user-entered) reference-value set; returns human-
 *  readable errors, empty when usable.  Guards the custom-material path. */
export function validateWoodRef(r: Partial<WoodRefValues>): string[] {
  const errs: string[] = []
  const pos = (k: keyof WoodRefValues) => { const v = r[k]; if (!(typeof v === 'number' && Number.isFinite(v) && v > 0)) errs.push(`${k} must be a positive number`) }
  ;(['Fb', 'Ft', 'Fv', 'FcPerp', 'Fc', 'E', 'Emin', 'G'] as (keyof WoodRefValues)[]).forEach(pos)
  if (typeof r.E === 'number' && typeof r.Emin === 'number' && r.Emin >= r.E) errs.push('Emin (5th-percentile stability modulus) must be less than E')
  if (typeof r.G === 'number' && (r.G <= 0 || r.G > 1.4)) errs.push('specific gravity G must be within (0, 1.4]')
  return errs
}

// ── Load-duration factor CD (NDS Table 2.3.2) ──────────────────────────────
export type LoadDuration = 'permanent' | 'ten-year' | 'two-month' | 'seven-day' | 'ten-minute' | 'impact'
const CD_TABLE: Record<LoadDuration, number> = {
  permanent: 0.9, 'ten-year': 1.0, 'two-month': 1.15, 'seven-day': 1.25, 'ten-minute': 1.6, impact: 2.0,
}
/** CD for the governing load combination.  Wind/seismic → 1.6, snow → 1.15,
 *  occupancy live → 1.0, dead-only → 0.9. */
export function loadDurationFactor(d: LoadDuration): number { return CD_TABLE[d] }

// ── Wet-service factors CM (NDS Supplement Table 4A footnotes, sawn lumber) ──
// Applied when the in-service moisture content exceeds 19% (sawn) / 16% (glulam).
interface WetFactors { Fb: number; Ft: number; Fv: number; FcPerp: number; Fc: number; E: number }
const CM_SAWN: WetFactors = { Fb: 0.85, Ft: 1.0, Fv: 0.97, FcPerp: 0.67, Fc: 0.8, E: 0.9 }
const CM_GLULAM: WetFactors = { Fb: 0.8, Ft: 0.8, Fv: 0.875, FcPerp: 0.53, Fc: 0.73, E: 0.833 }

// ── Size factor CF (sawn timbers, NDS §4.3.6.2 eq. 4.3-1) ───────────────────
/** Bending/axial size factor for sawn "timbers" (least dimension ≥ 114 mm).
 *  CF = (300/d)^(1/9) ≤ 1.0 when depth d > 300 mm; else 1.0.  (300 mm ≈ 12 in.)
 *  Dimension lumber (38–89 mm thick) uses tabulated CF instead — pass it via
 *  `opts.CF` for those members. */
export function sizeFactorTimber(depthMm: number): number {
  return depthMm > 300 ? Math.min(1, Math.pow(300 / depthMm, 1 / 9)) : 1
}

// ── Volume factor CV (glulam, NDS §5.3.6 eq. 5.3-1) ─────────────────────────
/** Glulam volume factor; replaces CF and does not act simultaneously with CL
 *  (the lesser of CV, CL governs — §5.3.6).  KL = 1.0 for the common uniform /
 *  concentrated-midspan cases; x = 10 (species other than Southern Pine). */
export function volumeFactorGlulam(bMm: number, dMm: number, lengthMm: number, x = 10, KL = 1.0): number {
  const b = bMm / 25.4, d = dMm / 25.4, L = lengthMm / 25.4    // → in (formula is in customary units)
  return Math.min(1, KL * Math.pow(21 / L, 1 / x) * Math.pow(12 / d, 1 / x) * Math.pow(5.125 / b, 1 / x))
}

// ── Beam stability factor CL (NDS §3.3.3) ──────────────────────────────────
/** Effective bending length le from unbraced length lu (NDS Table 3.3.3,
 *  uniformly-distributed load).  d in mm. */
export function effectiveBendingLength(lu: number, d: number): number {
  const r = lu / d
  if (r < 7) return 2.06 * lu
  if (r <= 14.3) return 1.63 * lu + 3 * d
  return 1.84 * lu
}

export interface BeamStability { RB: number; FbE: number; CL: number }
/** CL from the reference-with-all-other-factors bending stress FbStar (Fb*). */
export function beamStabilityFactor(b: number, d: number, le: number, Emin: number, FbStar: number): BeamStability {
  if (le <= 0) return { RB: 0, FbE: Infinity, CL: 1 }      // continuously braced compression edge → CL = 1 (§3.3.3.3)
  const RB = Math.sqrt((le * d) / (b * b))                 // §3.3.3.6 (≤ 50)
  const FbE = (1.2 * Emin) / (RB * RB)                     // §3.3.3.8
  const a = (1 + FbE / FbStar) / 1.9
  const CL = a - Math.sqrt(Math.max(0, a * a - (FbE / FbStar) / 0.95))
  return { RB, FbE, CL }
}

// ── Column stability factor CP (NDS §3.7.1) ────────────────────────────────
export interface ColumnStability { slenderness: number; FcE: number; CP: number }
/** CP from the reference-with-all-other-factors compression stress FcStar (Fc*).
 *  le = effective length (Ke·lu) in the buckling plane; d = section dimension in
 *  that plane.  c = 0.8 sawn, 0.9 glulam. */
export function columnStabilityFactor(le: number, d: number, Emin: number, FcStar: number, c = 0.8): ColumnStability {
  const slenderness = le / d                               // §3.7.1.4 (≤ 50)
  const FcE = (0.822 * Emin) / (slenderness * slenderness) // §3.7.1.5
  const ratio = FcE / FcStar
  const a = (1 + ratio) / (2 * c)
  const CP = a - Math.sqrt(Math.max(0, a * a - ratio / c))
  return { slenderness, FcE, CP }
}

// ── Section properties (solid rectangle) ───────────────────────────────────
export function woodSectionProps(b: number, d: number): { A: number; S: number; I: number } {
  return { A: b * d, S: (b * d * d) / 6, I: (b * d * d * d) / 12 }
}

/** Approximate timber unit weight for self-weight, kN/m³, from specific gravity:
 *  γ ≈ G·9.81 (softwood G ≈ 0.4–0.5 → ~4–5; dense hardwood G ≈ 0.6 → ~6). For
 *  self-weight/mass only — NOT a design value. */
export function woodUnitWeight(G: number): number { return G * 9.81 }

// ── NDS Appendix N — LRFD format-conversion (KF·φ) and time-effect factor λ ──
// A strength-design timber check compares a FACTORED demand to an LRFD-adjusted
// design value F′ = F·(C factors)·KF·φ·λ, with CD replaced by λ (Table N3).
// KF·φ products: strength (Fb/Ft/Fv/Fc) 2.16, bearing (Fc⊥) 1.50, stability
// (Emin) 1.76·0.85 = 1.50.  λ ≈ 0.6 (1.4D), 0.8 (gravity D+L), 1.0 (W/E).
const KFP_STRENGTH = 2.16, KFP_BEARING = 1.503, KFP_STABILITY = 1.496

// ── Common adjustment-factor inputs ────────────────────────────────────────
export interface WoodAdjustOpts {
  duration?: LoadDuration   // → CD, ASD only (default 'ten-year')
  wet?: boolean             // → CM (default dry, all = 1)
  Ct?: number               // temperature factor (default 1.0, T ≤ 37.8 °C)
  Ci?: number               // incising factor (default 1.0, not incised)
  Cr?: number               // repetitive-member factor for Fb (default 1.0)
  CF?: number               // explicit size factor override (dimension lumber)
  /** 'ASD' (service demand ≤ allowable, uses CD) or 'LRFD' (factored demand ≤
   *  KF·φ·λ-adjusted, uses λ instead of CD).  Default 'ASD'. */
  method?: 'ASD' | 'LRFD'
  /** LRFD time-effect factor λ (Table N3); default 0.8 (gravity occupancy). */
  lambda?: number
}

/** All adjustment factors + adjusted stresses that do NOT depend on member
 *  slenderness (CL/CP are added by the beam/column checks). */
export interface WoodAdjusted {
  CD: number; CM: WetFactors; Ct: number; Ci: number; Cr: number; CF: number
  Emin: number                    // E′min = Emin·CM·Ct·Ci
  E: number                       // E′ = E·CM·Ct·Ci
  FbStar: number                  // Fb·(all except CL, CV, Cfu)
  FcStar: number                  // Fc·(all except CP)
  FvAllow: number                 // Fv′ (no stability term)
  FtAllow: number                 // Ft′
  FcPerpAllow: number             // Fc⊥′
}

export function woodAdjusted(ref: WoodRefValues, kind: WoodKind, d: number, opts: WoodAdjustOpts = {}): WoodAdjusted {
  const lrfd = (opts.method ?? 'ASD') === 'LRFD'
  const lambda = lrfd ? (opts.lambda ?? 0.8) : 1
  const CD = lrfd ? 1 : CD_TABLE[opts.duration ?? 'ten-year']   // LRFD uses λ, not CD
  const kF = lrfd ? KFP_STRENGTH : 1                            // KF·φ, strength values
  const kPerp = lrfd ? KFP_BEARING : 1                          // KF·φ, bearing
  const kE = lrfd ? KFP_STABILITY : 1                           // KF·φ, stability (Emin)
  const Ct = opts.Ct ?? 1
  const Ci = opts.Ci ?? 1
  const Cr = opts.Cr ?? 1
  const CF = opts.CF ?? (kind === 'sawn' ? sizeFactorTimber(d) : 1)
  const cm = opts.wet ? (kind === 'sawn' ? CM_SAWN : CM_GLULAM) : { Fb: 1, Ft: 1, Fv: 1, FcPerp: 1, Fc: 1, E: 1 }
  const Emin = ref.Emin * cm.E * Ct * Ci * kE
  const E = ref.E * cm.E * Ct * Ci                              // service modulus (deflection) — never converted
  // Fb* — all bending factors except CL (and CV / Cfu, folded in by the caller).
  const FbStar = ref.Fb * CD * cm.Fb * Ct * Ci * CF * Cr * kF * lambda
  const FcStar = ref.Fc * CD * cm.Fc * Ct * Ci * CF * kF * lambda
  return {
    CD, CM: cm, Ct, Ci, Cr, CF, Emin, E, FbStar, FcStar,
    FvAllow: ref.Fv * CD * cm.Fv * Ct * Ci * kF * lambda,
    FtAllow: ref.Ft * CD * cm.Ft * Ct * Ci * CF * kF * lambda,
    FcPerpAllow: ref.FcPerp * cm.FcPerp * Ct * Ci * kPerp,   // no CD/λ on bearing
  }
}

// ── Beam check (bending + horizontal shear) ────────────────────────────────
export interface WoodBeamResult {
  A: number; S: number
  fb: number; FbPrime: number; CL: number; RB: number      // bending
  fv: number; FvPrime: number                              // shear
  bendingRatio: number; shearRatio: number
  ratio: number; ok: boolean
  clause: string
}
/** Design a solid-rectangular timber beam.  M in kN·m, V in kN; lu = unbraced
 *  compression-edge length (mm), le auto per §3.3.3 unless overridden. */
export function checkWoodBeam(p: {
  ref: WoodRefValues; kind: WoodKind; b: number; d: number; length: number
  M: number; V: number; lu?: number; le?: number; opts?: WoodAdjustOpts
}): WoodBeamResult {
  const { A, S } = woodSectionProps(p.b, p.d)
  const adj = woodAdjusted(p.ref, p.kind, p.d, p.opts)
  const lu = p.lu ?? p.length
  const le = p.le ?? effectiveBendingLength(lu, p.d)
  const { RB, CL } = beamStabilityFactor(p.b, p.d, le, adj.Emin, adj.FbStar)
  // Glulam: the lesser of CV and CL applies (§5.3.6); sawn uses CL with CF in Fb*.
  let FbPrime: number
  if (p.kind === 'glulam') {
    const CV = volumeFactorGlulam(p.b, p.d, p.length)
    FbPrime = adj.FbStar * Math.min(CV, CL)
  } else {
    FbPrime = adj.FbStar * CL
  }
  const fb = (p.M * 1e6) / S                                // kN·m → N·mm, /mm³ = MPa
  const fv = (1.5 * p.V * 1e3) / A                          // rectangular: 1.5V/A, kN → N
  const bendingRatio = fb / FbPrime
  const shearRatio = fv / adj.FvAllow
  const ratio = Math.max(bendingRatio, shearRatio)
  return {
    A, S, fb, FbPrime, CL, RB, fv, FvPrime: adj.FvAllow,
    bendingRatio, shearRatio, ratio, ok: ratio <= 1,
    clause: 'NDS §3.3 / §3.4 (NSCP §6)',
  }
}

// ── Column check (axial compression + optional biaxial bending) ────────────
export interface WoodColumnResult {
  A: number
  fc: number; FcPrime: number; CP: number; slenderness: number; FcE: number
  axialRatio: number
  interaction: number       // NDS §3.9.2 beam-column, 0 if no moment
  ratio: number; ok: boolean
  clause: string
}
/** Design a solid-rectangular timber column.  P in kN (compression +),
 *  Mx/My in kN·m about the section's strong/weak axes; le = Ke·lu (mm) per axis. */
export function checkWoodColumn(p: {
  ref: WoodRefValues; kind: WoodKind; b: number; d: number; length: number
  P: number; Mx?: number; My?: number
  leD?: number; leB?: number    // effective length for buckling about depth(d)/width(b) axes
  luBendD?: number              // unbraced bending length for Mx (→ CL), default length
  opts?: WoodAdjustOpts
}): WoodColumnResult {
  const { A, S } = woodSectionProps(p.b, p.d)
  const adj = woodAdjusted(p.ref, p.kind, p.d, p.opts)
  const c = p.kind === 'glulam' ? 0.9 : 0.8
  const leD = p.leD ?? p.length, leB = p.leB ?? p.length
  // Governing slenderness = larger of the two plane ratios (le/d).
  const sD = columnStabilityFactor(leD, p.d, adj.Emin, adj.FcStar, c)
  const sB = columnStabilityFactor(leB, p.b, adj.Emin, adj.FcStar, c)
  const gov = sD.slenderness >= sB.slenderness ? sD : sB
  const FcPrime = adj.FcStar * gov.CP
  const fc = (p.P * 1e3) / A                                 // kN → N, MPa
  const axialRatio = fc / FcPrime

  let interaction = 0
  const Mx = p.Mx ?? 0
  if (Mx !== 0) {
    // §3.9.2 beam-column: (fc/Fc′)² + fb1/[Fb1′(1 − fc/FcE1)] ≤ 1.0.
    const le1 = p.luBendD ?? p.length
    const { CL } = beamStabilityFactor(p.b, p.d, effectiveBendingLength(le1, p.d), adj.Emin, adj.FbStar)
    const Fb1 = (p.kind === 'glulam')
      ? adj.FbStar * Math.min(volumeFactorGlulam(p.b, p.d, p.length), CL)
      : adj.FbStar * CL
    const fb1 = (Mx * 1e6) / S
    const FcE1 = sD.FcE                                      // buckling about the bending (depth) axis
    interaction = axialRatio * axialRatio + fb1 / (Fb1 * (1 - fc / FcE1))
  }
  const ratio = Math.max(axialRatio, interaction)
  return {
    A, fc, FcPrime, CP: gov.CP, slenderness: gov.slenderness, FcE: gov.FcE,
    axialRatio, interaction, ratio, ok: ratio <= 1,
    clause: 'NDS §3.7 / §3.9 (NSCP §6)',
  }
}
