// ─────────────────────────────────────────────────────────────────────────
// Where a geotechnical parameter CAME FROM. Layer 8.
//
// This is the single most important type in the soil-investigation module, and
// the reason is professional rather than technical.
//
// A report that prints
//
//     φ = 32°
//
// tells the reader nothing about whether that came out of a triaxial cell, out
// of a correlation with SPT blow counts, or out of the engineer's judgement on
// a Friday afternoon. Those three numbers carry wildly different confidence and
// wildly different liability, and once they are all rendered as "32°" the
// difference is gone forever — including from the engineer who has to defend
// the report two years later.
//
// So every parameter that reaches an analysis carries its provenance, and the
// report prints it. A CORRELATED value is not a defect; presenting one as if it
// were MEASURED is.
//
// The four kinds are deliberately not ranked into a single "quality" number.
// A well-run correlation on twenty SPT points can be worth more than one
// unconsolidated-undrained triaxial on a disturbed sample, and collapsing that
// into a score would hide exactly the judgement the reader needs to make.
// ─────────────────────────────────────────────────────────────────────────

import { type StandardId, cite } from './standards'

export type ProvenanceKind = 'measured' | 'derived' | 'correlated' | 'assumed'

/** Read directly off a field or laboratory test run to a standard. */
export interface MeasuredProvenance {
  kind: 'measured'
  /** Id of the `LabTest` / field test the value was read from. */
  testId: string
  standard: StandardId
  /** Sample the test was run on, when the value is sample-specific. */
  sampleId?: string
}

/** Computed from other values by an exact relation — no empiricism involved. */
export interface DerivedProvenance {
  kind: 'derived'
  /** Registry id of the calculation that produced it (see registry.ts). */
  calculation: string
  /** Ids or names of the inputs it was computed from. */
  from: string[]
}

/**
 * Estimated from an empirical correlation. `basis` says what it was correlated
 * FROM (e.g. 'corrected SPT (N₁)₆₀ = 18'), `source` cites whose correlation.
 * `scatter` records the spread the published correlation carries, because a
 * correlation quoted without its scatter reads far more precise than it is.
 */
export interface CorrelatedProvenance {
  kind: 'correlated'
  basis: string
  source: string
  scatter?: string
}

/** Chosen by the engineer. Requires a rationale — no silent defaults. */
export interface AssumedProvenance {
  kind: 'assumed'
  /** Who made the call (falls back to the report's preparer when blank). */
  by?: string
  rationale: string
}

export type Provenance =
  | MeasuredProvenance
  | DerivedProvenance
  | CorrelatedProvenance
  | AssumedProvenance

/**
 * A number that knows where it came from. `unit` is carried on the value rather
 * than implied by the field name so a parameter table can render itself without
 * a lookup, and so a unit change is a data change rather than a code change.
 */
export interface SourcedValue {
  value: number
  unit: string
  provenance: Provenance
  /** Free-text qualifier shown next to the value, e.g. 'mean of 3 tests'. */
  note?: string
}

// ── Constructors ──────────────────────────────────────────────────────────
// Named so a call site reads as a sentence: measured(32, '°', {...}).

export const measured = (
  value: number, unit: string, p: Omit<MeasuredProvenance, 'kind'>, note?: string,
): SourcedValue => ({ value, unit, provenance: { kind: 'measured', ...p }, note })

export const derived = (
  value: number, unit: string, p: Omit<DerivedProvenance, 'kind'>, note?: string,
): SourcedValue => ({ value, unit, provenance: { kind: 'derived', ...p }, note })

export const correlated = (
  value: number, unit: string, p: Omit<CorrelatedProvenance, 'kind'>, note?: string,
): SourcedValue => ({ value, unit, provenance: { kind: 'correlated', ...p }, note })

export const assumed = (
  value: number, unit: string, p: Omit<AssumedProvenance, 'kind'>, note?: string,
): SourcedValue => ({ value, unit, provenance: { kind: 'assumed', ...p }, note })

// ── Presentation ──────────────────────────────────────────────────────────

/** Short label for a table column. */
export const PROVENANCE_LABEL: Record<ProvenanceKind, string> = {
  measured: 'Measured',
  derived: 'Derived',
  correlated: 'Correlated',
  assumed: 'Assumed',
}

/**
 * One-line explanation of where a value came from, for the parameter table and
 * the PDF footnote. Never returns an empty string — a value whose provenance
 * cannot be described is a bug, and printing a blank would hide it.
 */
export function describeProvenance(p: Provenance): string {
  switch (p.kind) {
    case 'measured':
      return `Measured — ${cite(p.standard)}${p.sampleId ? ` on sample ${p.sampleId}` : ''}`
    case 'derived':
      return `Derived — ${p.calculation}${p.from.length ? ` from ${p.from.join(', ')}` : ''}`
    case 'correlated':
      return `Correlated — from ${p.basis} (${p.source})${p.scatter ? `; scatter ${p.scatter}` : ''}`
    case 'assumed':
      return `Assumed${p.by ? ` by ${p.by}` : ''} — ${p.rationale}`
  }
}

/**
 * Whether a value rests on a physical measurement of THIS soil, directly or
 * through an exact derivation. Correlations and assumptions do not, however
 * reasonable they are.
 *
 * Used to warn when an analysis is running entirely on estimated parameters —
 * a legitimate thing to do at feasibility stage, and a legitimate thing to be
 * told about before the foundation is poured.
 */
export const isEvidenceBased = (p: Provenance): boolean =>
  p.kind === 'measured' || p.kind === 'derived'

/** Count each kind across a set of values, for a report summary. */
export function provenanceMix(values: SourcedValue[]): Record<ProvenanceKind, number> {
  const mix: Record<ProvenanceKind, number> = { measured: 0, derived: 0, correlated: 0, assumed: 0 }
  for (const v of values) mix[v.provenance.kind] += 1
  return mix
}

/**
 * Every distinct standard a set of values was measured to — the input to a
 * report's "tests performed" list, in catalogue order rather than insertion
 * order so two runs of the same investigation list them identically.
 */
export function standardsUsed(values: SourcedValue[]): StandardId[] {
  const ids = new Set<StandardId>()
  for (const v of values) if (v.provenance.kind === 'measured') ids.add(v.provenance.standard)
  return [...ids].sort()
}
