// ─────────────────────────────────────────────────────────────────────────
// Test-standard catalogue for the soil-investigation module. Layer 8.
//
// Every field and laboratory test cites the standard it was run to, and a
// report that says "Moisture Content 18.4%" without saying "to ASTM D2216" is
// not a laboratory result — it is a number. So the standard is part of the
// data model, not decoration.
//
// This is a typed constant rather than a database table on purpose. The
// original design called for an `engineering_standards` table; the goal behind
// that (one place to change a designation, no string literals scattered through
// forty modules) is right, but a table is the wrong mechanism for a
// client-side app: a const gives the same single source of truth PLUS
// compile-time typo checking, tree-shaking, and no round-trip. `StandardId` is
// derived from the object, so a mistyped citation fails to compile.
// ─────────────────────────────────────────────────────────────────────────

export type StandardBody = 'ASTM' | 'AASHTO' | 'BS' | 'ISO' | 'NSCP' | 'PNS'

export type StandardCategory =
  | 'index'          // moisture, specific gravity, gradation, plasticity
  | 'classification'
  | 'compaction'
  | 'strength'
  | 'consolidation'
  | 'permeability'
  | 'field'
  | 'pavement'

export interface Standard {
  /** Designation as it must appear in a report, e.g. 'ASTM D2216'. */
  designation: string
  body: StandardBody
  title: string
  category: StandardCategory
  /**
   * Year of the edition this module was written against, when it matters.
   * Absent means the module does not depend on edition-specific content.
   */
  edition?: string
}

/**
 * The catalogue. Keys are stable machine ids — they appear in stored
 * investigation JSON, so RENAMING A KEY IS A BREAKING CHANGE that needs a
 * store migration. Designations may be edited freely; keys may not.
 */
