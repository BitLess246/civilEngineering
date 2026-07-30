// ─────────────────────────────────────────────────────────────────────────
// The parameter engine — resolve design parameters for a layer from every
// piece of evidence available, each carrying its provenance. Layer 8.
//
// THIS IS THE PHASE THE REST OF THE MODULE EXISTS FOR. Everything before it
// records data; this turns the record into the γ, c′, φ′, cu and Cc that the
// bearing-capacity, settlement, slope and pile engines already take — so a
// soil property is interpreted once, with its source attached, instead of
// being retyped on five pages with no trail back to a test.
//
// THE RESOLUTION ORDER IS A HIERARCHY OF EVIDENCE, and it is deliberate:
//
//   1. ENGINEER OVERRIDE     — a stated decision beats everything.
//   2. MEASURED              — a laboratory test on this soil.
//   3. DERIVED               — computed from measurements by an exact relation.
//   4. CORRELATED            — an empirical relation from a field test.
//   5. (nothing)             — the parameter is absent, and stays absent.
//
// There is no step 6. A parameter with no evidence is NOT defaulted to a
// textbook value: an analysis running on invented numbers that look like
// measurements is exactly the failure this module was built to prevent. The
// caller gets `undefined` and decides whether to assume something — which then
// records itself as an ASSUMPTION with a rationale.
//
// The order is not a quality ranking. A well-run correlation over twenty SPT
// points can be worth more than one UU triaxial on a disturbed sample, and the
// engineer can override in either direction. What the order guarantees is that
// nothing silently outranks a direct measurement.
//
// UNITS: unit weight kN/m³; stresses and strengths kPa; angles degrees.
// ─────────────────────────────────────────────────────────────────────────

import type { Borehole, SoilLayer, Sample, LayerParameters } from './model'
import { soilFamily, isCohesive } from './model'
import {
  measured, derived, type SourcedValue, type Provenance,
} from './provenance'
import { evaluateTest } from './lab'
import { governingTest } from './classifySample'
import { sptProfile, type LayerUnitWeight } from './sptProfile'
import { correlatePhi, correlateUndrainedStrength, correlateRelativeDensity } from './spt'
import { voidRatio } from './lab/specificGravity'

/** A value the engineer set by hand, with the reason that makes it defensible. */
export interface ParameterOverride {
  value: number
  unit: string
  rationale: string
  by?: string
}

export interface ResolveInput {
  borehole: Borehole
  layer: SoilLayer
  /** Unit weights per layer id, for the effective-stress profile. */
  unitWeights: Record<string, LayerUnitWeight>
  /**
   * Parameters already stored on the investigation for this layer. Each keeps
   * the provenance it was saved with, so a unit weight the engineer typed
   * enters the hierarchy as an ASSUMPTION rather than as a bare number with no
   * source — which is what it is.
   */
  stored?: LayerParameters
  /** Engineer overrides, keyed by parameter name. */
  overrides?: Partial<Record<ParameterKey, ParameterOverride>>
}

export type ParameterKey =
  | 'unitWeight' | 'dryUnitWeight' | 'saturatedUnitWeight'
  | 'cohesion' | 'frictionAngle'
  | 'effectiveCohesion' | 'effectiveFrictionAngle' | 'undrainedShearStrength'
  | 'specificGravity' | 'voidRatio' | 'relativeDensity'
  | 'compressionIndex' | 'recompressionIndex' | 'preconsolidationPressure'
  | 'coefficientOfConsolidation'

/**
 * Readable names, kept HERE rather than in the page, because the engine writes
 * notes that name a parameter and the page renders a table that names the same
 * one. Two label maps would drift — the mistake this module has already made
 * twice (see soilFamily).
 */
export const PARAMETER_LABEL: Record<ParameterKey, string> = {
  unitWeight: 'Unit weight γ',
  dryUnitWeight: 'Dry unit weight γd',
  saturatedUnitWeight: 'Saturated unit weight γsat',
  cohesion: 'Cohesion c',
  frictionAngle: 'Friction angle φ',
  effectiveCohesion: "Effective cohesion c'",
  effectiveFrictionAngle: "Effective friction angle φ'",
  undrainedShearStrength: 'Undrained shear strength cu',
  specificGravity: 'Specific gravity Gs',
  voidRatio: 'Void ratio e',
  relativeDensity: 'Relative density Dr',
  compressionIndex: 'Compression index Cc',
  recompressionIndex: 'Recompression index Cr',
  preconsolidationPressure: "Preconsolidation pressure σ'p",
  coefficientOfConsolidation: 'Coefficient of consolidation cv',
}

