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
// ── CONTINUITY ───────────────────────────────────────────────────────────
//
// A beam is not detailed section by section. Bars run THROUGH a member and
// on through the joint into the next span, so one diameter has to serve the
// whole run — a ⌀25 span meeting a ⌀20 span at the same column is a
// detailing error, and `meshValidation` already refuses it.
//
// The per-section entry point below is therefore the wrong unit on its own.
// `optimizeBeamMember` is the real one: it scores each DIAMETER across EVERY
// critical section of the member at once, so a diameter is feasible only if
// it complies everywhere. Bar COUNT stays free per section — cuts and
// splices absorb that, and forcing a single count would buy steel the span
// does not need.
//
// `resolveBarContinuity` then takes the run one level up: given the groups
// `barContinuityGroups` finds (a continuous beam line, a column stack), every
// member in a group adopts the group's LARGEST diameter. Largest, not
// smallest: a smaller bar somewhere in the run would fail the section that
// asked for the bigger one.
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

/**
 * Which of two designs sizes the member.
 *
 * Compared on As REQUIRED, not bar count: the count is rounded up to a whole
 * bar, so 210 and 240 kN·m can land on the same number and the comparison
 * would then be decided by whichever section came first in the list.
 */
function moreDemanding(a: BeamDesignResult, b: BeamDesignResult): boolean {
  if (Math.abs(a.As - b.As) > 1e-6) return a.As > b.As
  return a.bars > b.bars
}

/** Centre-to-centre spacing of the bars nearest the tension face, mm. */
function barSpacingOf(i: BeamDesignInput, r: BeamDesignResult): number {
  const n = r.layers[0] ?? 0
  if (n <= 1) return 0            // a single bar has no spacing to control
  const bw = i.b - 2 * (i.cover + i.stirrupDia)
  return (bw - i.barDia) / (n - 1)
}

/**
 * Design ONE SECTION at every candidate diameter and adopt the best-scoring
 * compliant layout.
 *
 * For a member with more than one critical section use `optimizeBeamMember`
 * instead — this one has no way to know that the bars carry on into the next
 * section, and used per-section it will happily give the same beam three
 * different diameters.
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
    const trial: BeamDesignInput = {
      ...i, barDia: db, comprBarDia: i.comprBarDia ?? db,
      // Hand the designer the SAME aggregate this module gates on. It used
      // to keep its own §25.2.1 figure and let `designBeam` default to
      // 20 mm — so a 40 mm mix was checked here and ignored there.
      aggregate: opts.aggregate,
    }
    let r: BeamDesignResult
    try {
      r = designBeam(trial)
    } catch {
      continue                    // a size the section cannot even lay out
    }
    designs.set(db, r)
    inputs.set(db, trial)

    // §25.2.1 clear spacing — taken from the design result rather than
    // recomputed, so the gate and the layout can never disagree.
    const sMinClear = r.sMinClear
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


// ── One member, many sections ─────────────────────────────────────────────

/** A critical section's demand. Moments are magnitudes; hogging and sagging
 *  are both designed for |Mu| against the same section. */
export interface BeamSectionDemand {
  id: string
  label?: string
  /** kN·m, magnitude. */
  Mu: number
  /** kN. */
  Vu: number
}

export interface BeamMemberChoice {
  /** Diameters scored across the WHOLE member, ranked. */
  selection: RebarSelection
  /** The adopted diameter, or null when no size works at every section. */
  db: number | null
  /** The design at each section, at the adopted diameter. Bar counts differ
   *  between them — that is the point; only the diameter is shared. */
  sections: { id: string; label?: string; design: BeamDesignResult }[]
  /** The section that sized the member — the one with the most steel. */
  governing: string | null
}

/**
 * Choose ONE bar diameter for a whole member by scoring each candidate across
 * every one of its critical sections.
 *
 * A diameter is feasible only if it complies at EVERY section: a size that
 * works at midspan and fails over the support is not a size this beam can be
 * built with. The compliance check that fails carries the section it failed
 * at, so the report says where.
 *
 * The layout that gets SCORED is the governing section's — the one with the
 * most steel. That is the section that sets congestion, spacing and layer
 * count, so it is the honest representative of what the member will be like
 * to build.
 */
