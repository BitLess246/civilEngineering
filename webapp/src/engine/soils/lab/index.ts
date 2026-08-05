// ─────────────────────────────────────────────────────────────────────────
// Laboratory-test registry: the typed bridge between `LabTest.data` and the
// engine that understands it. Layer 8.
//
// `LabTest.data` is `Record<string, unknown>` in the schema, and deliberately
// so — layer 1 cannot know the shape of every test without depending on every
// test engine, which would invert the dependency. This module is where the
// shapes are declared, so a caller gets `MoistureData` rather than `unknown`
// without the schema growing a dozen imports.
//
// EVERY READER GOES THROUGH A GUARD. Stored investigations round-trip through
// JSON and through an import file a user may have edited, so a `data` blob is
// untrusted input, not a typed object that happens to be serialised. `readXxx`
// returns undefined on anything malformed rather than handing back a
// half-populated object that computes a plausible wrong answer.
//
// Adding a test: declare its Data type in its own module, add a case here, and
// add a row to LAB_TESTS. The test suite asserts the three stay in step.
// ─────────────────────────────────────────────────────────────────────────

import type { LabTest, LabTestType } from '../model'
import type { StandardId } from '../standards'
import type { CalcId } from '../registry'
import { type MoistureData, moistureContent, type MoistureResult } from './moisture'
import {
  type SpecificGravityData, specificGravity, type SpecificGravityResult,
} from './specificGravity'
import { type SieveInput, type SieveReading, gradation, type GradationResult } from '../sieve'
import { type AtterbergInput, atterberg, type AtterbergResult } from '../atterberg'
import {
  type DirectShearData, type ShearPoint, directShear, type DirectShearResult,
} from './directShear'
import { type UcsData, type UcsSoil, ucs, type UcsResult } from './ucs'
import {
  type ConsolidationData, type ConsolidationPoint, consolidation,
  type ConsolidationResult,
} from './consolidation'
import {
  type CompactionData, type CompactionPoint, type CompactionEffort, compaction,
  type CompactionResult,
} from './compaction'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Every declared numeric field present and finite. */
const hasNumbers = (o: Record<string, unknown>, keys: string[]): boolean =>
  keys.every((k) => finite(o[k]))

// ── Guards ────────────────────────────────────────────────────────────────

export function readMoisture(test: LabTest): MoistureData | undefined {
  const d = test.data
  if (!isRecord(d) || !hasNumbers(d, ['containerMass', 'wetMass', 'dryMass'])) return undefined
  return {
    container: typeof d.container === 'string' ? d.container : undefined,
    containerMass: d.containerMass as number,
    wetMass: d.wetMass as number,
    dryMass: d.dryMass as number,
    temperature: finite(d.temperature) ? d.temperature : undefined,
  }
}

export function readSpecificGravity(test: LabTest): SpecificGravityData | undefined {
  const d = test.data
  if (!isRecord(d) || !hasNumbers(d, ['solidMass', 'pycWaterMass', 'pycWaterSolidMass'])) return undefined
  return {
    pycnometer: typeof d.pycnometer === 'string' ? d.pycnometer : undefined,
    solidMass: d.solidMass as number,
    pycWaterMass: d.pycWaterMass as number,
    pycWaterSolidMass: d.pycWaterSolidMass as number,
    temperature: finite(d.temperature) ? d.temperature : undefined,
  }
}

/**
 * Sieve stack. The readings are a variable-length array rather than a fixed set
 * of fields, so the guard walks them: a row missing its size or its mass is
 * DROPPED rather than read as zero, because a zero mass retained is a real
 * measurement and an absent one is not.
 */
export function readSieve(test: LabTest): SieveInput | undefined {
  const d = test.data
  if (!isRecord(d) || !finite(d.totalMass) || !Array.isArray(d.readings)) return undefined

  const readings: SieveReading[] = []
  for (const r of d.readings) {
    if (!isRecord(r) || !finite(r.size) || !finite(r.massRetained)) continue
    readings.push({
      size: r.size,
      designation: typeof r.designation === 'string' ? r.designation : undefined,
      massRetained: r.massRetained,
    })
  }
  if (!readings.length) return undefined

  return {
    totalMass: d.totalMass,
    readings,
    panMass: finite(d.panMass) ? d.panMass : undefined,
  }
}