export interface ResolvedParameter {
  key: ParameterKey
  value: SourcedValue
  /** Other candidates that were found but not chosen, best first. */
  alternatives: SourcedValue[]
}

export interface ParameterResolution {
  layerId: string
  boreholeId: string
  resolved: ResolvedParameter[]
  /** Parameters with no evidence at all. Absent, not defaulted. */
  absent: ParameterKey[]
  notes: string[]
}

/** Rank of a provenance kind in the evidence hierarchy. Lower wins. */
const RANK: Record<Provenance['kind'], number> = {
  assumed: 0,      // an engineer's stated decision
  measured: 1,
  derived: 2,
  correlated: 3,
}

/** Samples attributed to this layer, or falling inside its depth range. */
export function samplesInLayer(bh: Borehole, layer: SoilLayer): Sample[] {
  return bh.samples.filter((s) =>
    s.layerId === layer.id
    || (s.layerId == null && s.depthTop >= layer.depthTop && s.depthTop < layer.depthBottom))
}

/**
 * Resolve every parameter this module can currently produce for one layer.
 *
 * Candidates are gathered from all sources, ranked, and the winner reported
 * with the rest kept as `alternatives` — so a report can show that a
 * correlated φ′ of 34° sat alongside a measured 31° and say which was used.
 */
