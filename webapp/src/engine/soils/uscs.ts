// ─────────────────────────────────────────────────────────────────────────
// Unified Soil Classification System. Layer 8. ASTM D2487 Table 1.
//
// Gradation and plasticity in, group symbol and group name out. The decision
// tree is D2487's, taken branch by branch rather than approximated, because the
// borderline cases are where a classifier earns its keep and where a
// simplified version quietly gets it wrong.
//
// TWO THINGS THIS CLASSIFIER WILL NOT DO:
//
//  1. It will not pick one symbol when D2487 requires a DUAL symbol. A sand
//     with 5–12% fines is genuinely both — 'SW-SC' is the answer, not 'SW' with
//     a footnote. Same for CL-ML, the silt-clay band between PI 4 and 7.
//  2. It will not classify from incomplete data. No Atterberg limits on a
//     fine-grained soil means no classification, not a guess from the fines
//     content. `reason` says which test is missing.
//
// The engineer can override the result, and the override carries a required
// reason (see `OverriddenClassification`). Visual-manual identification is
// D2488 and is a different, lower-confidence claim than a D2487 classification
// — the module keeps them apart rather than blurring them.
// ─────────────────────────────────────────────────────────────────────────

import { type LabNote, warn } from './notes'

import { aLine, uLine } from './atterberg'
import { isWellGraded } from './sieve'

export interface UscsInput {
  /** Percent coarser than 4.75 mm (of the minus-75 mm fraction), %. */
  gravel: number
  /** Percent between 4.75 and 0.075 mm, %. */
  sand: number
  /** Percent finer than 0.075 mm, %. */
  fines: number
  /** Shape parameters — needed for a clean coarse soil (< 5% fines). */
  cu?: number
  cc?: number
  /** Atterberg limits — needed for any soil with ≥ 5% fines. */
  liquidLimit?: number
  plasticityIndex?: number
  /** Field or loss-on-ignition evidence of organic content. */
  organic?: boolean
}

export interface UscsResult {
  /** Group symbol, e.g. 'SC' or 'SW-SM'. Undefined when unclassifiable. */
  symbol?: string
  /** Group name, e.g. 'Clayey sand with gravel'. */
  name?: string
  /** True when D2487 requires two symbols joined by a hyphen. */
  dual: boolean
  /** Coarse when more than half is retained on the No. 200 sieve. */
  coarseGrained: boolean
  /** Why the classification came out as it did, or what is missing. */
  reason: string
  notes: LabNote[]
}

/** Fines plot as clay (on/above A-line, PI > 7) rather than silt. */
function finesAreClayey(LL: number, PI: number): boolean {
  return PI > 7 && PI >= aLine(LL)
}

/** The CL-ML band: PI between 4 and 7 inclusive AND on or above the A-line. */
function isSiltClayBand(PI: number, LL: number): boolean {
  return PI >= 4 && PI <= 7 && PI >= aLine(LL)
}

/** Descriptive modifier for the secondary coarse fraction (D2487 Table 1a). */
function coarseModifier(primary: 'gravel' | 'sand', gravel: number, sand: number): string {
  const secondary = primary === 'gravel' ? sand : gravel
  const other = primary === 'gravel' ? 'sand' : 'gravel'
  if (secondary >= 15) return ` with ${other}`
  return ''
}

export function classifyUSCS(i: UscsInput): UscsResult {
  const notes: LabNote[] = []
  const { gravel, sand, fines } = i
  const total = gravel + sand + fines
  if (Math.abs(total - 100) > 1) {
    notes.push(warn(`Fractions sum to ${total.toFixed(0)}%, not 100% — check the grading before relying on this.`))
  }

  const coarseGrained = fines < 50
  const LL = i.liquidLimit
  const PI = i.plasticityIndex

  // ── Fine-grained: 50% or more passes the No. 200 sieve ──
  if (!coarseGrained) {
    if (LL == null || PI == null) {
      return {
        dual: false, coarseGrained: false, notes,
        reason: 'Fine-grained soil (≥ 50% fines) cannot be classified without Atterberg limits — run ASTM D4318.',
      }
    }
    return classifyFine(LL, PI, gravel, sand, i.organic === true, notes)
  }

  // ── Coarse-grained ──
  const primary: 'gravel' | 'sand' = gravel > sand ? 'gravel' : 'sand'
  const G = primary === 'gravel' ? 'G' : 'S'
  const noun = primary === 'gravel' ? 'gravel' : 'sand'
  const modifier = coarseModifier(primary, gravel, sand)

  // Clean: < 5% fines — gradation alone decides.
  if (fines < 5) {
    const wellGraded = isWellGraded(i.cu, i.cc, primary)
    if (wellGraded === undefined) {
      return {
        dual: false, coarseGrained: true, notes,
        reason: `Clean ${noun} (< 5% fines) is classified on Cu and Cc, which need a complete grading curve.`,
      }
    }
    const symbol = wellGraded ? `${G}W` : `${G}P`
    const name = `${wellGraded ? 'Well-graded' : 'Poorly graded'} ${noun}${modifier}`
    return {
      symbol, name, dual: false, coarseGrained: true, notes,
      reason: `Clean ${noun}: ${fines.toFixed(0)}% fines, Cu = ${i.cu?.toFixed(1)}, Cc = ${i.cc?.toFixed(2)} ⇒ ${wellGraded ? 'well' : 'poorly'} graded.`,
    }
  }

  // With fines: > 12% — the fines' plasticity decides.
  if (fines > 12) {
    if (LL == null || PI == null) {
      return {
        dual: false, coarseGrained: true, notes,
        reason: `${noun} with ${fines.toFixed(0)}% fines is classified on the plasticity of those fines — run ASTM D4318.`,
      }
    }
    if (isSiltClayBand(PI, LL)) {
      const symbol = `${G}C-${G}M`
      return {
        symbol,
        name: `Silty, clayey ${noun}${modifier}`,
        dual: true, coarseGrained: true, notes,
        reason: `Fines plot in the CL-ML band (PI = ${PI.toFixed(0)}, between 4 and 7, on or above the A-line), so D2487 requires the dual symbol ${symbol}.`,
      }
    }
    const clayey = finesAreClayey(LL, PI)
    const symbol = `${G}${clayey ? 'C' : 'M'}`
    return {
      symbol,
      name: `${clayey ? 'Clayey' : 'Silty'} ${noun}${modifier}`,
      dual: false, coarseGrained: true, notes,
      reason: `${fines.toFixed(0)}% fines plotting ${clayey ? 'on or above' : 'below'} the A-line (PI = ${PI.toFixed(0)}, A-line = ${aLine(LL).toFixed(1)}) ⇒ ${clayey ? 'clayey' : 'silty'} ${noun}.`,
    }
  }

  // 5–12% fines — genuinely both, so D2487 requires a dual symbol.
  const wellGraded = isWellGraded(i.cu, i.cc, primary)
  if (wellGraded === undefined || LL == null || PI == null) {
    return {
      dual: true, coarseGrained: true, notes,
      reason: `${noun} with ${fines.toFixed(0)}% fines needs a dual symbol, which requires BOTH the gradation (Cu, Cc) and the plasticity of the fines (LL, PI).`,
    }
  }
  const first = wellGraded ? `${G}W` : `${G}P`
  const clayey = finesAreClayey(LL, PI)
  const second = `${G}${clayey ? 'C' : 'M'}`
  const symbol = `${first}-${second}`
  return {
    symbol,
    name: `${wellGraded ? 'Well-graded' : 'Poorly graded'} ${noun} with ${clayey ? 'clay' : 'silt'}${modifier}`,
    dual: true, coarseGrained: true, notes,
    reason: `${fines.toFixed(0)}% fines falls in the 5–12% band, where D2487 requires a dual symbol: ${first} from the gradation, ${second} from the plasticity of the fines.`,
  }
}

