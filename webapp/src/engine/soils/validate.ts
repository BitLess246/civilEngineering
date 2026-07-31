// ─────────────────────────────────────────────────────────────────────────
// Soil-investigation integrity validation. Layer 1.
//
// Returns a flat list of issues so the UI can surface every problem at once
// rather than throwing on the first. Errors block save/import; warnings are
// advisory and must not.
//
// THE RULE THIS MODULE EXISTS TO ENFORCE: never silently repair engineering
// data. If a log has a gap between 4.20 m and 4.50 m, that gap is either a
// logging error or an unrecovered interval, and only the person who was on the
// rig knows which. Closing it automatically would destroy the evidence that
// something needs checking, and would do it invisibly. So every rule here
// REPORTS and none of them mutate.
//
// The second rule: distinguish "impossible" from "unusual". A plastic limit
// above the liquid limit is impossible — that is an error. An SPT N of 2 is
// unusual, and perfectly real in soft clay — that is a warning. Flagging the
// second as an error would train the user to ignore the first.
// ─────────────────────────────────────────────────────────────────────────

import {
  type Investigation, type Borehole,
  fieldN, layerThickness, recoveryRatio, isCone,
} from './model'

export type IssueSeverity = 'error' | 'warning'

export interface ValidationIssue {
  severity: IssueSeverity
  /** Stable machine code, e.g. 'layer-gap'. */
  code: string
  message: string
  boreholeId?: string
  layerId?: string
  sampleId?: string
  testId?: string
}

/** Depths within this tolerance are treated as coincident (mm, expressed in m). */
const DEPTH_TOL = 1e-6

export function validateInvestigation(inv: Investigation): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const err = (code: string, message: string, ref: Partial<ValidationIssue> = {}) =>
    issues.push({ severity: 'error', code, message, ...ref })
  const warn = (code: string, message: string, ref: Partial<ValidationIssue> = {}) =>
    issues.push({ severity: 'warning', code, message, ...ref })

  if (!inv.meta.title.trim()) warn('no-title', 'The investigation has no title.')
  if (!inv.meta.investigationNo.trim()) {
    warn('no-investigation-no', 'No investigation number — the report cover will be incomplete.')
  }
  if (!inv.boreholes.length) warn('no-boreholes', 'No boreholes have been logged yet.')

  const boreholeIds = new Set<string>()
  const boreholeNames = new Set<string>()
  const layerIds = new Set<string>()

  for (const bh of inv.boreholes) {
    if (boreholeIds.has(bh.id)) err('duplicate-borehole-id', `Duplicate borehole id "${bh.id}".`, { boreholeId: bh.id })
    boreholeIds.add(bh.id)

    if (boreholeNames.has(bh.name)) {
      err('duplicate-borehole-name',
        `Two boreholes are both called "${bh.name}" — logs and the location plan would be ambiguous.`,
        { boreholeId: bh.id })
    }
    boreholeNames.add(bh.name)

    validateBorehole(bh, err, warn, layerIds)
  }

  // Parameters must point at layers that exist, in the hole they claim.
  const layersByBorehole = new Map(inv.boreholes.map((b) => [b.id, new Set(b.layers.map((l) => l.id))]))
  for (const p of inv.parameters) {
    const holeLayers = layersByBorehole.get(p.boreholeId)
    if (!holeLayers) {
      err('parameters-unknown-borehole',
        `Design parameters reference borehole "${p.boreholeId}", which does not exist.`,
        { boreholeId: p.boreholeId, layerId: p.layerId })
    } else if (!holeLayers.has(p.layerId)) {
      err('parameters-unknown-layer',
        `Design parameters reference layer "${p.layerId}", which is not in borehole "${p.boreholeId}".`,
        { boreholeId: p.boreholeId, layerId: p.layerId })
    }
  }

  return issues
}

type Report = (code: string, message: string, ref?: Partial<ValidationIssue>) => void

