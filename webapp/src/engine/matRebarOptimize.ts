// ─────────────────────────────────────────────────────────────────────────
// SLAB AND FOOTING MATS — search diameter × SPACING, score, adopt.
//
// A mat is not detailed the way a beam or a column is. Nobody writes "17
// bars" on a slab; they write "⌀12 @ 150 mm". The decision variable is the
// SPACING, and it comes off a module — 100, 125, 150, 175, 200 — because a
// bar-setter works to a tape and a chalk line, not to a bar count. A layout
// at 143 mm c/c is arithmetic, not a drawing.
//
// So the search here is db × spacing module, and the count falls out:
//
//     n = floor((b − 2·cover) / s) + 1
//
// That is the third distinct search shape in this series:
//
//   beam    — diameter only; n = ceil(As/Ab) and any larger n is worse
//   column  — diameter × count; 8⌀20 and 4⌀25 are both real cages
//   mat     — diameter × spacing module; the count is a consequence
//
// ── SYMMETRY DOES NOT APPLY ──────────────────────────────────────────────
//
// A beam has a web centreline and a column has opposing faces, so an even
// count means something on both. A mat has neither — 17 bars across a strip
// is exactly as sensible as 18. `wantSymmetric: false`.
//
// ── WHAT THE CODE ASKS FOR ───────────────────────────────────────────────
//
//   §22.2       the section can resist Mu at all (before any layout question)
//   §21.2.2     tension-controlled, ρ ≤ 0.85·β1·(f′c/fy)·(3/8)
//   §7.6.1.1    As,min = 0.0018·Ag (Grade 420) — shrinkage & temperature
//   §7.7.2.3    one-way slabs and footings: s ≤ min(3h, 450 mm)
//   §8.7.2.2    two-way slabs:              s ≤ min(2h, 450 mm)
//   §25.2.1     clear spacing ≥ max(db, 25 mm, 4/3·d_agg)
//
// §25.2.1's aggregate term is carried here explicitly. It is the one the
// beam engine omits (see `beamRebarOptimize`), and on a thin slab with a
// large bar it is the term that bites.
//
// ── NO SECOND STRENGTH IMPLEMENTATION ────────────────────────────────────
//
// Required steel is read off `designSquareFooting` / `designSlabDDM`, run
// once per diameter. This module decides the LAYOUT and nothing else — a
// rival implementation of §22.2 that drifts from the verified one is worse
// than no search at all.
//
// Units: mm, mm², kN·m, MPa.
// ─────────────────────────────────────────────────────────────────────────

import { designSquareFooting, type SquareFootingInput, type SquareFootingResult } from './isolatedFooting'
import { designSlabDDM, type SlabInput, type SlabDesignResult } from './slabDDM'
import {
  dominantBlocker, selectRebar, type Candidate, type ComplianceCheck,
  type RebarLayout, type RebarSelection, type ScoreContext,
} from './rebarScore'

/** Bar diameters searched in a mat. ⌀10 is normal here and ⌀32 never is. */
export const MAT_BAR_SIZES = [10, 12, 16, 20, 25] as const

/** Spacings a bar-setter actually works to, mm. */
export const SPACING_MODULES = [75, 100, 125, 150, 175, 200, 250, 300] as const

/** §25.2.1 assumes a nominal maximum aggregate; 20 mm is the usual local mix. */
export const DEFAULT_AGGREGATE = 20

/** Which maximum-spacing clause governs. */
export type MatKind = 'one-way' | 'two-way'

export interface MatRebarOptions {
  sizes?: readonly number[]
  spacings?: readonly number[]
  /** Nominal maximum aggregate size for §25.2.1, mm. */
  aggregate?: number
}

/** The strip a mat's steel is spread over. */
export interface MatStrip {
  label: string
  /** Width the steel spreads across, mm. */
  b: number
  /** Effective depth at this layer, mm. */
  d: number
  /** Steel the flexure check demands over `b`, mm². */
  AsReq: number
}

/** Section properties the code limits depend on. */
export interface MatSection {
  /** Total thickness, mm. */
  h: number
  cover: number
  fc: number
  fy: number
  kind: MatKind
}

