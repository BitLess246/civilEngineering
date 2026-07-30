// ─────────────────────────────────────────────────────────────────────────
// Soil-investigation data model. Layer 1 (schema) for the geotechnical
// investigation module.
//
// Pure, JSON-serialisable types shared by the classification, field-test,
// laboratory and parameter engines and by the UI. The whole investigation
// round-trips through `JSON.stringify` unchanged, which is what lets `store.ts`
// keep it in localStorage today and in Postgres later without the model moving.
//
// HIERARCHY
//
//     Investigation
//       └── Borehole            (or trial pit / CPT sounding)
//             ├── SoilLayer     (stratigraphy — what the ground IS)
//             ├── Sample        (what was taken out of it)
//             │     └── LabTest (what was measured on the sample)
//             └── SptTest       (measured in the hole, not on a sample)
//
// Samples hang off the BOREHOLE and reference a layer, rather than hanging off
// the layer. A sample recovered across a stratigraphic boundary belongs to the
// hole at a depth, not to one layer, and forcing it under a layer would make
// the boundary un-editable afterwards — re-picking a contact would orphan
// laboratory data that is far more expensive than the interpretation.
//
// MEASUREMENTS ARE STORED, RESULTS ARE COMPUTED. Every test keeps the numbers
// that were read off the apparatus. Water content is not stored; the container,
// wet and dry masses are, and w is computed from them. This costs a little
// space and buys the ability to re-derive everything when a correction
// methodology changes — the same reason `spt.blows` keeps all three increments
// instead of only N₆₀.
//
// UNITS (stated once, at the module boundary, per CLAUDE.md):
//   depth, elevation, length  m
//   masses                    g
//   unit weight               kN/m³
//   stress, strength, modulus kPa
//   permeability              m/s
//   angles                    degrees
//   percentages               0–100 (not 0–1)
//   dates                     ISO 'YYYY-MM-DD'
// ─────────────────────────────────────────────────────────────────────────

import type { SourcedValue } from './provenance'
import type { StandardId } from './standards'

// ── Investigation ─────────────────────────────────────────────────────────

export type InvestigationStatus =
  | 'draft'
  | 'fieldwork'
  | 'laboratory'
  | 'analysis'
  | 'review'
  | 'completed'

export interface SiteInfo {
  projectName: string
  client?: string
  location?: string
  /** Decimal degrees, WGS-84. */
  latitude?: number
  longitude?: number
  /** Site datum elevation, m. */
  elevation?: number
  description?: string
  /** Free-text notes on topography, access, existing structures. */
  existingConditions?: string
}

export interface InvestigationMeta {
  /** Investigation reference, e.g. 'SI-2026-014'. */
  investigationNo: string
  title: string
  site: SiteInfo
  consultant?: string
  engineer?: string
  organisation?: string
  /** ISO dates. */
  investigationDate?: string
  reportDate?: string
  status: InvestigationStatus
}

export interface Investigation {
  meta: InvestigationMeta
  boreholes: Borehole[]
  /** Interpreted design parameters per layer (Phase 5 fills these). */
  parameters: LayerParameters[]
  /** Free-text observations that belong to the investigation, not one hole. */
  fieldObservations?: string
}

// ── Borehole ──────────────────────────────────────────────────────────────

export type ExplorationKind = 'borehole' | 'trial-pit' | 'cpt' | 'cptu' | 'hand-auger'

export type DrillingMethod =
  | 'rotary-wash' | 'hollow-stem-auger' | 'solid-flight-auger'
  | 'percussion' | 'hand-auger' | 'excavated'

export interface Borehole {
  id: string
  /** Hole designation as it appears on the log, e.g. 'BH-01'. */
  name: string
  kind: ExplorationKind
  latitude?: number
  longitude?: number
  /** Ground surface elevation at the hole, m. */
  groundElevation?: number
  plannedDepth?: number
  /** Depth actually reached, m. */
  actualDepth: number
  /** Hole diameter, mm — feeds the SPT borehole-diameter correction C_B. */
  diameter?: number
  method?: DrillingMethod
  startDate?: string
  completionDate?: string
  /** Depth to groundwater, m below ground. Absent ⇒ not encountered. */
  groundwaterDepth?: number
  /** Depth after the hole stabilised, when a second reading was taken. */
  groundwaterDepthStabilised?: number
  terminationReason?: string
  remarks?: string

  layers: SoilLayer[]
  samples: Sample[]
  spt: SptTest[]
}

// ── Stratigraphy ──────────────────────────────────────────────────────────

export type Consistency =
  | 'very-soft' | 'soft' | 'firm' | 'stiff' | 'very-stiff' | 'hard'

export type Density =
  | 'very-loose' | 'loose' | 'medium-dense' | 'dense' | 'very-dense'