function validateBorehole(bh: Borehole, err: Report, warn: Report, seenLayerIds: Set<string>): void {
  const ref = { boreholeId: bh.id }

  if (!(bh.actualDepth > 0)) {
    err('borehole-no-depth', `${bh.name}: termination depth must be greater than zero.`, ref)
  }
  if (bh.plannedDepth != null && bh.actualDepth < bh.plannedDepth - DEPTH_TOL) {
    warn('borehole-short',
      `${bh.name}: terminated at ${bh.actualDepth.toFixed(2)} m, short of the planned ${bh.plannedDepth.toFixed(2)} m.` +
      (bh.terminationReason ? '' : ' No termination reason recorded.'), ref)
  }
  if (bh.groundwaterDepth != null && bh.groundwaterDepth > bh.actualDepth + DEPTH_TOL) {
    err('groundwater-below-hole',
      `${bh.name}: groundwater logged at ${bh.groundwaterDepth.toFixed(2)} m, below the ${bh.actualDepth.toFixed(2)} m termination depth.`,
      ref)
  }
  if (bh.startDate && bh.completionDate && bh.completionDate < bh.startDate) {
    err('borehole-dates', `${bh.name}: completion date is before the start date.`, ref)
  }

  validateStratigraphy(bh, err, warn, seenLayerIds)

  // ── Samples ──
  const sampleIds = new Set<string>()
  const layerIdSet = new Set(bh.layers.map((l) => l.id))
  for (const s of bh.samples) {
    const sref = { ...ref, sampleId: s.id }
    if (sampleIds.has(s.id)) err('duplicate-sample-id', `Duplicate sample id "${s.id}".`, sref)
    sampleIds.add(s.id)

    if (s.depthBottom < s.depthTop - DEPTH_TOL) {
      err('sample-inverted', `${bh.name}/${s.name}: sample base is above its top.`, sref)
    }
    if (s.depthBottom > bh.actualDepth + DEPTH_TOL) {
      err('sample-below-hole',
        `${bh.name}/${s.name}: sample extends to ${s.depthBottom.toFixed(2)} m, below the termination depth.`, sref)
    }
    if (s.layerId && !layerIdSet.has(s.layerId)) {
      err('sample-unknown-layer', `${bh.name}/${s.name}: attributed to layer "${s.layerId}", which is not in this hole.`, sref)
    }

    const rec = recoveryRatio(s)
    if (rec != null) {
      if (rec > 100 + 1e-9) {
        err('recovery-over-100',
          `${bh.name}/${s.name}: recovery of ${rec.toFixed(0)}% exceeds the drive length.`, sref)
      } else if (rec < 50) {
        warn('low-recovery',
          `${bh.name}/${s.name}: recovery ${rec.toFixed(0)}% — laboratory results on this sample carry reduced confidence.`, sref)
      }
    }

    // Undisturbed testing on a disturbed sample is a category error worth naming.
    const STRENGTH_TESTS = new Set(['triaxial', 'ucs', 'consolidation', 'direct-shear', 'permeability'])
    if (s.type === 'disturbed' || s.type === 'bulk' || s.type === 'split-spoon') {
      for (const t of s.tests) {
        if (STRENGTH_TESTS.has(t.type) && t.status !== 'void') {
          warn('strength-test-on-disturbed',
            `${bh.name}/${s.name}: a ${t.type} test on a ${s.type} sample — strength and compressibility need an undisturbed specimen.`,
            { ...sref, testId: t.id })
        }
      }
    }

    const testIds = new Set<string>()
    for (const t of s.tests) {
      if (testIds.has(t.id)) err('duplicate-test-id', `Duplicate test id "${t.id}".`, { ...sref, testId: t.id })
      testIds.add(t.id)
    }
  }

  validateSpt(bh, err, warn, sampleIds)
  validateCpt(bh, err, warn)
}

/**
 * Stratigraphy must be ordered, contiguous and non-overlapping. Overlaps are
 * errors (two soils cannot occupy the same ground); gaps are warnings, because
 * an unrecovered interval is a real thing a log can honestly record.
 */