export interface MatRebarChoice {
  selection: RebarSelection
  db: number | null
  /** Centre-to-centre spacing adopted, mm. */
  spacing: number | null
  bars: number | null
  /**
   * When nothing complies, the gate that did most of the rejecting.
   *
   * On a mat this is nearly always a SECTION problem, not a bar problem: too
   * thin for Mu, or thin enough that the steel it needs is no longer
   * tension-controlled at φ = 0.90. The answer is a thicker slab, and saying
   * so is more use than a list of failed spacings.
   */
  blocker: ComplianceCheck | null
}

// ── Code limits ───────────────────────────────────────────────────────────

/**
 * β1 per ACI 318-14 Table 22.2.2.4.3.
 *
 * The SI table is not continuous and must not be written as one: the sloped
 * row runs 28 < f′c < 55, and the last row is a flat 0.65 for f′c ≥ 55. The
 * slope evaluated at 55 gives 0.657, so `max(0.65, slope)` would return that
 * instead of the 0.65 the table actually prescribes.
 */
export function beta1(fc: number): number {
  if (fc <= 28) return 0.85
  if (fc >= 55) return 0.65
  return 0.85 - 0.05 * (fc - 28) / 7
}

/**
 * ρ at the tension-controlled limit — εt = 0.005, so c/d = 3/8
 * (ACI 318-14 §21.2.2 with §22.2.2.1's εcu = 0.003).
 */
export function rhoTensionControlled(fc: number, fy: number): number {
  return 0.85 * beta1(fc) * (fc / fy) * (3 / 8)
}

/** §7.6.1.1 / §8.6.1.1 shrinkage-and-temperature minimum, on the GROSS area. */
export function asMinShrinkage(fy: number, b: number, h: number): number {
  return (fy >= 420 ? 0.0018 : 0.0020) * b * h
}

/** §7.7.2.3 (one-way, footings) or §8.7.2.2 (two-way) maximum spacing, mm. */
export function maxSpacing(kind: MatKind, h: number): number {
  return Math.min(kind === 'one-way' ? 3 * h : 2 * h, 450)
}

/** §25.2.1 minimum clear spacing, mm. */
export function minClear(db: number, aggregate: number): number {
  return Math.max(db, 25, (4 / 3) * aggregate)
}

// ── One candidate mat ─────────────────────────────────────────────────────

/**
 * Bars laid at `s` centres across `b`, the outermost sitting a cover in from
 * each edge. The count is what the spacing produces, not what an area demands.
 */
function barsAt(b: number, cover: number, s: number): number {
  return Math.max(2, Math.floor((b - 2 * cover) / s) + 1)
}