/**
 * Atterberg limits. A liquid limit is required; the plastic limit may be
 * absent, which means NON-PLASTIC and is a different claim from PI = 0.
 */
export function readAtterberg(test: LabTest): AtterbergInput | undefined {
  const d = test.data
  if (!isRecord(d) || !finite(d.liquidLimit)) return undefined
  return {
    liquidLimit: d.liquidLimit,
    plasticLimit: finite(d.plasticLimit) ? d.plasticLimit : undefined,
    nonPlastic: d.nonPlastic === true,
    shrinkageLimit: finite(d.shrinkageLimit) ? d.shrinkageLimit : undefined,
    naturalMoisture: finite(d.naturalMoisture) ? d.naturalMoisture : undefined,
  }
}

/**
 * Direct shear. Like the sieve stack this carries a variable-length table —
 * one row per specimen — and a row missing either stress is DROPPED, because a
 * specimen with no recorded normal stress cannot sit on an envelope.
 */
export function readDirectShear(test: LabTest): DirectShearData | undefined {
  const d = test.data
  if (!isRecord(d) || !Array.isArray(d.points)) return undefined

  const points: ShearPoint[] = []
  for (const r of d.points) {
    if (!isRecord(r) || !finite(r.normalStress) || !finite(r.peakShear)) continue
    points.push({
      normalStress: r.normalStress,
      peakShear: r.peakShear,
      residualShear: finite(r.residualShear) ? r.residualShear : undefined,
    })
  }
  if (points.length < 2) return undefined

  const t = d.testType
  return {
    points,
    testType: t === 'CD' || t === 'CU' || t === 'UU' ? t : undefined,
  }
}

const UCS_SOILS: UcsSoil[] = ['saturated-cohesive', 'fissured', 'partly-saturated', 'granular']

export function readUcs(test: LabTest): { data: UcsData; soil: UcsSoil } | undefined {
  const d = test.data
  if (!isRecord(d) || !hasNumbers(d, ['diameter', 'height', 'failureLoad', 'failureDeformation'])) {
    return undefined
  }
  const soil = UCS_SOILS.find((s) => s === d.soil) ?? 'saturated-cohesive'
  return {
    soil,
    data: {
      diameter: d.diameter as number,
      height: d.height as number,
      failureLoad: d.failureLoad as number,
      failureDeformation: d.failureDeformation as number,
      unitWeight: finite(d.unitWeight) ? d.unitWeight : undefined,
    },
  }
}

/** Oedometer increments — another variable-length table; malformed rows drop. */
export function readConsolidation(test: LabTest): ConsolidationData | undefined {
  const d = test.data
  if (!isRecord(d)) return undefined
  if (!hasNumbers(d, ['initialHeight', 'diameter', 'dryMass', 'specificGravity'])) return undefined
  if (!Array.isArray(d.points)) return undefined

  const points: ConsolidationPoint[] = []
  for (const r of d.points) {
    if (!isRecord(r) || !finite(r.stress) || !finite(r.compression)) continue
    points.push({
      stress: r.stress,
      compression: r.compression,
      t50: finite(r.t50) ? r.t50 : undefined,
    })
  }
  if (points.length < 3) return undefined

  return {
    initialHeight: d.initialHeight as number,
    diameter: d.diameter as number,
    dryMass: d.dryMass as number,
    specificGravity: d.specificGravity as number,
    points,
  }
}

/**
 * Proctor points — one compacted mould per row. A row missing either its water
 * content or its mould mass is DROPPED: a point with no water content has no
 * position on the curve, and one at an assumed zero would drag the fitted peak
 * toward the dry end of the axis.
 */