export const STANDARDS = {
  // ── Index properties ──
  d2216: {
    designation: 'ASTM D2216', body: 'ASTM', category: 'index',
    title: 'Laboratory Determination of Water (Moisture) Content of Soil and Rock by Mass',
  },
  d854: {
    designation: 'ASTM D854', body: 'ASTM', category: 'index',
    title: 'Specific Gravity of Soil Solids by Water Pycnometer',
  },
  d6913: {
    designation: 'ASTM D6913', body: 'ASTM', category: 'index',
    title: 'Particle-Size Distribution (Gradation) of Soils Using Sieve Analysis',
  },
  d7928: {
    designation: 'ASTM D7928', body: 'ASTM', category: 'index',
    title: 'Particle-Size Distribution of Fine-Grained Soils Using the Sedimentation (Hydrometer) Analysis',
  },
  d4318: {
    designation: 'ASTM D4318', body: 'ASTM', category: 'index',
    title: 'Liquid Limit, Plastic Limit, and Plasticity Index of Soils',
  },

  // ── Classification ──
  d2487: {
    designation: 'ASTM D2487', body: 'ASTM', category: 'classification',
    title: 'Classification of Soils for Engineering Purposes (Unified Soil Classification System)',
  },
  d2488: {
    designation: 'ASTM D2488', body: 'ASTM', category: 'classification',
    title: 'Description and Identification of Soils (Visual-Manual Procedures)',
  },
  m145: {
    designation: 'AASHTO M 145', body: 'AASHTO', category: 'classification',
    title: 'Classification of Soils and Soil-Aggregate Mixtures for Highway Construction Purposes',
  },

  // ── Compaction ──
  d698: {
    designation: 'ASTM D698', body: 'ASTM', category: 'compaction',
    title: 'Laboratory Compaction Characteristics of Soil Using Standard Effort (600 kN·m/m³)',
  },
  d1557: {
    designation: 'ASTM D1557', body: 'ASTM', category: 'compaction',
    title: 'Laboratory Compaction Characteristics of Soil Using Modified Effort (2,700 kN·m/m³)',
  },

  // ── Strength ──
  d3080: {
    designation: 'ASTM D3080', body: 'ASTM', category: 'strength',
    title: 'Direct Shear Test of Soils Under Consolidated Drained Conditions',
  },
  d2166: {
    designation: 'ASTM D2166', body: 'ASTM', category: 'strength',
    title: 'Unconfined Compressive Strength of Cohesive Soil',
  },
  d2850: {
    designation: 'ASTM D2850', body: 'ASTM', category: 'strength',
    title: 'Unconsolidated-Undrained Triaxial Compression Test on Cohesive Soils',
  },
  d4767: {
    designation: 'ASTM D4767', body: 'ASTM', category: 'strength',
    title: 'Consolidated Undrained Triaxial Compression Test for Cohesive Soils',
  },
  d7181: {
    designation: 'ASTM D7181', body: 'ASTM', category: 'strength',
    title: 'Consolidated Drained Triaxial Compression Test for Soils',
  },

  // ── Consolidation & permeability ──
  d2435: {
    designation: 'ASTM D2435', body: 'ASTM', category: 'consolidation',
    title: 'One-Dimensional Consolidation Properties of Soils Using Incremental Loading',
  },
  d5084: {
    designation: 'ASTM D5084', body: 'ASTM', category: 'permeability',
    title: 'Measurement of Hydraulic Conductivity of Saturated Porous Materials Using a Flexible Wall Permeameter',
  },
  d2434: {
    designation: 'ASTM D2434', body: 'ASTM', category: 'permeability',
    title: 'Permeability of Granular Soils (Constant Head)',
  },

  // ── Field ──
  d1586: {
    designation: 'ASTM D1586', body: 'ASTM', category: 'field',
    title: 'Standard Penetration Test (SPT) and Split-Barrel Sampling of Soils',
  },
  d1587: {
    designation: 'ASTM D1587', body: 'ASTM', category: 'field',
    title: 'Thin-Walled Tube Sampling of Fine-Grained Soils for Geotechnical Purposes',
  },
  d2113: {
    designation: 'ASTM D2113', body: 'ASTM', category: 'field',
    title: 'Rock Core Drilling and Sampling of Rock for Site Exploration',
  },
  d2573: {
    designation: 'ASTM D2573', body: 'ASTM', category: 'field',
    title: 'Field Vane Shear Test in Saturated Fine-Grained Soils',
  },
  d5778: {
    designation: 'ASTM D5778', body: 'ASTM', category: 'field',
    title: 'Electronic Friction Cone and Piezocone Penetration Testing of Soils',
  },
  d1556: {
    designation: 'ASTM D1556', body: 'ASTM', category: 'field',
    title: 'Density and Unit Weight of Soil in Place by Sand-Cone Method',
  },

  // ── Pavement ──
  d1883: {
    designation: 'ASTM D1883', body: 'ASTM', category: 'pavement',
    title: 'California Bearing Ratio (CBR) of Laboratory-Compacted Soils',
  },
  d4546: {
    designation: 'ASTM D4546', body: 'ASTM', category: 'pavement',
    title: 'One-Dimensional Swell or Collapse of Soils',
  },
} as const satisfies Record<string, Standard>

export type StandardId = keyof typeof STANDARDS

export const standard = (id: StandardId): Standard => STANDARDS[id]

/** Report-ready citation, e.g. 'ASTM D4318'. */
export const cite = (id: StandardId): string => STANDARDS[id].designation

/** Citation with title, for an appendix or a methodology section. */
export const citeFull = (id: StandardId): string =>
  `${STANDARDS[id].designation} — ${STANDARDS[id].title}`

export const standardsByCategory = (category: StandardCategory): Standard[] =>
  (Object.keys(STANDARDS) as StandardId[])
    .map((id) => STANDARDS[id])
    .filter((s) => s.category === category)

export const isStandardId = (v: unknown): v is StandardId =>
  typeof v === 'string' && v in STANDARDS