function complianceOf(
  strip: MatStrip, sec: MatSection, db: number, s: number, n: number,
  AsProv: number, aggregate: number,
): ComplianceCheck[] {
  const rho = strip.b * strip.d > 0 ? AsProv / (strip.b * strip.d) : Infinity
  const rhoMax = rhoTensionControlled(sec.fc, sec.fy)
  const asMin = asMinShrinkage(sec.fy, strip.b, sec.h)
  const sMax = maxSpacing(sec.kind, sec.h)
  const clear = s - db
  const clearMin = minClear(db, aggregate)

  return [
    {
      // Asked first: if the slab is simply too thin for Mu, saying "the bars
      // do not fit" is answering a question nobody asked.
      id: 'section-adequate',
      clause: 'ACI 318-14 §22.2',
      label: 'the section can develop Mu at this depth',
      pass: strip.d > 0 && strip.AsReq > 0 && Number.isFinite(strip.AsReq),
      detail: `d = ${strip.d.toFixed(0)} mm, As,req = ${strip.AsReq.toFixed(0)} mm²`,
    },
    {
      id: 'tension-controlled',
      clause: 'ACI 318-14 §21.2.2',
      label: `ρ ≤ ρ at εt = 0.005 (${rhoMax.toFixed(4)})`,
      pass: rho <= rhoMax + 1e-9,
      detail: `ρ = ${rho.toFixed(4)}`,
    },
    {
      id: 'flexural-capacity',
      clause: 'ACI 318-14 §22.2',
      label: 'As provided ≥ As required',
      pass: AsProv >= strip.AsReq - 1e-6,
      detail: `${AsProv.toFixed(0)} vs ${strip.AsReq.toFixed(0)} mm²`,
    },
    {
      id: 'min-steel',
      clause: `ACI 318-14 §${sec.kind === 'one-way' ? '7' : '8'}.6.1.1`,
      label: 'shrinkage & temperature minimum',
      pass: AsProv >= asMin - 1e-6,
      detail: `${AsProv.toFixed(0)} vs ${asMin.toFixed(0)} mm²`,
    },
    {
      id: 'max-spacing',
      clause: `ACI 318-14 §${sec.kind === 'one-way' ? '7.7.2.3' : '8.7.2.2'}`,
      label: `spacing ≤ min(${sec.kind === 'one-way' ? '3h' : '2h'}, 450 mm)`,
      pass: s <= sMax + 1e-9,
      detail: `${s} mm vs ${sMax.toFixed(0)} mm`,
    },
    {
      id: 'min-clear',
      clause: 'ACI 318-14 §25.2.1',
      label: `clear ≥ max(db, 25, 4/3·d_agg) = ${clearMin.toFixed(0)} mm`,
      pass: clear >= clearMin - 1e-9,
      detail: `clear ${clear.toFixed(0)} mm`,
    },
    {
      id: 'min-bars',
      clause: 'Detailing — a mat is not two bars',
      label: 'at least 2 bars across the strip',
      pass: n >= 2,
    },
  ]
}

/**
 * The scoring context for a mat.
 *
 * `sMax` is the code's own maximum-spacing clause rather than a §24.3.2 crack
 * limit: on a slab it is §7.7.2.3/§8.7.2.2 that plays the distribution role,
 * so margin against it is the right thing to reward. One layer, no symmetry.
 */
export function matContext(strip: MatStrip, sec: MatSection): ScoreContext {
  return {
    sMax: maxSpacing(sec.kind, sec.h),
    sMinCode: 25,
    // A mat is laid on chairs on a flat surface, so placing room is a much
    // weaker constraint than in a cage — 50 mm clear is comfortable.
    sComfort: 50,
    maxLayers: 1,
    // The count scales with the strip, so the comfort threshold has to as
    // well: this is the bar count a perfectly ordinary 150 mm mat produces.
    barComfort: barsAt(strip.b, sec.cover, 150),
    wantSymmetric: false,
    naming: 'spacing',
  }
}

/** Every (diameter, spacing) pair for one strip, with its compliance record. */
export function matCandidates(
  strips: readonly MatStrip[], sec: MatSection, db: number, opts: MatRebarOptions = {},
): Candidate[] {
  const aggregate = opts.aggregate ?? DEFAULT_AGGREGATE
  const spacings = opts.spacings ?? SPACING_MODULES
  const Ab = (Math.PI / 4) * db * db
  const out: Candidate[] = []

  for (const s of spacings) {
    // A layout is only as good as its worst strip: the panel is detailed with
    // one bar at one spacing, so a spacing that fails anywhere fails.
    const per = strips.map((strip) => {
      const n = barsAt(strip.b, sec.cover, s)
      const AsProv = n * Ab
      return {
        strip, n, AsProv,
        compliance: complianceOf(strip, sec, db, s, n, AsProv, aggregate),
      }
    })
    if (per.length === 0) continue

    // Report against the strip that demands the most steel per unit width —
    // the one that decides whether this spacing is usable at all.
    const gov = per.reduce((a, c) =>
      c.strip.AsReq / c.strip.b > a.strip.AsReq / a.strip.b ? c : a)

    // With more than one strip the failing check has to say WHICH strip
    // failed, or the message sends the user to the wrong part of the panel.
    const compliance: ComplianceCheck[] = per.length === 1
      ? gov.compliance
      : per.flatMap((p) => p.compliance.map((c) =>
          c.pass ? c : { ...c, label: `${c.label} — at ${p.strip.label}` }))

    const layout: RebarLayout = {
      db,
      bars: gov.n,
      layers: [gov.n],
      AsProv: gov.AsProv,
      AsReq: gov.strip.AsReq,
      clearSpacing: s - db,
      spacing: s,
      d: gov.strip.d,
      utilization: gov.AsProv > 0 ? gov.strip.AsReq / gov.AsProv : Infinity,
    }
    out.push({ layout, compliance })
  }
  return out
}

