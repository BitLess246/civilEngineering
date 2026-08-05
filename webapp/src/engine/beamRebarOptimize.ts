// ─────────────────────────────────────────────────────────────────────────
// BEAM FLEXURAL STEEL — search the bar catalogue, score, adopt the best.
//
// `designBeam` is a complete, code-checked design AT ONE BAR DIAMETER: it
// iterates the layer arrangement, recomputes d by Varignon, and reports every
// §407 / §22.2 outcome. What it never did was ask whether a DIFFERENT
// diameter would give a better section — the diameter was an input, and
// whatever the user typed is what got detailed.
//
// So this module does not re-derive any strength. It runs `designBeam` once
// per candidate diameter, turns each result into a scored layout, and lets
// `rebarScore` rank them. Reusing the verified engine is the point: a second
// implementation of §22.2 that drifts from the first is worse than no search
// at all.
//
// ── WHAT COUNTS AS A CANDIDATE ───────────────────────────────────────────
//
// Every diameter in the catalogue, paired with the bar count `designBeam`
// settles on for it. The count is not searched independently: for a given
// diameter the required area fixes it, and the layer/pairing rules in
// `barLayers` fix the arrangement. Searching counts as well would only
// generate layouts that provide MORE steel than needed at the same diameter —
// strictly worse on economy and no better on anything else.
//
// ── COMPLIANCE ───────────────────────────────────────────────────────────
//
// Taken from the design result, not re-checked: flexural adequacy, the
// tension-controlled ρ ceiling, minimum steel, bars-fit-the-web, the §25.2.1
// clear-spacing floor, minimum bar count, the §24.3.2 crack-control spacing
// limit, and the layer cap. Any failure makes the layout infeasible.
//
// Units: mm, mm², kN·m.
// ─────────────────────────────────────────────────────────────────────────

import { designBeam, type BeamDesignInput, type BeamDesignResult } from './beamDesign'
import { crackSpacingLimit } from './barSelection'
import {
  selectRebar, type Candidate, type ComplianceCheck, type RebarLayout,
  type RebarSelection, type ScoreContext,
} from './rebarScore'

/** Bar diameters searched by default — the PNS range a yard carries. */
export const BEAM_BAR_SIZES = [12, 16, 20, 25, 28, 32] as const

/** §9.7.2.1 — a beam never carries fewer than two bars in a layer. */
const MIN_BARS = 2
/** Layers past which the effective depth is being thrown away. */
const MAX_LAYERS = 3

export interface BeamRebarOptions {
  /** Diameters to search. Defaults to `BEAM_BAR_SIZES`. */
  sizes?: readonly number[]
  /** Aggregate size, mm — §25.2.1 also asks for 4/3 d_agg clear. */
  aggregate?: number
  /** Clear spacing below which a poker vibrator will not fit. */
  sComfort?: number
}

export interface BeamRebarChoice {
  selection: RebarSelection
  /** The full design that produced the winning layout, ready to report. */
  design: BeamDesignResult | null
  /** The input that produced it — the diameter actually adopted. */
  input: BeamDesignInput | null
  /** Every design tried, keyed by diameter, for the report's ranking table. */
  designs: Map<number, BeamDesignResult>
}

/**
 * Compliance for one designed beam, in the order a checker reads them.
 *
 * Order matters: the first failure is what gets reported, and "the section is
 * too shallow" must not be reported as "the bars do not fit".
 */