export type MoistureCondition = 'dry' | 'moist' | 'wet' | 'saturated'

export interface SoilLayer {
  id: string
  /** Depth below ground to the top and base of the layer, m. */
  depthTop: number
  depthBottom: number
  /**
   * USCS group symbol once classified, e.g. 'SC'. Left blank until Phase 1
   * classifies it — an unclassified layer is an honest state, and a guessed
   * symbol is not.
   */
  symbol?: string
  /** Descriptive name, e.g. 'Clayey Sand'. */
  name: string
  /** Full log description as it prints on the borehole log. */
  description?: string
  colour?: string
  consistency?: Consistency
  density?: Density
  moisture?: MoistureCondition
  remarks?: string
}

// ── Samples ───────────────────────────────────────────────────────────────

export type SampleType =
  | 'disturbed' | 'undisturbed' | 'split-spoon' | 'shelby-tube' | 'bulk' | 'core'

export interface Sample {
  id: string
  /** Sample designation on the log, e.g. 'S-03'. */
  name: string
  /** Layer this sample is attributed to, when it sits within one. */
  layerId?: string
  type: SampleType
  depthTop: number
  depthBottom: number
  standard?: StandardId
  /** Length of sample recovered and length of the drive, m — recovery ratio. */
  recoveryLength?: number
  driveLength?: number
  sampleDate?: string
  remarks?: string
  tests: LabTest[]
}

/** Recovery ratio as a percentage, or undefined when either length is absent. */
export function recoveryRatio(s: Sample): number | undefined {
  if (s.recoveryLength == null || !s.driveLength) return undefined
  return (s.recoveryLength / s.driveLength) * 100
}

// ── Field tests: SPT ──────────────────────────────────────────────────────

export type HammerType = 'donut' | 'safety' | 'automatic'
export type SamplerType = 'standard' | 'liner-absent'

/**
 * One SPT at one depth. The three 150 mm increments are kept separately: N is
 * the sum of the SECOND and THIRD, the first being the seating drive. Storing
 * only N would make that convention un-auditable.
 */
export interface SptTest {
  id: string
  /** Depth to the top of the drive, m. */
  depth: number
  /** Blows for each 150 mm increment. Index 0 is the seating drive. */
  blows: [number, number, number]
  /**
   * Penetration achieved in each increment, mm. Normally [150, 150, 150];
   * a short increment means refusal, which the N-value must not hide.
   */
  penetration?: [number, number, number]
  hammer?: HammerType
  /** Measured hammer energy ratio, %. Overrides the type default when given. */
  energyRatio?: number
  /** Rod length below the hammer, m — feeds C_R. */
  rodLength?: number
  sampler?: SamplerType
  /** Sample recovered from this drive, when one was kept. */
  sampleId?: string
  remarks?: string
}

/** Field N: the sum of the second and third increments (ASTM D1586). */
export const fieldN = (t: SptTest): number => t.blows[1] + t.blows[2]

/** True when any increment failed to reach 150 mm — refusal, N is a lower bound. */
export const isRefusal = (t: SptTest): boolean =>
  t.penetration != null && t.penetration.some((p) => p < 150)

// ── Laboratory tests ──────────────────────────────────────────────────────

export type LabTestType =
  | 'moisture' | 'specific-gravity' | 'sieve' | 'hydrometer' | 'atterberg'
  | 'compaction' | 'direct-shear' | 'triaxial' | 'ucs' | 'consolidation'
  | 'permeability' | 'cbr' | 'swell'

export type LabTestStatus = 'planned' | 'in-progress' | 'complete' | 'void'

/**
 * A laboratory test. `data` holds the raw measurements in a shape specific to
 * the test type — the individual test engines (Phase 4) own those shapes and
 * declare them; this layer only guarantees the envelope.
 *
 * A void test is kept rather than deleted. A specimen that failed on a seating
 * error is part of the record, and silently removing it makes the sample look
 * like it was tested once and passed.
 */
export interface LabTest {
  id: string
  type: LabTestType
  standard: StandardId
  status: LabTestStatus
  testDate?: string
  laboratory?: string
  operator?: string
  remarks?: string
  /** Raw measurements, keyed by the owning test engine. */
  data?: Record<string, unknown>
}

// ── Interpreted parameters ────────────────────────────────────────────────

/**
 * The design parameters for one layer — the single place downstream analysis
 * reads from, so a value is entered or interpreted once rather than retyped
 * into the bearing, settlement and slope pages separately.
 *
 * Every field is a `SourcedValue`, so the parameter table can show what each
 * number rests on. That is the whole point of the module: not to produce
 * parameters, but to produce parameters you can account for.
 */