function validateStratigraphy(bh: Borehole, err: Report, warn: Report, seenLayerIds: Set<string>): void {
  const ref = { boreholeId: bh.id }
  if (!bh.layers.length) {
    warn('no-layers', `${bh.name}: no soil layers logged.`, ref)
    return
  }

  for (const l of bh.layers) {
    const lref = { ...ref, layerId: l.id }
    if (seenLayerIds.has(l.id)) err('duplicate-layer-id', `Duplicate layer id "${l.id}".`, lref)
    seenLayerIds.add(l.id)

    if (layerThickness(l) <= DEPTH_TOL) {
      err('layer-zero-thickness',
        `${bh.name}: layer "${l.name}" has zero or negative thickness (${l.depthTop} – ${l.depthBottom} m).`, lref)
    }
    if (l.depthTop < -DEPTH_TOL) {
      err('layer-negative-depth', `${bh.name}: layer "${l.name}" starts above ground level.`, lref)
    }
  }

  const sorted = [...bh.layers].sort((a, b) => a.depthTop - b.depthTop)
  if (sorted.some((l, i) => l !== bh.layers[i])) {
    warn('layers-unordered', `${bh.name}: layers are not stored in depth order.`, ref)
  }

  if (sorted[0].depthTop > DEPTH_TOL) {
    warn('profile-starts-below-ground',
      `${bh.name}: the logged profile starts at ${sorted[0].depthTop.toFixed(2)} m, not at ground level.`, ref)
  }

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1], cur = sorted[i]
    const gap = cur.depthTop - prev.depthBottom
    if (gap < -DEPTH_TOL) {
      err('layer-overlap',
        `${bh.name}: "${prev.name}" and "${cur.name}" overlap between ${cur.depthTop.toFixed(2)} m and ${prev.depthBottom.toFixed(2)} m.`,
        { ...ref, layerId: cur.id })
    } else if (gap > DEPTH_TOL) {
      warn('layer-gap',
        `${bh.name}: unlogged interval between ${prev.depthBottom.toFixed(2)} m and ${cur.depthTop.toFixed(2)} m — record it as an unrecovered run or close the contact.`,
        { ...ref, layerId: cur.id })
    }
  }

  const base = sorted[sorted.length - 1].depthBottom
  if (base < bh.actualDepth - DEPTH_TOL) {
    warn('profile-short-of-termination',
      `${bh.name}: the logged profile ends at ${base.toFixed(2)} m but the hole reached ${bh.actualDepth.toFixed(2)} m.`, ref)
  }
  if (base > bh.actualDepth + DEPTH_TOL) {
    err('profile-below-termination',
      `${bh.name}: the logged profile reaches ${base.toFixed(2)} m, deeper than the ${bh.actualDepth.toFixed(2)} m termination depth.`, ref)
  }
}

/**
 * Cone soundings.
 *
 * The rule worth stating: a cone RECOVERS NOTHING. A sounding that lists
 * samples means the record has been mixed with an adjacent borehole, and every
 * laboratory result attributed to this hole is then attributed to ground that
 * nobody sampled.
 */
function validateCpt(bh: Borehole, err: Report, warn: Report): void {
  const ref = { boreholeId: bh.id }
  const cone = isCone(bh.kind)
  const readings = bh.cpt ?? []

  if (cone && !readings.length) {
    warn('cone-without-readings', `${bh.name} is logged as a ${bh.kind} but carries no cone readings.`, ref)
  }
  if (!cone && readings.length) {
    warn('readings-without-cone',
      `${bh.name} carries cone readings but is logged as a ${bh.kind}. Set the exploration type to cpt or cptu.`, ref)
  }
  if (cone && bh.samples.length) {
    warn('cone-with-samples',
      `${bh.name} is a ${bh.kind} but lists ${bh.samples.length} sample${bh.samples.length === 1 ? '' : 's'}. A cone recovers no sample — check these are not from an adjacent borehole.`, ref)
  }
  if (cone && bh.spt.length) {
    warn('cone-with-spt',
      `${bh.name} is a ${bh.kind} but lists ${bh.spt.length} SPT. A cone sounding drives no split spoon.`, ref)
  }

  const seen = new Set<number>()
  for (const r of readings) {
    if (r.depth < 0) {
      err('cpt-negative-depth', `${bh.name}: cone reading above ground level (${r.depth.toFixed(2)} m).`, ref)
    }
    if (r.depth > bh.actualDepth + DEPTH_TOL) {
      err('cpt-below-hole',
        `${bh.name}: cone reading at ${r.depth.toFixed(2)} m, below the ${bh.actualDepth.toFixed(2)} m termination depth.`, ref)
    }
    if (r.qc < 0 || r.fs < 0) {
      err('cpt-negative-resistance',
        `${bh.name}: negative resistance at ${r.depth.toFixed(2)} m — q_c and f_s cannot be negative.`, ref)
    }
    if (seen.has(r.depth)) {
      warn('cpt-duplicate-depth', `${bh.name}: two cone readings at ${r.depth.toFixed(2)} m.`, ref)
    }
    seen.add(r.depth)
  }
  if (readings.length && readings.every((r) => r.u2 == null)) {
    warn('cpt-no-pore-pressure',
      `${bh.name}: no u₂ on any reading, so q_c cannot be corrected. In soft clay that correction is the dominant term, not a refinement.`, ref)
  }
}