export function resolveParameters(i: ResolveInput): ParameterResolution {
  const { borehole: bh, layer } = i
  const notes: string[] = []
  const candidates = new Map<ParameterKey, SourcedValue[]>()

  const add = (key: ParameterKey, v: SourcedValue) => {
    const list = candidates.get(key) ?? []
    list.push(v)
    candidates.set(key, list)
  }

  const samples = samplesInLayer(bh, layer)
  const family = soilFamily(layer.symbol, layer.name)
  const cohesive = isCohesive(family)

  // ── 0. Stored parameters, each keeping the provenance it was saved with ──
  if (i.stored) {
    const { layerId: _l, boreholeId: _b, ...rest } = i.stored
    for (const [key, v] of Object.entries(rest)) {
      if (v && typeof v === 'object' && 'value' in v) add(key as ParameterKey, v as SourcedValue)
    }
  }

  // ── 1. Laboratory measurements ──
  for (const s of samples) {
    // Specific gravity.
    const gsTest = governingTest(s, 'specific-gravity').test
    if (gsTest) {
      const { outcome } = evaluateTest(gsTest)
      if (outcome?.kind === 'specific-gravity') {
        add('specificGravity', measured(outcome.result.gs, '—', {
          testId: gsTest.id, standard: 'd854', sampleId: s.name,
        }))
      }
    }

    // Direct shear → c′ and φ′ (effective, drained).
    const dsTest = governingTest(s, 'direct-shear').test
    if (dsTest) {
      const { outcome } = evaluateTest(dsTest)
      if (outcome?.kind === 'direct-shear') {
        const e = outcome.result.peak
        add('effectiveCohesion', measured(e.cohesion, 'kPa', {
          testId: dsTest.id, standard: 'd3080', sampleId: s.name,
        }, `fitted over ${outcome.result.stressRange.min.toFixed(0)}–${outcome.result.stressRange.max.toFixed(0)} kPa`))
        add('effectiveFrictionAngle', measured(e.frictionAngle, '°', {
          testId: dsTest.id, standard: 'd3080', sampleId: s.name,
        }, e.refittedThroughOrigin ? 'envelope refitted through the origin' : undefined))
      }
    }

    // Consolidation → Cc, Cr, σ′p and cv.
    const consTest = governingTest(s, 'consolidation').test
    if (consTest) {
      const { outcome, error } = evaluateTest(consTest)
      if (error) notes.push(`Consolidation on ${s.name} could not be evaluated: ${error}`)
      else if (outcome?.kind === 'consolidation') {
        const c = outcome.result
        const p = { testId: consTest.id, standard: 'd2435' as const, sampleId: s.name }
        add('compressionIndex', measured(c.cc, '—', p))
        if (c.cr != null) add('recompressionIndex', measured(c.cr, '—', p))
        if (c.preconsolidationPressure != null) {
          // σ′p is inferred from the curve's shape, not read off a dial, so it
          // enters as DERIVED rather than measured — the distinction is the
          // whole point of the provenance model.
          add('preconsolidationPressure', derived(c.preconsolidationPressure, 'kPa', {
            calculation: 'consolidation.cc',
            from: [`${c.rows.length} load increments on ${s.name}`],
          }, 'two-segment fit of the e–log σ′ curve; check against the plotted curve'))
        }
        const cvs = c.rows.map((r) => r.cv).filter((v): v is number => v != null)
        if (cvs.length) {
          add('coefficientOfConsolidation', measured(
            cvs.reduce((a, b) => a + b, 0) / cvs.length, 'm²/yr', p,
            `mean of ${cvs.length} increments`,
          ))
        }
      }
    }

    // UCS → cu, when the φ = 0 assumption holds.
    const ucsTest = governingTest(s, 'ucs').test
    if (ucsTest) {
      const { outcome } = evaluateTest(ucsTest)
      if (outcome?.kind === 'ucs') {
        if (outcome.result.cu != null) {
          add('undrainedShearStrength', measured(outcome.result.cu, 'kPa', {
            testId: ucsTest.id, standard: 'd2166', sampleId: s.name,
          }, 'cu = qu/2; a lower bound, since sampling only weakens a specimen'))
        } else if (outcome.result.cuDeclined) {
          notes.push(`UCS on ${s.name} does not give cu: ${outcome.result.cuDeclined}`)
        }
      }
    }
  }

  // ── 2. Derived ──
  const gs = best(candidates.get('specificGravity'))
  const uw = i.unitWeights[layer.id]
  if (gs && uw?.gamma != null) {
    // Void ratio needs the DRY unit weight. Without a water content we cannot
    // get it from the bulk value, so this only fires when one was supplied.
    const dry = uw.gamma
    try {
      const e = voidRatio(gs.value, dry)
      if (e > 0) {
        add('voidRatio', derived(e, '—', {
          calculation: 'consolidation.void-ratio',
          from: [`Gs = ${gs.value.toFixed(3)}`, `γd = ${dry.toFixed(1)} kN/m³`],
        }, 'assumes the entered unit weight is the DRY value'))
      }
    } catch { /* a non-physical combination simply yields no candidate */ }
  }

  // ── 3. SPT correlations ──
  const profile = sptProfile(bh, i.unitWeights)
  const inLayer = profile.rows.filter((r) => r.layerId === layer.id && !r.refusal)

  if (inLayer.length) {
    const n160s = inLayer.map((r) => r.n160).filter((v): v is number => v != null)
    const n60s = inLayer.map((r) => r.n60)

    if (n160s.length && !cohesive) {
      const mean = n160s.reduce((a, b) => a + b, 0) / n160s.length
      const phi = correlatePhi(mean, family === 'sand' ? 'clean-sand' : 'silty-sand')
      if (phi.value) {
        add('effectiveFrictionAngle', {
          ...phi.value,
          note: `${phi.value.note ? `${phi.value.note} ` : ''}mean of ${n160s.length} tests in this layer`,
        })
      }
      const dr = correlateRelativeDensity(mean, 'clean-sand')
      if (dr.value) add('relativeDensity', dr.value)
    } else if (n160s.length && cohesive) {
      notes.push('SPT correlations for φ′ and relative density were not applied — this layer is cohesive.')
    }

    if (cohesive && n60s.length) {
      const mean = n60s.reduce((a, b) => a + b, 0) / n60s.length
      const cu = correlateUndrainedStrength(mean, 'clay')
      if (cu.value) add('undrainedShearStrength', cu.value)
    }
  }

  const refused = profile.rows.filter((r) => r.layerId === layer.id && r.refusal).length
  if (refused) {
    notes.push(`${refused} SPT result(s) in this layer hit refusal and were excluded from the correlations — a lower bound is not a measurement.`)
  }

  // ── 4. Engineer overrides — applied last, ranked first ──
  for (const [key, o] of Object.entries(i.overrides ?? {}) as [ParameterKey, ParameterOverride][]) {
    if (!o?.rationale?.trim()) {
      notes.push(`The override of ${PARAMETER_LABEL[key] ?? key} has no stated rationale and was ignored — an override without a reason is indistinguishable from a typing error.`)
      continue
    }
    add(key, {
      value: o.value,
      unit: o.unit,
      provenance: { kind: 'assumed', by: o.by, rationale: o.rationale.trim() },
    })
  }

  // ── Resolve ──
  const resolved: ResolvedParameter[] = []
  for (const [key, list] of candidates) {
    const sorted = [...list].sort((a, b) => RANK[a.provenance.kind] - RANK[b.provenance.kind])
    resolved.push({ key, value: sorted[0], alternatives: sorted.slice(1) })
  }
  resolved.sort((a, b) => a.key.localeCompare(b.key))

  const ALL: ParameterKey[] = [
    'unitWeight', 'dryUnitWeight', 'saturatedUnitWeight',
    'cohesion', 'frictionAngle', 'effectiveCohesion', 'effectiveFrictionAngle',
    'undrainedShearStrength', 'specificGravity', 'voidRatio', 'relativeDensity',
    'compressionIndex', 'recompressionIndex', 'preconsolidationPressure',
    'coefficientOfConsolidation',
  ]
  const absent = ALL.filter((k) => !candidates.has(k))

  // The disagreement worth surfacing: a correlation that contradicts a test.
  for (const r of resolved) {
    const meas = r.value.provenance.kind === 'measured' ? r.value : undefined
    const corr = r.alternatives.find((a) => a.provenance.kind === 'correlated')
    if (meas && corr) {
      const diff = Math.abs(corr.value - meas.value)
      const rel = meas.value !== 0 ? diff / Math.abs(meas.value) : Infinity
      if (rel > 0.15) {
        notes.push(
          `${PARAMETER_LABEL[r.key]}: the measured value is ${meas.value.toFixed(1)} ${meas.unit} but the correlation gives ${corr.value.toFixed(0)}. The measurement was used. A gap this wide is worth explaining in the report rather than leaving for a reader to notice.`,
        )
      }
    }
  }

  return { layerId: layer.id, boreholeId: bh.id, resolved, absent, notes }
}