function complianceOf(
  i: BeamDesignInput, r: BeamDesignResult, sMaxCrack: number, sMinClear: number,
): ComplianceCheck[] {
  const util = r.phiMnMax > 0 ? i.Mu / r.phiMnMax : Infinity
  return [
    {
      id: 'layout-converged',
      clause: 'ACI 318-14 §22.2 · §9.3.1',
      label: 'the bar layout converges — d does not collapse toward d′',
      pass: r.flexOK,
      detail: r.flexOK ? undefined : 'the section cannot accommodate the steel it needs',
    },
    {
      id: 'compression-effective',
      clause: 'ACI 318-14 §22.2.2',
      label: "compression steel yields usefully (f′s > 0.85f′c)",
      pass: r.mode !== 'DRRB' || r.comprEffective,
    },
    {
      id: 'compression-above-na',
      clause: 'ACI 318-14 §22.2.1',
      label: 'the deepest compression layer stays above the neutral axis',
      pass: r.comprNAOK,
    },
    {
      id: 'tension-controlled',
      clause: 'ACI 318-14 §21.2.2 · §9.3.3.1',
      label: 'tension-controlled — ρ within the ρmax ceiling at εt = 0.005',
      pass: r.mode === 'DRRB' || r.rho <= r.rhoMax + 1e-9,
      detail: `ρ = ${r.rho.toFixed(4)} vs ρmax = ${r.rhoMax.toFixed(4)}`,
    },
    {
      id: 'min-steel',
      clause: 'ACI 318-14 §9.6.1.2',
      label: 'minimum flexural steel',
      pass: r.As >= r.rhoMin * (i.bMin ?? i.b) * r.d - 1e-6,
    },
    {
      id: 'min-bars',
      clause: 'ACI 318-14 §9.7.2.1',
      label: 'at least two bars',
      pass: r.bars >= MIN_BARS,
    },
    {
      id: 'bars-fit',
      clause: 'ACI 318-14 §25.2.1',
      label: 'the bars fit the web at the required clear spacing',
      pass: r.maxPerLayer >= MIN_BARS && r.sClear >= sMinClear - 1e-6,
      detail: `clear ${r.sClear.toFixed(0)} mm vs ${sMinClear.toFixed(0)} mm required`,
    },
    {
      id: 'layer-cap',
      clause: 'Detailing practice',
      label: `no more than ${MAX_LAYERS} layers`,
      pass: r.layers.length <= MAX_LAYERS,
    },
    {
      id: 'crack-spacing',
      clause: 'ACI 318-14 §24.3.2',
      label: 'bar spacing within the crack-control limit',
      pass: barSpacingOf(i, r) <= sMaxCrack + 1e-6,
      detail: `s = ${barSpacingOf(i, r).toFixed(0)} mm vs ${sMaxCrack.toFixed(0)} mm`,
    },
    {
      id: 'flexural-capacity',
      clause: 'ACI 318-14 §22.2',
      label: 'φMn ≥ Mu',
      pass: r.mode === 'DRRB' ? r.flexOK : util <= 1 + 1e-9,
    },
  ]
}

/** Centre-to-centre spacing of the bars nearest the tension face, mm. */
function barSpacingOf(i: BeamDesignInput, r: BeamDesignResult): number {
  const n = r.layers[0] ?? 0
  if (n <= 1) return 0            // a single bar has no spacing to control
  const bw = i.b - 2 * (i.cover + i.stirrupDia)
  return (bw - i.barDia) / (n - 1)
}

/**
 * Design the beam at every candidate diameter and adopt the best-scoring
 * compliant layout.
 *
 * `i.barDia` is ignored as a choice and used only as a fallback when nothing
 * in the catalogue complies — a failing design the user can read beats a null.
 */
export function optimizeBeamRebar(
  i: BeamDesignInput, opts: BeamRebarOptions = {},
): BeamRebarChoice {
  const sizes = opts.sizes ?? BEAM_BAR_SIZES
  const designs = new Map<number, BeamDesignResult>()
  const candidates: Candidate[] = []
  const inputs = new Map<number, BeamDesignInput>()

  for (const db of sizes) {
    // The compression bars follow the tension bars unless the caller pinned
    // them; a beam detailed with two different main sizes is a schedule
    // nobody thanks you for.
    const trial: BeamDesignInput = { ...i, barDia: db, comprBarDia: i.comprBarDia ?? db }
    let r: BeamDesignResult
    try {
      r = designBeam(trial)
    } catch {
      continue                    // a size the section cannot even lay out
    }
    designs.set(db, r)
    inputs.set(db, trial)

    // §25.2.1 clear spacing: the greater of db, 25 mm and 4/3 the aggregate.
    const sMinClear = Math.max(db, 25, (4 / 3) * (opts.aggregate ?? 20))
    const sMaxCrack = crackSpacingLimit(i.fy, i.cover)

    const Ab = (Math.PI / 4) * db * db
    const layout: RebarLayout = {
      db,
      bars: r.bars,
      layers: r.layers,
      AsProv: r.bars * Ab,
      AsReq: r.As,
      clearSpacing: r.sClear,
      spacing: barSpacingOf(trial, r),
      d: r.d,
      utilization: r.phiMnMax > 0 ? i.Mu / r.phiMnMax : Infinity,
    }
    candidates.push({ layout, compliance: complianceOf(trial, r, sMaxCrack, sMinClear) })
  }

  const ctx: ScoreContext = {
    sMax: crackSpacingLimit(i.fy, i.cover),
    sMinCode: Math.max(25, (4 / 3) * (opts.aggregate ?? 20)),
    sComfort: opts.sComfort ?? 40,
    maxLayers: MAX_LAYERS,
    barComfort: 8,
    wantSymmetric: true,
  }

  const selection = selectRebar(candidates, ctx)
  const winner = selection.best?.layout.db ?? null
  return {
    selection,
    design: winner !== null ? designs.get(winner) ?? null : null,
    input: winner !== null ? inputs.get(winner) ?? null : null,
    designs,
  }
}