/**
 * Search diameter × spacing over a set of strips detailed with ONE bar at ONE
 * spacing, and adopt the best-scoring compliant mat.
 */
export function optimizeMatRebar(
  strips: readonly MatStrip[], sec: MatSection, opts: MatRebarOptions = {},
): MatRebarChoice {
  const sizes = opts.sizes ?? MAT_BAR_SIZES
  const candidates = sizes.flatMap((db) => matCandidates(strips, sec, db, opts))
  if (candidates.length === 0) {
    return {
      selection: { best: null, ranked: [], rejected: [], margin: 'no candidates were generated' },
      db: null, spacing: null, bars: null, blocker: null,
    }
  }
  const gov = strips.reduce((a, c) => (c.AsReq / c.b > a.AsReq / a.b ? c : a))
  const selection = selectRebar(candidates, matContext(gov, sec))
  const best = selection.best?.layout ?? null
  return {
    selection,
    db: best?.db ?? null,
    spacing: best?.spacing ?? null,
    bars: best?.bars ?? null,
    blocker: dominantBlocker(selection),
  }
}

// ── Footings ──────────────────────────────────────────────────────────────

export interface FootingRebarChoice extends MatRebarChoice {
  /** The footing design at the adopted diameter — B and Dc move with db. */
  design: SquareFootingResult | null
  /** Every design tried, keyed by diameter. */
  designs: Map<number, SquareFootingResult>
}

/**
 * Optimise an isolated footing's bottom mat.
 *
 * The diameter is not just a layout choice here: `designSquareFooting` sizes
 * Dc from `d_required + cover + db`, so a bigger bar makes a thicker footing,
 * which changes q_net, which changes B — the whole design moves. So the
 * designer is re-run per diameter rather than the mat being re-cut against a
 * fixed section.
 */
export function optimizeFootingRebar(
  i: SquareFootingInput, opts: MatRebarOptions = {},
): FootingRebarChoice {
  const sizes = opts.sizes ?? MAT_BAR_SIZES
  const designs = new Map<number, SquareFootingResult>()
  const candidates: Candidate[] = []

  for (const db of sizes) {
    let r: SquareFootingResult
    try {
      r = designSquareFooting({ ...i, barDia: db })
    } catch {
      continue
    }
    designs.set(db, r)
    // Footings are detailed as one-way slabs — ACI 318-14 §13.3.2.1.
    const sec: MatSection = { h: r.Dc, cover: i.cover, fc: i.fc, fy: i.fy, kind: 'one-way' }
    const strip: MatStrip = {
      label: 'bottom mat', b: r.B * 1000, d: r.dFlex, AsReq: r.steelArea,
    }
    candidates.push(...matCandidates([strip], sec, db, opts))
  }

  if (candidates.length === 0) {
    return {
      selection: { best: null, ranked: [], rejected: [], margin: 'no candidates were generated' },
      db: null, spacing: null, bars: null, blocker: null, design: null, designs,
    }
  }

  // Score in the context of the largest section produced, so the spacing cap
  // every candidate is measured against is one figure rather than one per
  // diameter — otherwise a thicker footing would score better simply for
  // having a looser limit.
  const hMax = Math.max(...[...designs.values()].map((r) => r.Dc))
  const govB = Math.max(...[...designs.values()].map((r) => r.B * 1000))
  const govDesign = [...designs.values()][0]
  const sec: MatSection = { h: hMax, cover: i.cover, fc: i.fc, fy: i.fy, kind: 'one-way' }
  const ctx = matContext(
    { label: 'bottom mat', b: govB, d: govDesign.dFlex, AsReq: govDesign.steelArea }, sec,
  )

  const selection = selectRebar(candidates, ctx)
  const best = selection.best?.layout ?? null
  return {
    selection,
    db: best?.db ?? null,
    spacing: best?.spacing ?? null,
    bars: best?.bars ?? null,
    blocker: dominantBlocker(selection),
    design: best ? designs.get(best.db) ?? null : null,
    designs,
  }
}