export function readCompaction(test: LabTest): CompactionData | undefined {
  const d = test.data
  if (!isRecord(d) || !hasNumbers(d, ['mouldVolume', 'mouldMass'])) return undefined
  if (!Array.isArray(d.points)) return undefined

  const points: CompactionPoint[] = []
  for (const r of d.points) {
    if (!isRecord(r) || !finite(r.moisture) || !finite(r.mouldSoilMass)) continue
    points.push({ moisture: r.moisture, mouldSoilMass: r.mouldSoilMass })
  }
  if (points.length < 3) return undefined

  const e = d.effort
  return {
    mouldVolume: d.mouldVolume as number,
    mouldMass: d.mouldMass as number,
    specificGravity: finite(d.specificGravity) ? d.specificGravity : undefined,
    effort: e === 'modified' || e === 'standard' ? (e as CompactionEffort) : undefined,
    points,
  }
}

// ── Catalogue ─────────────────────────────────────────────────────────────

/** One numeric input on a test form. */
export interface LabField {
  key: string
  label: string
  unit?: string
  /** Optional when the standard allows it to be omitted. */
  optional?: boolean
  /** Sensible starting value for a blank form. */
  placeholder?: number
}

/**
 * How a test's form is laid out. Most tests are a flat list of numbers; a sieve
 * stack is a variable-length table, which no `LabField[]` can express.
 */
export type LabFormKind =
  | 'fields' | 'sieve-stack' | 'shear-points' | 'load-increments' | 'compaction-points'

export interface LabTestSpec {
  type: LabTestType
  label: string
  /** Defaults to 'fields'. */
  formKind?: LabFormKind
  standard: StandardId
  /** Registry calculation this test's result is derived by. */
  calculation?: CalcId
  /** Whether the test needs an undisturbed specimen. */
  needsUndisturbed: boolean
  /** Raw measurements the form collects. */
  fields: LabField[]
  /** One line on what the test is for. */
  purpose: string
}

/**
 * Declared tests. Entries without `fields` are not yet implemented — they can
 * still be BOOKED against a sample (status 'planned'), which is how a
 * laboratory schedule works, but they have no data form until their engine
 * lands. Saying so is better than hiding the test from the list and making the
 * schedule look shorter than it is.
 */