const best = (list: SourcedValue[] | undefined): SourcedValue | undefined =>
  list?.length ? [...list].sort((a, b) => RANK[a.provenance.kind] - RANK[b.provenance.kind])[0] : undefined

/** Shape the resolution into the `LayerParameters` the schema stores. */
export function toLayerParameters(r: ParameterResolution): LayerParameters {
  const out: LayerParameters = { layerId: r.layerId, boreholeId: r.boreholeId }
  for (const p of r.resolved) {
    (out as unknown as Record<string, SourcedValue>)[p.key] = p.value
  }
  return out
}

/**
 * The parameters a bearing-capacity check needs, in the units that engine
 * takes. Returns what is available and names what is not — the calculation
 * belongs to `engine/geotech`, not here.
 */
export interface BearingInputs {
  c?: number
  phiDeg?: number
  gamma?: number
  missing: ParameterKey[]
}

export function bearingInputs(r: ParameterResolution, unitWeight?: number): BearingInputs {
  const get = (k: ParameterKey) => r.resolved.find((p) => p.key === k)?.value.value
  const c = get('effectiveCohesion') ?? get('cohesion')
  const phiDeg = get('effectiveFrictionAngle') ?? get('frictionAngle')
  const gamma = unitWeight ?? get('unitWeight')

  const missing: ParameterKey[] = []
  if (c == null) missing.push('effectiveCohesion')
  if (phiDeg == null) missing.push('effectiveFrictionAngle')
  if (gamma == null) missing.push('unitWeight')

  return { c, phiDeg, gamma, missing }
}