function classifyFine(
  LL: number, PI: number, gravel: number, sand: number, organic: boolean, notes: LabNote[],
): UscsResult {
  if (PI > uLine(LL)) {
    notes.push(warn('The point plots above the U-line — no natural soil does. Re-run the limits before accepting this classification.'))
  }

  const high = LL >= 50
  const coarse = gravel + sand
  // D2487 Table 1b: 15–29% coarse ⇒ "with sand/gravel"; ≥ 30% ⇒ "sandy/gravelly".
  let modifier = ''
  if (coarse >= 30) modifier = gravel > sand ? 'Gravelly ' : 'Sandy '
  else if (coarse >= 15) modifier = ''
  const suffix = coarse >= 15 && coarse < 30 ? (gravel > sand ? ' with gravel' : ' with sand') : ''

  if (organic) {
    const symbol = high ? 'OH' : 'OL'
    const name = high ? 'Organic clay or silt of high plasticity' : 'Organic clay or silt of low plasticity'
    return {
      symbol, name, dual: false, coarseGrained: false, notes,
      reason: `Organic fine-grained soil with LL = ${LL.toFixed(0)}% ⇒ ${symbol}. D2487 confirms O-groups by comparing the liquid limit oven-dried against not-dried (ratio < 0.75).`,
    }
  }

  // CL-ML: the silt-clay band, a genuine dual classification.
  if (!high && isSiltClayBand(PI, LL)) {
    return {
      symbol: 'CL-ML',
      name: `${modifier}Silty clay${suffix}`.trim(),
      dual: true, coarseGrained: false, notes,
      reason: `PI = ${PI.toFixed(0)} lies in the 4–7 band on or above the A-line, which D2487 classifies as the dual symbol CL-ML.`,
    }
  }

  const clayey = finesAreClayey(LL, PI)
  const symbol = clayey ? (high ? 'CH' : 'CL') : (high ? 'MH' : 'ML')
  const base = clayey
    ? (high ? 'Fat clay' : 'Lean clay')
    : (high ? 'Elastic silt' : 'Silt')
  const name = `${modifier}${modifier ? base.toLowerCase() : base}${suffix}`

  return {
    symbol, name, dual: false, coarseGrained: false, notes,
    reason: `LL = ${LL.toFixed(0)}% (${high ? 'high' : 'low'} plasticity), PI = ${PI.toFixed(0)} vs A-line ${aLine(LL).toFixed(1)} ⇒ ${clayey ? 'clay' : 'silt'} behaviour ⇒ ${symbol}.`,
  }
}

// ── Engineer override ─────────────────────────────────────────────────────

export interface OverriddenClassification {
  /** What the classifier computed. Kept so the report can show both. */
  computed?: string
  /** What the engineer decided instead. */
  override: string
  /** Required — an override without a stated reason is indistinguishable
   *  from a typing error six months later. */
  reason: string
  by?: string
}

/**
 * Apply an engineer's override. Throws when no reason is supplied, because a
 * silent override is the one thing worse than a wrong automatic answer.
 */
export function overrideClassification(
  result: UscsResult, override: string, reason: string, by?: string,
): OverriddenClassification {
  if (!reason.trim()) {
    throw new Error('An override of the computed classification requires a stated reason.')
  }
  return { computed: result.symbol, override: override.trim(), reason: reason.trim(), by }
}