export const LAB_TESTS: readonly LabTestSpec[] = [
  {
    type: 'moisture',
    label: 'Water content',
    standard: 'd2216',
    calculation: 'moisture.water-content',
    needsUndisturbed: false,
    purpose: 'The water content every other index property leans on.',
    fields: [
      { key: 'containerMass', label: 'Container', unit: 'g', placeholder: 25 },
      { key: 'wetMass', label: 'Container + wet soil', unit: 'g', placeholder: 85 },
      { key: 'dryMass', label: 'Container + dry soil', unit: 'g', placeholder: 75 },
      { key: 'temperature', label: 'Drying temperature', unit: '°C', optional: true, placeholder: 110 },
    ],
  },
  {
    type: 'specific-gravity',
    label: 'Specific gravity',
    standard: 'd854',
    calculation: 'gs.specific-gravity',
    needsUndisturbed: false,
    purpose: 'Density of the solids, needed for void ratio, saturation and consolidation.',
    fields: [
      { key: 'solidMass', label: 'Oven-dry solids', unit: 'g', placeholder: 25 },
      { key: 'pycWaterMass', label: 'Pycnometer + water', unit: 'g', placeholder: 675 },
      { key: 'pycWaterSolidMass', label: 'Pycnometer + water + solids', unit: 'g', placeholder: 690.6 },
      { key: 'temperature', label: 'Test temperature', unit: '°C', optional: true, placeholder: 20 },
    ],
  },
  // Declared but not yet implemented — see the note above.
  {
    type: 'sieve',
    label: 'Sieve analysis',
    standard: 'd6913',
    formKind: 'sieve-stack',
    calculation: 'sieve.percent-passing',
    needsUndisturbed: false,
    purpose: 'Grain-size distribution by sieving — the fractions the USCS classifier needs.',
    fields: [
      { key: 'totalMass', label: 'Total dry specimen', unit: 'g', placeholder: 500 },
      { key: 'panMass', label: 'Pan', unit: 'g', optional: true, placeholder: 20 },
    ],
  },
  { type: 'hydrometer', label: 'Hydrometer', standard: 'd7928', needsUndisturbed: false, fields: [], purpose: 'Grain-size distribution of the fines by sedimentation.' },
  {
    type: 'atterberg',
    label: 'Atterberg limits',
    standard: 'd4318',
    calculation: 'atterberg.plasticity-index',
    needsUndisturbed: false,
    purpose: 'Liquid and plastic limits, which decide whether the fines behave as clay or silt.',
    fields: [
      { key: 'liquidLimit', label: 'Liquid limit', unit: '%', placeholder: 42 },
      { key: 'plasticLimit', label: 'Plastic limit', unit: '%', optional: true, placeholder: 23 },
      { key: 'naturalMoisture', label: 'Natural moisture', unit: '%', optional: true, placeholder: 30 },
      { key: 'shrinkageLimit', label: 'Shrinkage limit', unit: '%', optional: true, placeholder: 12 },
    ],
  },
  {
    type: 'compaction',
    label: 'Compaction (Proctor)',
    standard: 'd698',
    formKind: 'compaction-points',
    calculation: 'compaction.optimum',
    needsUndisturbed: false,
    purpose: 'Maximum dry density and optimum moisture content — what every field density test is a percentage of.',
    fields: [
      { key: 'mouldVolume', label: 'Mould volume', unit: 'cm³', placeholder: 944 },
      { key: 'mouldMass', label: 'Empty mould', unit: 'g', placeholder: 4250 },
      { key: 'specificGravity', label: 'Specific gravity Gs', optional: true, placeholder: 2.7 },
    ],
  },
  {
    type: 'direct-shear',
    label: 'Direct shear',
    standard: 'd3080',
    formKind: 'shear-points',
    calculation: 'directshear.envelope',
    needsUndisturbed: true,
    purpose: 'Effective cohesion and friction angle from the Mohr–Coulomb failure envelope.',
    fields: [],
  },
  { type: 'triaxial', label: 'Triaxial', standard: 'd4767', needsUndisturbed: true, fields: [], purpose: 'Shear strength under controlled drainage and confinement.' },
  {
    type: 'ucs',
    label: 'Unconfined compression',
    standard: 'd2166',
    calculation: 'ucs.qu',
    needsUndisturbed: true,
    purpose: 'Undrained shear strength of a saturated cohesive soil.',
    fields: [
      { key: 'diameter', label: 'Diameter', unit: 'mm', placeholder: 38 },
      { key: 'height', label: 'Height', unit: 'mm', placeholder: 76 },
      { key: 'failureLoad', label: 'Load at failure', unit: 'N', placeholder: 120 },
      { key: 'failureDeformation', label: 'Deformation at failure', unit: 'mm', placeholder: 6 },
      { key: 'unitWeight', label: 'Bulk unit weight', unit: 'kN/m³', optional: true, placeholder: 18 },
    ],
  },
  {
    type: 'consolidation',
    label: 'Consolidation',
    standard: 'd2435',
    formKind: 'load-increments',
    calculation: 'consolidation.cc',
    needsUndisturbed: true,
    purpose: 'Cc, Cr and σ′p — the three numbers a settlement analysis runs on.',
    fields: [
      { key: 'initialHeight', label: 'Initial height', unit: 'mm', placeholder: 20 },
      { key: 'diameter', label: 'Diameter', unit: 'mm', placeholder: 75 },
      { key: 'dryMass', label: 'Oven-dry mass', unit: 'g', placeholder: 79.5 },
      { key: 'specificGravity', label: 'Specific gravity Gs', placeholder: 2.7 },
    ],
  },
  { type: 'permeability', label: 'Permeability', standard: 'd5084', needsUndisturbed: true, fields: [], purpose: 'Hydraulic conductivity.' },
  { type: 'cbr', label: 'CBR', standard: 'd1883', needsUndisturbed: false, fields: [], purpose: 'Bearing ratio for pavement design.' },
  { type: 'swell', label: 'Swell / collapse', standard: 'd4546', needsUndisturbed: true, fields: [], purpose: 'One-dimensional swell or collapse on wetting.' },
]

export const labSpec = (type: LabTestType): LabTestSpec | undefined =>
  LAB_TESTS.find((t) => t.type === type)