export function optimizeBeamMember(
  geom: Omit<BeamDesignInput, 'Mu' | 'Vu'>,
  demands: readonly BeamSectionDemand[],
  opts: BeamRebarOptions = {},
): BeamMemberChoice {
  if (demands.length === 0) {
    return {
      selection: { best: null, ranked: [], rejected: [], margin: 'no critical sections supplied' },
      db: null, sections: [], governing: null,
    }
  }

  const sizes = opts.sizes ?? BEAM_BAR_SIZES
  const perSize = new Map<number, { id: string; label?: string; design: BeamDesignResult }[]>()
  const candidates: Candidate[] = []

  for (const db of sizes) {
    // Mu/Vu are placeholders here; each section supplies its own below.
    const trial: BeamDesignInput = {
      ...geom, barDia: db, comprBarDia: geom.comprBarDia ?? db, Mu: 0, Vu: 0,
      aggregate: opts.aggregate,
    }
    const designs: { id: string; label?: string; design: BeamDesignResult }[] = []
    let failed = false
    for (const s of demands) {
      try {
        designs.push({
          id: s.id, label: s.label,
          design: designBeam({ ...trial, Mu: Math.abs(s.Mu), Vu: Math.abs(s.Vu) }),
        })
      } catch { failed = true; break }
    }
    if (failed || designs.length !== demands.length) continue
    perSize.set(db, designs)

    // From the design result, not recomputed — see `optimizeBeamRebar`.
    const sMinClear = designs[0].design.sMinClear
    const sMaxCrack = crackSpacingLimit(geom.fy, geom.cover)

    // Compliance across the WHOLE member: a check passes only if it passes at
    // every section, and it reports the first section where it did not.
    const merged: ComplianceCheck[] = []
    const template = complianceOf({ ...trial, Mu: 0, Vu: 0 }, designs[0].design, sMaxCrack, sMinClear)
    for (let k = 0; k < template.length; k++) {
      let worst: { c: ComplianceCheck; at: typeof designs[number] } | null = null
      for (const d of designs) {
        const c = complianceOf({ ...trial, Mu: Math.abs(demands.find((x) => x.id === d.id)!.Mu), Vu: 0 },
          d.design, sMaxCrack, sMinClear)[k]
        if (!c.pass) { worst = { c, at: d }; break }
      }
      merged.push(worst
        ? { ...worst.c, detail: `${worst.c.detail ?? ''}${worst.c.detail ? ' · ' : ''}at ${worst.at.label ?? worst.at.id}`.trim() }
        : template[k])
    }

    // Score the governing section — the one that sizes the member.
    const Ab = (Math.PI / 4) * db * db
    const gov = designs.reduce((a, b) => (moreDemanding(b.design, a.design) ? b : a), designs[0])
    const g = gov.design
    const layout: RebarLayout = {
      db,
      bars: g.bars,
      layers: g.layers,
      AsProv: g.bars * Ab,
      AsReq: g.As,
      clearSpacing: g.sClear,
      spacing: barSpacingOf(trial, g),
      d: g.d,
      utilization: g.phiMnMax > 0 ? Math.abs(demands.find((x) => x.id === gov.id)!.Mu) / g.phiMnMax : Infinity,
    }
    candidates.push({ layout, compliance: merged })
  }

  const ctx: ScoreContext = {
    sMax: crackSpacingLimit(geom.fy, geom.cover),
    sMinCode: Math.max(25, (4 / 3) * (opts.aggregate ?? 20)),
    sComfort: opts.sComfort ?? 40,
    maxLayers: MAX_LAYERS,
    barComfort: 8,
    wantSymmetric: true,
  }
  const selection = selectRebar(candidates, ctx)
  const db = selection.best?.layout.db ?? null
  const sections = db !== null ? perSize.get(db) ?? [] : []
  const governing = sections.length
    ? sections.reduce((a, b) => (moreDemanding(b.design, a.design) ? b : a), sections[0]).id
    : null

  return { selection, db, sections, governing }
}

// ── One run, many members ─────────────────────────────────────────────────

/**
 * Force every member of a continuity group onto a single diameter.
 *
 * The group adopts its LARGEST required diameter. Largest, not smallest or
 * most common: a smaller bar would fail the member that asked for the bigger
 * one, and compliance is not something a continuity rule gets to trade away.
 *
 * Members with no adopted diameter (nothing complied) are left alone — they
 * are already a reported failure and must not silently inherit a size.
 */
export function resolveBarContinuity(
  chosen: ReadonlyMap<string, number>,
  groups: readonly (readonly string[])[],
): Map<string, number> {
  const out = new Map(chosen)
  for (const group of groups) {
    const present = group.map((id) => chosen.get(id)).filter((v): v is number => v !== undefined)
    if (present.length < 2) continue
    const dmax = Math.max(...present)
    for (const id of group) if (chosen.get(id) !== undefined) out.set(id, dmax)
  }
  return out
}