function validateSpt(bh: Borehole, err: Report, warn: Report, sampleIds: Set<string>): void {
  const ref = { boreholeId: bh.id }
  const seen = new Set<string>()

  for (const t of bh.spt) {
    const tref = { ...ref, testId: t.id }
    if (seen.has(t.id)) err('duplicate-spt-id', `Duplicate SPT id "${t.id}".`, tref)
    seen.add(t.id)

    if (t.depth < -DEPTH_TOL || t.depth > bh.actualDepth + DEPTH_TOL) {
      err('spt-outside-hole',
        `${bh.name}: SPT at ${t.depth.toFixed(2)} m is outside the 0 – ${bh.actualDepth.toFixed(2)} m hole.`, tref)
    }
    if (t.blows.some((b) => b < 0 || !Number.isFinite(b))) {
      err('spt-negative-blows', `${bh.name}: SPT at ${t.depth.toFixed(2)} m has a negative or non-finite blow count.`, tref)
    }
    if (t.sampleId && !sampleIds.has(t.sampleId)) {
      err('spt-unknown-sample',
        `${bh.name}: SPT at ${t.depth.toFixed(2)} m references sample "${t.sampleId}", which is not in this hole.`, tref)
    }
    if (t.energyRatio != null && (t.energyRatio <= 0 || t.energyRatio > 100)) {
      err('spt-energy-ratio', `${bh.name}: hammer energy ratio must be between 0 and 100%.`, tref)
    }
    if (t.penetration && t.penetration.some((p) => p < 0 || p > 150 + DEPTH_TOL)) {
      err('spt-penetration', `${bh.name}: SPT increment penetration must be between 0 and 150 mm.`, tref)
    }

    // Unusual, not impossible — a warning, so the errors above stay meaningful.
    const N = fieldN(t)
    if (N === 0) {
      warn('spt-zero',
        `${bh.name}: SPT at ${t.depth.toFixed(2)} m gives N = 0 — weight-of-rods penetration, which should be logged as such rather than as a blow count.`,
        tref)
    } else if (N > 100) {
      warn('spt-very-high',
        `${bh.name}: SPT at ${t.depth.toFixed(2)} m gives N = ${N}. Above 50 the test is refusal; verify the field record.`, tref)
    }
    if (t.penetration && t.penetration.some((p) => p < 150 - DEPTH_TOL)) {
      warn('spt-refusal',
        `${bh.name}: SPT at ${t.depth.toFixed(2)} m did not achieve full penetration — N is a lower bound and correlations should not be applied to it.`,
        tref)
    }
  }
}

// ── Atterberg consistency ────────────────────────────────────────────────
// Kept here rather than in the (future) Atterberg engine so the rule is
// available to a form as the numbers are typed, before any test object exists.

export interface AtterbergCheck {
  liquidLimit?: number
  plasticLimit?: number
  shrinkageLimit?: number
  naturalMoisture?: number
}

/** Physical consistency of the Atterberg limits. Empty ⇒ nothing wrong. */
export function validateAtterberg(a: AtterbergCheck): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const err = (code: string, message: string) => issues.push({ severity: 'error', code, message })
  const warn = (code: string, message: string) => issues.push({ severity: 'warning', code, message })
  const { liquidLimit: LL, plasticLimit: PL, shrinkageLimit: SL, naturalMoisture: w } = a

  for (const [name, v] of [['Liquid limit', LL], ['Plastic limit', PL], ['Shrinkage limit', SL]] as const) {
    if (v != null && v < 0) err('limit-negative', `${name} cannot be negative.`)
  }
  if (LL != null && PL != null && PL > LL) {
    err('pl-above-ll',
      `Plastic limit (${PL}%) exceeds the liquid limit (${LL}%) — the soil would have a negative plasticity index. One of the two tests is wrong.`)
  }
  if (PL != null && SL != null && SL > PL) {
    err('sl-above-pl', `Shrinkage limit (${SL}%) exceeds the plastic limit (${PL}%).`)
  }
  if (LL != null && LL > 200) {
    warn('ll-very-high', `Liquid limit of ${LL}% is extreme — verify the test; only highly organic soils reach this.`)
  }
  if (LL != null && w != null && w > LL) {
    warn('moisture-above-ll',
      `Natural moisture (${w}%) exceeds the liquid limit — the soil is at a liquidity index above 1 and may be sensitive or quick.`)
  }
  return issues
}

/** Convenience: does this issue list block a save? */
export const hasErrors = (issues: ValidationIssue[]): boolean =>
  issues.some((i) => i.severity === 'error')