/**
 * Whether a spec has a data form. Flat forms declare `fields`; table-driven
 * ones (a sieve stack, a set of shear specimens) carry their inputs in a table
 * and may declare none, so counting fields alone reports them as unimplemented
 * — which it did for direct shear until a test caught it.
 */
const hasForm = (t: LabTestSpec): boolean =>
  t.fields.length > 0 || (t.formKind != null && t.formKind !== 'fields')

/** Tests that have a data form today. */
export const implementedTests = (): LabTestSpec[] => LAB_TESTS.filter(hasForm)

/** Whether a test type can currently accept results. */
export const isImplemented = (type: LabTestType): boolean => {
  const spec = labSpec(type)
  return spec ? hasForm(spec) : false
}

// ── Evaluation ────────────────────────────────────────────────────────────

export type LabOutcome =
  | { kind: 'moisture'; result: MoistureResult }
  | { kind: 'specific-gravity'; result: SpecificGravityResult }
  | { kind: 'sieve'; result: GradationResult }
  | { kind: 'atterberg'; result: AtterbergResult }
  | { kind: 'direct-shear'; result: DirectShearResult }
  | { kind: 'ucs'; result: UcsResult }
  | { kind: 'consolidation'; result: ConsolidationResult }
  | { kind: 'compaction'; result: CompactionResult }

/**
 * Compute a test's result from its stored data.
 *
 * Returns undefined when the data is absent or malformed, and rethrows nothing:
 * an engine that throws on impossible input (a dry mass above the wet mass) is
 * reporting a data error, and the caller shows it rather than the page dying.
 */
export function evaluateTest(test: LabTest): { outcome?: LabOutcome; error?: string } {
  try {
    switch (test.type) {
      case 'moisture': {
        const d = readMoisture(test)
        if (!d) return {}
        return { outcome: { kind: 'moisture', result: moistureContent(d) } }
      }
      case 'specific-gravity': {
        const d = readSpecificGravity(test)
        if (!d) return {}
        return { outcome: { kind: 'specific-gravity', result: specificGravity(d) } }
      }
      case 'sieve': {
        const d = readSieve(test)
        if (!d) return {}
        return { outcome: { kind: 'sieve', result: gradation(d) } }
      }
      case 'atterberg': {
        const d = readAtterberg(test)
        if (!d) return {}
        return { outcome: { kind: 'atterberg', result: atterberg(d) } }
      }
      case 'direct-shear': {
        const d = readDirectShear(test)
        if (!d) return {}
        return { outcome: { kind: 'direct-shear', result: directShear(d) } }
      }
      case 'ucs': {
        const d = readUcs(test)
        if (!d) return {}
        return { outcome: { kind: 'ucs', result: ucs(d.data, d.soil) } }
      }
      case 'consolidation': {
        const d = readConsolidation(test)
        if (!d) return {}
        return { outcome: { kind: 'consolidation', result: consolidation(d) } }
      }
      case 'compaction': {
        const d = readCompaction(test)
        if (!d) return {}
        return { outcome: { kind: 'compaction', result: compaction(d) } }
      }
      default:
        return {}
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

/** The headline number a results table shows, with its unit. */
export function summarise(outcome: LabOutcome): { label: string; value: number; unit: string } {
  switch (outcome.kind) {
    case 'moisture':
      return { label: 'w', value: outcome.result.waterContent, unit: '%' }
    case 'specific-gravity':
      return { label: 'Gs', value: outcome.result.gs, unit: '' }
    case 'sieve':
      return { label: 'fines', value: outcome.result.fines, unit: '%' }
    case 'atterberg':
      return { label: 'PI', value: outcome.result.plasticityIndex, unit: '%' }
    case 'direct-shear':
      return { label: "φ'", value: outcome.result.peak.frictionAngle, unit: '°' }
    case 'ucs':
      return { label: 'qu', value: outcome.result.qu, unit: 'kPa' }
    case 'consolidation':
      return { label: 'Cc', value: outcome.result.cc, unit: '' }
    case 'compaction':
      // The peak as a unit weight, which is the module's reporting convention
      // (model.ts) and the form the bearing and earth-pressure engines take.
      return { label: 'γd,max', value: outcome.result.maxDryUnitWeight, unit: 'kN/m³' }
  }
}