export interface LayerParameters {
  /** The layer these describe. Layers in different holes are correlated by the
   *  engineer, so this points at ONE layer and the report says which hole. */
  layerId: string
  boreholeId: string

  unitWeight?: SourcedValue
  dryUnitWeight?: SourcedValue
  saturatedUnitWeight?: SourcedValue

  /** Total-stress parameters. */
  cohesion?: SourcedValue
  frictionAngle?: SourcedValue
  /** Effective-stress parameters (c′, φ′). */
  effectiveCohesion?: SourcedValue
  effectiveFrictionAngle?: SourcedValue
  undrainedShearStrength?: SourcedValue

  youngsModulus?: SourcedValue
  poissonRatio?: SourcedValue

  compressionIndex?: SourcedValue
  recompressionIndex?: SourcedValue
  preconsolidationPressure?: SourcedValue
  coefficientOfConsolidation?: SourcedValue

  permeability?: SourcedValue
  relativeDensity?: SourcedValue
  voidRatio?: SourcedValue
  specificGravity?: SourcedValue
}

/** Every populated parameter on a layer, for provenance summaries. */
export function parameterValues(p: LayerParameters): SourcedValue[] {
  const { layerId: _l, boreholeId: _b, ...rest } = p
  return Object.values(rest).filter((v): v is SourcedValue => v != null)
}

// ── Derived views ─────────────────────────────────────────────────────────

/**
 * Broad soil family of a layer, from its USCS symbol when classified and
 * otherwise from its description.
 *
 * IN A SOIL NAME THE NOUN GOVERNS. "Silty Sand" is a sand that happens to be
 * silty (SM); "Sandy Clay" is a clay. A first-match scan of the description
 * gets both backwards, which then propagates: the log draws the wrong hatch,
 * and an SPT of 6 in a silty sand gets described as "firm" — a cohesive
 * consistency term — instead of "loose". So the rule lives here, once, and
 * both the renderer and the SPT table read it.
 */
export type SoilFamily = 'gravel' | 'sand' | 'silt' | 'clay' | 'organic' | 'fill' | 'rock' | 'unknown'

export function soilFamily(symbol: string | undefined, name: string): SoilFamily {
  const s = (symbol ?? '').toUpperCase()
  const n = name.toLowerCase()
  if (n.includes('fill')) return 'fill'
  if (n.includes('rock') || n.includes('bedrock')) return 'rock'
  if (s.startsWith('G')) return 'gravel'
  if (s.startsWith('S')) return 'sand'
  if (s.startsWith('O') || n.includes('organic') || n.includes('peat')) return 'organic'
  if (s.startsWith('C')) return 'clay'
  if (s.startsWith('M')) return 'silt'

  // Description fallback: the LAST noun wins.
  const nouns: [string, SoilFamily][] = [
    ['gravel', 'gravel'], ['sand', 'sand'], ['silt', 'silt'], ['clay', 'clay'],
  ]
  let best: { at: number; family: SoilFamily } | undefined
  for (const [word, family] of nouns) {
    const at = n.lastIndexOf(word)
    if (at >= 0 && (!best || at > best.at)) best = { at, family }
  }
  return best?.family ?? 'unknown'
}

/** Whether a family is described by consistency (cohesive) or density (granular). */
export const isCohesive = (f: SoilFamily): boolean =>
  f === 'clay' || f === 'silt' || f === 'organic'

/** Layer thickness, m. */
export const layerThickness = (l: SoilLayer): number => l.depthBottom - l.depthTop

/** Elevation of a depth in a hole, or undefined when the collar is unsurveyed. */
export function elevationAt(bh: Borehole, depth: number): number | undefined {
  return bh.groundElevation == null ? undefined : bh.groundElevation - depth
}

/** The layer containing a depth, or undefined above/below the logged profile.
 *  A depth on a contact belongs to the LOWER layer, matching how a log reads. */
export function layerAtDepth(bh: Borehole, depth: number): SoilLayer | undefined {
  return bh.layers.find((l) => depth >= l.depthTop && depth < l.depthBottom)
    ?? bh.layers.find((l) => depth === l.depthBottom && l === bh.layers[bh.layers.length - 1])
}

/** Every laboratory test in a hole, flattened with its sample. */
export function boreholeTests(bh: Borehole): { sample: Sample; test: LabTest }[] {
  return bh.samples.flatMap((sample) => sample.tests.map((test) => ({ sample, test })))
}

/** An empty investigation with sensible metadata. */
export function emptyInvestigation(title = 'Untitled Investigation'): Investigation {
  return {
    meta: {
      investigationNo: '',
      title,
      site: { projectName: '' },
      status: 'draft',
    },
    boreholes: [],
    parameters: [],
  }
}