// ── Two-way slabs ─────────────────────────────────────────────────────────

export interface SlabRebarChoice extends MatRebarChoice {
  design: SlabDesignResult | null
  designs: Map<number, SlabDesignResult>
  /** Spacing adopted for each strip at the chosen diameter, mm. */
  strips: { label: string; b: number; AsReq: number; spacing: number; bars: number }[]
}

/** Flatten a DDM panel into the strips its steel is actually detailed on. */
export function slabStrips(r: SlabDesignResult): MatStrip[] {
  const out: MatStrip[] = []
  for (const dr of [r.x, r.y]) {
    for (const loc of dr.locations) {
      out.push({
        label: `${dr.dir}-dir ${loc.name} column strip`,
        b: loc.column.b, d: dr.d, AsReq: loc.column.As,
      })
      if (loc.middle.b > 0) {
        out.push({
          label: `${dr.dir}-dir ${loc.name} middle strip`,
          b: loc.middle.b, d: dr.d, AsReq: loc.middle.As,
        })
      }
    }
  }
  return out
}

/**
 * Optimise a two-way slab panel.
 *
 * One diameter serves the whole panel — mixing ⌀12 and ⌀16 mats in one slab is
 * how the wrong bar ends up in the wrong strip — but the SPACING is chosen per
 * strip, which is exactly how a slab is drawn: "⌀12 @ 150 T, @ 200 B".
 *
 * The panel is therefore scored on its GOVERNING strip (most steel per unit
 * width), and once a diameter is adopted every other strip is re-cut at that
 * diameter to its own best spacing.
 */
export function optimizeSlabRebar(
  i: SlabInput, opts: MatRebarOptions = {},
): SlabRebarChoice {
  const sizes = opts.sizes ?? MAT_BAR_SIZES
  const designs = new Map<number, SlabDesignResult>()
  const candidates: Candidate[] = []
  let govStrip: MatStrip | null = null
  let sec: MatSection | null = null

  for (const db of sizes) {
    let r: SlabDesignResult
    try {
      r = designSlabDDM({ ...i, barDia: db })
    } catch {
      continue
    }
    designs.set(db, r)
    const s: MatSection = {
      h: r.h, cover: i.cover ?? 20, fc: i.fc, fy: i.fy, kind: 'two-way',
    }
    sec ??= s
    const strips = slabStrips(r)
    if (strips.length === 0) continue
    const gov = strips.reduce((a, c) => (c.AsReq / c.b > a.AsReq / a.b ? c : a))
    govStrip ??= gov
    candidates.push(...matCandidates([gov], s, db, opts))
  }

  if (!sec || !govStrip || candidates.length === 0) {
    return {
      selection: { best: null, ranked: [], rejected: [], margin: 'no candidates were generated' },
      db: null, spacing: null, bars: null, blocker: null,
      design: null, designs, strips: [],
    }
  }

  const selection = selectRebar(candidates, matContext(govStrip, sec))
  const best = selection.best?.layout ?? null
  const design = best ? designs.get(best.db) ?? null : null

  // Re-cut every strip at the adopted diameter to its own best spacing.
  const strips: SlabRebarChoice['strips'] = []
  if (best && design) {
    const secAdopted: MatSection = {
      h: design.h, cover: i.cover ?? 20, fc: i.fc, fy: i.fy, kind: 'two-way',
    }
    for (const strip of slabStrips(design)) {
      const per = selectRebar(matCandidates([strip], secAdopted, best.db, opts),
        matContext(strip, secAdopted))
      const l = per.best?.layout
      strips.push({
        label: strip.label, b: strip.b, AsReq: strip.AsReq,
        spacing: l?.spacing ?? best.spacing, bars: l?.bars ?? best.bars,
      })
    }
  }

  return {
    selection,
    db: best?.db ?? null,
    spacing: best?.spacing ?? null,
    bars: best?.bars ?? null,
    blocker: dominantBlocker(selection),
    design, designs, strips,
  }
}
